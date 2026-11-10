/**
 * human-review-dashboard-service.ts
 *
 * Human Review Dashboard Service for Phase 2 HITL (Human-in-the-Loop) workflow.
 * Provides queue management, electronic signatures (21 CFR Part 11), and review tracking.
 *
 * Compliance: FDA 21 CFR Part 11, EU GVP Module VI, GAMP 5
 */

import { EventEmitter } from 'events';
import { createHash, randomBytes } from 'crypto';
import { AuditLedgerService, LedgerEntryInput } from '../audit/audit-ledger-service';
import { ZDRStore } from '../infrastructure/redis-zdr-store';
import { nowISO, sha256, hmacSha256, generateUUID, generateQueueId } from '../agents/base-agent';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Review queue priority levels
 */
export type ReviewPriority = 'critical' | 'high' | 'normal' | 'low';

/**
 * Review queue types
 */
export type QueueType = 'priority' | 'standard' | 'escalation' | 'override_audit';

/**
 * Review status
 */
export type ReviewStatus =
  | 'pending'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'flagged'
  | 'escalated'
  | 'completed';

/**
 * Electronic signature (21 CFR Part 11 compliant)
 */
export interface ElectronicSignature {
  signature_id: string;
  reviewer_id: string;
  reviewer_role: string;
  signature_hash: string;           // HMAC-SHA256 of content + timestamp + secret
  signature_meaning: string;        // e.g., "Approved safety assessment"
  signed_at: string;                // ISO 8601 with milliseconds
  content_hash: string;             // SHA-256 of reviewed content
  signature_algorithm: 'HMAC-SHA256';
  signature_manifest: string;       // What was signed (JSON string)
  signed_by_name: string;           // Printed name of signer
}

/**
 * Review queue entry
 */
export interface ReviewQueueEntry {
  queue_id: string;
  trace_id: string;
  case_id: string;
  tenant_id: string;
  queue_type: QueueType;
  priority: ReviewPriority;
  status: ReviewStatus;
  assigned_reviewer?: string;
  assigned_at?: string;
  created_at: string;
  updated_at: string;
  due_at: string;                    // Regulatory deadline (7d/15d)
  source_agent: string;
  payload_summary: string;
  payload_hash: string;
  decision: string;
  confidence: number;
  assigned_reviewer_name?: string;
  review_notes?: string;
  electronic_signature?: ElectronicSignature;
  escalated_from?: string;
  escalated_at?: string;
  escalation_reason?: string;
  tags?: string[];
}

/**
 * Review action input
 */
export interface ReviewActionInput {
  queue_id: string;
  reviewer_id: string;
  reviewer_role: string;
  reviewer_name: string;
  action: 'approve' | 'reject' | 'flag' | 'escalate';
  decision: string;
  rationale: string;
  signature_meaning: string;
  tags?: string[];
}

/**
 * Review queue statistics
 */
export interface QueueStats {
  total: number;
  pending: number;
  in_review: number;
  approved: number;
  rejected: number;
  flagged: number;
  escalated: number;
  overdue: number;
  avg_review_time_ms: number;
  by_priority: Record<ReviewPriority, number>;
  by_type: Record<QueueType, number>;
}

/**
 * Dashboard service configuration
 */
export interface DashboardConfig {
  tenant_id: string;
  audit_ledger: AuditLedgerService;
  zdr_store: ZDRStore;
  default_due_days: number;           // Default: 15 days
  priority_due_days: Record<ReviewPriority, number>;
  escalation_threshold_hours: number; // Hours before auto-escalation
  max_queue_size: number;
  enable_auto_escalation: boolean;
  signing_key: string;
}


// ============================================================================
// HUMAN REVIEW DASHBOARD SERVICE
// ============================================================================

export class HumanReviewDashboardService extends EventEmitter {
  private config: DashboardConfig;
  private queues: Map<string, ReviewQueueEntry> = new Map();
  private reviewerAssignments: Map<string, string[]> = new Map(); // reviewer_id -> queue_ids
  private queueIndexByType: Map<QueueType, string[]> = new Map();
  private queueIndexByStatus: Map<ReviewStatus, string[]> = new Map();
  private queueIndexByPriority: Map<ReviewPriority, string[]> = new Map();
  private queueIndexByTenant: Map<string, string[]> = new Map();
  private reviewTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: DashboardConfig) {
    super();
    // Merge defaults with provided config, ensuring priority_due_days doesn't have duplicate keys
    const defaultPriorityDueDays: Record<ReviewPriority, number> = {
      critical: 1,
      high: 3,
      normal: 7,
      low: 14,
    };
    const mergedPriorityDueDays = { ...defaultPriorityDueDays, ...config.priority_due_days };

    this.config = {
      ...config,
      priority_due_days: mergedPriorityDueDays,
      escalation_threshold_hours: config.escalation_threshold_hours ?? 24,
      max_queue_size: config.max_queue_size ?? 10000,
      enable_auto_escalation: config.enable_auto_escalation ?? true,
      signing_key: config.signing_key || process.env.AUDIT_SIGNING_KEY || 'dev-signing-key-change-in-production',
    };

    // Initialize indexes
    for (const type of ['priority', 'standard', 'escalation', 'override_audit'] as QueueType[]) {
      this.queueIndexByType.set(type, []);
    }
    for (const status of ['pending', 'in_review', 'approved', 'rejected', 'flagged', 'escalated', 'completed'] as ReviewStatus[]) {
      this.queueIndexByStatus.set(status, []);
    }
    for (const priority of ['critical', 'high', 'normal', 'low'] as ReviewPriority[]) {
      this.queueIndexByPriority.set(priority, []);
    }
  }

  /**
   * Initialize the dashboard service
   */
  async initialize(): Promise<void> {
    // Load existing queues from ZDR store if any
    console.log('[HumanReviewDashboard] Initialized');
  }

  /**
   * Add a case to the review queue
   */
  async addToQueue(input: {
    trace_id: string;
    case_id: string;
    tenant_id: string;
    queue_type?: QueueType;
    priority?: ReviewPriority;
    source_agent: string;
    payload_summary: string;
    payload_hash: string;
    decision: string;
    confidence: number;
    due_days?: number;
    tags?: string[];
  }): Promise<string> {
    const queueId = generateQueueId();
    const now = nowISO();
    const dueDays = input.due_days ?? this.config.default_due_days;
    const priority = input.priority ?? 'normal';
    const queueType = input.queue_type ?? this.inferQueueType(input.decision, input.confidence);
    const priorityDueDays = this.config.priority_due_days[input.priority ?? 'normal'] ?? this.config.default_due_days;
    const dueDaysFinal = Math.min(dueDays, priorityDueDays);
    const dueAt = new Date(Date.now() + dueDaysFinal * 24 * 60 * 60 * 1000).toISOString();

    const queueEntry: ReviewQueueEntry = {
      queue_id: generateQueueId(),
      trace_id: input.trace_id,
      case_id: input.case_id,
      tenant_id: input.tenant_id,
      queue_type: queueType,
      priority,
      status: 'pending',
      source_agent: input.source_agent,
      payload_summary: input.payload_summary,
      payload_hash: input.payload_hash,
      decision: input.decision,
      confidence: input.confidence,
      created_at: nowISO(),
      updated_at: nowISO(),
      due_at: dueAt,
      tags: input.tags || [],
    };

    // Store in memory
    this.queues.set(queueEntry.queue_id, queueEntry);

    // Update indexes
    this.updateIndexes(queueEntry, 'add');

    // Schedule escalation timer if enabled
    if (this.config.enable_auto_escalation) {
      this.scheduleEscalation(queueEntry.queue_id);
    }

    // Persist to ZDR store (in background)
    this.persistToZDR(queueEntry).catch(err => {
      console.error('[HumanReviewDashboard] Failed to persist to ZDR:', err);
    });

    // Record audit entry
    this.recordAuditEntry(queueEntry, 'QUEUE_CREATED').catch(err => {
      console.error('[HumanReviewDashboard] Failed to record audit:', err);
    });

    this.emit('queue_created', { queue: queueEntry });
    return queueEntry.queue_id;
  }

  /**
   * Assign queue to reviewer
   */
  async assignReviewer(queueId: string, reviewerId: string, reviewerName: string): Promise<boolean> {
    const queue = this.queues.get(queueId);
    if (!queue) return false;
    if (queue.status !== 'pending') return false;

    queue.assigned_reviewer = reviewerId;
    queue.assigned_reviewer_name = reviewerName;
    queue.assigned_at = nowISO();
    queue.status = 'in_review';
    queue.updated_at = nowISO();

    // Update indexes
    this.updateIndexes({ ...queue, status: 'pending' }, 'remove');
    this.updateIndexes(queue, 'add');

    // Update reviewer assignments
    const reviewerQueues = this.reviewerAssignments.get(queue.assigned_reviewer) || [];
    if (!reviewerQueues.includes(queue.queue_id)) {
      reviewerQueues.push(queue.queue_id);
      this.reviewerAssignments.set(reviewerId, reviewerQueues);
    }

    // Cancel escalation timer
    this.cancelEscalation(queue.queue_id);

    // Persist
    this.persistToZDR(queue).catch(err => console.error('[HumanReviewDashboard] Persist error:', err));

    this.emit('reviewer_assigned', { queue_id: queueId, reviewer_id: reviewerId });
    return true;
  }

  /**
   * Process review action (approve/reject/flag/escalate)
   */
  async processReview(input: ReviewActionInput): Promise<{ success: boolean; error?: string }> {
    const queue = this.queues.get(input.queue_id);
    if (!queue) return { success: false, error: 'Queue entry not found' };
    if (queue.status === 'completed') return { success: false, error: 'Review already completed' };
    if (queue.assigned_reviewer !== input.reviewer_id) {
      return { success: false, error: 'Not assigned to this reviewer' };
    }

    const now = nowISO();
    const previousStatus = queue.status;
    const previousDecision = queue.decision;

    // Update queue with review outcome
    queue.status = input.action === 'approve' ? 'approved' :
                   input.action === 'reject' ? 'rejected' :
                   input.action === 'flag' ? 'flagged' : 'escalated';
    queue.decision = input.decision;
    queue.review_notes = input.rationale;
    queue.updated_at = nowISO();

    // Generate electronic signature
    const contentToSign = JSON.stringify({
      queue_id: input.queue_id,
      reviewer_id: input.reviewer_id,
      action: input.action,
      decision: input.decision,
      rationale: input.rationale,
      timestamp: now,
    });

    const signatureHash = hmacSha256(contentToSign, this.config.signing_key);
    const contentHash = sha256(contentToSign);

    const electronicSignature: ElectronicSignature = {
      signature_id: generateUUID(),
      reviewer_id: input.reviewer_id,
      reviewer_role: input.reviewer_role,
      signature_hash: signatureHash,
      signature_meaning: input.signature_meaning,
      signed_at: now,
      content_hash: contentHash,
      signature_algorithm: 'HMAC-SHA256',
      signature_manifest: JSON.stringify({
        queue_id: input.queue_id,
        action: input.action,
        decision: input.decision,
      }),
      signed_by_name: input.reviewer_name,
    };

    queue.electronic_signature = electronicSignature;

    // If escalated, create new escalation queue entry
    if (input.action === 'escalate') {
      await this.escalateQueue(input.queue_id, input.rationale);
    }

    // Update indexes
    this.updateIndexes({ ...queue, status: previousStatus }, 'remove');
    this.updateIndexes(queue, 'add');

    // Cancel any escalation timer
    this.cancelEscalation(input.queue_id);

    // Mark as completed
    queue.status = 'completed';
    queue.updated_at = nowISO();
    this.updateIndexes({ ...queue, status: input.action === 'escalate' ? 'escalated' : queue.status }, 'remove');
    this.updateIndexes({ ...queue, status: 'completed' }, 'add');

    // Remove reviewer assignment
    const reviewerQueues = this.reviewerAssignments.get(input.reviewer_id) || [];
    const idx = reviewerQueues.indexOf(input.queue_id);
    if (idx !== -1) reviewerQueues.splice(idx, 1);
    this.reviewerAssignments.set(input.reviewer_id, reviewerQueues);

    // Cancel any timers
    this.cancelEscalation(input.queue_id);

    // Persist
    this.persistToZDR(queue).catch(err => console.error('[HumanReviewDashboard] Persist error:', err));

    // Record audit entry
    this.recordAuditEntry(queue, 'REVIEW_COMPLETED').catch(err => console.error('[HumanReviewDashboard] Audit error:', err));

    this.emit('review_completed', {
      queue_id: input.queue_id,
      action: input.action,
      reviewer: input.reviewer_id,
      decision: input.decision,
    });

    return { success: true };
  }

  /**
   * Escalate queue to escalation queue
   */
  private async escalateQueue(queueId: string, reason: string): Promise<void> {
    const queue = this.queues.get(queueId);
    if (!queue) return;

    // Create escalated entry
    const escalatedId = generateQueueId();
    const escalatedEntry: ReviewQueueEntry = {
      ...queue,
      queue_id: escalatedId,
      queue_type: 'escalation',
      priority: 'critical',
      status: 'pending',
      escalated_from: queueId,
      escalated_at: nowISO(),
      escalation_reason: reason,
      created_at: nowISO(),
      updated_at: nowISO(),
      due_at: new Date(Date.now() + this.config.priority_due_days.critical * 24 * 60 * 60 * 1000).toISOString(),
    };

    this.queues.set(escalatedId, escalatedEntry);
    this.updateIndexes(escalatedEntry, 'add');

    // Mark original as escalated
    const originalQueue = this.queues.get(queue.queue_id);
    if (originalQueue) {
      originalQueue.status = 'escalated';
      originalQueue.updated_at = nowISO();
      this.updateIndexes({ ...queue, status: 'escalated' }, 'remove');
      this.updateIndexes({ ...originalQueue, status: 'escalated' }, 'add');
    }

    this.emit('queue_escalated', { original_id: queueId, escalated_id: escalatedId, reason });
  }

  /**
   * Get queue entry by ID
   */
  getQueue(queueId: string): ReviewQueueEntry | undefined {
    return this.queues.get(queueId);
  }

  /**
   * Get queues by various filters
   */
  getQueues(filters: {
    tenant_id?: string;
    queue_type?: QueueType;
    priority?: ReviewPriority;
    status?: ReviewStatus;
    reviewer_id?: string;
    overdue_only?: boolean;
    limit?: number;
    offset?: number;
  }): ReviewQueueEntry[] {
    let results: ReviewQueueEntry[] = [];

    // Start with appropriate index
    if (filters.tenant_id) {
      const tenantQueues = this.queueIndexByTenant.get(filters.tenant_id) || [];
      results = tenantQueues.map(id => this.queues.get(id)).filter(Boolean) as ReviewQueueEntry[];
    } else if (filters.queue_type) {
      const typeQueues = this.queueIndexByType.get(filters.queue_type) || [];
      results = typeQueues.map(id => this.queues.get(id)).filter(Boolean) as ReviewQueueEntry[];
    } else if (filters.status) {
      const statusQueues = this.queueIndexByStatus.get(filters.status) || [];
      results = statusQueues.map(id => this.queues.get(id)).filter(Boolean) as ReviewQueueEntry[];
    } else if (filters.priority) {
      const priorityQueues = this.queueIndexByPriority.get(filters.priority) || [];
      results = priorityQueues.map(id => this.queues.get(id)).filter(Boolean) as ReviewQueueEntry[];
    } else if (filters.reviewer_id) {
      const reviewerQueues = this.reviewerAssignments.get(filters.reviewer_id) || [];
      results = reviewerQueues.map(id => this.queues.get(id)).filter(Boolean) as ReviewQueueEntry[];
    } else {
      results = Array.from(this.queues.values());
    }

    // Apply additional filters
    if (filters.status && !filters.status) {
      results = results.filter(q => q.status === filters.status);
    }
    if (filters.priority && !filters.priority) {
      results = results.filter(q => q.priority === filters.priority);
    }
    if (filters.overdue_only) {
      const now = new Date();
      results = results.filter(q => new Date(q.due_at) < now && q.status !== 'completed');
    }

    // Sort by priority and due date
    const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
    results.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
    });

    // Apply pagination
    const offset = filters.offset || 0;
    const limit = filters.limit || 50;
    return results.slice(offset, offset + limit);
  }

  /**
   * Get queue statistics
   */
  getStats(tenantId?: string): QueueStats {
    let queues: ReviewQueueEntry[];
    if (tenantId) {
      const tenantQueues = this.queueIndexByTenant.get(tenantId) || [];
      queues = tenantQueues.map(id => this.queues.get(id)).filter(Boolean) as ReviewQueueEntry[];
    } else {
      queues = Array.from(this.queues.values());
    }

    const now = new Date();
    const overdue = queues.filter(q => new Date(q.due_at) < now && q.status !== 'completed').length;

    const byPriority: Record<ReviewPriority, number> = {
      critical: 0, high: 0, normal: 0, low: 0,
    };
    const byType: Record<QueueType, number> = {
      priority: 0, standard: 0, escalation: 0, override_audit: 0,
    };

    let totalReviewTime = 0;
    let reviewCount = 0;

    for (const queue of queues) {
      byPriority[queue.priority]++;
      byType[queue.queue_type]++;

      if (queue.assigned_at && queue.updated_at && queue.status === 'completed') {
        const reviewTime = new Date(queue.updated_at).getTime() - new Date(queue.assigned_at).getTime();
        totalReviewTime += reviewTime;
        reviewCount++;
      }
    }

    return {
      total: queues.length,
      pending: queues.filter(q => q.status === 'pending').length,
      in_review: queues.filter(q => q.status === 'in_review').length,
      approved: queues.filter(q => q.status === 'approved').length,
      rejected: queues.filter(q => q.status === 'rejected').length,
      flagged: queues.filter(q => q.status === 'flagged').length,
      escalated: queues.filter(q => q.status === 'escalated').length,
      overdue,
      avg_review_time_ms: reviewCount > 0 ? totalReviewTime / reviewCount : 0,
      by_priority: byPriority,
      by_type: byType,
    };
  }

  /**
   * Get overdue queues
   */
  getOverdueQueues(tenantId?: string): ReviewQueueEntry[] {
    return this.getQueues({ tenant_id: tenantId, overdue_only: true });
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private inferQueueType(decision: string, confidence: number): QueueType {
    if (decision === 'SERIOUS' || decision === 'INCLUDE' && confidence > 0.9) return 'priority';
    if (decision === 'REVIEW') return 'standard';
    return 'standard';
  }

  private updateIndexes(queue: ReviewQueueEntry, operation: 'add' | 'remove'): void {
    const id = queue.queue_id;

    // Type index
    const typeIndex = this.queueIndexByType.get(queue.queue_type) || [];
    if (operation === 'add') {
      if (!typeIndex.includes(id)) typeIndex.push(id);
    } else {
      const idx = typeIndex.indexOf(id);
      if (idx !== -1) typeIndex.splice(idx, 1);
    }
    this.queueIndexByType.set(queue.queue_type, typeIndex);

    // Status index
    const statusIndex = this.queueIndexByStatus.get(queue.status) || [];
    if (operation === 'add') {
      if (!statusIndex.includes(id)) statusIndex.push(id);
    } else {
      const idx = statusIndex.indexOf(id);
      if (idx !== -1) statusIndex.splice(idx, 1);
    }
    this.queueIndexByStatus.set(queue.status, statusIndex);

    // Priority index
    const priorityIndex = this.queueIndexByPriority.get(queue.priority) || [];
    if (operation === 'add') {
      if (!priorityIndex.includes(id)) priorityIndex.push(id);
    } else {
      const idx = priorityIndex.indexOf(id);
      if (idx !== -1) priorityIndex.splice(idx, 1);
    }
    this.queueIndexByPriority.set(queue.priority, priorityIndex);

    // Tenant index
    const tenantIndex = this.queueIndexByTenant.get(queue.tenant_id) || [];
    if (operation === 'add') {
      if (!tenantIndex.includes(id)) tenantIndex.push(id);
    } else {
      const idx = tenantIndex.indexOf(id);
      if (idx !== -1) tenantIndex.splice(idx, 1);
    }
    this.queueIndexByTenant.set(queue.tenant_id, tenantIndex);
  }

  private scheduleEscalation(queueId: string): void {
    const queue = this.queues.get(queueId);
    if (!queue) return;

    const hoursUntilEscalation = this.config.escalation_threshold_hours;
    const delayMs = hoursUntilEscalation * 60 * 60 * 1000;

    const timer = setTimeout(async () => {
      const queue = this.queues.get(queueId);
      if (queue && queue.status === 'pending') {
        await this.escalateQueue(queueId, `Auto-escalated after ${this.config.escalation_threshold_hours} hours`);
      }
      this.reviewTimers.delete(queueId);
    }, delayMs);

    this.reviewTimers.set(queueId, timer);
  }

  private cancelEscalation(queueId: string): void {
    const timer = this.reviewTimers.get(queueId);
    if (timer) {
      clearTimeout(timer);
      this.reviewTimers.delete(queueId);
    }
  }

  private async persistToZDR(queue: ReviewQueueEntry): Promise<void> {
    // Store in ZDR store with appropriate TTL
    // Implementation would use the ZDR store's methods
    // For now, we emit an event that the ZDR store listener can handle
    this.emit('zdr_persist_request', {
      operation: 'store',
      key: `review:queue:${queue.queue_id}`,
      value: queue,
      ttl_seconds: 86400 * 30, // 30 days
    });
  }

  private async recordAuditEntry(queue: ReviewQueueEntry, eventType: string): Promise<void> {
    const promptText = JSON.stringify({ event: eventType, queue });
    const rawOutput = JSON.stringify({ queue_id: queue.queue_id, event: eventType });

    const entry: LedgerEntryInput = {
      tenantId: queue.tenant_id,
      traceId: queue.trace_id,
      spanId: generateUUID().replace(/-/g, '').slice(0, 32),
      correlationId: queue.trace_id,
      agentName: 'human-review-dashboard',
      executionTier: 'LOCAL',
      modelName: 'human-review-dashboard',
      modelHash: 'dashboard-v1',
      temperature: 0.0,
      seed: 0,
      promptText,
      rawOutput,
      redactionSummary: { piiTypes: [], charsRedacted: 0 },
      decision: eventType,
      confidence: 1.0,
      meddraPts: [],
      seriousnessFlag: false,
    };

    // This would use the audit ledger service
    // For now, emit event
    this.emit('audit_record_request', entry);
  }

  // Cleanup on shutdown
  async shutdown(): Promise<void> {
    for (const timer of this.reviewTimers.values()) {
      clearTimeout(timer);
    }
    this.reviewTimers.clear();
    this.removeAllListeners();
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createHumanReviewDashboard(config: DashboardConfig): HumanReviewDashboardService {
  return new HumanReviewDashboardService(config);
}

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

export { nowISO, sha256, hmacSha256, generateUUID, generateQueueId };
export { generateQueueId as generateTraceId }; // Alias for compatibility

// Export nowISO and sha256 from base-agent to avoid duplication
export { nowISO as baseNowISO, sha256 as baseSha256 } from '../agents/base-agent';
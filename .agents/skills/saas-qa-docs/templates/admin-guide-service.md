# Nexus Service Administrator's Guide

## 1. Introduction
- **Purpose**: Infrastructure, deployment, and service operations for Nexus
- **Audience**: DevOps Engineers, Site Reliability Engineers, Cloud Architects
- **Scope**: Kubernetes, Cloud Infrastructure, CI/CD, Monitoring, Security

## 2. Infrastructure Architecture

### 2.1 Cloud Provider & Regions
| Environment | Provider | Region | Purpose |
|-------------|----------|--------|---------|
| Production | AWS/Azure/GCP | Primary: us-east-1 / Secondary: eu-west-1 | Live traffic |
| Staging | Same | Same | Pre-prod validation |
| Development | Same | Same | Feature development |
| DR | Same | Different region | Disaster recovery |

### 2.2 Kubernetes Cluster
| Component | Specification |
|-----------|---------------|
| Control Plane | Managed (EKS/AKS/GKE) - HA across 3 AZs |
| Worker Nodes | Auto-scaling group (min 6, max 50) |
| Node Pools | General, Compute-optimized (ML), Memory-optimized |
| CNI | Cilium / AWS VPC CNI |
| CSI | EBS / Azure Disk / GCP Persistent Disk |
| Ingress | NGINX / ALB / Cloud Load Balancing |
| Service Mesh | Istio / Linkerd (mTLS, traffic management) |

### 2.3 Network Topology
```
Internet → WAF → Cloud LB → Ingress Controller → Service Mesh → Pods
                    ↓
              Private Subnets (App, Data, ML)
                    ↓
              NAT Gateway → External APIs (PubMed, E2B Gateways)
```

### 2.4 Data Layer
| Component | Technology | Configuration |
|-----------|------------|---------------|
| Primary DB | PostgreSQL 15+ (Aurora/RDS/Cloud SQL) | Multi-AZ, read replicas |
| Cache | Redis Cluster (ElastiCache) | 6 shards, replication |
| Message Queue | Kafka (MSK/Confluent) | 3 AZs, replication factor 3 |
| Object Storage | S3 / GCS / Blob Storage | Versioned, encrypted |
| Search | OpenSearch / Elasticsearch | 3 master, 6 data nodes |
| ML Feature Store | Feast / Custom | PostgreSQL + Redis |

## 3. Deployment & CI/CD

### 3.1 Pipeline Overview
```
Code Push → Build → Test → Security Scan → Staging Deploy → Integration Tests → 
Manual Approval → Production Deploy (Blue/Green) → Smoke Tests → Traffic Shift
```

### 3.2 Environments
| Environment | Branch | Deploy Trigger | Approval |
|-------------|--------|----------------|----------|
| Dev | feature/* | Auto on push | None |
| Staging | develop | Auto on merge | Auto |
| Pre-Prod | release/* | Manual | Tech Lead |
| Prod | main | Manual | QA + Regulatory + Tech Lead |

### 3.3 Deployment Strategies
| Service Type | Strategy | Rollback Time |
|--------------|----------|---------------|
| Stateless API | Blue/Green | <2 min |
| ML Inference | Canary (10% → 50% → 100%) | <5 min |
| Batch Workers | Rolling | <10 min |
| Database Migrations | Expand/Contract | Manual |

### 3.4 GitOps / ArgoCD
- **Application definitions**: `argocd/applications/`
- **Environment overlays**: `kustomize/overlays/{dev,staging,prod}`
- **Sealed Secrets**: Encrypted secrets in Git
- **Sync Policy**: Automated (staging), Manual (prod)

## 4. Configuration Management

### 4.1 Config Sources (Priority Order)
1. **Vault/Secrets Manager** — Secrets (DB passwords, API keys, certs)
2. **ConfigMaps** — Non-sensitive config (feature flags, timeouts)
3. **Environment Variables** — Runtime overrides
4. **Defaults** — Baked into container image

### 4.2 Key Configuration Categories
| Category | Examples | Storage |
|----------|----------|---------|
| Database | Host, port, pool size, SSL mode | Vault + ConfigMap |
| External APIs | PubMed key, Embase OAuth, Gateway certs | Vault |
| Feature Flags | New UI, ML model version, thresholds | ConfigMap |
| ML Models | Model URI, version, batch size | ConfigMap + S3 |
| Integrations | E2B endpoints, clinical system URLs | Vault + ConfigMap |

## 5. Security Operations

### 5.1 Certificate Management
| Certificate | Source | Rotation | Monitoring |
|-------------|--------|----------|------------|
| TLS (public) | ACM / Let's Encrypt | Auto (90 days) | Cert-Manager |
| mTLS (mesh) | Istio CA | Auto (24h) | Istio |
| E2B Gateway | FDA/EMA issued | Manual (1-2 years) | Calendar alert |
| Database | Cloud provider | Auto | RDS/Aurora |

### 5.2 Network Security
| Layer | Control |
|-------|---------|
| Perimeter | WAF (AWS WAF / Cloud Armor) - OWASP Top 10 rules |
| Network | Security Groups / Network Policies - default deny |
| Service Mesh | mTLS enforced, authorization policies |
| Database | Private subnets, no public access, IAM auth |
| External Access | Bastion host / SSM Session Manager only |

### 5.3 Compliance Scanning
| Scan | Tool | Frequency | Gate |
|------|------|-----------|------|
| Container vulnerabilities | Trivy / Grype | Every build | Fail on Critical/High |
| IaC misconfigurations | Checkov / tfsec | Every PR | Fail on High |
| Runtime security | Falco / Sysdig | Continuous | Alert on anomalies |
| Dependency scanning | Snyk / Dependabot | Daily | PR for updates |

## 6. Monitoring & Observability

### 6.1 Metrics (Prometheus/Grafana)
| Category | Key Metrics | Alert Thresholds |
|----------|-------------|------------------|
| **Golden Signals** | Latency (p50/p95/p99), Traffic, Errors, Saturation | p99 > 2s, Error rate > 1% |
| **Business** | Articles ingested, Cases created, Submissions | Ingestion lag > 4h, Submission failure > 0 |
| **Infrastructure** | CPU, Memory, Disk, Network, GPU | CPU > 80%, Mem > 85%, Disk > 80% |
| **Kubernetes** | Pod restarts, OOM kills, Pending pods | Restarts > 5/h, Any pending > 10m |
| **Database** | Connections, Query latency, Replication lag | Connections > 80%, Lag > 30s |
| **Queue** | Lag, Consumption rate, DLQ size | Lag > 10k, DLQ > 100 |

### 6.2 Logging (ELK/Loki)
| Log Type | Retention | Indexing |
|----------|-----------|----------|
| Application | 30 days hot, 1 year cold | Structured JSON |
| Audit | 25 years | Immutable, separate index |
| Access (Ingress) | 90 days | Standard |
| Security | 1 year | SIEM forwarded |
| ML Inference | 30 days | Sampled (10%) |

### 6.3 Distributed Tracing (Jaeger/Tempo)
- **Sampling**: 10% requests, 100% errors
- **Propagation**: W3C TraceContext
- **Key Spans**: Ingestion → Screening → Extraction → Coding → Case → Submission

### 6.4 Alerting (Alertmanager/PagerDuty)
| Severity | Response Time | Escalation |
|----------|---------------|------------|
| Critical (P1) | 5 min | Page → 15 min → Manager |
| Warning (P2) | 30 min | Page → 2h → Team Lead |
| Info (P3) | 4 hours | Ticket → Next business day |

## 7. ML/AI Operations (MLOps)

### 7.1 Model Lifecycle
| Stage | Environment | Validation | Promotion |
|-------|-------------|------------|-----------|
| Training | ML Pipeline (Kubeflow/MLflow) | Offline metrics (F1, Recall) | Register to Model Registry |
| Staging | Staging K8s | Shadow mode (10% traffic) | A/B test vs production |
| Production | Prod K8s | Canary (10% → 100%) | Automated if metrics pass |

### 7.2 Model Monitoring
| Metric | Threshold | Action |
|--------|-----------|--------|
| Data Drift (PSI) | >0.2 | Alert → Retrain |
| Concept Drift (Recall drop) | >2% | Alert → Investigate |
| Latency (p99) | >500ms | Scale replicas |
| Error Rate | >1% | Rollback canary |

### 7.3 GPU Resource Management
| Workload | GPU Type | Scaling |
|----------|----------|---------|
| Training | A100/H100 (8x) | Batch, spot instances |
| Inference | T4/A10G (1-4x) | KEDA + custom metrics |
| Batch Inference | T4 (spot) | Cron + KEDA |

## 8. Database Operations

### 8.1 PostgreSQL (Aurora/RDS)
| Operation | Frequency | Tool |
|-----------|-----------|------|
| Automated Backups | Continuous (PITR) | Native |
| Snapshot Retention | 30 days | Native |
| Cross-Region Replica | Continuous | Native |
| Vacuum/Analyze | Auto (autovacuum) | pg_stat_clear_snapshot |
| Index Maintenance | Weekly (pg_repack) | pg_repack |
| Major Version Upgrade | Annual | Blue/Green + pg_upgrade |

### 8.2 Migration Management
- **Tool**: Flyway / Liquibase
- **Location**: `db/migrations/`
- **Naming**: `V{version}__{description}.sql`
- **Gate**: All migrations must pass staging before prod

## 9. Disaster Recovery

### 9.1 RPO/RTO Targets
| Tier | RPO | RTO | Services |
|------|-----|-----|----------|
| **Tier 1 (Safety Critical)** | 1 hour | 4 hours | Case processing, Submission, Audit |
| **Tier 2 (Operational)** | 4 hours | 8 hours | Screening, Extraction, Coding |
| **Tier 3 (Analytics)** | 24 hours | 24 hours | Reporting, Quality dashboards |

### 9.2 DR Procedures
| Scenario | Procedure | Validation |
|----------|-----------|------------|
| AZ Failure | Auto-failover (multi-AZ) | Monthly chaos test |
| Region Failure | Manual failover to DR region | Quarterly DR drill |
| Data Corruption | PITR to pre-corruption | Monthly restore test |
| Ransomware | Immutable backups + isolation | Annual tabletop |

### 9.3 Backup Strategy
| Data | Method | Frequency | Retention | Encryption |
|------|--------|-----------|-----------|------------|
| PostgreSQL | PITR + Snapshots | Continuous + Daily | 30 days | AES-256 |
| Kafka | MirrorMaker2 | Continuous | 7 days | AES-256 |
| S3/Object | Cross-region replication | Continuous | 90 days | SSE-KMS |
| Config/Secrets | Git + Vault backup | Daily | 1 year | AES-256 |
| ML Models | Model Registry (S3) | On version | Permanent | SSE-KMS |

## 10. Capacity Planning

### 10.1 Scaling Triggers
| Resource | Scale-Up Trigger | Scale-Down Trigger | Max |
|----------|------------------|-------------------|-----|
| API Pods | CPU > 70% 5m | CPU < 30% 15m | 100 |
| ML Inference | Queue depth > 50 | Queue depth < 10 | 50 GPU |
| Batch Workers | Pending jobs > 100 | Pending jobs < 10 | 200 |
| DB Read Replicas | Connections > 80% | Connections < 40% | 5 |

### 10.2 Cost Optimization
- **Spot Instances**: Batch workers, training (up to 70% savings)
- **Right-sizing**: Quarterly review (CloudWatch/Cloud Monitoring)
- **Reserved Instances**: Baseline capacity (30-40% savings)
- **GPU Sharing**: Time-slicing / MIG for inference

## 11. Incident Response

### 11.1 Runbooks (Key Scenarios)
| Runbook | Trigger | Owner |
|---------|---------|-------|
| `ingestion-stuck.md` | Ingestion lag > 4h | Platform |
| `submission-failing.md` | Gateway rejection spike | Platform + Regulatory |
| `ml-model-drift.md` | Recall drop > 2% | ML Engineering |
| `db-performance.md` | Query latency p99 > 5s | DBA |
| `certificate-expiry.md` | Cert < 30 days | Security |

### 11.2 Communication
- **Status Page**: External (customers), Internal (team)
- **War Room**: Slack channel + Zoom (auto-created for P1)
- **Postmortem**: Blameless, within 5 business days

## 12. Appendices

### A. Kubernetes Manifests Structure
```
k8s/
├── base/
│   ├── deployments/
│   ├── services/
│   ├── configmaps/
│   └── secrets/
├── overlays/
│   ├── dev/
│   ├── staging/
│   └── prod/
└── argocd/
    └── applications/
```

### B. Key CLI Commands
```bash
# Deploy to staging
argocd app sync nexus-staging

# Check rollout status
kubectl rollout status deployment/nexus-api -n staging

# View logs
stern nexus-api -n prod --since 1h

# Port-forward for debugging
kubectl port-forward svc/nexus-api 8080:80 -n prod

# Exec into pod
kubectl exec -it nexus-api-xxx -n prod -- /bin/bash
```

### C. Support Contacts
- **Platform Team**: #platform-support (Slack), platform@company.com
- **ML Engineering**: #ml-ops (Slack)
- **DBA**: #database (Slack), pager: dba-oncall
- **Security**: #security-incidents (Slack)
- **Vendor (Cloud)**: AWS/Azure/GCP Enterprise Support
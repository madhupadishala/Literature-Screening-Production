/**
 * Adapters Index - Single entry point for all external service adapters
 *
 * Usage:
 *   import { createDuplicateDetectionService, createScreeningService } from "@/lib/adapters";
 *
 *   const duplicateService = createDuplicateDetectionService();
 *   const result = await duplicateService.findDuplicates(input);
 */

// Duplicate Detection
export { createDuplicateDetectionService } from "./agentic-ai-duplicate-adapter";

// Screening
export { createScreeningService } from "./agentic-ai-screening-adapter";

// Triage & Intake
export { createTriageIntakeService } from "./agentic-ai-triage-adapter";

// Seriousness
export { createSeriousnessService } from "./agentic-ai-seriousness-adapter";

// Translation
export { createTranslationService } from "./translation-adapter";

// Re-export contract types for convenience (single source of truth, no duplicates)
export type {
  DuplicateInput,
  DuplicateRecord,
  DuplicateMatch,
  DuplicateDetectionResult,
} from "@/lib/contracts/duplicate-detection";

export type {
  ScreeningCriteria,
  ScreeningRecord,
  ScreeningDecision,
  ScreeningResult,
} from "@/lib/contracts/screening";

export type {
  TriageInput,
  TriageResult,
  IntakeInput,
  IntakeResult,
  PatientInfo,
  ReporterInfo,
  ProductInfo,
  AdverseEventInfo,
} from "@/lib/contracts/triage-intake";

export type {
  TranslationInput,
  TranslationResult,
  SupportedLanguage,
} from "@/lib/contracts/translation";

export type {
  SeriousnessInput,
  SeriousnessResult,
  SeriousnessAssessmentService,
} from "./agentic-ai-seriousness-adapter";

/**
 * Service Factory - Centralized service creation
 * Use this in API routes and server components
 */
import { createDuplicateDetectionService } from "./agentic-ai-duplicate-adapter";
import { createScreeningService } from "./agentic-ai-screening-adapter";
import { createTriageIntakeService } from "./agentic-ai-triage-adapter";
import { createSeriousnessService } from "./agentic-ai-seriousness-adapter";
import { createTranslationService } from "./translation-adapter";

export const Services = {
  duplicateDetection: createDuplicateDetectionService,
  screening: createScreeningService,
  triageIntake: createTriageIntakeService,
  seriousness: createSeriousnessService,
  translation: createTranslationService,
};

/**
 * For testing - allows swapping implementations
 */
export const ServiceRegistry = {
  duplicateDetection: createDuplicateDetectionService,
  screening: createScreeningService,
  triageIntake: createTriageIntakeService,
  seriousness: createSeriousnessService,
  translation: createTranslationService,

  // Override for tests
  setDuplicateDetection: (fn: typeof createDuplicateDetectionService) => {
    ServiceRegistry.duplicateDetection = fn;
  },
  setScreening: (fn: typeof createScreeningService) => {
    ServiceRegistry.screening = fn;
  },
  setTriageIntake: (fn: typeof createTriageIntakeService) => {
    ServiceRegistry.triageIntake = fn;
  },
  setSeriousness: (fn: typeof createSeriousnessService) => {
    ServiceRegistry.seriousness = fn;
  },
  setTranslation: (fn: typeof createTranslationService) => {
    ServiceRegistry.translation = fn;
  },

  // Reset to defaults
  reset: () => {
    ServiceRegistry.duplicateDetection = createDuplicateDetectionService;
    ServiceRegistry.screening = createScreeningService;
    ServiceRegistry.triageIntake = createTriageIntakeService;
    ServiceRegistry.seriousness = createSeriousnessService;
    ServiceRegistry.translation = createTranslationService;
  },
};
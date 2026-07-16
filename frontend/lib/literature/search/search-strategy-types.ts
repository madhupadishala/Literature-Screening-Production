export interface SearchTermGroup {
  name: string;
  operator: "AND" | "OR" | "NOT";
  terms: string[];
}

export interface SearchStrategyRequest {
  tenantId: string;
  strategyName: string;
  productNames: string[];
  inclusionTerms: string[];
  exclusionTerms?: string[];
  language?: string;
  startDate?: string;
  endDate?: string;
}

export interface SearchStrategyResult {
  id: string;
  strategyName: string;
  query: string;
  groups: SearchTermGroup[];
  createdAt: string;
}

export interface SearchStrategyStatus {
  totalStrategies: number;
}
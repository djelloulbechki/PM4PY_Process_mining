export type JobStatus =
  | "queued"
  | "processing"
  | "retrying"
  | "completed"
  | "failed"
  | "cancelled";

export type AnalysisModule =
  | "process_discovery"
  | "performance_analytics"
  | "conformance_checking"
  | "process_intelligence";

export interface Organization {
  id: string;
  name: string;
  created_at: string;
}

export interface Project {
  id: string;
  organization_id: string;
  name: string;
  created_at: string;
}

export interface Dataset {
  id: string;
  name: string;
  row_count: number;
  file_size_bytes: number | null;
  status: string;
  created_at: string;
  project_id: string;
}

export interface AnalysisJob {
  id: string;
  status: JobStatus;
  progress: number;
  job_type: AnalysisModule;
  dataset_id?: string;
  error_code?: string | null;
  error_message?: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface DfgEdge {
  source: string;
  target: string;
  count: number;
}

export interface ProcessDiscoveryResult {
  type: "process_discovery";
  dfg: DfgEdge[];
  start_activities: Record<string, number>;
  end_activities: Record<string, number>;
  petri_net?: {
    transitions: { name: string; label: string | null }[];
    places: { name: string }[];
    arcs: { source: string; target: string }[];
  } | null;
}

export interface PerformanceResult {
  type: "performance_analytics";
  status: string;
  case_duration_seconds: {
    count: number;
    mean: number | null;
    median: number | null;
    p95: number | null;
    max: number | null;
  };
  waiting_time_seconds: {
    count: number;
    mean: number | null;
    median: number | null;
    p95: number | null;
    max: number | null;
  };
  activity_frequency: Record<string, number>;
  total_cases: number;
  total_events: number;
  unique_activities: number;
}

export interface ConformanceResult {
  type: "conformance_checking";
  status: string;
  message?: string;
  results: {
    average_fitness: number;
    fit_traces: number;
    total_traces: number;
    deviant_sample: { index: number; fitness: number; is_fit: boolean }[];
  };
}

export interface ProcessIntelligenceResult {
  type: "process_intelligence";
  status: string;
  schema_version: string;
  executive_summary: {
    process_health_score: number; cases: number; events: number; activities: number; variants: number;
    median_cycle_time_hours: number; p95_cycle_time_hours: number; rework_rate: number;
  };
  bottlenecks: { from: string; to: string; events: number; avg_wait_hours: number; median_wait_hours: number }[];
  rework: { cases_affected: number; rate: number; top_activities: { activity: string; repeated_events: number }[] };
  variants: { rank: number; frequency: number; share: number; path: string[] }[];
  sla: { target_hours: number; breaches: number; compliance_rate: number } | null;
  financial: { amount_column: string; cases_with_amount: number; total_amount: number; median_case_amount: number | null } | null;
  resource: { column: string; top_resources: { name: string; events: number }[] } | null;
  opportunities: { type: string; title: string; evidence: Record<string, unknown>; priority_score: number }[];
}

export type MiningResult =
  | ProcessDiscoveryResult
  | PerformanceResult
  | ConformanceResult
  | ProcessIntelligenceResult;

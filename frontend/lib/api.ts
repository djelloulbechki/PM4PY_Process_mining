const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, ...init } = options;
  const headers = new Headers(init.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || body.message || detail;
      if (Array.isArray(detail)) {
        detail = detail.map((d: any) => d.msg || JSON.stringify(d)).join(", ");
      }
    } catch {
      // ignore
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  // ── Connectors ──
  listConnectors(organizationId: string, projectId: string | null, token: string) {
    const params = new URLSearchParams({ organization_id: organizationId });
    if (projectId) params.set("project_id", projectId);
    return request<{ connectors: any[] }>(`/api/v1/connectors?${params}`, { token });
  },
  createConnector(body: { organization_id: string; project_id: string; name: string; connector_type: string; api_key: string; config: Record<string, any> }, token: string) {
    return request<any>("/api/v1/connectors", { method: "POST", body: JSON.stringify(body), token });
  },
  testConnector(id: string, token: string) { return request<any>(`/api/v1/connectors/${id}/test`, { method: "POST", token }); },
  discoverConnector(id: string, token: string) { return request<any>(`/api/v1/connectors/${id}/discover`, { token }); },
  syncOdoo(id: string, body: { dataset_name?: string; mapping: Record<string, any> }, token: string) {
    return request<any>(`/api/v1/connectors/${id}/sync`, { method: "POST", body: JSON.stringify(body), token });
  },

  // ── Datasets ──
  previewDataset(file: File, token: string) {
    const form = new FormData();
    form.append("file", file);
    return request<{
      filename: string;
      columns: string[];
      preview: Record<string, unknown>[];
      estimated_rows: number | null;
    }>("/api/v1/datasets/preview", { method: "POST", body: form, token });
  },
  registerDataset(
    body: { organization_id: string; project_id: string; name: string; storage_path: string; row_count: number; file_size_bytes?: number },
    token: string
  ) {
    return request<{ dataset_id: string; status: string }>("/api/v1/datasets/register", { method: "POST", body: JSON.stringify(body), token });
  },
  listDatasets(organizationId: string, projectId: string | null, token: string) {
    const params = new URLSearchParams({ organization_id: organizationId });
    if (projectId) params.set("project_id", projectId);
    return request<{ datasets: any[] }>(`/api/v1/datasets?${params}`, { token });
  },

  // ── Analyses ──
  createAnalysis(
    body: { organization_id: string; project_id: string; dataset_id: string; analysis_module: string; case_column: string; activity_column: string; timestamp_column: string; amount_column?: string | null; resource_column?: string | null; sla_hours?: number | null },
    token: string
  ) {
    return request<{ job_id: string; status: string }>("/api/v1/analyses", { method: "POST", body: JSON.stringify(body), token });
  },
  getJob(jobId: string, token: string) {
    return request<{ id: string; status: string; progress: number; job_type?: string; error_code?: string | null; error_message?: string | null; started_at?: string | null; completed_at?: string | null; created_at?: string | null }>(`/api/v1/analyses/${jobId}`, { token });
  },
  listJobs(organizationId: string, projectId: string | null, token: string) {
    const params = new URLSearchParams({ organization_id: organizationId });
    if (projectId) params.set("project_id", projectId);
    return request<{ jobs: any[] }>(`/api/v1/analyses?${params}`, { token });
  },
  cancelJob(jobId: string, token: string) {
    return request<{ job_id: string; status: string }>(`/api/v1/analyses/${jobId}/cancel`, { method: "POST", token });
  },
  getArtifactUrl(jobId: string, token: string) {
    return request<{ job_id: string; signed_url: string; expires_in: number; metrics_summary: Record<string, unknown> }>(`/api/v1/analyses/${jobId}/artifact`, { token });
  },

  // ── Billing ──
  listTiers(token: string) {
    return request<any[]>("/api/v1/billing/tiers", { token });
  },
  getBillingAccount(organizationId: string, token: string) {
    return request<{ organization_id: string; credits_balance: number; credits_purchased: number; created_at: string; updated_at: string }>(
      `/api/v1/billing/account?organization_id=${organizationId}`, { token }
    );
  },
  listTransactions(organizationId: string, token: string, limit = 50) {
    return request<{ transactions: any[] }>(
      `/api/v1/billing/transactions?organization_id=${organizationId}&limit=${limit}`, { token }
    );
  },
  createCheckout(body: { organization_id: string; tier: string }, token: string) {
    return request<{ checkout_url: string; session_id: string }>("/api/v1/billing/checkout", { method: "POST", body: JSON.stringify(body), token });
  },
  createPortal(organizationId: string, token: string) {
    return request<{ portal_url: string }>("/api/v1/billing/portal", { method: "POST", body: JSON.stringify({ organization_id: organizationId }), token });
  },

  // ── Optimization ──
  getOptimizationSuggestions(jobId: string, token: string) {
    return request<{
      suggestions: any[];
      flow_diagram: { nodes: any[]; edges: any[] };
      n8n_blueprint: any;
      summary: {
        total_suggestions: number;
        high_severity: number;
        critical: number;
        estimated_savings_hours: number;
      };
    }>(`/api/v1/analyses/${jobId}/optimize`, { token });
  },
};

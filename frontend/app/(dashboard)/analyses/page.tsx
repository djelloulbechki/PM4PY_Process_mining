"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useOrgStore } from "@/lib/store";
import { api } from "@/lib/api";
import { Card, Button, Label, Select, Badge, Input } from "@/components/ui";
import type { AnalysisJob, Dataset, AnalysisModule } from "@/types";

const MODULES: { value: AnalysisModule; label: string }[] = [
  { value: "process_discovery", label: "Process Discovery" },
  { value: "performance_analytics", label: "Performance Analytics" },
  { value: "conformance_checking", label: "Conformance Checking" },
  { value: "process_intelligence", label: "Executive Process Intelligence" },
];

function statusTone(s: string) {
  switch (s) {
    case "completed":
      return "success" as const;
    case "failed":
      return "danger" as const;
    case "processing":
    case "retrying":
      return "info" as const;
    case "cancelled":
      return "warning" as const;
    default:
      return "default" as const;
  }
}

export default function AnalysesPage() {
  const { organizationId, projectId } = useOrgStore();
  const [jobs, setJobs] = useState<AnalysisJob[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [datasetId, setDatasetId] = useState("");
  const [module, setModule] = useState<AnalysisModule>("process_discovery");
  const [caseCol, setCaseCol] = useState("case_id");
  const [actCol, setActCol] = useState("activity");
  const [timeCol, setTimeCol] = useState("timestamp");
  const [amountCol, setAmountCol] = useState("");
  const [resourceCol, setResourceCol] = useState("");
  const [slaHours, setSlaHours] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!organizationId) return;
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    try {
      const [j, d] = await Promise.all([
        api.listJobs(organizationId, projectId, session.access_token),
        api.listDatasets(organizationId, projectId, session.access_token),
      ]);
      setJobs(j.jobs || []);
      setDatasets((d.datasets || []).filter((x: Dataset) => x.status === "ready"));
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, [organizationId, projectId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!organizationId || !projectId || !datasetId) {
      setError("Select project and dataset.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    try {
      await api.createAnalysis(
        {
          organization_id: organizationId,
          project_id: projectId,
          dataset_id: datasetId,
          analysis_module: module,
          case_column: caseCol,
          activity_column: actCol,
          timestamp_column: timeCol,
          amount_column: amountCol || null,
          resource_column: resourceCol || null,
          sla_hours: slaHours ? Number(slaHours) : null,
        },
        session.access_token
      );
      await load();
    } catch (err: any) {
      setError(err.message);
    }
    setSubmitting(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Analyses</h1>
        <p className="text-slate-400 mt-1">
          Run process mining jobs and track progress
        </p>
      </div>

      <Card>
        <h2 className="font-semibold text-white mb-4">New analysis</h2>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Dataset</Label>
            <Select
              value={datasetId}
              onChange={(e) => setDatasetId(e.target.value)}
              required
            >
              <option value="">Select dataset…</option>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.row_count} rows)
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Module</Label>
            <Select
              value={module}
              onChange={(e) => setModule(e.target.value as AnalysisModule)}
            >
              {MODULES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Case column</Label>
            <Input value={caseCol} onChange={(e) => setCaseCol(e.target.value)} required />
          </div>
          <div>
            <Label>Activity column</Label>
            <Input value={actCol} onChange={(e) => setActCol(e.target.value)} required />
          </div>
          <div>
            <Label>Timestamp column</Label>
            <Input value={timeCol} onChange={(e) => setTimeCol(e.target.value)} required />
          </div>
          {module === "process_intelligence" && (
            <>
              <div>
                <Label>Amount / value column <span className="text-slate-500">(optional)</span></Label>
                <Input placeholder="amount, total, value…" value={amountCol} onChange={(e) => setAmountCol(e.target.value)} />
              </div>
              <div>
                <Label>Resource column <span className="text-slate-500">(optional)</span></Label>
                <Input placeholder="user, employee, owner…" value={resourceCol} onChange={(e) => setResourceCol(e.target.value)} />
              </div>
              <div>
                <Label>SLA target in hours <span className="text-slate-500">(optional)</span></Label>
                <Input type="number" min="0.1" step="0.1" placeholder="24" value={slaHours} onChange={(e) => setSlaHours(e.target.value)} />
              </div>
            </>
          )}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={submitting || !projectId}>
              {submitting ? "Queuing…" : "Run analysis"}
            </Button>
          </div>
        </form>
        {error && (
          <p className="mt-3 text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </Card>

      <div className="space-y-3">
        <h2 className="font-semibold text-white">Recent jobs</h2>
        {loading && <p className="text-sm text-slate-400">Loading…</p>}
        {!loading && jobs.length === 0 && (
          <Card>
            <p className="text-sm text-slate-400">No analyses yet.</p>
          </Card>
        )}
        {jobs.map((j) => (
          <Link key={j.id} href={`/analyses/${j.id}`}>
            <Card className="flex items-center justify-between hover:border-slate-600 transition cursor-pointer mb-3">
              <div>
                <p className="font-medium text-white">
                  {j.job_type?.replace(/_/g, " ") || "Analysis"}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {new Date(j.created_at).toLocaleString()}
                  {j.progress != null && j.status !== "completed"
                    ? ` · ${j.progress}%`
                    : ""}
                </p>
              </div>
              <Badge tone={statusTone(j.status)}>{j.status}</Badge>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

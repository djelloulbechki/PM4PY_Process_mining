"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import { Card, Button, Badge } from "@/components/ui";
import { DfgViewer } from "@/components/DfgViewer";
import { formatNumber, formatDuration } from "@/lib/utils";
import type { MiningResult, ProcessDiscoveryResult, PerformanceResult, ConformanceResult, ProcessIntelligenceResult } from "@/types";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

function statusTone(s: string) {
  if (s === "completed") return "success" as const;
  if (s === "failed") return "danger" as const;
  if (["processing", "retrying"].includes(s)) return "info" as const;
  if (s === "cancelled") return "warning" as const;
  return "default" as const;
}

export default function JobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const [job, setJob] = useState<any>(null);
  const [result, setResult] = useState<MiningResult | null>(null);
  const [metrics, setMetrics] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [loadingResult, setLoadingResult] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const { data: { session } } = await createClient().auth.getSession();
      if (!session) return;
      try {
        const j = await api.getJob(jobId, session.access_token);
        if (cancelled) return;
        setJob(j);
        if (j.status === "completed" && !result) {
          setLoadingResult(true);
          const art = await api.getArtifactUrl(jobId, session.access_token);
          setMetrics(art.metrics_summary || {});
          const res = await fetch(art.signed_url, { cache: "no-store" });
          if (!res.ok) throw new Error("Could not load analysis artifact.");
          const data = await res.json();
          if (!cancelled) setResult(data);
          setLoadingResult(false);
        } else if (["queued", "processing", "retrying"].includes(j.status)) {
          timer = setTimeout(poll, 2500);
        }
      } catch (e: any) { if (!cancelled) setError(e.message || "Something went wrong."); }
    }
    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [jobId, result]);

  async function handleCancel() {
    const { data: { session } } = await createClient().auth.getSession();
    if (!session) return;
    try { await api.cancelJob(jobId, session.access_token); setJob((j: any) => j ? { ...j, status: "cancelled" } : j); }
    catch (e: any) { setError(e.message); }
  }

  return <div className="space-y-6">
    <div className="flex items-start justify-between gap-4">
      <div><Link href="/analyses" className="text-sm text-slate-400 hover:text-white">← Back to analyses</Link>
        <h1 className="text-2xl font-bold text-white mt-2">{job?.job_type?.replace(/_/g, " ") || "Analysis"}</h1>
        <p className="text-xs text-slate-500 mt-1 font-mono">{jobId}</p></div>
      {job && <div className="flex items-center gap-2 flex-wrap">
        <Badge tone={statusTone(job.status)}>{job.status}</Badge>
        {["queued","processing","retrying"].includes(job.status) && <Button size="sm" variant="danger" onClick={handleCancel}>Cancel</Button>}
        {job.status === "completed" && (
          <Link href={`/analyses/${jobId}/optimize`}>
            <Button size="sm">✨ Optimize</Button>
          </Link>
        )}
      </div>}
    </div>
    {error && <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}
    {job && <Card><div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
      <Metric label="Progress" value={`${job.progress ?? 0}%`} /><Metric label="Created" value={job.created_at ? new Date(job.created_at).toLocaleString() : "—"} />
      <Metric label="Completed" value={job.completed_at ? new Date(job.completed_at).toLocaleString() : "—"} /><Metric label="Events / Cases" value={`${formatNumber(metrics.total_events as number)} / ${formatNumber(metrics.cases_count as number)}`} />
    </div>{job.error_message && <p className="mt-4 text-sm text-red-400 border-t border-slate-800 pt-3">{job.error_message}</p>}
      {["queued","processing","retrying"].includes(job.status) && <div className="mt-4 h-2 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-brand-500 transition-all" style={{ width: `${job.progress || 5}%` }} /></div>}
    </Card>}
    {loadingResult && <p className="text-sm text-slate-400">Loading intelligence artifact…</p>}
    {result?.type === "process_intelligence" && <ProcessIntelligenceView data={result as ProcessIntelligenceResult} />}
    {result?.type === "process_discovery" && <ProcessDiscoveryView data={result as ProcessDiscoveryResult} />}
    {result?.type === "performance_analytics" && <PerformanceView data={result as PerformanceResult} />}
    {result?.type === "conformance_checking" && <ConformanceView data={result as ConformanceResult} />}
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div><p className="text-slate-500">{label}</p><p className="text-white font-medium mt-1">{value}</p></div>; }
function fmtHours(h: number | null) { return h == null ? "—" : h >= 24 ? `${(h/24).toFixed(1)}d` : `${h.toFixed(1)}h`; }
function Empty(){return <p className="text-sm text-slate-500">No actionable records detected.</p>}
function Table({headers,rows}:{headers:string[];rows:string[][]}){return <div className="overflow-auto"><table className="w-full text-sm"><thead><tr>{headers.map(h=><th key={h} className="text-left text-slate-500 font-medium py-2">{h}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i} className="border-t border-slate-800">{r.map((c,j)=><td key={j} className="py-2 text-slate-300">{c}</td>)}</tr>)}</tbody></table></div>}

function ProcessIntelligenceView({ data }: { data: ProcessIntelligenceResult }) {
  const e = data.executive_summary;
  const bottleneckData = data.bottlenecks.slice(0, 10).map(x => ({ name: `${x.from} → ${x.to}`, hours: x.avg_wait_hours }));
  return <div className="space-y-4">
    {/* Visual hero summary inspired by modern automation UIs */}
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 p-6">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-brand-500/10 via-transparent to-transparent pointer-events-none" />
      <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-brand-400 font-medium mb-1">Process Intelligence</p>
          <h2 className="text-xl font-bold text-white">Diagnostic complete</h2>
          <p className="text-sm text-slate-400 mt-1 max-w-md">
            Health score {e.process_health_score}/100 · {formatNumber(e.events)} events across {formatNumber(e.cases)} cases
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-3xl font-bold text-white">{e.process_health_score}</p>
            <p className="text-xs text-slate-500">health score</p>
          </div>
        </div>
      </div>
    </div>

    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card><p className="text-slate-400 text-sm">Process health</p><p className="text-3xl font-bold text-white mt-2">{e.process_health_score}</p><p className="text-xs text-slate-500 mt-1">diagnostic score</p></Card>
      <Card><p className="text-slate-400 text-sm">Median cycle time</p><p className="text-3xl font-bold text-white mt-2">{fmtHours(e.median_cycle_time_hours)}</p><p className="text-xs text-slate-500 mt-1">P95 {fmtHours(e.p95_cycle_time_hours)}</p></Card>
      <Card><p className="text-slate-400 text-sm">Rework rate</p><p className="text-3xl font-bold text-white mt-2">{(e.rework_rate * 100).toFixed(1)}%</p><p className="text-xs text-slate-500 mt-1">{formatNumber(data.rework.cases_affected)} cases affected</p></Card>
      <Card><p className="text-slate-400 text-sm">Process variants</p><p className="text-3xl font-bold text-white mt-2">{formatNumber(e.variants)}</p><p className="text-xs text-slate-500 mt-1">{formatNumber(e.events)} events / {formatNumber(e.cases)} cases</p></Card>
    </div>
    {data.sla && <Card><div className="flex items-center justify-between"><div><h2 className="font-semibold text-white">SLA performance</h2><p className="text-sm text-slate-500 mt-1">Target {data.sla.target_hours} hours</p></div><p className="text-2xl font-bold text-white">{(data.sla.compliance_rate * 100).toFixed(1)}%</p></div><div className="mt-4 h-2 bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, data.sla.compliance_rate * 100))}%` }} /></div><p className="text-xs text-slate-500 mt-2">{formatNumber(data.sla.breaches)} cases exceeded the target.</p></Card>}
    <div className="grid lg:grid-cols-2 gap-4">
      <Card><h2 className="font-semibold text-white mb-4">Top bottlenecks</h2>{bottleneckData.length ? <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={bottleneckData} layout="vertical" margin={{ left: 100, right: 10 }}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" /><YAxis type="category" dataKey="name" width={95} fontSize={10} /><Tooltip /><Bar dataKey="hours" name="Avg wait (hours)" /></BarChart></ResponsiveContainer></div> : <Empty />}</Card>
      <Card><h2 className="font-semibold text-white mb-4">Improvement opportunities</h2><div className="space-y-2">{data.opportunities.slice(0,8).map((o,i)=><div key={i} className="rounded-lg border border-slate-800 p-3"><div className="flex justify-between gap-3"><p className="text-sm font-medium text-white">{o.title}</p><Badge tone={i < 3 ? "warning" : "default"}>{o.type}</Badge></div><p className="text-xs text-slate-500 mt-1">Priority score {o.priority_score}</p></div>)}</div></Card>
    </div>
    <div className="grid lg:grid-cols-2 gap-4">
      <Card><h2 className="font-semibold text-white mb-3">Top rework activities</h2><Table rows={data.rework.top_activities.map(x=>[x.activity, formatNumber(x.repeated_events)])} headers={["Activity","Repeated events"]} /></Card>
      <Card><h2 className="font-semibold text-white mb-3">Most common variants</h2><div className="space-y-2">{data.variants.slice(0,8).map(v=><div key={v.rank} className="text-sm"><div className="flex justify-between text-slate-300 gap-3"><span className="truncate">#{v.rank} · {v.path.join(" → ")}</span><span>{(v.share*100).toFixed(1)}%</span></div><div className="h-1.5 bg-slate-800 rounded-full mt-1"><div className="h-full bg-brand-500 rounded-full" style={{width:`${v.share*100}%`}}/></div></div>)}</div></Card>
    </div>
    {data.financial && <Card><h2 className="font-semibold text-white">Financial exposure</h2><p className="text-sm text-slate-500 mt-1">Derived from the selected case amount column; this is exposure, not a claimed savings figure.</p><div className="grid sm:grid-cols-3 gap-4 mt-4"><Metric label="Total case amount" value={data.financial.total_amount.toLocaleString()} /><Metric label="Cases with amount" value={formatNumber(data.financial.cases_with_amount)} /><Metric label="Median case amount" value={data.financial.median_case_amount == null ? "—" : data.financial.median_case_amount.toLocaleString()} /></div></Card>}
  </div>;
}

function ProcessDiscoveryView({ data }: { data: ProcessDiscoveryResult }) { return <div className="space-y-4"><Card><h2 className="font-semibold text-white mb-3">Directly-Follows Graph</h2><DfgViewer dfg={data.dfg} startActivities={data.start_activities} endActivities={data.end_activities}/></Card><div className="grid sm:grid-cols-2 gap-4"><Card><h3 className="text-sm font-medium text-slate-300 mb-2">Start activities</h3><Table headers={["Activity","Cases"]} rows={Object.entries(data.start_activities).map(([k,v])=>[k,formatNumber(v)])}/></Card><Card><h3 className="text-sm font-medium text-slate-300 mb-2">End activities</h3><Table headers={["Activity","Cases"]} rows={Object.entries(data.end_activities).map(([k,v])=>[k,formatNumber(v)])}/></Card></div></div>; }
function PerformanceView({ data }: { data: PerformanceResult }) { const freq=Object.entries(data.activity_frequency).map(([name,count])=>({name,count})).slice(0,15); return <div className="space-y-4"><div className="grid sm:grid-cols-3 gap-4"><Card><Metric label="Total cases" value={formatNumber(data.total_cases)}/></Card><Card><Metric label="Total events" value={formatNumber(data.total_events)}/></Card><Card><Metric label="Unique activities" value={formatNumber(data.unique_activities)}/></Card></div><div className="grid sm:grid-cols-2 gap-4"><Card><h3 className="font-medium text-white mb-3">Case duration</h3><StatBlock s={data.case_duration_seconds}/></Card><Card><h3 className="font-medium text-white mb-3">Waiting time</h3><StatBlock s={data.waiting_time_seconds}/></Card></div>{freq.length>0&&<Card><h3 className="font-medium text-white mb-4">Activity frequency</h3><div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={freq} layout="vertical" margin={{left:80}}><CartesianGrid strokeDasharray="3 3"/><XAxis type="number"/><YAxis type="category" dataKey="name" fontSize={11} width={75}/><Tooltip/><Bar dataKey="count" radius={[0,4,4,0]}/></BarChart></ResponsiveContainer></div></Card>}</div>; }
function StatBlock({s}:{s:{count:number;mean:number|null;median:number|null;p95:number|null;max:number|null}}){return <dl className="grid grid-cols-2 gap-2 text-sm">{[["Count",formatNumber(s.count)],["Mean",formatDuration(s.mean)],["Median",formatDuration(s.median)],["P95",formatDuration(s.p95)],["Max",formatDuration(s.max)]].map(([k,v])=><div key={k}><dt className="text-slate-500">{k}</dt><dd className="text-white font-medium">{v}</dd></div>)}</dl>}
function ConformanceView({ data }: { data: ConformanceResult }) { if(data.status === "error") return <Card><p className="text-red-400 text-sm">{data.message}</p></Card>; const r=data.results; return <div className="space-y-4"><div className="grid sm:grid-cols-3 gap-4"><Card><Metric label="Average fitness" value={`${(r.average_fitness*100).toFixed(1)}%`}/></Card><Card><Metric label="Fit traces" value={`${formatNumber(r.fit_traces)} / ${formatNumber(r.total_traces)}`}/></Card><Card><Metric label="Deviant sample" value={formatNumber(r.deviant_sample.length)}/></Card></div><Card><h3 className="font-medium text-white mb-3">Deviant traces</h3><Table headers={["Trace","Fitness","Fit"]} rows={r.deviant_sample.map(x=>[String(x.index),`${(x.fitness*100).toFixed(1)}%`,x.is_fit?"Yes":"No"])}/></Card></div>; }

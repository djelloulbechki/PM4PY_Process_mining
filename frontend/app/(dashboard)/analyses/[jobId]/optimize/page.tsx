"use client";
import { useEffect, useState, use } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import { Card, Button } from "@/components/ui";
import { OptimizationCanvas } from "@/components/OptimizationCanvas";
import { InsightCards } from "@/components/InsightCards";
import { N8nExportModal } from "@/components/N8nExportModal";
import { AgencyContactModal } from "@/components/AgencyContactModal";
import { ArrowLeft, Download, Users, Loader2 } from "lucide-react";

interface OptimizationData {
  suggestions: any[];
  flow_diagram: { nodes: any[]; edges: any[] };
  n8n_blueprint: any;
  summary: {
    total_suggestions: number;
    high_severity: number;
    critical: number;
    estimated_savings_hours: number;
  };
}

export default function OptimizePage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const [data, setData] = useState<OptimizationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showN8nModal, setShowN8nModal] = useState(false);
  const [showAgencyModal, setShowAgencyModal] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      try {
        const result = await api.getOptimizationSuggestions(jobId, session.access_token);
        setData(result);
      } catch (e: any) {
        setError(e.message || "Failed to load optimization suggestions");
      }
      setLoading(false);
    }
    load();
  }, [jobId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
        <p className="text-slate-400">Generating optimization suggestions…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-16 text-center space-y-4">
        <p className="text-red-400">{error}</p>
        <Link
          href={`/analyses/${jobId}`}
          className="text-brand-400 hover:underline inline-block text-sm"
        >
          ← Back to analysis
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <Link
            href={`/analyses/${jobId}`}
            className="text-sm text-slate-400 hover:text-white flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" /> Back to analysis
          </Link>
          <h1 className="text-2xl font-bold text-white mt-2">Process Optimization</h1>
          <p className="text-slate-400 mt-1 text-sm">
            Rule-based, deterministic suggestions — no AI black box
          </p>
        </div>
        <div className="flex gap-3 flex-shrink-0">
          <Button variant="secondary" onClick={() => setShowN8nModal(true)}>
            <Download className="h-4 w-4" /> Export n8n
          </Button>
          <Button onClick={() => setShowAgencyModal(true)}>
            <Users className="h-4 w-4" /> Contact Agency
          </Button>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-4">
        <p className="text-sm text-amber-300/95 leading-relaxed">
          <strong className="text-amber-200">⚠️ Preliminary Blueprint:</strong> These
          suggestions and automation workflows are generated automatically from your process
          data. They are initial recommendations that should be reviewed by your digital
          transformation engineer or a certified automation agency before implementation.
        </p>
      </div>

      {/* Summary Stats */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <p className="text-slate-400 text-xs uppercase tracking-wide">Suggestions</p>
            <p className="text-3xl font-bold text-white mt-1">
              {data.summary.total_suggestions}
            </p>
          </Card>
          <Card>
            <p className="text-slate-400 text-xs uppercase tracking-wide">Critical</p>
            <p className="text-3xl font-bold text-red-400 mt-1">{data.summary.critical}</p>
          </Card>
          <Card>
            <p className="text-slate-400 text-xs uppercase tracking-wide">High Severity</p>
            <p className="text-3xl font-bold text-amber-400 mt-1">
              {data.summary.high_severity}
            </p>
          </Card>
          <Card>
            <p className="text-slate-400 text-xs uppercase tracking-wide">Est. Savings</p>
            <p className="text-3xl font-bold text-emerald-400 mt-1">
              {data.summary.estimated_savings_hours.toFixed(0)}h
            </p>
          </Card>
        </div>
      )}

      {/* Main Canvas — inspired by Sequence / modern automation UIs */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[560px]">
          {/* Left: Insight Cards */}
          <div className="lg:col-span-4 overflow-y-auto max-h-[620px] pr-1 space-y-1">
            <InsightCards suggestions={data.suggestions} />
          </div>

          {/* Right: Interactive Flow Diagram */}
          <div className="lg:col-span-8 h-[520px] lg:h-[620px]">
            <div className="h-full flex flex-col">
              <p className="text-xs uppercase tracking-wide text-slate-500 mb-2 px-1">
                Automation Canvas
              </p>
              <div className="flex-1">
                <OptimizationCanvas
                  nodes={data.flow_diagram.nodes}
                  edges={data.flow_diagram.edges}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {data && (
        <>
          <N8nExportModal
            isOpen={showN8nModal}
            onClose={() => setShowN8nModal(false)}
            blueprint={data.n8n_blueprint}
          />
          <AgencyContactModal
            isOpen={showAgencyModal}
            onClose={() => setShowAgencyModal(false)}
            jobId={jobId}
            suggestions={data.suggestions}
          />
        </>
      )}
    </div>
  );
}

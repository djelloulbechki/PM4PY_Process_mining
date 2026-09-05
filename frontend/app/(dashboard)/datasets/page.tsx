"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrgStore } from "@/lib/store";
import { api } from "@/lib/api";
import { Card, Button, Input, Label, Select, Badge } from "@/components/ui";
import { formatBytes, formatNumber } from "@/lib/utils";
import type { Dataset } from "@/types";

export default function DatasetsPage() {
  const { organizationId, projectId } = useOrgStore();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{
    columns: string[];
    preview: Record<string, unknown>[];
    filename: string;
  } | null>(null);
  const [name, setName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDatasets = useCallback(async () => {
    if (!organizationId) return;
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    try {
      const res = await api.listDatasets(
        organizationId,
        projectId,
        session.access_token
      );
      setDatasets(res.datasets || []);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, [organizationId, projectId]);

  useEffect(() => {
    loadDatasets();
  }, [loadDatasets]);

  async function handlePreview() {
    if (!file) return;
    setError(null);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    try {
      const res = await api.previewDataset(file, session.access_token);
      setPreview(res);
      setName(res.filename.replace(/\.(csv|xlsx)$/i, ""));
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleUpload() {
    if (!file || !organizationId || !projectId || !preview) {
      setError("Select a project and preview the file first.");
      return;
    }
    setUploading(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setUploading(false);
      return;
    }

    try {
      // Count rows client-side for quota (simple full parse – for large files prefer server)
      const text = await file.text();
      const rowCount = Math.max(0, text.split("\n").filter((l) => l.trim()).length - 1);

      const uuid = crypto.randomUUID();
      const storagePath = `${organizationId}/${projectId}/${uuid}_${preview.filename}`;
      const bucket = process.env.NEXT_PUBLIC_DATASETS_BUCKET || "datasets";

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(storagePath, file, {
          contentType: file.type || (file.name.toLowerCase().endsWith(".xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv"),
          upsert: false,
        });

      if (uploadError) throw new Error(uploadError.message);

      await api.registerDataset(
        {
          organization_id: organizationId,
          project_id: projectId,
          name: name || preview.filename,
          storage_path: storagePath,
          row_count: rowCount,
          file_size_bytes: file.size,
        },
        session.access_token
      );

      setFile(null);
      setPreview(null);
      setName("");
      await loadDatasets();
    } catch (e: any) {
      setError(e.message || "Upload failed");
    }
    setUploading(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Datasets</h1>
        <p className="text-slate-400 mt-1">
          Upload CSV or Excel event logs (case, activity, timestamp)
        </p>
      </div>

      {!projectId && (
        <Card>
          <p className="text-amber-400 text-sm">
            Select an active project from the Projects page first.
          </p>
        </Card>
      )}

      <Card className="space-y-4">
        <h2 className="font-semibold text-white">Upload new dataset</h2>
        <div>
          <Label>CSV / XLSX file</Label>
          <Input
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setPreview(null);
            }}
          />
        </div>
        {file && !preview && (
          <Button onClick={handlePreview} variant="secondary">
            Preview columns
          </Button>
        )}
        {preview && (
          <>
            <div>
              <Label>Dataset name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-800/80 text-slate-300">
                  <tr>
                    {preview.columns.map((c) => (
                      <th key={c} className="px-3 py-2 font-medium">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((row, i) => (
                    <tr key={i} className="border-t border-slate-800">
                      {preview.columns.map((c) => (
                        <td key={c} className="px-3 py-1.5 text-slate-400">
                          {String(row[c] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button onClick={handleUpload} disabled={uploading || !projectId}>
              {uploading ? "Uploading…" : "Upload & register"}
            </Button>
          </>
        )}
        {error && (
          <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </Card>

      <div className="space-y-3">
        <h2 className="font-semibold text-white">Your datasets</h2>
        {loading && <p className="text-sm text-slate-400">Loading…</p>}
        {!loading && datasets.length === 0 && (
          <Card>
            <p className="text-sm text-slate-400">No datasets yet.</p>
          </Card>
        )}
        {datasets.map((d) => (
          <Card key={d.id} className="flex items-center justify-between">
            <div>
              <p className="font-medium text-white">{d.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {formatNumber(d.row_count)} rows · {formatBytes(d.file_size_bytes)} ·{" "}
                {new Date(d.created_at).toLocaleString()}
              </p>
            </div>
            <Badge
              tone={
                d.status === "ready"
                  ? "success"
                  : d.status === "failed"
                    ? "danger"
                    : "default"
              }
            >
              {d.status}
            </Badge>
          </Card>
        ))}
      </div>
    </div>
  );
}

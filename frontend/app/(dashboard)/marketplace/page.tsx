"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrgStore } from "@/lib/store";
import { api } from "@/lib/api";
import { Card, Button, Input, Label, Badge } from "@/components/ui";
import { Plug, X, CheckCircle2, Loader2 } from "lucide-react";

type Platform = {
  key: string;
  name: string;
  tagline: string;
  category: string;
  color: string;
  fields: { key: string; label: string; secret?: boolean; placeholder?: string }[];
};

const PLATFORMS: Platform[] = [
  {
    key: "odoo",
    name: "Odoo",
    tagline: "ERP · Sales · Inventory · Helpdesk",
    category: "ERP",
    color: "#714B67",
    fields: [
      { key: "base_url", label: "Odoo URL", placeholder: "https://mycompany.odoo.com" },
      { key: "database", label: "Database (optional)" },
      { key: "api_key", label: "API key", secret: true },
    ],
  },
  {
    key: "hubspot",
    name: "HubSpot",
    tagline: "CRM · Deals · Tickets",
    category: "CRM",
    color: "#FF7A59",
    fields: [{ key: "api_key", label: "Private app access token", secret: true }],
  },
  {
    key: "salesforce",
    name: "Salesforce",
    tagline: "CRM · Cases · Opportunities",
    category: "CRM",
    color: "#00A1E0",
    fields: [
      { key: "instance_url", label: "Instance URL", placeholder: "https://org.my.salesforce.com" },
      { key: "api_key", label: "Access token", secret: true },
    ],
  },
  {
    key: "zendesk",
    name: "Zendesk",
    tagline: "Support · Ticket lifecycle",
    category: "Support",
    color: "#03363D",
    fields: [
      { key: "base_url", label: "Subdomain URL", placeholder: "https://company.zendesk.com" },
      { key: "email", label: "Agent email" },
      { key: "api_key", label: "API token", secret: true },
    ],
  },
  {
    key: "monday",
    name: "Monday.com",
    tagline: "Work OS · Boards · Status",
    category: "Work OS",
    color: "#FF3D57",
    fields: [
      { key: "api_key", label: "API token", secret: true },
      { key: "board_id", label: "Default board ID (optional)" },
    ],
  },
  {
    key: "zoho",
    name: "Zoho CRM",
    tagline: "CRM · Deals · Cases",
    category: "CRM",
    color: "#E42527",
    fields: [
      { key: "api_key", label: "OAuth access token", secret: true },
      { key: "api_domain", label: "API domain (optional)", placeholder: "https://www.zohoapis.com" },
      { key: "module", label: "Default module", placeholder: "Deals" },
    ],
  },
  {
    key: "dynamics365",
    name: "Dynamics 365",
    tagline: "Microsoft · Cases · Opportunities",
    category: "CRM",
    color: "#002050",
    fields: [
      { key: "base_url", label: "Org URL", placeholder: "https://org.crm.dynamics.com" },
      { key: "api_key", label: "OAuth access token", secret: true },
    ],
  },
];

function PlatformLogo({ name, color }: { name: string; color: string }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div
      className="h-14 w-14 rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-lg"
      style={{
        background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)`,
        boxShadow: `0 8px 24px ${color}33`,
      }}
    >
      {initials}
    </div>
  );
}

export default function MarketplacePage() {
  const { organizationId, projectId } = useOrgStore();
  const [connectors, setConnectors] = useState<any[]>([]);
  const [active, setActive] = useState<Platform | null>(null);
  const [name, setName] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [discovery, setDiscovery] = useState<any | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [datasetName, setDatasetName] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [query, setQuery] = useState("");

  const connectedTypes = useMemo(
    () => new Set(connectors.map((c) => c.connector_type)),
    [connectors]
  );

  const filtered = PLATFORMS.filter(
    (p) =>
      !query ||
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.tagline.toLowerCase().includes(query.toLowerCase()) ||
      p.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (!organizationId) return;
    load();
  }, [organizationId, projectId]);

  async function load() {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    try {
      const list = await api.listConnectors(organizationId!, projectId, session.access_token);
      setConnectors(list.connectors || []);
    } catch (e: any) {
      setError(e.message);
    }
  }

  function openConnect(p: Platform) {
    setActive(p);
    setName(`${p.name} connection`);
    setForm({});
    setError(null);
  }

  async function create() {
    if (!organizationId || !projectId || !active) return;
    setCreating(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const apiKey = form.api_key || "";
    const config: Record<string, any> = {};
    for (const f of active.fields) {
      if (f.key === "api_key") continue;
      if (form[f.key]) config[f.key] = form[f.key];
    }

    try {
      await api.createConnector(
        {
          organization_id: organizationId,
          project_id: projectId,
          name: name || `${active.name} connection`,
          connector_type: active.key,
          api_key: apiKey,
          config,
        },
        session.access_token
      );
      setActive(null);
      setForm({});
      await load();
    } catch (e: any) {
      setError(e.message);
    }
    setCreating(false);
  }

  async function inspect(c: any) {
    setSelected(c);
    setDiscovery(null);
    setMapping({});
    setError(null);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    try {
      const d = await api.discoverConnector(c.id, session.access_token);
      setDiscovery(d);
      const rec = d?.recommended?.[0];
      if (rec) {
        const m: Record<string, string> = {};
        for (const [k, v] of Object.entries(rec)) {
          if (k === "key" || k === "label") continue;
          if (typeof v === "string" || typeof v === "number") m[k] = String(v);
        }
        setMapping(m);
      }
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function sync() {
    if (!selected) return;
    setSyncing(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    try {
      await api.syncOdoo(
        selected.id,
        { dataset_name: datasetName || undefined, mapping },
        session.access_token
      );
      setSelected(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
    setSyncing(false);
  }

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 p-8">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-brand-500/15 via-transparent to-transparent pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs text-brand-300 mb-3">
              <Plug className="h-3.5 w-3.5" />
              Integration Marketplace
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Connect your stack</h1>
            <p className="text-slate-400 mt-2 max-w-xl text-sm leading-relaxed">
              Pull live event logs from ERP, CRM, and support platforms into ProcessMine.
              One click to test, map, and sync — process intelligence starts here.
            </p>
          </div>
          <div className="w-full md:w-72">
            <Input
              placeholder="Search platforms…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      {!projectId && (
        <p className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
          Select a project first so connections are saved under the right workspace.
        </p>
      )}

      {/* Platform grid */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4">
          Available platforms
        </h2>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((p) => {
            const isConnected = connectedTypes.has(p.key);
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => openConnect(p)}
                className="group text-left rounded-2xl border border-slate-800 bg-slate-900/50 p-5 hover:border-slate-600 hover:bg-slate-900 transition shadow-sm hover:shadow-xl hover:shadow-black/20"
              >
                <div className="flex items-start justify-between gap-3">
                  <PlatformLogo name={p.name} color={p.color} />
                  <div className="flex flex-col items-end gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 bg-slate-800/80 px-2 py-0.5 rounded-full">
                      {p.category}
                    </span>
                    {isConnected && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" /> Connected
                      </span>
                    )}
                  </div>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-white group-hover:text-brand-300 transition">
                  {p.name}
                </h3>
                <p className="text-xs text-slate-400 mt-1">{p.tagline}</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-slate-500">test · discover · sync</span>
                  <span className="text-xs font-medium text-brand-400 opacity-0 group-hover:opacity-100 transition">
                    Connect →
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Connected sources */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          Your connections
        </h2>
        {connectors.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-400">
              No connections yet. Pick a platform above to get started.
            </p>
          </Card>
        ) : (
          connectors.map((c) => {
            const meta = PLATFORMS.find((p) => p.key === c.connector_type);
            return (
              <Card key={c.id} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {meta && <PlatformLogo name={meta.name} color={meta.color} />}
                  <div className="min-w-0">
                    <p className="font-medium text-white truncate">{c.name}</p>
                    <p className="text-xs text-slate-500">
                      {c.connector_type} · last sync{" "}
                      {c.last_sync_at ? new Date(c.last_sync_at).toLocaleString() : "never"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <Badge tone={c.status === "connected" ? "success" : "danger"}>{c.status}</Badge>
                  <Button variant="secondary" onClick={() => inspect(c)}>
                    Configure & sync
                  </Button>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Connect modal */}
      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <Card className="w-full max-w-lg space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <PlatformLogo name={active.name} color={active.color} />
                <div>
                  <h2 className="text-xl font-bold text-white">Connect {active.name}</h2>
                  <p className="text-xs text-slate-400">{active.tagline}</p>
                </div>
              </div>
              <button type="button" onClick={() => setActive(null)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <Label>Connection name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              {active.fields.map((f) => (
                <div key={f.key}>
                  <Label>{f.label}</Label>
                  <Input
                    type={f.secret ? "password" : "text"}
                    value={form[f.key] || ""}
                    placeholder={f.placeholder}
                    onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <Button onClick={create} disabled={creating || !projectId || !form.api_key}>
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Testing…
                  </>
                ) : (
                  "Test & connect"
                )}
              </Button>
              <Button variant="secondary" onClick={() => setActive(null)}>
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Configure / sync panel */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <Card className="w-full max-w-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">Map event log</h2>
                <p className="text-xs text-slate-400 mt-1">
                  {selected.name} · {selected.connector_type}
                </p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            {discovery?.recommended && (
              <div>
                <p className="text-xs text-slate-500 mb-2">Recommended mappings</p>
                <div className="flex flex-wrap gap-2">
                  {discovery.recommended.map((r: any) => (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => {
                        const m: Record<string, string> = {};
                        for (const [k, v] of Object.entries(r)) {
                          if (k === "key" || k === "label") continue;
                          if (typeof v === "string" || typeof v === "number") m[k] = String(v);
                        }
                        setMapping(m);
                      }}
                      className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-brand-500"
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              {[
                "model",
                "object_type",
                "sobject",
                "entity",
                "module",
                "board_id",
                "case_field",
                "activity_field",
                "timestamp_field",
                "resource_field",
                "amount_field",
                "status_column_id",
              ].map((key) => (
                <div key={key}>
                  <Label>{key}</Label>
                  <Input
                    value={mapping[key] || ""}
                    onChange={(e) => setMapping((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                </div>
              ))}
              <div className="md:col-span-2">
                <Label>Dataset name</Label>
                <Input value={datasetName} onChange={(e) => setDatasetName(e.target.value)} />
              </div>
            </div>

            <div className="flex gap-3">
              <Button onClick={sync} disabled={syncing}>
                {syncing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Syncing…
                  </>
                ) : (
                  "Sync into event log"
                )}
              </Button>
              <Button variant="secondary" onClick={() => setSelected(null)}>
                Close
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

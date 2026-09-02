"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrgStore } from "@/lib/store";
import { api } from "@/lib/api";
import { Card, Button, Input, Label, Badge } from "@/components/ui";

export default function ConnectorsPage() {
  const { organizationId, projectId } = useOrgStore();
  const [connectors, setConnectors] = useState<any[]>([]);
  const [name, setName] = useState("Odoo"); const [url, setUrl] = useState(""); const [database, setDatabase] = useState(""); const [apiKey, setApiKey] = useState("");
  const [creating, setCreating] = useState(false); const [error, setError] = useState<string | null>(null); const [selected, setSelected] = useState<any | null>(null); const [discovery, setDiscovery] = useState<any | null>(null);
  const [model, setModel] = useState("sale.order"); const [caseField, setCaseField] = useState("id"); const [activityField, setActivityField] = useState("state"); const [timestampField, setTimestampField] = useState("create_date"); const [resourceField, setResourceField] = useState("user_id"); const [amountField, setAmountField] = useState("amount_total"); const [syncing, setSyncing] = useState(false);

  const token = async () => { const { data: { session } } = await createClient().auth.getSession(); if (!session) throw new Error("Please sign in again."); return session.access_token; };
  const load = useCallback(async () => { if (!organizationId) return; try { setConnectors((await api.listConnectors(organizationId, projectId, await token())).connectors || []); } catch (e: any) { setError(e.message); } }, [organizationId, projectId]);
  useEffect(() => { load(); }, [load]);

  async function create() { if (!organizationId || !projectId || !url || !apiKey) return setError("Project, Odoo URL and API key are required."); setCreating(true); setError(null); try { await api.createConnector({ organization_id: organizationId, project_id: projectId, name, connector_type: "odoo", api_key: apiKey, config: { base_url: url, database } }, await token()); setApiKey(""); await load(); } catch (e: any) { setError(e.message); } finally { setCreating(false); } }
  async function inspect(c: any) { setSelected(c); setError(null); try { setDiscovery(await api.discoverConnector(c.id, await token())); } catch (e: any) { setError(e.message); } }
  async function sync() { if (!selected) return; setSyncing(true); setError(null); try { await api.syncOdoo(selected.id, { dataset_name: `Odoo · ${model}`, mapping: { model, case_field: caseField, activity_field: activityField, timestamp_field: timestampField, resource_field: resourceField || null, amount_field: amountField || null, limit: 10000 } }, await token()); await load(); } catch (e: any) { setError(e.message); } finally { setSyncing(false); } }

  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold text-white">Data Connectors</h1><p className="mt-1 text-slate-400">Bring process data from Odoo or files into one canonical event-log format.</p></div>
    {!projectId && <Card><p className="text-amber-400 text-sm">Select an active project first.</p></Card>}
    <Card className="space-y-4"><div><h2 className="font-semibold text-white">Connect Odoo</h2><p className="text-xs text-slate-500 mt-1">Credentials are encrypted at rest. Use a dedicated Odoo bot/read-only user.</p></div>
      <div className="grid gap-4 md:grid-cols-2"><div><Label>Connection name</Label><Input value={name} onChange={e=>setName(e.target.value)} /></div><div><Label>Odoo URL</Label><Input placeholder="https://company.example.com" value={url} onChange={e=>setUrl(e.target.value)} /></div><div><Label>Database (optional)</Label><Input value={database} onChange={e=>setDatabase(e.target.value)} /></div><div><Label>Odoo API key</Label><Input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} /></div></div>
      <Button onClick={create} disabled={creating || !projectId}>{creating ? "Connecting…" : "Test & connect Odoo"}</Button>
    </Card>
    {error && <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}
    <div className="space-y-3"><h2 className="font-semibold text-white">Connected sources</h2>{connectors.map(c=><Card key={c.id} className="flex items-center justify-between"><div><p className="font-medium text-white">{c.name}</p><p className="text-xs text-slate-500">{c.connector_type} · last sync {c.last_sync_at ? new Date(c.last_sync_at).toLocaleString() : "never"}</p></div><div className="flex items-center gap-3"><Badge tone={c.status === "connected" ? "success" : "danger"}>{c.status}</Badge><Button variant="secondary" onClick={()=>inspect(c)}>Configure</Button></div></Card>)}</div>
    {selected && <Card className="space-y-5"><div><h2 className="font-semibold text-white">Odoo event-log mapping</h2><p className="text-xs text-slate-500">Map Odoo fields into the canonical ProcessMine event model.</p></div>
      <div className="grid gap-4 md:grid-cols-2"><div><Label>Model</Label><Input value={model} onChange={e=>setModel(e.target.value)} /></div><div><Label>Case ID field</Label><Input value={caseField} onChange={e=>setCaseField(e.target.value)} /></div><div><Label>Activity field</Label><Input value={activityField} onChange={e=>setActivityField(e.target.value)} /></div><div><Label>Timestamp field</Label><Input value={timestampField} onChange={e=>setTimestampField(e.target.value)} /></div><div><Label>Resource field</Label><Input value={resourceField} onChange={e=>setResourceField(e.target.value)} /></div><div><Label>Amount field</Label><Input value={amountField} onChange={e=>setAmountField(e.target.value)} /></div></div>
      {discovery?.recommended && <div><p className="text-xs text-slate-500 mb-2">Recommended Odoo processes</p><div className="flex flex-wrap gap-2">{discovery.recommended.map((r:any)=><button key={r.key} onClick={()=>setModel(r.model)} className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-brand-500">{r.label}</button>)}</div></div>}
      <Button onClick={sync} disabled={syncing}>{syncing ? "Syncing…" : "Sync into event log"}</Button>
    </Card>}
  </div>;
}

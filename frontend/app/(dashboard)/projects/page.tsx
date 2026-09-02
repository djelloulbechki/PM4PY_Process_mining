"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrgStore } from "@/lib/store";
import { Card, Button, Input, Label, Badge } from "@/components/ui";
import type { Project, Organization } from "@/types";

export default function ProjectsPage() {
  const {
    organizationId,
    setOrganization,
    setProject,
    projectId,
  } = useOrgStore();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [newProjectName, setNewProjectName] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  async function load() {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const { data: memberships } = await supabase
      .from("organization_members")
      .select("organization_id, organizations(id, name, created_at)")
      .eq("user_id", session.user.id);

    const orgList: Organization[] = (memberships || [])
      .map((m: any) => m.organizations)
      .filter(Boolean);
    setOrgs(orgList);

    const activeOrg = organizationId || orgList[0]?.id;
    if (activeOrg && !organizationId && orgList[0]) {
      setOrganization(orgList[0].id, orgList[0].name);
    }

    if (activeOrg) {
      const { data: projs } = await supabase
        .from("projects")
        .select("*")
        .eq("organization_id", activeOrg)
        .order("created_at", { ascending: false });
      setProjects(projs || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [organizationId]);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!organizationId || !newProjectName.trim()) return;
    setCreating(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("projects")
      .insert({
        organization_id: organizationId,
        name: newProjectName.trim(),
      })
      .select()
      .single();
    setCreating(false);
    if (!error && data) {
      setNewProjectName("");
      setProjects((p) => [data, ...p]);
      setProject(data.id, data.name);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Projects</h1>
        <p className="text-slate-400 mt-1">
          Organize datasets and analyses by project
        </p>
      </div>

      {orgs.length > 1 && (
        <Card>
          <Label>Organization</Label>
          <select
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
            value={organizationId || ""}
            onChange={(e) => {
              const org = orgs.find((o) => o.id === e.target.value);
              if (org) setOrganization(org.id, org.name);
            }}
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Card>
      )}

      <Card>
        <h2 className="font-semibold text-white mb-3">New project</h2>
        <form onSubmit={createProject} className="flex gap-3">
          <Input
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder="Project name"
            className="flex-1"
          />
          <Button type="submit" disabled={creating || !organizationId}>
            {creating ? "Creating…" : "Create"}
          </Button>
        </form>
      </Card>

      <div className="grid gap-3">
        {loading && (
          <p className="text-slate-400 text-sm">Loading projects…</p>
        )}
        {!loading && projects.length === 0 && (
          <Card>
            <p className="text-slate-400 text-sm">
              No projects yet. Create one above.
            </p>
          </Card>
        )}
        {projects.map((p) => (
          <Card
            key={p.id}
            className={`flex items-center justify-between cursor-pointer transition hover:border-slate-600 ${
              projectId === p.id ? "border-brand-500/50" : ""
            }`}
          >
            <div
              onClick={() => setProject(p.id, p.name)}
              className="flex-1"
            >
              <p className="font-medium text-white">{p.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {new Date(p.created_at).toLocaleDateString()}
              </p>
            </div>
            {projectId === p.id && <Badge tone="info">Active</Badge>}
          </Card>
        ))}
      </div>
    </div>
  );
}

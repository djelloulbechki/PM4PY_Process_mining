"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useOrgStore } from "@/lib/store";
import { api } from "@/lib/api";
import { Card, Badge, Button } from "@/components/ui";
import { formatNumber } from "@/lib/utils";
import { Activity, Database, FolderKanban, ArrowRight } from "lucide-react";

export default function DashboardPage() {
  const {
    organizationId,
    projectId,
    setOrganization,
    setProject,
    organizationName,
  } = useOrgStore();
  const [stats, setStats] = useState({
    datasets: 0,
    jobs: 0,
    completed: 0,
    failed: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function bootstrap() {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      // Load memberships
      const { data: memberships } = await supabase
        .from("organization_members")
        .select("organization_id, organizations(id, name)")
        .eq("user_id", session.user.id);

      if (memberships && memberships.length > 0) {
        const first = memberships[0] as any;
        const org = first.organizations;
        if (org && !organizationId) {
          setOrganization(org.id, org.name);
        }

        const activeOrgId = organizationId || org?.id;
        if (activeOrgId) {
          const { data: projects } = await supabase
            .from("projects")
            .select("id, name")
            .eq("organization_id", activeOrgId)
            .order("created_at", { ascending: true })
            .limit(1);

          if (projects?.[0] && !projectId) {
            setProject(projects[0].id, projects[0].name);
          }

          try {
            const ds = await api.listDatasets(
              activeOrgId,
              null,
              session.access_token
            );
            const jobs = await api.listJobs(
              activeOrgId,
              null,
              session.access_token
            );
            setStats({
              datasets: ds.datasets?.length || 0,
              jobs: jobs.jobs?.length || 0,
              completed:
                jobs.jobs?.filter((j: any) => j.status === "completed")
                  .length || 0,
              failed:
                jobs.jobs?.filter((j: any) => j.status === "failed").length ||
                0,
            });
          } catch {
            // ignore for dashboard
          }
        }
      }
      setLoading(false);
    }
    bootstrap();
  }, [organizationId, projectId, setOrganization, setProject]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 mt-1">
          {organizationName
            ? `Overview for ${organizationName}`
            : "Welcome to ProcessMine"}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Datasets",
            value: stats.datasets,
            icon: Database,
            href: "/datasets",
          },
          {
            label: "Total jobs",
            value: stats.jobs,
            icon: Activity,
            href: "/analyses",
          },
          {
            label: "Completed",
            value: stats.completed,
            icon: Activity,
            href: "/analyses",
          },
          {
            label: "Failed",
            value: stats.failed,
            icon: Activity,
            href: "/analyses",
          },
        ].map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="hover:border-slate-600 transition cursor-pointer">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">{s.label}</p>
                  <p className="text-2xl font-semibold text-white mt-1">
                    {loading ? "…" : formatNumber(s.value)}
                  </p>
                </div>
                <s.icon className="h-8 w-8 text-slate-600" />
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <h2 className="font-semibold text-white mb-2">Quick start</h2>
          <ol className="text-sm text-slate-400 space-y-2 list-decimal list-inside">
            <li>Create or select a project</li>
            <li>Upload a CSV event log as a dataset</li>
            <li>Map case / activity / timestamp columns</li>
            <li>Run process discovery or analytics</li>
          </ol>
          <div className="mt-4 flex gap-2">
            <Link href="/datasets">
              <Button size="sm">
                Upload dataset <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
            <Link href="/projects">
              <Button size="sm" variant="secondary">
                Manage projects
              </Button>
            </Link>
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold text-white mb-2">Analysis modules</h2>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Process Discovery</span>
              <Badge tone="success">Ready</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Performance Analytics</span>
              <Badge tone="success">Ready</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Conformance Checking</span>
              <Badge tone="success">Ready</Badge>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

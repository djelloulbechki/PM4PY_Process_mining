"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Database,
  Activity,
  FolderKanban,
  LogOut,
  Plug,
  CreditCard,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useOrgStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/datasets", label: "Datasets", icon: Database },
  { href: "/analyses", label: "Analyses", icon: Activity },
  { href: "/connectors", label: "Connectors", icon: Plug },
  { href: "/billing", label: "Billing", icon: CreditCard },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { organizationName, projectName, clear } = useOrgStore();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    clear();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-slate-800 bg-slate-950/80">
      <div className="px-5 py-5 border-b border-slate-800">
        <Link href="/dashboard" className="text-lg font-semibold text-white">
          Process<span className="text-brand-400">Mine</span>
        </Link>
        {(organizationName || projectName) && (
          <div className="mt-3 space-y-0.5">
            {organizationName && (
              <p className="text-xs text-slate-400 truncate">{organizationName}</p>
            )}
            {projectName && (
              <p className="text-xs text-brand-400 truncate">{projectName}</p>
            )}
          </div>
        )}
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                active
                  ? "bg-brand-600/15 text-brand-400"
                  : "text-slate-400 hover:bg-slate-800/80 hover:text-white"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-slate-800 p-3 space-y-1">
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white transition"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

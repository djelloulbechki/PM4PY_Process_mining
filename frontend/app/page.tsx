import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-800">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <span className="text-xl font-semibold tracking-tight text-white">
            Process<span className="text-brand-400">Mine</span>
          </span>
          <div className="flex gap-3 items-center">
            <Link
              href="/pricing"
              className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:text-white transition"
            >
              Pricing
            </Link>
            <Link
              href="/login"
              className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:text-white transition"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 transition"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-3xl text-center space-y-8">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white text-balance">
            Discover the real process behind your event data
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Upload event logs, run process discovery, performance analytics and
            conformance checking — powered by PM4Py, secured with multi-tenant
            isolation.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/signup"
              className="rounded-xl bg-brand-600 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-brand-600/25 hover:bg-brand-500 transition"
            >
              Start free
            </Link>
            <Link
              href="/login"
              className="rounded-xl border border-slate-700 px-6 py-3 text-base font-medium text-slate-200 hover:border-slate-500 transition"
            >
              Sign in
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-12 text-left">
            {[
              {
                title: "Process Discovery",
                desc: "Automatically discover DFG and Petri-net models from your event logs.",
              },
              {
                title: "Performance Analytics",
                desc: "Case durations, waiting times and activity frequency at a glance.",
              },
              {
                title: "Conformance Checking",
                desc: "Measure fitness and surface deviant cases against the discovered model.",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-slate-800 bg-slate-900/50 p-5"
              >
                <h3 className="font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-sm text-slate-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

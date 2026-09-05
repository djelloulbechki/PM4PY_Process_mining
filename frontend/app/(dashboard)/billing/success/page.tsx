"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useOrgStore } from "@/lib/store";
import { api } from "@/lib/api";
import { Card, Button } from "@/components/ui";
import { CheckCircle, Loader2 } from "lucide-react";

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const { organizationId } = useOrgStore();
  const [account, setAccount] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) return;

    async function load() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      try {
        // Wait a moment for webhook to process
        await new Promise((r) => setTimeout(r, 2000));
        const acc = await api.getBillingAccount(organizationId!, session.access_token);
        setAccount(acc);
      } catch (e: any) {
        setError(e.message);
      }
      setLoading(false);
    }

    load();
  }, [organizationId, sessionId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
        <p className="text-slate-400 mt-4">Confirming your payment…</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto py-12 text-center space-y-6">
      <CheckCircle className="h-16 w-16 text-emerald-400 mx-auto" />
      <h1 className="text-2xl font-bold text-white">Payment successful!</h1>
      <p className="text-slate-400">
        Your credits have been added to your account.
        You can now run process analyses.
      </p>

      {account && (
        <Card>
          <p className="text-slate-400 text-sm">Available credits</p>
          <p className="text-4xl font-bold text-white mt-2">
            {account.credits_balance}
          </p>
        </Card>
      )}

      {error && (
        <p className="text-sm text-amber-400 bg-amber-500/10 rounded-lg px-3 py-2">
          Payment received but credits may take a moment to appear.
          Please refresh the page in a few seconds.
        </p>
      )}

      <div className="flex gap-3 justify-center">
        <Link href="/analyses">
          <Button>Run analysis</Button>
        </Link>
        <Link href="/billing">
          <Button variant="secondary">View billing</Button>
        </Link>
      </div>
    </div>
  );
}

export default function BillingSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}

"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrgStore } from "@/lib/store";
import { api } from "@/lib/api";
import { Card, Button } from "@/components/ui";
import { Check, CreditCard } from "lucide-react";
import { formatNumber } from "@/lib/utils";

const TIERS = [
  {
    code: "standard",
    name: "Standard Pass",
    price: 49,
    maxRows: "50,000",
    maxSize: "15 MB",
    features: [
      "Full Process Discovery",
      "Performance Analytics",
      "Bottleneck Intelligence",
    ],
  },
  {
    code: "pro",
    name: "Pro Pass",
    price: 99,
    maxRows: "150,000",
    maxSize: "40 MB",
    features: [
      "Everything in Standard",
      "Advanced Mining",
      "Root Cause Analysis",
    ],
    highlighted: true,
  },
  {
    code: "scale",
    name: "Scale Pass",
    price: 199,
    maxRows: "600,000",
    maxSize: "120 MB",
    features: [
      "Everything in Pro",
      "Full Year Operations",
      "Custom Integrations",
    ],
  },
];

export default function BillingPage() {
  const { organizationId } = useOrgStore();
  const [account, setAccount] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    loadBilling();
  }, [organizationId]);

  async function loadBilling() {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    try {
      const [acc, txns] = await Promise.all([
        api.getBillingAccount(organizationId!, session.access_token),
        api.listTransactions(organizationId!, session.access_token),
      ]);
      setAccount(acc);
      setTransactions(txns.transactions || []);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }

  async function handlePurchase(tier: string) {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    setPurchasing(tier);
    setError(null);

    try {
      const result = await api.createCheckout(
        { organization_id: organizationId!, tier },
        session.access_token
      );
      window.location.href = result.checkout_url;
    } catch (e: any) {
      setError(e.message);
      setPurchasing(null);
    }
  }

  if (loading) {
    return <div className="text-slate-400">Loading billing info…</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Billing</h1>
        <p className="text-slate-400 mt-1">
          Manage your credits and view transaction history
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {account && (
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Available credits</p>
              <p className="text-3xl font-bold text-white mt-1">
                {formatNumber(account.credits_balance)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Total purchased: {formatNumber(account.credits_purchased)}
              </p>
            </div>
            <CreditCard className="h-12 w-12 text-slate-600" />
          </div>
          {account.credits_balance === 0 && (
            <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <p className="text-sm text-amber-400">
                You have no credits. Purchase a pass to start analyzing processes.
              </p>
            </div>
          )}
        </Card>
      )}

      <div>
        <h2 className="font-semibold text-white mb-4">Purchase a pass</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {TIERS.map((tier) => (
            <Card
              key={tier.code}
              className={tier.highlighted ? "border-brand-500" : ""}
            >
              <h3 className="font-semibold text-white">{tier.name}</h3>
              <p className="text-2xl font-bold text-white mt-2">
                ${tier.price}
              </p>
              <p className="text-xs text-slate-500 mt-1">one-time payment</p>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between text-slate-300">
                  <span>Max rows</span>
                  <span>{tier.maxRows}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Max size</span>
                  <span>{tier.maxSize}</span>
                </div>
              </div>
              <ul className="mt-4 space-y-2">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs text-slate-400">
                    <Check className="h-3 w-3 text-brand-400" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                className={`w-full mt-4 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${
                  tier.highlighted
                    ? "bg-brand-600 text-white hover:bg-brand-500"
                    : "bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700"
                }`}
                disabled={purchasing !== null}
                onClick={() => handlePurchase(tier.code)}
              >
                {purchasing === tier.code ? "Redirecting…" : "Buy now"}
              </button>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h2 className="font-semibold text-white mb-4">Transaction history</h2>
        {transactions.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-400">No transactions yet.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {transactions.slice(0, 20).map((txn) => (
              <Card key={txn.id} className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-white">
                    {txn.transaction_type === "purchase" && "Credit purchase"}
                    {txn.transaction_type === "usage" && "Analysis usage"}
                    {txn.transaction_type === "refund" && "Refund"}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {new Date(txn.created_at).toLocaleString()}
                    {txn.tier_name && ` · ${txn.tier_name}`}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={`font-semibold ${
                      txn.credits_amount > 0 ? "text-emerald-400" : "text-slate-300"
                    }`}
                  >
                    {txn.credits_amount > 0 ? "+" : ""}
                    {txn.credits_amount}
                  </p>
                  <p className="text-xs text-slate-500">
                    Balance: {txn.balance_after}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

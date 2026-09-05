import Link from "next/link";
import { Check } from "lucide-react";

const TIERS = [
  {
    code: "standard",
    name: "Standard Pass",
    price: 49,
    maxRows: "50,000",
    maxSize: "15 MB",
    bestFor: "Small datasets / SME",
    features: [
      "Full Process Discovery",
      "Performance Analytics",
      "Bottleneck Intelligence",
      "Rework & Variant Analysis",
    ],
  },
  {
    code: "pro",
    name: "Pro Pass",
    price: 99,
    maxRows: "150,000",
    maxSize: "40 MB",
    bestFor: "Medium datasets / Multi-department",
    features: [
      "Everything in Standard",
      "Advanced Mining",
      "Root Cause Analysis",
      "Priority Support",
    ],
    highlighted: true,
  },
  {
    code: "scale",
    name: "Scale Pass",
    price: 199,
    maxRows: "600,000",
    maxSize: "120 MB",
    bestFor: "Large enterprise logs",
    features: [
      "Everything in Pro",
      "Full Year Operations",
      "Custom Integrations",
      "Dedicated Support",
    ],
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-semibold tracking-tight text-white">
            Process<span className="text-brand-400">Mine</span>
          </Link>
          <div className="flex gap-3">
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

      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">
            Simple, Pay-As-You-Go Pricing
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Buy a pass when you need it. No subscriptions, no hidden fees.
            Each pass gives you one complete process analysis.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {TIERS.map((tier) => (
            <div
              key={tier.code}
              className={`relative rounded-xl border p-6 bg-slate-900/60 ${
                tier.highlighted
                  ? "border-brand-500 ring-2 ring-brand-500/20"
                  : "border-slate-800"
              }`}
            >
              {tier.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-brand-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                    Most Popular
                  </span>
                </div>
              )}
              <div className="mb-6">
                <h3 className="text-xl font-bold text-white">{tier.name}</h3>
                <p className="text-sm text-slate-400 mt-1">{tier.bestFor}</p>
              </div>
              <div className="mb-6">
                <span className="text-4xl font-bold text-white">${tier.price}</span>
                <span className="text-slate-400 ml-2">one-time</span>
              </div>
              <div className="mb-6 space-y-2 text-sm">
                <div className="flex justify-between text-slate-300">
                  <span>Max rows</span>
                  <span className="font-medium">{tier.maxRows}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Max file size</span>
                  <span className="font-medium">{tier.maxSize}</span>
                </div>
              </div>
              <ul className="space-y-3 mb-8">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-slate-300">
                    <Check className="h-4 w-4 text-brand-400 mt-0.5 flex-shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Link href="/signup">
                <button
                  className={`w-full rounded-lg px-4 py-2 text-sm font-medium transition ${
                    tier.highlighted
                      ? "bg-brand-600 text-white hover:bg-brand-500"
                      : "bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700"
                  }`}
                >
                  Get started
                </button>
              </Link>
            </div>
          ))}
        </div>

        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">
            How it works
          </h2>
          <div className="grid md:grid-cols-3 gap-6 max-w-3xl mx-auto">
            <div>
              <div className="text-3xl font-bold text-brand-400 mb-2">1</div>
              <h3 className="font-semibold text-white mb-1">Sign up free</h3>
              <p className="text-sm text-slate-400">
                Create your account and organization in seconds
              </p>
            </div>
            <div>
              <div className="text-3xl font-bold text-brand-400 mb-2">2</div>
              <h3 className="font-semibold text-white mb-1">Buy a pass</h3>
              <p className="text-sm text-slate-400">
                Choose the pass that fits your dataset size
              </p>
            </div>
            <div>
              <div className="text-3xl font-bold text-brand-400 mb-2">3</div>
              <h3 className="font-semibold text-white mb-1">Analyze</h3>
              <p className="text-sm text-slate-400">
                Upload your event log and get instant insights
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

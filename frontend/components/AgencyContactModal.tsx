"use client";
import { Card, Button } from "@/components/ui";
import { X, Send } from "lucide-react";
import { useState } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  suggestions: any[];
}

const AGENCIES = [
  {
    id: "revwa-horizon",
    name: "Revwa Horizon",
    specialty: "Process Automation & Digital Transformation",
    rating: 4.9,
    projects: 127,
    badge: "Certified Partner",
  },
  {
    id: "automate-pro",
    name: "AutomatePro Agency",
    specialty: "n8n & Make.com Workflows",
    rating: 4.7,
    projects: 89,
    badge: "n8n Expert",
  },
  {
    id: "flow-masters",
    name: "Flow Masters",
    specialty: "Enterprise Process Optimization",
    rating: 4.8,
    projects: 156,
    badge: "Enterprise",
  },
];

export function AgencyContactModal({ isOpen, onClose, jobId, suggestions }: Props) {
  const [selectedAgency, setSelectedAgency] = useState<string | null>(null);
  const [message, setMessage] = useState(
    `I completed a process analysis (job ${jobId}) and received ${suggestions?.length || 0} optimization suggestions. I would like help implementing the recommended automations.`
  );
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (!isOpen) return null;

  async function handleSubmit() {
    if (!selectedAgency || !message.trim()) return;
    setSending(true);
    // Placeholder – in production this would call a backend endpoint
    await new Promise((r) => setTimeout(r, 900));
    setSending(false);
    setSent(true);
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card className="max-w-2xl w-full max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-white">Connect with Automation Agency</h2>
            <p className="text-sm text-slate-400 mt-1">
              Get expert implementation of your optimization blueprint
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!sent ? (
          <>
            <div className="space-y-3 mb-6">
              <h3 className="font-semibold text-white text-sm">Select an Agency</h3>
              {AGENCIES.map((agency) => (
                <div
                  key={agency.id}
                  onClick={() => setSelectedAgency(agency.id)}
                  className={`rounded-xl border p-4 cursor-pointer transition ${
                    selectedAgency === agency.id
                      ? "border-brand-500 bg-brand-500/10"
                      : "border-slate-800 hover:border-slate-600"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-white">{agency.name}</p>
                        <span className="text-[10px] bg-brand-500/20 text-brand-400 px-2 py-0.5 rounded-full">
                          {agency.badge}
                        </span>
                      </div>
                      <p className="text-sm text-slate-400 mt-1">{agency.specialty}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                        <span>⭐ {agency.rating}</span>
                        <span>{agency.projects} projects</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Message to Agency
              </label>
              <textarea
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white h-28 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>

            <Button
              onClick={handleSubmit}
              disabled={!selectedAgency || !message.trim() || sending}
            >
              <Send className="h-4 w-4" />
              {sending ? "Sending…" : "Send Request"}
            </Button>
          </>
        ) : (
          <div className="text-center py-10">
            <div className="h-16 w-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
              <Send className="h-8 w-8 text-emerald-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Request Sent!</h3>
            <p className="text-slate-400 max-w-sm mx-auto">
              The agency will review your optimization blueprint and contact you within 24 hours.
            </p>
            <Button onClick={onClose} className="mt-6">
              Close
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

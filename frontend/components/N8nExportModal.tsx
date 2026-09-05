"use client";
import { Card, Button } from "@/components/ui";
import { X, Download, Copy, Check } from "lucide-react";
import { useState } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  blueprint: any;
}

export function N8nExportModal({ isOpen, onClose, blueprint }: Props) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const jsonStr = JSON.stringify(blueprint, null, 2);

  function handleDownload() {
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "processmine-optimization-workflow.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleCopy() {
    navigator.clipboard.writeText(jsonStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card className="max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">n8n Workflow Blueprint</h2>
            <p className="text-sm text-slate-400 mt-1">
              Import this JSON into your n8n instance
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-slate-950 rounded-lg p-4 font-mono text-xs text-slate-300 border border-slate-800">
          <pre className="whitespace-pre-wrap break-all">{jsonStr}</pre>
        </div>

        <div className="flex gap-3 mt-4 flex-wrap">
          <Button onClick={handleCopy} variant="secondary">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied!" : "Copy JSON"}
          </Button>
          <Button onClick={handleDownload}>
            <Download className="h-4 w-4" /> Download .json
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="mt-4 p-3 bg-brand-500/10 border border-brand-500/20 rounded-lg">
          <p className="text-xs text-brand-300">
            <strong>How to import:</strong> Open n8n → Workflows → Import from File →
            Select the downloaded JSON → Configure credentials (email/Slack) → Activate
          </p>
        </div>
      </Card>
    </div>
  );
}

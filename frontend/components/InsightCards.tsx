"use client";
import { Card, Badge } from "@/components/ui";
import { AlertTriangle, Clock, Zap, ShieldAlert } from "lucide-react";

interface Props {
  suggestions: any[];
}

const typeIcons: Record<string, any> = {
  bottleneck: Clock,
  rework: AlertTriangle,
  sla: ShieldAlert,
  volume: Zap,
  waiting_time: Clock,
};

export function InsightCards({ suggestions }: Props) {
  if (!suggestions || suggestions.length === 0) {
    return (
      <Card>
        <p className="text-slate-400 text-sm">
          No optimization suggestions at this time. Your process looks healthy!
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="font-semibold text-white mb-3 text-sm uppercase tracking-wide text-slate-400">
        Optimization Suggestions
      </h2>
      {suggestions.map((s) => {
        const Icon = typeIcons[s.type] || AlertTriangle;
        const tone =
          s.severity === "critical"
            ? "danger"
            : s.severity === "high"
            ? "warning"
            : "info";
        return (
          <Card
            key={s.id}
            className="hover:border-slate-600 transition cursor-default group"
          >
            <div className="flex items-start justify-between mb-2 gap-2">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-slate-800 flex items-center justify-center group-hover:bg-slate-700 transition">
                  <Icon className="h-3.5 w-3.5 text-slate-300" />
                </div>
                <Badge tone={tone as any}>{s.severity}</Badge>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-slate-500">
                {s.type}
              </span>
            </div>
            <h3 className="font-medium text-white text-sm mb-1 leading-snug">
              {s.title}
            </h3>
            <p className="text-xs text-slate-400 mb-3 leading-relaxed">
              {s.description}
            </p>
            <div className="pt-2 border-t border-slate-800/80">
              <p className="text-xs text-emerald-400 font-medium">
                💡 {s.impact}
              </p>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

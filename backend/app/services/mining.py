"""Production-oriented process intelligence engine.

The engine intentionally keeps raw events out of the API response.  It produces
compact, explainable analytics that can be rendered by the UI and persisted as
an immutable result artifact.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any

import pandas as pd
import pm4py
from pm4py.algo.conformance.tokenreplay import algorithm as token_replay
from pm4py.algo.discovery.inductive import algorithm as inductive_miner

SUPPORTED_MODULES = {
    "process_discovery",
    "performance_analytics",
    "conformance_checking",
    "process_intelligence",
}


def _require_columns(df: pd.DataFrame, case_col: str, act_col: str, time_col: str) -> None:
    missing = [c for c in (case_col, act_col, time_col) if c not in df.columns]
    if missing:
        raise ValueError("Required event-log columns are missing: " + ", ".join(missing))


def _prepare_log(df: pd.DataFrame, case_col: str, act_col: str, time_col: str):
    df = df.copy()
    df[case_col] = df[case_col].astype("string").str.strip()
    df[act_col] = df[act_col].astype("string").str.strip()
    df[time_col] = pd.to_datetime(df[time_col], errors="coerce", utc=True)
    df = df.dropna(subset=[case_col, act_col, time_col])
    df = df[df[case_col] != ""]
    df = df[df[act_col] != ""]
    df = df.sort_values([case_col, time_col], kind="stable")
    if df.empty:
        raise ValueError("No valid events remain after timestamp/value validation.")
    formatted = pm4py.format_dataframe(df, case_id=case_col, activity_key=act_col, timestamp_key=time_col)
    return pm4py.convert_to_event_log(formatted), df


def execute_mining_module(
    module_type: str,
    df: pd.DataFrame,
    case_col: str,
    act_col: str,
    time_col: str,
    amount_col: str | None = None,
    resource_col: str | None = None,
    sla_hours: float | None = None,
) -> dict[str, Any]:
    if module_type not in SUPPORTED_MODULES:
        raise ValueError("Unsupported analysis module.")
    _require_columns(df, case_col, act_col, time_col)
    event_log, clean_df = _prepare_log(df, case_col, act_col, time_col)

    if module_type == "process_discovery":
        return _process_discovery(event_log)
    if module_type == "performance_analytics":
        return _performance_analytics(event_log, clean_df, case_col, act_col, time_col)
    if module_type == "conformance_checking":
        return _conformance_checking(event_log)
    return _process_intelligence(clean_df, case_col, act_col, time_col, amount_col, resource_col, sla_hours)


def _process_discovery(event_log) -> dict[str, Any]:
    dfg, starts, ends = pm4py.discover_dfg(event_log)
    net_summary = None
    try:
        net, im, fm = inductive_miner.apply(event_log)
        net_summary = {
            "transitions": [{"name": t.name or t.label or str(t), "label": t.label} for t in list(net.transitions)[:200]],
            "places": [{"name": p.name} for p in list(net.places)[:200]],
            "arcs": [{"source": str(a.source), "target": str(a.target)} for a in list(net.arcs)[:500]],
        }
    except Exception:
        pass
    return {
        "type": "process_discovery",
        "dfg": [{"source": str(s), "target": str(t), "count": int(c)} for (s, t), c in dfg.items()],
        "start_activities": {str(k): int(v) for k, v in starts.items()},
        "end_activities": {str(k): int(v) for k, v in ends.items()},
        "petri_net": net_summary,
    }


def _safe_stats(values) -> dict[str, Any]:
    s = pd.Series(values, dtype="float64").dropna()
    if s.empty:
        return {"count": 0, "mean": None, "median": None, "p95": None, "max": None}
    return {"count": int(len(s)), "mean": round(float(s.mean()), 2), "median": round(float(s.median()), 2),
            "p95": round(float(s.quantile(.95)), 2), "max": round(float(s.max()), 2)}


def _performance_analytics(event_log, df, case_col, act_col, time_col):
    case_times = df.groupby(case_col)[time_col].agg(["min", "max"])
    case_times["duration_sec"] = (case_times["max"] - case_times["min"]).dt.total_seconds()
    ordered = df.sort_values([case_col, time_col], kind="stable").copy()
    ordered["prev_time"] = ordered.groupby(case_col)[time_col].shift(1)
    ordered["wait_sec"] = (ordered[time_col] - ordered["prev_time"]).dt.total_seconds()
    return {
        "type": "performance_analytics", "status": "ok",
        "case_duration_seconds": _safe_stats(case_times["duration_sec"]),
        "waiting_time_seconds": _safe_stats(ordered["wait_sec"]),
        "activity_frequency": {str(k): int(v) for k, v in df[act_col].value_counts().head(50).items()},
        "total_cases": int(df[case_col].nunique()), "total_events": int(len(df)),
        "unique_activities": int(df[act_col].nunique()),
    }


def _conformance_checking(event_log):
    try:
        tree = inductive_miner.apply(event_log)
        net, im, fm = pm4py.convert_to_petri_net(tree)
        replayed = token_replay.apply(event_log, net, im, fm)
    except Exception as exc:
        return {"type": "conformance_checking", "status": "error", "message": f"Conformance analysis failed: {exc}", "results": {}}
    fitness = [float(x["trace_fitness"]) for x in replayed if "trace_fitness" in x]
    deviant = [{"index": i, "fitness": round(float(x.get("trace_fitness", 0)), 4), "is_fit": bool(x.get("trace_is_fit", False))}
               for i, x in enumerate(replayed) if x.get("trace_fitness", 1) < .95][:50]
    return {"type": "conformance_checking", "status": "ok", "results": {
        "average_fitness": round(sum(fitness) / len(fitness), 4) if fitness else 0,
        "fit_traces": sum(1 for x in replayed if x.get("trace_is_fit")),
        "total_traces": len(replayed), "deviant_sample": deviant,
    }}


def _duration_hours(df: pd.DataFrame, case_col: str, time_col: str) -> pd.Series:
    grouped = df.groupby(case_col)[time_col].agg(["min", "max"])
    return (grouped["max"] - grouped["min"]).dt.total_seconds() / 3600.0


def _process_intelligence(df, case_col, act_col, time_col, amount_col, resource_col, sla_hours):
    """Executive process intelligence: bottlenecks, rework, variants, SLA, cost and opportunities."""
    work = df.sort_values([case_col, time_col], kind="stable").copy()
    work["prev_activity"] = work.groupby(case_col)[act_col].shift(1)
    work["prev_time"] = work.groupby(case_col)[time_col].shift(1)
    work["wait_hours"] = (work[time_col] - work["prev_time"]).dt.total_seconds() / 3600.0

    # Transition-level waiting time is the most actionable bottleneck metric.
    transitions = work.dropna(subset=["prev_activity", "wait_hours"]).copy()
    by_transition = transitions.groupby(["prev_activity", act_col])["wait_hours"].agg(["count", "mean", "median"])
    by_transition = by_transition.sort_values("mean", ascending=False).head(50)
    bottlenecks = [{"from": str(a), "to": str(b), "events": int(r["count"]),
                    "avg_wait_hours": round(float(r["mean"]), 2), "median_wait_hours": round(float(r["median"]), 2)}
                   for (a, b), r in by_transition.iterrows()]

    # Rework = repeated activity within the same case.
    repeats = work.groupby([case_col, act_col]).size().reset_index(name="n")
    repeated_cases = int(repeats.loc[repeats.n > 1, case_col].nunique())
    total_cases = int(work[case_col].nunique())
    rework_rate = repeated_cases / total_cases if total_cases else 0
    top_rework = repeats[repeats.n > 1].groupby(act_col)["n"].sum().sort_values(ascending=False).head(20)

    # Variant fingerprint is compact and deterministic.
    traces = work.groupby(case_col)[act_col].apply(lambda s: tuple(map(str, s.tolist())))
    variant_counts = traces.value_counts()
    variants = [{"rank": i + 1, "frequency": int(n), "share": round(float(n / total_cases), 4),
                 "path": list(path)} for i, (path, n) in enumerate(variant_counts.head(30).items())]

    case_duration = _duration_hours(work, case_col, time_col)
    median_duration = float(case_duration.median()) if not case_duration.empty else 0
    p95_duration = float(case_duration.quantile(.95)) if not case_duration.empty else 0

    sla = None
    if sla_hours is not None and sla_hours > 0:
        breaches = int((case_duration > sla_hours).sum())
        sla = {"target_hours": float(sla_hours), "breaches": breaches,
               "compliance_rate": round(1 - breaches / total_cases, 4) if total_cases else 1}

    financial = None
    if amount_col and amount_col in work.columns:
        amounts = pd.to_numeric(work[amount_col], errors="coerce")
        case_amount = work.assign(__amount=amounts).groupby(case_col)["__amount"].max().dropna()
        # We deliberately call this exposure, not savings: no unsupported ROI claim is invented.
        financial = {"amount_column": amount_col, "cases_with_amount": int(case_amount.size),
                     "total_amount": round(float(case_amount.sum()), 2),
                     "median_case_amount": round(float(case_amount.median()), 2) if not case_amount.empty else None}

    resource = None
    if resource_col and resource_col in work.columns:
        resource = {"column": resource_col,
                    "top_resources": [{"name": str(k), "events": int(v)} for k, v in work[resource_col].value_counts().head(20).items()]}

    opportunities = []
    for b in bottlenecks[:10]:
        score = b["events"] * b["avg_wait_hours"]
        opportunities.append({"type": "waiting_time", "title": f"Reduce {b['from']} → {b['to']} waiting time",
                              "evidence": b, "priority_score": round(float(score), 2)})
    for activity, n in top_rework.items():
        opportunities.append({"type": "rework", "title": f"Investigate repeated '{activity}'",
                              "evidence": {"activity": str(activity), "repeated_events": int(n)},
                              "priority_score": round(float(n * max(median_duration, 1)), 2)})
    if sla:
        opportunities.append({"type": "sla", "title": "Reduce SLA breaches", "evidence": sla,
                              "priority_score": round(float(sla["breaches"]), 2)})
    opportunities.sort(key=lambda x: x["priority_score"], reverse=True)

    # Health is a diagnostic score, not a claim of financial performance.
    health = 100.0
    health -= min(35, rework_rate * 100 * .8)
    if sla: health -= min(30, (1 - sla["compliance_rate"]) * 100 * .6)
    if p95_duration > max(median_duration * 2, 1): health -= 15
    health = max(0, min(100, health))

    return {
        "type": "process_intelligence", "status": "ok", "schema_version": "2.0",
        "executive_summary": {
            "process_health_score": round(health, 1), "cases": total_cases, "events": int(len(work)),
            "activities": int(work[act_col].nunique()), "variants": int(len(variant_counts)),
            "median_cycle_time_hours": round(median_duration, 2), "p95_cycle_time_hours": round(p95_duration, 2),
            "rework_rate": round(rework_rate, 4),
        },
        "bottlenecks": bottlenecks, "rework": {"cases_affected": repeated_cases, "rate": round(rework_rate, 4),
                                                   "top_activities": [{"activity": str(k), "repeated_events": int(v)} for k, v in top_rework.items()]},
        "variants": variants, "sla": sla, "financial": financial, "resource": resource,
        "opportunities": opportunities[:20],
    }

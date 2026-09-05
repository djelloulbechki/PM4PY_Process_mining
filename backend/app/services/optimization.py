"""
Optimization Engine — Rule-based process improvement suggestions.
NO AI/LLM required. All suggestions are deterministic from PM4Py outputs.
"""
from __future__ import annotations

from typing import Any


def generate_optimization_suggestions(process_data: dict[str, Any]) -> dict[str, Any]:
    """
    Generate optimization suggestions from process intelligence data.
    Returns: suggestions, flow_diagram, n8n_blueprint
    """
    exec_summary = process_data.get("executive_summary", {}) or process_data.get("summary", {})
    bottlenecks = process_data.get("bottlenecks", []) or process_data.get("top_bottlenecks", [])
    rework = process_data.get("rework", {}) or {}
    sla = process_data.get("sla")
    opportunities = process_data.get("opportunities", []) or process_data.get("improvement_opportunities", [])

    # Normalize bottleneck shape (support both list of dicts with from/to or activity pairs)
    normalized_bottlenecks = []
    for b in bottlenecks:
        if isinstance(b, dict):
            if "from" in b and "to" in b:
                normalized_bottlenecks.append(b)
            elif "source" in b and "target" in b:
                normalized_bottlenecks.append({
                    "from": b["source"],
                    "to": b["target"],
                    "avg_wait_hours": b.get("avg_wait_hours") or b.get("waiting_time") or b.get("avg_duration_hours") or 0,
                    "events": b.get("events") or b.get("count") or b.get("frequency") or 1,
                })
            elif "activity" in b:
                normalized_bottlenecks.append({
                    "from": b["activity"],
                    "to": b.get("next_activity", "Next"),
                    "avg_wait_hours": b.get("avg_wait_hours") or b.get("waiting_time") or 0,
                    "events": b.get("events") or b.get("count") or 1,
                })

    suggestions = []
    flow_nodes = []
    flow_edges = []
    n8n_nodes = []

    # ──────────────────────────────────────────────────────────────
    # 1. Bottleneck Suggestions
    # ──────────────────────────────────────────────────────────────
    for i, b in enumerate(normalized_bottlenecks[:5]):
        avg_wait = float(b.get("avg_wait_hours") or 0)
        events = int(b.get("events") or 1)
        from_act = str(b.get("from", "Unknown"))
        to_act = str(b.get("to", "Unknown"))
        if avg_wait > 0.5:  # significant enough
            severity = "high" if avg_wait > 8 else ("medium" if avg_wait > 2 else "low")
            suggestion = {
                "id": f"bottleneck_{i}",
                "type": "bottleneck",
                "severity": severity,
                "title": f"Reduce waiting time: {from_act} → {to_act}",
                "description": f"Average wait time is {avg_wait:.1f} hours ({events} events affected).",
                "impact": f"Potential time savings: {avg_wait * events:.0f} hours",
                "action": "automate_handoff",
                "automation_type": "notification_trigger",
                "from_activity": from_act,
                "to_activity": to_act,
            }
            suggestions.append(suggestion)

            # Add to flow diagram
            flow_nodes.append({
                "id": f"node_{i}",
                "type": "action",
                "position": {"x": 80, "y": 80 + i * 160},
                "data": {
                    "label": from_act,
                    "type": "process_step",
                    "metric": f"{avg_wait:.1f}h wait",
                },
            })
            flow_nodes.append({
                "id": f"node_{i}_auto",
                "type": "automation",
                "position": {"x": 380, "y": 80 + i * 160},
                "data": {
                    "label": "Auto-notify / Escalate",
                    "type": "automation",
                    "tool": "email / slack / n8n",
                },
            })
            flow_edges.append({
                "id": f"edge_{i}",
                "source": f"node_{i}",
                "target": f"node_{i}_auto",
                "animated": True,
                "style": {"stroke": "#f59e0b", "strokeWidth": 2},
                "label": f"{avg_wait:.1f}h",
            })

            n8n_nodes.append({
                "parameters": {
                    "httpMethod": "POST",
                    "path": f"webhook-{from_act.lower().replace(' ', '-')[:40]}",
                },
                "name": f"Trigger: {from_act}",
                "type": "n8n-nodes-base.webhook",
                "position": [100, 100 + i * 200],
            })

    # ──────────────────────────────────────────────────────────────
    # 2. Rework Suggestions
    # ──────────────────────────────────────────────────────────────
    rework_rate = float(rework.get("rate") or rework.get("rework_rate") or 0)
    if rework_rate > 0.05:
        top_activities = rework.get("top_activities") or rework.get("activities") or []
        if not top_activities and isinstance(rework.get("top_rework_activities"), list):
            top_activities = rework["top_rework_activities"]
        for i, act in enumerate(top_activities[:3]):
            if isinstance(act, str):
                act = {"activity": act, "repeated_events": 1}
            act_name = act.get("activity") or act.get("name") or "Unknown"
            repeated = act.get("repeated_events") or act.get("count") or 1
            suggestion = {
                "id": f"rework_{i}",
                "type": "rework",
                "severity": "high" if rework_rate > 0.25 else "medium",
                "title": f"Eliminate rework in '{act_name}'",
                "description": f"{repeated} repeated events detected. Add validation rules before this step.",
                "impact": f"Reduce rework rate from {rework_rate*100:.1f}%",
                "action": "add_validation",
                "automation_type": "data_validation",
            }
            suggestions.append(suggestion)

            flow_nodes.append({
                "id": f"rework_node_{i}",
                "type": "action",
                "position": {"x": 80, "y": 80 + (len(normalized_bottlenecks) + i) * 160},
                "data": {
                    "label": act_name,
                    "type": "rework",
                    "metric": f"{repeated} repeats",
                },
            })
            flow_nodes.append({
                "id": f"rework_auto_{i}",
                "type": "automation",
                "position": {"x": 380, "y": 80 + (len(normalized_bottlenecks) + i) * 160},
                "data": {
                    "label": "Validate before proceed",
                    "type": "automation",
                    "tool": "rules / form validation",
                },
            })
            flow_edges.append({
                "id": f"rework_edge_{i}",
                "source": f"rework_node_{i}",
                "target": f"rework_auto_{i}",
                "animated": True,
                "style": {"stroke": "#ef4444", "strokeWidth": 2},
            })

    # ──────────────────────────────────────────────────────────────
    # 3. SLA Breach Suggestions
    # ──────────────────────────────────────────────────────────────
    if sla and isinstance(sla, dict):
        compliance = float(sla.get("compliance_rate") or sla.get("compliance") or 1)
        if compliance < 0.9:
            breaches = sla.get("breaches") or sla.get("breach_count") or 0
            target = sla.get("target_hours") or sla.get("target") or "?"
            suggestion = {
                "id": "sla_breach",
                "type": "sla",
                "severity": "critical",
                "title": f"Fix SLA breaches ({breaches} cases)",
                "description": f"Only {compliance*100:.1f}% compliance. Target: {target}h",
                "impact": f"{breaches} cases need escalation automation",
                "action": "escalation_workflow",
                "automation_type": "sla_monitoring",
            }
            suggestions.append(suggestion)

    # ──────────────────────────────────────────────────────────────
    # 4. Opportunities from process intelligence
    # ──────────────────────────────────────────────────────────────
    for i, opp in enumerate(opportunities[:4]):
        if isinstance(opp, dict):
            title = opp.get("title") or opp.get("description") or opp.get("name") or f"Opportunity {i+1}"
            priority = opp.get("priority_score") or opp.get("priority") or 0
            opp_type = opp.get("type") or "waiting_time"
            suggestion = {
                "id": f"opp_{i}",
                "type": opp_type if opp_type in ("bottleneck", "rework", "sla", "volume") else "volume",
                "severity": "high" if float(priority) > 40 else "medium",
                "title": str(title)[:120],
                "description": opp.get("description") or opp.get("detail") or "Improvement opportunity detected from process data.",
                "impact": f"Priority score {priority}",
                "action": "automate_step",
                "automation_type": "notification_trigger",
            }
            # Avoid exact duplicates
            if not any(s["title"] == suggestion["title"] for s in suggestions):
                suggestions.append(suggestion)

    # ──────────────────────────────────────────────────────────────
    # 5. High-Volume Manual Tasks
    # ──────────────────────────────────────────────────────────────
    total_events = int(exec_summary.get("events") or exec_summary.get("total_events") or 0)
    if total_events > 500 and not any(s["id"] == "high_volume" for s in suggestions):
        suggestion = {
            "id": "high_volume",
            "type": "volume",
            "severity": "medium",
            "title": f"Automate high-volume process ({total_events} events)",
            "description": "High event volume suggests repetitive manual work suitable for automation.",
            "impact": f"Save ~{int(total_events * 0.25)} hours/month (25% automation estimate)",
            "action": "full_automation",
            "automation_type": "end_to_end",
        }
        suggestions.append(suggestion)

    # ──────────────────────────────────────────────────────────────
    # Build n8n Blueprint
    # ──────────────────────────────────────────────────────────────
    n8n_blueprint = _build_n8n_blueprint(suggestions, n8n_nodes)

    # Estimate savings (best-effort parse)
    estimated_hours = 0.0
    for s in suggestions:
        impact = s.get("impact", "")
        if "hours" in impact.lower():
            try:
                # extract first number
                import re
                nums = re.findall(r"[\d.]+", impact)
                if nums:
                    estimated_hours += float(nums[0])
            except Exception:
                pass

    return {
        "suggestions": suggestions,
        "flow_diagram": {
            "nodes": flow_nodes,
            "edges": flow_edges,
        },
        "n8n_blueprint": n8n_blueprint,
        "summary": {
            "total_suggestions": len(suggestions),
            "high_severity": sum(1 for s in suggestions if s["severity"] == "high"),
            "critical": sum(1 for s in suggestions if s["severity"] == "critical"),
            "estimated_savings_hours": round(estimated_hours, 1),
        },
    }


def _build_n8n_blueprint(suggestions: list[dict], nodes: list[dict]) -> dict[str, Any]:
    """
    Generate n8n workflow JSON from suggestions.
    Deterministic template-based generator.
    """
    n8n_nodes = []
    n8n_connections: dict[str, Any] = {}

    # Start with webhook trigger
    n8n_nodes.append({
        "parameters": {
            "httpMethod": "POST",
            "path": "process-optimization-trigger",
            "responseMode": "onReceived",
        },
        "name": "Process Trigger",
        "type": "n8n-nodes-base.webhook",
        "typeVersion": 1,
        "position": [250, 300],
        "id": "trigger_1",
    })

    # Condition node
    n8n_nodes.append({
        "parameters": {
            "conditions": {
                "number": [
                    {
                        "value1": "={{$json[\"severity_score\"]}}",
                        "operation": "largerEqual",
                        "value2": 2,
                    }
                ],
            },
        },
        "name": "Check Severity",
        "type": "n8n-nodes-base.if",
        "typeVersion": 1,
        "position": [450, 300],
        "id": "condition_1",
    })

    y_offset = 100
    action_names = []
    for i, suggestion in enumerate(suggestions[:4]):
        action_type = suggestion.get("automation_type", "notification")
        name = f"Action {i+1}: {suggestion.get('type', 'alert')}"

        if action_type == "notification_trigger":
            n8n_nodes.append({
                "parameters": {
                    "subject": f"Action Required: {suggestion.get('title', 'Process alert')}",
                    "emailType": "text",
                    "message": f"Process issue detected: {suggestion.get('description', '')}",
                },
                "name": name,
                "type": "n8n-nodes-base.emailSend",
                "typeVersion": 1,
                "position": [700, y_offset],
                "id": f"action_{i}",
            })
        elif action_type == "data_validation":
            n8n_nodes.append({
                "parameters": {
                    "method": "POST",
                    "url": "={{$json[\"validation_endpoint\"]}}",
                    "sendBody": True,
                    "bodyParameters": {
                        "parameters": [
                            {"name": "case_id", "value": "={{$json[\"case_id\"]}}"},
                        ],
                    },
                },
                "name": name,
                "type": "n8n-nodes-base.httpRequest",
                "typeVersion": 1,
                "position": [700, y_offset],
                "id": f"action_{i}",
            })
        else:
            n8n_nodes.append({
                "parameters": {
                    "channel": "#process-alerts",
                    "text": f"Process Alert: {suggestion.get('title', '')}",
                },
                "name": name,
                "type": "n8n-nodes-base.slack",
                "typeVersion": 1,
                "position": [700, y_offset],
                "id": f"action_{i}",
            })
        action_names.append(name)
        y_offset += 180

    # Connections
    n8n_connections = {
        "Process Trigger": {
            "main": [[{"node": "Check Severity", "type": "main", "index": 0}]]
        },
        "Check Severity": {
            "main": [
                [{"node": action_names[0], "type": "main", "index": 0}] if action_names else [],
                [],
            ]
        },
    }
    # chain remaining actions simply from true branch for template usability
    for i in range(1, len(action_names)):
        prev = action_names[i - 1]
        n8n_connections[prev] = {
            "main": [[{"node": action_names[i], "type": "main", "index": 0}]]
        }

    return {
        "name": "ProcessMine Optimization Workflow",
        "nodes": n8n_nodes,
        "connections": n8n_connections,
        "active": False,
        "settings": {"executionOrder": "v1"},
        "versionId": "1",
        "meta": {
            "templateCredsSetupCompleted": False,
            "instanceId": "generated_by_processmine",
            "generated_from": "process_intelligence",
        },
    }

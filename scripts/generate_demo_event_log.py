import csv
from datetime import datetime, timedelta, timezone
from pathlib import Path

out = Path(__file__).resolve().parent.parent / "demo_event_log.csv"
rows = []
for i in range(1, 501):
    base = datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(hours=i % 240)
    amount = 500 + (i * 137) % 50000
    path = ["Create", "Approve", "Pay"] if i % 7 else ["Create", "Approve", "Approve", "Pay"]
    for n, activity in enumerate(path):
        delay = {"Create": 0, "Approve": 1 + (i % 24), "Pay": 2 + (i % 48)}[activity]
        rows.append({"case_id": f"PO-{i:05d}", "activity": activity, "timestamp": (base + timedelta(hours=delay + n * 0.25)).isoformat(), "amount": amount, "resource": ["Procurement", "Finance", "AP"][n if n < 3 else 1]})
with out.open("w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=rows[0].keys())
    w.writeheader(); w.writerows(rows)
print(out)

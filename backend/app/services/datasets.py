import io
import re
from typing import BinaryIO, Any

import pandas as pd


def safe_filename(filename: str) -> str:
    name = filename.strip().replace("\\", "_").replace("/", "_")
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", name)
    return name[:180] or "dataset.csv"


def preview_csv(
    stream: BinaryIO, max_bytes: int, rows: int = 10
) -> tuple[list[str], list[dict[str, Any]], int | None]:
    data = stream.read(max_bytes + 1)
    if not data:
        raise ValueError("Empty file.")

    data = data[:max_bytes]

    try:
        df = pd.read_csv(io.BytesIO(data), nrows=rows)
    except Exception as exc:
        raise ValueError("Unable to parse CSV structure.") from exc

    preview = (
        df.head(5)
        .where(pd.notnull(df), None)
        .astype(object)
        .to_dict(orient="records")
    )
    for row in preview:
        for k, v in list(row.items()):
            if pd.isna(v):
                row[k] = None
            elif hasattr(v, "item"):
                try:
                    row[k] = v.item()
                except Exception:
                    row[k] = str(v)
            elif not isinstance(v, (str, int, float, bool, type(None))):
                row[k] = str(v)

    return list(df.columns), preview, None


def validate_columns(
    columns: list[str],
    case_column: str,
    activity_column: str,
    timestamp_column: str,
) -> None:
    required = [case_column, activity_column, timestamp_column]
    missing = [c for c in required if c not in columns]
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(missing)}")


def preview_tabular(stream: BinaryIO, filename: str, max_bytes: int, rows: int = 15):
    data = stream.read(max_bytes + 1)
    if not data:
        raise ValueError("Empty file.")
    if len(data) > max_bytes:
        raise ValueError("Preview file exceeds configured preview size.")
    try:
        if filename.lower().endswith(".xlsx"):
            df = pd.read_excel(io.BytesIO(data), nrows=rows, engine="openpyxl")
        else:
            df = pd.read_csv(io.BytesIO(data), nrows=rows)
    except Exception as exc:
        raise ValueError("Unable to parse CSV/XLSX structure.") from exc
    preview = df.head(rows).where(pd.notnull(df), None).astype(object).to_dict(orient="records")
    for row in preview:
        for k, v in list(row.items()):
            if pd.isna(v): row[k] = None
            elif hasattr(v, "item"):
                try: row[k] = v.item()
                except Exception: row[k] = str(v)
            elif not isinstance(v, (str, int, float, bool, type(None))): row[k] = str(v)
    return list(map(str, df.columns)), preview, None

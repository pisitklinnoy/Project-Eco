"""Read-only source probe. No database writes or notifications."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from services.rid_source import fetch_rid_history

rows = fetch_rid_history()
for code in ("STN-MUANGKONG", "STN-BANGSALA", "STN-HATYAINAI"):
    station = [row for row in rows if row["station_code"] == code]
    print(code, "hours:", len(station), "latest:", max((row["time"] for row in station), default="missing"))

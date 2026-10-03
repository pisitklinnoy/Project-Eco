"""Read RID hourly reports and verify station-column mapping before ingestion."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
import requests
from hatyai_timeseries import ForecastInputError
from services.timeseries_inputs import STATION_MAPPING

BANGKOK = ZoneInfo("Asia/Bangkok")
RID_BASE = "https://hyd-app-db.rid.go.th/webservice/"


def fetch_rid_history(now=None):
    now = now or datetime.now(BANGKOK)
    session = requests.Session()
    session.headers["User-Agent"] = "HatyaiFloodLens/2.0 experimental-shadow"

    def post(endpoint, **kwargs):
        response = session.post(RID_BASE + endpoint, timeout=(5, 15), **kwargs)
        response.raise_for_status()
        return response.json()

    def thai_date(day):
        return f"{day:%d/%m}/{day.year + 543}"

    try:
        metadata = post("HDService.svc/GetColModelAllHL", json={"hydro": {"UtokID": 8, "BasinID": 23, "TimeCurrent": thai_date(now.date())}})
        codes = [item["titleText"].strip() for item in metadata["groupHeadersStationCode"]]
        if len(codes) != len(set(codes)):
            raise ForecastInputError("RID returned duplicate station columns")
        positions = {code: i + 1 for i, code in enumerate(codes)}
        if not all(code in positions for code in STATION_MAPPING.values()):
            raise ForecastInputError("RID station mapping cannot be verified")
        rows = []
        for offset in (2, 1, 0):
            day = now.date() - timedelta(days=offset)
            payload = post("getGroupHourlyWaterLevelReportAllHL.ashx", data={
                "DW[UtokID]": "8", "DW[BasinID]": "23", "DW[TimeCurrent]": thai_date(day),
                "page": "1", "rows": "100", "sidx": "indexhourly", "sord": "asc",
            })
            reports = payload.get("rows", [])
            raw_hours = [float(row["hourlytime"]) for row in reports]
            if any(not hour.is_integer() for hour in raw_hours):
                raise ForecastInputError("RID returned a non-integer report hour")
            hours = [int(hour) for hour in raw_hours]
            if sorted(hours) != list(range(1, 25)):
                raise ForecastInputError("RID returned an unexpected hourly grid")
            for row, hour in zip(reports, hours):
                timestamp = datetime.combine(day, datetime.min.time(), tzinfo=BANGKOK) + timedelta(hours=hour)
                if timestamp > now:
                    continue
                for ecosystem, model in STATION_MAPPING.items():
                    value = pd.to_numeric(str(row.get(f"wlvalues{positions[model]}", "")).replace(",", ""), errors="coerce")
                    if np.isfinite(value) and value not in (-999, 9999, 999999):
                        rows.append({"station_code": ecosystem, "time": timestamp.isoformat(), "water_level": float(value)})
        return rows
    except (requests.RequestException, KeyError, TypeError, ValueError) as exc:
        raise ForecastInputError(f"RID input unavailable: {exc}") from exc
    finally:
        session.close()

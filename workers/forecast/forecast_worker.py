"""ARQ scheduling delegates to the same inference/persistence service used by the UI."""
import asyncio
import logging
import os

import requests

logger = logging.getLogger(__name__)
STATIONS = ["STN-MUANGKONG", "STN-BANGSALA", "STN-HATYAINAI"]


def _run_forecasts(station_code=None):
    base = os.getenv("BACKEND_API_URL", "http://backend:8000").rstrip("/")
    family = os.getenv("FORECAST_MODEL_FAMILY", "delta")
    results = {}
    for station in ([station_code] if station_code else STATIONS):
        try:
            response = requests.post(base + "/api/v1/forecast/trigger", params={"station_code": station, "mode": "shadow", "family": family}, timeout=(5, 60))
            response.raise_for_status()
            record = response.json()
            results[station] = {"status": "forecast_saved", "record_id": record["id"], "quality": record["data_quality_status"]}
        except (requests.RequestException, ValueError) as exc:
            logger.warning("Forecast unavailable for %s: %s", station, exc)
            results[station] = {"status": "unavailable", "reason": str(exc)}
    return results


async def run_periodic_forecast(ctx, station_code=None):
    return await asyncio.to_thread(_run_forecasts, station_code)

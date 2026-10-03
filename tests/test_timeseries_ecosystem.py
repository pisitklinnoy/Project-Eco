import asyncio
import hashlib
import json
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch

import pandas as pd
import pytest
import requests
from sqlalchemy import create_engine, inspect, text

from core.schema_migrations import upgrade_timeseries_schema
from models.forecast import ForecastRecord
from models.measurement import WaterMeasurement, RainfallMeasurement
from services.forecast_service import forecast_service
from services.timeseries_inputs import STATION_MAPPING, VERIFIED_WATER_SOURCE, VERIFIED_RAIN_SOURCE
from services.telemetry_service import telemetry_service
from services.rid_source import fetch_rid_history, BANGKOK
from forecast.forecast_worker import run_periodic_forecast
from conftest import ROOT

SAMPLE = pd.read_csv(ROOT / "TimeSeries-Integration/examples/observations.csv")
REFERENCE = json.loads((ROOT / "TimeSeries-Integration/examples/reference_predictions.json").read_text())


def replay_body():
    return {"issue_time": "2025-01-10T00:00:00+07:00", "observations": SAMPLE.astype(object).where(pd.notna(SAMPLE), None).to_dict("records")}


def add_live_inputs(db, age_hours=0, verified_rain=False):
    issue = datetime.now(timezone.utc).replace(tzinfo=None, minute=0, second=0, microsecond=0) - timedelta(hours=age_hours)
    created = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=1)
    for lag in range(25):
        for ecosystem, model in STATION_MAPPING.items():
            value = float(SAMPLE.iloc[-1 - lag][f"level_{model}"])
            db.add(WaterMeasurement(station_code=ecosystem, timestamp=issue - timedelta(hours=lag), water_level=value, source_type=VERIFIED_WATER_SOURCE, created_at=created))
        if verified_rain:
            for code in ("SLA001", "SLA002", "SLA003"):
                db.add(RainfallMeasurement(station_code=code, timestamp=issue - timedelta(hours=lag), rain_amount_1h=0.0, source_type=VERIFIED_RAIN_SOURCE, created_at=created))
    db.commit()
    return issue


def test_replay_matches_all_18_saved_models_and_station_aliases(client):
    for ecosystem, model in STATION_MAPPING.items():
        for family in ("delta", "level"):
            response = client.post("/api/v1/forecast/trigger", params={"station_code": model, "mode": "replay", "family": family}, json=replay_body())
            assert response.status_code == 200, response.text
            record = response.json()
            assert record["station_code"] == ecosystem
            assert record["forecast_time"] == "2025-01-09T17:00:00+00:00"
            expected = REFERENCE[f"{model}/{family}"]["levels_m"]
            assert [record[f"predicted_{h}h"] for h in (1, 2, 3)] == pytest.approx(expected, abs=1e-10)
            assert record["context_json"]["operational_ready"] is False
            assert record["context_json"]["alert_dispatched"] is False


def test_no_seeded_forecasts_or_water_when_data_unavailable(client, db):
    assert client.get("/api/v1/forecast/latest").status_code == 404
    assert client.post("/api/v1/forecast/trigger").status_code == 503
    assert client.get("/api/v1/water/latest").status_code == 404
    assert client.get("/api/v1/water/history").json() == []
    assert db.query(ForecastRecord).count() == 0
    assert db.query(WaterMeasurement).count() == 0


@pytest.mark.parametrize("age_hours,expected_mode", [(0, "shadow"), (4, "replay")])
def test_refresh_all_uses_verified_data_and_labels_delayed_inputs(client, db, monkeypatch, age_hours, expected_mode):
    from services.telemetry_service import telemetry_service
    monkeypatch.setattr(telemetry_service, "ingest_rid", lambda db: {"status": "ingested"})
    add_live_inputs(db, age_hours=age_hours)
    response = client.post("/api/v1/forecast/refresh-all")
    assert response.status_code == 200, response.text
    rows = response.json()["stations"]
    assert {row["station_code"] for row in rows} == set(STATION_MAPPING)
    for row in rows:
        assert row["error"] is None
        context = row["forecast"]["context_json"]
        assert context["mode"] == expected_mode
        assert context["observation_refs"]
        assert context["input_source"].startswith("Verified database RID/HII")
        assert context["alert_dispatched"] is False
    assert client.post("/api/v1/forecast/refresh-all").json() == response.json()
    if expected_mode == "replay":
        assert client.get("/api/v1/forecast/latest").status_code == 404


def test_refresh_all_does_not_invent_predictions_without_inputs(client, db, monkeypatch):
    from services.telemetry_service import telemetry_service
    monkeypatch.setattr(telemetry_service, "ingest_rid", lambda db: {"status": "ingested"})
    rows = client.post("/api/v1/forecast/refresh-all").json()["stations"]
    assert len(rows) == 3
    assert all(row["forecast"] is None and row["error"] for row in rows)
    assert db.query(ForecastRecord).count() == 0


def test_camera_retries_incomplete_source_jpeg(monkeypatch):
    import cv2
    import numpy as np
    from io import BytesIO
    from services.vision_service import vision_service
    success, encoded = cv2.imencode('.jpg', np.zeros((8, 8, 3), dtype=np.uint8))
    assert success
    complete = encoded.tobytes()
    bodies = iter([complete[:-2], complete])
    monkeypatch.setattr('urllib.request.urlopen', lambda *args, **kwargs: BytesIO(next(bodies)))
    frame = vision_service.fetch_live_frame('STN-MUANGKONG')
    assert frame is not None and frame.shape == (8, 8, 3)
    bodies = iter([complete[:-2], complete[:-2]])
    assert vision_service.fetch_live_frame('STN-MUANGKONG') is not None
    vision_service._cached_frames.clear()
    bodies = iter([complete[:-2], complete[:-2]])
    assert vision_service.fetch_live_frame('STN-MUANGKONG') is None


def test_shadow_ignores_demo_and_vision_rain_and_future_measurements(client, db):
    issue = add_live_inputs(db)
    db.add(RainfallMeasurement(station_code="STN-BANGSALA", timestamp=issue - timedelta(hours=1), rain_amount_1h=999))
    db.add(WaterMeasurement(station_code="STN-BANGSALA", timestamp=issue, water_level=999, source_type="CAMERA_VISION"))
    db.add(WaterMeasurement(station_code="STN-BANGSALA", timestamp=issue + timedelta(hours=1), water_level=999, source_type=VERIFIED_WATER_SOURCE))
    db.commit()
    response = client.post("/api/v1/forecast/trigger")
    assert response.status_code == 200, response.text
    record = response.json()
    context = record["context_json"]
    assert context["current_level_m"] == SAMPLE.iloc[-1]["level_X.90"]
    assert record["input_mode"] == "RID_API_ONLY"
    assert record["data_quality_status"] == "PARTIAL_INPUTS"
    assert context["rain_available"] is False
    assert all(name.startswith("rain_") for name in context["missing_features"])
    assert client.get("/api/v1/forecast/latest").json()["id"] == record["id"]


def test_verified_rain_and_revision_selection(client, db):
    issue = add_live_inputs(db, verified_rain=True)
    db.add(WaterMeasurement(station_code="STN-BANGSALA", timestamp=issue, water_level=2.5, source_type=VERIFIED_WATER_SOURCE))
    db.commit()
    record = client.post("/api/v1/forecast/trigger").json()
    assert record["context_json"]["current_level_m"] == 2.5
    assert record["data_quality_status"] == "COMPLETE_INPUTS"
    assert record["context_json"]["rain_available"] is True
    assert all(ref["source"] in (VERIFIED_RAIN_SOURCE, VERIFIED_WATER_SOURCE) for ref in record["context_json"]["observation_refs"])


def test_stale_inputs_and_stale_predictions_are_unavailable(client, db):
    issue = add_live_inputs(db, age_hours=4)
    assert client.post("/api/v1/forecast/trigger").status_code == 503
    record = ForecastRecord(station_code="STN-BANGSALA", forecast_time=issue, predicted_1h=1, predicted_2h=1, predicted_3h=1,
                            model_name="Random Forest delta", model_version="rf-v2-shadow", context_json={"mode": "shadow"})
    db.add(record); db.commit()
    assert client.get("/api/v1/forecast/latest").status_code == 404
    assert len(client.get("/api/v1/forecast/history").json()) == 1


def test_reruns_are_idempotent_and_corrected_input_creates_revision(client, db):
    issue = add_live_inputs(db)
    first = client.post("/api/v1/forecast/trigger").json()
    assert client.post("/api/v1/forecast/trigger").json()["id"] == first["id"]
    db.add(WaterMeasurement(station_code="STN-BANGSALA", timestamp=issue, water_level=4.5, source_type=VERIFIED_WATER_SOURCE))
    db.commit()
    assert client.post("/api/v1/forecast/trigger").json()["id"] != first["id"]
    assert db.query(ForecastRecord).count() == 2


def test_simulation_does_not_contaminate_history(client, db):
    simulated = client.post("/api/v1/forecast/simulate").json()
    assert simulated["input_mode"] == "SIMULATION"
    assert simulated["id"] == 0
    assert db.query(ForecastRecord).count() == 0
    assert client.get("/api/v1/forecast/history").json() == []
    assert client.get("/api/v1/forecast/latest").status_code == 404


def test_history_filters_and_target_time_comparison(client, db):
    record = client.post("/api/v1/forecast/trigger?mode=replay", json=replay_body()).json()
    target = datetime(2025, 1, 9, 18)
    db.add(WaterMeasurement(station_code="STN-BANGSALA", timestamp=target, water_level=2.0, source_type=VERIFIED_WATER_SOURCE))
    db.add(WaterMeasurement(station_code="STN-BANGSALA", timestamp=target + timedelta(hours=1), water_level=100, source_type="CAMERA_VISION"))
    db.commit()
    assert client.get("/api/v1/forecast/history").json() == []
    history = client.get("/api/v1/forecast/history?mode=replay&start=2025-01-09T17:00:00Z&end=2025-01-09T18:00:00Z").json()
    assert len(history) == 1
    result = client.get(f"/api/v1/forecast/{record['id']}/comparison").json()
    assert result["items"][0]["actual_level"] == 2.0
    assert result["items"][0]["mae_error"] == pytest.approx(abs(record["predicted_1h"] - 2.0))
    assert result["items"][1]["actual_level"] is None


def test_bad_inputs_are_rejected(client):
    assert client.post("/api/v1/forecast/trigger?station_code=unknown").status_code == 422
    assert client.post("/api/v1/forecast/trigger?mode=replay").status_code == 422
    assert client.post("/api/v1/forecast/trigger", json=replay_body()).status_code == 503
    body = replay_body(); body["issue_time"] = "2025-01-10T00:30:00+07:00"
    assert client.post("/api/v1/forecast/trigger?mode=replay", json=body).status_code == 422
    assert client.get("/api/v1/forecast/history?start=2025-02-01&end=2025-01-01").status_code == 422
    assert client.get("/api/v1/water/latest?station_code=unknown").status_code == 422


def test_database_url_from_env_file_is_respected(tmp_path, monkeypatch):
    from core.config import Settings
    monkeypatch.delenv("DATABASE_URL", raising=False)
    env_file = tmp_path / ".env"
    env_file.write_text("DATABASE_URL=sqlite:///explicit-local.db\n")
    assert Settings(_env_file=env_file).database_url == "sqlite:///explicit-local.db"
    env_file.write_text("DATABASE_URL=postgresql://test:example@localhost/test\n")
    assert Settings(_env_file=env_file).database_url.startswith("postgresql+psycopg2://")


def test_rid_ingestion_preserves_observation_time_and_is_repeatable(client, db):
    rows = [{"station_code": "STN-BANGSALA", "time": "2025-01-10T00:00:00+07:00", "water_level": 2.0}]
    with patch("services.telemetry_service.fetch_rid_history", return_value=rows):
        assert client.post("/api/v1/water/ingest-rid").json()["inserted"] == 1
        assert client.post("/api/v1/water/ingest-rid").json()["inserted"] == 0
    record = db.query(WaterMeasurement).one()
    assert record.timestamp == datetime(2025, 1, 9, 17)
    assert record.source_type == VERIFIED_WATER_SOURCE


def test_rid_parser_resolves_metadata_order_and_hour_24():
    now = datetime(2026, 10, 2, 12, tzinfo=BANGKOK)
    response = Mock()
    metadata = {"groupHeadersStationCode": [{"titleText": code} for code in ("X.44", "X.173A", "X.90")]}
    reports = {"rows": [{"hourlytime": str(h), "wlvalues1": "1.5", "wlvalues2": "10.0", "wlvalues3": "-999"} for h in range(1, 25)]}
    response.json.side_effect = [metadata, reports, reports, reports]
    session = Mock(); session.headers = {}; session.post.return_value = response
    with patch("services.rid_source.requests.Session", return_value=session):
        rows = fetch_rid_history(now)
    assert len(rows) == 120
    assert any(row["time"] == "2026-10-01T00:00:00+07:00" for row in rows)
    assert all(row["station_code"] != "STN-BANGSALA" for row in rows)
    assert rows[0]["station_code"] == "STN-MUANGKONG"
    assert rows[0]["water_level"] == 10.0
    session.close.assert_called_once()


def test_worker_calls_real_api_and_reports_failure_without_mock_output():
    success = Mock(); success.json.return_value = {"id": 1, "data_quality_status": "PARTIAL_INPUTS"}
    failure = Mock(); failure.raise_for_status.side_effect = requests.HTTPError("503")
    with patch("forecast.forecast_worker.requests.post", side_effect=[success, failure, success]) as post:
        result = asyncio.run(run_periodic_forecast({}))
    assert result["STN-BANGSALA"]["status"] == "unavailable"
    assert result["STN-MUANGKONG"]["record_id"] == 1
    assert all(call.kwargs["params"]["mode"] == "shadow" for call in post.call_args_list)


def test_existing_schema_upgrade_preserves_rows_and_marks_old_rain_unknown():
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE forecast_records (id INTEGER PRIMARY KEY, predicted_1h FLOAT)"))
        conn.execute(text("INSERT INTO forecast_records VALUES (1, 2.5)"))
        conn.execute(text("CREATE TABLE rainfall_measurements (id INTEGER PRIMARY KEY, rain_amount_1h FLOAT)"))
        conn.execute(text("INSERT INTO rainfall_measurements VALUES (1, 4.2)"))
    upgrade_timeseries_schema(engine); upgrade_timeseries_schema(engine)
    with engine.connect() as conn:
        assert conn.execute(text("SELECT predicted_1h FROM forecast_records")).scalar() == 2.5
        assert conn.execute(text("SELECT source_type FROM rainfall_measurements")).scalar() == "UNKNOWN"
    assert "context_json" in {column["name"] for column in inspect(engine).get_columns("forecast_records")}
    engine.dispose()

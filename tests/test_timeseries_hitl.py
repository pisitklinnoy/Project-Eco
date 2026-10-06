import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient

from main import app
from services.timeseries_hitl_service import timeseries_hitl_service
from models.measurement import WaterMeasurement


@pytest.fixture
def client():
    return TestClient(app)


def test_ingestion_cross_validation_and_quarantine():
    # 1. Normal difference <= 0.8m -> Not quarantined
    normal_res = timeseries_hitl_service.check_and_quarantine_ingestion(
        station_code="STN-BANGSALA",
        station_name="บ้านบางศาลา",
        vision_val=2.50,
        sensor_val=2.30
    )
    assert normal_res["quarantined"] is False
    assert normal_res["discrepancy_m"] == 0.20

    # 2. Extreme anomaly: Vision 20.0m vs Sensor 2.0m -> Quarantined
    anom_res = timeseries_hitl_service.check_and_quarantine_ingestion(
        station_code="STN-BANGSALA",
        station_name="บ้านบางศาลา",
        vision_val=20.0,
        sensor_val=2.0
    )
    assert anom_res["quarantined"] is True
    assert anom_res["discrepancy_m"] == 18.0
    assert anom_res["item"]["status"] == "QUARANTINED"


def test_ingestion_manual_override(db):
    # Create quarantine item
    res = timeseries_hitl_service.check_and_quarantine_ingestion(
        station_code="STN-BANGSALA",
        station_name="บ้านบางศาลา",
        vision_val=14.80,
        sensor_val=2.45
    )
    item_id = res["item"]["id"]

    # Apply manual override
    override_res = timeseries_hitl_service.apply_ingestion_override(
        db=db,
        review_id=item_id,
        selected_choice="SENSOR",
        verified_water_level=2.45,
        reviewer_name="Dr. Hydrologist",
        reviewer_notes="Night camera glare caused reflection error. Verified sensor is correct."
    )

    assert override_res["status"] == "success"
    assert override_res["verified_water_level"] == 2.45
    assert override_res["item"]["status"] == "RELEASED"
    assert override_res["resolved_by"] == "Dr. Hydrologist"

    # Check that database has record marked as reviewed by human
    meas = db.query(WaterMeasurement).filter(WaterMeasurement.id == override_res["measurement_id"]).first()
    assert meas is not None
    assert meas.water_level == 2.45
    assert meas.is_reviewed_by_human is True
    assert meas.source_type == "MANUAL_REVIEW"


def test_forecast_drift_report_and_acknowledge():
    # Report contains safety threshold and model metadata
    report = timeseries_hitl_service.get_forecast_drift_report()
    assert "safety_threshold_m" in report
    assert report["safety_threshold_m"] == 0.40
    assert "matched_evaluations" in report
    assert len(report["matched_evaluations"]) >= 1

    # Simulate drift
    sim_report = timeseries_hitl_service.simulate_drift_event(residual_error=0.75)
    assert sim_report["drift_detected"] is True
    assert sim_report["max_residual_m"] == 0.75

    # Acknowledge drift
    ack_res = timeseries_hitl_service.acknowledge_drift_alert(
        reviewer_name="Operator Somchai",
        reviewer_notes="Under observation during high rain"
    )
    assert ack_res["status"] == "success"
    assert ack_res["action"] == "ACKNOWLEDGED"

    updated_report = timeseries_hitl_service.get_forecast_drift_report()
    assert updated_report["drift_detected"] is False


def test_hitl_api_endpoints(client):
    # 1. Ingestion Queue API
    get_res = client.get("/api/v1/review/timeseries/ingestion-queue")
    assert get_res.status_code == 200
    queue = get_res.json()
    assert isinstance(queue, list)
    assert len(queue) >= 1

    # 2. Ingestion Override API
    first_item = queue[0]
    override_payload = {
        "review_id": first_item["id"],
        "selected_choice": "MANUAL",
        "verified_water_level": 3.15,
        "reviewer_name": "API Tester",
        "reviewer_notes": "Override via test suite"
    }
    post_res = client.post("/api/v1/review/timeseries/ingestion-override", json=override_payload)
    assert post_res.status_code == 200
    data = post_res.json()
    assert data["status"] == "success"
    assert data["verified_water_level"] == 3.15

    # 3. Forecast Drift Report API
    drift_res = client.get("/api/v1/review/timeseries/forecast-drift")
    assert drift_res.status_code == 200
    drift_data = drift_res.json()
    assert "safety_threshold_m" in drift_data
    assert "matched_evaluations" in drift_data

    # 4. Acknowledge Drift API
    ack_res = client.post("/api/v1/review/timeseries/acknowledge-drift", json={
        "reviewer_name": "API Operator",
        "reviewer_notes": "API test acknowledge"
    })
    assert ack_res.status_code == 200
    assert ack_res.json()["action"] == "ACKNOWLEDGED"

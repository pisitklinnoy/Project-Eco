import hashlib
import json
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock

import pytest

from services.hii_source import fetch_hii_history, parse_hourly_graph, GAUGES
from services.rid_source import BANGKOK
from services.telemetry_service import telemetry_service
from services.timeseries_inputs import RAIN_MAPPING
from models.measurement import RainfallMeasurement
from test_timeseries_ecosystem import add_live_inputs


def test_hourly_rain_qc_keeps_real_zero_and_does_not_round_or_use_future():
    now = datetime(2026, 10, 3, 12, tzinfo=BANGKOK)
    raw = [('08:00', 0), ('09:00', -999), ('10:00', 1), ('10:00', 2), ('11:30', 3), ('12:00', 0.2), ('13:00', 5)]
    payload = {'result': 'OK', 'data': [{'rainfall_datetime': '2026-10-03 ' + hour, 'rainfall_value': value} for hour, value in raw]}
    rows = parse_hourly_graph(payload, 'SLA001', 'source', 'sha', now)
    assert [(row['time'], row['rain_amount_1h']) for row in rows] == [('2026-10-03T08:00:00+07:00', 0), ('2026-10-03T12:00:00+07:00', 0.2)]


@pytest.mark.parametrize('fault', [None, 'gap', 'coordinates', 'agency', 'duplicate_station', 'hourly_value', 'sum_24h'])
def test_hii_source_verifies_mapping_units_and_timestamp_against_summary(monkeypatch, fault):
    now = datetime(2026, 10, 3, 12, tzinfo=BANGKOK)
    metadata = []
    for index, (code, (latitude, longitude)) in enumerate(GAUGES.items()):
        metadata.append({'station': {'id': 800 + index, 'tele_station_oldcode': code, 'tele_station_lat': latitude, 'tele_station_long': longitude},
                         'agency': {'agency_shortname': {'en': 'HII'}}, 'rainfall_datetime': '2026-10-03 12:00', 'rain_1h': 0, 'rain_24h': 2})
    if fault == 'coordinates': metadata[0]['station']['tele_station_lat'] += 1
    if fault == 'agency': metadata[0]['agency']['agency_shortname']['en'] = 'OTHER'
    if fault == 'duplicate_station': metadata.append(metadata[0])
    if fault == 'hourly_value': metadata[0]['rain_1h'] = 10
    if fault == 'sum_24h': metadata[0]['rain_24h'] = 20
    graph = {'result': 'OK', 'data': [{'rainfall_datetime': (now - timedelta(hours=lag)).strftime('%Y-%m-%d %H:%M'),
                                     'rainfall_value': 2 if lag == 1 else 0} for lag in reversed(range(37))]}
    if fault == 'gap':
        graph['data'][-7]['rainfall_value'] = None
    def get(url, params, timeout):
        payload = {'result': 'OK', 'data': metadata} if url.endswith('rain_24h') else graph
        response = Mock()
        response.json.return_value = payload
        response.content = json.dumps(payload).encode()
        response.url = url + '?station_id=' + str(params.get('station_id', ''))
        return response
    session = Mock()
    session.get.side_effect = get
    monkeypatch.setattr('services.hii_source.requests.Session', lambda: session)
    rows, status = fetch_hii_history(now)
    assert status['SLA001']['status'] == ('available' if fault in (None, 'gap') else 'unavailable')
    assert status['SLA002']['status'] == status['SLA003']['status'] == 'available'
    accepted = [row for row in rows if row['station_code'] == 'SLA002']
    assert len(accepted) == (36 if fault == 'gap' else 37)
    assert accepted[-1]['rain_amount_24h'] == 2
    assert accepted[-1]['time'] == '2026-10-03T12:00:00+07:00'
    assert accepted[-1]['source_station_id'] == 801
    assert accepted[-1]['source_sha256'] == hashlib.sha256(json.dumps(graph).encode()).hexdigest()


def test_ingested_rain_is_used_by_all_models_and_keeps_revisions(client, db, monkeypatch):
    issue = add_live_inputs(db)
    rows = [{'station_code': code, 'time': (issue - timedelta(hours=lag)).replace(tzinfo=timezone.utc).isoformat(),
             'rain_amount_1h': lag / 10, 'rain_amount_24h': None, 'source_station_id': 800 + index,
             'source_url': 'https://api-v3.thaiwater.net/test', 'source_sha256': 'a' * 64}
            for index, code in enumerate(RAIN_MAPPING) for lag in range(25)]
    monkeypatch.setattr('services.telemetry_service.fetch_hii_history', lambda: (rows, {}))
    monkeypatch.setattr(telemetry_service, 'ingest_rid', lambda db: {'status': 'ingested'})
    response = client.post('/api/v1/forecast/refresh-all')
    assert response.status_code == 200, response.text
    assert response.json()['telemetry']['rain']['inserted'] == 75
    for row in response.json()['stations']:
        record = row['forecast']
        assert row['error'] is None and record['context_json']['rain_available'] is True
        assert record['data_quality_status'] == 'COMPLETE_INPUTS'
        for name, value in record['context_json']['input_features'].items():
            if name.startswith('rain_'):
                assert value == pytest.approx(int(name.rsplit('_lag', 1)[1][:-1]) / 10)
        refs = [ref for ref in record['context_json']['observation_refs'] if ref['table'] == 'rainfall_measurements']
        assert refs and refs[0]['source_sha256'] == 'a' * 64
        latest = client.get('/api/v1/water/rain/latest', params={'station_code': row['station_code']}).json()
        assert latest['timestamp'] == issue.replace(tzinfo=timezone.utc).isoformat()
        assert latest['rain_amount_1h'] == 0 and latest['rain_amount_24h'] is None
    assert client.post('/api/v1/forecast/refresh-all').json()['telemetry']['rain']['inserted'] == 0
    assert db.query(RainfallMeasurement).count() == 75
    # A correction makes a new observation revision and a new forecast input snapshot.
    rows[1]['rain_amount_1h'] = 5.0
    corrected = client.post('/api/v1/forecast/refresh-all').json()
    assert corrected['telemetry']['rain']['inserted'] == 1
    assert db.query(RainfallMeasurement).count() == 76
    assert any(row['forecast']['id'] != old['forecast']['id'] for row, old in zip(corrected['stations'], response.json()['stations']))


def test_rain_feed_failure_does_not_prevent_water_ingestion(client, db, monkeypatch):
    from hatyai_timeseries import ForecastInputError
    monkeypatch.setattr(telemetry_service, 'ingest_rid', lambda db: {'status': 'ingested', 'inserted': 1})
    def unavailable(db): raise ForecastInputError('HII unavailable')
    monkeypatch.setattr(telemetry_service, 'ingest_hii', unavailable)
    result = client.post('/api/v1/water/ingest-telemetry').json()
    assert result['water']['status'] == 'ingested'
    assert result['rain']['status'] == 'unavailable'
    assert db.query(RainfallMeasurement).count() == 0


def test_partial_hourly_rain_is_used_and_labelled_without_filling_gap(client, db, monkeypatch):
    issue = add_live_inputs(db, verified_rain=True)
    db.query(RainfallMeasurement).filter(RainfallMeasurement.station_code == 'SLA003',
        RainfallMeasurement.timestamp == issue - timedelta(hours=6)).delete()
    db.commit()
    monkeypatch.setattr(telemetry_service, 'ingest_rid', lambda db: {'status': 'ingested'})
    monkeypatch.setattr(telemetry_service, 'ingest_hii', lambda db: {'status': 'ingested'})
    rows = client.post('/api/v1/forecast/refresh-all').json()['stations']
    for row in rows:
        record = row['forecast']
        assert record['input_mode'] == 'RID_HII_PARTIAL'
        assert record['context_json']['input_features']['rain_SLA003_lag6h'] is None
        summary = record['context_json']['rain_input_summary']
        assert summary['used_count'] == summary['total_count'] - 1
        assert summary['missing_features'] == ['rain_SLA003_lag6h']

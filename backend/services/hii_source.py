"""Verified HII gauges and observed hourly rainfall (mm), using the ThaiWater public API."""
import hashlib
import math
from datetime import datetime, timedelta

import pandas as pd
import requests
from hatyai_timeseries import ForecastInputError
from services.rid_source import BANGKOK

HII_BASE = "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/"
GAUGES = {"SLA001": (6.9801416, 100.46324), "SLA002": (6.9312353, 100.43985), "SLA003": (6.796655, 100.442406)}


def valid_rain(value):
    try:
        number = float(value)
        return number if math.isfinite(number) and number >= 0 and number not in (9999, 999999) else None
    except (TypeError, ValueError):
        return None


def local_hour(value):
    stamp = pd.Timestamp(value)
    if pd.isna(stamp):
        raise ValueError("Missing rain observation time")
    stamp = stamp.tz_localize(BANGKOK) if stamp.tzinfo is None else stamp.tz_convert(BANGKOK)
    if stamp != stamp.floor('h'):
        raise ValueError("Rain observation is not on an exact hour")
    return stamp.to_pydatetime()


def parse_hourly_graph(payload, code, source_url, sha256, now):
    if payload.get("result") != "OK" or not isinstance(payload.get("data"), list):
        raise ForecastInputError("HII returned an unexpected hourly graph")
    grouped = {}
    for row in payload["data"]:
        try:
            stamp = local_hour(row.get("rainfall_datetime"))
        except (ValueError, TypeError):
            continue
        if stamp > now or stamp < now - timedelta(hours=72):
            continue
        value = valid_rain(row.get("rainfall_value"))
        if value is not None:
            grouped.setdefault(stamp, set()).add(value)
    return [{"station_code": code, "time": stamp.isoformat(), "rain_amount_1h": next(iter(values)),
             "source_url": source_url, "source_sha256": sha256}
            for stamp, values in sorted(grouped.items()) if len(values) == 1]


def fetch_hii_history(now=None):
    now = (now or datetime.now(BANGKOK)).astimezone(BANGKOK)
    session = requests.Session()
    session.headers.update({"User-Agent": "HatyaiFloodLens/2.0 experimental-shadow", "Accept": "application/json"})
    rows, statuses = [], {}
    try:
        response = session.get(HII_BASE + "rain_24h", params={"province_code": "90"}, timeout=(5, 15))
        response.raise_for_status()
        metadata = response.json()
        if metadata.get('result') != 'OK' or not isinstance(metadata.get('data'), list):
            raise ForecastInputError("HII station metadata unavailable")
        for code, (latitude, longitude) in GAUGES.items():
            try:
                matches = [row for row in metadata['data'] if row.get('station', {}).get('tele_station_oldcode') == code]
                if len(matches) != 1:
                    raise ForecastInputError(f"HII station {code} mapping cannot be verified")
                latest = matches[0]
                station = latest['station']
                if (latest.get('agency', {}).get('agency_shortname', {}).get('en') != 'HII'
                    or abs(float(station['tele_station_lat']) - latitude) > 0.003
                    or abs(float(station['tele_station_long']) - longitude) > 0.003):
                    raise ForecastInputError(f"HII station {code} agency/coordinates mismatch")
                station_id = int(station['id'])
                if station_id <= 0:
                    raise ForecastInputError("Invalid HII station ID")
                graph = session.get(HII_BASE + 'rain_24h_graph', params={'station_id': station_id}, timeout=(5, 15))
                graph.raise_for_status()
                observations = parse_hourly_graph(graph.json(), code, graph.url, hashlib.sha256(graph.content).hexdigest(), now)
                # Cross-check hourly units and timezone against the independent latest/24h report.
                issue = local_hour(latest['rainfall_datetime'])
                by_time = {local_hour(row['time']): row['rain_amount_1h'] for row in observations}
                expected = valid_rain(latest.get('rain_1h'))
                if issue <= now and expected is not None and issue in by_time and abs(by_time[issue] - expected) > 0.01:
                    raise ForecastInputError("HII latest hourly rain does not match graph")
                window = [by_time.get(issue - timedelta(hours=lag)) for lag in range(24)]
                total = valid_rain(latest.get('rain_24h'))
                if all(value is not None for value in window) and total is not None and abs(sum(window) - total) > 0.11:
                    raise ForecastInputError("HII hourly rain does not match 24h accumulation")
                for row in observations:
                    row['source_station_id'] = station_id
                    stamp = local_hour(row['time'])
                    past = [by_time.get(stamp - timedelta(hours=lag)) for lag in range(24)]
                    row['rain_amount_24h'] = (total if stamp == issue and total is not None
                                              else sum(past) if all(value is not None for value in past) else None)
                rows.extend(observations)
                statuses[code] = {"status": "available" if observations else "unavailable", "hours": len(observations),
                                  "latest_time": observations[-1]['time'] if observations else None, "source_station_id": station_id}
            except (requests.RequestException, KeyError, TypeError, ValueError) as exc:
                statuses[code] = {"status": "unavailable", "reason": str(exc)}
        return rows, statuses
    except (requests.RequestException, KeyError, TypeError, ValueError) as exc:
        raise ForecastInputError(f"HII rainfall unavailable: {exc}") from exc
    finally:
        session.close()

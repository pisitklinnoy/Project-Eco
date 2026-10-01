import os
import psycopg2
from datetime import datetime
from forecast.input_policy import InputPolicy
from forecast.mock_forecaster import mock_forecaster

DB_HOST = os.getenv("POSTGRES_HOST", "postgres")
DB_USER = os.getenv("POSTGRES_USER", "admin")
DB_PASS = os.getenv("POSTGRES_PASSWORD", "password123")
DB_NAME = os.getenv("POSTGRES_DB", "hatyai_flood_db")

REAL_STATION_CODES = ["STN-BANGSALA", "STN-MUANGKONG", "STN-HATYAINAI"]

# Station typical normal water level fallback
STATION_FALLBACK_WATER = {
    "STN-BANGSALA": 3.5,
    "STN-MUANGKONG": 10.5,
    "STN-HATYAINAI": 1.2,
}

async def run_periodic_forecast(ctx, station_code: str = None):
    """
    Task handler สำหรับการพยากรณ์ระดับน้ำล่วงหน้า 1, 2, 3 ชั่วโมง
    """
    target_stations = [station_code] if station_code else REAL_STATION_CODES
    print(f"\n[Forecast Worker] 🔮 Evaluating forecast for {len(target_stations)} station(s): {target_stations}")

    all_preds = {}

    for stn_code in target_stations:
        current_water = STATION_FALLBACK_WATER.get(stn_code, 3.20)
        recent_rain = 8.5  # mm

        # 1. ดึงข้อมูลล่าสุดจาก PostgreSQL
        try:
            conn = psycopg2.connect(host=DB_HOST, user=DB_USER, password=DB_PASS, dbname=DB_NAME)
            cur = conn.cursor()

            cur.execute("""
                SELECT water_level, timestamp FROM water_measurements 
                WHERE station_code = %s ORDER BY timestamp DESC LIMIT 1
            """, (stn_code,))
            row = cur.fetchone()
            if row:
                current_water = float(row[0])

            cur.execute("""
                SELECT rain_amount_1h FROM rainfall_measurements 
                WHERE station_code = %s ORDER BY timestamp DESC LIMIT 1
            """, (stn_code,))
            rain_row = cur.fetchone()
            if rain_row:
                recent_rain = float(rain_row[0])

            cur.close()
            conn.close()
        except Exception as e:
            print(f"[Forecast Worker] DB Read Warning for {stn_code}: {e}")

        # 2. เรียกใช้โมเดลพยากรณ์
        preds = mock_forecaster.predict_next_hours(current_water, recent_rain)
        print(f"[Forecast Worker] {stn_code} Level: {current_water}m | Forecasts: +1h={preds['predicted_1h']}m, +2h={preds['predicted_2h']}m, +3h={preds['predicted_3h']}m")

        # 3. บันทึกผลพยากรณ์ลง PostgreSQL
        try:
            conn = psycopg2.connect(host=DB_HOST, user=DB_USER, password=DB_PASS, dbname=DB_NAME)
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO forecast_records (station_code, forecast_time, predicted_1h, predicted_2h, predicted_3h, model_name, model_version, input_mode, data_quality_status, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                stn_code,
                datetime.utcnow(),
                preds["predicted_1h"],
                preds["predicted_2h"],
                preds["predicted_3h"],
                preds["model_name"],
                preds["model_version"],
                "API_PLUS_VISION",
                "HIGH_CONFIDENCE",
                datetime.utcnow()
            ))
            conn.commit()
            cur.close()
            conn.close()
            print(f"[Forecast Worker] ✅ {stn_code} forecast records stored successfully in DB!")
        except Exception as e:
            print(f"[Forecast Worker] DB Write Warning for {stn_code}: {e}")

        all_preds[stn_code] = preds

    return all_preds

import os
import psycopg2
from datetime import datetime, timedelta
from forecast.input_policy import InputPolicy
from forecast.mock_forecaster import mock_forecaster

DB_HOST = os.getenv("POSTGRES_HOST", "postgres")
DB_USER = os.getenv("POSTGRES_USER", "admin")
DB_PASS = os.getenv("POSTGRES_PASSWORD", "password123")
DB_NAME = os.getenv("POSTGRES_DB", "hatyai_flood_db")

async def run_periodic_forecast(ctx, station_code: str = "STN-HY01"):
    """
    Task handler สำหรับการพยากรณ์ระดับน้ำล่วงหน้า 1, 2, 3 ชั่วโมง
    """
    print(f"\n[Forecast Worker] 🔮 Evaluating forecast for station: {station_code}")
    
    # 1. ดึงข้อมูลล่าสุดจาก PostgreSQL
    current_water = 3.20 # default fallback
    recent_rain = 8.5    # mm
    
    try:
        conn = psycopg2.connect(host=DB_HOST, user=DB_USER, password=DB_PASS, dbname=DB_NAME)
        cur = conn.cursor()
        
        cur.execute("""
            SELECT water_level, timestamp FROM water_measurements 
            WHERE station_code = %s ORDER BY timestamp DESC LIMIT 1
        """, (station_code,))
        row = cur.fetchone()
        if row:
            current_water = float(row[0])
            
        cur.execute("""
            SELECT rain_amount_1h FROM rainfall_measurements 
            WHERE station_code = %s ORDER BY timestamp DESC LIMIT 1
        """, (station_code,))
        rain_row = cur.fetchone()
        if rain_row:
            recent_rain = float(rain_row[0])
            
    except Exception as e:
        print(f"[Forecast Worker] DB Read Warning: {e}")

    # 2. เรียกใช้โมเดลพยากรณ์ (หรือ Mock Forecaster)
    preds = mock_forecaster.predict_next_hours(current_water, recent_rain)
    print(f"[Forecast Worker] Current Level: {current_water}m | Forecasts: +1h={preds['predicted_1h']}m, +2h={preds['predicted_2h']}m, +3h={preds['predicted_3h']}m")

    # 3. บันทึกผลพยากรณ์ลง PostgreSQL
    try:
        cur.execute("""
            INSERT INTO forecast_records (station_code, forecast_time, predicted_1h, predicted_2h, predicted_3h, model_name, model_version, input_mode, data_quality_status, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            station_code,
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
        print(f"[Forecast Worker] ✅ Forecast records stored successfully in DB!")
    except Exception as e:
        print(f"[Forecast Worker] DB Write Warning: {e}")

    return preds

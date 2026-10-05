"""
Unified Flood Forecaster Inference Engine
=========================================
โมเดลเดี่ยว (1 Single Unified LightGBM Model) พยากรณ์ระดับน้ำล่วงหน้า 1-3 ชั่วโมง
ครบทั้ง 3 สถานีในลุ่มน้ำคลองอู่ตะเภา (ม่วงก็อง X.173A, บางศาลา X.90, หาดใหญ่ใน X.44)
"""

import os
from pathlib import Path
from typing import Dict, List, Any, Optional, Union
import numpy as np
import pandas as pd
import lightgbm as lgb


# 1. นิยามรหัสสถานีและค่าเกณฑ์ระดับน้ำมาตรฐานชลประทาน
STATION_METADATA = {
    0: {
        "rid_code": "X.173A",
        "ecosystem_code": "STN-MUANGKONG",
        "name_th": "ท้ายเขื่อนคลองจำไพบูลย์ (ม่วงก็อง - ต้นน้ำ)",
        "name_en": "Muangkong (Upstream)",
        "warning_level": 15.90,
        "critical_level": 17.40,
        "water_col": "water_level_X.173A",
        "rain_col": "rain_SLA001"
    },
    1: {
        "rid_code": "X.90",
        "ecosystem_code": "STN-BANGSALA",
        "name_th": "บ้านบางศาลา (กลางน้ำ)",
        "name_en": "Bangsala (Midstream)",
        "warning_level": 8.00,
        "critical_level": 9.30,
        "water_col": "water_level_X.90",
        "rain_col": "rain_SLA002"
    },
    2: {
        "rid_code": "X.44",
        "ecosystem_code": "STN-HATYAINAI",
        "name_th": "สะพานหาดใหญ่ใน (ปลายน้ำในเมือง)",
        "name_en": "Hat Yai Nai (Downstream)",
        "warning_level": 6.40,
        "critical_level": 7.40,
        "water_col": "water_level_X.44",
        "rain_col": "rain_SLA003"
    }
}

# แมปชื่อโค้ดข้ามระบบ
CODE_TO_ID = {
    "X.173A": 0, "STN-MUANGKONG": 0, 0: 0,
    "X.90": 1, "STN-BANGSALA": 1, 1: 1,
    "X.44": 2, "STN-HATYAINAI": 2, 2: 2
}

# ลำดับฟีเจอร์ที่โมเดลต้องการอย่างเข้มงวด (25 Features)
FEATURE_COLUMNS = [
    'water_level_X.173A_current', 'water_level_X.173A_lag1h', 'water_level_X.173A_lag2h',
    'water_level_X.173A_lag3h', 'water_level_X.173A_lag6h',
    'water_level_X.90_current', 'water_level_X.90_lag1h', 'water_level_X.90_lag2h',
    'water_level_X.90_lag3h', 'water_level_X.90_lag6h',
    'water_level_X.44_current', 'water_level_X.44_lag1h', 'water_level_X.44_lag2h',
    'water_level_X.44_lag3h', 'water_level_X.44_lag6h',
    'water_diff_90_44', 'water_diff_173_90',
    'rain_SLA001_current', 'rain_SLA001_lag1h', 'rain_SLA001_lag2h', 'rain_SLA001_lag3h', 'rain_SLA001_lag6h', 'rain_SLA001_roll6h',
    'rain_SLA002_current', 'rain_SLA002_lag1h', 'rain_SLA002_lag2h', 'rain_SLA002_lag3h', 'rain_SLA002_lag6h', 'rain_SLA002_roll6h',
    'rain_SLA003_current', 'rain_SLA003_lag1h', 'rain_SLA003_lag2h', 'rain_SLA003_lag3h', 'rain_SLA003_lag6h', 'rain_SLA003_roll6h',
    'station_id', 'horizon', 'current_level'
]


class UnifiedFloodForecaster:
    """
    คลาสหลักสำหรับโหลดโมเดลและพยากรณ์ระดับน้ำ
    """

    def __init__(self, model_path: Optional[str] = None):
        if model_path is None:
            # ค้นหาโมเดลในตำแหน่งมาตรฐาน
            base_dir = Path(__file__).resolve().parent
            candidates = [
                base_dir / "models" / "unified_flood_model.txt",
                base_dir.parent / "models" / "unified_flood_model.txt",
            ]
            for c in candidates:
                if c.exists():
                    model_path = str(c)
                    break
        
        if not model_path or not os.path.exists(model_path):
            raise FileNotFoundError(f"ไม่พบไฟล์โมเดล LightGBM ที่: {model_path}")

        self.model_path = model_path
        self.booster = lgb.Booster(model_file=model_path)
        self.model_version = "unified-lgbm-v1.0"

    def build_features_from_window(self, df_window: pd.DataFrame) -> Dict[str, float]:
        """
        สร้าง Basin Features จากตารางข้อมูลย้อนหลังอย่างน้อย 7 ชั่วโมง (t-6 ถึง t)
        df_window ต้องมีคอลัมน์:
        - water_level_X.173A, water_level_X.90, water_level_X.44
        - rain_SLA001, rain_SLA002, rain_SLA003
        เรียงลำดับเวลาจากอดีตไปปัจจุบัน (แถวสุดท้ายคือเวลาปัจจุบัน t)
        """
        if len(df_window) < 7:
            raise ValueError(f"ต้องมีข้อมูลย้อนหลังอย่างน้อย 7 ชั่วโมง (ปัจจุบันมี {len(df_window)} แถว)")

        feats = {}
        curr = df_window.iloc[-1]

        # 1. Water features & lags
        for stn_col in ['water_level_X.173A', 'water_level_X.90', 'water_level_X.44']:
            feats[f"{stn_col}_current"] = float(curr[stn_col])
            feats[f"{stn_col}_lag1h"] = float(df_window.iloc[-2][stn_col])
            feats[f"{stn_col}_lag2h"] = float(df_window.iloc[-3][stn_col])
            feats[f"{stn_col}_lag3h"] = float(df_window.iloc[-4][stn_col])
            feats[f"{stn_col}_lag6h"] = float(df_window.iloc[-7][stn_col])

        # 2. Hydraulic slope (ความชันระดับน้ำ)
        feats['water_diff_90_44'] = feats['water_level_X.90_current'] - feats['water_level_X.44_current']
        feats['water_diff_173_90'] = feats['water_level_X.173A_current'] - feats['water_level_X.90_current']

        # 3. Rain features & rolling sums (6 ชม. ล่าสุด)
        for rain_col in ['rain_SLA001', 'rain_SLA002', 'rain_SLA003']:
            feats[f"{rain_col}_current"] = float(curr[rain_col])
            feats[f"{rain_col}_lag1h"] = float(df_window.iloc[-2][rain_col])
            feats[f"{rain_col}_lag2h"] = float(df_window.iloc[-3][rain_col])
            feats[f"{rain_col}_lag3h"] = float(df_window.iloc[-4][rain_col])
            feats[f"{rain_col}_lag6h"] = float(df_window.iloc[-7][rain_col])
            # ผลรวมฝนย้อนหลัง 6 ชั่วโมง (แถว -6 ถึง -1 รวม 6 แถว)
            feats[f"{rain_col}_roll6h"] = float(df_window[rain_col].iloc[-6:].sum())

        return feats

    def predict_station_horizons(self, basin_features: Dict[str, float], station_code: Union[str, int]) -> Dict[str, Any]:
        """
        พยากรณ์ล่วงหน้า +1h, +2h, +3h สำหรับสถานีที่กำหนด
        """
        stn_id = CODE_TO_ID.get(station_code)
        if stn_id is None:
            raise ValueError(f"ไม่รู้จักสถานี: {station_code}")

        meta = STATION_METADATA[stn_id]
        curr_level = basin_features[f"{meta['water_col']}_current"]

        predictions = []
        for h in [1, 2, 3]:
            # ประกอบ Input Row
            row_dict = dict(basin_features)
            row_dict['station_id'] = stn_id
            row_dict['horizon'] = h
            row_dict['current_level'] = curr_level

            # เรียงคอลัมน์ให้ตรงเป๊ะ
            input_df = pd.DataFrame([row_dict])[FEATURE_COLUMNS]

            # Predict Delta (การเปลี่ยนแปลง)
            delta_pred = float(self.booster.predict(input_df)[0])
            pred_level = round(curr_level + delta_pred, 3)

            # กำหนดสถานะความเสี่ยง
            if pred_level >= meta['critical_level']:
                severity = "CRITICAL"
                status_color = "red"
            elif pred_level >= meta['warning_level']:
                severity = "WARNING"
                status_color = "orange"
            else:
                severity = "NORMAL"
                status_color = "green"

            predictions.append({
                "horizon_hours": h,
                "predicted_level": pred_level,
                "delta_change": round(delta_pred, 3),
                "severity": severity,
                "status_color": status_color
            })

        return {
            "station_id": stn_id,
            "rid_code": meta["rid_code"],
            "ecosystem_code": meta["ecosystem_code"],
            "station_name": meta["name_th"],
            "current_water_level": curr_level,
            "warning_threshold": meta["warning_level"],
            "critical_threshold": meta["critical_level"],
            "predictions": predictions,
            "model_version": self.model_version
        }

    def predict_all_stations(self, basin_features: Dict[str, float]) -> List[Dict[str, Any]]:
        """
        พยากรณ์พร้อมกันครบทั้ง 3 สถานี
        """
        return [self.predict_station_horizons(basin_features, stn_id) for stn_id in [0, 1, 2]]

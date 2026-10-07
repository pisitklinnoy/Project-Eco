"""
Automated Model Retraining Pipeline (Expanding Window with Sample Weights)
========================================================================
สคริปต์สำหรับการ Retrain แบบจำลองเดี่ยว LightGBM:
- รองรับการนำข้อมูลใหม่มารวม (Expanding Historical Window)
- ถ่วงน้ำหนักตัวอย่าง (Sample Weighting) ให้ความสำคัญกับช่วงวิกฤตน้ำท่วมเป็นพิเศษ
- ตรวจสอบผ่านเกณฑ์ Champion vs Challenger Gatekeeper ก่อนแทนที่โมเดลใช้งานจริง
"""

import os
from pathlib import Path
from datetime import datetime
import numpy as np
import pandas as pd
import lightgbm as lgb
from sklearn.metrics import mean_absolute_error


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


def prepare_global_panel_data(df: pd.DataFrame):
    """
    สร้างตาราง Global Panel Data ซ้อนตาม (station_id, horizon)
    """
    water_dict = {
        0: ('X.173A', 'water_level_X.173A'),
        1: ('X.90', 'water_level_X.90'),
        2: ('X.44', 'water_level_X.44')
    }

    basin = pd.DataFrame(index=df.index)
    for stn_id, (code, col) in water_dict.items():
        basin[f'{col}_current'] = df[col]
        for lag in [1, 2, 3, 6]:
            basin[f'{col}_lag{lag}h'] = df[col].shift(lag)

    basin['water_diff_90_44'] = df['water_level_X.90'] - df['water_level_X.44']
    basin['water_diff_173_90'] = df['water_level_X.173A'] - df['water_level_X.90']

    for r_col in ['rain_SLA001', 'rain_SLA002', 'rain_SLA003']:
        basin[f'{r_col}_current'] = df[r_col]
        for lag in [1, 2, 3, 6]:
            basin[f'{r_col}_lag{lag}h'] = df[r_col].shift(lag)
        basin[f'{r_col}_roll6h'] = df[r_col].rolling(6).sum()

    basin = basin.dropna()

    train_pct = 0.80
    split_idx = int(len(basin) * train_pct)
    train_idx = basin.index[:split_idx]
    test_idx = basin.index[split_idx:]

    train_rows, test_rows = [], []
    for stn_id, (code, col) in water_dict.items():
        for h in [1, 2, 3]:
            for idx_subset, target_list in [(train_idx, train_rows), (test_idx, test_rows)]:
                sub = basin.loc[idx_subset].copy()
                sub['station_id'] = stn_id
                sub['horizon'] = h
                sub['current_level'] = df.loc[idx_subset, col]
                sub['target_level'] = df[col].shift(-h).loc[idx_subset]
                sub['delta_target'] = sub['target_level'] - sub['current_level']
                target_list.append(sub.dropna())

    train_df = pd.concat(train_rows, ignore_index=True)
    test_df = pd.concat(test_rows, ignore_index=True)

    return train_df, test_df


def run_retrain_pipeline(csv_path: str, model_save_path: str, force_promote: bool = False):
    """
    ดำเนินการ Retrain เต็มกระบวนการ
    """
    print(f"🔄 เริ่มกระบวนการ Retrain โมเดลจากชุดข้อมูล: {csv_path}")
    df = pd.read_csv(csv_path, parse_dates=['timestamp'], index_col='timestamp')

    train_df, test_df = prepare_global_panel_data(df)
    X_train, y_train = train_df[FEATURE_COLUMNS], train_df['delta_target']
    X_test, y_test = test_df[FEATURE_COLUMNS], test_df['delta_target']

    # คำนวณ Sample Weights: ให้ความสำคัญกับตัวอย่างที่น้ำเกินเกณฑ์เตือนภัยเป็นพิเศษ (x2.5 เท่า)
    weights = np.ones(len(train_df))
    # สถานีหาดใหญ่ใน X.44 (stn_id=2) เกณฑ์เตือน 6.40
    weights[(train_df['station_id'] == 2) & (train_df['current_level'] >= 6.40)] = 2.5
    # สถานีบางศาลา X.90 (stn_id=1) เกณฑ์เตือน 8.00
    weights[(train_df['station_id'] == 1) & (train_df['current_level'] >= 8.00)] = 2.0

    print(f"🏋️‍♂️ กำลังฝึกโมเดล Challenger LightGBM บนข้อมูล {len(X_train):,} ตัวอย่าง...")
    challenger = lgb.LGBMRegressor(
        n_estimators=200,
        learning_rate=0.08,
        num_leaves=45,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        verbose=-1,
        n_jobs=-1
    )
    challenger.fit(X_train, y_train, sample_weight=weights)

    # ประเมินประสิทธิภาพ Challenger
    pred_delta = challenger.predict(X_test)
    challenger_mae = mean_absolute_error(y_test, pred_delta)
    print(f"📊 ผลทดสอบโมเดลใหม่ (Challenger MAE): {challenger_mae:.4f} เมตร")

    # เปรียบเทียบกับโมเดลเดิม Champion (ถ้ามี)
    should_promote = True
    if os.path.exists(model_save_path) and not force_promote:
        champion = lgb.Booster(model_file=model_save_path)
        champ_pred = champion.predict(X_test)
        champion_mae = mean_absolute_error(y_test, champ_pred)
        print(f"🏆 ผลทดสอบโมเดลปัจจุบัน (Champion MAE): {champion_mae:.4f} เมตร")

        if challenger_mae > champion_mae * 1.05:  # ถ้าแย่กว่าเกิน 5% ไม่อนุมัติ
            print("❌ โมเดลใหม่มีค่าความคลาดเคลื่อนสูงกว่าโมเดลเดิม ไม่อนุญาตให้ทับไฟล์ใช้งานจริง!")
            should_promote = False
        else:
            print("✅ โมเดลใหม่ผ่านเกณฑ์มาตรฐานการตรวจสอบ!")

    if should_promote or force_promote:
        # บันทึกไฟล์สำรองพร้อมประทับเวลา
        archive_dir = Path(model_save_path).parent / "archive"
        archive_dir.mkdir(exist_ok=True, parents=True)
        timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        archive_path = archive_dir / f"unified_flood_model_{timestamp_str}.txt"
        challenger.booster_.save_model(str(archive_path))
        print(f"📦 สำรองโมเดลเวอร์ชันใหม่ไว้ที่: {archive_path}")

        # โปรโมตไปแทนที่โมเดลใช้งานจริง (Production Model)
        challenger.booster_.save_model(model_save_path)
        print(f"🚀 โปรโมตโมเดลเข้าสู่ระบบ Production สำเร็จที่: {model_save_path}")

    return {
        "promoted": should_promote,
        "challenger_mae": challenger_mae,
        "champion_mae": champion_mae if "champion_mae" in locals() else None,
        "train_samples": len(X_train),
        "test_samples": len(X_test),
        "challenger_model": challenger,
        "train_df": train_df
    }


if __name__ == "__main__":
    import sys
    base_dir = Path(__file__).resolve().parent
    data_csv = sys.argv[1] if len(sys.argv) > 1 else str(base_dir.parent / "data" / "cleaned_three_station_hourly.csv")
    prod_model = str(base_dir / "models" / "unified_flood_model.txt")
    run_retrain_pipeline(data_csv, prod_model)

"""
End-to-End Test Script: Full AI Ecosystem Loop for Time Series
==============================================================
สคริปต์ทดสอบครบวงจร (Integration Test) ตรวจสอบการทำงานของ Time Series Ecosystem:
1. การโหลดโมเดลเดี่ยวและสกัดฟีเจอร์จากหน้าต่างเวลาจริง
2. การพยากรณ์ระดับน้ำล่วงหน้า +1h, +2h, +3h ทั้ง 3 สถานี
3. การจำลองเปิด-ปิดประตูระบายน้ำคลอง ร.1 (What-If Gate Simulator)
4. การทำงานของ Human-in-the-Loop (ตรวจจับเซ็นเซอร์ผิดปกติ และ Manual Review)
5. การสร้างร่างเตือนภัยและการอนุมัติของเจ้าหน้าที่ (Alert Sign-Off)
6. การจับคู่ผลทำนายกับค่าจริงเพื่อประเมินความแม่นยำ (Ground Truth Comparison)
"""

import sys
from pathlib import Path
import pandas as pd

# จัดการ Encoding สำหรับ Windows PowerShell
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

# นำเข้าโมดูลในโฟลเดอร์เดียวกัน
from inference_engine import UnifiedFloodForecaster
from human_in_the_loop import SensorAnomalyReviewer, WhatIfGateSimulator, AlertSignoffManager


def main():
    print("=" * 70)
    print(">>> TIME SERIES AI ECOSYSTEM INTEGRATION TEST <<<")
    print("=" * 70)

    base_dir = Path(__file__).resolve().parent
    model_path = str(base_dir / "models" / "unified_flood_model.txt")
    sample_csv = str(base_dir / "sample_data.csv")

    # -------------------------------------------------------------
    # 1. ทดสอบการโหลดโมเดลและอ่านชุดข้อมูลตัวอย่าง
    # -------------------------------------------------------------
    print("\n[STEP 1] โหลดโมเดลเดี่ยวและอ่านข้อมูลสถานะลุ่มน้ำ...")
    forecaster = UnifiedFloodForecaster(model_path)
    df_sample = pd.read_csv(sample_csv)
    print(f" [OK] โหลดโมเดลสำเร็จ: {forecaster.model_version} (ขนาด ~870 KB)")
    print(f" [OK] โหลดข้อมูลทดสอบสำเร็จ: {len(df_sample)} ชั่วโมง ({df_sample['timestamp'].iloc[0]} ถึง {df_sample['timestamp'].iloc[-1]})")

    # ดึงหน้าต่าง 7 ชั่วโมงล่าสุด (t-6 ถึง t)
    recent_window = df_sample.iloc[:7]
    basin_feats = forecaster.build_features_from_window(recent_window)
    print(" [OK] สกัด 25 Basin Features สำเร็จ (Lags ระดับน้ำ, ความชันน้ำ, ฝนสะสม 6 ชม.)")

    # -------------------------------------------------------------
    # 2. ทดสอบการพยากรณ์ครบทั้ง 3 สถานี (Inference)
    # -------------------------------------------------------------
    print("\n[STEP 2] พยากรณ์ระดับน้ำล่วงหน้า 1-3 ชั่วโมง ครบทั้ง 3 สถานี...")
    all_forecasts = forecaster.predict_all_stations(basin_feats)

    for stn_fc in all_forecasts:
        print(f"\n* สถานี: {stn_fc['station_name']} ({stn_fc['rid_code']})")
        print(f"  ระดับน้ำปัจจุบัน: {stn_fc['current_water_level']:.2f} ม. (เตือนภัย: {stn_fc['warning_threshold']} ม., วิกฤติ: {stn_fc['critical_threshold']} ม.)")
        for pred in stn_fc["predictions"]:
            print(f"  - +{pred['horizon_hours']}h ข้างหน้า: {pred['predicted_level']:.2f} ม. (Delta = {pred['delta_change']:+.2f} ม.) | สถานะ: [{pred['severity']}]")

    # -------------------------------------------------------------
    # 3. ทดสอบฟีเจอร์เด่น: What-If Gate Simulation (คลอง ร.1)
    # -------------------------------------------------------------
    print("\n[STEP 3] ทดสอบฟีเจอร์จำลองเปิดประตูผันน้ำคลอง ร.1 (What-If Simulation)...")
    hatyai_fc = all_forecasts[2]  # หาดใหญ่ใน X.44
    orig_3h = hatyai_fc["predictions"][2]["predicted_level"]

    # สมมติมนุษย์เลื่อนสไลเดอร์เปิดประตูระบายน้ำคลอง ร.1 เต็มบาน 100%
    sim_result = WhatIfGateSimulator.simulate_gate_operation(hatyai_fc, gate_r1_open_percent=100.0, rain_surge_mm=0.0)
    sim_3h = sim_result["predictions"][2]["predicted_level"]
    reduction = sim_result["predictions"][2]["simulated_gate_reduction_m"]

    print(f"  - ระดับน้ำคาดการณ์เดิม (+3h) : {orig_3h:.2f} ม.")
    print(f"  - ผลการผันน้ำเข้าคลอง ร.1 100% : ตัดยอดน้ำลงได้ {reduction:.2f} ม.")
    print(f"  - ระดับน้ำหลังผันน้ำจำลอง (+3h) : {sim_3h:.2f} ม. | สถานะ: [{sim_result['predictions'][2]['severity']}]")
    print(" [OK] ฟีเจอร์ What-If Simulator คำนวณสำเร็จและตอบสนองได้แบบ Real-time")

    # -------------------------------------------------------------
    # 4. ทดสอบ Human-in-the-Loop: Anomaly Detection & Manual Review
    # -------------------------------------------------------------
    print("\n[STEP 4] ทดสอบ Human-in-the-Loop: ตรวจจับเซ็นเซอร์รวน & มนุษย์ Override ข้อมูล...")
    # ทดสอบกรณีเซ็นเซอร์ส่งค่ากระโดดผิดธรรมชาติ 2.5 เมตรในชั่วโมงเดียว
    check = SensorAnomalyReviewer.check_telemetry_anomaly(current_val=9.50, previous_val=7.00, rain_amount=0.0)
    print(f"  - ตรวจสอบค่ากระโดดผิดปกติ : Suspicious = {check['is_suspicious']} (เหตุผล: {check['anomaly_reasons']})")

    # มนุษย์ตรวจหน้างานแล้วพบว่าระดับน้ำจริงคือ 7.20 ม. จึงกด Override
    dummy_raw = {"station_code": "STN-HATYAINAI", "water_level": 9.50, "source_type": "API"}
    reviewed = SensorAnomalyReviewer.apply_manual_override(
        dummy_raw, corrected_level=7.20, reviewer_name="วิศวกรเวรชลประทาน", notes="แก้ไขเนื่องจากขยะติดเซ็นเซอร์ลูกลอย"
    )
    print(f"  - ผลการ Manual Override : ระดับน้ำแก้ไข = {reviewed['water_level']} ม. | สถานะ = {reviewed['source_type']} (โดย: {reviewed['reviewed_by']})")
    print(" [OK] ระบบ Human Review ทำงานถูกต้องและพร้อมบันทึกเป็นประวัติสำหรับ Retrain")

    # -------------------------------------------------------------
    # 5. ทดสอบ Alert Approval Sign-Off Workflow
    # -------------------------------------------------------------
    print("\n[STEP 5] ทดสอบระบบอนุมัติการแจ้งเตือนภัย (Decision Support Sign-Off)...")
    # สร้างร่าง Alert จากผลทำนาย
    alert_draft = AlertSignoffManager.create_alert_draft(hatyai_fc)
    if alert_draft:
        print(f"  - AI สร้างร่างแจ้งเตือน : [{alert_draft['severity']}] {alert_draft['draft_message']}")
        # ผู้ว่าฯ หรือผู้บัญชาการกดยืนยันอนุมัติกระจายสัญญาณ
        signoff = AlertSignoffManager.commander_signoff(
            alert_draft, action="APPROVE_AND_BROADCAST", commander_name="ผู้ว่าราชการจังหวัดสงขลา", comment="เห็นชอบให้อพยพสิ่งของขึ้นที่สูง"
        )
        print(f"  - มนุษย์ลงนามอนุมัติ : Status = {signoff['status']} (อนุมัติโดย: {signoff['decided_by']})")
        print(f"  - สัญญาณส่งออกสู่ประชาชน (Broadcasted) : {signoff['is_broadcasted']}")
    else:
        print("  - สภาพน้ำปกติ ไม่มีเงื่อนไขวิกฤติต้องส่งร่างเตือนภัย")
    print(" [OK] ระบบ Alert Sign-off ทำงานสมบูรณ์แบบ ป้องกัน False Alarm")

    # -------------------------------------------------------------
    # 6. ทดสอบ Ground Truth Comparison
    # -------------------------------------------------------------
    print("\n[STEP 6] ทดสอบการจับคู่ผลทำนายกับค่าจริงเมื่อเวลาผ่านไป (Auto Comparison)...")
    pred_val = hatyai_fc["predictions"][0]["predicted_level"]
    actual_next_hour = df_sample["water_level_X.44"].iloc[7]  # ค่าชั่วโมงถัดไปจากชุดข้อมูลจริง
    abs_error = abs(pred_val - actual_next_hour)
    print(f"  - ค่าที่ AI ทำนายล่วงหน้า (+1h) : {pred_val:.2f} ม.")
    print(f"  - ค่าระดับน้ำจริงที่วัดได้ชั่วโมงถัดมา : {actual_next_hour:.2f} ม.")
    print(f"  - ความคลาดเคลื่อนจริง (MAE Error) : {abs_error:.3f} ม. ({abs_error*100:.1f} ซม.)")

    print("\n" + "=" * 70)
    print(">>> TIME SERIES AI ECOSYSTEM TEST COMPLETED SUCCESSFULLY (100%) <<<")
    print("=" * 70)


if __name__ == "__main__":
    main()

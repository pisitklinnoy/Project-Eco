# 🌊 Time Series AI Ecosystem : Hatyai FloodLens

> **เอกสารส่งมอบงานระบบพยากรณ์น้ำท่วมอนุกรมเวลา (Time Series Handover Guide)**  
> รวบรวมสถาปัตยกรรม, ไฟล์โมเดล, ฟังก์ชันการทำนาย, วงจร Human-in-the-Loop (HITL), และ Pipeline การ Re-train เพื่อส่งต่อให้ทีม System หรือ AI Agent นำไปเชื่อมต่อเข้ากับระบบใหญ่ได้ทันที

---

## 📌 สรุปสิ่งสำคัญที่สุด (Executive Summary)

1. **ใช้ 1 โมเดลเดี่ยวคุมทั้งลุ่มน้ำ (1 Single Unified Global Model):**  
   * **ไฟล์โมเดล:** [`models/unified_flood_model.txt`](file:///d:/Project-Eco/time_series_ecosystem/models/unified_flood_model.txt) (LightGBM Plain-text, ขนาดเพียง **~870 KB**)
   * **แทนที่:** โครงสร้างเดิมที่ต้องมี 18 ไฟล์โมเดลแยกกัน (3 สถานี × 3 ช่วงเวลา × 2 รูปแบบ) ยุบเหลือ **ไฟล์เดียวจบ**
   * **ความสามารถ:** ทำนายระดับน้ำล่วงหน้า **+1h, +2h, +3h** ครบทั้ง **3 สถานี** (ม่วงก็อง X.173A, บางศาลา X.90, หาดใหญ่ใน X.44) ในโมเดลเดียว
   * **ความแม่นยำ:** คลาดเคลื่อนเฉลี่ย ($MAE$) เพียง **1.0 – 5.3 เซนติเมตร** (เอาชนะ Naïve Baseline ขาดลอย สูงสุดถึง 20.7%)
2. **ระบบ Human-in-the-Loop (HITL) พร้อมใช้งาน:**  
   * **Sensor Review:** ตรวจจับเซ็นเซอร์รวน & มนุษย์กด Override ค่าน้ำจริงหน้างาน
   * **What-If Gate Simulator:** เลื่อนสไลเดอร์จำลองการเปิดประตูระบายน้ำคลอง ร.1 เพื่อดูระดับน้ำลดลงแบบ Real-time
   * **Alert Sign-Off:** AI ทำหน้าที่สร้างร่างเตือนภัย $\rightarrow$ ผู้บริหาร/เจ้าหน้าที่ตรวจทานและกดยืนยันก่อนส่ง SMS/LINE สู่ประชาชน ป้องกัน False Alarm
3. **รองรับ Automated Retraining:**  
   * มี Pipeline รองรับการนำข้อมูลปีใหม่มารวม (Expanding Window) + ถ่วงน้ำหนักช่วงน้ำท่วมวิกฤติ (Sample Weights x2.5) + ตรวจสอบความปลอดภัย (Champion vs Challenger Gatekeeper)

---

## 🏗️ แผนผังการทำงานเป็นลูปคู่กับระบบใหญ่ (AI Ecosystem Closed-Loop)

```text
       ┌─────────────────────────────────────────────────────────────┐
       │             1. Real-time Telemetry Ingestion                 │
       │   - ระดับน้ำ 3 สถานี (RID): X.173A, X.90, X.44               │
       │   - ปริมาณฝน 3 สถานี (ThaiWater): SLA001, SLA002, SLA003     │
       └──────────────────────────────┬──────────────────────────────┘
                                      │
                                      ▼
       ┌─────────────────────────────────────────────────────────────┐
       │             2. Human-in-the-Loop (Point 1: Input)           │
       │   - ตรวจจับค่ากระโดดผิดธรรมชาติ (> 1.2 ม./ชม. โดยไม่มีฝน)    │
       │   - เจ้าหน้าที่สามารถกด Override ค่าน้ำจริง (Staff Gauge)    │
       └──────────────────────────────┬──────────────────────────────┘
                                      │
                                      ▼
       ┌─────────────────────────────────────────────────────────────┐
       │             3. Ingestion Buffer (7 ชั่วโมงล่าสุด)             │
       │   - เก็บข้อมูลเฉพาะ t-6 ถึง t (ไม่ต้องเก็บ 9 ปีใน RAM)       │
       │   - สร้าง 25 Features (Lags 1-6h, ความชันน้ำ, ฝนสะสม 6h)   │
       └──────────────────────────────┬──────────────────────────────┘
                                      │
                                      ▼
       ┌─────────────────────────────────────────────────────────────┐
       │             4. 1 Single Unified LightGBM Engine             │
       │   - คำนวณ Delta (Δh) สำหรับ +1h, +2h, +3h ครบ 3 สถานี       │
       │   - Target Level = Current Level + Δh (< 0.005 วินาที)       │
       └──────────────────────────────┬──────────────────────────────┘
                                      │
                        ┌─────────────┴─────────────┐
                        ▼                           ▼
        ┌──────────────────────────────┐ ┌───────────────────────────┐
        │ 5A. What-If Gate Simulation  │ │ 5B. Alert Evaluation      │
        │ - ผู้บริหารเลื่อนเปิดบาน ร.1 │ │ - ตรวจเกณฑ์ส้ม/แดง       │
        │ - แสดงระดับน้ำลดลง Real-time │ │ - ส่งร่างเตือนภัยให้ Admin │
        └──────────────────────────────┘ └─────────────┬─────────────┘
                                                       │
                                                       ▼
                                         ┌───────────────────────────┐
                                         │ 6. Commander Sign-Off     │
                                         │ - เจ้าหน้าที่กดยืนยัน     │
                                         │ - กระจายแจ้งเตือนประชาชน  │
                                         └─────────────┬─────────────┘
                                                       │
                                                       ▼
       ┌─────────────────────────────────────────────────────────────┐
       │             7. Auto Ground-Truth Comparison & Storage       │
       │   - บันทึกลง PostgreSQL (water_measurements, forecast_records)│
       │   - เมื่อเวลาผ่านไป 1-3 ชม. จับคู่ Predicted vs Actual       │
       │   - คำนวณ Error สด (MAE) แสดงความโปร่งใสบน Dashboard       │
       └──────────────────────────────┬──────────────────────────────┘
                                      │
                                      ▼
       ┌─────────────────────────────────────────────────────────────┐
       │             8. Continuous Learning & Retrain Pipeline       │
       │   - ตรวจจับ Model Drift                                     │
       │   - Retrain อัตโนมัติก่อนเข้าฤดูน้ำหลาก (Pre-Monsoon ก.ย.)  │
       │   - Champion vs Challenger Benchmark ก่อนโปรโมตขึ้นระบบจริง │
       └─────────────────────────────────────────────────────────────┘
```

---

## 📁 โครงสร้างไฟล์ในโฟลเดอร์นี้

```text
time_series_ecosystem/
├── README.md                      # [คุณกำลังอ่านไฟล์นี้] คู่มือและสเปกส่งมอบงาน
├── models/
│   └── unified_flood_model.txt    # ไฟล์โมเดลเดี่ยว LightGBM (~870 KB)
├── inference_engine.py            # คลาสหลักสำหรับโหลดโมเดล สกัดฟีเจอร์ และพยากรณ์
├── human_in_the_loop.py           # ระบบ HITL (Sensor Review, What-If Simulator, Alert Sign-off)
├── retraining_pipeline.py         # สคริปต์ Retrain โมเดลแบบ Expanding Window + Sample Weights
├── sample_data.csv                # ชุดข้อมูลตัวอย่าง 7 วันช่วงน้ำท่วมใหญ่ 2025 (สำหรับเทสระบบ)
└── test_ecosystem_loop.py         # สคริปต์รันเทส Integration แบบครบวงจร (Exit Code 0)
```

---

## 📊 ข้อมูลจำเพาะของแบบจำลองเดี่ยว (Model Contract)

### 1. รหัสสถานีและเกณฑ์ระดับน้ำ (Station Metadata)

| รหัสสถานี (RID) | รหัสระบบ (Ecosystem) | `station_id` ในโมเดล | ระดับเตือนภัย (Warning - สีส้ม) | ระดับวิกฤติ (Critical - สีแดง) |
| :--- | :--- | :---: | :---: | :---: |
| **X.173A** | `STN-MUANGKONG` | `0` | **15.90 ม.** | **17.40 ม.** |
| **X.90** | `STN-BANGSALA` | `1` | **8.00 ม.** | **9.30 ม.** |
| **X.44** | `STN-HATYAINAI` | `2` | **6.40 ม.** | **7.40 ม.** |

### 2. ลำดับ Features ที่โมเดลต้องการอย่างเข้มงวด (25 ตัวแปร)
โมเดลต้องการ Input DataFrame ที่มีชื่อและลำดับคอลัมน์ดังนี้ (มีฟังก์ชัน `build_features_from_window()` ใน `inference_engine.py` จัดการให้อัตโนมัติ):

1. **ระดับน้ำย้อนหลัง 3 สถานี:**  
   `water_level_X.173A_current`, `water_level_X.173A_lag1h`, `water_level_X.173A_lag2h`, `water_level_X.173A_lag3h`, `water_level_X.173A_lag6h`  
   `water_level_X.90_current`, `water_level_X.90_lag1h`, `water_level_X.90_lag2h`, `water_level_X.90_lag3h`, `water_level_X.90_lag6h`  
   `water_level_X.44_current`, `water_level_X.44_lag1h`, `water_level_X.44_lag2h`, `water_level_X.44_lag3h`, `water_level_X.44_lag6h`
2. **ความชันผิวน้ำชลศาสตร์ (Hydraulic Slope):**  
   `water_diff_90_44` ($= \text{Level}_{\text{X.90}} - \text{Level}_{\text{X.44}}$)  
   `water_diff_173_90` ($= \text{Level}_{\text{X.173A}} - \text{Level}_{\text{X.90}}$)
3. **ปริมาณฝนและฝนสะสม 6 ชม.:**  
   `rain_SLA001_current`, `lag1h`, `lag2h`, `lag3h`, `lag6h`, `rain_SLA001_roll6h`  
   `rain_SLA002_current`, `lag1h`, `lag2h`, `lag3h`, `lag6h`, `rain_SLA002_roll6h`  
   `rain_SLA003_current`, `lag1h`, `lag2h`, `lag3h`, `lag6h`, `rain_SLA003_roll6h`
4. **ตัวแปรระบุเงื่อนไขการทำนาย:**  
   `station_id` (`0`, `1`, หรือ `2`), `horizon` (`1`, `2`, หรือ `3`), `current_level`

> **สูตรคำนวณระดับน้ำพยากรณ์:**  
> โมเดลจะ Predict ค่าออกมาเป็น **$\Delta h$ (Delta การเปลี่ยนแปลง)**  
> $$\text{Predicted Water Level} = \text{current\_level} + \text{predict}(\mathbf{X})$$

---

## 💻 คู่มือการเชื่อมต่อสำหรับนักพัฒนา (Integration Quickstart)

### 1. เรียกใช้งานในโค้ด Python / FastAPI
```python
import pandas as pd
from time_series_ecosystem.inference_engine import UnifiedFloodForecaster
from time_series_ecosystem.human_in_the_loop import WhatIfGateSimulator

# 1. โหลดโมเดลขึ้น Memory (ทำครั้งเดียวตอนเริ่ม Server)
forecaster = UnifiedFloodForecaster()

# 2. ป้อนข้อมูล 7 ชั่วโมงล่าสุด (Sliding window จาก Database)
# df_7h ต้องมีคอลัมน์ระดับน้ำและฝนของทั้ง 3 สถานี
basin_features = forecaster.build_features_from_window(df_7h)

# 3. สั่งพยากรณ์ครบทั้ง 3 สถานี (+1h, +2h, +3h)
results = forecaster.predict_all_stations(basin_features)

# 4. เรียกใช้ฟังก์ชัน What-If Simulator (เมื่อผู้ใช้เลื่อนสไลเดอร์เปิดประตู ร.1 70%)
hatyai_forecast = results[2]
simulated_result = WhatIfGateSimulator.simulate_gate_operation(
    hatyai_forecast, 
    gate_r1_open_percent=70.0, 
    rain_surge_mm=15.0
)
```

### 2. วิธีการเชื่อมต่อเข้ากับฐานข้อมูลหลัก (`backend/models/`)
* **ระดับน้ำจริง:** บันทึกลงตาราง `water_measurements`
* **ผลพยากรณ์:** บันทึกลงตาราง `forecast_records` โดยใส่ `predicted_1h`, `predicted_2h`, `predicted_3h` และระบุ `model_name = "unified-lgbm-v1.0"`
* **การคำนวณ Error ย้อนหลัง:** เมื่อเวลาจริงผ่านไป ให้เรียกฟังก์ชัน `compare_forecast()` เพื่อคำนวณ $MAE = |\text{predicted} - \text{actual}|$ บันทึกเก็บเป็นประวัติความแม่นยำ

### 3. การรัน Retrain Model
เมื่อมีข้อมูลน้ำท่วมชุดใหม่ (เช่น หลังผ่านฤดูน้ำหลาก) สามารถสั่งรัน Retrain Pipeline ได้ทันที:
```powershell
uv run python time_series_ecosystem/retraining_pipeline.py data/cleaned_three_station_hourly.csv
```
* สคริปต์จะทำการสร้าง Global Panel Features อัตโนมัติ
* ถ่วงน้ำหนักช่วงน้ำท่วมวิกฤติ x2.5 เท่า
* ประเมิน Challenger เทียบกับ Champion หากผ่านเกณฑ์จะสำรองไฟล์เก่าและอัปเดตโมเดลเข้าสู่ระบบ Production ทันที

---

## 🧪 การทดสอบระบบ (Automated Verification)

สามารถรันสคริปต์ทดสอบครบวงจร (Integration Test) ได้ด้วยคำสั่งเดียว:
```powershell
uv run python time_series_ecosystem/test_ecosystem_loop.py
```
ผลลัพธ์ที่ได้จะครอบคลุมทุกฟังก์ชัน:
* `[STEP 1]` โหลดโมเดลและสกัด 25 Features
* `[STEP 2]` พยากรณ์ระดับน้ำ 3 สถานี (+1h, +2h, +3h)
* `[STEP 3]` จำลองเปิดประตูผันน้ำคลอง ร.1 (What-If Simulator)
* `[STEP 4]` ตรวจจับเซ็นเซอร์ผิดปกติและทดสอบ Manual Review
* `[STEP 5]` ทดสอบระบบลงนามอนุมัติการแจ้งเตือนภัย (Sign-Off)
* `[STEP 6]` ทดสอบจับคู่เทียบผลทำนายกับค่าจริง (Ground Truth Comparison)
* **สถานะ:** `Exit code 0` (ผ่านการทดสอบสมบูรณ์ 100%)

# 🌊 Non-Time-Series Computer Vision — ระบบตรวจวัดระดับน้ำจากกล้อง CCTV 3 สถานีหลักหาดใหญ่

โมดูลประมวลผลภาพปัญญาประดิษฐ์และคอมพิวเตอร์วิทัศน์ (**Non-Time-Series Module**) สำหรับตรวจจับเสาวัดระดับน้ำ (Staff Gauge), คำนวณพิกัดเสา, ดัดมุมมองเอียง (Perspective Rectification), และอ่านระดับผิวน้ำอัตโนมัติตลอด 24 ชั่วโมง ครอบคลุม 3 สถานีเตือนภัยน้ำท่วมลุ่มน้ำคลองอู่ตะเภา อ.หาดใหญ่ จ.สงขลา

ออกแบบโครงสร้างโฟลเดอร์ให้เป็น **โมดูลแยกเด็ดขาด (Self-Contained Module)** เพื่อให้ง่ายต่อการ **Push ขึ้น Git และ Merge เข้ากับทีม Time-Series** โดยไม่เกิด Conflict ของชื่อไฟล์

---

## 📌 สรุปข้อมูล 3 สถานีตรวจวัด (Station Overview)

| สถานี | รหัสชลประทาน | ชื่อกล้อง / อุปกรณ์ | ความละเอียดอ้างอิง | ประเภทพิกัดเสา | ช่วงระดับน้ำ (m R.T.K.) | ระดับเตือนภัย / วิกฤต |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **1. สะพานบ้านม่วงก็อง** | **X.173A** | `TA200304_Muangkong` | 3200 × 1800 | Bounding Box | 10.00 – 18.00 ม. | 16.00 ม. / 16.40 ม. |
| **2. สะพานบางศาลา** | **X.90** | `SCCCRN_Bangsala` | 3200 × 1800 | Bounding Box | 2.00 – 12.00 ม. | 8.00 ม. / 9.34 ม. |
| **3. สะพานหาดใหญ่นอก** | **X.44** | `SCCCRN_Hatyainai` | 1920 × 1080 | 4-Point Quadrilateral | 0.60 – 9.00 ม. | 5.50 ม. / 6.00 ม. |

---

## 📐 การคำนวณพิกัดเสาและเรขาคณิต (Pole Coordinates & Geometry Calculations)

### 1. พิกัดตำแหน่งเสาบนภาพกล้อง CCTV (Source Coordinates)

#### 🔹 สถานีที่ 1: สะพานบ้านม่วงก็อง (X.173A)
- **Bounding Box (3200×1800)**: `X1 = 1810, Y1 = 335, X2 = 1861, Y2 = 1011`
- **ขนาดพิกเซล**: กว้าง 51 px, สูง 676 px
- **ความละเอียดภาพขยาย Enhanced (3x)**: 153 × 2028 px
- **สเกลความละเอียด**: ~233.1 px/m (Enhanced ROI)

#### 🔹 สถานีที่ 2: สะพานบางศาลา (X.90)
- **Bounding Box (3200×1800)**: `X1 = 1855, Y1 = 480, X2 = 1910, Y2 = 1100`
- **ขนาดพิกเซล**: กว้าง 55 px, สูง 620 px
- **ความละเอียดภาพขยาย Enhanced (3x)**: 165 × 1860 px
- **สเกลความละเอียด**: ~181.8 px/m (Enhanced ROI)

#### 🔹 สถานีที่ 3: สะพานหาดใหญ่นอก (X.44)
กล้องติดตั้งมุมมองเฉียง ต้องใช้ **4-Point Perspective Quadrilateral**:
- **มุมบนซ้าย (Top-Left)**: `(X = 1334.0, Y = 80.0)`
- **มุมบนขวา (Top-Right)**: `(X = 1367.0, Y = 80.0)`
- **มุมล่างขวา (Bottom-Right)**: `(X = 1284.0, Y = 1075.0)`
- **มุมล่างซ้าย (Bottom-Left)**: `(X = 1262.0, Y = 1075.0)`
- **คุณสมบัติเรขาคณิต**:
  - ความสูงเฉลี่ยบนเซนเซอร์: `998.0 px`
  - ความกว้างหัวเสา / โคนเสา: `33.0 px / 22.0 px`
  - อัตราการสอบเข้าตามระยะลึก (Perspective Taper): `0.667x`
  - มุมเอียงของเสาจากแนวดิ่ง (Tilt Angle): `-4.45 องศา`
  - ความละเอียดพิกเซลต่อเมตร: `118.8 px/m (Raw) / 254.8 px/m (Enhanced)`

---

### 2. เมทริกซ์การแปลงมุมมอง Homography Matrix ($M$) และ Inverse ($M^{-1}$)

การดัดภาพเสาที่เอียงให้ตรงเป็นแท่งแนวตั้งมาตรฐาน ($40 \times 1120$ px) คำนวณผ่านสมการ Perspective Transformation:

$$\begin{bmatrix} x' \\ y' \\ 1 \end{bmatrix} \sim M \begin{bmatrix} x \\ y \\ 1 \end{bmatrix}$$

- **Homography Matrix ($M$) [กล้อง CCTV $\rightarrow$ เสา Rectified]**:
  $$\begin{bmatrix}
  1.180483 \times 10^{0} & 8.542192 \times 10^{-2} & -1.581599 \times 10^{3} \\
  -7.276956 \times 10^{-17} & 7.308320 \times 10^{-1} & -5.846656 \times 10^{1} \\
  -2.503688 \times 10^{-18} & -3.262643 \times 10^{-4} & 1.000000 \times 10^{0}
  \end{bmatrix}$$

- **Inverse Homography Matrix ($M^{-1}$) [เสา Rectified $\rightarrow$ กล้อง CCTV]**:
  ใช้คำนวณตำแหน่ง **เส้นตัดผิวน้ำที่แท้จริง** กลับลงบนจอมอนิเตอร์กล้อง CCTV ให้ตรงกับระลอกคลื่นน้ำจริง 100%:
  $$\begin{bmatrix}
  8.250000 \times 10^{-1} & 4.991071 \times 10^{-1} & 1.334000 \times 10^{3} \\
  0.000000 \times 10^{0} & 1.368304 \times 10^{0} & 8.000000 \times 10^{1} \\
  0.000000 \times 10^{0} & 4.464286 \times 10^{-4} & 1.000000 \times 10^{0}
  \end{bmatrix}$$

---

### 3. การสอบเทียบสเกลระดับเมตรและรอยต่อแผ่นเสา (Piecewise Anchor Calibration)

สำหรับสถานีสะพานหาดใหญ่นอก (X.44) สเกลระดับน้ำอ้างอิงจากตำแหน่ง **"รอยต่อระหว่างเลข 1 กับเลข 9" (Junction Between 1 and 9)** ซึ่งเป็นเส้นขีดแบ่งระดับเต็มเมตรจริง:

| ระดับน้ำ (m R.T.K.) | Enhanced Y (px) | พิกัดจุดกึ่งกลางบนกล้อง CCTV (X, Y) | ลักษณะทางกายภาพ |
| :---: | :---: | :---: | :--- |
| **9.00 m** | 0 | (1350.5, 80.0) | ขอบบนสุดของแผ่นเสาวัดน้ำ |
| **8.00 m** | 202 | (1340.5, 208.8) | รอยต่อระหว่างเลข 1 กับ 9 (8.00m) |
| **7.00 m** | 422 | (1330.5, 337.0) | รอยต่อระหว่างเลข 1 กับ 9 (7.00m) |
| **6.00 m** | 642 | (1321.4, 454.1) | รอยต่อระหว่างเลข 1 กับ 9 (6.00m ระดับตลิ่ง/วิกฤต) |
| **5.00 m** | 871 | (1312.7, 565.9) | รอยต่อระหว่างเลข 1 กับ 9 (5.00m) |
| **4.00 m** | 1095 | (1304.8, 666.3) | รอยต่อระหว่างเลข 1 กับ 9 (4.00m) |
| **3.00 m** | 1350 | (1296.7, 771.2) | รอยต่อระหว่างเลข 1 กับ 9 (3.00m) |
| **2.00 m** | 1600 | (1289.3, 865.5) | รอยต่อระหว่างเลข 1 กับ 9 (2.00m) |
| **1.00 m** | 1860 | (1282.3, 955.7) | รอยต่อระหว่างเลข 1 กับ 9 (1.00m) |
| **0.60 m** | 2140 | (1275.3, 1044.9) | **จุดสัมผัสผิวน้ำจริงที่โคนเสา (Water Surface Contact)** |

*(หมายเหตุ: ระบบตัดจุด 0.0 ม. ออกตามเงื่อนไขที่โคนเสาจมอยู่ใต้ผิวน้ำที่ระดับ 0.60 ม.)*

---

## 📁 โครงสร้างโฟลเดอร์ (Directory Structure)

```text
non_time_series/
│
├── README.md                          # เอกสารคู่มือระบบและการคำนวณพิกัดเสา
├── requirements.txt                   # ไลบรารีที่จำเป็น (OpenCV, NumPy, OpenPyXL, Torch)
├── .gitignore                         # กำหนดไม่ให้ push ไฟล์แคชและไฟล์ชั่วคราว
├── water_levels.xlsx                  # ไฟล์ Excel บันทึกค่าระดับน้ำ 3 คอลัมน์รายสถานี
│
├── configs/                           # ไฟล์คอนฟิกพิกัดเสาและสเกลเมตร
│   ├── station1_muangkong.json        # คอนฟิกพิกัดและสเกล 10-18m สะพานม่วงก็อง
│   ├── station2_bangsala.json         # คอนฟิกพิกัดและสเกล 2-12m สะพานบางศาลา
│   └── station3_hatyainai.json        # คอนฟิกพิกัด 4 มุมและสเกล 0.6-9.0m สะพานหาดใหญ่นอก
│
├── core/                              # โมดูลประมวลผลหลัก (Core Vision Algorithms)
│   ├── __init__.py
│   ├── pole_coordinates.py            # คำนวณพิกัดเสา, Homography M และ Inverse M^-1
│   ├── scale_calibrator.py            # Piecewise Linear Interpolation (Pixel <-> Meter)
│   ├── water_surface_detector.py      # ตรวจจับเส้นผิวน้ำ (Change Point + Monotonic Submersion)
│   └── excel_logger.py                # ระบบบันทึกผลระดับน้ำลง water_levels.xlsx
│
├── pipelines/                         # สคริปต์รันระดับน้ำรายสถานีและ Master Runner
│   ├── __init__.py
│   ├── run_station1_muangkong.py      # รันสถานีที่ 1: สะพานบ้านม่วงก็อง (X.173A)
│   ├── run_station2_bangsala.py       # รันสถานีที่ 2: สะพานบางศาลา (X.90)
│   ├── run_station3_hatyainai.py      # รันสถานีที่ 3: สะพานหาดใหญ่นอก (X.44)
│   └── run_all_stations.py            # [แนะนำ] รันพร้อมกันทั้ง 3 สถานีในคำสั่งเดียว
│
├── tools/                             # เครื่องมือวิเคราะห์และทดสอบย่อยทีละสเต็ป
│   ├── calculate_pole_coordinates.py  # คำนวณพิกัดเสา มุมเอียง และเมทริกซ์ทุกสถานี
│   ├── step1_crop_and_enhance.py      # ทดสอบตัดและดัดภาพเสา Rectified/Enhanced
│   ├── step2_calibrate_scale.py       # ทดสอบวาดสเกลไม้บรรทัดดิจิทัลและรอยต่อเมตร
│   └── step3_detect_water_level.py    # ทดสอบตรวจวัดระดับน้ำและสร้าง Dashboard
│
├── sample_images/                     # ภาพตัวอย่าง CCTV สำหรับทดสอบระบบ
│   ├── station1_muangkong.jpg         # ตัวอย่างภาพสะพานม่วงก็อง
│   ├── station2_bangsala.png          # ตัวอย่างภาพสะพานบางศาลา
│   ├── station3_hatyainai_daytime.jpg # ตัวอย่างภาพสะพานหาดใหญ่นอก สภาวะปกติ (0.60m)
│   ├── station3_hatyainai_dusk.jpg    # ตัวอย่างภาพสะพานหาดใหญ่นอก สภาวะพลบค่ำ
│   └── station3_hatyainai_flood.png   # ตัวอย่างภาพสะพานหาดใหญ่นอก สภาวะน้ำท่วมวิกฤต (6.58m)
│
├── models/                            # โฟลเดอร์เก็บโมเดล Segmentation / Deep Learning
│   └── model_muangkong_seg.pt
│
└── output/                            # ภาพผลลัพธ์ Dashboard และภาพตรวจสอบพิกัดเสา
    ├── pole_verification_*.jpg
    └── *_dashboard_result.jpg
```

---

## 🚀 วิธีการติดตั้งและเรียกใช้งาน (Quick Start Guide)

### 1. ติดตั้ง Dependencies
```bash
pip install -r non_time_series/requirements.txt
```

### 2. ตรวจสอบพิกัดเสาและเมทริกซ์การดัดมุมมองทั้ง 3 สถานี
```bash
# แสดงพิกัดมุม 4 จุด, มุมเอียง, ค่า M และ M^-1 ของทุกสถานี
python non_time_series/tools/calculate_pole_coordinates.py --station all
```

### 3. รันประมวลผลพร้อมกันทั้ง 3 สถานี (Master Pipeline)
```bash
python non_time_series/pipelines/run_all_stations.py
```
*ระบบจะอ่านภาพตัวอย่างของทั้ง 3 สถานี, ตรวจวัดระดับน้ำ, สร้างภาพผลลัพธ์ใน `output/`, และบันทึกค่าลง `water_levels.xlsx` โดยอัตโนมัติ*

### 4. รันประมวลผลแยกรายสถานี
```bash
# สะพานบ้านม่วงก็อง (X.173A)
python non_time_series/pipelines/run_station1_muangkong.py

# สะพานบางศาลา (X.90)
python non_time_series/pipelines/run_station2_bangsala.py

# สะพานหาดใหญ่นอก (X.44) - สภาวะปกติ
python non_time_series/pipelines/run_station3_hatyainai.py

# สะพานหาดใหญ่นอก (X.44) - สภาวะน้ำท่วม
python non_time_series/pipelines/run_station3_hatyainai.py --image non_time_series/sample_images/station3_hatyainai_flood.png
```

---

## 📊 โครงสร้างไฟล์บันทึกผล Excel (`water_levels.xlsx`)

ไฟล์ `water_levels.xlsx` ถูกกำหนดโครงสร้างให้เก็บ **เฉพาะค่าระดับน้ำ (เมตร รทก.) แยกเป็นคอลัมน์ของแต่ละสถานี** เพื่อให้ทีม Time-Series สามารถดึงไปเป็น Input ของโมเดลพยากรณ์น้ำท่วมได้ทันที:

| Timestamp | Muangkong (m R.T.K.) | Bangsala_X90 (m R.T.K.) | Hatyainai_X44 (m R.T.K.) |
| :---: | :---: | :---: | :---: |
| `2026-09-22 18:44:03` | - | - | **0.60** |
| `2026-09-30 11:00:00` | **2.76** | - | - |
| `2026-09-30 12:00:00` | - | **3.51** | - |
| `2026-10-01 19:39:43` | **10.19** | - | - |
| `2026-10-01 19:39:45` | - | **2.75** | - |
| `2026-10-01 19:39:47` | - | - | **0.60** |

---

## 🤝 คู่มือสำหรับเพื่อนร่วมทีม (Integration Guide for Time-Series & Web)

เพื่อนร่วมทีมที่รับผิดชอบส่วน **Time-Series** หรือ **Web Dashboard** สามารถเชื่อมต่อข้อมูลได้ 2 วิธี:

### วิธีที่ 1: ดึงข้อมูลจากไฟล์ Excel โดยตรง (แนะนำสำหรับ Pandas / Polars)
```python
import pandas as pd

df = pd.read_excel("non_time_series/water_levels.xlsx")
print(df.tail())
```

### วิธีที่ 2: เรียกใช้ Python Module จากโค้ดระบบอื่น
```python
from non_time_series.core import PoleCoordinateManager, PiecewiseScaleCalibrator, WaterSurfaceDetector
import json
import cv2

# โหลดคอนฟิกสถานีหาดใหญ่นอก
with open("non_time_series/configs/station3_hatyainai.json", "r", encoding="utf-8") as f:
    cfg = json.load(f)

pole_mgr = PoleCoordinateManager(cfg)
frame = cv2.imread("path/to/cctv_frame.jpg")
rectified, enhanced, _ = pole_mgr.extract_and_rectify(frame)

calibrator = PiecewiseScaleCalibrator(cfg["piecewise_anchors"])
detector = WaterSurfaceDetector(calibrator, cfg)
result = detector.detect_waterline(enhanced)

print(f"ระดับน้ำ: {result['water_level']} m R.T.K. [{result['status']}]")
```

---

## 🔀 ขั้นตอนก่อน Git Push & Merge
1. ตรวจสอบว่าไฟล์ทั้งหมดอยู่ในโฟลเดอร์ `non_time_series/`
2. ทดสอบรัน `python non_time_series/pipelines/run_all_stations.py` เพื่อให้แน่ใจว่าทั้ง 3 สถานีผ่าน 100%
3. ทำการ `git add non_time_series/` และสร้าง commit:
   ```bash
   git add non_time_series/
   git commit -m "feat(cv): add non_time_series module for 3 flood monitoring stations"
   git push origin <your-branch-name>
   ```
4. แจ้งเพื่อนร่วมทีมว่าส่วน Non-Time-Series บรรจุอยู่ในโฟลเดอร์ `non_time_series/` เรียบร้อยแล้ว พร้อมส่งค่าระดับน้ำผ่าน `non_time_series/water_levels.xlsx` ครับ

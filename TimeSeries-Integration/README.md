# Hatyai Time Series — ชุดส่งต่อสำหรับ AI-Eco System

ชุดนี้นำไปใช้กับโปรเจกต์ภายนอกได้โดยคัดลอก **โฟลเดอร์ TimeSeries-Integration ทั้งโฟลเดอร์** มีโมเดลที่ฝึกไว้แล้วและ Python library สำหรับพยากรณ์ระดับน้ำ ไม่อ้างอิง path ในเครื่องผู้พัฒนา ไม่ต้องมี Project-Eco, FastAPI, Docker หรือฐานข้อมูลเดิม

จัดชุดวันที่ 2 ตุลาคม 2026 จาก Random Forest v2 ของ HatyaiFloodLens ไม่มีการฝึกโมเดลใหม่หรือแก้ไฟล์โมเดลเดิม

## สิ่งที่อยู่ในชุด

```text
TimeSeries-Integration/
├── README.md
├── pyproject.toml                # ติดตั้งเป็น Python package ในโปรเจกต์เพื่อน
├── requirements.txt             # dependencies สำหรับรันจากโฟลเดอร์โดยตรง
├── hatyai_timeseries/
│   ├── __init__.py
│   ├── predictor.py              # สร้าง lag และเรียกโมเดล
│   └── models/
│       ├── rf_*.joblib           # 18 โมเดลเดิม (~100 MiB รวม)
│       └── manifest.json         # SHA-256 และ feature contract ของทุกโมเดล
├── examples/
│   ├── run_prediction.py
│   ├── observations.csv         # ข้อมูล QC จริง 25 ชั่วโมง สำหรับทดสอบเท่านั้น
│   └── reference_predictions.json # ค่าที่คำนวณจาก feature matrix เดิมไว้ตรวจความตรงกัน
└── tests/
    └── test_integration.py
```

ไม่รวมชุดข้อมูลฝึกขนาดใหญ่, notebook, ภาพ CCTV, โมเดล segmentation, UI, workers, credentials หรือระบบแจ้งเตือน SARIMAX และโมเดล legacy ไม่อยู่ในชุดนี้ เพราะตัวเรียกใช้นี้รองรับ RF v2; หากต้องใช้ SARIMAX จะต้องมี adapter สำหรับปรับ state ด้วยประวัติข้อมูลเพิ่มเติม

| สถานีน้ำ | พื้นที่ | สถานีฝนที่จับคู่ |
|---|---|---|
| X.173A | บ้านม่วงก็อง / สะเดา | SLA003 |
| X.90 | บ้านบางศาลา / คลองหอยโข่ง | SLA002 |
| X.44 | บ้านหาดใหญ่ใน / หาดใหญ่ | SLA001 |

แต่ละสถานีมี `delta` และ `level` แยก horizon 1/2/3 ชั่วโมง จึงมี 3 × 2 × 3 = 18 โมเดล เลือก family ได้โดยตรง; ค่าเริ่มต้น `delta` เป็นค่าเริ่มต้นของตัวเรียกใช้ ไม่ใช่ข้อสรุปว่าเป็นโมเดลที่ดีที่สุดทุกสถานการณ์

## เริ่มใช้งาน

แนะนำ Python 3.11 ซึ่งใช้ตรวจชุดนี้ รองรับ Python 3.10–3.12 ใช้ environment แยกหากระบบหลักมี scikit-learn คนละเวอร์ชัน เพราะโมเดลเดิมสร้างด้วย **scikit-learn 1.4.2**

```powershell
cd "D:\path\to\TimeSeries-Integration"
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install .
.\.venv\Scripts\python.exe examples/run_prediction.py
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

ใน environment ของโปรเจกต์เพื่อน ติดตั้งจาก path ได้เช่นกัน:

```powershell
python -m pip install "D:\path\to\TimeSeries-Integration"
```

ไฟล์โมเดลถูกติดตั้งไปกับ package จึงเรียกใช้จาก working directory อื่นได้ หลังติดตั้ง runtime ต้องการเพียง package และ dependencies; `examples/` กับ `tests/` มีไว้ตรวจรับชุดส่งต่อ

## เรียกจากระบบหลัก

สร้าง `Forecaster` หนึ่งครั้งต่อ process เพื่อ cache โมเดล แล้วให้ service/worker ของระบบหลักเรียก:

```python
import pandas as pd
from hatyai_timeseries import Forecaster, ForecastInputError

forecaster = Forecaster()

# observations เป็น DataFrame หรือ list ของ dict ที่อ่านจากฐานข้อมูล/feed ของระบบหลัก
observations = pd.read_csv("hourly_observations.csv")
try:
    result = forecaster.predict(
        observations=observations,
        issue_time="2025-01-10T00:00:00+07:00",
        station="X.44",
        family="delta",
    )
except ForecastInputError as exc:
    # ให้ระบบหลักแสดงว่า input ไม่ถูกต้อง/ไม่เพียงพอ แทนการแสดงค่าพยากรณ์
    print(str(exc))
else:
    print(result["predictions"])
    # บันทึก result ลงฐานข้อมูลของระบบหลัก หรือส่งเป็น JSON ใน API response
```

ทดสอบโค้ดนี้ด้วย `examples/observations.csv` ได้ โมเดลไม่ได้ดึง RID/HII หรืออ่านฐานข้อมูลเอง เพื่อให้เพื่อนเลือกแหล่งข้อมูลและผูกกับระบบของเขาได้

## ข้อมูลเข้าที่ต้องส่ง

ตารางแบบ wide หนึ่งแถวต่อหนึ่งชั่วโมง คอลัมน์ `time` จำเป็น คอลัมน์ค่าที่ใช้มีดังนี้:

| คอลัมน์ | ความหมาย / หน่วย |
|---|---|
| time | เวลารายงานต้นชั่วโมง เช่น `2025-01-10T00:00:00+07:00` |
| level_X.173A, level_X.90, level_X.44 | ระดับน้ำ QC ของแต่ละสถานี หน่วยเมตรตามแหล่งรายงาน |
| rain_SLA003, rain_SLA002, rain_SLA001 | ฝนที่วัดแล้วรายชั่วโมงและผ่าน QC หน่วยมิลลิเมตร |

ส่งข้อมูลตั้งแต่ `issue_time - 24 ชั่วโมง` ถึง `issue_time` รวม 25 ช่องชั่วโมงสำหรับ lag ทั้งหมด การเรียงแถวไม่จำเป็น แต่ห้ามมีเวลาเดียวกันซ้ำ ให้ระบบหลักเลือก revision ที่จะใช้ก่อนส่ง ข้อมูลไม่ครบให้ใช้ `None`/`NaN` หรือเว้นคอลัมน์ ไม่เติมค่าฝนที่หายเป็นศูนย์

- ระดับน้ำใช้ lag 0/1/2/3/6/12/24 ชั่วโมง ของสถานีเป้าหมายและสถานีต้นน้ำตาม contract ของโมเดล
- ฝนใช้ lag 1/2/3/6/12/24 ชั่วโมง ของ SLA001/002/003 ไม่มี rain lag0 หรือพยากรณ์ฝนอนาคต
- หา lag จาก timestamp จริง เช่น lag24 คือ t−24h ไม่ใช่แถวที่ 24 ก่อนหน้า ไม่มี interpolation/forward fill และไม่อ่านค่าหลังเวลาออกพยากรณ์
- เวลาที่ไม่มี timezone ตีความเป็น Asia/Bangkok; เวลาที่มี timezone แปลงเป็นเวลาไทย ทุกเวลาต้องเป็นต้นชั่วโมง
- ระดับน้ำปัจจุบันของสถานีเป้าหมายจำเป็น หากหายจะ raise `ForecastInputError` ส่วน lag/ฝนที่หายผ่าน median imputer และ missing indicators ที่อยู่ใน pipeline เดิม
- ค่า sentinel เช่น −999/9999, ค่าผิดปกติ และฝนติดลบต้องถูก QC โดยระบบต้นทางก่อนส่ง ตัว library ตรวจชนิดตัวเลขและ infinity แต่ไม่ได้แทนระบบ QC ต้นทาง
- คอลัมน์ observation ที่ไม่ได้ใช้จะถูกละไว้ หากใช้ `predict_features` โดยตรงจะปฏิเสธคอลัมน์นอก contract เพื่อช่วยจับการส่งข้อมูลผิด

สำหรับระบบที่มี feature builder อยู่แล้ว:

```python
names = forecaster.feature_names(station="X.44", family="delta")
# prepared_features: dict ของชื่อจาก names -> float หรือ None
result = forecaster.predict_features(
    prepared_features, "2025-01-10T00:00:00+07:00", station="X.44", family="delta"
)
```

ควรอ้าง `feature_names()` หรือ `manifest.json` เพื่อใช้ชื่อที่ตรงกับโมเดล ไม่ hardcode ลำดับเอง

## ผลลัพธ์และการเก็บประวัติ

`result` เป็น dict ที่ serialize เป็น JSON ได้ มี:

- `station_code`, `issue_time` (เวลาอ้างอิงข้อมูล), `generated_at` (เวลาที่รันจริง)
- `current_level_m`, `predictions` สามรายการ แต่ละรายการมี `horizon_h`, `target_time`, `level_m`
- `model_family`, `model_version`, `trained_through`, `model_artifacts` พร้อม SHA-256
- `input_quality`, `missing_features`, `rain_available`, `operational_ready`

โมเดล `level` ส่งระดับน้ำที่ทำนายโดยตรง ส่วน `delta` ทำนายการเปลี่ยนแปลง และ library บวกระดับน้ำปัจจุบันให้แล้ว ผล `level_m` จึงเป็นระดับน้ำของทั้งสอง family **ห้ามบวกค่าปัจจุบันซ้ำ** ค่าไม่ถูก clamp เป็นศูนย์เพราะ datum ยังต้องยืนยัน

ชุดนี้ไม่มีฐานข้อมูลประวัติในตัว ให้ระบบหลักบันทึก result ทุกครั้ง พร้อม input ที่ใช้หรือรหัสอ้างอิง input เพื่อย้อนตรวจได้ แนะนำเก็บ `station_code`, `issue_time`, `generated_at`, family/version/hash, horizon, `target_time`, prediction, input quality และแหล่งข้อมูล เมื่อค่าจริงมาถึงให้จับคู่ตาม **station + target_time** แล้วคำนวณ error แยก horizon

หากรันใหม่สำหรับ issue_time เดิม ให้กำหนดนโยบายเก็บ revision/ป้องกันรายการซ้ำในระบบหลัก การ replay ตอนนี้ไม่เท่ากับผลที่เคยออกจริงในอดีต เพราะโมเดลหรือ revision ของ input อาจต่างกัน

## ขอบเขตและความพร้อม

โมเดลฝึกจากข้อมูลตั้งแต่ 18 พ.ค. 2017 ถึง 31 ธ.ค. 2024 โดยตัดปลายช่วงฝึกตาม horizon เพื่อไม่ให้ target ข้ามไปปี 2025 การประเมินเดิมใช้หน้าต่าง ม.ค./เม.ย./ก.ค. และน้ำสูง พ.ย. 2025 ซึ่งเป็นผลทดลองที่ใช้เปรียบเทียบวิธีแล้ว ไม่ใช่ holdout ที่ไม่เคยเปิดดู

`operational_ready=False` คงไว้ตามสถานะโมเดลเดิม ฝนสดยังต้องให้ระบบหลักเชื่อม feed ที่ตรวจเวลาเผยแพร่และคุณภาพได้; datum ระดับน้ำและเกณฑ์แจ้งเตือนต้องยืนยันเพิ่มเติม รวมถึงต้องประเมินเหตุการณ์น้ำสูงใหม่ก่อนใช้ตัดสินแจ้งเตือนอัตโนมัติ ไม่มีการส่งแจ้งเตือนใน library นี้

สำหรับการรันสด ระบบหลักต้องตรวจความสดของ **ข้อมูลที่มีอยู่จริง ณ เวลาออกคำทำนาย** ก่อนเรียก library เช่น policy ไม่รับระดับน้ำที่เก่าเกิน 120 นาที ตัว library รับ issue_time ย้อนหลังได้เพื่อทดสอบ จึงไม่ได้บังคับ freshness หรืออ้างว่าข้อมูลเป็น live ไม่มีการนำภาพกล้องหรือพยากรณ์ Open-Meteo มาเป็น input ของ RF ชุดนี้

โมเดล `.joblib` โหลดด้วย Python deserialization ให้ใช้ไฟล์ที่มาจากชุดที่เชื่อถือได้ `manifest.json` ช่วยตรวจว่าไฟล์ตรงกับชุดส่งต่อ แต่ไม่ใช่ลายเซ็นยืนยันผู้สร้าง

## การตรวจรับ

tests ตรวจว่า lag จาก sample QC ตรงกับ feature matrix เดิมและค่าพยากรณ์ตรงกับโมเดลเดิมครบ 18 โมเดล ตรวจ checksum, เวลา UTC/ไทย, การไม่ใช้ข้อมูลอนาคต, การรายงานฝนขาด และการหยุดเมื่อระดับน้ำปัจจุบันหาย นี่เป็นการตรวจความถูกต้องของ integration ไม่ใช่การวัดความแม่นยำใหม่ของโมเดล

แหล่งเดิมใน HatyaiFloodLens: `models/forecasting_v2/rf_*.joblib`, `data/datasets/three_station_hourly/three_station_qc_v2.csv`, `feature_matrix_*_v2.csv` และ `notebooks/forecasting/Three_Station_Forecasting_Models_v2.ipynb` ตัวอย่างคัดเฉพาะ 9 ม.ค. 2025 00:00 ถึง 10 ม.ค. 2025 00:00 ไม่มี target หรือข้อมูลฝึกเต็มในชุดส่งต่อ

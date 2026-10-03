# Time Series ใน AI Ecosystem

เชื่อมชุด `TimeSeries-Integration` กับ backend, PostgreSQL, ARQ workers และ frontend ที่มีอยู่แล้ว โดยใช้โมเดล RF v2 เดิมครบ 18 ไฟล์ ไม่มีการฝึกใหม่ โค้ดนี้รวมฐาน `main`, `frontend` และ `feat/timeseries-integration` ไว้ใน local branch `integration/ecosystem-timeseries`

## เส้นทางข้อมูล

ฝนจริงเชื่อมกับ ThaiWater/HII Public API แล้ว: [หน้าแสดงฝนของ ThaiWater](https://www.thaiwater.net/weather/rainfall) ใช้ `/public/rain_24h` สำหรับ metadata/ค่าล่าสุด และ `/public/rain_24h_graph?station_id=...` สำหรับค่าฝนรายชั่วโมงย้อนหลัง รหัส SLA001/002/003 ตรวจจาก `tele_station_oldcode`, agency HII และพิกัดเดิมก่อนใช้ station ID ไม่ใช้สถานีใกล้เคียงแทนเอง

`POST /api/v1/water/ingest-telemetry` ดึง RID และ HII แยกกัน (แหล่งหนึ่งล่มยังดึงอีกแหล่งได้) worker เรียกทุก 15 นาที และหน้าเว็บเรียกผ่าน refresh-all ทุก 5 นาที บันทึกฝนหน่วยมิลลิเมตรที่ timestamp Asia/Bangkok ของแหล่งข้อมูลแปลงเป็น UTC; ตรวจค่ารายชั่วโมง/ผลรวม 24 ชม. เทียบรายงานสรุปเมื่อมีครบ ไม่ใช้ยอดสะสมรายวันแทนค่ารายชั่วโมง ไม่ round/interpolate ชั่วโมงหรือใช้ข้อมูลอนาคต ค่า null/ค่าติดลบ/sentinel เป็น missing; ค่า 0 จริงเก็บเป็น 0 เก็บ source URL, station ID และ SHA-256 ใน DB/forecast references และเก็บ revision เมื่อค่าถูกแก้

โมเดลใช้ `rain_SLA00*_lag1/2/3/6/12/24h` ตาม feature contract เดิม ระบบดึงข้อมูลทั้ง 3 สถานีสำหรับฝนต้นน้ำด้วย ฝนหลัง issue time ไม่ถูกใช้ แม้ API จะมีค่าที่ใหม่กว่าระดับน้ำ ผลบันทึก `rain_input_summary` จำนวนตัวแปรที่ใช้/ที่ขาด และหน้าเว็บแสดงฝนล่าสุดแยกจากเวลาที่โมเดลใช้ หากต้นทางขาดบางชั่วโมง โมเดลยังใช้ฝนจริงที่มีร่วมกับ imputer เดิม และคง PARTIAL_INPUTS; ไม่แสดงว่าฝนครบ `GET /api/v1/water/rain/latest?station_code=STN-*` ดูค่าฝนและเวลาจากแหล่งข้อมูลได้

```text
ARQ ingestion (ทุก 15 นาที)
  → POST /api/v1/water/ingest-telemetry (RID + HII)
  → ตรวจ station mapping จาก RID metadata + อ่านรายงานย้อนหลัง 3 วัน
  → PostgreSQL water_measurements (RID_API_VERIFIED, timestamp UTC)

ARQ forecast (นาที 1/16/31/46) หรือปุ่มคำนวณบนเว็บ
  → POST /api/v1/forecast/trigger?mode=shadow
  → service อ่านระดับน้ำ/ฝนรายชั่วโมงจาก DB + ตรวจความสด
  → hatyai_timeseries.Forecaster → RF v2 +1/+2/+3 ชั่วโมง
  → forecast_records พร้อม input snapshot, record references และ model SHA-256
  → latest/history/comparison API → กราฟและตารางประวัติบนเว็บ
```

การประมวลผลภาพและเก็บภาพบน MinIO ยังอยู่ในเส้นทางเดิม ค่า CAMERA_VISION ไม่ถูกเฉลี่ยเข้ากับ RID อัตโนมัติ เพราะโมเดลฝึกด้วยระดับน้ำ RID และ datum ของกล้องยังต้องยืนยัน ขั้น forecast ไม่เรียก LINE หรือสร้าง AlertEvent อัตโนมัติ

โมเดลติดตั้งจาก local package เข้า backend image พร้อม dependencies ที่ตรงกับโมเดล จึงไม่ต้องดึงโมเดลใหม่จาก MLflow/MinIO ทุก request บริการ MLflow/MinIO ของระบบยังคงอยู่; RF ชุดนี้ระบุเวอร์ชันและ SHA-256 ในผลทุกครั้ง หากต้องเปลี่ยนที่เก็บ artifacts ให้กำหนด `FORECAST_MODEL_DIR` ไปยัง directory ของโมเดลที่ผ่านการตรวจรับ ไม่ได้ register/train โมเดลใหม่อัตโนมัติ

## รหัสสถานี

| Ecosystem / frontend / DB | โมเดล / RID | ฝน HII |
|---|---|---|
| STN-MUANGKONG | X.173A | SLA003 |
| STN-BANGSALA | X.90 | SLA002 |
| STN-HATYAINAI | X.44 | SLA001 |

API รับรหัสทั้งสองแบบ แต่ผลและ DB ใช้ STN-* เสมอ ไม่เปลี่ยนรหัสสถานีของ frontend/กล้อง

## การเริ่มใช้งาน

### เปิดหน้าเว็บในเครื่องร่วมกับโปรเจคอื่น

หลังติดตั้ง Python dependencies และ `npm ci` ใน `frontend` แล้ว รัน `powershell -File .\scripts\start-local.ps1` จาก root โปรเจค เปิด `http://127.0.0.1:3001/` สคริปต์ใช้ API พอร์ต 8112 และ SQLite ที่ `data/local-preview.db` สำหรับการดูเว็บในเครื่อง เพื่อไม่ชน backend ของโปรเจคอื่นที่พอร์ต 8000; Docker deployment ยังคงใช้ PostgreSQL ตาม compose เดิม Logs อยู่ใน `data/*-local*.log`

Vite อ่าน `BACKEND_API_URL` จาก environment หรือ `frontend/.env.local` ได้ เช่น `BACKEND_API_URL=http://127.0.0.1:8112` อย่าเปิด frontend กับ backend ต่างโปรเจค เพราะรายชื่อสถานีและภาพจะไม่ขึ้น

หน้าเว็บแสดงภาพกล้องและผล RF ทั้ง 3 สถานีพร้อมกัน ดึงกล้องผ่าน backend proxy ทุกสถานี (หาดใหญ่ใช้ snapshot สำรองจาก hatyaicityclimate เมื่อ Axis ติดต่อไม่ได้) ภาพรีเฟรชทุก 60 วินาที ตรวจ JPEG ต้องครบไฟล์และลองใหม่เมื่อภาพเสีย หากต้นทางเสียชั่วคราวแสดงเฟรมสมบูรณ์ล่าสุดจาก cache ได้ไม่เกิน 5 นาที ดูเวลาที่กล้องประทับในภาพ; เมื่อไม่มีเฟรมสมบูรณ์จะแสดงสถานะติดต่อกล้องไม่ได้ ข้อมูล/โมเดลอัปเดตผ่าน `POST /api/v1/forecast/refresh-all` เมื่อเปิดเว็บ ทุก 5 นาที และเมื่อกดปุ่มอัปเดตทั้ง 3 สถานี

Endpoint นี้ ingest RID ก่อนคำนวณ: ข้อมูลสดไม่เกิน `FORECAST_MAX_AGE_MINUTES` ใช้ shadow; ข้อมูลล่าช้าแต่ไม่เกิน 24 ชม. ใช้ replay จากข้อมูล verified ใน DB พร้อม provenance และเวลาจริงบนหน้าเว็บ ไม่เปลี่ยน timestamp เป็นเวลาปัจจุบัน ไม่ลดเกณฑ์ความสดของ shadow และไม่ส่งแจ้งเตือน ข้อมูลเก่ากว่า 24 ชม. หรือไม่มีข้อมูลจะแสดงเหตุผลที่คำนวณไม่ได้ ผล +1/+2/+3 ชม. อ้างอิงเวลาข้อมูล ไม่ใช่เวลาที่เปิดหน้าเว็บ

ใช้ Python 3.10–3.12 แนะนำ 3.11 Dependencies หลักล็อกใน `uv.lock`; scikit-learn 1.4.2 และ NumPy 1.26.4 ต้องตรงกับโมเดล

```powershell
cd D:\Project-Eco
uv sync --locked
# SQLite สำหรับ local development (PostgreSQL ยังคงเป็นค่าเริ่มต้นใน Compose)
$env:DATABASE_URL = 'sqlite:///./floodlens_local.db'
uv run uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000
```

สำหรับ stack เดิม:

```powershell
docker compose build backend workers
docker compose up -d
```

Frontend เรียก `/api/v1` ผ่าน proxy เดิม ใช้ `npm run dev` ใน `frontend` หรือเปิดบริการ frontend ของ Compose พอร์ต 3001 หากเครื่องมีระบบอื่นใช้พอร์ต 8000/5432/3000 อยู่แล้ว ให้เลือกพอร์ตใน Compose ให้ไม่ชนกัน

ค่าที่ตั้งได้:

| Environment | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| DATABASE_URL | PostgreSQL จาก POSTGRES_* | เลือก DB ชัดเจน; ไม่มี fallback ไป SQLite โดยเงียบ |
| FORECAST_MAX_AGE_MINUTES | 120 | อายุสูงสุดของระดับน้ำที่อนุญาตให้พยากรณ์สด |
| FORECAST_MODEL_FAMILY | delta | delta หรือ level; API/UI/worker ใช้ค่าเดียวกัน |
| FORECAST_MODEL_DIR | package models | เปลี่ยน directory ของ RF artifacts |
| BACKEND_API_URL | http://backend:8000 | API ที่ ingestion/forecast worker เรียก; local worker ใช้ http://127.0.0.1:8000 |

หลังเริ่ม backend จะสร้างตารางและทำ additive migration เพิ่ม `forecast_records.context_json`, `forecast_records.forecast_key` และ `rainfall_measurements.source_type` ใช้ได้ทั้ง PostgreSQL และ SQLite เก็บแถวเดิมไว้และกำหนดฝนเก่าที่ไม่มี provenance เป็น UNKNOWN ผลเก่าจาก mock/simulator ไม่อยู่ใน latest/history ของ RF

## API ที่ใช้งาน

- `GET /api/v1/forecast/catalog`: station mapping, families และ modes
- `POST /api/v1/water/ingest-rid`: อ่าน RID จริงและบันทึกเวลารายงานเป็น UTC; รายการที่ค่าเดิมไม่เพิ่มซ้ำ หากค่าถูกแก้ที่ต้นทางเก็บ revision ใหม่
- `POST /api/v1/forecast/trigger?station_code=STN-HATYAINAI&mode=shadow&family=delta`: ใช้ verified telemetry ใน DB; ไม่รับ input custom ในโหมดนี้
- `GET /api/v1/forecast/latest?station_code=STN-HATYAINAI`: ผล RF ล่าสุดที่ยังสด; ไม่มีผลตอบ 404 และไม่สร้างค่าจำลอง
- `GET /api/v1/forecast/history?station_code=STN-HATYAINAI&mode=shadow&limit=30`: ประวัติผลที่เก็บไว้ รับ `start`, `end` ISO timestamp และ `family` ได้
- `GET /api/v1/forecast/{id}/comparison`: เทียบ +1/+2/+3 ชั่วโมงกับ RID ของ station+target_time เดียวกัน หากไม่มีค่าจริงคืน null
- `POST /api/v1/forecast/simulate`: สูตร What-If เดิมคืน `SIMULATION` และ id=0 ไม่บันทึกปะปนกับ RF

ตัวอย่าง replay จาก sample เดิมในชุดส่งต่อ:

```python
import pandas as pd
import requests

sample = pd.read_csv('TimeSeries-Integration/examples/observations.csv')
rows = sample.astype(object).where(pd.notna(sample), None).to_dict('records')
response = requests.post(
    'http://127.0.0.1:8000/api/v1/forecast/trigger',
    params={'station_code': 'STN-HATYAINAI', 'mode': 'replay', 'family': 'delta'},
    json={'issue_time': '2025-01-10T00:00:00+07:00', 'observations': rows},
    timeout=60,
)
response.raise_for_status()
print(response.json())
```

Replay ต้องส่งข้อมูลเองและระบุเวลา ไม่แอบโหลด sample เป็นข้อมูลสด ใช้รูปแบบ observation ของ [README ชุดโมเดล](TimeSeries-Integration/README.md) บนเว็บเปิด “ประวัติผลพยากรณ์และค่าจริง” เลือกข้อมูล RID เพื่อทดลองหรือทดสอบย้อนหลัง แล้วกดเทียบค่าจริงของรอบที่ต้องการ

## Input policy และประวัติ

Shadow ใช้เฉพาะระดับน้ำ `source_type=RID_API_VERIFIED` และฝน `HII_API_VERIFIED` อ่าน exact-hour lag จาก t−24h ถึง t ไม่ forward-fill ไม่ interpolate และไม่อ่านค่าจริงในอนาคต timestamp ใน DB เป็น UTC แบบไม่มี timezone ตาม schema เดิม แต่ API ส่ง timezone +00:00 เสมอ library แปลงเป็น Asia/Bangkok

ฝนสดจาก HII ผ่าน QC ถูก ingest อัตโนมัติแล้ว worker ไม่เขียนค่าฝนคงที่ ฝน UNKNOWN/ค่าติดลบ/sentinel และชั่วโมงที่ต้นทางไม่ส่งข้อมูลถูกละไว้เป็น missing พร้อมคืน `PARTIAL_INPUTS`, `missing_features` และ `rain_available=False` ใช้ imputer ที่ฝึกไว้แล้ว หากระดับน้ำปัจจุบันหายหรือเก่าเกิน policy ตอบ 503 และ worker บันทึกสถานะ unavailable โดยไม่ออก prediction fallback

ตัวดึง HII เขียน `rainfall_measurements.station_code` เป็น SLA001/002/003 พร้อม `source_type=HII_API_VERIFIED`, timestamp ชั่วโมงรายงาน UTC, ค่าฝนที่วัดแล้วผ่าน QC และ `created_at` เวลาได้รับข้อมูลจริง ไม่เปลี่ยนฝนเก่า UNKNOWN เป็น VERIFIED โดยไม่มีหลักฐาน หากหน่วยงานเปลี่ยนความหมาย timestamp หรือหน่วย ต้องตรวจและปรับ adapter ก่อนรับข้อมูล

รันซ้ำด้วยสถานี/issue_time/mode/family/features/model hashes เดิมจะคืน record เดิม ผ่าน unique `forecast_key` หาก input หรือโมเดลเปลี่ยนจะเก็บรอบใหม่ `context_json` เก็บ exact input_features และ observation_refs เพื่อย้อนตรวจค่าที่ใช้จริง ส่วน `generated_at`/`created_at` คือเวลารัน ไม่ใช่เวลารายงานต้นทาง

โมเดลยังเป็นงานทดลอง (`operational_ready=False`) ไม่ใช้เกณฑ์บนหน้าเว็บเพื่อเปิดแจ้งเตือนอัตโนมัติ ต้องยืนยัน datum, ฝนสด และประเมินน้ำสูงที่ไม่เคยใช้เลือกโมเดลก่อน ประวัติหลายรอบที่ target_time เดียวกันเป็นคำทำนายจาก issue/horizon/revision ต่างกัน จึงต้องประเมินแยกตามรอบ

## ตรวจรับ

```powershell
uv run pytest tests -q
uv run python -m unittest discover -s TimeSeries-Integration/tests -v
cd frontend
npm run build
npm run lint
```

tests ครอบคลุม RF ทั้ง 18 โมเดล, UTC/ไทย, station aliases, ความสด, ฝนขาดและ provenance, input revision, การรันซ้ำ, การแยก simulation/replay, history/comparison, parser RID และ migration ของ DB เดิม โดย default ใช้ SQLite ในหน่วยความจำ

สำหรับทดสอบ PostgreSQL ใช้ **DB แยกชื่อ floodlens_ts_test** เท่านั้น:

```powershell
$env:TIMESERIES_TEST_DATABASE_URL='postgresql://ts_test:ts_test_local@127.0.0.1:55434/floodlens_ts_test'
uv run pytest tests -q
```

fixture สร้าง/ลบตารางใน DB ทดสอบนี้ทุก test ไม่ใช้ DB หลัก ตรวจ RID สดแบบ read-only ได้ด้วย `uv run python scripts/check_timeseries_live.py` โดยกำหนด DATABASE_URL สำหรับ environment local ให้เรียบร้อย คำสั่งนี้ไม่เขียนฐานข้อมูล ไม่แจ้งเตือน และไม่ทำนาย

ผลตรวจรับวันที่ 3 ตุลาคม 2026: integration tests ผ่าน 14 รายการทั้ง SQLite และ PostgreSQL 15, ชุดทดสอบ portable models ผ่าน 6 รายการ, frontend production build และ lint ผ่าน (มี warnings ของโค้ด UI เดิม), Docker backend/worker build ผ่าน และอ่าน RID จริงได้ทั้ง 3 สถานี การทดสอบทั้งหมดใช้ฐานข้อมูลทดสอบแยก ไม่แก้ข้อมูลใน deployment เดิม

อัปเดตการเชื่อมฝน 3 ตุลาคม 2026: อ่าน HII ของทั้ง 3 สถานีจริงและคำนวณ RF ได้ใน shadow mode หน้าเว็บแสดงฝนล่าสุด/ยอดสะสม/เวลาข้อมูลและจำนวนตัวแปรฝนที่ใช้ รอบที่ตรวจข้อมูลต้นทางขาด 04:00–07:00 น. จึงใช้ฝนจริง 5/6 ตัวแปรที่ม่วงก็อง, 10/12 ที่บางศาลา, 15/18 ที่หาดใหญ่ และคง PARTIAL_INPUTS ตามจริง ยอดสะสม 24 ชม. บนการ์ดใช้ค่ารายงาน HII เมื่อมี ไม่ใช้ยอดนี้แทน hourly lag ของโมเดล

ตรวจรับส่วนฝน: SQLite suite ผ่าน 29 รายการ; PostgreSQL 15 suite เดิมพร้อมการเชื่อมฝนผ่าน 27 รายการ และชุดฝนฉบับสุดท้ายผ่านครบ 11 รายการ (รวมข้อมูลขาด/ยอดสะสมจาก summary และ RID_HII_PARTIAL); frontend build/lint และ Docker backend/workers build ผ่าน ตัวเปิดบริการในเครื่องใช้ pythonw.exe เมื่อมี เพื่อให้ API ไม่ปิดตาม console ที่ใช้เริ่มงาน

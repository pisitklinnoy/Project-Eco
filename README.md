# Hatyai FloodLens 🌊🔍
**ระบบเฝ้าระวังและพยากรณ์ระดับน้ำในพื้นที่หาดใหญ่ด้วย AI จากข้อมูลอนุกรมเวลาและภาพกล้อง**

---

## 📌 ภาพรวมโครงการ (Project Overview)
**Hatyai FloodLens** เป็นแพลตฟอร์มระบบนิเวศปัญญาประดิษฐ์ (AI Ecosystem) แบบบูรณาการเพื่อช่วยให้ผู้ดูแลพื้นที่และประชาชนติดตามสถานการณ์น้ำในอำเภอหาดใหญ่ จังหวัดสงขลา และดูแนวโน้มระดับน้ำล่วงหน้า **1–3 ชั่วโมง** เพื่อใช้ประกอบการเตรียมรับมือและแจ้งเตือนภัยน้ำท่วมล่วงหน้าได้อย่างทันท่วงที

ระบบเชื่อมโยง 7 เสาหลักทางวิศวกรรม:
1. **Automated Ingestion**: ดึงข้อมูลระดับน้ำ ฝน และภาพกล้อง CCTV อัตโนมัติ
2. **Hybrid Storage**: PostgreSQL (Relational Data & Logs) + MinIO (Camera Images & Model Weights)
3. **Computer Vision & Human-in-the-Loop**: ตรวจวัดระดับน้ำจากภาพ พร้อม Quality Gate และ Review Agent ร่วมกับ Label Studio
4. **Time-Series Forecasting**: พยากรณ์ระดับน้ำล่วงหน้า 1, 2, 3 ชั่วโมง พร้อม Input Policy คัดกรองความสดของข้อมูล
5. **FastAPI & LINE Alerting**: บริการ REST APIs แผนที่ และ Notification Worker แจ้งเตือนผ่าน LINE Messaging API
6. **MLOps Lifecycle**: ติดตามและเปรียบเทียบผลทดลองและจัดการโมเดลผ่าน MLflow Model Registry
7. **Full Observability**: ติดตามประสิทธิภาพระบบด้วย Prometheus, Grafana, Loki, Tempo, และ OpenTelemetry

---

## 🏗️ สถาปัตยกรรมระบบ (Architecture)

```text
               [ Realtime CCTV & Rain/Water APIs ]
                               │
                               ▼
                    [ Ingestion Worker ]
                     (Redis / ARQ Task)
                     ┌─────────┴─────────┐
                     ▼                   ▼
           [ MinIO Object Store ]  [ PostgreSQL DB ]
              (Images & Models)      (Time-Series Data)
                     │                   │
                     ▼                   ▼
            [ Vision Worker ]    [ Forecast Worker ]
         (Quality Gate / Review)   (Input Policy 1-3h)
                     │                   │
                     └─────────┬─────────┘
                               ▼
                     [ FastAPI Backend ]
                               │
                ┌──────────────┴──────────────┐
                ▼                             ▼
       [ Web Presentation ]          [ LINE Alert Worker ]
   (Map, Charts & Review UI)        (Messaging API Webhook)
```

---

## 🚀 เริ่มต้นใช้งานอย่างรวดเร็ว (Quick Start)

### 1. คัดลอกและตั้งค่า Environment Variables
```bash
cp .env.example .env
```

### 2. รันระบบทั้งหมดด้วย Docker Compose (ใช้ uv build อัตโนมัติ)
```bash
docker compose up -d --build
```

### ทางเลือก: การรันแบบ Local Development ด้วย `uv`
```bash
# ติดตั้ง dependencies และสร้าง Virtual Environment อัตโนมัติ
uv sync

# รัน Backend เซิร์ฟเวอร์
cd backend && uv run uvicorn main:app --reload
```

### 3. ตรวจสอบการทำงานผ่าน Web UIs
| บริการ (Service) | URL | ข้อมูลการเข้าสู่ระบบ (Credentials) |
| :--- | :--- | :--- |
| **FastAPI Swagger Docs** | [http://localhost:8000/docs](http://localhost:8000/docs) | - |
| **MLflow Model Registry** | [http://localhost:5000](http://localhost:5000) | - |
| **MinIO Console** | [http://localhost:9001](http://localhost:9001) | `minioadmin` / `minioadmin` |
| **Grafana Dashboard** | [http://localhost:3000](http://localhost:3000) | `admin` / `admin` |
| **Prometheus Metrics** | [http://localhost:9090](http://localhost:9090) | - |
| **Label Studio (Review)** | [http://localhost:8085](http://localhost:8085) | `admin@example.com` / `password123` |

---

## 👥 การแบ่งงานในทีม (Team Responsibilities)
* **คนที่ 1 (Data & Time Series)**: โฟลเดอร์ `ml_experiments/timeseries/` และ `workers/forecast/`
* **คนที่ 2 (Computer Vision & Review)**: โฟลเดอร์ `ml_experiments/vision/` และ `workers/vision/`
* **คนที่ 3 (Platform & Integration)**: โฟลเดอร์ `backend/`, `workers/ingestion/`, `workers/notification/`, `compose.yml`, และ `observability/`
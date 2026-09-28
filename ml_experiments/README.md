# 🧪 ML Experiments & Model Handover Guide (สำหรับเพื่อนร่วมทีมฝั่งโมเดล)

ยินดีต้อนรับสู่พื้นที่พัฒนาโมเดลของโครงการ **Hatyai FloodLens**!  
หน้านี้จัดทำขึ้นเพื่อให้เพื่อนร่วมทีมที่รับผิดชอบ **คนที่ 1 (Data & Time Series)** และ **คนที่ 2 (Computer Vision)** สามารถพัฒนาโมเดลได้อย่างอิสระ และส่งมอบโมเดลเข้าสู่ระบบหลัก (Platform) ได้อย่างราบรื่น

---

## 📂 โครงสร้างโฟลเดอร์ฝั่งโมเดล
```text
ml_experiments/
├── datasets/                   # ที่สำหรับวางไฟล์ Dataset (CSV, JSON, รูปภาพ)
│   ├── sample_measurements.csv # ตัวอย่างข้อมูลระดับน้ำและฝนย้อนหลังของหาดใหญ่
│   └── sample_images/          # ตัวอย่างภาพจากกล้อง CCTV
├── timeseries/                 # โค้ดทดลองเปรียบเทียบโมเดลพยากรณ์ 3 แบบ
│   └── train_forecast.py       # สคริปต์เทรนและบันทึก Metrics (MAE, RMSE) เข้า MLflow
└── vision/                     # โค้ดเทรนโมเดลตรวจวัดผิวน้ำ/อ่านไม้สเกล
    └── train_detector.py       # สคริปต์เทรนและบันทึกโมเดลสาย Vision
```

---

## 🚀 วิธีการส่งมอบโมเดลเข้าสู่ระบบหลัก (Model Handover)

มี 2 วิธีที่สะดวกที่สุด โดยเลือกวิธีใดวิธีหนึ่ง:

### วิธีที่ 1: ลงทะเบียนผ่าน MLflow Model Registry (แนะนำมากที่สุด ⭐)
เมื่อเทรนโมเดลเสร็จ ให้ใช้คำสั่งล็อกเข้าสู่ MLflow ของระบบ (รันตอนเปิด Docker Stack แล้ว):
```python
import mlflow

mlflow.set_tracking_uri("http://localhost:5000")
mlflow.set_experiment("Hatyai-Flood-Forecasting")

with mlflow.start_run():
    # 1. บันทึก Parameters และ Metrics
    mlflow.log_param("model_type", "LSTM")
    mlflow.log_metric("mae_1h", 0.12)
    mlflow.log_metric("rmse_1h", 0.18)

    # 2. บันทึกและลงทะเบียนโมเดลเข้าคลังกลาง
    mlflow.pyfunc.log_model(
        artifact_path="model",
        python_model=your_trained_model,
        registered_model_name="Flood-Forecaster"
    )
```
👉 **ระบบ Backend และ Workers จะดึงโมเดลเวอร์ชันล่าสุด (`models:/Flood-Forecaster/latest`) มาใช้งานอัตโนมัติทันที!**

---

### วิธีที่ 2: ส่งเป็นไฟล์โมเดลน้ำหนัก (Weights File)
หากไม่สะดวกใช้ MLflow สามารถบันทึกโมเดลเป็นไฟล์ เช่น:
* `model.onnx`
* `model.pt` (PyTorch)
* `model.pkl` (Scikit-Learn / XGBoost)

และเขียนฟังก์ชันทำนายผลสั้นๆ ส่งให้เพื่อนฝั่ง Platform:
```python
def predict(water_level_history: list, rainfall_history: list) -> dict:
    # โค้ดรันโมเดลของคุณ
    return {
        "pred_1h": 3.45,
        "pred_2h": 3.80,
        "pred_3h": 4.10
    }
```
จากนั้นเพื่อนฝั่ง Platform จะนำไปใส่แทนที่ไฟล์ `workers/forecast/mock_forecaster.py` ให้ทันทีครับ!

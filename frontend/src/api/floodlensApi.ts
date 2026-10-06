import type { Station, WaterMeasurement, ForecastRecord, AlertEvent, ReviewPackage, RetrainStatus, RetrainTriggerResponse, OnDemandPredictResponse, DetectionStatus, ManualBBoxPayload, ManualBBoxResponse } from '../types';

const API_BASE = '/api/v1';

export const floodlensApi = {
  // 1. Stations
  getStations: async (): Promise<Station[]> => {
    const res = await fetch(`${API_BASE}/stations`);
    if (!res.ok) throw new Error('Failed to fetch stations');
    return res.json();
  },

  getStationByCode: async (code: string): Promise<Station> => {
    const res = await fetch(`${API_BASE}/stations/${code}`);
    if (!res.ok) throw new Error(`Failed to fetch station ${code}`);
    return res.json();
  },

  // 2. Water & Telemetry
  getLatestWater: async (stationCode: string): Promise<WaterMeasurement> => {
    const res = await fetch(`${API_BASE}/water/latest?station_code=${encodeURIComponent(stationCode)}`);
    if (!res.ok) throw new Error('Failed to fetch latest water measurement');
    return res.json();
  },

  getWaterHistory: async (stationCode: string, hours = 24): Promise<WaterMeasurement[]> => {
    const res = await fetch(`${API_BASE}/water/history?station_code=${encodeURIComponent(stationCode)}&hours=${hours}`);
    if (!res.ok) throw new Error('Failed to fetch water history');
    return res.json();
  },

  // 3. Forecast
  getLatestForecast: async (stationCode: string): Promise<ForecastRecord> => {
    const res = await fetch(`${API_BASE}/forecast/latest?station_code=${encodeURIComponent(stationCode)}`);
    if (!res.ok) throw new Error('Failed to fetch forecast');
    return res.json();
  },

  triggerForecast: async (stationCode: string): Promise<ForecastRecord> => {
    const res = await fetch(`${API_BASE}/forecast/trigger?station_code=${encodeURIComponent(stationCode)}`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to trigger forecast');
    return res.json();
  },

  // 4. Human-in-the-Loop & Review
  getReviewPackage: async (measurementId: number, stationCode: string): Promise<ReviewPackage> => {
    const res = await fetch(`${API_BASE}/review/package/${measurementId}?station_code=${encodeURIComponent(stationCode)}`);
    if (!res.ok) throw new Error('Failed to fetch review package');
    return res.json();
  },

  submitReview: async (measurementId: number, correctedWaterLevel: number, reviewerNotes?: string) => {
    const res = await fetch(`${API_BASE}/review/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        measurement_id: measurementId,
        corrected_water_level: correctedWaterLevel,
        reviewer_notes: reviewerNotes || 'Verified by Human Operator',
        is_valid_image: true,
      }),
    });
    if (!res.ok) throw new Error('Failed to submit review');
    return res.json();
  },

  // 5. Alerts
  getRecentAlerts: async (limit = 10): Promise<AlertEvent[]> => {
    const res = await fetch(`${API_BASE}/alerts/recent?limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch alerts');
    return res.json();
  },

  testTriggerAlert: async (stationCode: string, level: number, severity = 'WARNING'): Promise<AlertEvent> => {
    const res = await fetch(`${API_BASE}/alerts/test-trigger?station_code=${encodeURIComponent(stationCode)}&level=${level}&severity=${severity}`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to test alert trigger');
    return res.json();
  },

  // 6. Camera Calibration & Detection
  getDetectionStatus: async (stationCode: string, mode = 'live'): Promise<DetectionStatus> => {
    const res = await fetch(`${API_BASE}/stations/${encodeURIComponent(stationCode)}/detection-status?mode=${encodeURIComponent(mode)}`);
    if (!res.ok) throw new Error('Failed to fetch detection status');
    return res.json();
  },

  saveCalibration: async (stationCode: string, calibrationData: any) => {
    const res = await fetch(`${API_BASE}/stations/${encodeURIComponent(stationCode)}/calibrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(calibrationData),
    });
    if (!res.ok) throw new Error('Failed to save calibration');
    return res.json();
  },

  saveManualBBox: async (stationCode: string, payload: ManualBBoxPayload): Promise<ManualBBoxResponse> => {
    const res = await fetch(`${API_BASE}/stations/${encodeURIComponent(stationCode)}/manual-bbox`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to save manual bounding box');
    }
    return res.json();
  },

  // 7. Continuous Learning & Retrain Hub
  getRetrainStatus: async (): Promise<RetrainStatus> => {
    const res = await fetch(`${API_BASE}/review/retrain-status`);
    if (!res.ok) throw new Error('Failed to fetch retrain status');
    return res.json();
  },

  triggerManualRetrain: async (): Promise<RetrainTriggerResponse> => {
    const res = await fetch(`${API_BASE}/review/trigger-retrain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error('Failed to trigger manual retrain');
    return res.json();
  },

  // 8. On-Demand Water Level Image Predictor
  predictCustomImage: async (formData: FormData): Promise<OnDemandPredictResponse> => {
    try {
      const res = await fetch(`${API_BASE}/vision/predict-custom-image`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        let msg = 'เกิดข้อผิดพลาดในการประมวลผลภาพระดับน้ำ';
        try {
          const errorData = await res.json();
          msg = errorData.detail || msg;
        } catch {
          if (res.status === 502 || res.status === 503) {
            msg = 'ระบบ Backend กำลังรีสตาร์ตหรือเชื่อมต่อชั่วคราว กรุณากดลองอีกครั้ง';
          } else {
            msg = `เกิดข้อผิดพลาดจากเซิร์ฟเวอร์ (HTTP ${res.status})`;
          }
        }
        throw new Error(msg);
      }
      return res.json();
    } catch (err: any) {
      if (err.message) throw err;
      throw new Error('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาตรวจสอบการเชื่อมต่อ');
    }
  },
};


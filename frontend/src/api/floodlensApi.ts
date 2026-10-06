import type { 
  Station, 
  WaterMeasurement, 
  ForecastRecord, 
  AlertEvent, 
  ReviewPackage, 
  RetrainStatus, 
  RetrainTriggerResponse, 
  OnDemandPredictResponse,
  DetectionStatus,
  ManualBBoxPayload,
  ManualBBoxResponse,
  TimeSeriesRetrainStatus,
  TimeSeriesRetrainTriggerResponse,
  SensorDriftStatus,
  IngestionQueueItem,
  ForecastDriftReport
} from '../types';

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

  getLatestRain: async (stationCode: string) => {
    const res = await fetch(`${API_BASE}/water/rain/latest?station_code=${encodeURIComponent(stationCode)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('Failed to fetch latest rainfall');
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

  refreshAllForecasts: async (): Promise<{ stations: { station_code: string; forecast: ForecastRecord | null; error: string | null }[]; ingestion_error: string | null }> => {
    const res = await fetch(`${API_BASE}/forecast/refresh-all`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to refresh forecasts');
    return res.json();
  },

  getForecastHistory: async (stationCode: string, mode: 'shadow' | 'replay' = 'shadow'): Promise<ForecastRecord[]> => {
    const res = await fetch(`${API_BASE}/forecast/history?station_code=${encodeURIComponent(stationCode)}&mode=${mode}&limit=30`);
    if (!res.ok) throw new Error('Failed to fetch forecast history');
    return res.json();
  },

  getForecastComparison: async (id: number) => {
    const res = await fetch(`${API_BASE}/forecast/${id}/comparison`);
    if (!res.ok) throw new Error('Failed to fetch forecast comparison');
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

  // 9. Time Series MLOps Lifecycle
  getTimeSeriesRetrainStatus: async (): Promise<TimeSeriesRetrainStatus> => {
    const res = await fetch(`${API_BASE}/forecast/retrain-status`);
    if (!res.ok) throw new Error('Failed to fetch Time-Series retrain status');
    return res.json();
  },

  triggerTimeSeriesRetrain: async (): Promise<TimeSeriesRetrainTriggerResponse> => {
    const res = await fetch(`${API_BASE}/forecast/trigger-retrain`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to trigger Time-Series retrain');
    return res.json();
  },

  getSensorDriftStatus: async (): Promise<SensorDriftStatus> => {
    const res = await fetch(`${API_BASE}/forecast/drift-status`);
    if (!res.ok) throw new Error('Failed to fetch sensor drift status');
    return res.json();
  },

  // 10. Time Series Human-in-the-Loop (HITL) Validation
  getIngestionQueue: async (): Promise<IngestionQueueItem[]> => {
    const res = await fetch(`${API_BASE}/review/timeseries/ingestion-queue`);
    if (!res.ok) throw new Error('Failed to fetch ingestion review queue');
    return res.json();
  },

  applyIngestionOverride: async (payload: {
    review_id: string;
    selected_choice: string;
    verified_water_level: number;
    reviewer_name: string;
    reviewer_notes?: string;
  }): Promise<any> => {
    const res = await fetch(`${API_BASE}/review/timeseries/ingestion-override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to apply ingestion override');
    return res.json();
  },

  simulateIngestionAnomaly: async (payload: {
    station_code: string;
    station_name: string;
    vision_water_level: number;
    sensor_water_level: number;
  }): Promise<any> => {
    const res = await fetch(`${API_BASE}/review/timeseries/ingestion-simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to simulate ingestion anomaly');
    return res.json();
  },

  getForecastDriftReport: async (): Promise<ForecastDriftReport> => {
    const res = await fetch(`${API_BASE}/review/timeseries/forecast-drift`);
    if (!res.ok) throw new Error('Failed to fetch forecast drift report');
    return res.json();
  },

  triggerDriftRetrain: async (payload: {
    reviewer_name: string;
    reviewer_notes?: string;
  }): Promise<any> => {
    const res = await fetch(`${API_BASE}/review/timeseries/trigger-drift-retrain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to trigger retrain from drift alert');
    return res.json();
  },

  acknowledgeDrift: async (payload: {
    reviewer_name: string;
    reviewer_notes?: string;
  }): Promise<any> => {
    const res = await fetch(`${API_BASE}/review/timeseries/acknowledge-drift`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to acknowledge drift alert');
    return res.json();
  },

  simulateForecastDrift: async (residual_error: number = 0.65): Promise<any> => {
    const res = await fetch(`${API_BASE}/review/timeseries/simulate-drift`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ residual_error }),
    });
    if (!res.ok) throw new Error('Failed to simulate forecast drift');
    return res.json();
  },
};


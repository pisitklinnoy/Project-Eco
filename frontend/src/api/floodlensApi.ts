import type { Station, WaterMeasurement, ForecastRecord, ForecastComparison, AlertEvent, ReviewPackage } from '../types';

const API_BASE = '/api/v1';

async function apiError(response: Response): Promise<Error> {
  const body = await response.json().catch(() => ({}));
  return new Error(typeof body.detail === 'string' ? body.detail : `API error (${response.status})`);
}

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
  getLatestWater: async (stationCode: string): Promise<WaterMeasurement | null> => {
    const res = await fetch(`${API_BASE}/water/latest?station_code=${encodeURIComponent(stationCode)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw await apiError(res);
    return res.json();
  },

  getWaterHistory: async (stationCode: string, hours = 24): Promise<WaterMeasurement[]> => {
    const res = await fetch(`${API_BASE}/water/history?station_code=${encodeURIComponent(stationCode)}&hours=${hours}`);
    if (!res.ok) throw new Error('Failed to fetch water history');
    return res.json();
  },

  // 3. Forecast
  getLatestForecast: async (stationCode: string): Promise<ForecastRecord | null> => {
    const res = await fetch(`${API_BASE}/forecast/latest?station_code=${encodeURIComponent(stationCode)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw await apiError(res);
    return res.json();
  },

  triggerForecast: async (stationCode: string): Promise<ForecastRecord> => {
    const res = await fetch(`${API_BASE}/forecast/trigger?station_code=${encodeURIComponent(stationCode)}`, {
      method: 'POST',
    });
    if (!res.ok) throw await apiError(res);
    return res.json();
  },

  getForecastHistory: async (stationCode: string, mode: 'shadow' | 'replay' = 'shadow'): Promise<ForecastRecord[]> => {
    const res = await fetch(`${API_BASE}/forecast/history?station_code=${encodeURIComponent(stationCode)}&mode=${mode}&limit=30`);
    if (!res.ok) throw await apiError(res);
    return res.json();
  },

  getForecastComparison: async (id: number): Promise<ForecastComparison> => {
    const res = await fetch(`${API_BASE}/forecast/${id}/comparison`);
    if (!res.ok) throw await apiError(res);
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

  // 6. Interactive Features (What-If & Calibration)
  simulateWhatIf: async (
    stationCode: string,
    params: {
      rain_surge_mm: number;
      upstream_surge_percent: number;
      gate_r1_open_percent: number;
      sea_tide_surge_m: number;
    }
  ): Promise<ForecastRecord> => {
    const query = new URLSearchParams({
      station_code: stationCode,
      rain_surge_mm: params.rain_surge_mm.toString(),
      upstream_surge_percent: params.upstream_surge_percent.toString(),
      gate_r1_open_percent: params.gate_r1_open_percent.toString(),
      sea_tide_surge_m: params.sea_tide_surge_m.toString(),
    });
    const res = await fetch(`${API_BASE}/forecast/simulate?${query.toString()}`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to run what-if simulation');
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
};


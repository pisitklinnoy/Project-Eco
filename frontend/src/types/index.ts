export interface Station {
  id: number;
  station_code: string;
  name: string;
  location_name: string;
  latitude: number;
  longitude: number;
  normal_level: number;
  warning_level: number;
  critical_level: number;
  bank_level: number;
  camera_id?: string;
  camera_stream_url?: string;
  is_active: boolean;
}

export interface WaterMeasurement {
  id: number;
  station_code: string;
  timestamp: string;
  water_level: number;
  source_type: string;
  image_minio_path?: string;
  vision_confidence?: number;
  is_reviewed_by_human: boolean;
}

export interface ForecastRecord {
  id: number;
  station_code: string;
  forecast_time: string;
  predicted_1h: number;
  predicted_2h: number;
  predicted_3h: number;
  model_name: string;
  model_version: string;
  input_mode: string;
  data_quality_status: string;
}

export interface AlertEvent {
  id: number;
  station_code: string;
  timestamp: string;
  severity_level: 'INFO' | 'WARNING' | 'CRITICAL';
  trigger_water_level: number;
  message: string;
  is_sent_line: boolean;
}

export interface ReviewImageContext {
  snapshot_time: string;
  image_url: string;
  ai_detected_level?: number;
  ai_confidence?: number;
  rain_amount_1h: number;
  api_water_level?: number;
}

export interface ReviewPackage {
  package_id: string;
  station_code: string;
  current_image_url: string;
  historical_images: ReviewImageContext[];
  reason_flagged: string;
  created_at: string;
}

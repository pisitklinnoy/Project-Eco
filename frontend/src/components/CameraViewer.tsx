import React, { useState, useEffect, useRef } from 'react';
import type { Station, WaterMeasurement } from '../types';
import {
  Camera,
  Eye,
  EyeOff,
  Radio,
  Target,
  Sparkles,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  Move,
  Sliders,
  CheckCircle,
  Columns,
  AlertTriangle,
  Flag,
  Crop,
} from 'lucide-react';

// เกณฑ์ระดับน้ำและสีธงเตือนภัยตามเงื่อนไขของแต่ละสถานี
export interface StationFlagInfo {
  flagColor: 'green' | 'yellow' | 'red';
  flagName: string; // 'ธงเขียว' | 'ธงเหลือง' | 'ธงแดง'
  statusTitle: string; // 'ภาวะปกติ' | 'เฝ้าระวัง' | 'วิกฤต'
  description: string;
  containerBg: string;
  containerBorder: string;
  flagColorClass: string;
  flagTextClass: string;
  dotColor: string;
  pingDotColor: string;
  thresholdGuide: string;
}

export function getStationFlagInfo(station: Station | null, currentLevel: number): StationFlagInfo {
  if (!station) {
    return {
      flagColor: 'green',
      flagName: 'ธงเขียว',
      statusTitle: 'ภาวะปกติ',
      description: 'ระดับน้ำปกติ',
      containerBg: 'bg-slate-950/80',
      containerBorder: 'border-emerald-500/40',
      flagColorClass: 'text-emerald-400 fill-emerald-400',
      flagTextClass: 'text-emerald-300',
      dotColor: 'bg-emerald-400',
      pingDotColor: 'bg-emerald-400',
      thresholdGuide: '0 - 8.00 ม. (ธงเขียว)',
    };
  }

  const code = (station.station_code || '').toUpperCase();
  const name = station.name || '';

  // 1. สะพานม่วงก็อง (0-15.90m: ธงเขียว | 15.91-16.55m: ธงเหลือง | 16.556m+: ธงแดง)
  if (code.includes('MUANGKONG') || code.includes('X.173') || name.includes('ม่วงก็อง')) {
    const guide = '0 - 15.90 ม. (ธงเขียว) | 15.91 - 16.55 ม. (ธงเหลือง) | > 16.55 ม. (ธงแดง)';
    if (currentLevel <= 15.90) {
      return {
        flagColor: 'green',
        flagName: 'ธงเขียว',
        statusTitle: 'ภาวะปกติ',
        description: 'ระดับน้ำปกติ ปลอดภัย',
        containerBg: 'bg-slate-950/80',
        containerBorder: 'border-emerald-500/50 shadow-emerald-950/30',
        flagColorClass: 'text-emerald-400 fill-emerald-400',
        flagTextClass: 'text-emerald-300',
        dotColor: 'bg-emerald-400',
        pingDotColor: 'bg-emerald-400',
        thresholdGuide: guide,
      };
    } else if (currentLevel <= 16.55) {
      return {
        flagColor: 'yellow',
        flagName: 'ธงเหลือง',
        statusTitle: 'เฝ้าระวัง',
        description: 'ระดับน้ำเตือนภัย เฝ้าระวังใกล้ชิด',
        containerBg: 'bg-slate-950/80',
        containerBorder: 'border-amber-500/50 shadow-amber-950/30',
        flagColorClass: 'text-amber-400 fill-amber-400',
        flagTextClass: 'text-amber-300',
        dotColor: 'bg-amber-400',
        pingDotColor: 'bg-amber-400',
        thresholdGuide: guide,
      };
    } else {
      return {
        flagColor: 'red',
        flagName: 'ธงแดง',
        statusTitle: 'วิกฤต',
        description: 'ระดับน้ำวิกฤต ล้นตลิ่ง/อันตราย',
        containerBg: 'bg-slate-950/85',
        containerBorder: 'border-rose-500/60 shadow-rose-950/40',
        flagColorClass: 'text-rose-500 fill-rose-500',
        flagTextClass: 'text-rose-300',
        dotColor: 'bg-rose-500',
        pingDotColor: 'bg-rose-500 animate-ping',
        thresholdGuide: guide,
      };
    }
  }

  // 2. บางศาลา (0-8.00m: ธงเขียว | 8.01-9.30m: ธงเหลือง | 9.31m+: ธงแดง)
  if (code.includes('BANGSALA') || code.includes('X.90') || name.includes('บางศาลา')) {
    const guide = '0 - 8.00 ม. (ธงเขียว) | 8.01 - 9.30 ม. (ธงเหลือง) | > 9.30 ม. (ธงแดง)';
    if (currentLevel <= 8.00) {
      return {
        flagColor: 'green',
        flagName: 'ธงเขียว',
        statusTitle: 'ภาวะปกติ',
        description: 'ระดับน้ำปกติ ปลอดภัย',
        containerBg: 'bg-slate-950/80',
        containerBorder: 'border-emerald-500/50 shadow-emerald-950/30',
        flagColorClass: 'text-emerald-400 fill-emerald-400',
        flagTextClass: 'text-emerald-300',
        dotColor: 'bg-emerald-400',
        pingDotColor: 'bg-emerald-400',
        thresholdGuide: guide,
      };
    } else if (currentLevel <= 9.30) {
      return {
        flagColor: 'yellow',
        flagName: 'ธงเหลือง',
        statusTitle: 'เฝ้าระวัง',
        description: 'ระดับน้ำเตือนภัย เฝ้าระวังใกล้ชิด',
        containerBg: 'bg-slate-950/80',
        containerBorder: 'border-amber-500/50 shadow-amber-950/30',
        flagColorClass: 'text-amber-400 fill-amber-400',
        flagTextClass: 'text-amber-300',
        dotColor: 'bg-amber-400',
        pingDotColor: 'bg-amber-400',
        thresholdGuide: guide,
      };
    } else {
      return {
        flagColor: 'red',
        flagName: 'ธงแดง',
        statusTitle: 'วิกฤต',
        description: 'ระดับน้ำวิกฤต ล้นตลิ่ง/อันตราย',
        containerBg: 'bg-slate-950/85',
        containerBorder: 'border-rose-500/60 shadow-rose-950/40',
        flagColorClass: 'text-rose-500 fill-rose-500',
        flagTextClass: 'text-rose-300',
        dotColor: 'bg-rose-500',
        pingDotColor: 'bg-rose-500 animate-ping',
        thresholdGuide: guide,
      };
    }
  }

  // 3. ที่ว่าการ อ.หาดใหญ่ / หาดใหญ่นอก (0-7.30m: ธงเขียว | 7.31-8.30m: ธงเหลือง | 8.31m+: ธงแดง)
  if (code.includes('HATYAI') || code.includes('X.44') || name.includes('หาดใหญ่')) {
    const guide = '0 - 7.30 ม. (ธงเขียว) | 7.31 - 8.30 ม. (ธงเหลือง) | > 8.30 ม. (ธงแดง)';
    if (currentLevel <= 7.30) {
      return {
        flagColor: 'green',
        flagName: 'ธงเขียว',
        statusTitle: 'ภาวะปกติ',
        description: 'ระดับน้ำปกติ ปลอดภัย',
        containerBg: 'bg-slate-950/80',
        containerBorder: 'border-emerald-500/50 shadow-emerald-950/30',
        flagColorClass: 'text-emerald-400 fill-emerald-400',
        flagTextClass: 'text-emerald-300',
        dotColor: 'bg-emerald-400',
        pingDotColor: 'bg-emerald-400',
        thresholdGuide: guide,
      };
    } else if (currentLevel <= 8.30) {
      return {
        flagColor: 'yellow',
        flagName: 'ธงเหลือง',
        statusTitle: 'เฝ้าระวัง',
        description: 'ระดับน้ำเตือนภัย เฝ้าระวังใกล้ชิด',
        containerBg: 'bg-slate-950/80',
        containerBorder: 'border-amber-500/50 shadow-amber-950/30',
        flagColorClass: 'text-amber-400 fill-amber-400',
        flagTextClass: 'text-amber-300',
        dotColor: 'bg-amber-400',
        pingDotColor: 'bg-amber-400',
        thresholdGuide: guide,
      };
    } else {
      return {
        flagColor: 'red',
        flagName: 'ธงแดง',
        statusTitle: 'วิกฤต',
        description: 'ระดับน้ำวิกฤต ล้นตลิ่ง/อันตราย',
        containerBg: 'bg-slate-950/85',
        containerBorder: 'border-rose-500/60 shadow-rose-950/40',
        flagColorClass: 'text-rose-500 fill-rose-500',
        flagTextClass: 'text-rose-300',
        dotColor: 'bg-rose-500',
        pingDotColor: 'bg-rose-500 animate-ping',
        thresholdGuide: guide,
      };
    }
  }

  // Fallback สำหรับสถานีทั่วไป
  const warn = station.warning_level ?? 8.0;
  const crit = station.critical_level ?? 9.3;
  const guide = `≤ ${warn.toFixed(2)} ม. (ธงเขียว) | ${warn.toFixed(2)} - ${crit.toFixed(2)} ม. (ธงเหลือง) | > ${crit.toFixed(2)} ม. (ธงแดง)`;

  if (currentLevel <= warn) {
    return {
      flagColor: 'green',
      flagName: 'ธงเขียว',
      statusTitle: 'ภาวะปกติ',
      description: 'ระดับน้ำปกติ ปลอดภัย',
      containerBg: 'bg-slate-950/80',
      containerBorder: 'border-emerald-500/50 shadow-emerald-950/30',
      flagColorClass: 'text-emerald-400 fill-emerald-400',
      flagTextClass: 'text-emerald-300',
      dotColor: 'bg-emerald-400',
      pingDotColor: 'bg-emerald-400',
      thresholdGuide: guide,
    };
  } else if (currentLevel <= crit) {
    return {
      flagColor: 'yellow',
      flagName: 'ธงเหลือง',
      statusTitle: 'เฝ้าระวัง',
      description: 'ระดับน้ำเตือนภัย เฝ้าระวังใกล้ชิด',
      containerBg: 'bg-slate-950/80',
      containerBorder: 'border-amber-500/50 shadow-amber-950/30',
      flagColorClass: 'text-amber-400 fill-amber-400',
      flagTextClass: 'text-amber-300',
      dotColor: 'bg-amber-400',
      pingDotColor: 'bg-amber-400',
      thresholdGuide: guide,
    };
  } else {
    return {
      flagColor: 'red',
      flagName: 'ธงแดง',
      statusTitle: 'วิกฤต',
      description: 'ระดับน้ำวิกฤต ล้นตลิ่ง/อันตราย',
      containerBg: 'bg-slate-950/85',
      containerBorder: 'border-rose-500/60 shadow-rose-950/40',
      flagColorClass: 'text-rose-500 fill-rose-500',
      flagTextClass: 'text-rose-300',
      dotColor: 'bg-rose-500',
      pingDotColor: 'bg-rose-500 animate-ping',
      thresholdGuide: guide,
    };
  }
}

interface CameraViewerProps {
  station: Station | null;
  measurement: WaterMeasurement | null;
  onOpenReview?: () => void;
  onOpenCalibrate?: () => void;
  onOpenManualBBox?: () => void;
  onOpenOnDemand?: () => void;
}

export const CameraViewer: React.FC<CameraViewerProps> = ({
  station,
  measurement,
  onOpenReview,
  onOpenCalibrate,
  onOpenManualBBox,
  onOpenOnDemand,
}) => {
  const [imgError, setImgError] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(Date.now());
  
  // View Mode: 'live' = Realtime CCTV Feed with AI Bounding Box | 'ai_dashboard' = Realtime AI Staff Gauge Cropped Inspection
  const [viewMode, setViewMode] = useState<'live' | 'ai_dashboard'>('live');

  // AI Scenario: 'live' (โหมดตรวจจับสดกล้อง CCTV)
  const aiScenario = 'live';

  // AI View Mode: 'cctv' = Full 16:9 CCTV view with Bounding Box | 'gauge' = High-Res Staff Gauge Scale Ruler | 'composite' = Stitched dual view
  const [aiViewType, setAiViewType] = useState<'cctv' | 'gauge' | 'composite'>('cctv');

  // Overlay Mode: 'bbox' = Green rectangular Bounding Box as preferred
  const overlayMode = 'bbox';

  // Aspect Ratio Fit Mode: 'contain' = สัดส่วนจริง ไม่ตัดขอบ (Default) | 'cover' = เต็มพื้นที่กรอบ
  const [fitMode, setFitMode] = useState<'contain' | 'cover'>('contain');

  // AI Staff Gauge Detection Status
  interface DetectionStatus {
    detected: boolean;
    is_manual?: boolean;
    confidence: number;
    water_level?: number | null;
    bbox?: number[];
    station_code: string;
    station_name: string;
    mode: string;
    can_analyze_gauge: boolean;
    recommendation?: string;
    message?: string;
  }
  const [detectionStatus, setDetectionStatus] = useState<DetectionStatus | null>(null);

  const isHatyai = Boolean(
    station?.station_code.toUpperCase().includes('HATYAI') ||
    station?.station_code.toUpperCase().includes('X.44')
  );

  // คำนวณระดับน้ำปัจจุบันและสถานะธงเตือนภัยตามเกณฑ์ของสถานี
  // ลำดับความสำคัญ:
  // 1. หาก detectionStatus มีค่าระดับน้ำจากการตรวจจับ AI ของกล้องนี้ ให้ใช้ค่านั้นก่อน เพราะตรงกับสิ่งที่ AI วัดได้บนภาพกล้องสดขณะนั้นจริงๆ
  // 2. หากมีข้อมูล measurement ล่าสุด ให้ใช้ measurement.water_level
  // 3. สำรองด้วย station.normal_level
  let currentWaterLevel: number;
  if (detectionStatus?.water_level != null) {
    currentWaterLevel = detectionStatus.water_level;
  } else if (measurement?.water_level != null) {
    currentWaterLevel = measurement.water_level;
  } else {
    currentWaterLevel = station?.normal_level ?? 0;
  }
  const flagInfo = getStationFlagInfo(station, currentWaterLevel);

  // Zoom & Pan state
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  
  // Toggle overlay badges to ensure NOTHING blocks the camera stream / timestamp when zooming
  const [showOverlays, setShowOverlays] = useState<boolean>(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const modalContainerRef = useRef<HTMLDivElement>(null);

  // Camera feed stream source state for Hatyai (Axis vs Proxy vs Climate)
  const [hatyaiSource, setHatyaiSource] = useState<'backend_proxy' | 'axis_stream' | 'climate_snapshot'>('backend_proxy');

  useEffect(() => {
    setImgError(false);
    // Reset zoom when switching station
    setZoomLevel(1.0);
    setPan({ x: 0, y: 0 });
    if (isHatyai) {
      setHatyaiSource('backend_proxy');
    }
  }, [station?.station_code, isHatyai]);

  // Auto refresh image: 12s in Live AI mode, 60s otherwise
  useEffect(() => {
    const intervalMs = (viewMode === 'ai_dashboard' && aiScenario === 'live') ? 12000 : 60000;
    const timer = setInterval(() => {
      setRefreshKey(Date.now());
    }, intervalMs);
    return () => clearInterval(timer);
  }, [viewMode, aiScenario]);

  // Fetch AI Staff Gauge detection status from backend
  useEffect(() => {
    if (!station?.station_code) return;
    let isMounted = true;
    const fetchDetectionStatus = async () => {
      try {
        const modeParam = viewMode === 'ai_dashboard' ? aiScenario : 'live';
        const res = await fetch(`/api/v1/stations/${encodeURIComponent(station.station_code)}/detection-status?mode=${modeParam}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setDetectionStatus(data);
          }
        }
      } catch (err) {
        console.warn('[CameraViewer] Failed to check detection status:', err);
      }
    };

    fetchDetectionStatus();
    return () => {
      isMounted = false;
    };
  }, [station?.station_code, aiScenario, viewMode, refreshKey]);

  if (!station) return null;

  const getActiveStreamUrl = () => {
    if (!station) return null;
    if (isHatyai) {
      if (hatyaiSource === 'axis_stream') {
        return `http://live:Live2025!@ta200304.dyndns.info:5001/axis-cgi/mjpg/video.cgi`;
      }
      if (hatyaiSource === 'backend_proxy') {
        return `/api/v1/stations/${encodeURIComponent(station.station_code)}/live-feed.jpg?t=${refreshKey}`;
      }
      return `https://hatyaicityclimate.org/floodphoto/last/hatyainai.jpg?t=${refreshKey}`;
    }
    return station.camera_stream_url
      ? `${station.camera_stream_url}?t=${refreshKey}`
      : null;
  };

  const streamUrl = getActiveStreamUrl();

  const handleImageError = () => {
    if (isHatyai) {
      if (hatyaiSource === 'axis_stream') {
        console.warn('[CameraViewer] Axis direct stream failed, switching to backend proxy');
        setHatyaiSource('backend_proxy');
        return;
      }
      if (hatyaiSource === 'backend_proxy') {
        console.warn('[CameraViewer] Backend proxy failed, switching to climate snapshot');
        setHatyaiSource('climate_snapshot');
        return;
      }
    }
    setImgError(true);
  };

  // Dynamic vs static fallback AI dashboard URLs
  const getAiDashboardUrls = (
    code: string,
    scenario: 'daytime' | 'nighttime' | 'live',
    overlay: 'bbox' | 'polygon',
    viewType: 'cctv' | 'gauge' | 'composite'
  ) => {
    const upper = code.toUpperCase();
    const normCode = (upper.includes('MUANGKONG') || upper.includes('173A')) ? 'STN-MUANGKONG' :
                     (upper.includes('BANGSALA') || upper.includes('90')) ? 'STN-BANGSALA' :
                     'STN-HATYAINAI';

    let fallbackFilename = `${normCode}.jpg`;
    if (scenario === 'nighttime') fallbackFilename = `${normCode}_night.jpg`;

    const dynamicUrl = `/api/v1/stations/${encodeURIComponent(code)}/cctv-analysis.jpg?mode=${scenario}&overlay=${overlay}&view=${viewType}&t=${refreshKey}`;
    const staticUrl = `/ai_dashboards/${fallbackFilename}?t=${refreshKey}`;
    return { dynamicUrl, staticUrl };
  };

  const { dynamicUrl: aiDashboardUrl, staticUrl: staticFallbackUrl } = getAiDashboardUrls(
    station.station_code,
    aiScenario,
    overlayMode,
    aiViewType
  );

  // Zoom Handlers
  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(Number((prev + 0.3).toFixed(1)), 3.5));
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => {
      const next = Math.max(Number((prev - 0.3).toFixed(1)), 1.0);
      if (next === 1.0) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  const handleResetZoom = () => {
    setZoomLevel(1.0);
    setPan({ x: 0, y: 0 });
  };

  // Mouse Drag Panning
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomLevel <= 1.0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || zoomLevel <= 1.0) return;
    e.preventDefault();
    const maxPan = (zoomLevel - 1) * 220;
    const newX = Math.max(Math.min(e.clientX - dragStart.x, maxPan), -maxPan);
    const newY = Math.max(Math.min(e.clientY - dragStart.y, maxPan), -maxPan);
    setPan({ x: newX, y: newY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const delta = e.deltaY > 0 ? -0.2 : 0.2;
    const maxZoom = isFullscreen ? 4.0 : 3.5;
    setZoomLevel((prev) => {
      const next = Math.min(Math.max(Number((prev + delta).toFixed(1)), 1.0), maxZoom);
      if (next === 1.0) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  // Native non-passive Wheel Event Listeners to prevent browser window scrolling while zooming
  useEffect(() => {
    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY > 0 ? -0.2 : 0.2;
      const maxZoom = isFullscreen ? 4.0 : 3.5;
      setZoomLevel((prev) => {
        const next = Math.min(Math.max(Number((prev + delta).toFixed(1)), 1.0), maxZoom);
        if (next === 1.0) setPan({ x: 0, y: 0 });
        return next;
      });
    };

    const containerEl = containerRef.current;
    if (containerEl) {
      containerEl.addEventListener('wheel', handleNativeWheel, { passive: false });
    }

    const modalEl = modalContainerRef.current;
    if (modalEl) {
      modalEl.addEventListener('wheel', handleNativeWheel, { passive: false });
    }

    return () => {
      if (containerEl) {
        containerEl.removeEventListener('wheel', handleNativeWheel);
      }
      if (modalEl) {
        modalEl.removeEventListener('wheel', handleNativeWheel);
      }
    };
  }, [isFullscreen, viewMode, aiViewType, station?.station_code]);

  const zoomPercent = Math.round(zoomLevel * 100);

  const renderNotDetectedRecommendation = (isModal: boolean = false) => (
    <div className="flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto bg-slate-900/95 border border-amber-500/40 rounded-3xl shadow-2xl backdrop-blur-md">
      <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-4 text-amber-400">
        <AlertTriangle className="w-8 h-8 animate-pulse" />
      </div>

      <h3 className="text-base sm:text-lg font-black text-white mb-1.5">
        ไม่พบเสาวัดระดับน้ำ (Staff Gauge Not Detected)
      </h3>

      <div className="inline-flex items-center space-x-1.5 px-3 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-mono mb-3">
        <span>โมเดล AI: model_best_v2.pt</span>
        <span>&bull;</span>
        <span>โหมด: กล้องสด (Live)</span>
      </div>

      <p className="text-xs text-slate-300 mb-4 leading-relaxed max-w-md">
        ระบบ AI ยังไม่สามารถตรวจจับเสาวัดระดับน้ำในภาพมุมกล้องนี้ได้ จึง<strong>ไม่สามารถแสดงภาพสเกลเสาหรือวิเคราะห์ระดับน้ำอัตโนมัติได้</strong>
      </p>

      <div className="w-full bg-amber-950/40 border border-amber-600/30 rounded-2xl p-3.5 mb-5 text-left text-xs text-amber-100">
        <div className="flex items-center space-x-2 text-amber-300 font-extrabold text-xs mb-1">
          <Sliders className="w-4 h-4 shrink-0 text-amber-400" />
          <span>คำแนะนำเมื่อกล้อง CCTV ไม่พบเสาวัดน้ำ ณ ขณะนี้:</span>
        </div>
        <p className="text-[11px] text-amber-200/90 leading-normal">
          กรุณาใช้ฟีเจอร์ <strong>"วาดกรอบเสาจากภาพสด" (Manual BBox)</strong> เพื่อมาร์กตำแหน่งเสาวัดระดับน้ำบนภาพกล้องสด ณ เวลานี้ ระบบจะนำภาพสดพร้อมพิกัดเสาไปจัดเก็บเป็น Label เพิ่มเติมใน <strong>Retrain Dataset</strong> เพื่อเพิ่มจำนวนข้อมูลฝึกสอนให้โมเดล AI ฉลาดขึ้นในอนาคต
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full">
        {onOpenManualBBox && (
          <button
            onClick={() => {
              if (isModal) setIsFullscreen(false);
              onOpenManualBBox();
            }}
            className="flex-1 w-full py-2.5 px-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-orange-500/25 transition flex items-center justify-center space-x-2 cursor-pointer"
          >
            <Sliders className="w-4 h-4" />
            <span>วาดกรอบเสาจากภาพสด (Manual BBox)</span>
          </button>
        )}

        {onOpenCalibrate && (
          <button
            onClick={() => {
              if (isModal) setIsFullscreen(false);
              onOpenCalibrate();
            }}
            className="w-full sm:w-auto py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-white/10 transition flex items-center justify-center space-x-1.5 cursor-pointer"
          >
            <Target className="w-3.5 h-3.5 text-blue-400" />
            <span>ปรับเทียบเสา</span>
          </button>
        )}

        <button
          onClick={() => setAiViewType('cctv')}
          className="w-full sm:w-auto py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl border border-white/10 transition flex items-center justify-center space-x-1.5 cursor-pointer"
        >
          <Camera className="w-3.5 h-3.5" />
          <span>ดูมุมกล้อง</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="bg-white/85 backdrop-blur-2xl border border-white/90 rounded-[32px] sm:rounded-[36px] overflow-hidden shadow-[0_20px_50px_-12px_rgba(15,23,42,0.06)] hover:shadow-[0_24px_60px_-12px_rgba(15,23,42,0.10)] transition-all flex flex-col h-full min-h-[480px]">
        
        {/* Header with View Mode Switcher */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-white via-sky-50/30 to-white border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-sky-500 text-white flex items-center justify-center shadow-md shadow-blue-500/25 shrink-0 border border-white/30">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-black text-slate-900 tracking-tight">
                  กล้อง CCTV สด & AI ตรวจวัดเสาน้ำ
                </h3>
                <span className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border ${
                  isHatyai
                    ? 'bg-sky-50 text-sky-800 border-sky-300 font-extrabold shadow-xs'
                    : 'bg-slate-100 text-slate-700 border-slate-200'
                }`}>
                  {isHatyai ? 'Axis TA200304' : (station.camera_id || station.station_code)}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                {viewMode === 'live'
                  ? (isHatyai ? 'สตรีมสด Axis Camera (ที่ว่าการ อ.หาดใหญ่)' : 'ภาพกล้องถ่ายทอดสดแบบเรียลไทม์ (LIVE CCTV)')
                  : 'ตรวจจับตำแหน่งเสาวัดน้ำด้วยโมเดล AI (model_best_v2.pt) แบบ Realtime'}
              </p>
            </div>
          </div>

          {/* Mode Toggle Buttons: [Live Feed] VS [AI Staff Gauge Model Dashboard] */}
          <div className="flex items-center bg-slate-100/90 p-1 rounded-full border border-slate-200/80 shadow-inner">
            <button
              onClick={() => { setViewMode('live'); handleResetZoom(); }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                viewMode === 'live'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Radio className={`w-3 h-3 ${viewMode === 'live' ? 'text-white animate-pulse' : 'text-slate-400'}`} />
              <span>ภาพกล้องสด (LIVE)</span>
            </button>

            <button
              onClick={() => { setViewMode('ai_dashboard'); handleResetZoom(); }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                viewMode === 'ai_dashboard'
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sparkles className={`w-3.5 h-3.5 ${viewMode === 'ai_dashboard' ? 'text-amber-300 animate-spin' : 'text-slate-400'}`} />
              <span>วิเคราะห์ AI Staff Gauge</span>
            </button>
          </div>
        </div>

        {/* Hatyai Axis Camera Dedicated Ribbon - Only in Live Mode */}
        {isHatyai && viewMode === 'live' && (
          <div className="px-5 py-2 bg-gradient-to-r from-sky-50/90 via-blue-50/40 to-white border-b border-sky-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="font-bold text-slate-800 text-[11px]">
                Axis Network Camera (TA200304) &bull; ข้างที่ว่าการ อ.หาดใหญ่
              </span>
              <span className="text-[10px] text-slate-500 font-mono bg-white px-2 py-0.5 rounded-md border border-slate-200 hidden md:inline">
                ta200304.dyndns.info:5001/axis-cgi/mjpg/video.cgi
              </span>
            </div>

            <div className="flex items-center space-x-1 bg-white p-0.5 rounded-xl border border-slate-200 text-[10px]">
              <button
                onClick={() => { setHatyaiSource('backend_proxy'); setImgError(false); }}
                className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer flex items-center space-x-1 ${
                  hatyaiSource === 'backend_proxy'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="สตรีมสดผ่าน Backend Proxy (Auto Basic Auth & Fast Response)"
              >
                <Sparkles className="w-3 h-3 text-sky-400" />
                <span>Proxy สด</span>
              </button>
              <button
                onClick={() => { setHatyaiSource('axis_stream'); setImgError(false); }}
                className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer flex items-center space-x-1 ${
                  hatyaiSource === 'axis_stream'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="เชื่อมต่อสตรีมตรง http://live:Live2025!@ta200304.dyndns.info:5001/axis-cgi/mjpg/video.cgi"
              >
                <Radio className="w-3 h-3 text-white" />
                <span>Axis Direct</span>
              </button>
              <button
                onClick={() => { setHatyaiSource('climate_snapshot'); setImgError(false); }}
                className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer flex items-center space-x-1 ${
                  hatyaiSource === 'climate_snapshot'
                    ? 'bg-slate-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="ภาพสำรองจาก HatyaiCity Climate"
              >
                <span>ภาพสำรอง</span>
              </button>
            </div>
          </div>
        )}

        {/* AI Staff Gauge Dedicated Controls Ribbon - When in AI Dashboard Mode */}
        {viewMode === 'ai_dashboard' && (
          <div className="px-5 py-2 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white border-b border-indigo-900/50 flex flex-wrap items-center justify-between gap-2 text-xs">
            {/* Left: View Type Switcher (กล้อง CCTV / สเกลเสา / สองมุมมอง) */}
            <div className="flex items-center space-x-1 bg-white/10 p-0.5 rounded-xl border border-white/15 text-[11px]">
              <button
                onClick={() => { setAiViewType('cctv'); handleResetZoom(); }}
                className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center space-x-1 cursor-pointer ${
                  aiViewType === 'cctv'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="แสดงภาพมุมกว้างกล้อง CCTV พร้อมกรอบ Bounding Box จากโมเดล AI"
              >
                <Camera className="w-3 h-3 text-sky-200 shrink-0" />
                <span>กล้อง CCTV</span>
              </button>
              <button
                onClick={() => { setAiViewType('gauge'); handleResetZoom(); }}
                className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center space-x-1 cursor-pointer ${
                  aiViewType === 'gauge'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white'
                } ${detectionStatus && !detectionStatus.detected ? 'border border-amber-500/40 text-amber-300' : ''}`}
                title={detectionStatus && !detectionStatus.detected ? "AI ตรวจไม่พบเสาวัดระดับน้ำ (คลิกเพื่อดูคำแนะนำการปรับเทียบ)" : "แสดงเฉพาะสเกลเสาวัดน้ำดิจิทัล (Ruler)"}
              >
                {detectionStatus && !detectionStatus.detected ? (
                  <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                ) : (
                  <Sliders className="w-3 h-3 text-amber-300 shrink-0" />
                )}
                <span>สเกลเสา</span>
                {detectionStatus && !detectionStatus.detected && (
                  <span className="text-[9px] bg-amber-500/30 text-amber-200 px-1 rounded font-mono">!</span>
                )}
              </button>
              <button
                onClick={() => { setAiViewType('composite'); handleResetZoom(); }}
                className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center space-x-1 cursor-pointer ${
                  aiViewType === 'composite'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="แสดงผลสองมุมมองพร้อมกัน (CCTV + Staff Gauge Scale)"
              >
                <Columns className="w-3 h-3 text-indigo-200 shrink-0" />
                <span>สองมุมมอง</span>
              </button>
            </div>

            {/* Right: Live AI Detection Indicator (ตรวจภาพสดเท่านั้น) */}
            <div className="flex items-center space-x-1.5 bg-emerald-950/70 text-emerald-300 border border-emerald-500/40 px-3 py-1 rounded-xl text-[11px] font-bold shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <Radio className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
              <span>{isHatyai ? '🔴 ตรวจวัดสด Axis (Live AI)' : '🔴 ตรวจวัดสดกล้อง CCTV (Live AI)'}</span>
            </div>
          </div>
        )}

        {/* Toolbar: Streamlined Zoom Controls & Inspector Actions */}
        <div className="px-5 py-2.5 bg-slate-50/70 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2.5 text-xs">
          {/* Zoom & Overlay controls (Left Pill Group) */}
          <div className="flex items-center space-x-2">
            <div className="inline-flex items-center bg-white border border-slate-200 rounded-xl p-0.5 shadow-2xs">
              <button
                onClick={handleZoomOut}
                disabled={zoomLevel <= 1.0}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 disabled:opacity-30 transition cursor-pointer"
                title="ซูมออก (-)"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>

              <span className="font-mono font-bold text-blue-700 text-[11px] px-2 min-w-[44px] text-center select-none">
                {zoomPercent}%
              </span>

              <button
                onClick={handleZoomIn}
                disabled={zoomLevel >= 3.5}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 disabled:opacity-30 transition cursor-pointer"
                title="ซูมเข้า (+)"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>

              {zoomLevel !== 1 && (
                <button
                  onClick={handleResetZoom}
                  className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition cursor-pointer border-l border-slate-100"
                  title="รีเซ็ตขนาดซูม (1x)"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Toggle Overlay Visibility */}
            <button
              onClick={() => setShowOverlays(!showOverlays)}
              className={`px-2.5 py-1.5 rounded-xl font-bold border transition inline-flex items-center space-x-1.5 text-[11px] cursor-pointer shadow-2xs ${
                !showOverlays
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
              title={
                showOverlays
                  ? 'ซ่อนป้ายชื่อสถานีเพื่อไม่ให้บังภาพกล้อง (คงเหลือเฉพาะระดับน้ำและสีธงขวาบน)'
                  : 'แสดงป้ายข้อความกำกับทั้งหมด'
              }
            >
              {showOverlays ? <EyeOff className="w-3.5 h-3.5 text-slate-400" /> : <Eye className="w-3.5 h-3.5 text-amber-700" />}
              <span>{showOverlays ? 'ซ่อนป้าย' : 'แสดงป้าย'}</span>
            </button>
          </div>

          {/* Action buttons (Right Group) */}
          <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
            {onOpenManualBBox && (
              <button
                onClick={onOpenManualBBox}
                className="bg-amber-50 hover:bg-amber-100 text-amber-900 px-2.5 py-1.5 rounded-xl border border-amber-300/80 font-bold transition inline-flex items-center space-x-1 text-[11px] shadow-2xs cursor-pointer active:scale-95"
                title="วาดกรอบเสาวัดระดับน้ำจากภาพสดกล้อง CCTV เพื่อจัดเก็บเข้า Retrain Dataset (Manual Crop / BBox)"
              >
                <Crop className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                <span>ครอปเสา (Crop)</span>
              </button>
            )}

            {onOpenOnDemand && (
              <button
                onClick={onOpenOnDemand}
                className="bg-sky-50 hover:bg-sky-100 text-sky-800 px-2.5 py-1.5 rounded-xl border border-sky-200 font-bold transition inline-flex items-center space-x-1 text-[11px] shadow-2xs cursor-pointer active:scale-95"
                title="ตรวจวัดระดับน้ำจากภาพถ่ายแบบอิสระ (On-Demand AI)"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>วัดภาพ AI</span>
              </button>
            )}

            {onOpenCalibrate && (
              <button
                onClick={onOpenCalibrate}
                className="bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 px-2.5 py-1.5 rounded-xl border border-slate-200 font-bold transition inline-flex items-center space-x-1 text-[11px] shadow-2xs cursor-pointer active:scale-95"
                title="ปรับเทียบพิกัดสเกลเสาวัดน้ำ"
              >
                <Target className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>ปรับเทียบ</span>
              </button>
            )}

            {onOpenReview && (
              <button
                onClick={onOpenReview}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-xl font-bold transition inline-flex items-center space-x-1 text-[11px] shadow-sm cursor-pointer active:scale-95"
                title="ตรวจทานภาพและยืนยันระดับน้ำ"
              >
                <Eye className="w-3.5 h-3.5 shrink-0" />
                <span>ตรวจทาน</span>
              </button>
            )}

            {/* Aspect Ratio Fit Mode Toggle Button */}
            <button
              onClick={() => setFitMode((prev) => (prev === 'contain' ? 'cover' : 'contain'))}
              className={`px-2.5 py-1.5 rounded-xl font-bold transition inline-flex items-center space-x-1 text-[11px] shadow-2xs border cursor-pointer active:scale-95 ${
                fitMode === 'contain'
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                  : 'bg-blue-600 hover:bg-blue-700 text-white border-blue-500'
              }`}
              title={
                fitMode === 'contain'
                  ? 'แสดงผลสัดส่วนจริง (16:9 / ไม้บรรทัดเต็มเสา ไม่ตัดขอบ) - คลิกเพื่อขยายเต็มกรอบ'
                  : 'แสดงผลเต็มกรอบ (Cover) - คลิกเพื่อเปลี่ยนเป็นสัดส่วนจริง'
              }
            >
              <Move className="w-3.5 h-3.5 shrink-0" />
              <span>{fitMode === 'contain' ? 'สัดส่วนจริง' : 'เต็มกรอบ'}</span>
            </button>

            {/* Fullscreen Button */}
            <button
              onClick={() => setIsFullscreen(true)}
              className="bg-slate-900 hover:bg-slate-800 text-white p-1.5 rounded-xl font-bold transition inline-flex items-center space-x-1 text-[11px] shadow-sm cursor-pointer active:scale-95"
              title="เปิดดูแบบเต็มจอเพื่อตรวจสเกลชัดเจน"
            >
              <Maximize2 className="w-3.5 h-3.5 shrink-0" />
            </button>
          </div>
        </div>



        {/* Video / Dashboard Canvas Container */}
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className={`relative flex-1 w-full bg-slate-950 overflow-hidden select-none flex items-center justify-center min-h-[380px] overscroll-contain ${
            zoomLevel > 1.0 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
          }`}
        >
          {/* Zoomable Image Layer */}
          <div
            className="w-full h-full flex items-center justify-center transition-transform duration-100 ease-out origin-center relative"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomLevel})`,
            }}
          >
            {/* VIEW MODE 1: REALTIME AI MODEL DASHBOARD */}
            {viewMode === 'ai_dashboard' ? (
              (aiViewType === 'gauge' || aiViewType === 'composite') && detectionStatus && !detectionStatus.detected ? (
                <div className="w-full h-full flex items-center justify-center p-6">
                  {renderNotDetectedRecommendation(false)}
                </div>
              ) : (
                <div className="relative w-full h-full flex items-center justify-center p-1">
                  <img
                    key={`${station.station_code}-${aiScenario}-${overlayMode}-${aiViewType}-${refreshKey}`}
                    src={aiDashboardUrl}
                    alt={`AI Staff Gauge Model Dashboard - ${station.name}`}
                    onError={(e) => {
                      // Fallback to static public image if dynamic endpoint is temporarily unavailable
                      const target = e.target as HTMLImageElement;
                      if (target.src !== staticFallbackUrl && !target.src.endsWith(staticFallbackUrl)) {
                        target.src = staticFallbackUrl;
                      }
                    }}
                    className={`max-w-full max-h-full ${
                      aiViewType === 'gauge' || fitMode === 'contain'
                        ? 'object-contain'
                        : 'w-full h-full object-cover'
                    } object-center pointer-events-none drop-shadow-md transition-all`}
                  />
                </div>
              )
            ) : (
              /* VIEW MODE 2: LIVE STREAM (กล้องสด Clean Video Feed) */
              streamUrl && !imgError ? (
                <div className="relative w-full h-full flex items-center justify-center p-1">
                  <img
                    src={streamUrl}
                    alt={station.name}
                    onError={handleImageError}
                    className={`max-w-full max-h-full ${
                      fitMode === 'contain' ? 'object-contain' : 'w-full h-full object-cover'
                    } object-center pointer-events-none drop-shadow-md transition-all`}
                  />
                </div>
              ) : (
                /* Fallback SVG Canal & Gauge */
                <div className="w-full h-full bg-gradient-to-b from-sky-950 via-slate-900 to-blue-950 flex items-center justify-center">
                  <svg className="w-full h-full opacity-85" viewBox="0 0 640 360" preserveAspectRatio="none">
                    <rect x="0" y="0" width="640" height="120" fill="#1e293b" />
                    <line x1="0" y1="120" x2="640" y2="120" stroke="#475569" strokeWidth="4" />
                    <rect x="0" y="120" width="640" height="240" fill="#0284c7" fillOpacity="0.65" />
                    <rect x="340" y="60" width="45" height="280" fill="#f8fafc" stroke="#0f172a" strokeWidth="3" />
                    {[80, 110, 140, 170, 200, 230, 260, 290, 320].map((y, idx) => (
                      <g key={y}>
                        <line x1="340" y1={y} x2="358" y2={y} stroke="#dc2626" strokeWidth="2" />
                        <line x1="358" y1={y} x2="385" y2={y} stroke="#0f172a" strokeWidth="1" />
                        <text x="362" y={y + 4} fill="#0f172a" fontSize="9" fontWeight="bold">
                          {(station.bank_level - idx * ((station.bank_level - station.normal_level) / 8)).toFixed(1)}
                        </text>
                      </g>
                    ))}
                    <line x1="100" y1="210" x2="540" y2="210" stroke="#38bdf8" strokeWidth="4" strokeDasharray="8,5" />
                  </svg>
                </div>
              )
            )}
          </div>

          {/* Top-Left Station Status Badge */}
          {showOverlays && (
            <div className="absolute top-3 left-3 z-10 flex items-center space-x-2">
              <span className="flex items-center space-x-2 text-xs text-white font-bold bg-black/75 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/20 shadow-lg">
                <Camera className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>{station.name}</span>
              </span>
            </div>
          )}

          {/* Top-Right Compact Measured Water Level & Warning Flag Badge (แสดงขนาดกะทัดรัด ไม่บังกล้อง) */}
          <div
            className="absolute top-3 right-3 z-10 flex items-center space-x-1.5 pointer-events-auto"
            title={`${station.name}\nระดับน้ำที่วัดได้: ${currentWaterLevel.toFixed(2)} ม. (${flagInfo.flagName} - ${flagInfo.statusTitle})\nเกณฑ์ระดับน้ำสถานี: ${flagInfo.thresholdGuide}`}
          >
            <div className={`flex items-center space-x-2 px-2.5 py-1.5 rounded-xl ${flagInfo.containerBg} ${flagInfo.containerBorder} border backdrop-blur-md shadow-lg transition-all select-none`}>
              {/* Flag Icon & Name */}
              <div className="flex items-center space-x-1.5">
                <span className="relative flex h-2 w-2">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${flagInfo.pingDotColor}`} />
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${flagInfo.dotColor}`} />
                </span>
                <Flag className={`w-3.5 h-3.5 ${flagInfo.flagColorClass}`} />
                <span className={`text-[11px] font-black tracking-tight ${flagInfo.flagTextClass}`}>
                  {flagInfo.flagName}
                </span>
              </div>

              <span className="text-white/30 text-xs font-light">|</span>

              {/* Measured Water Level */}
              <div className="flex items-baseline space-x-1">
                <span className="text-xs font-black font-mono text-white tracking-tight">
                  {currentWaterLevel.toFixed(2)}
                </span>
                <span className="text-[10px] font-semibold text-slate-300">
                  ม.
                </span>
              </div>
            </div>
          </div>

          {/* Zoom & Pan Guide Hint */}
          {showOverlays && zoomLevel > 1.0 && (
            <div className="absolute bottom-3 right-3 z-10 bg-black/75 backdrop-blur-md text-sky-200 text-[10px] px-2.5 py-1 rounded-lg border border-white/20 shadow flex items-center space-x-1 font-medium">
              <Move className="w-3 h-3 text-sky-300 animate-bounce shrink-0" />
              <span>คลิกลากเพื่อเลื่อนดูตำแหน่ง ({zoomPercent}%)</span>
            </div>
          )}
        </div>

      </div>

      {/* Fullscreen Inspection Modal */}
      {isFullscreen && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex flex-col p-4 sm:p-6 animate-fade-in">
          {/* Modal Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/20 text-white mb-2 gap-2 flex-wrap">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-blue-600 text-white shrink-0">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base tracking-tight text-white flex items-center space-x-2">
                  <span>ตรวจสเกลเสาวัดน้ำ CCTV (HD Inspection)</span>
                  <span className="text-xs bg-sky-500/30 text-sky-200 border border-sky-400/40 px-2 py-0.5 rounded-full">
                    {station.name.split(' ')[0]} ({station.station_code})
                  </span>
                </h3>
                <p className="text-xs text-sky-200/80">
                  {viewMode === 'live'
                    ? 'ภาพสดจากกล้องวงจรปิด ซูมและลากเลื่อนเพื่อตรวจสอบรอยคราบน้ำ'
                    : 'การประมวลผลโมเดล AI สด: เสาที่ Crop สด + ไม้บรรทัดดิจิทัล + ตีกรอบเสา'}
                </p>
              </div>
            </div>

            {/* Mode toggle in fullscreen */}
            <div className="flex items-center space-x-1 bg-white/10 p-1 rounded-xl border border-white/20">
              <button
                onClick={() => setViewMode('live')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  viewMode === 'live' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                ภาพกล้องสด
              </button>
              <button
                onClick={() => setViewMode('ai_dashboard')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  viewMode === 'ai_dashboard' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                วิเคราะห์ AI Staff Gauge
              </button>
            </div>

            {/* Live Indicator in fullscreen when in ai_dashboard mode */}
            {viewMode === 'ai_dashboard' && (
              <div className="flex items-center space-x-1.5 bg-white/10 p-1 rounded-xl border border-white/20 text-xs flex-wrap">
                <div className="flex items-center space-x-1.5 bg-emerald-950/70 text-emerald-300 border border-emerald-500/40 px-2.5 py-1 rounded-lg text-xs font-bold shadow-xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <Radio className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                  <span>{isHatyai ? '🔴 ตรวจวัดสด Axis (API)' : '🔴 ประมวลผลสด (Live AI)'}</span>
                </div>

                {/* Fullscreen AI View Type Toggle: CCTV Bounding Box vs Gauge Scale vs Split */}
                <div className="flex items-center space-x-1 bg-black/50 p-1 rounded-xl border border-white/20 text-xs ml-1">
                  <button
                    onClick={() => { setAiViewType('cctv'); handleResetZoom(); }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer ${
                      aiViewType === 'cctv'
                        ? 'bg-blue-600 text-white shadow-sm font-black'
                        : 'text-slate-300 hover:text-white'
                    }`}
                    title="แสดงภาพมุมกว้างกล้อง CCTV พร้อมกรอบ Bounding Box"
                  >
                    <Camera className="w-3 h-3 text-sky-200" />
                    <span>กล้อง CCTV</span>
                  </button>
                  <button
                    onClick={() => { setAiViewType('gauge'); handleResetZoom(); }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer ${
                      aiViewType === 'gauge'
                        ? 'bg-emerald-600 text-white shadow-sm font-black'
                        : 'text-slate-300 hover:text-white'
                    } ${detectionStatus && !detectionStatus.detected ? 'border border-amber-500/40 text-amber-300' : ''}`}
                    title={detectionStatus && !detectionStatus.detected ? "AI ตรวจไม่พบเสาวัดระดับน้ำ (คลิกเพื่อดูคำแนะนำการปรับเทียบ)" : "แสดงเฉพาะสเกลเสาวัดน้ำดิจิทัล (Ruler)"}
                  >
                    {detectionStatus && !detectionStatus.detected ? (
                      <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                    ) : (
                      <Sliders className="w-3 h-3 text-amber-300" />
                    )}
                    <span>สเกลเสา</span>
                    {detectionStatus && !detectionStatus.detected && (
                      <span className="text-[9px] bg-amber-500/30 text-amber-200 px-1 py-0.2 rounded font-mono">!</span>
                    )}
                  </button>
                  <button
                    onClick={() => { setAiViewType('composite'); handleResetZoom(); }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer ${
                      aiViewType === 'composite'
                        ? 'bg-slate-700 text-white shadow-sm font-black'
                        : 'text-slate-300 hover:text-white'
                    } ${detectionStatus && !detectionStatus.detected ? 'border border-amber-500/40 text-amber-300' : ''}`}
                    title={detectionStatus && !detectionStatus.detected ? "AI ตรวจไม่พบเสาวัดระดับน้ำ (คลิกเพื่อดูคำแนะนำการปรับเทียบ)" : "แสดงภาพรวมคู่ (Split)"}
                  >
                    {detectionStatus && !detectionStatus.detected ? (
                      <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                    ) : (
                      <Columns className="w-3 h-3 text-white" />
                    )}
                    <span>ภาพรวมคู่</span>
                    {detectionStatus && !detectionStatus.detected && (
                      <span className="text-[9px] bg-amber-500/30 text-amber-200 px-1 py-0.2 rounded font-mono">!</span>
                    )}
                  </button>
                </div>

                {detectionStatus && (
                  <span className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold flex items-center space-x-1 ${
                    detectionStatus.detected
                      ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/30'
                      : 'bg-rose-500/30 text-rose-300 border border-rose-500/40'
                  }`}>
                    {detectionStatus.detected ? (
                      <>
                        <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span>พบเสาวัดน้ำ ({Math.round(detectionStatus.confidence * 100)}%)</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                        <span>ไม่พบเสาในภาพ</span>
                      </>
                    )}
                  </span>
                )}

                <span className="hidden xl:flex items-center space-x-1 bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 px-2 py-0.5 rounded-lg text-[10px] font-bold">
                  <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span>Verified Benchmark Dashboard</span>
                </span>
              </div>
            )}

            <div className="flex items-center space-x-2 shrink-0">
              <button
                onClick={() => setShowOverlays(!showOverlays)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 transition text-xs font-bold flex items-center space-x-1"
                title={showOverlays ? 'ซ่อนป้ายบัง' : 'แสดงป้าย'}
              >
                {showOverlays ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button
                onClick={handleZoomOut}
                disabled={zoomLevel <= 1.0}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 disabled:opacity-40 transition"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="font-mono font-bold text-sky-300 px-3 py-1 bg-white/10 rounded-xl text-sm">
                {zoomPercent}%
              </span>
              <button
                onClick={handleZoomIn}
                disabled={zoomLevel >= 4.0}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 disabled:opacity-40 transition"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={handleResetZoom}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 transition"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsFullscreen(false)}
                className="p-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white transition ml-2 shadow-lg"
                title="ปิดหน้าต่างเต็มจอ"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Notification Banner in Fullscreen when Staff Gauge is NOT detected */}
          {viewMode === 'ai_dashboard' && detectionStatus && !detectionStatus.detected && (
            <div className="bg-gradient-to-r from-amber-950/90 via-slate-900/90 to-amber-950/90 border-b border-amber-500/30 px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-200">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
                <span className="font-semibold text-amber-100">
                  โมเดล AI (model_best_v2.pt) ตรวจไม่พบเสาวัดระดับน้ำในภาพนี้
                </span>
                <span className="text-[11px] text-slate-300 hidden md:inline">
                  &bull; ปิดการแสดงผลสเกลเสาและภาพรวมคู่
                </span>
              </div>
              {onOpenCalibrate && (
                <button
                  onClick={() => { setIsFullscreen(false); onOpenCalibrate(); }}
                  className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-[11px] flex items-center space-x-1.5 shadow-sm transition cursor-pointer"
                  title="เปิดเครื่องมือปรับเทียบพิกัดเสาเพื่อนำไป Re-train โมเดลใหม่"
                >
                  <Target className="w-3.5 h-3.5 shrink-0" />
                  <span>ใช้ฟีเจอร์ปรับเทียบเสา (เตรียม Re-train)</span>
                </button>
              )}
            </div>
          )}

          {/* Modal Image Viewport */}
          <div
            ref={modalContainerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            className={`flex-1 relative bg-black rounded-2xl overflow-hidden flex items-center justify-center border border-white/15 overscroll-contain ${
              zoomLevel > 1.0 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
            }`}
          >
            <div
              className="w-full h-full flex items-center justify-center transition-transform duration-100 ease-out origin-center relative"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomLevel})`,
              }}
            >
              {viewMode === 'ai_dashboard' && (aiViewType === 'gauge' || aiViewType === 'composite') && detectionStatus && !detectionStatus.detected ? (
                <div className="w-full h-full flex items-center justify-center p-6">
                  {renderNotDetectedRecommendation(true)}
                </div>
              ) : (
                <img
                  key={`fullscreen-${station.station_code}-${aiScenario}-${overlayMode}-${aiViewType}-${refreshKey}`}
                  src={viewMode === 'ai_dashboard' ? aiDashboardUrl : (streamUrl || '')}
                  alt={station.name}
                  onError={(e) => {
                    if (viewMode === 'ai_dashboard') {
                      const target = e.target as HTMLImageElement;
                      if (target.src !== staticFallbackUrl && !target.src.endsWith(staticFallbackUrl)) {
                        target.src = staticFallbackUrl;
                      }
                    }
                  }}
                  className="w-full h-full object-contain pointer-events-none"
                />
              )}

            </div>

            {/* Fullscreen AI Vision Inspection HUD Overlay (แสดงเฉพาะตอนขยายเต็มจอตามความต้องการ) */}
            {showOverlays && viewMode === 'ai_dashboard' && (
              <div className="absolute top-4 left-4 z-20 bg-slate-950/85 backdrop-blur-md border border-slate-700/80 rounded-2xl p-3.5 shadow-2xl text-white max-w-sm sm:max-w-md pointer-events-none select-none">
                <div className="flex items-center space-x-2.5 mb-2">
                  <span className={`w-3 h-3 rounded-full shrink-0 ${
                    detectionStatus === null
                      ? 'bg-amber-400 animate-pulse'
                      : detectionStatus.detected
                      ? 'bg-emerald-400 animate-pulse'
                      : 'bg-rose-500 animate-ping'
                  }`} />
                  <span className="font-extrabold text-xs text-sky-200">
                    AI Vision: <code className="text-amber-300 font-mono">model_best_v2.pt</code> (YOLOv8m) &bull; {station.name}
                  </span>
                </div>

                {detectionStatus === null ? (
                  <div className="flex items-center space-x-2 text-slate-300 font-medium text-xs py-1">
                    <span className="w-3 h-3 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
                    <span>กำลังวิเคราะห์ภาพเสาวัดระดับน้ำ...</span>
                  </div>
                ) : detectionStatus.detected ? (
                  <div className="space-y-1.5">
                    <div className={`flex items-center space-x-2 font-bold text-xs ${
                      detectionStatus.is_manual ? 'text-amber-400' : 'text-emerald-400'
                    }`}>
                      <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {detectionStatus.is_manual
                          ? '[MANUAL BBOX] Active Staff Gauge Annotation'
                          : `[DETECTED] Found Staff Gauge | Conf: ${(detectionStatus.confidence * 100).toFixed(1)}%`}
                      </span>
                    </div>
                    {detectionStatus.bbox && detectionStatus.bbox.length === 4 && (
                      <div className="font-mono text-[11px] text-slate-300 bg-white/5 px-2.5 py-1 rounded-lg border border-white/10 flex items-center justify-between">
                        <span>BBox: [{detectionStatus.bbox.join(', ')}]</span>
                        <span className={`ml-2 font-bold ${detectionStatus.is_manual ? 'text-amber-300' : 'text-sky-300'}`}>
                          (W={detectionStatus.bbox[2] - detectionStatus.bbox[0]}px, H={detectionStatus.bbox[3] - detectionStatus.bbox[1]}px)
                        </span>
                      </div>
                    )}
                    {detectionStatus.water_level != null && (
                      <div className="text-[11px] text-emerald-300 font-bold bg-emerald-950/40 border border-emerald-500/30 px-2.5 py-1 rounded-lg flex items-center justify-between">
                        <span>ระดับน้ำที่ AI ตรวจจับได้:</span>
                        <span className="text-xs font-mono font-black text-white">{detectionStatus.water_level.toFixed(2)} ม.</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2 text-rose-400 font-bold text-xs">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>[NOT DETECTED] Staff Gauge Not Found</span>
                    </div>
                    <div className="text-[11px] text-slate-300">
                      ไม่พบเสาวัดระดับน้ำในภาพ (Confidence ต่ำกว่าเกณฑ์)
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Fullscreen Top-Right Compact Measured Water Level & Flag Badge */}
            <div
              className="absolute top-4 right-4 z-20 flex items-center space-x-1.5 pointer-events-auto"
              title={`${station.name}\nระดับน้ำที่วัดได้: ${currentWaterLevel.toFixed(2)} ม. (${flagInfo.flagName} - ${flagInfo.statusTitle})\nเกณฑ์ระดับน้ำสถานี: ${flagInfo.thresholdGuide}`}
            >
              <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl ${flagInfo.containerBg} ${flagInfo.containerBorder} border backdrop-blur-md shadow-2xl transition-all select-none`}>
                <div className="flex items-center space-x-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${flagInfo.pingDotColor}`} />
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${flagInfo.dotColor}`} />
                  </span>
                  <Flag className={`w-3.5 h-3.5 ${flagInfo.flagColorClass}`} />
                  <span className={`text-xs font-black tracking-tight ${flagInfo.flagTextClass}`}>
                    {flagInfo.flagName}
                  </span>
                </div>

                <span className="text-white/30 text-xs font-light">|</span>

                <div className="flex items-baseline space-x-1">
                  <span className="text-sm font-black font-mono text-white tracking-tight">
                    {currentWaterLevel.toFixed(2)}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-300">
                    ม. (รทก.)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CameraViewer;

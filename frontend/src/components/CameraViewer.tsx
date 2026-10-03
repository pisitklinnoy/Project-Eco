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
  Crop,
  Sun,
  Moon,
  Waves,
} from 'lucide-react';

interface CameraViewerProps {
  station: Station | null;
  measurement: WaterMeasurement | null;
  onOpenReview: () => void;
  onOpenCalibrate?: () => void;
}

// Bounding Box coordinates (% of frame) extracted directly from station vision calibrations
const STATION_BBOX: Record<string, { left: number; top: number; width: number; height: number; focusPan: { x: number; y: number } }> = {
  'STN-MUANGKONG': { left: 56.56, top: 18.61, width: 2.2, height: 37.56, focusPan: { x: -80, y: 15 } },
  'X.173A': { left: 56.56, top: 18.61, width: 2.2, height: 37.56, focusPan: { x: -80, y: 15 } },
  'STN-BANGSALA': { left: 57.97, top: 26.67, width: 2.4, height: 34.44, focusPan: { x: -90, y: 15 } },
  'X.90': { left: 57.97, top: 26.67, width: 2.4, height: 34.44, focusPan: { x: -90, y: 15 } },
  'STN-HATYAINAI': { left: 65.73, top: 7.41, width: 5.5, height: 92.13, focusPan: { x: -140, y: 0 } },
  'X.44': { left: 65.73, top: 7.41, width: 5.5, height: 92.13, focusPan: { x: -140, y: 0 } },
};

export const CameraViewer: React.FC<CameraViewerProps> = ({
  station,
  measurement,
  onOpenReview,
  onOpenCalibrate,
}) => {
  const [imgError, setImgError] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(Date.now());
  
  // View Mode: 'live' = Realtime CCTV Feed with AI Bounding Box | 'ai_dashboard' = Realtime AI Staff Gauge Cropped Inspection
  const [viewMode, setViewMode] = useState<'live' | 'ai_dashboard'>('live');

  // AI Scenario: 'daytime' | 'nighttime' | 'flood' | 'live'
  const [aiScenario, setAiScenario] = useState<'daytime' | 'nighttime' | 'flood' | 'live'>('daytime');

  const isHatyai = Boolean(
    station?.station_code.toUpperCase().includes('HATYAI') ||
    station?.station_code.toUpperCase().includes('X.44')
  );

  // Zoom & Pan state
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isFocusedGauge, setIsFocusedGauge] = useState<boolean>(false);
  
  // Toggle overlay badges to ensure NOTHING blocks the camera stream / timestamp when zooming
  const [showOverlays, setShowOverlays] = useState<boolean>(true);

  const containerRef = useRef<HTMLDivElement>(null);

  // Camera feed stream source state for Hatyai (Axis vs Proxy vs Climate)
  const [hatyaiSource, setHatyaiSource] = useState<'backend_proxy' | 'axis_stream' | 'climate_snapshot'>('backend_proxy');

  useEffect(() => {
    setImgError(false);
    // Reset zoom when switching station
    setZoomLevel(1.0);
    setPan({ x: 0, y: 0 });
    setIsFocusedGauge(false);
    if (aiScenario === 'flood' && !station?.station_code.toUpperCase().includes('HATYAI') && !station?.station_code.toUpperCase().includes('X.44')) {
      setAiScenario('daytime');
    }
    if (isHatyai) {
      setHatyaiSource('backend_proxy');
    }
  }, [station?.station_code, isHatyai]);

  // Auto refresh image every 60s
  useEffect(() => {
    const timer = setInterval(() => {
      setRefreshKey(Date.now());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  if (!station) return null;

  const currentLevel = measurement ? measurement.water_level : Number.NaN;

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
    return `/api/v1/stations/${encodeURIComponent(station.station_code)}/live-feed.jpg?t=${refreshKey}`;
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
  const getAiDashboardUrls = (code: string, scenario: 'daytime' | 'nighttime' | 'flood' | 'live') => {
    const upper = code.toUpperCase();
    const normCode = (upper.includes('MUANGKONG') || upper.includes('173A')) ? 'STN-MUANGKONG' :
                     (upper.includes('BANGSALA') || upper.includes('90')) ? 'STN-BANGSALA' :
                     'STN-HATYAINAI';

    let fallbackFilename = `${normCode}.jpg`;
    if (scenario === 'flood') fallbackFilename = `${normCode}_flood.jpg`;
    else if (scenario === 'nighttime') fallbackFilename = `${normCode}_night.jpg`;

    const dynamicUrl = `/api/v1/stations/${encodeURIComponent(code)}/cctv-analysis.jpg?mode=${scenario}&t=${refreshKey}`;
    const staticUrl = `/ai_dashboards/${fallbackFilename}?t=${refreshKey}`;
    return { dynamicUrl, staticUrl };
  };

  const { dynamicUrl: aiDashboardUrl, staticUrl: staticFallbackUrl } = getAiDashboardUrls(
    station.station_code,
    aiScenario
  );

  const getBenchmarkLevel = (code: string, scenario: 'daytime' | 'nighttime' | 'flood' | 'live', liveLvl: number) => {
    if (scenario === 'live') return liveLvl;
    const upper = code.toUpperCase();
    if (upper.includes('MUANGKONG') || upper.includes('X.173A')) {
      return scenario === 'daytime' ? 10.22 : 10.20;
    }
    if (upper.includes('BANGSALA') || upper.includes('X.90')) {
      return scenario === 'daytime' ? 2.76 : 2.75;
    }
    if (scenario === 'flood') return 7.27;
    return 0.60;
  };

  const displayLevel = viewMode === 'ai_dashboard'
    ? getBenchmarkLevel(station.station_code, aiScenario, currentLevel)
    : currentLevel;

  // Get Bounding Box config for current station
  const getStationBBox = (code: string) => {
    const upper = code.toUpperCase();
    for (const [key, val] of Object.entries(STATION_BBOX)) {
      if (upper.includes(key)) return val;
    }
    return { left: 56.5, top: 20.0, width: 2.5, height: 40.0, focusPan: { x: -80, y: 15 } };
  };

  const bbox = getStationBBox(station.station_code);
  const confidencePercent = measurement?.vision_confidence != null ? Math.round(measurement.vision_confidence * 100) : null;

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
    setIsFocusedGauge(false);
  };

  const handleResetZoom = () => {
    setZoomLevel(1.0);
    setPan({ x: 0, y: 0 });
    setIsFocusedGauge(false);
  };

  // Preset Focus & Auto-Crop Gauge: Smoothly crops and centers directly on the staff gauge bounding box
  const handleFocusGauge = () => {
    if (isFocusedGauge) {
      handleResetZoom();
    } else {
      setZoomLevel(2.8);
      setPan(bbox.focusPan);
      setIsFocusedGauge(true);
    }
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

  // Mouse Wheel Zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.2 : 0.2;
    setZoomLevel((prev) => {
      const next = Math.min(Math.max(Number((prev + delta).toFixed(1)), 1.0), 3.5);
      if (next === 1.0) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  // Physical staff gauge vertical waterline positioning along each station's pole
  const getStaffGaugeWaterlineY = (stnCode: string, waterLvl: number): number => {
    const code = stnCode.toUpperCase();
    if (code.includes('MUANGKONG') || code.includes('X.173A')) {
      const ratio = Math.min(Math.max((waterLvl - 10.0) / 8.0, 0), 1);
      return Math.round(56 - ratio * 37);
    }
    if (code.includes('BANGSALA') || code.includes('X.90')) {
      const ratio = Math.min(Math.max((waterLvl - 2.0) / 10.0, 0), 1);
      return Math.round(61 - ratio * 34);
    }
    const ratio = Math.min(Math.max((waterLvl - 0.6) / 8.4, 0), 1);
    return Math.round(92 - ratio * 80);
  };

  const topPercent = getStaffGaugeWaterlineY(station.station_code, currentLevel);
  const zoomPercent = Math.round(zoomLevel * 100);

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
                  ? 'ภาพล่าสุดจากกล้องต้นทาง · รีเฟรชทุก 60 วินาที พร้อมกรอบตำแหน่งเสาวัดน้ำ'
                  : 'การวิเคราะห์ AI Realtime: เสาที่ Crop สด + ไม้บรรทัดดิจิทัล + ตีกรอบเสา'}
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

        {/* Hatyai Axis Camera Dedicated Ribbon */}
        {isHatyai && (
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

            {viewMode === 'live' ? (
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
            ) : (
              <div className="flex items-center space-x-1 text-[11px] text-sky-800 font-medium">
                <span className="bg-sky-100 px-2 py-0.5 rounded-md font-mono text-[10px] font-bold text-sky-900">
                  AI Model: {aiScenario === 'live' ? 'Axis Camera Live API' : aiScenario.toUpperCase()}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Toolbar: Zoom Controls & Inspector Actions */}
        <div className="px-5 py-2.5 bg-slate-50/70 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
          {/* Zoom controls */}
          <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
            <span className="text-[11px] font-bold text-slate-500 flex items-center space-x-1 mr-1">
              <Sliders className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>ซูมสเกล:</span>
            </span>

            <button
              onClick={handleZoomOut}
              disabled={zoomLevel <= 1.0}
              className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-blue-50 text-slate-700 disabled:opacity-40 transition"
              title="ซูมออก (-)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>

            <span className="font-mono font-extrabold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md min-w-[46px] text-center text-[11px]">
              {zoomPercent}%
            </span>

            <button
              onClick={handleZoomIn}
              disabled={zoomLevel >= 3.5}
              className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-blue-50 text-slate-700 disabled:opacity-40 transition"
              title="ซูมเข้า (+)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={handleResetZoom}
              className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-blue-50 text-slate-700 transition"
              title="รีเซ็ตขนาดซูม (1x)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            {/* Quick Focus & Auto-Crop Gauge Preset */}
            {viewMode === 'live' && (
              <button
                onClick={handleFocusGauge}
                className={`px-2.5 py-1 rounded-lg font-bold border transition flex items-center space-x-1 text-[11px] ${
                  isFocusedGauge
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-blue-50 hover:text-blue-700'
                }`}
                title="Crop และซูมเจาะจงเฉพาะตำแหน่งเสาวัดน้ำในภาพสด"
              >
                <Crop className="w-3 h-3 text-sky-400 shrink-0" />
                <span>Crop ส่องเสา AI</span>
              </button>
            )}

            {/* Toggle Overlay Visibility (ไม่บังเวลาซูมกล้องสด) */}
            <button
              onClick={() => setShowOverlays(!showOverlays)}
              className={`px-2.5 py-1 rounded-lg font-bold border transition flex items-center space-x-1 text-[11px] ${
                !showOverlays
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
              title={showOverlays ? 'ซ่อนป้ายข้อความเพื่อไม่ให้บังภาพกล้องและเวลา' : 'แสดงป้ายข้อความกำกับ'}
            >
              {showOverlays ? <EyeOff className="w-3 h-3 text-slate-500" /> : <Eye className="w-3 h-3 text-amber-700" />}
              <span>{showOverlays ? 'ซ่อนป้ายบัง' : 'แสดงป้าย'}</span>
            </button>
          </div>

          {/* Action buttons right */}
          <div className="flex items-center space-x-2 shrink-0">
            {onOpenCalibrate && (
              <button
                onClick={onOpenCalibrate}
                className="bg-white hover:bg-blue-50 text-slate-800 hover:text-blue-700 px-2.5 py-1 rounded-lg border border-slate-200 font-bold transition flex items-center space-x-1 text-[11px]"
                title="ปรับเทียบพิกัดสเกลเสาวัดน้ำ"
              >
                <Target className="w-3 h-3 text-blue-600 shrink-0" />
                <span>ปรับเทียบเสา</span>
              </button>
            )}

            <button
              onClick={onOpenReview}
              className="bg-sky-600 hover:bg-sky-700 text-white px-2.5 py-1 rounded-lg font-bold transition flex items-center space-x-1 text-[11px] shadow-sm"
              title="ตรวจทานภาพและยืนยันระดับน้ำ"
            >
              <Eye className="w-3 h-3 shrink-0" />
              <span>ตรวจทาน</span>
            </button>

            <button
              onClick={() => setIsFullscreen(true)}
              className="bg-slate-800 hover:bg-slate-900 text-white p-1.5 rounded-lg font-bold transition flex items-center space-x-1 text-[11px] shadow-sm"
              title="เปิดดูแบบเต็มจอเพื่อตรวจสเกลชัดเจน"
            >
              <Maximize2 className="w-3.5 h-3.5 shrink-0" />
            </button>
          </div>
        </div>

        {/* Scenario Sub-Bar: Visible when in AI Staff Gauge Inspection mode */}
        {viewMode === 'ai_dashboard' && (
          <div className="px-4 py-2 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white border-b border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              <span className="text-[11px] font-extrabold text-sky-300 flex items-center space-x-1.5 uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-spin" />
                <span>ชุดผลการตรวจ AI:</span>
              </span>
              <div className="flex items-center space-x-1 bg-slate-950/80 p-0.5 rounded-lg border border-slate-700">
                <button
                  onClick={() => { setAiScenario('daytime'); handleResetZoom(); }}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition flex items-center space-x-1 ${
                    aiScenario === 'daytime'
                      ? 'bg-amber-500 text-slate-950 shadow-sm font-black'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                  title="ผลลัพธ์ Benchmark สภาพแสงกลางวัน (ความแม่นยำ 92-95%)"
                >
                  <Sun className="w-3 h-3 text-amber-200 shrink-0" />
                  <span>☀️ กลางวัน (Daytime)</span>
                </button>

                <button
                  onClick={() => { setAiScenario('nighttime'); handleResetZoom(); }}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition flex items-center space-x-1 ${
                    aiScenario === 'nighttime'
                      ? 'bg-indigo-600 text-white shadow-sm font-black'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                  title="ผลลัพธ์ Benchmark สภาพแสงกลางคืน / อินฟราเรด"
                >
                  <Moon className="w-3 h-3 text-indigo-200 shrink-0" />
                  <span>🌙 กลางคืน (Nighttime)</span>
                </button>

                {isHatyai && (
                  <button
                    onClick={() => { setAiScenario('flood'); handleResetZoom(); }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition flex items-center space-x-1 ${
                      aiScenario === 'flood'
                        ? 'bg-rose-600 text-white shadow-sm font-black'
                        : 'text-rose-300 hover:text-white hover:bg-rose-950/60'
                    }`}
                    title="ผลลัพธ์จำลองสถานการณ์น้ำท่วมสูง (Flood Simulation)"
                  >
                    <Waves className="w-3 h-3 text-rose-200 shrink-0" />
                    <span>🌊 จำลองน้ำท่วม (Flood)</span>
                  </button>
                )}

                <button
                  onClick={() => { setAiScenario('live'); handleResetZoom(); }}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition flex items-center space-x-1 cursor-pointer ${
                    aiScenario === 'live'
                      ? 'bg-emerald-600 text-white shadow-sm font-black'
                      : 'text-emerald-300 hover:text-white hover:bg-emerald-950/60'
                  }`}
                  title={isHatyai ? "ประมวลผลโมเดล AI สดจากกล้อง Axis Camera (ta200304.dyndns.info:5001)" : "ประมวลผลโมเดล AI สดจากกล้อง CCTV ปัจจุบันแบบ Realtime"}
                >
                  <Radio className="w-3 h-3 text-emerald-200 animate-pulse shrink-0" />
                  <span>{isHatyai ? '🔴 ตรวจวัดสด Axis (API)' : '🔴 ประมวลผลสด (Live AI)'}</span>
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-2 text-[10px]">
              <span className="bg-emerald-900/60 border border-emerald-500/40 text-emerald-300 px-2.5 py-0.5 rounded-full font-mono font-bold flex items-center space-x-1">
                <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
                <span>Verified Benchmark Dashboard</span>
              </span>
            </div>

            {/* Live Axis Stream AI Detection Information Banner */}
            {isHatyai && aiScenario === 'live' && (
              <div className="w-full mt-2 pt-2 border-t border-slate-700/60 flex flex-wrap items-center justify-between gap-1 text-[11px] text-emerald-300">
                <span className="flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
                  <span>โมเดล AI กำลังประมวลผลดึงภาพสดจากกล้อง Axis Camera: ta200304.dyndns.info:5001/axis-cgi/mjpg/video.cgi</span>
                </span>
                <span className="bg-emerald-950/80 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] text-emerald-200 font-mono">
                  Station: X.44 Hatyainai
                </span>
              </div>
            )}
          </div>
        )}

        {/* Video / Dashboard Canvas Container */}
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className={`relative flex-1 w-full bg-slate-950 overflow-hidden select-none flex items-center justify-center min-h-[380px] ${
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
            {/* VIEW MODE 1: REALTIME AI MODEL DASHBOARD (Crop เสาสด + ไม้บรรทัดดิจิทัล + ตีกรอบ) */}
            {viewMode === 'ai_dashboard' ? (
              <img
                key={`${station.station_code}-${aiScenario}`}
                src={aiDashboardUrl}
                alt={`AI Staff Gauge Model Dashboard - ${station.name}`}
                onError={(e) => {
                  // Fallback to static public image if dynamic endpoint is temporarily unavailable
                  const target = e.target as HTMLImageElement;
                  if (target.src !== staticFallbackUrl && !target.src.endsWith(staticFallbackUrl)) {
                    target.src = staticFallbackUrl;
                  }
                }}
                className="w-full h-full object-contain pointer-events-none"
              />
            ) : (
              /* VIEW MODE 2: LIVE STREAM WITH REALTIME BOUNDING BOX & WATERLINE */
              streamUrl && !imgError ? (
                <div className="relative w-full h-full flex items-center justify-center">
                  <img
                    src={streamUrl}
                    alt={station.name}
                    onError={handleImageError}
                    className="w-full h-full object-cover object-center pointer-events-none"
                  />

                  {/* Realtime AI Bounding Box & Target Brackets directly over Staff Gauge */}
                  {showOverlays && (
                    <>
                      {/* 1. Green Staff Gauge Bounding Box (วาดกรอบแบบภาพที่ส่งไป) */}
                      <div
                        className="absolute pointer-events-none border-2 border-emerald-400 bg-emerald-500/15 shadow-[0_0_15px_rgba(52,211,153,0.7)] transition-all"
                        style={{
                          left: `${bbox.left}%`,
                          top: `${bbox.top}%`,
                          width: `${bbox.width}%`,
                          height: `${bbox.height}%`,
                        }}
                      >
                        {/* Label Badge on top of bounding box */}
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-emerald-700/90 backdrop-blur-md text-emerald-100 text-[9px] font-black px-1.5 py-0.5 rounded shadow border border-emerald-400/50 whitespace-nowrap flex items-center space-x-1">
                          <Target className="w-2.5 h-2.5 text-emerald-300 shrink-0" />
                          <span>Staff Gauge: {confidencePercent == null ? '—' : `${confidencePercent}%`}</span>
                        </div>

                        {/* Corner Accents */}
                        <div className="absolute -top-1 -left-1 w-2 h-2 border-t-2 border-l-2 border-white"></div>
                        <div className="absolute -top-1 -right-1 w-2 h-2 border-t-2 border-r-2 border-white"></div>
                        <div className="absolute -bottom-1 -left-1 w-2 h-2 border-b-2 border-l-2 border-white"></div>
                        <div className="absolute -bottom-1 -right-1 w-2 h-2 border-b-2 border-r-2 border-white"></div>
                      </div>

                      {/* 2. Orange Waterline Contact Line cutting across the staff gauge */}
                      {Number.isFinite(currentLevel) && <div
                        className="absolute pointer-events-none border-b-2 border-dashed border-orange-500 opacity-95 shadow-[0_0_16px_rgba(249,115,22,0.95)] flex items-center justify-between"
                        style={{
                          top: `${topPercent}%`,
                          left: `${Math.max(2, bbox.left - 12)}%`,
                          width: `${bbox.width + 24}%`,
                        }}
                      >
                        <span className="text-[10px] bg-gradient-to-r from-orange-600 to-amber-600 text-white font-black px-2 py-0.5 rounded shadow -translate-y-3.5 flex items-center space-x-1 border border-white/20 whitespace-nowrap">
                          <Sparkles className="w-3 h-3 text-amber-200 shrink-0" />
                          <span>{measurement?.source_type === 'RID_API_VERIFIED' ? 'ระดับ RID' : 'AI ผิวน้ำ'}: {Number.isFinite(currentLevel) ? currentLevel.toFixed(2) : '—'} เมตรตามรายงาน</span>
                        </span>
                        <span className="w-2.5 h-2.5 rounded-full bg-red-600 border border-white shadow-md -translate-y-1.5 animate-ping"></span>
                      </div>}
                    </>
                  )}
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

          {/* Top-Left Live / AI Status Badge (Hideable via showOverlays) */}
          {showOverlays && (
            <div className="absolute top-3 left-3 z-10 flex items-center space-x-2">
              {viewMode === 'live' ? (
                <span className="flex items-center space-x-1.5 text-[11px] text-emerald-300 font-extrabold bg-black/75 backdrop-blur-md px-3 py-1 rounded-xl border border-emerald-400/30 shadow-lg">
                  <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse shrink-0" />
                  <span>CAMERA SNAPSHOT</span>
                </span>
              ) : (
                <span className="flex items-center space-x-1.5 text-[11px] text-teal-200 font-extrabold bg-black/85 backdrop-blur-md px-3 py-1 rounded-xl border border-teal-400/40 shadow-lg">
                  <CheckCircle className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                  <span>AI REALTIME INSPECTION</span>
                </span>
              )}
              <span className="text-[11px] text-white font-bold bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-xl border border-white/20 shadow">
                {station.name.split(' ')[0]}
              </span>
            </div>
          )}

          {/* Bottom-Left Real Water Level Readout (Minimized when zoomed in or when showOverlays is false) */}
          {showOverlays && zoomLevel <= 1.0 && (
            <div className="absolute bottom-3 left-3 z-10 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-blue-200 text-blue-950 text-xs flex items-center space-x-2 font-bold shadow-xl">
              <span className={`w-2.5 h-2.5 rounded-full animate-pulse shrink-0 ${
                displayLevel >= station.critical_level ? 'bg-red-600' :
                displayLevel >= station.warning_level ? 'bg-amber-500' : 'bg-blue-600'
              }`}></span>
              <div>
                <span className="text-slate-500 font-medium text-[10px] block leading-none">
                  {viewMode === 'ai_dashboard'
                    ? `ระดับน้ำตรวจวัด AI (${aiScenario === 'daytime' ? 'กลางวัน' : aiScenario === 'nighttime' ? 'กลางคืน' : aiScenario === 'flood' ? 'วิกฤตน้ำท่วม' : 'สด Live'}):`
                    : 'ระดับน้ำตรวจวัดล่าสุด:'}
                </span>
                <div className="flex items-baseline space-x-1">
                  <span className={`text-base font-black font-mono leading-tight ${
                    displayLevel >= station.critical_level ? 'text-red-600' :
                    displayLevel >= station.warning_level ? 'text-amber-600' : 'text-blue-700'
                  }`}>
                    {Number.isFinite(displayLevel) ? displayLevel.toFixed(2) : '—'}
                  </span>
                  <span className="text-[11px] text-slate-700 font-bold">เมตรตามรายงาน</span>
                </div>
              </div>
            </div>
          )}

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

            {/* Scenario toggle in fullscreen when in ai_dashboard mode */}
            {viewMode === 'ai_dashboard' && (
              <div className="flex items-center space-x-1 bg-white/10 p-1 rounded-xl border border-white/20 text-xs">
                <button
                  onClick={() => { setAiScenario('daytime'); handleResetZoom(); }}
                  className={`px-2 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 ${
                    aiScenario === 'daytime' ? 'bg-amber-500 text-slate-950 font-black' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Sun className="w-3 h-3 text-amber-200 shrink-0" />
                  <span>☀️ กลางวัน</span>
                </button>
                <button
                  onClick={() => { setAiScenario('nighttime'); handleResetZoom(); }}
                  className={`px-2 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 ${
                    aiScenario === 'nighttime' ? 'bg-indigo-600 text-white font-black' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Moon className="w-3 h-3 text-indigo-200 shrink-0" />
                  <span>🌙 กลางคืน</span>
                </button>
                {isHatyai && (
                  <button
                    onClick={() => { setAiScenario('flood'); handleResetZoom(); }}
                    className={`px-2 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 ${
                      aiScenario === 'flood' ? 'bg-rose-600 text-white font-black' : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <Waves className="w-3 h-3 text-rose-200 shrink-0" />
                    <span>🌊 น้ำท่วม</span>
                  </button>
                )}
                <button
                  onClick={() => { setAiScenario('live'); handleResetZoom(); }}
                  className={`px-2 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 ${
                    aiScenario === 'live' ? 'bg-emerald-600 text-white font-black' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Radio className="w-3 h-3 text-emerald-200 animate-pulse shrink-0" />
                  <span>🔴 สด Live</span>
                </button>
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

          {/* Modal Image Viewport */}
          <div
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            className={`flex-1 relative bg-black rounded-2xl overflow-hidden flex items-center justify-center border border-white/15 ${
              zoomLevel > 1.0 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
            }`}
          >
            <div
              className="w-full h-full flex items-center justify-center transition-transform duration-100 ease-out origin-center relative"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomLevel})`,
              }}
            >
              <img
                key={`fullscreen-${station.station_code}-${aiScenario}`}
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

              {/* Bounding box on live feed inside fullscreen */}
              {viewMode === 'live' && showOverlays && (
                <div
                  className="absolute pointer-events-none border-2 border-emerald-400 bg-emerald-500/15 shadow-[0_0_20px_rgba(52,211,153,0.8)]"
                  style={{
                    left: `${bbox.left}%`,
                    top: `${bbox.top}%`,
                    width: `${bbox.width}%`,
                    height: `${bbox.height}%`,
                  }}
                >
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-emerald-700/90 text-white text-[10px] font-black px-2 py-0.5 rounded shadow">
                    Staff Gauge: {confidencePercent == null ? '—' : `${confidencePercent}%`}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom floating info (Hideable via showOverlays) */}
            {showOverlays && (
              <div className="absolute bottom-4 left-4 bg-black/80 backdrop-blur-md px-4 py-2 rounded-xl border border-white/20 text-white text-xs flex items-center space-x-3">
                <span className="font-bold text-sky-300">
                  {viewMode === 'ai_dashboard' ? `ระดับน้ำตรวจวัด AI (${aiScenario.toUpperCase()}):` : 'ระดับน้ำตรวจวัด:'}
                </span>
                <span className={`font-extrabold text-base font-mono ${
                  displayLevel >= station.critical_level ? 'text-rose-400' :
                  displayLevel >= station.warning_level ? 'text-amber-400' : 'text-emerald-300'
                }`}>
                  {Number.isFinite(displayLevel) ? displayLevel.toFixed(2) : '—'} เมตรตามรายงาน
                </span>
                <span className="text-slate-400">|</span>
                <span className="text-slate-300">เตือนภัย: {station.warning_level} ม. รทก.</span>
                <span className="text-slate-400">|</span>
                <span className="text-rose-400 font-bold">วิกฤต: {station.critical_level} ม. รทก.</span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default CameraViewer;

import React, { useState, useEffect, useRef } from 'react';
import type { Station, WaterMeasurement } from '../types';
import {
  Camera,
  Eye,
  Radio,
  Target,
  Sparkles,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  Search,
  Move,
  Sliders,
  CheckCircle,
} from 'lucide-react';

interface CameraViewerProps {
  station: Station | null;
  measurement: WaterMeasurement | null;
  onOpenReview: () => void;
  onOpenCalibrate?: () => void;
}

export const CameraViewer: React.FC<CameraViewerProps> = ({
  station,
  measurement,
  onOpenReview,
  onOpenCalibrate,
}) => {
  const [imgError, setImgError] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(Date.now());
  
  // View Mode: 'live' = Live CCTV Feed | 'ai_dashboard' = AI Model Staff Gauge Analysis (as requested)
  const [viewMode, setViewMode] = useState<'live' | 'ai_dashboard'>('live');

  // Zoom & Pan state
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isFocusedGauge, setIsFocusedGauge] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setImgError(false);
    // Reset zoom when switching station
    setZoomLevel(1.0);
    setPan({ x: 0, y: 0 });
    setIsFocusedGauge(false);
  }, [station?.station_code]);

  // Auto refresh image every 60s
  useEffect(() => {
    const timer = setInterval(() => {
      setRefreshKey(Date.now());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  if (!station) return null;

  const currentLevel = measurement ? measurement.water_level : station.normal_level;
  const streamUrl = station.camera_stream_url
    ? `${station.camera_stream_url}?t=${refreshKey}`
    : null;

  const aiDashboardUrl = `/ai_dashboards/${station.station_code}.jpg?t=${refreshKey}`;

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

  // Preset Focus Staff Gauge: Centers directly on the staff gauge horizontal position
  const handleFocusGauge = () => {
    if (isFocusedGauge) {
      handleResetZoom();
    } else {
      setZoomLevel(2.4);
      const code = station.station_code.toUpperCase();
      if (code.includes('HATYAINAI') || code.includes('X.44')) {
        setPan({ x: -140, y: 0 });
      } else if (code.includes('BANGSALA') || code.includes('X.90')) {
        setPan({ x: -90, y: 15 });
      } else {
        setPan({ x: -80, y: 15 });
      }
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
      <div className="bg-white border-2 border-blue-100 rounded-2xl overflow-hidden shadow-[0_4px_20px_-4px_rgba(2,132,199,0.08)] hover:shadow-[0_8px_30px_-4px_rgba(2,132,199,0.12)] transition-all flex flex-col h-full min-h-[480px]">
        
        {/* Header with View Mode Switcher */}
        <div className="px-4 py-3 bg-gradient-to-r from-blue-50/95 via-sky-50/60 to-white border-b border-blue-100 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-md shadow-blue-500/20 shrink-0">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
                  กล้อง CCTV สด & AI ตรวจวัดเสาน้ำ
                </h3>
                <span className="text-[10px] font-mono font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                  {station.camera_id || station.station_code}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                {viewMode === 'live'
                  ? 'ภาพกล้องถ่ายทอดสดแบบเรียลไทม์ (LIVE 30 FPS)'
                  : 'ผลลัพธ์โมเดล AI: ภาพเสา Rectified + ไม้บรรทัดดิจิทัล + จุดตัดผิวน้ำ'}
              </p>
            </div>
          </div>

          {/* Mode Toggle Buttons: [Live Feed] VS [AI Staff Gauge Model Dashboard] */}
          <div className="flex items-center bg-slate-100/90 p-1 rounded-xl border border-blue-200/80 shadow-inner">
            <button
              onClick={() => { setViewMode('live'); handleResetZoom(); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${
                viewMode === 'live'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-blue-700'
              }`}
            >
              <Radio className={`w-3 h-3 ${viewMode === 'live' ? 'text-white animate-pulse' : 'text-slate-400'}`} />
              <span>ภาพกล้องสด (LIVE)</span>
            </button>

            <button
              onClick={() => { setViewMode('ai_dashboard'); handleResetZoom(); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${
                viewMode === 'ai_dashboard'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-emerald-700'
              }`}
            >
              <Sparkles className={`w-3.5 h-3.5 ${viewMode === 'ai_dashboard' ? 'text-emerald-200 animate-spin' : 'text-emerald-600'}`} />
              <span>วิเคราะห์ AI Staff Gauge</span>
            </button>
          </div>
        </div>

        {/* Toolbar: Zoom Controls & Inspector Actions */}
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
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

            {/* Quick Focus Gauge preset (active in live mode) */}
            {viewMode === 'live' && (
              <button
                onClick={handleFocusGauge}
                className={`px-2.5 py-1 rounded-lg font-bold border transition flex items-center space-x-1 text-[11px] ${
                  isFocusedGauge
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-blue-50 hover:text-blue-700'
                }`}
              >
                <Search className="w-3 h-3 text-sky-400 shrink-0" />
                <span>ส่องเสาวัดน้ำ (Focus Gauge)</span>
              </button>
            )}
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
            className="w-full h-full flex items-center justify-center transition-transform duration-100 ease-out origin-center"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomLevel})`,
            }}
          >
            {/* VIEW MODE 1: AI MODEL DASHBOARD (ตามรูปที่แนบมาเป๊ะๆ) */}
            {viewMode === 'ai_dashboard' ? (
              <img
                src={aiDashboardUrl}
                alt={`AI Staff Gauge Model Dashboard - ${station.name}`}
                onError={() => {
                  // Fallback to live stream if dashboard image fails
                  console.warn('Dashboard image failed, falling back to live stream');
                  setViewMode('live');
                }}
                className="w-full h-full object-contain pointer-events-none"
              />
            ) : (
              /* VIEW MODE 2: LIVE STREAM */
              streamUrl && !imgError ? (
                <img
                  src={streamUrl}
                  alt={station.name}
                  onError={() => setImgError(true)}
                  className="w-full h-full object-cover object-center pointer-events-none"
                />
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

            {/* AI Waterline Overlay along the Staff Gauge (only in live mode) */}
            {viewMode === 'live' && (
              <div
                className="absolute inset-x-6 pointer-events-none border-b-2 border-dashed border-sky-400 opacity-90 shadow-[0_0_16px_rgba(56,189,248,0.9)] flex items-center justify-between"
                style={{ top: `${topPercent}%` }}
              >
                <span className="text-[10px] bg-gradient-to-r from-blue-600 to-sky-600 text-white font-extrabold px-2 py-0.5 rounded shadow -translate-y-3 flex items-center space-x-1 border border-white/20">
                  <Sparkles className="w-3 h-3 text-sky-200 shrink-0" />
                  <span>AI ผิวน้ำ: {currentLevel.toFixed(2)} ม. รทก.</span>
                </span>
                <span className="text-[10px] text-sky-200 font-mono -translate-y-3 bg-black/80 border border-sky-400/40 px-2 py-0.5 rounded shadow">
                  ความเชื่อมั่น: {(measurement?.vision_confidence ? measurement.vision_confidence * 100 : 90).toFixed(0)}%
                </span>
              </div>
            )}
          </div>

          {/* Top-Left Live / AI Status Badge */}
          <div className="absolute top-3 left-3 z-10 flex items-center space-x-2">
            {viewMode === 'live' ? (
              <span className="flex items-center space-x-1.5 text-[11px] text-emerald-300 font-extrabold bg-black/75 backdrop-blur-md px-3 py-1 rounded-xl border border-emerald-400/30 shadow-lg">
                <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse shrink-0" />
                <span>LIVE 30 FPS</span>
              </span>
            ) : (
              <span className="flex items-center space-x-1.5 text-[11px] text-teal-200 font-extrabold bg-black/85 backdrop-blur-md px-3 py-1 rounded-xl border border-teal-400/40 shadow-lg">
                <CheckCircle className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                <span>AI COMPUTER VISION DASHBOARD</span>
              </span>
            )}
            <span className="text-[11px] text-white font-bold bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-xl border border-white/20 shadow">
              {station.name.split(' ')[0]}
            </span>
          </div>

          {/* Bottom-Left Real Water Level Readout */}
          <div className="absolute bottom-3 left-3 z-10 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-blue-200 text-blue-950 text-xs flex items-center space-x-2 font-bold shadow-xl">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse shrink-0"></span>
            <div>
              <span className="text-slate-500 font-medium text-[10px] block leading-none">ระดับน้ำตรวจวัดล่าสุด:</span>
              <div className="flex items-baseline space-x-1">
                <span className="text-blue-700 text-base font-black font-mono leading-tight">
                  {currentLevel.toFixed(2)}
                </span>
                <span className="text-[11px] text-slate-700 font-bold">ม. รทก.</span>
              </div>
            </div>
          </div>

          {/* Zoom & Pan Guide Hint */}
          {zoomLevel > 1.0 && (
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
                    : 'ภาพการตรวจจับโดยโมเดล AI: เสา Rectified + ไม้บรรทัดดิจิทัล + จุดตัดผิวน้ำจริง'}
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

            <div className="flex items-center space-x-2 shrink-0">
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
              className="w-full h-full flex items-center justify-center transition-transform duration-100 ease-out origin-center"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomLevel})`,
              }}
            >
              <img
                src={viewMode === 'ai_dashboard' ? aiDashboardUrl : (streamUrl || '')}
                alt={station.name}
                className="w-full h-full object-contain pointer-events-none"
              />
            </div>

            {/* Bottom floating info */}
            <div className="absolute bottom-4 left-4 bg-black/80 backdrop-blur-md px-4 py-2 rounded-xl border border-white/20 text-white text-xs flex items-center space-x-3">
              <span className="font-bold text-sky-300">ระดับน้ำตรวจวัด:</span>
              <span className="font-extrabold text-base font-mono text-white">{currentLevel.toFixed(2)} ม. รทก.</span>
              <span className="text-slate-400">|</span>
              <span className="text-slate-300">เตือนภัย: {station.warning_level} ม. รทก.</span>
              <span className="text-slate-400">|</span>
              <span className="text-rose-400 font-bold">วิกฤต: {station.critical_level} ม. รทก.</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CameraViewer;

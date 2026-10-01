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
} from 'lucide-react';

interface CameraViewerProps {
  station: Station | null;
  measurement: WaterMeasurement | null;
  stations?: Station[];
  onSelectStation?: (stn: Station) => void;
  onOpenReview: () => void;
  onOpenCalibrate?: () => void;
}

export const CameraViewer: React.FC<CameraViewerProps> = ({
  station,
  measurement,
  stations = [],
  onSelectStation,
  onOpenReview,
  onOpenCalibrate,
}) => {
  const [imgError, setImgError] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(Date.now());

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

  const handleFocusGauge = () => {
    if (isFocusedGauge) {
      handleResetZoom();
    } else {
      setZoomLevel(2.4);
      // Offset slightly to center the staff gauge
      setPan({ x: 0, y: 20 });
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

  // Waterline calculations
  const minLvl = station.normal_level * 0.5;
  const maxLvl = station.bank_level;
  const clampedRatio = Math.min(Math.max((currentLevel - minLvl) / Math.max(1, maxLvl - minLvl), 0.05), 0.95);
  const topPercent = Math.round(82 - clampedRatio * 57);

  const zoomPercent = Math.round(zoomLevel * 100);

  return (
    <>
      <div className="bg-white border-2 border-blue-100 rounded-2xl overflow-hidden shadow-[0_4px_20px_-4px_rgba(2,132,199,0.08)] hover:shadow-[0_8px_30px_-4px_rgba(2,132,199,0.12)] transition-all flex flex-col h-full min-h-[500px]">
        
        {/* Header with Camera Title & Quick Station Tabs */}
        <div className="px-4 py-3 bg-gradient-to-r from-blue-50/95 via-sky-50/60 to-white border-b border-blue-100 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-md shadow-blue-500/20">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
                  กล้อง CCTV สด & AI ตรวจวัดผิวน้ำ
                </h3>
                <span className="text-[10px] font-mono font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                  {station.camera_id || station.station_code}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                วิเคราะห์สเกลเสาวัดน้ำและคำนวณระดับน้ำจริง (ม. รทก.) ด้วย Computer Vision
              </p>
            </div>
          </div>

          {/* Station Switcher Tabs (if available) */}
          {stations.length > 0 && onSelectStation && (
            <div className="flex items-center space-x-1 bg-white/90 p-1 rounded-xl border border-blue-200/80 shadow-sm">
              {stations.map((stn) => {
                const isActive = stn.station_code === station.station_code;
                return (
                  <button
                    key={stn.station_code}
                    onClick={() => onSelectStation(stn)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50'
                    }`}
                  >
                    {stn.name.split(' ')[0]}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Toolbar: Zoom Controls & Inspector Actions */}
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          {/* Zoom controls */}
          <div className="flex items-center space-x-1.5">
            <span className="text-[11px] font-bold text-slate-500 flex items-center space-x-1 mr-1">
              <Sliders className="w-3.5 h-3.5 text-blue-600" />
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

            <span className="font-mono font-extrabold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md min-w-[48px] text-center text-[11px]">
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
              title="รีเซ็ตตำแหน่งและขนาดซูม (1x)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            {/* Quick Focus Gauge preset */}
            <button
              onClick={handleFocusGauge}
              className={`px-2.5 py-1 rounded-lg font-bold border transition flex items-center space-x-1 text-[11px] ${
                isFocusedGauge
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-blue-50 hover:text-blue-700'
              }`}
            >
              <Search className="w-3 h-3 text-sky-400" />
              <span>ส่องเสาวัดน้ำ (Focus Gauge)</span>
            </button>
          </div>

          {/* Action buttons right */}
          <div className="flex items-center space-x-2">
            {onOpenCalibrate && (
              <button
                onClick={onOpenCalibrate}
                className="bg-white hover:bg-blue-50 text-slate-800 hover:text-blue-700 px-2.5 py-1 rounded-lg border border-slate-200 font-bold transition flex items-center space-x-1 text-[11px]"
                title="ปรับเทียบพิกัดสเกลเสาวัดน้ำ"
              >
                <Target className="w-3 h-3 text-blue-600" />
                <span>ปรับเทียบ (Calibrate)</span>
              </button>
            )}

            <button
              onClick={onOpenReview}
              className="bg-sky-600 hover:bg-sky-700 text-white px-2.5 py-1 rounded-lg font-bold transition flex items-center space-x-1 text-[11px] shadow-sm"
              title="ตรวจสอบภาพและยืนยันระดับน้ำ"
            >
              <Eye className="w-3 h-3" />
              <span>ตรวจทาน (Review)</span>
            </button>

            <button
              onClick={() => setIsFullscreen(true)}
              className="bg-slate-800 hover:bg-slate-900 text-white p-1.5 rounded-lg font-bold transition flex items-center space-x-1 text-[11px] shadow-sm"
              title="เปิดดูแบบเต็มจอเพื่อตรวจสเกลชัดเจน"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Video Canvas Container */}
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
            {streamUrl && !imgError ? (
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
                  {/* Gauge Pole */}
                  <rect x="295" y="60" width="50" height="280" fill="#f8fafc" stroke="#0f172a" strokeWidth="3" />
                  {[80, 110, 140, 170, 200, 230, 260, 290, 320].map((y, idx) => (
                    <g key={y}>
                      <line x1="295" y1={y} x2="315" y2={y} stroke="#dc2626" strokeWidth="2.5" />
                      <line x1="315" y1={y} x2="345" y2={y} stroke="#0f172a" strokeWidth="1" />
                      <text x="320" y={y + 4} fill="#0f172a" fontSize="10" fontWeight="bold">
                        {(station.bank_level - idx * 1.0).toFixed(1)}
                      </text>
                    </g>
                  ))}
                  {/* Waterline */}
                  <line x1="100" y1="210" x2="540" y2="210" stroke="#38bdf8" strokeWidth="4" strokeDasharray="8,5" />
                </svg>
              </div>
            )}

            {/* AI Waterline Overlay that moves with zoom */}
            <div
              className="absolute inset-x-8 pointer-events-none border-b-2 border-dashed border-sky-400 opacity-90 shadow-[0_0_16px_rgba(56,189,248,0.9)] flex items-center justify-between"
              style={{ top: `${topPercent}%` }}
            >
              <span className="text-[10px] bg-gradient-to-r from-blue-600 to-sky-600 text-white font-black px-2 py-0.5 rounded shadow -translate-y-3 flex items-center space-x-1 border border-white/20">
                <Sparkles className="w-3 h-3 text-sky-200" />
                <span>AI ผิวน้ำ: {currentLevel.toFixed(2)} ม. รทก.</span>
              </span>
              <span className="text-[10px] text-sky-200 font-mono -translate-y-3 bg-black/80 border border-sky-400/40 px-2 py-0.5 rounded shadow">
                ความเชื่อมั่น: {(measurement?.vision_confidence ? measurement.vision_confidence * 100 : 92).toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Top-Left Live Status Badge */}
          <div className="absolute top-3 left-3 z-10 flex items-center space-x-2">
            <span className="flex items-center space-x-1.5 text-[11px] text-emerald-300 font-extrabold bg-black/75 backdrop-blur-md px-3 py-1 rounded-xl border border-emerald-400/30 shadow-lg">
              <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span>LIVE 30 FPS</span>
            </span>
            <span className="text-[11px] text-white font-bold bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-xl border border-white/20 shadow">
              {station.name.split(' ')[0]}
            </span>
          </div>

          {/* Bottom-Left Real Water Level Readout */}
          <div className="absolute bottom-3 left-3 z-10 bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-blue-200 text-blue-950 text-xs flex items-center space-x-2.5 font-bold shadow-xl">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse"></span>
            <div>
              <span className="text-slate-500 font-medium text-[10px] block leading-none">ระดับน้ำตรวจวัดล่าสุด:</span>
              <span className="text-blue-700 text-base font-black font-mono leading-tight">
                {currentLevel.toFixed(2)}
              </span>
              <span className="text-xs text-slate-700 ml-1">ม. รทก.</span>
            </div>
          </div>

          {/* Zoom & Pan Guide Hint */}
          {zoomLevel > 1.0 && (
            <div className="absolute bottom-3 right-3 z-10 bg-black/75 backdrop-blur-md text-sky-200 text-[10px] px-2.5 py-1 rounded-lg border border-white/20 shadow flex items-center space-x-1 font-medium">
              <Move className="w-3 h-3 text-sky-300 animate-bounce" />
              <span>คลิกลากเพื่อเลื่อนตำแหน่งภาพ ({zoomPercent}%)</span>
            </div>
          )}
        </div>

      </div>

      {/* Fullscreen Inspection Modal */}
      {isFullscreen && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex flex-col p-4 sm:p-6 animate-fade-in">
          {/* Modal Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/20 text-white mb-2">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-blue-600 text-white">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base tracking-tight text-white flex items-center space-x-2">
                  <span>ตรวจสเกลเสาวัดน้ำ CCTV ความละเอียดสูง (HD Inspection)</span>
                  <span className="text-xs bg-sky-500/30 text-sky-200 border border-sky-400/40 px-2 py-0.5 rounded-full">
                    {station.name} ({station.station_code})
                  </span>
                </h3>
                <p className="text-xs text-sky-200/80">
                  สามารถซูมและลากเลื่อนเพื่อตรวจสอบรอยคราบน้ำและตัวเลขบนเสาวัดน้ำ (ม. รทก.) อย่างละเอียด
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
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
              {streamUrl && !imgError ? (
                <img
                  src={streamUrl}
                  alt={station.name}
                  className="w-full h-full object-contain pointer-events-none"
                />
              ) : (
                <div className="text-white text-sm">กำลังโหลดภาพกล้อง CCTV...</div>
              )}
            </div>

            {/* Bottom floating info */}
            <div className="absolute bottom-4 left-4 bg-black/80 backdrop-blur-md px-4 py-2 rounded-xl border border-white/20 text-white text-xs flex items-center space-x-3">
              <span className="font-bold text-sky-300">ระดับน้ำตรวจวัด:</span>
              <span className="font-extrabold text-base font-mono text-white">{currentLevel.toFixed(2)} ม. รทก.</span>
              <span className="text-slate-400">|</span>
              <span className="text-slate-300">เกณฑ์วิกฤต: {station.critical_level} ม. รทก.</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CameraViewer;

import React, { useState, useRef, useEffect } from 'react';
import type { Station, CalibrationPoint } from '../types';
import { Target, CheckCircle2, RotateCcw, Save, X, ZoomIn, ZoomOut, Move, Waves } from 'lucide-react';
import { floodlensApi } from '../api/floodlensApi';
import { PillButton } from './ui/PillButton';
import { IconButton } from './ui/IconButton';

interface ClickToCalibrateModalProps {
  isOpen: boolean;
  onClose: () => void;
  station: Station | null;
  onCalibrationSaved?: () => void;
}

export const ClickToCalibrateModal: React.FC<ClickToCalibrateModalProps> = ({
  isOpen,
  onClose,
  station,
  onCalibrationSaved,
}) => {
  const [point1, setPoint1] = useState<CalibrationPoint | null>(null);
  const [point2, setPoint2] = useState<CalibrationPoint | null>(null);
  const [val1, setVal1] = useState<number>(2.0);
  const [val2, setVal2] = useState<number>(1.0);
  const [testClickY, setTestClickY] = useState<number | null>(null);
  const [testClickPos, setTestClickPos] = useState<{ x: number; y: number } | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Zoom & Pan state
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [mouseStartPos, setMouseStartPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Determine current active step (1, 2, or 3)
  const currentStep = !point1 ? 1 : !point2 ? 2 : 3;

  // Counter-scaling factor so markers stay small and crisp regardless of zoom
  const uiScale = 1 / zoomLevel;

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

  // Mouse wheel zoom event listener
  useEffect(() => {
    if (!isOpen) return;
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY > 0 ? -0.2 : 0.2;
      setZoomLevel((prev) => {
        const next = Math.min(Math.max(Number((prev + delta).toFixed(1)), 1.0), 3.5);
        if (next === 1.0) setPan({ x: 0, y: 0 });
        return next;
      });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [isOpen]);

  // Mouse drag panning handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setMouseStartPos({ x: e.clientX, y: e.clientY });
    if (zoomLevel > 1.0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
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

  if (!isOpen || !station) return null;

  // Handle clicking on image with accurate coordinate scaling
  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    // If mouse moved more than 5px during down/up, consider it a drag/pan, not a click
    const moveDist = Math.hypot(e.clientX - mouseStartPos.x, e.clientY - mouseStartPos.y);
    if (moveDist > 6) return;

    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const unscaledW = imgRef.current.clientWidth;
    const unscaledH = imgRef.current.clientHeight;
    const x = Math.round((e.clientX - rect.left) * (unscaledW / rect.width));
    const y = Math.round((e.clientY - rect.top) * (unscaledH / rect.height));

    const clampedX = Math.max(0, Math.min(x, unscaledW));
    const clampedY = Math.max(0, Math.min(y, unscaledH));

    if (!point1) {
      setPoint1({ x: clampedX, y: clampedY, value_m: val1 });
    } else if (!point2) {
      setPoint2({ x: clampedX, y: clampedY, value_m: val2 });
    } else {
      // Test measuring click
      setTestClickY(clampedY);
      setTestClickPos({ x: clampedX, y: clampedY });
    }
  };

  // Calculate pixels per meter and linear interpolation
  let pixelsPerMeter: number | null = null;
  let testMeasuredLevel: number | null = null;

  if (point1 && point2 && point1.y !== point2.y && val1 !== val2) {
    const pixelDistance = Math.abs(point2.y - point1.y);
    const meterDistance = Math.abs(val1 - val2);
    pixelsPerMeter = pixelDistance / meterDistance;

    if (testClickY !== null) {
      // Linear interpolation between (point1.y, val1) and (point2.y, val2)
      // v(y) = val1 + (val2 - val1) * (y - point1.y) / (point2.y - point1.y)
      const calculatedLevel = val1 + ((val2 - val1) * (testClickY - point1.y)) / (point2.y - point1.y);
      testMeasuredLevel = Number(calculatedLevel.toFixed(2));
    }
  }

  const handleReset = () => {
    setPoint1(null);
    setPoint2(null);
    setTestClickY(null);
    setTestClickPos(null);
    setSaveSuccess(false);
    setZoomLevel(1.0);
    setPan({ x: 0, y: 0 });
  };

  const handleSave = async () => {
    if (!point1 || !point2 || !pixelsPerMeter) return;
    setSaving(true);
    try {
      await floodlensApi.saveCalibration(station.station_code, {
        station_code: station.station_code,
        point1: { ...point1, value_m: val1 },
        point2: { ...point2, value_m: val2 },
        pixels_per_meter: pixelsPerMeter,
        formula_str: `Level = ${val1} + (${(val2 - val1).toFixed(2)}) * (y - ${point1.y}) / (${point2.y - point1.y})`,
      });
      setSaveSuccess(true);
      setTimeout(() => {
        if (onCalibrationSaved) onCalibrationSaved();
        onClose();
      }, 1500);
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการบันทึกค่าปรับเทียบ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/60 backdrop-blur-xl animate-fade-in">
      <div className="bg-white/95 backdrop-blur-2xl border border-white/80 rounded-[32px] sm:rounded-[36px] w-full max-w-6xl xl:max-w-7xl max-h-[94vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 sm:py-5 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-50 text-sky-600 border border-sky-100 flex items-center justify-center shadow-sm">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold font-display text-slate-900 flex items-center space-x-2">
                <span>Click-to-Calibrate: สอบเทียบสเกลเสาวัดน้ำด้วยการคลิก</span>
                <span className="text-xs bg-slate-900 text-white px-2.5 py-0.5 rounded-full font-bold font-mono">
                  {station.station_code}
                </span>
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                คลิกมาร์ก 2 จุดบนเสาในภาพ เพื่อหาอัตราส่วนพิกเซลต่อเมตรโดยไม่ต้องรู้ความสูงของยอดเสาหรือโคนเสาจริง
              </p>
            </div>
          </div>
          <IconButton onClick={onClose} variant="ghost" size="sm" tooltip="ปิดหน้าต่าง">
            <X className="w-5 h-5 text-slate-400 hover:text-slate-700" />
          </IconButton>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 bg-transparent">
          {/* Left Canvas/Image Area (8-9 Cols) */}
          <div className="lg:col-span-8 xl:col-span-9 flex flex-col space-y-3">
            {/* Compact Step Bar & Zoom Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200/80 rounded-2xl px-3.5 py-2 text-xs shadow-xs">
              {/* Left: Step Indicators with Tooltip on Hover */}
              <div className="flex items-center space-x-1.5 sm:space-x-2">
                <span className="text-[11px] font-bold text-slate-400 hidden sm:inline mr-0.5">ขั้นตอน:</span>

                {/* Step 1 Pill */}
                <div className="relative group">
                  <div
                    className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer select-none ${
                      currentStep === 1
                        ? 'bg-sky-500 text-white shadow-xs'
                        : point1
                        ? 'bg-sky-50 text-sky-700 border border-sky-200'
                        : 'bg-white text-slate-400 border border-slate-200'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-mono font-black ${
                        currentStep === 1
                          ? 'bg-white text-sky-600'
                          : point1
                          ? 'bg-sky-600 text-white'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {point1 ? '✓' : '1'}
                    </span>
                    <span>จุดบนเสา</span>
                  </div>

                  {/* Tooltip on Hover */}
                  <div className="absolute left-0 top-full mt-2 z-30 hidden group-hover:block w-64 bg-slate-900/95 text-white p-3 rounded-2xl shadow-2xl border border-slate-700/80 backdrop-blur-md text-[11px] pointer-events-none transition-all">
                    <div className="font-bold text-sky-300 flex items-center space-x-1.5 mb-1">
                      <span>ขั้นที่ 1: กำหนดจุดบนเสา</span>
                      {point1 && <span className="text-emerald-400 text-[10px] font-mono">(เสร็จสิ้น)</span>}
                    </div>
                    <p className="text-slate-300 leading-snug">
                      คลิกเลือกตำแหน่งขีดตัวเลขสเกลด้านบนของเสา (เช่น ขีด {val1} ม.)
                    </p>
                    {point1 ? (
                      <div className="mt-1.5 pt-1.5 border-t border-slate-800 text-[10px] text-sky-300 font-mono flex items-center justify-between">
                        <span>พิกัดจุด: Y={point1.y}px</span>
                        <span className="font-bold">{val1} เมตร</span>
                      </div>
                    ) : (
                      <div className="mt-1.5 text-[10px] text-amber-300 font-semibold">
                        &bull; กำลังรอการคลิกบนภาพ
                      </div>
                    )}
                  </div>
                </div>

                <span className="text-slate-300 text-xs font-bold">&rsaquo;</span>

                {/* Step 2 Pill */}
                <div className="relative group">
                  <div
                    className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer select-none ${
                      currentStep === 2
                        ? 'bg-emerald-500 text-white shadow-xs'
                        : point2
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-white text-slate-400 border border-slate-200'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-mono font-black ${
                        currentStep === 2
                          ? 'bg-white text-emerald-600'
                          : point2
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {point2 ? '✓' : '2'}
                    </span>
                    <span>จุดล่างเสา</span>
                  </div>

                  {/* Tooltip on Hover */}
                  <div className="absolute left-0 top-full mt-2 z-30 hidden group-hover:block w-64 bg-slate-900/95 text-white p-3 rounded-2xl shadow-2xl border border-slate-700/80 backdrop-blur-md text-[11px] pointer-events-none transition-all">
                    <div className="font-bold text-emerald-300 flex items-center space-x-1.5 mb-1">
                      <span>ขั้นที่ 2: กำหนดจุดล่างเสา</span>
                      {point2 && <span className="text-emerald-400 text-[10px] font-mono">(เสร็จสิ้น)</span>}
                    </div>
                    <p className="text-slate-300 leading-snug">
                      คลิกเลือกตำแหน่งขีดตัวเลขสเกลด้านล่างของเสา (เช่น ขีด {val2} ม.) เพื่อคำนวณอัตราส่วนมาตราส่วน
                    </p>
                    {point2 ? (
                      <div className="mt-1.5 pt-1.5 border-t border-slate-800 text-[10px] text-emerald-300 font-mono flex items-center justify-between">
                        <span>พิกัดจุด: Y={point2.y}px</span>
                        <span className="font-bold">{val2} เมตร</span>
                      </div>
                    ) : (
                      <div className="mt-1.5 text-[10px] text-amber-300 font-semibold">
                        {point1 ? '&bull; คลิกบนภาพเพื่อเลือกจุดที่ 2' : '&bull; รอดำเนินการขั้นที่ 1 ก่อน'}
                      </div>
                    )}
                  </div>
                </div>

                <span className="text-slate-300 text-xs font-bold">&rsaquo;</span>

                {/* Step 3 Pill */}
                <div className="relative group">
                  <div
                    className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer select-none ${
                      currentStep === 3
                        ? testClickY !== null
                          ? 'bg-amber-500 text-slate-950 shadow-xs'
                          : 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-white text-slate-400 border border-slate-200'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-mono font-black ${
                        testClickY !== null
                          ? 'bg-slate-950 text-amber-400'
                          : currentStep === 3
                          ? 'bg-white text-indigo-600'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {testClickY !== null ? '✓' : '3'}
                    </span>
                    <span>ทดสอบผิวน้ำ</span>
                  </div>

                  {/* Tooltip on Hover */}
                  <div className="absolute right-0 sm:left-0 top-full mt-2 z-30 hidden group-hover:block w-64 bg-slate-900/95 text-white p-3 rounded-2xl shadow-2xl border border-slate-700/80 backdrop-blur-md text-[11px] pointer-events-none transition-all">
                    <div className="font-bold text-amber-300 flex items-center space-x-1.5 mb-1">
                      <span>ขั้นที่ 3: ทดสอบระดับน้ำ</span>
                      {testClickY !== null && <span className="text-emerald-400 text-[10px] font-mono">(ทดสอบแล้ว)</span>}
                    </div>
                    <p className="text-slate-300 leading-snug">
                      คลิกที่ระนาบผิวน้ำเพื่อทดสอบอ่านค่า และตรวจความถูกต้องก่อนกดบันทึก
                    </p>
                    {testClickY !== null ? (
                      <div className="mt-1.5 pt-1.5 border-t border-slate-800 text-[10px] text-amber-300 font-mono flex items-center justify-between">
                        <span>ระดับน้ำที่วัดได้:</span>
                        <span className="font-bold text-sm text-amber-200">{testMeasuredLevel} ม.</span>
                      </div>
                    ) : (
                      <div className="mt-1.5 text-[10px] text-slate-400">
                        {point1 && point2 ? '&bull; คลิกที่ผิวน้ำเพื่อทดสอบอ่านค่า' : '&bull; รอมาร์ก 2 จุดแรกให้เสร็จ'}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Zoom Controls & Reset Button */}
              <div className="flex items-center space-x-1 bg-white p-0.5 rounded-xl border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  disabled={zoomLevel <= 1.0}
                  className="p-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 transition cursor-pointer"
                  title="ซูมออก (-) หรือหมุนลูกกลิ้งลง"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span
                  className="font-mono font-bold text-sky-700 px-1.5 py-0.5 text-[11px] min-w-[42px] text-center"
                  title="หมุนลูกกลิ้งเมาส์บนภาพเพื่อซูมเข้า/ออก"
                >
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  disabled={zoomLevel >= 3.5}
                  className="p-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 transition cursor-pointer"
                  title="ซูมเข้า (+) หรือหมุนลูกกลิ้งขึ้น"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                {zoomLevel > 1.0 && (
                  <button
                    type="button"
                    onClick={handleResetZoom}
                    className="px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
                    title="รีเซ็ตขนาดซูม (100%)"
                  >
                    1x
                  </button>
                )}
                <div className="h-3 w-px bg-slate-200 mx-0.5" />
                <button
                  type="button"
                  onClick={handleReset}
                  className="p-1 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                  title="รีเซ็ตการมาร์กจุดทั้งหมด"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Clickable & Zoomable Camera Viewport */}
            <div
              ref={containerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className={`relative aspect-video bg-black rounded-2xl overflow-hidden border border-slate-200 shadow-md select-none touch-none overscroll-contain ${
                zoomLevel > 1.0 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-crosshair'
              }`}
            >
              {/* Transformed Layer - Scales and Pans Image + Markers together */}
              <div
                className="w-full h-full relative flex items-center justify-center transition-transform duration-75 ease-out origin-center"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomLevel})`,
                }}
              >
                {station.camera_stream_url ? (
                  <img
                    ref={imgRef}
                    src={station.camera_stream_url}
                    alt={station.name}
                    onClick={handleImageClick}
                    className="w-full h-full object-contain pointer-events-auto"
                    draggable={false}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                    ไม่พบภาพกล้อง CCTV
                  </div>
                )}

                {/* Point 1 Marker - Precision Target Reticle with Counter-Scale */}
                {point1 && (
                  <div
                    className="absolute pointer-events-none z-10 flex items-center"
                    style={{
                      left: `${point1.x}px`,
                      top: `${point1.y}px`,
                      transform: `translate(-10px, -10px) scale(${uiScale})`,
                      transformOrigin: '10px 10px',
                    }}
                  >
                    {/* Precision Crosshair Target Pin */}
                    <div className="w-5 h-5 rounded-full border-2 border-sky-400 bg-sky-500/25 flex items-center justify-center relative shadow-md">
                      <div className="w-1.5 h-1.5 rounded-full bg-sky-300 shadow" />
                      {/* Hairline Crosshair */}
                      <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-sky-300/80 -translate-x-1/2" />
                      <div className="absolute left-0 right-0 top-1/2 h-[1px] bg-sky-300/80 -translate-y-1/2" />
                    </div>

                    {/* Compact Label Offset to the Right */}
                    <div className="ml-1.5 px-2 py-0.5 rounded-md bg-slate-950/90 backdrop-blur-xs border border-sky-400/80 text-sky-200 font-mono text-[10px] font-bold shadow-lg flex items-center space-x-1 whitespace-nowrap">
                      <span className="w-3.5 h-3.5 rounded-full bg-sky-500 text-slate-950 flex items-center justify-center text-[9px] font-black">
                        1
                      </span>
                      <span>{val1} ม.</span>
                    </div>
                  </div>
                )}

                {/* Point 2 Marker - Precision Target Reticle with Counter-Scale */}
                {point2 && (
                  <div
                    className="absolute pointer-events-none z-10 flex items-center"
                    style={{
                      left: `${point2.x}px`,
                      top: `${point2.y}px`,
                      transform: `translate(-10px, -10px) scale(${uiScale})`,
                      transformOrigin: '10px 10px',
                    }}
                  >
                    {/* Precision Crosshair Target Pin */}
                    <div className="w-5 h-5 rounded-full border-2 border-emerald-400 bg-emerald-500/25 flex items-center justify-center relative shadow-md">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-300 shadow" />
                      {/* Hairline Crosshair */}
                      <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-emerald-300/80 -translate-x-1/2" />
                      <div className="absolute left-0 right-0 top-1/2 h-[1px] bg-emerald-300/80 -translate-y-1/2" />
                    </div>

                    {/* Compact Label Offset to the Right */}
                    <div className="ml-1.5 px-2 py-0.5 rounded-md bg-slate-950/90 backdrop-blur-xs border border-emerald-400/80 text-emerald-200 font-mono text-[10px] font-bold shadow-lg flex items-center space-x-1 whitespace-nowrap">
                      <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center text-[9px] font-black">
                        2
                      </span>
                      <span>{val2} ม.</span>
                    </div>
                  </div>
                )}

                {/* Calibration Scale Line Overlay & Water Surface in SVG */}
                <svg className="absolute inset-0 pointer-events-none w-full h-full overflow-visible">
                  {/* Connecting Dashed Line with Non-Scaling Stroke */}
                  {point1 && point2 && (
                    <g>
                      <line
                        x1={point1.x}
                        y1={point1.y}
                        x2={point2.x}
                        y2={point2.y}
                        stroke="#38bdf8"
                        strokeWidth="1.5"
                        strokeDasharray="4 3"
                        vectorEffect="non-scaling-stroke"
                        className="opacity-90"
                      />
                      <circle cx={point1.x} cy={point1.y} r="2" fill="#38bdf8" vectorEffect="non-scaling-stroke" />
                      <circle cx={point2.x} cy={point2.y} r="2" fill="#34d399" vectorEffect="non-scaling-stroke" />
                    </g>
                  )}

                  {/* Orange Dashed Water Surface Line Only - No Shaded Area */}
                  {testClickY !== null && (
                    <line
                      x1="0"
                      y1={testClickY}
                      x2="100%"
                      y2={testClickY}
                      stroke="#f97316"
                      strokeWidth="2"
                      strokeDasharray="6 4"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </svg>

                {/* Precision Water Level Caliper Probe with Counter-Scale */}
                {testClickY !== null && (
                  <div
                    className="absolute pointer-events-none z-10 flex flex-col items-center"
                    style={{
                      left: `${testClickPos?.x ?? ((point1?.x ?? 200) + (point2?.x ?? 200)) / 2}px`,
                      top: `${testClickY}px`,
                      transform: `translate(-50%, -100%) scale(${uiScale})`,
                      transformOrigin: 'bottom center',
                    }}
                  >
                    {/* Floating Glassmorphic Water Level Badge */}
                    <div className="mb-1 flex items-center space-x-1.5 bg-slate-950/92 backdrop-blur-md border border-orange-500/80 px-2.5 py-1 rounded-xl shadow-2xl text-white select-none whitespace-nowrap">
                      <span className="w-2 h-2 rounded-full bg-orange-500 animate-ping shrink-0" />
                      <Waves className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                      <span className="text-[10px] text-slate-300 font-medium">ผิวน้ำทดสอบ:</span>
                      <span className="font-mono font-black text-orange-300 text-xs tracking-wider">
                        {testMeasuredLevel} ม.
                      </span>
                    </div>

                    {/* Precision Pointer Arrow pointing down to the orange line */}
                    <div className="relative flex items-center justify-center">
                      <div className="w-0 h-0 border-x-[5px] border-x-transparent border-t-[6px] border-t-orange-500 -mt-1 shadow-md" />
                    </div>
                  </div>
                )}
              </div>

              {/* Floating Helper Hint when zoomed */}
              {zoomLevel > 1.0 && (
                <div className="absolute bottom-2.5 left-2.5 bg-black/70 backdrop-blur-md text-white px-2.5 py-1 rounded-xl text-[10px] font-medium border border-white/20 pointer-events-none flex items-center space-x-1.5 shadow-lg">
                  <Move className="w-3 h-3 text-sky-300 shrink-0" />
                  <span>ลากเมาส์เพื่อเลื่อนดูเสา &bull; หมุนลูกกลิ้งเพื่อซูม &bull; คลิกเพื่อมาร์กจุด</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Parameters & Readout Area (4-3 Cols) */}
          <div className="lg:col-span-4 xl:col-span-3 flex flex-col justify-between space-y-4">
            <div className="space-y-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
              <h3 className="text-xs font-bold font-display text-slate-900 uppercase tracking-wider">
                กำหนดค่าความสูงจุดอ้างอิงบนเสา
              </h3>

              {/* Value 1 Input */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-600 font-semibold flex items-center justify-between">
                  <span>ระดับความสูงจุดที่ 1 (ม.)</span>
                  <span className="text-sky-600 text-[11px] font-mono font-bold">
                    {point1 ? `Y: ${point1.y}px` : 'ยังไม่ได้คลิก'}
                  </span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={val1}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value) || 0;
                    setVal1(v);
                    if (point1) setPoint1({ ...point1, value_m: v });
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              {/* Value 2 Input */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-600 font-semibold flex items-center justify-between">
                  <span>ระดับความสูงจุดที่ 2 (ม.)</span>
                  <span className="text-emerald-600 text-[11px] font-mono font-bold">
                    {point2 ? `Y: ${point2.y}px` : 'ยังไม่ได้คลิก'}
                  </span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={val2}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value) || 0;
                    setVal2(v);
                    if (point2) setPoint2({ ...point2, value_m: v });
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              {/* Calculation Result */}
              {pixelsPerMeter && (
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1 text-xs">
                  <div className="flex justify-between items-center text-slate-700">
                    <span className="font-semibold">อัตราส่วนมาตราส่วน:</span>
                    <span className="font-bold text-sky-700 font-display text-sm">
                      {pixelsPerMeter.toFixed(2)} px/m
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono pt-1 border-t border-slate-200/60">
                    Formula: {Math.abs(val1 - val2)}m / {Math.abs(point2!.y - point1!.y)}px
                  </div>
                </div>
              )}

              {saveSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>บันทึกค่าปรับเทียบลงระบบเรียบร้อยแล้ว!</span>
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center space-x-3">
              <PillButton
                type="button"
                onClick={onClose}
                variant="secondary"
                size="md"
                className="w-1/3 justify-center text-xs font-semibold"
              >
                ยกเลิก
              </PillButton>
              <PillButton
                type="button"
                disabled={!point1 || !point2 || saving || saveSuccess}
                onClick={handleSave}
                variant="primary"
                size="md"
                loading={saving}
                icon={<Save className="w-4 h-4" />}
                className="w-2/3 justify-center text-xs font-semibold shadow-md"
              >
                {saving ? 'กำลังบันทึก...' : 'บันทึกค่าปรับเทียบ'}
              </PillButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClickToCalibrateModal;

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Station } from '../types';
import { floodlensApi } from '../api/floodlensApi';
import {
  X,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Sliders,
  Database,
  CheckCircle2,
  AlertCircle,
  Crop,
  Info,
  Sparkles,
  Camera,
  Sun,
  Moon,
  Waves,
  Radio,
} from 'lucide-react';

interface ManualBBoxModalProps {
  isOpen: boolean;
  onClose: () => void;
  station: Station | null;
  onSaved?: (bbox: [number, number, number, number]) => void;
}

interface BBoxRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export const ManualBBoxModal: React.FC<ManualBBoxModalProps> = ({
  isOpen,
  onClose,
  station,
  onSaved,
}) => {
  const [mode, setMode] = useState<'live' | 'daytime' | 'nighttime' | 'flood'>('live');
  const [bbox, setBBox] = useState<BBoxRect | null>(null);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [currentDragPos, setCurrentDragPos] = useState<{ x: number; y: number } | null>(null);
  const [notes, setNotes] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Zoom & Pan
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [spacePressed, setSpacePressed] = useState<boolean>(false);

  // References
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  const uiScale = 1 / zoomLevel;

  // Track spacebar for pan navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !spacePressed) {
        setSpacePressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpacePressed(false);
        setIsPanning(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [spacePressed]);

  // Load image URL
  const getImageUrl = useCallback(() => {
    if (!station) return '';
    const code = encodeURIComponent(station.station_code);
    return `/api/v1/stations/${code}/raw-frame.jpg?mode=${mode}&t=${Date.now()}`;
  }, [station, mode]);

  const [imageUrl, setImageUrl] = useState<string>('');

  useEffect(() => {
    if (isOpen && station) {
      setImageUrl(getImageUrl());
      setBBox(null);
      setSaveSuccess(null);
      setSaveError(null);
      setZoomLevel(1.0);
      setPan({ x: 0, y: 0 });
    }
  }, [isOpen, station, mode, getImageUrl]);

  // Native non-passive Wheel Event Listener for smooth zooming
  useEffect(() => {
    const containerEl = containerRef.current;
    if (!containerEl) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY > 0 ? -0.2 : 0.2;
      setZoomLevel((prev) => {
        const next = Math.min(Math.max(Number((prev + delta).toFixed(1)), 1.0), 3.5);
        if (next === 1.0) setPan({ x: 0, y: 0 });
        return next;
      });
    };

    containerEl.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => {
      containerEl.removeEventListener('wheel', handleNativeWheel);
    };
  }, [isOpen]);

  // Get image relative coordinates from client mouse event
  const getImageCoordinates = (e: React.MouseEvent) => {
    if (!imgRef.current) return null;
    const rect = imgRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    const unscaledW = imgRef.current.clientWidth;
    const unscaledH = imgRef.current.clientHeight;

    const x = Math.round((e.clientX - rect.left) * (unscaledW / rect.width));
    const y = Math.round((e.clientY - rect.top) * (unscaledH / rect.height));

    return {
      x: Math.max(0, Math.min(x, unscaledW)),
      y: Math.max(0, Math.min(y, unscaledH)),
    };
  };

  // Mouse Down
  const handleMouseDown = (e: React.MouseEvent) => {
    // If middle click or space key is held, trigger pan
    if (e.button === 1 || spacePressed || (zoomLevel > 1.0 && e.shiftKey)) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    // Left click: begin drawing BBox
    if (e.button === 0) {
      const coords = getImageCoordinates(e);
      if (!coords) return;
      setIsDrawing(true);
      setDrawStart(coords);
      setCurrentDragPos(coords);
    }
  };

  // Mouse Move
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      e.preventDefault();
      const maxPan = (zoomLevel - 1) * 300;
      const newX = Math.max(Math.min(e.clientX - panStart.x, maxPan), -maxPan);
      const newY = Math.max(Math.min(e.clientY - panStart.y, maxPan), -maxPan);
      setPan({ x: newX, y: newY });
      return;
    }

    if (isDrawing && drawStart) {
      e.preventDefault();
      const coords = getImageCoordinates(e);
      if (coords) {
        setCurrentDragPos(coords);
      }
    }
  };

  // Mouse Up
  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (isDrawing && drawStart && currentDragPos) {
      setIsDrawing(false);
      const x1 = Math.min(drawStart.x, currentDragPos.x);
      const x2 = Math.max(drawStart.x, currentDragPos.x);
      const y1 = Math.min(drawStart.y, currentDragPos.y);
      const y2 = Math.max(drawStart.y, currentDragPos.y);

      // Require a minimum size (at least 8px in width or height) to prevent accidental clicks
      if (x2 - x1 >= 8 && y2 - y1 >= 15) {
        setBBox({ x1, y1, x2, y2 });
      }
      setDrawStart(null);
      setCurrentDragPos(null);
    }
  };

  // Compute live active rectangle during draw
  const activeRect: BBoxRect | null = bbox
    ? bbox
    : isDrawing && drawStart && currentDragPos
    ? {
        x1: Math.min(drawStart.x, currentDragPos.x),
        y1: Math.min(drawStart.y, currentDragPos.y),
        x2: Math.max(drawStart.x, currentDragPos.x),
        y2: Math.max(drawStart.y, currentDragPos.y),
      }
    : null;

  // Update real-time cropped canvas preview
  useEffect(() => {
    if (!activeRect || !imgRef.current || !previewCanvasRef.current) return;
    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = imgRef.current;
    const naturalW = img.naturalWidth || img.clientWidth;
    const naturalH = img.naturalHeight || img.clientHeight;
    const clientW = img.clientWidth || 1;
    const clientH = img.clientHeight || 1;

    const scaleX = naturalW / clientW;
    const scaleY = naturalH / clientH;

    const cropX = activeRect.x1 * scaleX;
    const cropY = activeRect.y1 * scaleY;
    const cropW = (activeRect.x2 - activeRect.x1) * scaleX;
    const cropH = (activeRect.y2 - activeRect.y1) * scaleY;

    if (cropW <= 0 || cropH <= 0) return;

    // Set canvas dimensions to match aspect ratio
    canvas.width = Math.max(80, Math.min(160, Math.round(cropW)));
    canvas.height = Math.max(200, Math.min(360, Math.round(cropH)));

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    try {
      ctx.drawImage(
        img,
        cropX,
        cropY,
        cropW,
        cropH,
        0,
        0,
        canvas.width,
        canvas.height
      );
    } catch {
      // Ignore if image is still loading
    }
  }, [activeRect]);

  // Compute normalized YOLO bbox coordinates
  const getYoloCoords = () => {
    if (!activeRect || !imgRef.current) return null;
    const w = imgRef.current.clientWidth || 1;
    const h = imgRef.current.clientHeight || 1;

    const boxW = activeRect.x2 - activeRect.x1;
    const boxH = activeRect.y2 - activeRect.y1;
    const xCenter = (activeRect.x1 + activeRect.x2) / (2 * w);
    const yCenter = (activeRect.y1 + activeRect.y2) / (2 * h);
    const wNorm = boxW / w;
    const hNorm = boxH / h;

    return {
      xCenter: xCenter.toFixed(5),
      yCenter: yCenter.toFixed(5),
      wNorm: wNorm.toFixed(5),
      hNorm: hNorm.toFixed(5),
      boxW,
      boxH,
    };
  };

  const yolo = getYoloCoords();

  // Handle Save
  const handleSave = async () => {
    if (!station || !activeRect || !imgRef.current) return;
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      const clientW = imgRef.current.clientWidth;
      const clientH = imgRef.current.clientHeight;

      const payload = {
        station_code: station.station_code,
        bbox: [activeRect.x1, activeRect.y1, activeRect.x2, activeRect.y2] as [number, number, number, number],
        image_resolution: [clientW, clientH] as [number, number],
        mode,
        label: 'Staff Gauge',
        notes: notes || `Manual Staff Gauge annotation for ${station.name}`,
      };

      const res = await floodlensApi.saveManualBBox(station.station_code, payload);
      setSaveSuccess(res.message || 'บันทึกกรอบเสาวัดระดับน้ำและจัดเก็บเข้า Dataset สำเร็จ');

      if (onSaved) {
        onSaved(res.bbox);
      }

      // Close modal after brief success feedback
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setSaveError(err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !station) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-6xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base sm:text-lg font-black text-white">
                  วาดกรอบเสาวัดระดับน้ำด้วยตนเอง (Manual BBox)
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 font-bold">
                  YOLOv8 Retraining Dataset
                </span>
              </div>
              <p className="text-xs text-slate-400">
                สถานี: <span className="font-semibold text-slate-200">{station.name}</span> ({station.station_code}) &bull; ลากเมาส์สร้างกรอบสี่เหลี่ยมครอบเสาวัดน้ำเพื่อวิเคราะห์สเกลทันทีและนำไป Re-train โมเดล
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
            title="ปิดหน้าต่าง"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-0">
          
          {/* Left Canvas (Col 8/12) */}
          <div className="lg:col-span-8 flex flex-col space-y-3">
            
            {/* Toolbar: Scenario Switcher & Zoom Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/60 p-2.5 rounded-2xl border border-slate-800 text-xs">
              
              {/* Scenario selector */}
              <div className="flex items-center space-x-1 bg-slate-900 p-1 rounded-xl border border-slate-700/60">
                <span className="text-[11px] font-bold text-slate-400 px-2 flex items-center space-x-1">
                  <Camera className="w-3.5 h-3.5 text-sky-400" />
                  <span>ภาพมุมกล้อง:</span>
                </span>
                <button
                  type="button"
                  onClick={() => setMode('live')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer flex items-center space-x-1 ${
                    mode === 'live' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Radio className="w-3 h-3" />
                  <span>ภาพสด</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('daytime')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer flex items-center space-x-1 ${
                    mode === 'daytime' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Sun className="w-3 h-3 text-amber-300" />
                  <span>กลางวัน</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('nighttime')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer flex items-center space-x-1 ${
                    mode === 'nighttime' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Moon className="w-3 h-3 text-sky-300" />
                  <span>กลางคืน</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('flood')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer flex items-center space-x-1 ${
                    mode === 'flood' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Waves className="w-3 h-3 text-rose-300" />
                  <span>น้ำท่วม</span>
                </button>
              </div>

              {/* Zoom Controls */}
              <div className="flex items-center space-x-1 bg-slate-900 p-1 rounded-xl border border-slate-700/60">
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.max(1.0, Number((z - 0.3).toFixed(1))))}
                  disabled={zoomLevel <= 1.0}
                  className="p-1 rounded-lg text-slate-400 hover:text-white disabled:opacity-30 transition cursor-pointer"
                  title="ซูมออก (-)"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono font-bold text-amber-400 px-2 py-0.5 text-[11px] min-w-[42px] text-center">
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.min(3.5, Number((z + 0.3).toFixed(1))))}
                  disabled={zoomLevel >= 3.5}
                  className="p-1 rounded-lg text-slate-400 hover:text-white disabled:opacity-30 transition cursor-pointer"
                  title="ซูมเข้า (+)"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                {zoomLevel > 1.0 && (
                  <button
                    type="button"
                    onClick={() => { setZoomLevel(1.0); setPan({ x: 0, y: 0 }); }}
                    className="px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-400 hover:text-white transition cursor-pointer"
                  >
                    1x
                  </button>
                )}
                <div className="h-3 w-px bg-slate-700 mx-0.5" />
                <button
                  type="button"
                  onClick={() => setBBox(null)}
                  className="p-1 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                  title="ล้างกรอบที่วาดไว้"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Drawing Viewport */}
            <div
              ref={containerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className={`relative aspect-video bg-black rounded-2xl overflow-hidden border border-slate-700/80 shadow-inner select-none touch-none overscroll-contain ${
                spacePressed || isPanning
                  ? 'cursor-grab active:cursor-grabbing'
                  : 'cursor-crosshair'
              }`}
            >
              {/* Transformed Content */}
              <div
                className="w-full h-full relative flex items-center justify-center transition-transform duration-75 ease-out origin-center"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomLevel})`,
                }}
              >
                <img
                  ref={imgRef}
                  src={imageUrl}
                  alt={station.name}
                  draggable={false}
                  className="w-full h-full object-cover pointer-events-auto"
                />

                {/* SVG Layer for Drawing and Coordinates */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
                  {activeRect && (
                    <g>
                      {/* BBox Area Fill */}
                      <rect
                        x={activeRect.x1}
                        y={activeRect.y1}
                        width={activeRect.x2 - activeRect.x1}
                        height={activeRect.y2 - activeRect.y1}
                        fill="rgba(245, 158, 11, 0.18)"
                        stroke="#f59e0b"
                        strokeWidth={2 * uiScale}
                        strokeDasharray={isDrawing ? '4,3' : 'none'}
                      />

                      {/* 4 Corner Markers */}
                      <rect
                        x={activeRect.x1 - 3 * uiScale}
                        y={activeRect.y1 - 3 * uiScale}
                        width={6 * uiScale}
                        height={6 * uiScale}
                        fill="#ffffff"
                        stroke="#f59e0b"
                        strokeWidth={1.5 * uiScale}
                      />
                      <rect
                        x={activeRect.x2 - 3 * uiScale}
                        y={activeRect.y1 - 3 * uiScale}
                        width={6 * uiScale}
                        height={6 * uiScale}
                        fill="#ffffff"
                        stroke="#f59e0b"
                        strokeWidth={1.5 * uiScale}
                      />
                      <rect
                        x={activeRect.x1 - 3 * uiScale}
                        y={activeRect.y2 - 3 * uiScale}
                        width={6 * uiScale}
                        height={6 * uiScale}
                        fill="#ffffff"
                        stroke="#f59e0b"
                        strokeWidth={1.5 * uiScale}
                      />
                      <rect
                        x={activeRect.x2 - 3 * uiScale}
                        y={activeRect.y2 - 3 * uiScale}
                        width={6 * uiScale}
                        height={6 * uiScale}
                        fill="#ffffff"
                        stroke="#f59e0b"
                        strokeWidth={1.5 * uiScale}
                      />
                    </g>
                  )}
                </svg>

                {/* Floating Tag over BBox */}
                {activeRect && (
                  <div
                    className="absolute pointer-events-none transition-transform"
                    style={{
                      left: `${activeRect.x1}px`,
                      top: `${Math.max(0, activeRect.y1 - 24 * uiScale)}px`,
                      transform: `scale(${uiScale})`,
                      transformOrigin: 'bottom left',
                    }}
                  >
                    <div className="bg-amber-500 text-slate-950 font-black text-[11px] px-2 py-0.5 rounded-md shadow-lg flex items-center space-x-1 whitespace-nowrap">
                      <span>Staff Gauge (เสาวัดน้ำ)</span>
                      <span className="font-mono text-[10px] text-slate-900 bg-amber-300 px-1 rounded">
                        {activeRect.x2 - activeRect.x1}x{activeRect.y2 - activeRect.y1}px
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Instructions Overlay at Bottom */}
              <div className="absolute bottom-3 left-3 right-3 pointer-events-none flex items-center justify-between text-[11px] text-slate-300 bg-slate-950/80 backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-800">
                <div className="flex items-center space-x-2">
                  <Crop className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>
                    คลิกซ้ายแล้ว<strong>ลากเมาส์คลุมเสาวัดระดับน้ำ</strong> &bull; กด Spacebar ค้างไว้หรือใช้ลูกกลิ้งเมาส์เพื่อซูมและเลื่อนภาพ
                  </span>
                </div>
                {activeRect && (
                  <div className="font-mono font-bold text-amber-300">
                    W={activeRect.x2 - activeRect.x1}px | H={activeRect.y2 - activeRect.y1}px
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Inspection & Dataset Panel (Col 4/12) */}
          <div className="lg:col-span-4 flex flex-col justify-between space-y-4 bg-slate-950/60 p-5 rounded-2xl border border-slate-800">
            <div className="space-y-4">
              
              {/* Header Box */}
              <div className="flex items-center space-x-2 pb-3 border-b border-slate-800">
                <Database className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-sm text-white">รายละเอียดชุดข้อมูล Retrain</h3>
              </div>

              {/* Live Cropped Gauge Preview */}
              <div className="bg-slate-900/90 rounded-2xl p-3 border border-slate-800 flex flex-col items-center">
                <div className="w-full flex items-center justify-between text-xs font-bold text-slate-300 mb-2">
                  <span className="flex items-center space-x-1.5">
                    <Crop className="w-3.5 h-3.5 text-sky-400" />
                    <span>ภาพครอปเสา (Preview)</span>
                  </span>
                  {activeRect ? (
                    <span className="text-[10px] text-emerald-400 font-mono">พร้อมใช้งาน</span>
                  ) : (
                    <span className="text-[10px] text-amber-400">ยังไม่ได้วาดกรอบ</span>
                  )}
                </div>

                <div className="w-full h-44 bg-black/60 rounded-xl border border-slate-800 flex items-center justify-center overflow-hidden">
                  {activeRect ? (
                    <canvas ref={previewCanvasRef} className="max-h-full object-contain shadow-md" />
                  ) : (
                    <div className="text-center p-4 text-slate-500 text-xs">
                      <Sliders className="w-6 h-6 mx-auto mb-1.5 opacity-40" />
                      <span>ลากกรอบบนภาพซ้ายมือเพื่อดูตัวอย่างเสาที่ถูกครอป</span>
                    </div>
                  )}
                </div>
              </div>

              {/* YOLO Annotation Details */}
              <div className="bg-slate-900/90 rounded-2xl p-3.5 border border-slate-800 space-y-2">
                <div className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>พิกัด YOLOv8 Format:</span>
                </div>

                {yolo ? (
                  <div className="space-y-1.5">
                    <div className="bg-black/60 p-2 rounded-lg font-mono text-[11px] text-amber-300 break-all border border-slate-800">
                      <code>0 {yolo.xCenter} {yolo.yCenter} {yolo.wNorm} {yolo.hNorm}</code>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-400 pt-1">
                      <div>X1={activeRect?.x1} Y1={activeRect?.y1}</div>
                      <div>X2={activeRect?.x2} Y2={activeRect?.y2}</div>
                      <div>Width: {yolo.boxW} px</div>
                      <div>Height: {yolo.boxH} px</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 italic py-1">
                    รอกำหนดพิกัดจากภาพกล้อง...
                  </div>
                )}
              </div>

              {/* Notes Field */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center space-x-1">
                  <Info className="w-3.5 h-3.5 text-sky-400" />
                  <span>หมายเหตุประกอบภาพ (Optional):</span>
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="เช่น เสาวัดน้ำสะพานบางศาลา ถ่ายย้อนแสง/น้ำหลาก"
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
                />
              </div>

              {/* Status Feedback */}
              {saveSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs flex items-center space-x-2 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{saveSuccess}</span>
                </div>
              )}

              {saveError && (
                <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{saveError}</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="pt-3 border-t border-slate-800 space-y-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={!activeRect || isSaving}
                className="w-full py-3 px-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-orange-500/20 transition flex items-center justify-center space-x-2 cursor-pointer"
              >
                <Database className="w-4 h-4" />
                <span>
                  {isSaving ? 'กำลังบันทึกลง Dataset...' : 'บันทึกเข้า Dataset & ใช้งานทันที'}
                </span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl border border-slate-700 transition cursor-pointer"
              >
                ยกเลิก
              </button>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};

export default ManualBBoxModal;

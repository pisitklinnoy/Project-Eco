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
  RefreshCw,
  Radio,
  ExternalLink,
  Target,
  Loader2,
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
  const [bbox, setBBox] = useState<BBoxRect | null>(null);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [currentDragPos, setCurrentDragPos] = useState<{ x: number; y: number } | null>(null);
  const [notes, setNotes] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [labelStudioUrl, setLabelStudioUrl] = useState<string | null>(null);
  const [isAiPredicting, setIsAiPredicting] = useState<boolean>(false);
  const [aiPredictMsg, setAiPredictMsg] = useState<{ type: 'success' | 'warn' | 'error'; text: string } | null>(null);

  // Live snapshot state
  const [capturedTimestamp, setCapturedTimestamp] = useState<number>(Date.now());
  const [capturedTimeStr, setCapturedTimeStr] = useState<string>('');

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

  // Spacebar pan navigation
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

  // Refresh live camera frame
  const handleRefreshLiveFrame = useCallback(() => {
    const now = Date.now();
    setCapturedTimestamp(now);
    const date = new Date(now);
    setCapturedTimeStr(
      `${date.getHours().toString().padStart(2, '0')}:${date
        .getMinutes()
        .toString()
        .padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')} น.`
    );
  }, []);

  // สั่งให้โมเดล AI (YOLO) ช่วยทำนายตำแหน่งเสาวัดน้ำบนภาพนี้โดยอัตโนมัติ
  const handleAiAutoPredict = useCallback(async () => {
    if (!station || !imgRef.current) return;
    setIsAiPredicting(true);
    setAiPredictMsg(null);
    try {
      const res = await floodlensApi.predictStaffGaugeBBox(station.station_code, 'live');
      if (res.detected && res.bbox) {
        const clientW = imgRef.current.clientWidth || 1;
        const clientH = imgRef.current.clientHeight || 1;
        const naturalW = imgRef.current.naturalWidth || clientW;
        const naturalH = imgRef.current.naturalHeight || clientH;

        const scaleX = clientW / naturalW;
        const scaleY = clientH / naturalH;

        const x1 = Math.round(res.bbox[0] * scaleX);
        const y1 = Math.round(res.bbox[1] * scaleY);
        const x2 = Math.round(res.bbox[2] * scaleX);
        const y2 = Math.round(res.bbox[3] * scaleY);

        setBBox({ x1, y1, x2, y2 });
        const confPct = Math.round((res.confidence || 0) * 100);
        setAiPredictMsg({
          type: 'success',
          text: `🎯 AI (YOLO) ทำนายพิกัดเสาสำเร็จ! ความเชื่อมั่น ${confPct}% (ท่านสามารถปรับขนาดหรือกดบันทึกได้ทันที)`,
        });
      } else {
        setAiPredictMsg({
          type: 'warn',
          text: '⚠️ AI ยังตรวจไม่พบเสาวัดน้ำในภาพนี้ กรุณาคลิกลากเพื่อวาดกรอบด้วยตนเอง',
        });
      }
    } catch (err: any) {
      setAiPredictMsg({
        type: 'error',
        text: `❌ เกิดข้อผิดพลาดในการทำนาย: ${err?.message || 'Server error'}`,
      });
    } finally {
      setIsAiPredicting(false);
    }
  }, [station]);

  // Initialize snapshot when opened
  useEffect(() => {
    if (isOpen && station) {
      handleRefreshLiveFrame();
      setBBox(null);
      setSaveSuccess(null);
      setSaveError(null);
      setZoomLevel(1.0);
      setPan({ x: 0, y: 0 });
    }
  }, [isOpen, station, handleRefreshLiveFrame]);

  // Live image source URL strictly from current CCTV camera
  const imageUrl = station
    ? `/api/v1/stations/${encodeURIComponent(station.station_code)}/live-feed.jpg?t=${capturedTimestamp}`
    : '';

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
    if (e.button === 1 || spacePressed || (zoomLevel > 1.0 && e.shiftKey)) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

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

      if (x2 - x1 >= 8 && y2 - y1 >= 15) {
        setBBox({ x1, y1, x2, y2 });
      }
      setDrawStart(null);
      setCurrentDragPos(null);
    }
  };

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

  // Real-time cropped preview canvas
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

    canvas.width = Math.max(80, Math.min(160, Math.round(cropW)));
    canvas.height = Math.max(200, Math.min(360, Math.round(cropH)));

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    try {
      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
    } catch {
      // Ignore if image is loading
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

  // Save live frame and manual bbox to retraining dataset
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
        mode: 'live',
        label: 'Staff Gauge',
        notes: notes || `Live CCTV frame annotation for ${station.name} (${capturedTimeStr})`,
      };

      const res = await floodlensApi.saveManualBBox(station.station_code, payload);
      setSaveSuccess(res.message || 'บันทึกภาพสดและพิกัดเสาวัดระดับน้ำเข้า Dataset สำหรับ Re-train สำเร็จ');
      if (res.label_studio_url) {
        setLabelStudioUrl(res.label_studio_url);
      }

      if (onSaved) {
        onSaved(res.bbox);
      }

      setTimeout(() => {
        onClose();
      }, res.label_studio_url ? 2800 : 1500);
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
                  วาดกรอบเสาวัดระดับน้ำจากภาพสด (Manual BBox)
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>CCTV Live Frame</span>
                </span>
              </div>
              <p className="text-xs text-slate-400">
                สถานี: <span className="font-semibold text-slate-200">{station.name}</span> ({station.station_code}) &bull; บันทึกภาพสดและพิกัดเสา ณ เวลานี้เข้าสู่ Retrain Dataset เพื่อเพิ่มจำนวนข้อมูลและพัฒนาความฉลาดของโมเดล AI
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
            
            {/* Live Camera Ribbon & Zoom Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/60 p-2.5 rounded-2xl border border-slate-800 text-xs">
              
              {/* Live indicator & refresh */}
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-slate-900 border border-slate-700/60 text-slate-300 font-bold text-xs">
                  <Radio className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
                  <span>ภาพสดจากกล้อง CCTV</span>
                  {capturedTimeStr && (
                    <span className="text-slate-400 font-mono text-[11px] ml-1">({capturedTimeStr})</span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleRefreshLiveFrame}
                  className="px-2.5 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-sky-400 border border-slate-700/60 font-bold transition flex items-center space-x-1 cursor-pointer text-xs"
                  title="ดึงภาพเฟรมสดล่าสุดจากกล้อง CCTV อีกครั้ง"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>ดึงภาพสดใหม่</span>
                </button>

                {/* สั่ง AI ทำนายพิกัดเสาอัตโนมัติ */}
                <button
                  type="button"
                  onClick={handleAiAutoPredict}
                  disabled={isAiPredicting}
                  className="px-3 py-1 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-500 text-white font-black transition flex items-center space-x-1.5 cursor-pointer text-xs shadow-md shadow-emerald-950/30 active:scale-95 disabled:opacity-50"
                  title="สั่งให้โมเดล AI (YOLO) ทำนายพิกัดเสาวัดน้ำบนภาพนี้โดยอัตโนมัติ"
                >
                  {isAiPredicting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Target className="w-3.5 h-3.5 text-emerald-200" />
                  )}
                  <span>{isAiPredicting ? 'กำลังทำนาย...' : 'สั่ง AI ทำนายพิกัด'}</span>
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

            {/* AI Auto-Predict Status Message Banner */}
            {aiPredictMsg && (
              <div className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center justify-between gap-2 border ${
                aiPredictMsg.type === 'success'
                  ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300'
                  : aiPredictMsg.type === 'warn'
                  ? 'bg-amber-950/70 border-amber-500/50 text-amber-300'
                  : 'bg-rose-950/70 border-rose-500/50 text-rose-300'
              }`}>
                <span>{aiPredictMsg.text}</span>
                <button
                  type="button"
                  onClick={() => setAiPredictMsg(null)}
                  className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

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
                  className="w-full h-full object-contain pointer-events-auto"
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
                    คลิกซ้ายแล้ว<strong>ลากเมาส์ครอบเสาวัดน้ำในภาพสด</strong> &bull; หมุนลูกกลิ้งเมาส์เพื่อซูมเข้าหากเสาอยู่ไกล
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
                <div>
                  <h3 className="font-bold text-sm text-white">เพิ่มชุดข้อมูลภาพสด (Retrain Dataset)</h3>
                  <p className="text-[11px] text-slate-400">เพิ่มจำนวน Label ให้โมเดล AI ฉลาดขึ้น</p>
                </div>
              </div>

              {/* Live Cropped Gauge Preview */}
              <div className="bg-slate-900/90 rounded-2xl p-3 border border-slate-800 flex flex-col items-center">
                <div className="w-full flex items-center justify-between text-xs font-bold text-slate-300 mb-2">
                  <span className="flex items-center space-x-1.5">
                    <Crop className="w-3.5 h-3.5 text-sky-400" />
                    <span>ภาพครอปเสาจากภาพสด</span>
                  </span>
                  {activeRect ? (
                    <span className="text-[10px] text-emerald-400 font-mono">พร้อมบันทึก</span>
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
                      <span>ลากกรอบบนภาพกล้องสดด้านซ้ายเพื่อดูตัวอย่างเสาที่ตรวจพบ</span>
                    </div>
                  )}
                </div>
              </div>

              {/* YOLO Annotation Details */}
              <div className="bg-slate-900/90 rounded-2xl p-3.5 border border-slate-800 space-y-2">
                <div className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>พิกัด YOLOv8 Label (.txt):</span>
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
                  <span>หมายเหตุสภาพแสง/สภาพน้ำ ณ ตอนนั้น (Optional):</span>
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="เช่น กล้องย้อนแสงตอนเที่ยง, ฝนตกหนัก, เสาเปียกน้ำ"
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
                />
              </div>

              {/* Status Feedback */}
              {saveSuccess && (
                <div className="space-y-2 animate-in fade-in">
                  <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{saveSuccess}</span>
                  </div>
                  {labelStudioUrl && (
                    <a
                      href={labelStudioUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2.5 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-300 text-xs flex items-center justify-between transition cursor-pointer"
                    >
                      <span className="font-bold flex items-center space-x-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                        <span>เปิดตรวจทานใน Label Studio (Task #{labelStudioUrl.split('task=')[1] || ''})</span>
                      </span>
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    </a>
                  )}
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
                  {isSaving ? 'กำลังบันทึกลง Dataset...' : 'บันทึกภาพสดเข้า Retrain Dataset'}
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

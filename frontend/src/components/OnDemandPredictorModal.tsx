import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload,
  Crop,
  Target,
  Calculator,
  RotateCcw,
  X,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Sparkles,
  Info,
  FileImage,
} from 'lucide-react';
import { floodlensApi } from '../api/floodlensApi';
import type { OnDemandPredictResponse } from '../types';
import { PillButton } from './ui/PillButton';
import { IconButton } from './ui/IconButton';

interface OnDemandPredictorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OnDemandPredictorModal: React.FC<OnDemandPredictorModalProps> = ({
  isOpen,
  onClose,
}) => {
  // Image & File State
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

  // Interaction Mode: 'bbox' (Draw Staff Gauge) | 'point_high' (Upper mark) | 'point_low' (Lower mark)
  const [activeTool, setActiveTool] = useState<'bbox' | 'point_high' | 'point_low'>('bbox');

  // Annotation Coordinates (Original Image Pixels)
  const [bbox, setBbox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [pointHigh, setPointHigh] = useState<{ x: number; y: number } | null>(null);
  const [pointLow, setPointLow] = useState<{ x: number; y: number } | null>(null);

  // Scale Inputs (Meters)
  const [highMeter, setHighMeter] = useState<number>(0.90);
  const [lowMeter, setLowMeter] = useState<number>(0.60);
  const [stationNote, setStationNote] = useState<string>('หาดใหญ่ใน (ตรวจวัดแบบกำหนดเอง)');

  // Drag-to-draw state for Bounding Box
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [tempBBox, setTempBBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // Processing & Result State
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [predictionResult, setPredictionResult] = useState<OnDemandPredictResponse | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageElementRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Redraw Canvas Overlay
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageElementRef.current;
    if (!canvas || !img || !img.complete || img.naturalWidth === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Ensure canvas dimensions match the natural image resolution
    if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
    }

    // Clear and draw the base image
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // 1. Draw Bounding Box (Finished or in progress)
    const currentBox = tempBBox || bbox;
    if (currentBox && currentBox.width > 0 && currentBox.height > 0) {
      // Semi-transparent overlay fill
      ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
      ctx.fillRect(currentBox.x, currentBox.y, currentBox.width, currentBox.height);

      // Bounding box border
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = Math.max(2, Math.round(canvas.width / 500));
      if (tempBBox) {
        ctx.setLineDash([8, 4]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.strokeRect(currentBox.x, currentBox.y, currentBox.width, currentBox.height);
      ctx.setLineDash([]);

      // Label badge for Staff Gauge
      ctx.fillStyle = '#0f172a';
      const labelText = `Staff Gauge (${Math.round(currentBox.width)}×${Math.round(currentBox.height)}px)`;
      const fontSize = Math.max(14, Math.round(canvas.width / 70));
      ctx.font = `bold ${fontSize}px sans-serif`;
      const textWidth = ctx.measureText(labelText).width;
      const badgeY = Math.max(fontSize + 8, currentBox.y - 8);
      
      ctx.fillRect(currentBox.x, badgeY - fontSize - 4, textWidth + 12, fontSize + 8);
      ctx.fillStyle = '#34d399';
      ctx.fillText(labelText, currentBox.x + 6, badgeY);

      // Corner handles if finished
      if (!tempBBox) {
        const handleSize = Math.max(6, Math.round(canvas.width / 150));
        ctx.fillStyle = '#10b981';
        // 4 corners
        ctx.fillRect(currentBox.x - handleSize/2, currentBox.y - handleSize/2, handleSize, handleSize);
        ctx.fillRect(currentBox.x + currentBox.width - handleSize/2, currentBox.y - handleSize/2, handleSize, handleSize);
        ctx.fillRect(currentBox.x - handleSize/2, currentBox.y + currentBox.height - handleSize/2, handleSize, handleSize);
        ctx.fillRect(currentBox.x + currentBox.width - handleSize/2, currentBox.y + currentBox.height - handleSize/2, handleSize, handleSize);
      }
    }

    // 2. Draw Point High (Calibration Point 1)
    if (pointHigh) {
      const radius = Math.max(6, Math.round(canvas.width / 120));
      ctx.beginPath();
      ctx.arc(pointHigh.x, pointHigh.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#2563eb'; // Blue
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Crosshair
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pointHigh.x - radius * 1.8, pointHigh.y);
      ctx.lineTo(pointHigh.x + radius * 1.8, pointHigh.y);
      ctx.moveTo(pointHigh.x, pointHigh.y - radius * 1.8);
      ctx.lineTo(pointHigh.x, pointHigh.y + radius * 1.8);
      ctx.stroke();

      // Text Badge
      const text = `P1 (บน): ${highMeter.toFixed(2)} ม.`;
      const fontSize = Math.max(12, Math.round(canvas.width / 80));
      ctx.font = `bold ${fontSize}px sans-serif`;
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(pointHigh.x + radius + 4, pointHigh.y - fontSize, tw + 8, fontSize + 6);
      ctx.fillStyle = '#60a5fa';
      ctx.fillText(text, pointHigh.x + radius + 8, pointHigh.y - 2);
    }

    // 3. Draw Point Low (Calibration Point 2)
    if (pointLow) {
      const radius = Math.max(6, Math.round(canvas.width / 120));
      ctx.beginPath();
      ctx.arc(pointLow.x, pointLow.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b'; // Amber
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Crosshair
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pointLow.x - radius * 1.8, pointLow.y);
      ctx.lineTo(pointLow.x + radius * 1.8, pointLow.y);
      ctx.moveTo(pointLow.x, pointLow.y - radius * 1.8);
      ctx.lineTo(pointLow.x, pointLow.y + radius * 1.8);
      ctx.stroke();

      // Text Badge
      const text = `P2 (ล่าง): ${lowMeter.toFixed(2)} ม.`;
      const fontSize = Math.max(12, Math.round(canvas.width / 80));
      ctx.font = `bold ${fontSize}px sans-serif`;
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(pointLow.x + radius + 4, pointLow.y - fontSize, tw + 8, fontSize + 6);
      ctx.fillStyle = '#fbbf24';
      ctx.fillText(text, pointLow.x + radius + 8, pointLow.y - 2);
    }

    // 4. Draw Detected Water Level Line if prediction returned
    if (predictionResult && predictionResult.pixel_water_y_original) {
      const waterY = predictionResult.pixel_water_y_original;
      const box = bbox || { x: 0, width: canvas.width };
      const leftX = Math.max(0, box.x - 20);
      const rightX = Math.min(canvas.width, box.x + box.width + 20);

      ctx.strokeStyle = '#ef4444'; // Red
      ctx.lineWidth = Math.max(3, Math.round(canvas.width / 350));
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.moveTo(leftX, waterY);
      ctx.lineTo(rightX, waterY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Waterline Badge
      const waterText = `ระดับน้ำที่ตรวจพบ: ${predictionResult.calculated_water_level_m.toFixed(3)} ม.`;
      const fontSize = Math.max(13, Math.round(canvas.width / 75));
      ctx.font = `bold ${fontSize}px sans-serif`;
      const tw = ctx.measureText(waterText).width;
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(box.x, waterY + 4, tw + 12, fontSize + 6);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(waterText, box.x + 6, waterY + fontSize + 2);
    }
  }, [bbox, tempBBox, pointHigh, pointLow, highMeter, lowMeter, predictionResult]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  if (!isOpen) return null;

  // Handle Image File Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      loadFile(file);
    }
  };

  const loadFile = (file: File) => {
    setImageFile(file);
    setPredictionResult(null);
    setErrorMsg(null);
    setBbox(null);
    setPointHigh(null);
    setPointLow(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      setImageSrc(src);
      const img = new Image();
      img.src = src;
      img.onload = () => {
        imageElementRef.current = img;
        setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
        setActiveTool('bbox');
        setTimeout(redrawCanvas, 50);
      };
    };
    reader.readAsDataURL(file);
  };

  // Quick Demo: Load Station 3 Hatyai Nai sample image
  const handleLoadSample = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const sampleUrl = `/api/v1/stations/STN-HATYAINAI/raw-frame.jpg?t=${Date.now()}`;
      const res = await fetch(sampleUrl);
      if (!res.ok) throw new Error('ไม่สามารถดึงภาพตัวอย่างจากระบบได้');
      const blob = await res.blob();
      const file = new File([blob], 'station3_hatyainai_sample.jpg', { type: 'image/jpeg' });
      loadFile(file);
    } catch (err: any) {
      setErrorMsg(err.message || 'เกิดข้อผิดพลาดในการโหลดภาพตัวอย่าง');
    } finally {
      setLoading(false);
    }
  };

  // Coordinate Conversion Helper: Client mouse -> Natural image resolution pixels
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);
    return {
      x: Math.max(0, Math.min(canvas.width, x)),
      y: Math.max(0, Math.min(canvas.height, y)),
    };
  };

  // Canvas Mouse Interactions
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pt = getCanvasCoords(e);
    if (!pt) return;

    if (activeTool === 'bbox') {
      setIsDragging(true);
      setDragStart(pt);
      setTempBBox(null);
    } else if (activeTool === 'point_high') {
      setPointHigh(pt);
      setActiveTool('point_low');
    } else if (activeTool === 'point_low') {
      setPointLow(pt);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !dragStart || activeTool !== 'bbox') return;
    const pt = getCanvasCoords(e);
    if (!pt) return;

    const minX = Math.min(dragStart.x, pt.x);
    const minY = Math.min(dragStart.y, pt.y);
    const width = Math.abs(pt.x - dragStart.x);
    const height = Math.abs(pt.y - dragStart.y);

    setTempBBox({ x: minX, y: minY, width, height });
  };

  const handleMouseUp = () => {
    if (isDragging && tempBBox && tempBBox.width > 10 && tempBBox.height > 10) {
      setBbox(tempBBox);
      setTempBBox(null);
      setIsDragging(false);
      // Auto-progress to next step: Set high calibration point
      if (!pointHigh) {
        setActiveTool('point_high');
      }
    } else {
      setIsDragging(false);
      setTempBBox(null);
    }
  };

  // Reset annotations
  const handleReset = () => {
    setBbox(null);
    setPointHigh(null);
    setPointLow(null);
    setPredictionResult(null);
    setErrorMsg(null);
    setActiveTool('bbox');
    setTimeout(redrawCanvas, 50);
  };

  // Submit to Backend API
  const handleCalculate = async () => {
    if (!imageFile) {
      setErrorMsg('กรุณาอัปโหลดภาพเสาวัดน้ำก่อน');
      return;
    }
    if (!bbox) {
      setErrorMsg('กรุณาวาดกรอบ Bounding Box ครอบเสาวัดน้ำ (Step 2)');
      return;
    }
    if (!pointHigh) {
      setErrorMsg('กรุณาคลิกเลือกจุดเทียบสเกลบน (Point 1 - High)');
      return;
    }
    if (!pointLow) {
      setErrorMsg('กรุณาคลิกเลือกจุดเทียบสเกลล่าง (Point 2 - Low)');
      return;
    }
    if (highMeter <= lowMeter) {
      setErrorMsg('ค่าความสูงจุดบน (P1) ต้องมากกว่าจุดล่าง (P2)');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const formData = new FormData();
      formData.append('image', imageFile);
      formData.append('bbox', JSON.stringify(bbox));
      formData.append(
        'point_high',
        JSON.stringify({ x: pointHigh.x, y: pointHigh.y, actual_meter: highMeter })
      );
      formData.append(
        'point_low',
        JSON.stringify({ x: pointLow.x, y: pointLow.y, actual_meter: lowMeter })
      );
      formData.append('station_note', stationNote);

      const res = await floodlensApi.predictCustomImage(formData);
      setPredictionResult(res);
    } catch (err: any) {
      setErrorMsg(err.message || 'เกิดข้อผิดพลาดในการคำนวณระดับน้ำ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xl animate-fade-in overflow-y-auto">
      <div className="bg-white/95 backdrop-blur-2xl border border-white/80 rounded-[32px] sm:rounded-[36px] w-full max-w-6xl max-h-[94vh] overflow-hidden flex flex-col shadow-2xl my-auto">
        
        {/* Header */}
        <div className="px-6 py-4.5 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-500 to-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                  ตรวจวัดระดับน้ำจากภาพถ่าย (Instant Water Level Check)
                </h3>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                  On-Demand AI & Active Learning
                </span>
              </div>
              <p className="text-xs text-slate-500">
                วาด Bounding Box ครอบเสาและระบุสเกล 2 จุด ระบบจะคำนวณระดับน้ำทันที พร้อมบันทึกภาพเข้า Label Studio
              </p>
            </div>
          </div>

          <IconButton onClick={onClose} tooltip="ปิดหน้าต่าง" size="md">
            <X className="w-4 h-4 text-slate-500" />
          </IconButton>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: Interactive Canvas & Drawing Canvas (7 cols) */}
          <div className="lg:col-span-7 flex flex-col space-y-4">
            
            {/* Toolbar for Drawing Tools */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-100/80 p-2 rounded-2xl border border-slate-200/60">
              <div className="flex items-center space-x-1.5">
                <button
                  onClick={() => setActiveTool('bbox')}
                  disabled={!imageSrc}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center space-x-1.5 transition-all ${
                    activeTool === 'bbox'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-white/80 text-slate-700 hover:bg-white'
                  } disabled:opacity-40`}
                >
                  <Crop className="w-3.5 h-3.5" />
                  <span>1. วาดกรอบเสา (BBox)</span>
                  {bbox && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300 ml-1" />}
                </button>

                <button
                  onClick={() => setActiveTool('point_high')}
                  disabled={!imageSrc}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center space-x-1.5 transition-all ${
                    activeTool === 'point_high'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white/80 text-slate-700 hover:bg-white'
                  } disabled:opacity-40`}
                >
                  <Target className="w-3.5 h-3.5" />
                  <span>2. สเกลบน (P1)</span>
                  {pointHigh && <CheckCircle2 className="w-3.5 h-3.5 text-blue-300 ml-1" />}
                </button>

                <button
                  onClick={() => setActiveTool('point_low')}
                  disabled={!imageSrc}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center space-x-1.5 transition-all ${
                    activeTool === 'point_low'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'bg-white/80 text-slate-700 hover:bg-white'
                  } disabled:opacity-40`}
                >
                  <Target className="w-3.5 h-3.5" />
                  <span>3. สเกลล่าง (P2)</span>
                  {pointLow && <CheckCircle2 className="w-3.5 h-3.5 text-amber-300 ml-1" />}
                </button>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={handleReset}
                  disabled={!imageSrc}
                  className="px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white/70 hover:bg-white rounded-xl border border-slate-200 flex items-center space-x-1 transition-all disabled:opacity-40"
                  title="ล้างพิกัดทั้งหมด"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>ล้างเส้น</span>
                </button>
              </div>
            </div>

            {/* Canvas Container / Upload Dropzone */}
            <div className="relative min-h-[380px] sm:min-h-[460px] bg-slate-900 rounded-3xl overflow-hidden flex items-center justify-center border border-slate-800 shadow-inner group">
              {imageSrc ? (
                <div className="relative max-w-full max-h-[500px] flex items-center justify-center overflow-hidden">
                  <canvas
                    ref={canvasRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    className={`max-w-full max-h-[500px] object-contain transition-all select-none ${
                      activeTool === 'bbox'
                        ? 'cursor-crosshair'
                        : 'cursor-pointer'
                    }`}
                  />
                  {/* Subtle active mode hint */}
                  <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-md text-white text-[11px] font-semibold px-3 py-1.5 rounded-full border border-white/20 shadow flex items-center space-x-1.5 pointer-events-none">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span>
                      {activeTool === 'bbox'
                        ? 'โหมด: คลิกลากเพื่อวาดกรอบสี่เหลี่ยมครอบตัวเสา'
                        : activeTool === 'point_high'
                        ? `โหมด: คลิกตำแหน่งสเกลบน (${highMeter.toFixed(2)} ม.)`
                        : `โหมด: คลิกตำแหน่งสเกลล่าง (${lowMeter.toFixed(2)} ม.)`}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center flex flex-col items-center space-y-4 max-w-md">
                  <div className="w-16 h-16 rounded-3xl bg-slate-800/80 text-blue-400 flex items-center justify-center border border-slate-700 shadow-inner">
                    <FileImage className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="text-white font-extrabold text-base">
                      อัปโหลดภาพเสาวัดระดับน้ำ
                    </h4>
                    <p className="text-xs text-slate-400 mt-1">
                      รองรับไฟล์ภาพ JPG, PNG, WEBP จากกล้อง CCTV หรือภาพถ่ายภาคสนาม
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-3 pt-2 w-full justify-center">
                    <PillButton
                      variant="primary"
                      icon={<Upload className="w-4 h-4" />}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      เลือกไฟล์จากอุปกรณ์
                    </PillButton>

                    <PillButton
                      variant="glass"
                      icon={<Sparkles className="w-4 h-4 text-amber-500" />}
                      onClick={handleLoadSample}
                    >
                      ใช้ภาพตัวอย่าง (หาดใหญ่ใน)
                    </PillButton>
                  </div>

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    className="hidden"
                  />
                </div>
              )}
            </div>

            {/* Quick change file button if already loaded */}
            {imageSrc && (
              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <span>
                  ความละเอียดภาพ:{' '}
                  <strong className="text-slate-800">
                    {naturalSize?.width} × {naturalSize?.height} px
                  </strong>
                </span>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-blue-600 hover:text-blue-700 font-bold underline"
                >
                  เปลี่ยนภาพใหม่
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  className="hidden"
                />
              </div>
            )}
          </div>

          {/* Right Column: Parameters, Checklist & Results (5 cols) */}
          <div className="lg:col-span-5 flex flex-col space-y-5">
            
            {/* Step Checklist Card */}
            <div className="bg-slate-50/90 rounded-3xl p-5 border border-slate-200/80 space-y-4">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center justify-between">
                <span>ขั้นตอนการกำหนดสเกลเสา</span>
                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200/50">
                  Step-by-Step Guide
                </span>
              </h4>

              <div className="space-y-3">
                {/* 1. Upload */}
                <div className="flex items-start space-x-3 text-xs">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 font-black ${
                      imageSrc ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    1
                  </div>
                  <div className="flex-1">
                    <span className="font-extrabold text-slate-900 block">อัปโหลดภาพเสาวัดน้ำ</span>
                    <span className="text-slate-500 text-[11px]">
                      {imageFile ? `${imageFile.name} (${Math.round(imageFile.size / 1024)} KB)` : 'ยังไม่ได้เลือกไฟล์'}
                    </span>
                  </div>
                </div>

                {/* 2. Bounding Box */}
                <div className="flex items-start space-x-3 text-xs">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 font-black ${
                      bbox ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    2
                  </div>
                  <div className="flex-1">
                    <span className="font-extrabold text-slate-900 block">วาดกรอบเสา (Staff Gauge)</span>
                    <span className="text-slate-500 text-[11px]">
                      {bbox
                        ? `ตำแหน่ง [x:${bbox.x}, y:${bbox.y}, w:${bbox.width}, h:${bbox.height}]`
                        : 'คลิกลากเมาส์ครอบเฉพาะตัวเสาวัดน้ำ'}
                    </span>
                  </div>
                </div>

                {/* 3. High Point (Point 1) */}
                <div className="flex items-start space-x-3 text-xs">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 font-black ${
                      pointHigh ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    3
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-slate-900">จุดเทียบสเกลบน (P1)</span>
                      {pointHigh && (
                        <span className="text-[10px] text-blue-600 font-bold">
                          y: {pointHigh.y} px
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center space-x-2">
                      <span className="text-[11px] text-slate-500">ระดับจริง:</span>
                      <input
                        type="number"
                        step="0.01"
                        value={highMeter}
                        onChange={(e) => setHighMeter(parseFloat(e.target.value) || 0)}
                        className="w-20 px-2 py-0.5 text-xs font-bold bg-white rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="text-[11px] text-slate-500">ม.</span>
                    </div>
                  </div>
                </div>

                {/* 4. Low Point (Point 2) */}
                <div className="flex items-start space-x-3 text-xs">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 font-black ${
                      pointLow ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    4
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-slate-900">จุดเทียบสเกลล่าง (P2)</span>
                      {pointLow && (
                        <span className="text-[10px] text-amber-600 font-bold">
                          y: {pointLow.y} px
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center space-x-2">
                      <span className="text-[11px] text-slate-500">ระดับจริง:</span>
                      <input
                        type="number"
                        step="0.01"
                        value={lowMeter}
                        onChange={(e) => setLowMeter(parseFloat(e.target.value) || 0)}
                        className="w-20 px-2 py-0.5 text-xs font-bold bg-white rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                      <span className="text-[11px] text-slate-500">ม.</span>
                    </div>
                  </div>
                </div>

                {/* Station Note */}
                <div className="pt-2 border-t border-slate-200/60">
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    บันทึกสถานที่ / ข้อมูลเพิ่มเติม:
                  </label>
                  <input
                    type="text"
                    value={stationNote}
                    onChange={(e) => setStationNote(e.target.value)}
                    placeholder="เช่น สะพานท่าเคียน, เสาจุดวัดคลอง ร.1"
                    className="w-full px-3 py-1.5 text-xs bg-white rounded-xl border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              {/* Error Alert */}
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center space-x-2 text-xs text-rose-700 animate-shake">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Action Button */}
              <PillButton
                variant="primary"
                size="lg"
                className="w-full !rounded-2xl"
                loading={loading}
                disabled={!imageFile || !bbox || !pointHigh || !pointLow}
                onClick={handleCalculate}
                icon={<Calculator className="w-4 h-4" />}
              >
                {loading ? 'กำลังประมวลผล 1D Change Point...' : 'คำนวณระดับน้ำทันที'}
              </PillButton>
            </div>

            {/* Results Display Card */}
            {predictionResult && (
              <div className="bg-gradient-to-br from-blue-50 via-sky-50 to-emerald-50 rounded-3xl p-5 border border-blue-200 shadow-sm space-y-4 animate-fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-blue-900 flex items-center space-x-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>ผลการวิเคราะห์ระดับน้ำ AI</span>
                  </span>
                  <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    ความแม่นยำ {(predictionResult.confidence_score * 100).toFixed(1)}%
                  </span>
                </div>

                {/* Primary Water Level Hero Metric */}
                <div className="bg-white/90 backdrop-blur-md rounded-2xl p-4 border border-white/80 shadow-sm flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-500 font-bold block">ระดับน้ำที่คำนวณได้</span>
                    <div className="flex items-baseline space-x-1.5 mt-0.5">
                      <span className="text-3xl font-black text-slate-900 tracking-tight">
                        {predictionResult.calculated_water_level_m.toFixed(3)}
                      </span>
                      <span className="text-sm font-extrabold text-blue-600">ม. (รทก.)</span>
                    </div>
                  </div>

                  {predictionResult.scale_cm_per_pixel && (
                    <div className="text-right">
                      <span className="text-[11px] text-slate-500 font-semibold block">สเกลภาพ</span>
                      <span className="text-xs font-black text-slate-800">
                        {predictionResult.scale_cm_per_pixel.toFixed(2)} ซม./px
                      </span>
                    </div>
                  )}
                </div>

                {/* Staff Gauge Cropped Preview with detected waterline */}
                {predictionResult.preview_image_base64 && (
                  <div className="bg-white/80 rounded-2xl p-3 border border-white/80">
                    <span className="text-[11px] font-bold text-slate-700 block mb-2 flex items-center space-x-1">
                      <Crop className="w-3.5 h-3.5 text-blue-600" />
                      <span>ภาพเสาที่ Crop พร้อมเส้นระดับน้ำตรวจจับ (AI Waterline):</span>
                    </span>
                    <div className="flex items-center justify-center bg-slate-900 rounded-xl p-2 max-h-[160px] overflow-hidden">
                      <img
                        src={`data:image/jpeg;base64,${predictionResult.preview_image_base64}`}
                        alt="Cropped Staff Gauge Preview"
                        className="max-h-[145px] object-contain rounded border border-white/20"
                      />
                    </div>
                  </div>
                )}

                {/* Active Learning & Label Studio Sync Information */}
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-3.5 text-xs text-emerald-900 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5 font-extrabold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>MLOps Data Loop บันทึกสำเร็จ</span>
                    </div>
                    {predictionResult.label_studio_task_id && (
                      <span className="font-black px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px]">
                        Task #{predictionResult.label_studio_task_id}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-emerald-800 leading-relaxed">
                    ภาพและพิกัด Pre-annotations (RectangleLabels + KeypointLabels) ถูกบันทึกเข้าสู่ <strong>Label Studio (Project 2)</strong> และ MinIO เพื่อสะสมสำหรับ Retrain โมเดล
                  </p>

                  <div className="pt-1">
                    <a
                      href="http://localhost:8085"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1.5 text-xs font-black text-emerald-700 hover:text-emerald-900 underline group"
                    >
                      <span>เปิดตรวจสอบใน Label Studio</span>
                      <ExternalLink className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                    </a>
                  </div>
                </div>

              </div>
            )}

          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center space-x-2">
            <Info className="w-4 h-4 text-blue-500 shrink-0" />
            <span>
              พิกัดของเสาจะถูกแปลงเป็นเปอร์เซ็นต์ (0-100%) อัตโนมัติ เพื่อความแม่นยำสูงเมื่อเปิดใน Label Studio
            </span>
          </div>
          <PillButton variant="secondary" size="sm" onClick={onClose}>
            ปิด
          </PillButton>
        </div>

      </div>
    </div>
  );
};

export default OnDemandPredictorModal;

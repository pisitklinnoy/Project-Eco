import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Upload,
  Crop,
  Calculator,
  RotateCcw,
  X,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Sparkles,
  Info,
  FileImage,
  Flag,
  ZoomIn,
  ZoomOut,
  Move,
  Target,
  Check,
  Trash2,
  Edit3,
  ArrowRight,
} from 'lucide-react';
import { floodlensApi } from '../api/floodlensApi';
import type { OnDemandPredictResponse, Station } from '../types';
import { getStationFlagInfo } from './CameraViewer';
import { PillButton } from './ui/PillButton';
import { IconButton } from './ui/IconButton';

interface OnDemandPredictorModalProps {
  isOpen: boolean;
  onClose: () => void;
  station?: Station | null;
  onPredicted?: (result: OnDemandPredictResponse) => void;
}

interface NaturalBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface NaturalPoint {
  x: number;
  y: number;
}

type ActiveTool = 'bbox' | 'pin' | 'pan';
type PinTarget = 'p1' | 'p2' | 'water' | 'ready';
type ResizeHandle = 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w' | 'move';

export const OnDemandPredictorModal: React.FC<OnDemandPredictorModalProps> = ({
  isOpen,
  onClose,
  station,
  onPredicted,
}) => {
  // Image & File State
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

  // Active Tool: 'bbox' (Draw Staff Gauge) | 'pin' (Place P1, P2, Waterline) | 'pan' (Pan around)
  const [activeTool, setActiveTool] = useState<ActiveTool>('bbox');
  const [pinTarget, setPinTarget] = useState<PinTarget>('p1');
  const [useAiWaterline, setUseAiWaterline] = useState<boolean>(true);

  // Zoom & Pan State
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [spacePressed, setSpacePressed] = useState<boolean>(false);

  // Bounding Box in NATURAL IMAGE RESOLUTION (100% exact to image file)
  const [bbox, setBBox] = useState<NaturalBBox | null>(null);
  const [isDrawingBBox, setIsDrawingBBox] = useState<boolean>(false);
  const [drawStart, setDrawStart] = useState<NaturalPoint | null>(null);
  const [currentDragPos, setCurrentDragPos] = useState<NaturalPoint | null>(null);

  // Bounding Box Interactive Resizing & Dragging State
  const [activeResizeHandle, setActiveResizeHandle] = useState<ResizeHandle | null>(null);
  const [resizeStartBBox, setResizeStartBBox] = useState<NaturalBBox | null>(null);
  const [resizeStartPoint, setResizeStartPoint] = useState<NaturalPoint | null>(null);

  const handleClearBBox = () => {
    setBBox(null);
    setActiveTool('bbox');
  };

  const handleRedrawBBox = () => {
    setActiveTool('bbox');
  };

  // Calibration Keypoints in NATURAL IMAGE RESOLUTION
  const [pointHigh, setPointHigh] = useState<NaturalPoint | null>(null);
  const [pointLow, setPointLow] = useState<NaturalPoint | null>(null);
  const [pointWater, setPointWater] = useState<NaturalPoint | null>(null);

  // Scale Inputs (Meters)
  const [highMeter, setHighMeter] = useState<number>(1.00);
  const [lowMeter, setLowMeter] = useState<number>(0.50);
  const [stationNote, setStationNote] = useState<string>(
    station ? `${station.name} (ตรวจทานโดยมนุษย์)` : 'หาดใหญ่ใน (ตรวจทานโดยมนุษย์)'
  );

  // Processing & Result State
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [predictionResult, setPredictionResult] = useState<OnDemandPredictResponse | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Viewport Container Dimensions (for responsive letterbox-free fitting)
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 680,
    height: 460,
  });

  useEffect(() => {
    if (station) {
      setStationNote(`${station.name} (ตรวจทานโดยมนุษย์)`);
    }
  }, [station]);

  // Update container size on resize or open
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width > 50 && rect.height > 50) {
          setContainerSize({ width: rect.width, height: rect.height });
        }
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [isOpen]);

  // Fitted image dimensions without any letterbox bars
  const fittedImgSize = useMemo(() => {
    if (!naturalSize) return { width: 640, height: 440 };
    const maxW = Math.max(200, containerSize.width - 16);
    const maxH = Math.max(200, containerSize.height - 16);
    const scale = Math.min(maxW / naturalSize.width, maxH / naturalSize.height);
    return {
      width: Math.round(naturalSize.width * scale),
      height: Math.round(naturalSize.height * scale),
    };
  }, [naturalSize, containerSize]);

  // Spacebar pan and Delete/Backspace BBox listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !spacePressed) {
        setSpacePressed(true);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && activeTool === 'bbox') {
        const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (targetTag !== 'input' && targetTag !== 'textarea') {
          e.preventDefault();
          handleClearBBox();
        }
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
  }, [spacePressed, activeTool]);

  // Global mouse up to avoid stuck dragging / resizing states
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (activeResizeHandle) {
        setActiveResizeHandle(null);
        setResizeStartBBox(null);
        setResizeStartPoint(null);
      }
      if (isPanning) {
        setIsPanning(false);
      }
      if (isDrawingBBox) {
        setIsDrawingBBox(false);
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [activeResizeHandle, isPanning, isDrawingBBox]);

  // Native Non-Passive Wheel Event Listener for Smooth Mouse Wheel Zoom
  useEffect(() => {
    const containerEl = containerRef.current;
    if (!containerEl || !imageSrc) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const delta = e.deltaY > 0 ? -0.25 : 0.25;
      setZoomLevel((prev) => {
        const next = Math.min(Math.max(Number((prev + delta).toFixed(2)), 1.0), 5.0);
        if (next === 1.0) setPan({ x: 0, y: 0 });
        return next;
      });
    };

    containerEl.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => {
      containerEl.removeEventListener('wheel', handleNativeWheel);
    };
  }, [isOpen, imageSrc]);

  // แปลงพิกัด Mouse Event เป็น Original Image Resolution Pixels อย่างแม่นยำ 100%
  const getImageCoordinates = useCallback(
    (e: React.MouseEvent): NaturalPoint | null => {
      if (!imgRef.current || !naturalSize) return null;
      const rect = imgRef.current.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;

      // สัดส่วนจากขอบซ้าย/บนของภาพจริง (0.0 ถึง 1.0)
      const normX = (e.clientX - rect.left) / rect.width;
      const normY = (e.clientY - rect.top) / rect.height;

      const clampedNormX = Math.max(0, Math.min(1, normX));
      const clampedNormY = Math.max(0, Math.min(1, normY));

      return {
        x: Math.round(clampedNormX * naturalSize.width),
        y: Math.round(clampedNormY * naturalSize.height),
      };
    },
    [naturalSize]
  );

  // เริ่มต้นปรับขนาดหรือย้าย Bounding Box จาก Resize Handles หรือ Box Body
  const handleStartResize = (e: React.MouseEvent, handle: ResizeHandle) => {
    e.preventDefault();
    e.stopPropagation();
    if (!bbox) return;
    const pt = getImageCoordinates(e);
    if (!pt) return;
    setActiveResizeHandle(handle);
    setResizeStartBBox({ ...bbox });
    setResizeStartPoint(pt);
  };

  // Mouse Down Handler
  const handleMouseDown = (e: React.MouseEvent) => {
    // 1. Pan with Middle Button, Right Button, Spacebar, Shift, or Pan Tool
    if (e.button === 1 || e.button === 2 || spacePressed || activeTool === 'pan' || (zoomLevel > 1.0 && e.shiftKey)) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    if (e.button !== 0) return;

    const pt = getImageCoordinates(e);
    if (!pt) return;

    // 2. Mode: Draw Bounding Box (คลิกลากที่ว่างเพื่อวาดกรอบใหม่)
    if (activeTool === 'bbox') {
      setIsDrawingBBox(true);
      setDrawStart(pt);
      setCurrentDragPos(pt);
      return;
    }

    // 3. Mode: Pin Points (P1, P2, Waterline)
    if (activeTool === 'pin') {
      if (pinTarget === 'p1') {
        setPointHigh(pt);
        setPinTarget('p2');
      } else if (pinTarget === 'p2') {
        setPointLow(pt);
        setPinTarget('ready');
      } else if (pinTarget === 'water' || pinTarget === 'ready') {
        setPointWater(pt);
        setUseAiWaterline(false);
        setPinTarget('ready');
      }
    }
  };

  // Mouse Move Handler
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      e.preventDefault();
      const maxPan = (zoomLevel - 1) * 380;
      const newX = Math.max(Math.min(e.clientX - panStart.x, maxPan), -maxPan);
      const newY = Math.max(Math.min(e.clientY - panStart.y, maxPan), -maxPan);
      setPan({ x: newX, y: newY });
      return;
    }

    // 1. กำลังปรับขนาด หรือย้ายตำแหน่งกรอบ BBox
    if (activeResizeHandle && resizeStartBBox && resizeStartPoint && naturalSize) {
      e.preventDefault();
      const pt = getImageCoordinates(e);
      if (!pt) return;

      const dx = pt.x - resizeStartPoint.x;
      const dy = pt.y - resizeStartPoint.y;
      const { x, y, width, height } = resizeStartBBox;

      if (activeResizeHandle === 'move') {
        // ย้ายทั้งกล่อง
        const newX = Math.max(0, Math.min(naturalSize.width - width, x + dx));
        const newY = Math.max(0, Math.min(naturalSize.height - height, y + dy));
        setBBox({ x: Math.round(newX), y: Math.round(newY), width, height });
      } else {
        let newX1 = x;
        let newX2 = x + width;
        let newY1 = y;
        let newY2 = y + height;

        if (activeResizeHandle.includes('w')) {
          newX1 = Math.max(0, Math.min(newX2 - 15, x + dx));
        }
        if (activeResizeHandle.includes('e')) {
          newX2 = Math.min(naturalSize.width, Math.max(newX1 + 15, x + width + dx));
        }
        if (activeResizeHandle.includes('n')) {
          newY1 = Math.max(0, Math.min(newY2 - 25, y + dy));
        }
        if (activeResizeHandle.includes('s')) {
          newY2 = Math.min(naturalSize.height, Math.max(newY1 + 25, y + height + dy));
        }

        setBBox({
          x: Math.round(newX1),
          y: Math.round(newY1),
          width: Math.round(newX2 - newX1),
          height: Math.round(newY2 - newY1),
        });
      }
      return;
    }

    // 2. กำลังวาด BBox ใหม่
    if (isDrawingBBox && drawStart) {
      e.preventDefault();
      const pt = getImageCoordinates(e);
      if (pt) {
        setCurrentDragPos(pt);
      }
    }
  };

  // Mouse Up Handler
  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (activeResizeHandle) {
      setActiveResizeHandle(null);
      setResizeStartBBox(null);
      setResizeStartPoint(null);
      return;
    }

    if (isDrawingBBox && drawStart && currentDragPos) {
      setIsDrawingBBox(false);
      const x1 = Math.min(drawStart.x, currentDragPos.x);
      const x2 = Math.max(drawStart.x, currentDragPos.x);
      const y1 = Math.min(drawStart.y, currentDragPos.y);
      const y2 = Math.max(drawStart.y, currentDragPos.y);
      const w = x2 - x1;
      const h = y2 - y1;

      if (w >= 10 && h >= 20) {
        setBBox({ x: x1, y: y1, width: w, height: h });
        // คงอยู่ที่โหมด bbox ต่อ เพื่อให้ผู้ใช้สามารถปรับขนาด/ย้าย หรือกดถัดไปได้เมื่อพอใจ
      }
      setDrawStart(null);
      setCurrentDragPos(null);
    }
  };

  const activeBBox: NaturalBBox | null = isDrawingBBox && drawStart && currentDragPos
    ? {
        x: Math.min(drawStart.x, currentDragPos.x),
        y: Math.min(drawStart.y, currentDragPos.y),
        width: Math.abs(currentDragPos.x - drawStart.x),
        height: Math.abs(currentDragPos.y - drawStart.y),
      }
    : bbox;

  // Real-time cropped preview canvas on the right inspector (100% exact pixels)
  useEffect(() => {
    if (!activeBBox || !imgRef.current || !previewCanvasRef.current || !naturalSize) return;
    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = imgRef.current;
    const { x, y, width, height } = activeBBox;
    if (width <= 5 || height <= 10) return;

    // คำนวณความกว้าง/ความสูงของ Preview Canvas ตามสัดส่วนของตัวเสาจริง
    const aspect = width / height;
    canvas.height = 300;
    canvas.width = Math.max(80, Math.min(180, Math.round(300 * aspect)));

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    try {
      // ตัด Crop ตามพิกัดจริงของรูปภาพ (Natural Coordinates) ตรงเผง 100%
      ctx.drawImage(img, x, y, width, height, 0, 0, canvas.width, canvas.height);

      // เส้นระดับ P1
      if (pointHigh && pointHigh.y >= y && pointHigh.y <= y + height) {
        const py = ((pointHigh.y - y) / height) * canvas.height;
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(canvas.width, py);
        ctx.stroke();
      }

      // เส้นระดับ P2
      if (pointLow && pointLow.y >= y && pointLow.y <= y + height) {
        const py = ((pointLow.y - y) / height) * canvas.height;
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(canvas.width, py);
        ctx.stroke();
      }

      // เส้นระดับผิวน้ำที่ผู้ใช้ระบุ
      if (pointWater && !useAiWaterline && pointWater.y >= y && pointWater.y <= y + height) {
        const py = ((pointWater.y - y) / height) * canvas.height;
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 3]);
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(canvas.width, py);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    } catch {
      // Ignore if image not ready
    }
  }, [activeBBox, pointHigh, pointLow, pointWater, useAiWaterline, naturalSize]);

  // Real-time Water Level calculation
  const instantWaterLevel = useMemo(() => {
    if (!pointHigh || !pointLow || !pointWater) return null;
    const dy = pointLow.y - pointHigh.y;
    if (Math.abs(dy) < 1e-4) return null;
    const dm = highMeter - lowMeter;
    const level = highMeter - ((pointWater.y - pointHigh.y) / dy) * dm;
    return Number(level.toFixed(3));
  }, [pointHigh, pointLow, pointWater, highMeter, lowMeter]);

  if (!isOpen) return null;

  // Load File
  const loadFile = (file: File) => {
    setImageFile(file);
    setPredictionResult(null);
    setErrorMsg(null);
    setPointHigh(null);
    setPointLow(null);
    setPointWater(null);
    setBBox(null);
    setUseAiWaterline(true);
    setPinTarget('p1');
    setActiveTool('bbox');
    setZoomLevel(1.0);
    setPan({ x: 0, y: 0 });

    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      setImageSrc(src);
      const img = new Image();
      img.src = src;
      img.onload = () => {
        setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
        // ตั้งกรอบ BBox เริ่มต้นตรงกลางเสาอย่างพอดี
        const bw = Math.round(img.naturalWidth * 0.16);
        const bh = Math.round(img.naturalHeight * 0.72);
        const bx = Math.round((img.naturalWidth - bw) / 2);
        const by = Math.round(img.naturalHeight * 0.14);
        setBBox({ x: bx, y: by, width: bw, height: bh });
      };
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      loadFile(e.target.files[0]);
    }
  };

  // Sample Hatyai Nai Image
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

  // Reset Points
  const handleResetPoints = () => {
    setPointHigh(null);
    setPointLow(null);
    setPointWater(null);
    setPredictionResult(null);
    setErrorMsg(null);
    setUseAiWaterline(true);
    setPinTarget('p1');
  };

  // Submit to Backend API and Sync with Label Studio
  const handleCalculate = async () => {
    if (!imageFile) {
      setErrorMsg('กรุณาอัปโหลดภาพเสาวัดน้ำก่อน');
      return;
    }
    if (!bbox) {
      setErrorMsg('กรุณาวาดกรอบเสา (Bounding Box) ก่อน');
      return;
    }
    if (!pointHigh) {
      setErrorMsg('กรุณาคลิกเลือกจุดขีดตัวเลขบนเสา (P1)');
      return;
    }
    if (!pointLow) {
      setErrorMsg('กรุณาคลิกเลือกจุดขีดตัวเลขล่างเสา (P2)');
      return;
    }
    if (highMeter <= lowMeter) {
      setErrorMsg('ค่าความสูงขีดบน (P1) ต้องมากกว่าขีดล่าง (P2)');
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

      if (pointWater && !useAiWaterline) {
        formData.append(
          'point_water',
          JSON.stringify({
            x: pointWater.x,
            y: pointWater.y,
            actual_meter: instantWaterLevel ?? 0,
          })
        );
      }

      if (station?.station_code) {
        formData.append('station_code', station.station_code);
      }
      formData.append('station_note', stationNote);

      const res = await floodlensApi.predictCustomImage(formData);
      setPredictionResult(res);
      if (onPredicted) {
        onPredicted(res);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'เกิดข้อผิดพลาดในการคำนวณระดับน้ำ');
    } finally {
      setLoading(false);
    }
  };

  const displayWaterLevel = predictionResult
    ? predictionResult.calculated_water_level_m
    : instantWaterLevel;

  // SVG Annotation Sizes scaled with Natural Image Resolution
  const naturalW = naturalSize?.width || 1000;
  const strokeW = Math.max(3, Math.round(naturalW / 350));
  const pinRadius = Math.max(8, Math.round(naturalW / 100));
  const fontSize = Math.max(14, Math.round(naturalW / 70));
  const handleSize = Math.max(14, Math.round(naturalW / 65));
  const handleHalf = handleSize / 2;
  const handleRadius = Math.max(8, Math.round(naturalW / 110));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/75 backdrop-blur-xl animate-fade-in overflow-y-auto">
      <div className="bg-white/95 backdrop-blur-2xl border border-white/80 rounded-[32px] sm:rounded-[36px] w-full max-w-6xl max-h-[94vh] overflow-hidden flex flex-col shadow-2xl my-auto">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50/90 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-500 to-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                  ระบบตรวจทานระดับน้ำและเชื่อมต่อ Label Studio
                </h3>
                <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  พิกัดแม่นยำ 100% (Pixel-Perfect)
                </span>
              </div>
              <p className="text-xs text-slate-500">
                วาดกรอบเสา (BBox) ซูมดูขีดตัวเลขบนเสาได้อย่างคมชัด และส่งเข้า Label Studio เพื่อใช้เทรน AI
              </p>
            </div>
          </div>

          <IconButton onClick={onClose} tooltip="ปิดหน้าต่าง" size="md">
            <X className="w-4 h-4 text-slate-500" />
          </IconButton>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: Interactive Zoom Canvas (7 cols) */}
          <div className="lg:col-span-7 flex flex-col space-y-3">
            
            {/* Toolbar: Tool Selector & Zoom Controls */}
            <div className="bg-slate-900 text-white p-2.5 rounded-2xl shadow flex flex-wrap items-center justify-between gap-2 border border-slate-800">
              
              {/* Tool Mode Buttons */}
              <div className="flex items-center space-x-1.5">
                <button
                  type="button"
                  onClick={() => setActiveTool('bbox')}
                  disabled={!imageSrc}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center space-x-1.5 transition-all ${
                    activeTool === 'bbox'
                      ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-400/40'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  } disabled:opacity-40 cursor-pointer`}
                >
                  <Crop className="w-3.5 h-3.5" />
                  <span>1. ตีกรอบเสา (BBox)</span>
                  {bbox && <Check className="w-3 h-3 text-emerald-300 ml-0.5" />}
                </button>

                {bbox && (
                  <button
                    type="button"
                    onClick={handleClearBBox}
                    className="px-2 py-1.5 rounded-xl text-xs font-bold text-rose-300 hover:text-white bg-rose-950/40 hover:bg-rose-900/80 border border-rose-800/60 transition-all flex items-center space-x-1 cursor-pointer"
                    title="ลบกรอบเสาเพื่อวาดใหม่"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    <span className="text-[11px]">ลบกรอบ</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setActiveTool('pin')}
                  disabled={!imageSrc}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center space-x-1.5 transition-all ${
                    activeTool === 'pin'
                      ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-400/40'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  } disabled:opacity-40 cursor-pointer`}
                >
                  <Target className="w-3.5 h-3.5" />
                  <span>2. ปักหมุดสเกล (P1/P2)</span>
                  {pointHigh && pointLow && <Check className="w-3 h-3 text-blue-300 ml-0.5" />}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTool('pan')}
                  disabled={!imageSrc}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1 transition-all ${
                    activeTool === 'pan'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  } disabled:opacity-40 cursor-pointer`}
                  title="คลิกลากเพื่อเลื่อนดูมุมต่างๆ ของภาพ"
                >
                  <Move className="w-3.5 h-3.5" />
                  <span>แพนภาพ</span>
                </button>
              </div>

              {/* Zoom Controls & Percentage */}
              <div className="flex items-center space-x-1 bg-slate-800/90 px-2 py-1 rounded-xl border border-slate-700">
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.max(1.0, Number((z - 0.3).toFixed(1))))}
                  disabled={!imageSrc || zoomLevel <= 1.0}
                  className="p-1 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg disabled:opacity-30 transition-all cursor-pointer"
                  title="ซูมออก (-)"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>

                <span className="text-[11px] font-black w-12 text-center text-sky-400 select-none">
                  {Math.round(zoomLevel * 100)}%
                </span>

                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.min(5.0, Number((z + 0.3).toFixed(1))))}
                  disabled={!imageSrc || zoomLevel >= 5.0}
                  className="p-1 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg disabled:opacity-30 transition-all cursor-pointer"
                  title="ซูมเข้า (+)"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>

                {zoomLevel > 1.0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setZoomLevel(1.0);
                      setPan({ x: 0, y: 0 });
                    }}
                    className="p-1 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-all ml-1 cursor-pointer"
                    title="รีเซ็ตการซูม (100%)"
                  >
                    <RotateCcw className="w-3 h-3 text-amber-400" />
                  </button>
                )}
              </div>

            </div>

            {/* Instruction Guidance Bar */}
            <div className="bg-slate-100 border border-slate-200/80 rounded-2xl px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center space-x-2 text-slate-700">
                <Info className="w-4 h-4 text-blue-500 shrink-0" />
                <span>
                  {activeTool === 'bbox'
                    ? bbox
                      ? '🎯 ลากมุม/ขอบของกรอบสีเขียวเพื่อปรับขนาด, ลากในกรอบเพื่อย้าย, หรือคลิกลากที่ว่างเพื่อวาดใหม่'
                      : 'โหมดวาดกรอบ: คลิกลากครอบตัวเสา (หมุนลูกกลิ้งเมาส์เพื่อซูมดูใกล้ๆ ได้)'
                    : !pointHigh
                    ? '👉 คลิกขีดตัวเลขบนเสา (P1 เช่น 1.00 ม.)'
                    : !pointLow
                    ? '👉 คลิกขีดตัวเลขล่างเสา (P2 เช่น 0.50 ม.)'
                    : pointWater
                    ? '✅ ปักหมุดครบแล้ว พร้อมส่งผลเข้า Label Studio'
                    : '✨ ปักหมุด P1 และ P2 เรียบร้อยแล้ว พร้อมคำนวณระดับน้ำ'}
                </span>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                {activeTool === 'bbox' && bbox && (
                  <>
                    <button
                      type="button"
                      onClick={handleClearBBox}
                      className="px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-100/70 rounded-lg transition-colors flex items-center space-x-1 cursor-pointer"
                      title="ลบกรอบเสา (หรือกดปุ่ม Delete/Backspace)"
                    >
                      <Trash2 className="w-3 h-3 text-rose-500" />
                      <span>ลบกรอบ</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTool('pin')}
                      className="px-2.5 py-1 text-[11px] font-black text-blue-700 bg-blue-100/80 hover:bg-blue-200 rounded-lg transition-colors flex items-center space-x-1 cursor-pointer"
                    >
                      <span>ถัดไป: ปักหมุดสเกล</span>
                      <ArrowRight className="w-3 h-3 ml-0.5" />
                    </button>
                  </>
                )}

                {activeTool === 'pin' && bbox && (
                  <button
                    type="button"
                    onClick={() => setActiveTool('bbox')}
                    className="px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100/70 rounded-lg transition-colors flex items-center space-x-1 cursor-pointer"
                  >
                    <Edit3 className="w-3 h-3 text-emerald-600" />
                    <span>ปรับกรอบ BBox</span>
                  </button>
                )}

                {(pointHigh || pointLow || pointWater) && (
                  <button
                    type="button"
                    onClick={handleResetPoints}
                    className="px-2.5 py-1 text-[11px] font-bold text-slate-500 hover:text-rose-600 hover:bg-slate-200/50 rounded-lg transition-colors cursor-pointer"
                  >
                    ล้างหมุด
                  </button>
                )}
              </div>
            </div>

            {/* Canvas Viewport Container with Native Wheel Zoom & Pan */}
            <div
              ref={containerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onContextMenu={(e) => e.preventDefault()}
              className={`relative min-h-[400px] sm:min-h-[460px] bg-slate-950 rounded-3xl overflow-hidden flex items-center justify-center border border-slate-800 shadow-inner select-none touch-none overscroll-contain ${
                spacePressed || isPanning || activeTool === 'pan'
                  ? 'cursor-grab active:cursor-grabbing'
                  : 'cursor-crosshair'
              }`}
            >
              {imageSrc && naturalSize ? (
                <div
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomLevel})`,
                    transformOrigin: 'center center',
                    width: `${fittedImgSize.width}px`,
                    height: `${fittedImgSize.height}px`,
                  }}
                  className="relative shrink-0 flex items-center justify-center transition-transform duration-75 ease-out"
                >
                  {/* Main Image Layer (Fitted with zero letterboxing) */}
                  <img
                    ref={imgRef}
                    src={imageSrc}
                    alt="Staff Gauge Inspection"
                    draggable={false}
                    style={{
                      width: `${fittedImgSize.width}px`,
                      height: `${fittedImgSize.height}px`,
                    }}
                    className="block w-full h-full object-fill pointer-events-auto select-none"
                  />

                  {/* SVG Annotation Layer - viewBox is 100% natural resolution! */}
                  <svg
                    viewBox={`0 0 ${naturalSize.width} ${naturalSize.height}`}
                    className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
                  >
                    {/* Bounding Box Drawing / Fixed */}
                    {activeBBox && (
                      <g>
                        {/* Box Body (Draggable when in BBox mode) */}
                        <rect
                          x={activeBBox.x}
                          y={activeBBox.y}
                          width={activeBBox.width}
                          height={activeBBox.height}
                          fill="rgba(16, 185, 129, 0.15)"
                          stroke="#10b981"
                          strokeWidth={strokeW}
                          strokeDasharray={isDrawingBBox ? '8,4' : 'none'}
                          style={{
                            pointerEvents: activeTool === 'bbox' && !isDrawingBBox ? 'all' : 'none',
                            cursor: 'move',
                          }}
                          onMouseDown={(e) => activeTool === 'bbox' && !isDrawingBBox && handleStartResize(e, 'move')}
                        />

                        {/* Label Badge */}
                        <rect
                          x={activeBBox.x}
                          y={Math.max(0, activeBBox.y - fontSize * 1.5)}
                          width={fontSize * 8.5}
                          height={fontSize * 1.4}
                          fill="rgba(15, 23, 42, 0.90)"
                          rx={fontSize * 0.3}
                        />
                        <text
                          x={activeBBox.x + fontSize * 0.4}
                          y={Math.max(fontSize * 1.1, activeBBox.y - fontSize * 0.4)}
                          fill="#34d399"
                          fontSize={fontSize}
                          fontWeight="bold"
                        >
                          Staff Gauge BBox {activeTool === 'bbox' ? '(ปรับขนาดได้)' : ''}
                        </text>

                        {/* Interactive Resize Handles (Shown in BBox Mode) */}
                        {activeTool === 'bbox' && !isDrawingBBox && bbox && (
                          <g>
                            {/* 4 Corner Handles */}
                            {/* NW - Top Left */}
                            <rect
                              x={bbox.x - handleHalf}
                              y={bbox.y - handleHalf}
                              width={handleSize}
                              height={handleSize}
                              fill="#ffffff"
                              stroke="#059669"
                              strokeWidth={strokeW * 0.8}
                              rx={handleSize * 0.25}
                              style={{ pointerEvents: 'all', cursor: 'nwse-resize' }}
                              onMouseDown={(e) => handleStartResize(e, 'nw')}
                            />
                            {/* NE - Top Right */}
                            <rect
                              x={bbox.x + bbox.width - handleHalf}
                              y={bbox.y - handleHalf}
                              width={handleSize}
                              height={handleSize}
                              fill="#ffffff"
                              stroke="#059669"
                              strokeWidth={strokeW * 0.8}
                              rx={handleSize * 0.25}
                              style={{ pointerEvents: 'all', cursor: 'nesw-resize' }}
                              onMouseDown={(e) => handleStartResize(e, 'ne')}
                            />
                            {/* SE - Bottom Right */}
                            <rect
                              x={bbox.x + bbox.width - handleHalf}
                              y={bbox.y + bbox.height - handleHalf}
                              width={handleSize}
                              height={handleSize}
                              fill="#ffffff"
                              stroke="#059669"
                              strokeWidth={strokeW * 0.8}
                              rx={handleSize * 0.25}
                              style={{ pointerEvents: 'all', cursor: 'nwse-resize' }}
                              onMouseDown={(e) => handleStartResize(e, 'se')}
                            />
                            {/* SW - Bottom Left */}
                            <rect
                              x={bbox.x - handleHalf}
                              y={bbox.y + bbox.height - handleHalf}
                              width={handleSize}
                              height={handleSize}
                              fill="#ffffff"
                              stroke="#059669"
                              strokeWidth={strokeW * 0.8}
                              rx={handleSize * 0.25}
                              style={{ pointerEvents: 'all', cursor: 'nesw-resize' }}
                              onMouseDown={(e) => handleStartResize(e, 'sw')}
                            />

                            {/* 4 Edge Midpoint Handles */}
                            {/* N - Top Center */}
                            <circle
                              cx={bbox.x + bbox.width / 2}
                              cy={bbox.y}
                              r={handleRadius}
                              fill="#ffffff"
                              stroke="#059669"
                              strokeWidth={strokeW * 0.8}
                              style={{ pointerEvents: 'all', cursor: 'ns-resize' }}
                              onMouseDown={(e) => handleStartResize(e, 'n')}
                            />
                            {/* S - Bottom Center */}
                            <circle
                              cx={bbox.x + bbox.width / 2}
                              cy={bbox.y + bbox.height}
                              r={handleRadius}
                              fill="#ffffff"
                              stroke="#059669"
                              strokeWidth={strokeW * 0.8}
                              style={{ pointerEvents: 'all', cursor: 'ns-resize' }}
                              onMouseDown={(e) => handleStartResize(e, 's')}
                            />
                            {/* W - Left Center */}
                            <circle
                              cx={bbox.x}
                              cy={bbox.y + bbox.height / 2}
                              r={handleRadius}
                              fill="#ffffff"
                              stroke="#059669"
                              strokeWidth={strokeW * 0.8}
                              style={{ pointerEvents: 'all', cursor: 'ew-resize' }}
                              onMouseDown={(e) => handleStartResize(e, 'w')}
                            />
                            {/* E - Right Center */}
                            <circle
                              cx={bbox.x + bbox.width}
                              cy={bbox.y + bbox.height / 2}
                              r={handleRadius}
                              fill="#ffffff"
                              stroke="#059669"
                              strokeWidth={strokeW * 0.8}
                              style={{ pointerEvents: 'all', cursor: 'ew-resize' }}
                              onMouseDown={(e) => handleStartResize(e, 'e')}
                            />
                          </g>
                        )}
                      </g>
                    )}

                    {/* Point High (P1) */}
                    {pointHigh && (
                      <g>
                        {activeBBox && (
                          <line
                            x1={activeBBox.x - strokeW * 4}
                            y1={pointHigh.y}
                            x2={activeBBox.x + activeBBox.width + strokeW * 4}
                            y2={pointHigh.y}
                            stroke="#2563eb"
                            strokeWidth={strokeW * 0.9}
                          />
                        )}
                        <circle
                          cx={pointHigh.x}
                          cy={pointHigh.y}
                          r={pinRadius}
                          fill="#2563eb"
                          stroke="#ffffff"
                          strokeWidth={strokeW * 0.8}
                        />
                        <rect
                          x={pointHigh.x + pinRadius * 1.2}
                          y={pointHigh.y - fontSize * 0.9}
                          width={fontSize * 7}
                          height={fontSize * 1.3}
                          fill="rgba(15, 23, 42, 0.90)"
                          rx={fontSize * 0.25}
                        />
                        <text
                          x={pointHigh.x + pinRadius * 1.5}
                          y={pointHigh.y + fontSize * 0.05}
                          fill="#60a5fa"
                          fontSize={fontSize * 0.85}
                          fontWeight="bold"
                        >
                          P1: {highMeter.toFixed(2)} ม.
                        </text>
                      </g>
                    )}

                    {/* Point Low (P2) */}
                    {pointLow && (
                      <g>
                        {activeBBox && (
                          <line
                            x1={activeBBox.x - strokeW * 4}
                            y1={pointLow.y}
                            x2={activeBBox.x + activeBBox.width + strokeW * 4}
                            y2={pointLow.y}
                            stroke="#f59e0b"
                            strokeWidth={strokeW * 0.9}
                          />
                        )}
                        <circle
                          cx={pointLow.x}
                          cy={pointLow.y}
                          r={pinRadius}
                          fill="#f59e0b"
                          stroke="#ffffff"
                          strokeWidth={strokeW * 0.8}
                        />
                        <rect
                          x={pointLow.x + pinRadius * 1.2}
                          y={pointLow.y - fontSize * 0.9}
                          width={fontSize * 7}
                          height={fontSize * 1.3}
                          fill="rgba(15, 23, 42, 0.90)"
                          rx={fontSize * 0.25}
                        />
                        <text
                          x={pointLow.x + pinRadius * 1.5}
                          y={pointLow.y + fontSize * 0.05}
                          fill="#fbbf24"
                          fontSize={fontSize * 0.85}
                          fontWeight="bold"
                        >
                          P2: {lowMeter.toFixed(2)} ม.
                        </text>
                      </g>
                    )}

                    {/* Point Waterline */}
                    {pointWater && !useAiWaterline && (
                      <g>
                        <line
                          x1={activeBBox ? activeBBox.x - strokeW * 6 : 0}
                          y1={pointWater.y}
                          x2={activeBBox ? activeBBox.x + activeBBox.width + strokeW * 6 : naturalSize.width}
                          y2={pointWater.y}
                          stroke="#f97316"
                          strokeWidth={strokeW * 1.1}
                          strokeDasharray="8,4"
                        />
                        <circle
                          cx={pointWater.x}
                          cy={pointWater.y}
                          r={pinRadius}
                          fill="#f97316"
                          stroke="#ffffff"
                          strokeWidth={strokeW * 0.8}
                        />
                        <rect
                          x={pointWater.x + pinRadius * 1.2}
                          y={pointWater.y - fontSize * 0.9}
                          width={fontSize * 8}
                          height={fontSize * 1.3}
                          fill="rgba(234, 88, 12, 0.95)"
                          rx={fontSize * 0.25}
                        />
                        <text
                          x={pointWater.x + pinRadius * 1.5}
                          y={pointWater.y + fontSize * 0.05}
                          fill="#ffffff"
                          fontSize={fontSize * 0.85}
                          fontWeight="bold"
                        >
                          ผิวน้ำ: {instantWaterLevel !== null ? `${instantWaterLevel.toFixed(2)} ม.` : 'ระบุแล้ว'}
                        </text>
                      </g>
                    )}

                    {/* AI Waterline from Backend Prediction */}
                    {predictionResult && predictionResult.pixel_water_y_original && useAiWaterline && (
                      <g>
                        <line
                          x1={activeBBox ? activeBBox.x - strokeW * 6 : 0}
                          y1={predictionResult.pixel_water_y_original}
                          x2={activeBBox ? activeBBox.x + activeBBox.width + strokeW * 6 : naturalSize.width}
                          y2={predictionResult.pixel_water_y_original}
                          stroke="#10b981"
                          strokeWidth={strokeW * 1.1}
                          strokeDasharray="10,5"
                        />
                        <rect
                          x={activeBBox ? activeBBox.x : 20}
                          y={predictionResult.pixel_water_y_original + strokeW * 2}
                          width={fontSize * 9}
                          height={fontSize * 1.3}
                          fill="#059669"
                          rx={fontSize * 0.25}
                        />
                        <text
                          x={(activeBBox ? activeBBox.x : 20) + fontSize * 0.4}
                          y={predictionResult.pixel_water_y_original + fontSize * 1.1}
                          fill="#ffffff"
                          fontSize={fontSize * 0.85}
                          fontWeight="bold"
                        >
                          AI ผิวน้ำ: {predictionResult.calculated_water_level_m.toFixed(2)} ม.
                        </text>
                      </g>
                    )}
                  </svg>
                </div>
              ) : (
                <div className="p-8 text-center flex flex-col items-center space-y-4 max-w-md">
                  <div className="w-16 h-16 rounded-3xl bg-slate-800/80 text-blue-400 flex items-center justify-center border border-slate-700 shadow-inner">
                    <FileImage className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="text-white font-extrabold text-base">
                      อัปโหลดภาพถ่ายเสาวัดน้ำ
                    </h4>
                    <p className="text-xs text-slate-400 mt-1">
                      รองรับไฟล์ภาพ JPG, PNG จากกล้องมือถือ หรือ CCTV ภาคสนาม
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-3 pt-2 w-full justify-center">
                    <PillButton
                      variant="primary"
                      icon={<Upload className="w-4 h-4" />}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      เลือกภาพจากเครื่อง
                    </PillButton>

                    <PillButton
                      variant="glass"
                      icon={<Sparkles className="w-4 h-4 text-amber-400" />}
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

              {/* Floating Mouse Controls Hint */}
              {imageSrc && (
                <div className="absolute bottom-3 right-3 bg-slate-900/85 backdrop-blur-md text-white text-[10px] font-semibold px-2.5 py-1 rounded-full border border-white/20 shadow pointer-events-none">
                  {activeTool === 'bbox'
                    ? '💡 หมุนลูกกลิ้งเมาส์เพื่อซูม | ลากมุม/ขอบเพื่อปรับขนาด หรือกดปุ่ม Delete/ลบกรอบ'
                    : '💡 หมุนลูกกลิ้งเมาส์เพื่อซูม | ลากเมาส์ขวาเพื่อเลื่อนภาพ'}
                </div>
              )}

              {/* Live Estimated Water Level */}
              {instantWaterLevel !== null && !predictionResult && (
                <div className="absolute bottom-3 left-3 bg-slate-900/85 backdrop-blur-md text-white text-[11px] font-semibold px-3 py-1.5 rounded-full border border-orange-500/40 shadow flex items-center space-x-1.5 pointer-events-none">
                  <span className="w-2 h-2 rounded-full bg-orange-400 animate-ping" />
                  <span>ระดับน้ำประมาณการ: <strong>{instantWaterLevel.toFixed(3)} ม.</strong></span>
                </div>
              )}
            </div>

            {/* Resolution Information */}
            {imageSrc && (
              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <span>
                  ความละเอียดภาพ: <strong className="text-slate-800">{naturalSize?.width} × {naturalSize?.height} px</strong>
                  {bbox && (
                    <span className="ml-2 text-emerald-700 font-bold">
                      | กรอบเสาจริง: {Math.round(bbox.width)} × {Math.round(bbox.height)} px (x: {Math.round(bbox.x)}, y: {Math.round(bbox.y)})
                    </span>
                  )}
                </span>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-blue-600 hover:text-blue-700 font-bold underline cursor-pointer"
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

          {/* Right Column: Parameters, Pin Cards & Cropped Gauge Preview (5 cols) */}
          <div className="lg:col-span-5 flex flex-col space-y-4">
            
            {/* Step Guidance Card */}
            <div className="bg-slate-50/90 rounded-3xl p-5 border border-slate-200/80 space-y-3.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center space-x-1.5">
                  <Target className="w-3.5 h-3.5 text-blue-600" />
                  <span>จุดสเกลอ้างอิงบนเสา</span>
                </h4>
                <span className="text-[10px] font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200/50">
                  Label Studio Sync
                </span>
              </div>

              {/* Pin 1: High Point Card */}
              <div
                onClick={() => {
                  setActiveTool('pin');
                  setPinTarget('p1');
                }}
                className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                  activeTool === 'pin' && pinTarget === 'p1'
                    ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-400/20'
                    : pointHigh
                    ? 'bg-white border-blue-200'
                    : 'bg-white/60 border-slate-200 hover:bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-black flex items-center justify-center">
                      1
                    </span>
                    <span className="text-xs font-extrabold text-slate-900">
                      จุดขีดตัวเลขบน (P1)
                    </span>
                  </div>
                  {pointHigh ? (
                    <span className="text-[11px] font-bold text-blue-600 flex items-center space-x-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>ปักหมุดแล้ว (y: {pointHigh.y})</span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400">คลิกบนภาพ</span>
                  )}
                </div>

                <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-slate-100">
                  <span className="text-[11px] text-slate-500">ตัวเลขขีดจริงบนเสา:</span>
                  <div className="flex items-center space-x-1.5">
                    <input
                      type="number"
                      step="0.05"
                      value={highMeter}
                      onChange={(e) => setHighMeter(parseFloat(e.target.value) || 0)}
                      className="w-20 px-2 py-1 text-xs font-bold bg-white rounded-lg border border-slate-300 text-slate-900 text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="text-xs font-bold text-slate-600">ม.</span>
                  </div>
                </div>
              </div>

              {/* Pin 2: Low Point Card */}
              <div
                onClick={() => {
                  setActiveTool('pin');
                  setPinTarget('p2');
                }}
                className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                  activeTool === 'pin' && pinTarget === 'p2'
                    ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-400/20'
                    : pointLow
                    ? 'bg-white border-amber-200'
                    : 'bg-white/60 border-slate-200 hover:bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[11px] font-black flex items-center justify-center">
                      2
                    </span>
                    <span className="text-xs font-extrabold text-slate-900">
                      จุดขีดตัวเลขล่าง (P2)
                    </span>
                  </div>
                  {pointLow ? (
                    <span className="text-[11px] font-bold text-amber-600 flex items-center space-x-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>ปักหมุดแล้ว (y: {pointLow.y})</span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400">คลิกบนภาพ</span>
                  )}
                </div>

                <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-slate-100">
                  <span className="text-[11px] text-slate-500">ตัวเลขขีดจริงบนเสา:</span>
                  <div className="flex items-center space-x-1.5">
                    <input
                      type="number"
                      step="0.05"
                      value={lowMeter}
                      onChange={(e) => setLowMeter(parseFloat(e.target.value) || 0)}
                      className="w-20 px-2 py-1 text-xs font-bold bg-white rounded-lg border border-slate-300 text-slate-900 text-right focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    <span className="text-xs font-bold text-slate-600">ม.</span>
                  </div>
                </div>
              </div>

              {/* Pin 3: Waterline Card (Optional) */}
              <div
                onClick={() => {
                  setActiveTool('pin');
                  setPinTarget('water');
                  setUseAiWaterline(false);
                }}
                className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                  activeTool === 'pin' && pinTarget === 'water' && !useAiWaterline
                    ? 'bg-orange-50 border-orange-400 ring-2 ring-orange-400/20'
                    : pointWater && !useAiWaterline
                    ? 'bg-white border-orange-200'
                    : 'bg-white/60 border-slate-200 hover:bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-5 h-5 rounded-full bg-slate-700 text-white text-[11px] font-black flex items-center justify-center">
                      3
                    </span>
                    <div>
                      <span className="text-xs font-extrabold text-slate-900 block">
                        ระบุผิวน้ำด้วยตนเอง
                      </span>
                      <span className="text-[10px] text-slate-400 font-semibold">
                        (ทางเลือกเสริม - หากไม่ระบุ Image Processing จะหาให้)
                      </span>
                    </div>
                  </div>
                  {pointWater && !useAiWaterline ? (
                    <span className="text-[11px] font-bold text-orange-600 flex items-center space-x-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>ระบุแล้ว (y: {pointWater.y})</span>
                    </span>
                  ) : (
                    <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      อัตโนมัติโดย AI
                    </span>
                  )}
                </div>

                {pointWater && (
                  <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">ผิวน้ำที่ระบุ: {instantWaterLevel !== null ? `${instantWaterLevel.toFixed(2)} ม.` : ''}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPointWater(null);
                        setUseAiWaterline(true);
                      }}
                      className="text-[11px] text-rose-500 hover:text-rose-700 font-bold cursor-pointer"
                    >
                      ยกเลิกจุด (กลับไปใช้ AI)
                    </button>
                  </div>
                )}
              </div>

              {/* Station Note */}
              <div className="pt-1">
                <label className="text-[11px] font-bold text-slate-600 block mb-1">
                  สถานที่ / รายละเอียดเพิ่มเติม:
                </label>
                <input
                  type="text"
                  value={stationNote}
                  onChange={(e) => setStationNote(e.target.value)}
                  placeholder="เช่น สะพานท่าเคียน, เสาคลอง ร.1"
                  className="w-full px-3 py-1.5 text-xs bg-white rounded-xl border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              {/* Error Alert */}
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center space-x-2 text-xs text-rose-700">
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
                {loading
                  ? 'กำลังประมวลผลและส่งเข้า Label Studio...'
                  : 'บันทึกและส่งตรวจทานเข้า Label Studio'}
              </PillButton>
            </div>

            {/* Cropped Staff Gauge Inspector Preview (100% Match) */}
            {bbox && (
              <div className="bg-slate-50/90 rounded-3xl p-4 border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-extrabold text-slate-700 flex items-center space-x-1.5">
                    <Crop className="w-3.5 h-3.5 text-emerald-600" />
                    <span>ภาพขยายตัวเสาที่ตีกรอบ (Cropped Staff Gauge)</span>
                  </span>
                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      onClick={handleRedrawBBox}
                      className="px-2 py-0.5 text-[11px] font-bold text-slate-600 hover:text-emerald-700 bg-white hover:bg-emerald-50 border border-slate-200 rounded-lg transition-all flex items-center space-x-1 cursor-pointer"
                      title="สลับไปโหมดปรับขนาดหรือวาดกรอบใหม่"
                    >
                      <Edit3 className="w-3 h-3 text-emerald-600" />
                      <span>ปรับกรอบ</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleClearBBox}
                      className="px-2 py-0.5 text-[11px] font-bold text-rose-600 hover:text-rose-700 bg-white hover:bg-rose-50 border border-slate-200 rounded-lg transition-all flex items-center space-x-1 cursor-pointer"
                      title="ลบกรอบเสานี้เพื่อวาดใหม่ทั้งหมด"
                    >
                      <Trash2 className="w-3 h-3 text-rose-500" />
                      <span>ลบกรอบ</span>
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-center bg-slate-950 rounded-2xl p-2.5 max-h-[190px] overflow-hidden border border-slate-800">
                  <canvas
                    ref={previewCanvasRef}
                    className="max-h-[170px] object-contain rounded-lg shadow border border-slate-700"
                  />
                </div>
              </div>
            )}

            {/* Instant Real-Time & Final Results Display Card */}
            {displayWaterLevel !== null && (
              <div className="bg-gradient-to-br from-blue-50 via-sky-50 to-emerald-50 rounded-3xl p-5 border border-blue-200 shadow-sm space-y-3.5 animate-fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-blue-900 flex items-center space-x-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>
                      {predictionResult ? 'ผลการตรวจทานระดับน้ำ (บันทึกสำเร็จ)' : 'ผลการคำนวณเบื้องต้น (Live Preview)'}
                    </span>
                  </span>
                  <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    {useAiWaterline ? 'AI Change-Point' : 'Human Pinpoint (100%)'}
                  </span>
                </div>

                {/* Metric with Flood Warning Flag */}
                <div className="bg-white/90 backdrop-blur-md rounded-2xl p-4 border border-white/80 shadow-sm flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-500 font-bold block">ระดับน้ำที่คำนวณได้</span>
                    <div className="flex items-baseline space-x-1.5 mt-0.5">
                      <span className="text-3xl font-black text-slate-900 tracking-tight">
                        {displayWaterLevel.toFixed(3)}
                      </span>
                      <span className="text-sm font-extrabold text-blue-600">ม. (รทก.)</span>
                    </div>
                  </div>

                  <div className="text-right flex flex-col items-end space-y-1.5">
                    {(() => {
                      const resFlag = getStationFlagInfo(station ?? null, displayWaterLevel);
                      return (
                        <div
                          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl ${resFlag.containerBg} ${resFlag.containerBorder} border shadow-sm select-none`}
                        >
                          <Flag className={`w-3.5 h-3.5 ${resFlag.flagColorClass}`} />
                          <span className={`text-xs font-black tracking-tight ${resFlag.flagTextClass}`}>
                            {resFlag.flagName}
                          </span>
                          <span className="text-slate-400 text-xs font-light">|</span>
                          <span className={`text-[11px] font-bold ${resFlag.flagTextClass}`}>
                            {resFlag.statusTitle}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* MLOps Active Learning badge & Label Studio Task Link */}
                {predictionResult && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 text-xs text-amber-950 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                        <span className="font-bold text-[11px]">ส่งเข้าคิวรอตรวจทานใน Label Studio แล้ว</span>
                      </div>
                      {predictionResult.label_studio_task_id && (
                        <span className="font-black px-2 py-0.5 rounded-full bg-amber-600 text-white text-[10px]">
                          Task #{predictionResult.label_studio_task_id} (รอมนุษย์ Review)
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-amber-900 leading-relaxed">
                      ระบบส่งภาพพร้อม Bounding Box เป็น Pre-annotation ให้แล้ว (ยังไม่ Complete อัตโนมัติ เพื่อให้ผู้เชี่ยวชาญเข้าตรวจทานและกดยืนยันเอง)
                    </p>
                    {predictionResult.label_studio_task_id && (
                      <div className="pt-0.5">
                        <a
                          href="http://localhost:8085"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center space-x-1.5 text-xs font-black text-amber-800 hover:text-amber-950 underline"
                        >
                          <span>เปิดตรวจทานและกดยืนยันใน Label Studio (Project 2)</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    )}
                  </div>
                )}

              </div>
            )}

          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center space-x-2">
            <Info className="w-4 h-4 text-blue-500 shrink-0" />
            <span>
              พิกัด Bounding Box ถูกผูกติดกับขนาดจริงของรูปภาพ (Natural Resolution) จึงตรงกับภาพ Crop และ Label Studio 100%
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

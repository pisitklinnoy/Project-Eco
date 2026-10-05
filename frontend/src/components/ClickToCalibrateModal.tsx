import React, { useState, useRef } from 'react';
import type { Station, CalibrationPoint } from '../types';
import { Target, CheckCircle2, RotateCcw, Save, X, Info } from 'lucide-react';
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
  const [saving, setSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  const imgRef = useRef<HTMLImageElement>(null);

  if (!isOpen || !station) return null;

  // Handle clicking on image
  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);

    if (!point1) {
      setPoint1({ x, y, value_m: val1 });
    } else if (!point2) {
      setPoint2({ x, y, value_m: val2 });
    } else {
      // Test measuring click
      setTestClickY(y);
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
    setSaveSuccess(false);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xl animate-fade-in">
      <div className="bg-white/95 backdrop-blur-2xl border border-white/80 rounded-[32px] sm:rounded-[36px] w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-5 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
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
        <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 bg-transparent">
          {/* Left Canvas/Image Area (8 Cols) */}
          <div className="lg:col-span-8 flex flex-col space-y-3">
            {/* Guide Badge */}
            <div className="bg-white border border-slate-200/80 rounded-2xl px-4 py-3 text-xs flex items-center justify-between shadow-sm">
              <div className="flex items-center space-x-2 text-slate-700 font-medium">
                <Info className="w-4 h-4 text-sky-600 shrink-0" />
                <span>
                  {!point1
                    ? 'ขั้นตอนที่ 1: คลิกที่ขีดตัวเลขบนเสาด้านบน (เช่น ขีด 2.0 ม.)'
                    : !point2
                    ? 'ขั้นตอนที่ 2: คลิกที่ขีดตัวเลขบนเสาด้านล่าง (เช่น ขีด 1.0 ม.)'
                    : 'ปรับเทียบสำเร็จ! ลองคลิกที่ผิวน้ำเพื่อทดสอบอ่านค่าระดับน้ำ'}
                </span>
              </div>
              <button
                onClick={handleReset}
                className="text-xs text-sky-700 hover:text-sky-900 font-bold flex items-center space-x-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>รีเซ็ต</span>
              </button>
            </div>

            {/* Clickable Camera Viewport */}
            <div className="relative aspect-video bg-black rounded-2xl overflow-hidden border border-slate-200 shadow-md select-none cursor-crosshair">
              {station.camera_stream_url ? (
                <img
                  ref={imgRef}
                  src={station.camera_stream_url}
                  alt={station.name}
                  onClick={handleImageClick}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                  ไม่พบภาพกล้อง CCTV
                </div>
              )}

              {/* Point 1 Marker */}
              {point1 && (
                <div
                  className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 flex items-center space-x-1"
                  style={{ left: `${point1.x}px`, top: `${point1.y}px` }}
                >
                  <div className="w-4 h-4 rounded-full bg-sky-500 border-2 border-white shadow-lg animate-ping absolute" />
                  <div className="w-4 h-4 rounded-full bg-sky-600 border-2 border-white shadow-lg relative flex items-center justify-center">
                    <span className="text-[8px] font-bold text-white">1</span>
                  </div>
                  <span className="bg-sky-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow">
                    จุดที่ 1 ({val1}ม.)
                  </span>
                </div>
              )}

              {/* Point 2 Marker */}
              {point2 && (
                <div
                  className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 flex items-center space-x-1"
                  style={{ left: `${point2.x}px`, top: `${point2.y}px` }}
                >
                  <div className="w-4 h-4 rounded-full bg-emerald-500 border-2 border-white shadow-lg animate-ping absolute" />
                  <div className="w-4 h-4 rounded-full bg-emerald-600 border-2 border-white shadow-lg relative flex items-center justify-center">
                    <span className="text-[8px] font-bold text-white">2</span>
                  </div>
                  <span className="bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow">
                    จุดที่ 2 ({val2}ม.)
                  </span>
                </div>
              )}

              {/* Calibration Scale Line Overlay */}
              {point1 && point2 && (
                <svg className="absolute inset-0 pointer-events-none w-full h-full">
                  <line
                    x1={point1.x}
                    y1={point1.y}
                    x2={point2.x}
                    y2={point2.y}
                    stroke="#38bdf8"
                    strokeWidth="3"
                    strokeDasharray="4,4"
                  />
                </svg>
              )}

              {/* Test Click Water Measurement Line */}
              {testClickY !== null && (
                <div
                  className="absolute inset-x-0 pointer-events-none border-b-2 border-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)] flex items-center justify-between px-4"
                  style={{ top: `${testClickY}px` }}
                >
                  <span className="text-[10px] font-bold bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full -translate-y-3">
                    ผิวน้ำที่ทดสอบคลิก
                  </span>
                  <span className="text-xs font-mono font-bold bg-white text-amber-800 px-2.5 py-0.5 rounded-full border border-amber-400 -translate-y-3 shadow">
                    {testMeasuredLevel} เมตร
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Right Parameters & Readout Area (4 Cols) */}
          <div className="lg:col-span-4 flex flex-col justify-between space-y-4">
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

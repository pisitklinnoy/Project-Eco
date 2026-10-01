import React, { useState, useRef } from 'react';
import type { Station, CalibrationPoint } from '../types';
import { Target, CheckCircle2, RotateCcw, Save, X, Info } from 'lucide-react';
import { floodlensApi } from '../api/floodlensApi';

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
  const [val1, setVal1] = useState<number>(4.0);
  const [val2, setVal2] = useState<number>(2.0);
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

  // Calculate pixels per meter
  let pixelsPerMeter: number | null = null;
  let testMeasuredLevel: number | null = null;

  if (point1 && point2 && point1.y !== point2.y && val1 !== val2) {
    const pixelDistance = Math.abs(point2.y - point1.y);
    const meterDistance = Math.abs(val1 - val2);
    pixelsPerMeter = pixelDistance / meterDistance;

    if (testClickY !== null) {
      // Linear formula: higher y means lower water level
      const deltaFromP1 = (point1.y - testClickY) / pixelsPerMeter;
      testMeasuredLevel = Number((point1.value_m + deltaFromP1).toFixed(2));
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
        formula_str: `Level = ${val1} + (${point1.y} - y) / ${pixelsPerMeter.toFixed(2)}`,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-800/80 border-b border-slate-700/80 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-blue-500/10 border border-blue-500/30 rounded-xl">
              <Target className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <span>Click-to-Calibrate: ปรับเทียบสเกลเสาวัดน้ำ</span>
                <span className="text-xs bg-blue-600/30 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded font-mono">
                  {station.station_code}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                คลิกมาร์ก 2 จุดบนเสาในภาพ เพื่อให้ระบบคำนวณอัตราส่วนพิกเซลต่อเมตรโดยไม่ต้องรู้ความสูงเสาจริง
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Canvas/Image Area (8 Cols) */}
          <div className="lg:col-span-8 flex flex-col space-y-3">
            {/* Guide Badge */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-xs flex items-center justify-between">
              <div className="flex items-center space-x-2 text-slate-300">
                <Info className="w-4 h-4 text-sky-400 shrink-0" />
                <span>
                  {!point1
                    ? 'ขั้นตอนที่ 1: คลิกที่ขีดตัวเลขบนเสาด้านบน (เช่น ขีด 4.0 ม.)'
                    : !point2
                    ? 'ขั้นตอนที่ 2: คลิกที่ขีดตัวเลขบนเสาด้านล่าง (เช่น ขีด 2.0 ม.)'
                    : 'ปรับเทียบสำเร็จ! ลองคลิกที่ผิวน้ำเพื่อทดสอบอ่านค่าระดับน้ำ'}
                </span>
              </div>
              <button
                onClick={handleReset}
                className="text-[11px] text-slate-400 hover:text-white flex items-center space-x-1 underline"
              >
                <RotateCcw className="w-3 h-3" />
                <span>รีเซ็ต</span>
              </button>
            </div>

            {/* Clickable Camera Viewport */}
            <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-slate-700 shadow-inner select-none cursor-crosshair">
              {station.camera_stream_url ? (
                <img
                  ref={imgRef}
                  src={station.camera_stream_url}
                  alt={station.name}
                  onClick={handleImageClick}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                  ไม่พบภาพกล้อง CCTV
                </div>
              )}

              {/* Point 1 Marker */}
              {point1 && (
                <div
                  className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 flex items-center space-x-1"
                  style={{ left: `${point1.x}px`, top: `${point1.y}px` }}
                >
                  <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-lg animate-ping absolute" />
                  <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-lg relative flex items-center justify-center">
                    <span className="text-[8px] font-bold text-white">1</span>
                  </div>
                  <span className="bg-blue-600/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow">
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
                  <div className="w-4 h-4 rounded-full bg-emerald-500 border-2 border-white shadow-lg relative flex items-center justify-center">
                    <span className="text-[8px] font-bold text-white">2</span>
                  </div>
                  <span className="bg-emerald-600/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow">
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
                  className="absolute inset-x-0 pointer-events-none border-b-2 border-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.8)] flex items-center justify-between px-4"
                  style={{ top: `${testClickY}px` }}
                >
                  <span className="text-[10px] font-bold bg-yellow-400 text-slate-950 px-1.5 py-0.5 rounded -translate-y-3">
                    ผิวน้ำที่ทดสอบคลิก
                  </span>
                  <span className="text-xs font-mono font-bold bg-slate-900/90 text-yellow-300 px-2 py-0.5 rounded border border-yellow-500/40 -translate-y-3">
                    {testMeasuredLevel} เมตร
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Right Parameters & Readout Area (4 Cols) */}
          <div className="lg:col-span-4 flex flex-col justify-between space-y-4">
            <div className="space-y-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                กำหนดค่าความสูงจุดอ้างอิง
              </h3>

              {/* Value 1 Input */}
              <div className="space-y-1">
                <label className="text-xs text-slate-400 flex items-center justify-between">
                  <span>ระดับความสูงจุดที่ 1 (ม.)</span>
                  <span className="text-blue-400 text-[11px] font-mono">
                    {point1 ? `Y: ${point1.y}px` : 'ยังไม่ได้คลิก'}
                  </span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={val1}
                  onChange={(e) => setVal1(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Value 2 Input */}
              <div className="space-y-1">
                <label className="text-xs text-slate-400 flex items-center justify-between">
                  <span>ระดับความสูงจุดที่ 2 (ม.)</span>
                  <span className="text-emerald-400 text-[11px] font-mono">
                    {point2 ? `Y: ${point2.y}px` : 'ยังไม่ได้คลิก'}
                  </span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={val2}
                  onChange={(e) => setVal2(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Calibration Results Box */}
              <div className="pt-3 border-t border-slate-800 space-y-2">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>ระยะห่างในภาพ:</span>
                  <span className="text-white font-mono">
                    {point1 && point2 ? `${Math.abs(point2.y - point1.y)} พิกเซล` : '-'}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>ความละเอียดสเกล:</span>
                  <span className="text-sky-400 font-mono font-bold">
                    {pixelsPerMeter ? `${pixelsPerMeter.toFixed(1)} px / เมตร` : '-'}
                  </span>
                </div>

                {testMeasuredLevel !== null && (
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2.5 text-xs mt-2">
                    <span className="text-yellow-300 font-bold block mb-0.5">ผลทดสอบคลิกผิวน้ำ:</span>
                    <span className="text-lg font-extrabold text-yellow-400 font-mono">
                      {testMeasuredLevel} ม.
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-2">
              {saveSuccess ? (
                <div className="w-full py-2.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-xl text-center text-xs font-bold flex items-center justify-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>บันทึกการปรับเทียบสำเร็จ!</span>
                </div>
              ) : (
                <button
                  onClick={handleSave}
                  disabled={!pixelsPerMeter || saving}
                  className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold text-xs flex items-center justify-center space-x-2 transition shadow-lg shadow-blue-600/20"
                >
                  <Save className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
                  <span>{saving ? 'กำลังบันทึก...' : 'บันทึกการปรับเทียบเข้าสู่ระบบ'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

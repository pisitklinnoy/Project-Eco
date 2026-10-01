import React from 'react';
import type { Station, WaterMeasurement } from '../types';
import { AlertTriangle, Clock, RefreshCw, Eye, Cpu, Waves } from 'lucide-react';

interface TelemetryCardProps {
  station: Station | null;
  measurement: WaterMeasurement | null;
  loading: boolean;
  onRefresh: () => void;
  onOpenReview: () => void;
}

export const TelemetryCard: React.FC<TelemetryCardProps> = ({
  station,
  measurement,
  loading,
  onRefresh,
  onOpenReview,
}) => {
  if (!station) return null;

  const currentLevel = measurement ? measurement.water_level : station.normal_level;
  const isCritical = currentLevel >= station.critical_level;
  const isWarning = currentLevel >= station.warning_level && !isCritical;

  // Percentage of bank level (0 to 100%)
  const percentage = Math.min(Math.round((currentLevel / station.bank_level) * 100), 100);

  return (
    <div className="bg-white border-2 border-blue-100 rounded-2xl p-5 shadow-[0_4px_20px_-4px_rgba(2,132,199,0.08)] hover:shadow-[0_8px_30px_-4px_rgba(2,132,199,0.12)] transition-all relative overflow-hidden flex flex-col justify-between">
      {/* Background Water Tint */}
      <div
        className={`absolute bottom-0 left-0 right-0 transition-all duration-700 pointer-events-none opacity-5 ${
          isCritical ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-blue-600'
        }`}
        style={{ height: `${percentage}%` }}
      />

      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wide">
              {station.station_code}
            </span>
            <span className="text-xs text-slate-500 font-medium">โทรมาตรผิวน้ำ</span>
          </div>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 transition"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
        <h3 className="text-base font-bold text-slate-900 tracking-tight">{station.name}</h3>
      </div>

      {/* Primary Value */}
      <div className="flex items-baseline space-x-3 my-3">
        <span
          className={`text-4xl font-extrabold tracking-tight ${
            isCritical ? 'text-rose-600' : isWarning ? 'text-amber-600' : 'text-blue-600'
          }`}
        >
          {currentLevel.toFixed(2)}
        </span>
        <span className="text-base text-slate-600 font-semibold">เมตร (ม. รทก.)</span>

        <span
          className={`ml-auto text-xs px-3 py-1 rounded-full font-bold flex items-center space-x-1.5 shadow-sm ${
            isCritical
              ? 'bg-rose-50 text-rose-700 border border-rose-200 animate-pulse'
              : isWarning
              ? 'bg-amber-50 text-amber-700 border border-amber-200'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}
        >
          {isCritical ? (
            <>
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
              <span>ระดับวิกฤตน้ำท่วม</span>
            </>
          ) : isWarning ? (
            <>
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>เฝ้าระวังน้ำสูง</span>
            </>
          ) : (
            <>
              <Waves className="w-3.5 h-3.5 text-emerald-600" />
              <span>ระดับน้ำปกติ</span>
            </>
          )}
        </span>
      </div>

      {/* Gauge Progress Bar */}
      <div className="my-3">
        <div className="flex justify-between text-[11px] text-slate-500 mb-1 font-medium">
          <span>ท้องคลอง (0ม.)</span>
          <span className="text-amber-700 font-semibold">เตือนภัย ({station.warning_level}ม.)</span>
          <span className="text-rose-700 font-semibold">วิกฤต ({station.critical_level}ม.)</span>
          <span className="text-slate-700 font-semibold">ตลิ่ง ({station.bank_level}ม.)</span>
        </div>
        <div className="w-full bg-blue-50/80 rounded-full h-3 overflow-hidden p-0.5 border border-blue-200">
          <div
            className={`h-full rounded-full transition-all duration-500 shadow-sm ${
              isCritical
                ? 'bg-gradient-to-r from-rose-500 to-red-600'
                : isWarning
                ? 'bg-gradient-to-r from-amber-400 to-amber-500'
                : 'bg-gradient-to-r from-sky-400 via-blue-500 to-blue-600'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* Source & Metadata Details */}
      <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100 text-xs">
        <div className="flex items-center space-x-1.5 text-slate-500">
          <Cpu className="w-3.5 h-3.5 text-blue-500" />
          <span>แหล่งข้อมูล:</span>
          <span className="text-blue-900 font-bold">{measurement?.source_type || 'CAMERA_VISION'}</span>
        </div>

        <div className="flex items-center space-x-1.5 text-slate-500 justify-end">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>เวลา:</span>
          <span className="text-slate-800 font-medium">
            {measurement ? new Date(measurement.timestamp).toLocaleTimeString() : 'ล่าสุด'}
          </span>
        </div>

        {measurement?.vision_confidence && (
          <div className="flex items-center space-x-1.5 text-slate-500 col-span-2 justify-between bg-blue-50/60 p-2 rounded-xl border border-blue-100">
            <span className="flex items-center space-x-1 font-medium text-blue-900">
              <Eye className="w-3.5 h-3.5 text-blue-600" />
              <span>AI Vision Confidence:</span>
            </span>
            <span className="text-blue-700 font-extrabold font-mono text-sm">
              {(measurement.vision_confidence * 100).toFixed(0)}%
            </span>
          </div>
        )}
      </div>

      {/* Review Trigger Button */}
      <button
        onClick={onOpenReview}
        className="w-full mt-3 bg-blue-50 hover:bg-blue-100 text-blue-700 hover:text-blue-800 text-xs font-bold py-2.5 px-3 rounded-xl border border-blue-200 flex items-center justify-center space-x-2 transition shadow-sm"
      >
        <Eye className="w-3.5 h-3.5 text-blue-600" />
        <span>เปิดระบบช่วยตรวจทานภาพ (Review Agent)</span>
      </button>
    </div>
  );
};

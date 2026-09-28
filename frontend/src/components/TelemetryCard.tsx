import React from 'react';
import type { Station, WaterMeasurement } from '../types';
import { AlertTriangle, Clock, RefreshCw, Eye, Cpu } from 'lucide-react';

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
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
      {/* Background Water Tint */}
      <div
        className={`absolute bottom-0 left-0 right-0 transition-all duration-700 pointer-events-none opacity-10 ${
          isCritical ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-blue-500'
        }`}
        style={{ height: `${percentage}%` }}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-400 uppercase tracking-wider">
            {station.station_code}
          </span>
          <h3 className="text-base font-bold text-white mt-1">{station.name}</h3>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          title="รีเฟรชข้อมูล"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
        </button>
      </div>

      {/* Primary Value */}
      <div className="flex items-baseline space-x-3 my-2">
        <span
          className={`text-4xl font-extrabold tracking-tight ${
            isCritical ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-blue-400'
          }`}
        >
          {currentLevel.toFixed(2)}
        </span>
        <span className="text-lg text-slate-400 font-medium">เมตร (ม.)</span>

        <span
          className={`ml-auto text-xs px-2.5 py-1 rounded-full font-bold flex items-center space-x-1 ${
            isCritical
              ? 'bg-red-500/20 text-red-300 border border-red-500/30'
              : isWarning
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
          }`}
        >
          {isCritical ? (
            <>
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>ระดับวิกฤต</span>
            </>
          ) : isWarning ? (
            <>
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>เฝ้าระวัง</span>
            </>
          ) : (
            <span>ระดับปกติ</span>
          )}
        </span>
      </div>

      {/* Gauge Progress Bar */}
      <div className="my-4">
        <div className="flex justify-between text-[11px] text-slate-400 mb-1">
          <span>ท้องคลอง (0ม.)</span>
          <span className="text-amber-400 font-medium">เตือนภัย ({station.warning_level}ม.)</span>
          <span className="text-red-400 font-medium">วิกฤต ({station.critical_level}ม.)</span>
          <span className="text-slate-300">ตลิ่ง ({station.bank_level}ม.)</span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden p-0.5 border border-slate-700">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isCritical ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-blue-500'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* Source & Metadata Details */}
      <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-800/80 text-xs">
        <div className="flex items-center space-x-1.5 text-slate-400">
          <Cpu className="w-3.5 h-3.5 text-blue-400" />
          <span>แหล่งข้อมูล:</span>
          <span className="text-slate-200 font-semibold">{measurement?.source_type || 'CAMERA_VISION'}</span>
        </div>

        <div className="flex items-center space-x-1.5 text-slate-400 justify-end">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>อัปเดต:</span>
          <span className="text-slate-200">
            {measurement ? new Date(measurement.timestamp).toLocaleTimeString() : 'ล่าสุด'}
          </span>
        </div>

        {measurement?.vision_confidence && (
          <div className="flex items-center space-x-1.5 text-slate-400 col-span-2 justify-between">
            <span className="flex items-center space-x-1">
              <Eye className="w-3.5 h-3.5 text-purple-400" />
              <span>AI Vision Confidence:</span>
            </span>
            <span className="text-purple-300 font-bold">
              {(measurement.vision_confidence * 100).toFixed(0)}%
            </span>
          </div>
        )}
      </div>

      {/* Review Trigger Button */}
      <button
        onClick={onOpenReview}
        className="w-full mt-4 bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold py-2 px-3 rounded-xl border border-slate-700/80 flex items-center justify-center space-x-1.5 transition"
      >
        <Eye className="w-3.5 h-3.5 text-orange-400" />
        <span>เปิดระบบช่วยตรวจทาน (Review Agent)</span>
      </button>
    </div>
  );
};

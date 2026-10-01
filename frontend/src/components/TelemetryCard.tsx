import React from 'react';
import type { Station, WaterMeasurement } from '../types';
import { AlertTriangle, Clock, RefreshCw, Eye, Cpu, Waves, ShieldCheck } from 'lucide-react';

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
  const distanceToBank = Math.max(0, station.bank_level - currentLevel);

  return (
    <div className="bg-white border-2 border-blue-100 rounded-2xl p-5 shadow-[0_4px_20px_-4px_rgba(2,132,199,0.08)] hover:shadow-[0_8px_30px_-4px_rgba(2,132,199,0.12)] transition-all relative overflow-hidden">
      {/* Background Water Tint */}
      <div
        className={`absolute bottom-0 left-0 right-0 transition-all duration-700 pointer-events-none opacity-5 ${
          isCritical ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-blue-600'
        }`}
        style={{ height: `${percentage}%` }}
      />

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
        
        {/* Col 1: Station Title & Big Water Level (5 Cols) */}
        <div className="md:col-span-5 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 uppercase tracking-wide">
                {station.station_code}
              </span>
              <span className="text-xs text-slate-500 font-medium">{station.location_name.split('(')[0]}</span>
            </div>
            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 transition"
              title="รีเฟรชข้อมูลโทรมาตร"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            </button>
          </div>

          <h3 className="text-base font-black text-slate-900 tracking-tight">{station.name}</h3>

          <div className="flex items-baseline space-x-3 pt-1">
            <span
              className={`text-4xl sm:text-5xl font-black font-mono tracking-tight ${
                isCritical ? 'text-rose-600' : isWarning ? 'text-amber-600' : 'text-blue-600'
              }`}
            >
              {currentLevel.toFixed(2)}
            </span>
            <span className="text-sm font-bold text-slate-600">เมตร (ม. รทก.)</span>

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
        </div>

        {/* Col 2: River Capacity Gauge Bar (4 Cols) */}
        <div className="md:col-span-4 flex flex-col justify-center space-y-2 border-t md:border-t-0 md:border-l border-slate-100 md:pl-6 pt-3 md:pt-0">
          <div className="flex justify-between items-center text-xs font-bold text-slate-700">
            <span>ความจุลำน้ำคลองอู่ตะเภา:</span>
            <span className="font-mono text-blue-700">{percentage}%</span>
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

          <div className="flex justify-between text-[10px] text-slate-500 font-medium">
            <span className="text-emerald-700 font-semibold">ปกติ ({station.normal_level} ม.)</span>
            <span className="text-amber-700 font-semibold">เตือนภัย ({station.warning_level} ม.)</span>
            <span className="text-rose-700 font-semibold">วิกฤต ({station.critical_level} ม.)</span>
            <span className="text-slate-700 font-semibold">ตลิ่ง ({station.bank_level} ม.)</span>
          </div>

          <div className="text-[11px] text-slate-600 flex items-center justify-between pt-1">
            <span>ระยะปลอดภัยก่อนล้นตลิ่ง:</span>
            <span className="font-extrabold text-blue-900 font-mono">
              เหลืออีก {distanceToBank.toFixed(2)} เมตร
            </span>
          </div>
        </div>

        {/* Col 3: AI Metadata & Quick Action (3 Cols) */}
        <div className="md:col-span-3 flex flex-col justify-between space-y-2.5 border-t md:border-t-0 md:border-l border-slate-100 md:pl-6 pt-3 md:pt-0">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center space-x-1">
              <Cpu className="w-3.5 h-3.5 text-blue-500" />
              <span>แหล่งตรวจวัด:</span>
            </span>
            <span className="text-blue-950 font-bold">{measurement?.source_type || 'CAMERA_VISION'}</span>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center space-x-1">
              <Eye className="w-3.5 h-3.5 text-sky-500" />
              <span>ความเชื่อมั่น AI:</span>
            </span>
            <span className="text-emerald-700 font-mono font-extrabold">
              {(measurement?.vision_confidence ? measurement.vision_confidence * 100 : 92).toFixed(0)}%
            </span>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center space-x-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>เวลาอัปเดต:</span>
            </span>
            <span className="text-slate-800 font-medium">
              {measurement ? new Date(measurement.timestamp).toLocaleTimeString() : 'ล่าสุด'}
            </span>
          </div>

          <button
            onClick={onOpenReview}
            className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold py-1.5 px-3 rounded-xl border border-blue-200 transition flex items-center justify-center space-x-1.5"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
            <span>ตรวจทานภาพเสาวัดน้ำ</span>
          </button>
        </div>

      </div>
    </div>
  );
};

export default TelemetryCard;

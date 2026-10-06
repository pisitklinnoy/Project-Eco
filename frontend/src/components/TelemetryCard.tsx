import React from 'react';
import type { Station, WaterMeasurement } from '../types';
import { AlertTriangle, Clock, RefreshCw, Eye, Cpu, Waves, ShieldCheck } from 'lucide-react';
import { PillButton } from './ui/PillButton';
import { IconButton } from './ui/IconButton';

interface TelemetryCardProps {
  station: Station | null;
  measurement: WaterMeasurement | null;
  loading: boolean;
  onRefresh: () => void;
  onOpenReview?: () => void;
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
    <div className="relative overflow-hidden rounded-[32px] sm:rounded-[36px] bg-white/85 backdrop-blur-2xl border border-white/80 p-6 sm:p-7 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.05)] transition-all hover:shadow-[0_25px_60px_-15px_rgba(2,132,199,0.08)]">
      {/* Background Water Level Tint */}
      <div
        className={`absolute bottom-0 left-0 right-0 transition-all duration-1000 pointer-events-none opacity-[0.06] ${
          isCritical
            ? 'bg-gradient-to-t from-rose-500 to-transparent'
            : isWarning
            ? 'bg-gradient-to-t from-amber-500 to-transparent'
            : 'bg-gradient-to-t from-sky-500 to-transparent'
        }`}
        style={{ height: `${Math.max(percentage, 15)}%` }}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center relative z-10">
        
        {/* Col 1: Station Title & Water Level (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-900 text-white tracking-wide shrink-0">
                {station.station_code}
              </span>
              <span className="text-xs text-slate-500 font-medium truncate max-w-[220px]">
                {station.location_name.split('(')[0]}
              </span>
            </div>
            
            <IconButton
              onClick={onRefresh}
              disabled={loading}
              tooltip="รีเฟรชข้อมูลโทรมาตร"
              variant="glass"
              size="sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-700 ${loading ? 'animate-spin text-sky-600' : ''}`} />
            </IconButton>
          </div>

          <div>
            <h3 className="text-xl sm:text-2xl font-bold font-display text-slate-900 tracking-tight leading-snug">
              {station.name}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">ลุ่มน้ำคลองอู่ตะเภา &bull; อำเภอหาดใหญ่</p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-baseline space-x-2.5">
              <span
                className={`text-4xl sm:text-5xl font-extrabold font-display tracking-tight leading-none ${
                  isCritical ? 'text-rose-600' : isWarning ? 'text-amber-600' : 'text-slate-900'
                }`}
              >
                {currentLevel.toFixed(2)}
              </span>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-700">เมตร (ม. รทก.)</span>
                <span className="text-[10px] text-slate-600 font-medium">ระดับน้ำปัจจุบัน</span>
              </div>
            </div>

            <span
              className={`text-xs px-3 py-1.5 rounded-full font-bold flex items-center space-x-1.5 shadow-sm shrink-0 border ${
                isCritical
                  ? 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse'
                  : isWarning
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
            >
              {isCritical ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  <span>ระดับวิกฤต</span>
                </>
              ) : isWarning ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>เฝ้าระวัง</span>
                </>
              ) : (
                <>
                  <Waves className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>ระดับปกติ</span>
                </>
              )}
            </span>
          </div>
        </div>

        {/* Col 2: River Capacity Gauge Bar (4 Cols) */}
        <div className="lg:col-span-4 flex flex-col justify-center space-y-3.5 lg:border-l lg:border-slate-200/60 lg:pl-6 pt-4 lg:pt-0 border-t border-slate-100 lg:border-t-0">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-slate-700">ความจุลำน้ำคลองอู่ตะเภา</span>
            <span className="font-display font-extrabold text-sky-700 text-sm">{percentage}%</span>
          </div>

          <div className="w-full bg-slate-100/90 rounded-full h-3 overflow-hidden p-0.5 border border-slate-200/60">
            <div
              className={`h-full rounded-full transition-all duration-700 shadow-sm ${
                isCritical
                  ? 'bg-gradient-to-r from-rose-500 to-red-600'
                  : isWarning
                  ? 'bg-gradient-to-r from-amber-400 to-amber-500'
                  : 'bg-gradient-to-r from-sky-400 via-sky-500 to-blue-600'
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>

          <div className="grid grid-cols-4 gap-1 text-[11px] text-center font-medium">
            <div className="rounded-lg bg-emerald-50/70 p-1 border border-emerald-100 text-emerald-800">
              <span className="block text-[9px] text-emerald-600 uppercase">ปกติ</span>
              <span className="font-bold">{station.normal_level}ม.</span>
            </div>
            <div className="rounded-lg bg-amber-50/70 p-1 border border-amber-100 text-amber-800">
              <span className="block text-[9px] text-amber-600 uppercase">เตือน</span>
              <span className="font-bold">{station.warning_level}ม.</span>
            </div>
            <div className="rounded-lg bg-rose-50/70 p-1 border border-rose-100 text-rose-800">
              <span className="block text-[9px] text-rose-600 uppercase">วิกฤต</span>
              <span className="font-bold">{station.critical_level}ม.</span>
            </div>
            <div className="rounded-lg bg-slate-100/70 p-1 border border-slate-200 text-slate-800">
              <span className="block text-[9px] text-slate-600 uppercase">ตลิ่ง</span>
              <span className="font-bold">{station.bank_level}ม.</span>
            </div>
          </div>

          <div className="text-xs text-slate-600 flex items-center justify-between pt-1">
            <span>ระยะก่อนล้นตลิ่ง:</span>
            <span className="font-bold font-display text-slate-900 whitespace-nowrap bg-slate-100 px-2.5 py-0.5 rounded-full text-[11px]">
              เหลืออีก {distanceToBank.toFixed(2)} เมตร
            </span>
          </div>
        </div>

        {/* Col 3: AI Metadata & Quick Action (3 Cols) */}
        <div className="lg:col-span-3 flex flex-col justify-between space-y-3 lg:border-l lg:border-slate-200/60 lg:pl-6 pt-4 lg:pt-0 border-t border-slate-100 lg:border-t-0">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center space-x-1.5 text-slate-500">
                <Cpu className="w-3.5 h-3.5 text-sky-600" />
                <span>แหล่งตรวจวัด:</span>
              </span>
              <span className="text-slate-900 font-bold font-mono text-[11px] truncate">
                {measurement?.source_type || 'CAMERA_VISION'}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center space-x-1.5 text-slate-500">
                <Eye className="w-3.5 h-3.5 text-emerald-600" />
                <span>ความเชื่อมั่น AI:</span>
              </span>
              <span className="text-emerald-700 font-bold font-display">
                {(measurement?.vision_confidence ? measurement.vision_confidence * 100 : 92).toFixed(0)}%
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center space-x-1.5 text-slate-500">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>เวลาอัปเดต:</span>
              </span>
              <span className="text-slate-800 font-medium">
                {measurement ? new Date(measurement.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'ล่าสุด'}
              </span>
            </div>
          </div>

          {onOpenReview && (
            <PillButton
              onClick={onOpenReview}
              variant="glass"
              size="sm"
              icon={<ShieldCheck className="w-3.5 h-3.5 text-sky-600 shrink-0" />}
              className="w-full justify-center !py-2.5 text-xs font-semibold"
            >
              ตรวจทานภาพเสาวัดน้ำ
            </PillButton>
          )}
        </div>

      </div>
    </div>
  );
};

export default TelemetryCard;

import React from 'react';
import type { Station, WaterMeasurement } from '../types';
import {
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
  Layers,
  Camera,
  MapPin,
} from 'lucide-react';
import { PillButton } from './ui/PillButton';
import { GlassCard } from './ui/GlassCard';

interface HeroSectionProps {
  station: Station | null;
  measurement: WaterMeasurement | null;
  stations: Station[];
  stationMeasurements: Record<string, WaterMeasurement>;
  onExploreClick: () => void;
  onSimulateClick: () => void;
  onOpenReview: () => void;
  onSelectStation: (stn: Station) => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  station,
  measurement,
  stations,
  stationMeasurements,
  onExploreClick,
  onSimulateClick,
  onOpenReview,
  onSelectStation,
}) => {
  const currentLevel = measurement ? measurement.water_level : Number.NaN;
  const bankLevel = station?.bank_level ?? 15.0;
  const isCritical = station ? currentLevel >= station.critical_level : false;
  const isWarning = station ? currentLevel >= station.warning_level && !isCritical : false;
  const distanceToBank = Math.max(0, bankLevel - currentLevel);
  const capacityPercent = measurement ? Math.max(0, Math.min(Math.round((currentLevel / bankLevel) * 100), 100)) : 0;

  return (
    <section className="relative w-full pt-4 pb-6 select-none" id="hero">
      {/* Background Architectural Ambient Glow Orbs */}
      <div className="absolute top-12 left-1/4 w-96 h-96 bg-sky-200/40 rounded-full blur-3xl pointer-events-none -z-10 animate-float" />
      <div className="absolute top-32 right-10 w-[480px] h-[480px] bg-blue-100/50 rounded-full blur-3xl pointer-events-none -z-10 animate-float-delayed" />

      {/* Main Hero Container with Organic Rounded Corners */}
      <div className="relative rounded-[36px] sm:rounded-[44px] bg-gradient-to-b from-white/95 via-sky-50/40 to-blue-50/30 border border-white/80 p-6 sm:p-10 lg:p-14 shadow-[0_24px_60px_-15px_rgba(15,23,42,0.06)] overflow-hidden">
        
        {/* Subtle Decorative Architectural Grid Lines & Radial Gradient */}
        <div className="absolute inset-0 bg-[radial-gradient(#0284c7_1px,transparent_1px)] [background-size:28px_28px] opacity-[0.035] pointer-events-none" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
          
          {/* Left Column: Huge Editorial Headline & Actions (7 Cols) */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Top Pill Badge */}
            <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-white/90 backdrop-blur-xl border border-slate-200/60 shadow-sm text-slate-800 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>Spatial AI Vision & Telemetry System</span>
              <span className="text-slate-400 font-normal">|</span>
              <span className="text-sky-700 font-extrabold">2026 Edition</span>
            </div>

            {/* Giant Editorial Typography (64-92px desktop) */}
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold text-slate-950 tracking-tight leading-[1.08] font-sans">
              Intelligent <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-sky-600 to-indigo-600">
                Water Defense.
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-sm sm:text-base lg:text-lg text-slate-600 font-medium leading-relaxed max-w-xl">
              ระบบเฝ้าระวังระดับน้ำอัจฉริยะลุ่มน้ำคลองอู่ตะเภา ผสานคอมพิวเตอร์วิทัศน์ AI ตรวจวัดเสาวัดน้ำ (Staff Gauge)
              แบบเรียลไทม์ และแบบจำลองพยากรณ์อุทกภัยความละเอียดสูง
            </p>

            {/* Primary Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <PillButton
                onClick={onExploreClick}
                variant="primary"
                size="lg"
                hasArrow
                className="shadow-xl shadow-blue-600/20"
              >
                สำรวจข้อมูลสถานีสด
              </PillButton>

              <PillButton
                onClick={onSimulateClick}
                variant="glass"
                size="lg"
                icon={<Layers className="w-4 h-4 text-sky-600" />}
              >
                ทดลองจำลองสถานการณ์น้ำ
              </PillButton>

              <PillButton
                onClick={onOpenReview}
                variant="secondary"
                size="lg"
                icon={<ShieldCheck className="w-4 h-4 text-emerald-600" />}
                className="border border-slate-200"
              >
                ตรวจทานภาพ AI
              </PillButton>
            </div>

            {/* Bottom Station Quick Pills */}
            <div className="pt-4 border-t border-slate-200/60 flex items-center space-x-2 flex-wrap gap-y-2">
              <span className="text-xs text-slate-500 font-semibold mr-1">สถานีหลัก:</span>
              {stations.map((stn) => {
                const isSelected = station?.station_code === stn.station_code;
                const stnWater = stationMeasurements[stn.station_code];
                const stnLvl = stnWater ? stnWater.water_level : Number.NaN;
                return (
                  <button
                    key={stn.station_code}
                    onClick={() => onSelectStation(stn)}
                    className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900 text-white shadow-md'
                        : 'bg-white/80 hover:bg-white text-slate-700 border border-slate-200/80 shadow-sm'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        stnLvl >= stn.critical_level
                          ? 'bg-red-500 animate-pulse'
                          : stnLvl >= stn.warning_level
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                    />
                    <span>{stn.name.split(' ')[0]}</span>
                    <span className="font-mono text-[11px] opacity-80">{stnWater ? `${stnLvl.toFixed(2)}m` : 'ไม่มีข้อมูล'}</span>
                  </button>
                );
              })}
            </div>

          </div>

          {/* Right Column: Floating Asymmetric Glass Cards (5 Cols) */}
          <div className="lg:col-span-5 relative flex flex-col gap-4">
            
            {/* FLOATING CARD 1: PRIMARY TELEMETRY GLASS CARD */}
            <GlassCard
              rounded="4xl"
              className="p-6 bg-white/85 backdrop-blur-2xl border border-white shadow-[0_20px_50px_rgba(15,23,42,0.08)] relative z-20 hover:-translate-y-1 transition-transform duration-300"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-full bg-blue-100/80 text-blue-700 flex items-center justify-center font-bold">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-tight">
                      {station?.name || 'สถานีเฝ้าระวัง'}
                    </h3>
                    <p className="text-[10px] text-slate-500 font-medium">
                      {station?.station_code} &bull; {station?.camera_id || 'CCTV-ACTIVE'}
                    </p>
                  </div>
                </div>

                <span
                  className={`text-[11px] font-extrabold px-3 py-1 rounded-full border shadow-sm ${
                    isCritical
                      ? 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse'
                      : isWarning
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}
                >
                  {!measurement ? 'ไม่มีข้อมูล' : isCritical ? 'วิกฤตน้ำท่วม' : isWarning ? 'เตือนภัย' : 'ระดับปกติ'}
                </span>
              </div>

              {/* Giant Numerical Water Level Display */}
              <div className="py-4 flex items-baseline justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                    ระดับน้ำตรวจวัดล่าสุด
                  </span>
                  <div className="flex items-baseline space-x-2 mt-0.5">
                    <span
                      className={`text-5xl sm:text-6xl font-black font-mono tracking-tight ${
                        isCritical ? 'text-rose-600' : isWarning ? 'text-amber-600' : 'text-slate-900'
                      }`}
                    >
                      {measurement ? currentLevel.toFixed(2) : '—'}
                    </span>
                    <span className="text-sm font-extrabold text-slate-500">เมตรตามรายงาน</span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                    ความจุลำน้ำ
                  </span>
                  <span className="text-2xl font-black font-mono text-blue-700 mt-1 block">
                    {measurement ? `${capacityPercent}%` : '—'}
                  </span>
                </div>
              </div>

              {/* River Channel Fill Bar */}
              <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden p-0.5 border border-slate-200/60 mb-3">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    isCritical
                      ? 'bg-gradient-to-r from-rose-500 to-red-600'
                      : isWarning
                      ? 'bg-gradient-to-r from-amber-400 to-amber-500'
                      : 'bg-gradient-to-r from-sky-400 via-blue-500 to-blue-600'
                  }`}
                  style={{ width: `${capacityPercent}%` }}
                />
              </div>

              {/* Micro Specs */}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-center">
                <div className="bg-slate-50/70 p-2 rounded-2xl border border-slate-100">
                  <span className="text-[10px] text-slate-500 block">ระดับตลิ่ง</span>
                  <span className="text-xs font-bold text-slate-800 font-mono">{bankLevel.toFixed(2)}ม.</span>
                </div>
                <div className="bg-slate-50/70 p-2 rounded-2xl border border-slate-100">
                  <span className="text-[10px] text-slate-500 block">ระยะก่อนล้น</span>
                  <span className="text-xs font-bold text-blue-700 font-mono">{measurement ? `${distanceToBank.toFixed(2)}ม.` : '—'}</span>
                </div>
                <div className="bg-slate-50/70 p-2 rounded-2xl border border-slate-100">
                  <span className="text-[10px] text-slate-500 block">ความเชื่อมั่น</span>
                  <span className="text-xs font-bold text-emerald-700 font-mono">
                    {measurement?.vision_confidence != null ? `${(measurement.vision_confidence * 100).toFixed(0)}%` : '—'}
                  </span>
                </div>
              </div>
            </GlassCard>

            {/* FLOATING CARD 2: AI CCTV INSPECTOR QUICK TEASER */}
            <div
              onClick={onExploreClick}
              className="cursor-pointer group rounded-3xl bg-slate-900/90 backdrop-blur-xl text-white p-4.5 border border-white/10 shadow-xl flex items-center justify-between hover:bg-slate-900 transition-all hover:scale-[1.01]"
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 border border-blue-400/30">
                  <Camera className="w-5 h-5 text-sky-300" />
                </div>
                <div>
                  <h4 className="text-xs font-black tracking-tight text-white flex items-center space-x-1.5">
                    <span>AI Staff Gauge Visual Analysis</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  </h4>
                  <p className="text-[11px] text-slate-400 font-medium">
                    ตรวจสอบภาพเสาความละเอียดเต็ม พร้อมสเกลไม้บรรทัดดิจิทัล 100%
                  </p>
                </div>
              </div>

              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white group-hover:bg-blue-600 transition-colors shrink-0">
                <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </div>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
};

export default HeroSection;

import React, { useState, useMemo } from 'react';
import type { Station, ForecastRecord } from '../types';
import { Sliders, CloudRain, Waves, ShieldAlert, AlertTriangle, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { floodlensApi } from '../api/floodlensApi';
import { PillButton } from './ui/PillButton';

interface WhatIfSimulatorProps {
  station: Station | null;
  currentWaterLevel: number;
  onApplySimulation?: (simulatedForecast: ForecastRecord) => void;
}

export const WhatIfSimulator: React.FC<WhatIfSimulatorProps> = ({
  station,
  currentWaterLevel,
  onApplySimulation,
}) => {
  // Sliders State
  const [rainSurge, setRainSurge] = useState<number>(0); // 0 to 150 mm
  const [upstreamSurge, setUpstreamSurge] = useState<number>(0); // 0 to 100 %
  const [gateR1Open, setGateR1Open] = useState<number>(50); // 0 to 100 %
  const [seaTideSurge, setSeaTideSurge] = useState<number>(0.0); // 0.0 to 1.5 m

  const [activePreset, setActivePreset] = useState<'normal' | 'storm' | 'critical' | 'relief' | 'custom'>('normal');
  const [loading, setLoading] = useState<boolean>(false);
  const [appliedSuccess, setAppliedSuccess] = useState<boolean>(false);

  // Hydrological simulation calculation in real-time
  const simulation = useMemo(() => {
    if (!station) return null;

    const baseLevel = currentWaterLevel || station.normal_level;

    // Transfer function factors
    const deltaRain = rainSurge * 0.018; // mm to meters
    const deltaUpstream = (upstreamSurge / 100.0) * 1.8;
    const deltaGate = -((gateR1Open - 50.0) / 100.0) * 0.8; // Open more -> relief
    const deltaTide = seaTideSurge * 0.45;

    const totalDelta = deltaRain + deltaUpstream + deltaGate + deltaTide;
    const simulatedLevel = Number(Math.max(0.5, baseLevel + totalDelta).toFixed(2));

    const p1 = Number((simulatedLevel + totalDelta * 0.15 + 0.10).toFixed(2));
    const p2 = Number((simulatedLevel + totalDelta * 0.30 + 0.22).toFixed(2));
    const p3 = Number((simulatedLevel + totalDelta * 0.45 + 0.35).toFixed(2));

    const isCritical = simulatedLevel >= station.critical_level;
    const isWarning = simulatedLevel >= station.warning_level && !isCritical;
    const isBankBreach = simulatedLevel >= station.bank_level;

    return {
      totalDelta: Number(totalDelta.toFixed(2)),
      simulatedLevel,
      p1,
      p2,
      p3,
      isWarning,
      isCritical,
      isBankBreach,
    };
  }, [station, currentWaterLevel, rainSurge, upstreamSurge, gateR1Open, seaTideSurge]);

  if (!station || !simulation) return null;

  // Preset Handlers
  const applyPreset = (preset: 'normal' | 'storm' | 'critical' | 'relief') => {
    setActivePreset(preset);
    setAppliedSuccess(false);
    switch (preset) {
      case 'normal':
        setRainSurge(0);
        setUpstreamSurge(0);
        setGateR1Open(50);
        setSeaTideSurge(0.0);
        break;
      case 'storm':
        setRainSurge(75);
        setUpstreamSurge(40);
        setGateR1Open(60);
        setSeaTideSurge(0.5);
        break;
      case 'critical':
        setRainSurge(120);
        setUpstreamSurge(85);
        setGateR1Open(10); // Gate locked
        setSeaTideSurge(1.2);
        break;
      case 'relief':
        setRainSurge(30);
        setUpstreamSurge(20);
        setGateR1Open(100); // Fully open R1
        setSeaTideSurge(0.0);
        break;
    }
  };

  const handleApplyToForecast = async () => {
    setLoading(true);
    try {
      const res = await floodlensApi.simulateWhatIf(station.station_code, {
        rain_surge_mm: rainSurge,
        upstream_surge_percent: upstreamSurge,
        gate_r1_open_percent: gateR1Open,
        sea_tide_surge_m: seaTideSurge,
      });
      if (onApplySimulation) {
        onApplySimulation(res);
      }
      setAppliedSuccess(true);
      setTimeout(() => setAppliedSuccess(false), 3000);
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการส่งค่าจำลอง');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-[32px] sm:rounded-[36px] bg-white/85 backdrop-blur-2xl border border-white/80 p-6 sm:p-8 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.05)] transition-all flex flex-col space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-2xl bg-sky-50 text-sky-600 border border-sky-100 flex items-center justify-center shadow-sm">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold font-display text-slate-900 flex items-center space-x-2">
              <span>"What-If" Flood Simulator: ห้องทดลองจำลองสถานการณ์น้ำท่วม</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              ปรับสไลเดอร์ฝนตกหนัก มวลน้ำหลาก ประตูระบายน้ำ คลอง ร.1 และน้ำทะเลสาบหนุน เพื่อวิเคราะห์ผลกระทบแบบเรียลไทม์
            </p>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
          <button
            onClick={() => applyPreset('normal')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
              activePreset === 'normal'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100/80 hover:bg-slate-200/80 text-slate-700'
            }`}
          >
            ☀️ สภาวะปกติ
          </button>
          <button
            onClick={() => applyPreset('storm')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
              activePreset === 'storm'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-sky-50 hover:bg-sky-100 text-sky-800'
            }`}
          >
            ⛈️ พายุฝนตกหนัก
          </button>
          <button
            onClick={() => applyPreset('critical')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
              activePreset === 'critical'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-rose-50 hover:bg-rose-100 text-rose-800'
            }`}
          >
            🚨 วิกฤติน้ำล้นตลิ่ง
          </button>
          <button
            onClick={() => applyPreset('relief')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
              activePreset === 'relief'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800'
            }`}
          >
            🛡️ ผันน้ำเต็มสูบ
          </button>
        </div>
      </div>

      {/* Main Grid: Sliders (7 Cols) & Real-time Outcome Card (5 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sliders Area (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Slider 1: Rain Surge */}
          <div className="space-y-2 bg-slate-50/70 p-4 rounded-2xl border border-slate-200/60 transition-all hover:bg-slate-50">
            <div className="flex justify-between items-center text-xs">
              <span className="flex items-center space-x-2 text-slate-800 font-semibold">
                <CloudRain className="w-4 h-4 text-sky-600" />
                <span>ปริมาณฝนสะสมเพิ่มเติม (พื้นที่ อ.สะเดา / หาดใหญ่)</span>
              </span>
              <span className="font-display font-extrabold text-sky-700 text-sm">+{rainSurge} มม.</span>
            </div>
            <input
              type="range"
              min="0"
              max="150"
              step="5"
              value={rainSurge}
              onChange={(e) => {
                setRainSurge(Number(e.target.value));
                setActivePreset('custom');
              }}
              className="w-full accent-slate-900 cursor-pointer h-2 bg-slate-200 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-medium">
              <span>0 มม. (ไม่มีฝน)</span>
              <span>50 มม. (ฝนตกปานกลาง)</span>
              <span>150 มม. (ฝนตกชุกวิกฤติ)</span>
            </div>
          </div>

          {/* Slider 2: Upstream Inflow Surge */}
          <div className="space-y-2 bg-slate-50/70 p-4 rounded-2xl border border-slate-200/60 transition-all hover:bg-slate-50">
            <div className="flex justify-between items-center text-xs">
              <span className="flex items-center space-x-2 text-slate-800 font-semibold">
                <Waves className="w-4 h-4 text-sky-600" />
                <span>มวลน้ำหลากจากสะพานบางศาลา (ตอนบน)</span>
              </span>
              <span className="font-display font-extrabold text-sky-700 text-sm">+{upstreamSurge}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={upstreamSurge}
              onChange={(e) => {
                setUpstreamSurge(Number(e.target.value));
                setActivePreset('custom');
              }}
              className="w-full accent-slate-900 cursor-pointer h-2 bg-slate-200 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-medium">
              <span>0% (ไหลตามปกติ)</span>
              <span>50% (มวลน้ำเพิ่มขึ้น)</span>
              <span>100% (น้ำหลากเต็มพิกัด)</span>
            </div>
          </div>

          {/* Slider 3: Khlong R.1 Gate Open */}
          <div className="space-y-2 bg-slate-50/70 p-4 rounded-2xl border border-slate-200/60 transition-all hover:bg-slate-50">
            <div className="flex justify-between items-center text-xs">
              <span className="flex items-center space-x-2 text-slate-800 font-semibold">
                <ShieldAlert className="w-4 h-4 text-emerald-600" />
                <span>การเปิดประตูระบายน้ำ คลอง ร.1 (ผันน้ำเลี่ยงเมืองหาดใหญ่)</span>
              </span>
              <span className="font-display font-extrabold text-emerald-700 text-sm">{gateR1Open}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={gateR1Open}
              onChange={(e) => {
                setGateR1Open(Number(e.target.value));
                setActivePreset('custom');
              }}
              className="w-full accent-emerald-600 cursor-pointer h-2 bg-slate-200 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-medium">
              <span>0% (ปิดบาน - ระบายช้า)</span>
              <span>50% (เปิดครึ่งบาน)</span>
              <span>100% (ยกบานสุด - ระบายเร็ว)</span>
            </div>
          </div>

          {/* Slider 4: Sea Tide Surge */}
          <div className="space-y-2 bg-slate-50/70 p-4 rounded-2xl border border-slate-200/60 transition-all hover:bg-slate-50">
            <div className="flex justify-between items-center text-xs">
              <span className="flex items-center space-x-2 text-slate-800 font-semibold">
                <Waves className="w-4 h-4 text-indigo-600" />
                <span>ระดับน้ำทะเลสาบสงขลาหนุนสูง (Sea Tide)</span>
              </span>
              <span className="font-display font-extrabold text-indigo-700 text-sm">+{seaTideSurge.toFixed(1)} ม.</span>
            </div>
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.1"
              value={seaTideSurge}
              onChange={(e) => {
                setSeaTideSurge(Number(e.target.value));
                setActivePreset('custom');
              }}
              className="w-full accent-indigo-600 cursor-pointer h-2 bg-slate-200 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-medium">
              <span>0.0 ม. (น้ำลงปกติ)</span>
              <span>0.8 ม. (น้ำทะเลหนุนปานกลาง)</span>
              <span>1.5 ม. (น้ำทะเลหนุนสูงสุด 15 ค่ำ)</span>
            </div>
          </div>
        </div>

        {/* Real-time Outcome Card (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-5 rounded-[28px] bg-gradient-to-br from-slate-50 via-white to-sky-50/40 p-6 border border-slate-200/80 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.04)]">
          <div>
            <div className="flex justify-between items-start mb-4">
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  ผลการคำนวณระดับน้ำจำลอง
                </span>
                <div className="flex items-baseline space-x-2.5 mt-1.5">
                  <span
                    className={`text-4xl sm:text-5xl font-extrabold font-display tracking-tight ${
                      simulation.isBankBreach
                        ? 'text-rose-600 animate-pulse'
                        : simulation.isCritical
                        ? 'text-rose-600'
                        : simulation.isWarning
                        ? 'text-amber-600'
                        : 'text-slate-900'
                    }`}
                  >
                    {simulation.simulatedLevel.toFixed(2)}
                  </span>
                  <span className="text-sm font-semibold text-slate-600">ม. รทก.</span>
                  {simulation.totalDelta !== 0 && (
                    <span
                      className={`text-xs font-bold px-2.5 py-0.5 rounded-full font-mono shadow-sm ${
                        simulation.totalDelta > 0
                          ? 'bg-rose-100 text-rose-800 border border-rose-200'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}
                    >
                      {simulation.totalDelta > 0 ? `+${simulation.totalDelta}` : simulation.totalDelta}ม.
                    </span>
                  )}
                </div>
              </div>

              {/* Status Badge */}
              <span
                className={`text-xs px-3 py-1.5 rounded-full font-bold flex items-center space-x-1.5 shadow-sm border ${
                  simulation.isBankBreach
                    ? 'bg-rose-600 text-white animate-bounce border-rose-700'
                    : simulation.isCritical
                    ? 'bg-rose-50 text-rose-800 border-rose-200'
                    : simulation.isWarning
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}
              >
                {simulation.isBankBreach ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>น้ำล้นตลิ่ง!</span>
                  </>
                ) : simulation.isCritical ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>ระดับวิกฤต</span>
                  </>
                ) : simulation.isWarning ? (
                  <span>เตือนภัย</span>
                ) : (
                  <span>ระดับปลอดภัย</span>
                )}
              </span>
            </div>

            {/* Simulated 1h - 3h Forecast Horizon */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm space-y-2 mt-4">
              <span className="text-xs text-slate-800 font-bold block mb-1">
                ผลพยากรณ์ล่วงหน้าภายใต้สภาวะจำลองนี้:
              </span>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
                  <span className="text-[10px] text-slate-500 font-medium block">+1 ชม.</span>
                  <span className="font-display font-bold text-slate-900 text-sm">{simulation.p1} ม.</span>
                </div>
                <div className="bg-amber-50/50 p-2.5 rounded-xl border border-amber-200/60">
                  <span className="text-[10px] text-amber-700 font-medium block">+2 ชม.</span>
                  <span className="font-display font-bold text-amber-700 text-sm">{simulation.p2} ม.</span>
                </div>
                <div className="bg-rose-50/50 p-2.5 rounded-xl border border-rose-200/60">
                  <span className="text-[10px] text-rose-700 font-medium block">+3 ชม.</span>
                  <span className="font-display font-bold text-rose-700 text-sm">{simulation.p3} ม.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Trigger Button */}
          <PillButton
            onClick={handleApplyToForecast}
            disabled={loading}
            variant="primary"
            size="md"
            icon={appliedSuccess ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <ArrowUpRight className="w-4 h-4" />}
            loading={loading}
            className="w-full justify-center !py-3 font-semibold text-xs shadow-md"
          >
            {appliedSuccess ? 'อัปเดตผลสู่กราฟหลักสำเร็จ!' : 'นำผลจำลองไปแสดงบนกราฟพยากรณ์หลัก'}
          </PillButton>
        </div>
      </div>
    </div>
  );
};

export default WhatIfSimulator;

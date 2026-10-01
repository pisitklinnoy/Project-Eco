import React, { useState, useMemo } from 'react';
import type { Station, ForecastRecord } from '../types';
import { Sliders, CloudRain, Waves, ShieldAlert, RefreshCw, AlertTriangle, ArrowUpRight } from 'lucide-react';
import { floodlensApi } from '../api/floodlensApi';

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

  const [loading, setLoading] = useState<boolean>(false);

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
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการส่งค่าจำลอง');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl">
            <Sliders className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <span>"What-If" Flood Simulator: จำลองสถานการณ์น้ำท่วมล่วงหน้า</span>
            </h3>
            <p className="text-xs text-slate-400">
              ทดลองเลื่อนสไลเดอร์เพื่อดูผลกระทบของฝนตก มวลน้ำหลาก และน้ำทะเลหนุนต่อระดับน้ำคลอง
            </p>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="flex items-center space-x-1.5 flex-wrap">
          <button
            onClick={() => applyPreset('normal')}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-medium text-slate-300 transition"
          >
            ☀️ ปกติ
          </button>
          <button
            onClick={() => applyPreset('storm')}
            className="px-2.5 py-1 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 text-[11px] font-medium transition"
          >
            ⛈️ พายุเข้า
          </button>
          <button
            onClick={() => applyPreset('critical')}
            className="px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 text-[11px] font-medium transition"
          >
            🚨 วิกฤติตลิ่งแตก
          </button>
          <button
            onClick={() => applyPreset('relief')}
            className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-medium transition"
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
          <div className="space-y-1.5 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
            <div className="flex justify-between items-center text-xs">
              <span className="flex items-center space-x-1.5 text-slate-300 font-medium">
                <CloudRain className="w-3.5 h-3.5 text-sky-400" />
                <span>ปริมาณฝนสะสมเพิ่มเติม (สะเดา/หาดใหญ่)</span>
              </span>
              <span className="font-mono font-bold text-sky-400">+{rainSurge} มม.</span>
            </div>
            <input
              type="range"
              min="0"
              max="150"
              step="5"
              value={rainSurge}
              onChange={(e) => setRainSurge(Number(e.target.value))}
              className="w-full accent-sky-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>0 มม. (ไม่มีฝน)</span>
              <span>50 มม. (ฝนหนัก)</span>
              <span>150 มม. (ฝนตกชุกวิกฤติ)</span>
            </div>
          </div>

          {/* Slider 2: Upstream Inflow Surge */}
          <div className="space-y-1.5 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
            <div className="flex justify-between items-center text-xs">
              <span className="flex items-center space-x-1.5 text-slate-300 font-medium">
                <Waves className="w-3.5 h-3.5 text-blue-400" />
                <span>มวลน้ำหลากจากสะพานบางศาลา (ต้นน้ำ)</span>
              </span>
              <span className="font-mono font-bold text-blue-400">+{upstreamSurge}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={upstreamSurge}
              onChange={(e) => setUpstreamSurge(Number(e.target.value))}
              className="w-full accent-blue-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>0% (น้ำไหลปกติ)</span>
              <span>50% (มวลน้ำเพิ่มขึ้น)</span>
              <span>100% (น้ำหลากเต็มคลอง)</span>
            </div>
          </div>

          {/* Slider 3: Khlong R.1 Gate Open */}
          <div className="space-y-1.5 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
            <div className="flex justify-between items-center text-xs">
              <span className="flex items-center space-x-1.5 text-slate-300 font-medium">
                <ShieldAlert className="w-3.5 h-3.5 text-emerald-400" />
                <span>ระดับการเปิดประตูระบายน้ำ คลอง ร.1 (ผันน้ำเลี่ยงเมือง)</span>
              </span>
              <span className="font-mono font-bold text-emerald-400">{gateR1Open}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={gateR1Open}
              onChange={(e) => setGateR1Open(Number(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>0% (ปิดบาน - ระบายช้า)</span>
              <span>50% (เปิดครึ่งบาน)</span>
              <span>100% (ยกบานสุด - ระบายเร็ว)</span>
            </div>
          </div>

          {/* Slider 4: Sea Tide Surge */}
          <div className="space-y-1.5 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
            <div className="flex justify-between items-center text-xs">
              <span className="flex items-center space-x-1.5 text-slate-300 font-medium">
                <Waves className="w-3.5 h-3.5 text-purple-400" />
                <span>ระดับน้ำทะเลสาบสงขลาหนุนสูง (Sea Tide)</span>
              </span>
              <span className="font-mono font-bold text-purple-400">+{seaTideSurge.toFixed(1)} ม.</span>
            </div>
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.1"
              value={seaTideSurge}
              onChange={(e) => setSeaTideSurge(Number(e.target.value))}
              className="w-full accent-purple-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>0.0 ม. (น้ำลงปกติ)</span>
              <span>0.8 ม. (น้ำทะเลหนุนปานกลาง)</span>
              <span>1.5 ม. (น้ำทะเลหนุนสูงสุด 15 ค่ำ)</span>
            </div>
          </div>
        </div>

        {/* Real-time Outcome Card (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-4 bg-slate-950/80 p-5 rounded-xl border border-slate-800 shadow-inner">
          <div>
            <div className="flex justify-between items-start mb-3">
              <div>
                <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
                  ผลการจำลองระดับน้ำ
                </span>
                <div className="flex items-baseline space-x-2 mt-1">
                  <span
                    className={`text-4xl font-extrabold font-mono ${
                      simulation.isBankBreach
                        ? 'text-red-500 animate-pulse'
                        : simulation.isCritical
                        ? 'text-red-400'
                        : simulation.isWarning
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {simulation.simulatedLevel.toFixed(2)}
                  </span>
                  <span className="text-sm text-slate-400">ม.</span>
                  {simulation.totalDelta !== 0 && (
                    <span
                      className={`text-xs font-bold px-1.5 py-0.5 rounded font-mono ${
                        simulation.totalDelta > 0
                          ? 'bg-red-500/20 text-red-300'
                          : 'bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      {simulation.totalDelta > 0 ? `+${simulation.totalDelta}` : simulation.totalDelta}ม.
                    </span>
                  )}
                </div>
              </div>

              {/* Status Badge */}
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-bold flex items-center space-x-1 ${
                  simulation.isBankBreach
                    ? 'bg-red-600 text-white animate-bounce'
                    : simulation.isCritical
                    ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                    : simulation.isWarning
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
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
                    <span>วิกฤติต้องระวัง</span>
                  </>
                ) : simulation.isWarning ? (
                  <span>เตือนภัย</span>
                ) : (
                  <span>ระดับปลอดภัย</span>
                )}
              </span>
            </div>

            {/* Simulated 1h - 3h Forecast Horizon */}
            <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-800 space-y-2 mt-4">
              <span className="text-[11px] text-slate-400 font-bold block mb-1">
                พยากรณ์ผลลัพธ์ล่วงหน้าในสภาวะนี้:
              </span>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">+1 ชม.</span>
                  <span className="font-mono font-bold text-white text-sm">{simulation.p1} ม.</span>
                </div>
                <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">+2 ชม.</span>
                  <span className="font-mono font-bold text-amber-400 text-sm">{simulation.p2} ม.</span>
                </div>
                <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">+3 ชม.</span>
                  <span className="font-mono font-bold text-red-400 text-sm">{simulation.p3} ม.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Trigger Button */}
          <button
            onClick={handleApplyToForecast}
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold text-xs flex items-center justify-center space-x-2 transition shadow-lg shadow-orange-500/20"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowUpRight className="w-4 h-4" />
            )}
            <span>นำผลจำลองไปแสดงบนกราฟพยากรณ์หลัก</span>
          </button>
        </div>
      </div>
    </div>
  );
};

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
    <div className="bg-white border-2 border-blue-100 rounded-2xl p-5 shadow-[0_4px_20px_-4px_rgba(2,132,199,0.08)] hover:shadow-[0_8px_30px_-4px_rgba(2,132,199,0.12)] transition-all flex flex-col space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-blue-100">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-blue-950 flex items-center space-x-2">
              <span>"What-If" Flood Simulator: ห้องทดลองจำลองสถานการณ์น้ำท่วมล่วงหน้า</span>
            </h3>
            <p className="text-xs text-slate-500">
              ปรับสไลเดอร์ฝนตกหนัก มวลน้ำต้นน้ำ ประตูระบายน้ำ ร.1 และน้ำทะเลสาบหนุน เพื่อวิเคราะห์ผลกระทบแบบเรียลไทม์
            </p>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="flex items-center space-x-1.5 flex-wrap">
          <button
            onClick={() => applyPreset('normal')}
            className="px-3 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-[11px] font-bold text-blue-700 border border-blue-200 transition"
          >
            ☀️ สภาวะปกติ
          </button>
          <button
            onClick={() => applyPreset('storm')}
            className="px-3 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-[11px] font-bold text-sky-700 border border-sky-300 transition"
          >
            ⛈️ พายุฝนตกหนัก
          </button>
          <button
            onClick={() => applyPreset('critical')}
            className="px-3 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-[11px] font-bold text-rose-700 border border-rose-200 transition"
          >
            🚨 วิกฤติน้ำล้นตลิ่ง
          </button>
          <button
            onClick={() => applyPreset('relief')}
            className="px-3 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-[11px] font-bold text-emerald-700 border border-emerald-200 transition"
          >
            🛡️ ผันน้ำเต็มสูบ
          </button>
        </div>
      </div>

      {/* Main Grid: Sliders (7 Cols) & Real-time Outcome Card (5 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sliders Area (7 Cols) */}
        <div className="lg:col-span-7 space-y-3.5">
          {/* Slider 1: Rain Surge */}
          <div className="space-y-1.5 bg-blue-50/40 p-3 rounded-xl border border-blue-100">
            <div className="flex justify-between items-center text-xs">
              <span className="flex items-center space-x-1.5 text-slate-800 font-bold">
                <CloudRain className="w-4 h-4 text-sky-600" />
                <span>ปริมาณฝนสะสมเพิ่มเติม (พื้นที่ อ.สะเดา / หาดใหญ่)</span>
              </span>
              <span className="font-mono font-extrabold text-sky-700 text-sm">+{rainSurge} มม.</span>
            </div>
            <input
              type="range"
              min="0"
              max="150"
              step="5"
              value={rainSurge}
              onChange={(e) => setRainSurge(Number(e.target.value))}
              className="w-full accent-blue-600 cursor-pointer h-2 bg-slate-200 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-medium">
              <span>0 มม. (ไม่มีฝน)</span>
              <span>50 มม. (ฝนตกปานกลาง)</span>
              <span>150 มม. (ฝนตกชุกวิกฤติ)</span>
            </div>
          </div>

          {/* Slider 2: Upstream Inflow Surge */}
          <div className="space-y-1.5 bg-blue-50/40 p-3 rounded-xl border border-blue-100">
            <div className="flex justify-between items-center text-xs">
              <span className="flex items-center space-x-1.5 text-slate-800 font-bold">
                <Waves className="w-4 h-4 text-blue-600" />
                <span>มวลน้ำหลากจากสะพานบางศาลา (ตอนบน)</span>
              </span>
              <span className="font-mono font-extrabold text-blue-700 text-sm">+{upstreamSurge}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={upstreamSurge}
              onChange={(e) => setUpstreamSurge(Number(e.target.value))}
              className="w-full accent-blue-600 cursor-pointer h-2 bg-slate-200 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-medium">
              <span>0% (ไหลตามปกติ)</span>
              <span>50% (มวลน้ำเพิ่มขึ้น)</span>
              <span>100% (น้ำหลากเต็มพิกัด)</span>
            </div>
          </div>

          {/* Slider 3: Khlong R.1 Gate Open */}
          <div className="space-y-1.5 bg-blue-50/40 p-3 rounded-xl border border-blue-100">
            <div className="flex justify-between items-center text-xs">
              <span className="flex items-center space-x-1.5 text-slate-800 font-bold">
                <ShieldAlert className="w-4 h-4 text-emerald-600" />
                <span>การเปิดประตูระบายน้ำ คลอง ร.1 (ผันน้ำเลี่ยงเมืองหาดใหญ่)</span>
              </span>
              <span className="font-mono font-extrabold text-emerald-700 text-sm">{gateR1Open}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={gateR1Open}
              onChange={(e) => setGateR1Open(Number(e.target.value))}
              className="w-full accent-emerald-600 cursor-pointer h-2 bg-slate-200 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-medium">
              <span>0% (ปิดบาน - ระบายช้า)</span>
              <span>50% (เปิดครึ่งบาน)</span>
              <span>100% (ยกบานสุด - ระบายเร็ว)</span>
            </div>
          </div>

          {/* Slider 4: Sea Tide Surge */}
          <div className="space-y-1.5 bg-blue-50/40 p-3 rounded-xl border border-blue-100">
            <div className="flex justify-between items-center text-xs">
              <span className="flex items-center space-x-1.5 text-slate-800 font-bold">
                <Waves className="w-4 h-4 text-indigo-600" />
                <span>ระดับน้ำทะเลสาบสงขลาหนุนสูง (Sea Tide)</span>
              </span>
              <span className="font-mono font-extrabold text-indigo-700 text-sm">+{seaTideSurge.toFixed(1)} ม.</span>
            </div>
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.1"
              value={seaTideSurge}
              onChange={(e) => setSeaTideSurge(Number(e.target.value))}
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
        <div className="lg:col-span-5 flex flex-col justify-between space-y-4 bg-gradient-to-br from-blue-50/90 via-sky-50/40 to-white p-5 rounded-2xl border-2 border-blue-200 shadow-sm">
          <div>
            <div className="flex justify-between items-start mb-3">
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  ผลการคำนวณระดับน้ำจำลอง
                </span>
                <div className="flex items-baseline space-x-2 mt-1">
                  <span
                    className={`text-4xl font-extrabold font-mono tracking-tight ${
                      simulation.isBankBreach
                        ? 'text-rose-600 animate-pulse'
                        : simulation.isCritical
                        ? 'text-rose-600'
                        : simulation.isWarning
                        ? 'text-amber-600'
                        : 'text-blue-700'
                    }`}
                  >
                    {simulation.simulatedLevel.toFixed(2)}
                  </span>
                  <span className="text-sm font-semibold text-slate-600">ม. รทก.</span>
                  {simulation.totalDelta !== 0 && (
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded font-mono shadow-sm ${
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
                className={`text-xs px-3 py-1 rounded-full font-bold flex items-center space-x-1 shadow-sm ${
                  simulation.isBankBreach
                    ? 'bg-rose-600 text-white animate-bounce'
                    : simulation.isCritical
                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                    : simulation.isWarning
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
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
            <div className="bg-white rounded-xl p-3.5 border border-blue-200/80 shadow-sm space-y-2 mt-4">
              <span className="text-[11px] text-blue-950 font-bold block mb-1">
                ผลพยากรณ์ล่วงหน้าภายใต้สภาวะจำลองนี้:
              </span>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-blue-50/60 p-2.5 rounded-lg border border-blue-100">
                  <span className="text-[10px] text-slate-500 font-medium block">+1 ชม.</span>
                  <span className="font-mono font-extrabold text-blue-900 text-sm">{simulation.p1} ม.</span>
                </div>
                <div className="bg-blue-50/60 p-2.5 rounded-lg border border-blue-100">
                  <span className="text-[10px] text-slate-500 font-medium block">+2 ชม.</span>
                  <span className="font-mono font-extrabold text-amber-700 text-sm">{simulation.p2} ม.</span>
                </div>
                <div className="bg-blue-50/60 p-2.5 rounded-lg border border-blue-100">
                  <span className="text-[10px] text-slate-500 font-medium block">+3 ชม.</span>
                  <span className="font-mono font-extrabold text-rose-700 text-sm">{simulation.p3} ม.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Trigger Button */}
          <button
            onClick={handleApplyToForecast}
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center space-x-2 transition shadow-md shadow-blue-500/20"
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

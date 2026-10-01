import React from 'react';
import { Waves, Radio } from 'lucide-react';
import type { Station } from '../types';

interface NavbarProps {
  stations: Station[];
  selectedStation: Station | null;
  onSelectStation: (stn: Station) => void;
  systemStatus: 'healthy' | 'warning' | 'error';
}

export const Navbar: React.FC<NavbarProps> = ({
  stations,
  selectedStation,
  onSelectStation,
  systemStatus,
}) => {
  return (
    <header className="bg-gradient-to-r from-[#071e3d] via-[#103766] to-[#0284c7] border-b border-sky-400/30 text-white sticky top-0 z-50 shadow-xl shadow-blue-950/25">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        
        {/* Brand & Municipal Identity */}
        <div className="flex items-center space-x-3 shrink-0">
          <div className="relative shrink-0">
            <div className="bg-gradient-to-br from-sky-400 to-blue-600 p-2 rounded-xl flex items-center justify-center shadow-lg shadow-sky-500/30 border border-white/20">
              <Waves className="w-5 h-5 text-white animate-pulse" />
            </div>
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[#071e3d] animate-ping" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[#071e3d]" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-black text-lg tracking-tight text-white leading-tight font-sans">
                Hatyai FloodLens
              </span>
              <span className="bg-sky-400/25 text-sky-200 text-[10px] px-2 py-0.5 rounded-full font-bold border border-sky-300/30 shadow-sm hidden sm:inline-block">
                AI EARLY WARNING
              </span>
            </div>
            <p className="text-[11px] text-sky-100/80 font-medium leading-none mt-0.5 hidden sm:block">
              ศูนย์เฝ้าระวังและพยากรณ์ระดับน้ำลุ่มน้ำคลองอู่ตะเภา &bull; เทศบาลนครหาดใหญ่
            </p>
          </div>
        </div>

        {/* Center: Dropdown Station Selector (แบบแถบเลือกสถานีเหมือนเดิม) */}
        <div className="flex items-center space-x-2 bg-black/30 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-white/20 shadow-inner">
          <span className="text-xs text-sky-200 font-semibold shrink-0">จุดตรวจวัด:</span>
          <select
            value={selectedStation?.station_code || ''}
            onChange={(e) => {
              const found = stations.find((s) => s.station_code === e.target.value);
              if (found) onSelectStation(found);
            }}
            className="bg-transparent text-xs sm:text-sm font-bold text-white focus:outline-none cursor-pointer pr-1 truncate max-w-[180px] sm:max-w-none"
          >
            {stations.map((stn) => (
              <option key={stn.station_code} value={stn.station_code} className="bg-slate-900 text-white font-medium">
                {stn.name} ({stn.station_code})
              </option>
            ))}
          </select>
        </div>

        {/* Right: Live Telemetry Indicator */}
        <div className="shrink-0 flex items-center">
          <div
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs font-bold border backdrop-blur-md shadow-sm transition-all ${
              systemStatus === 'healthy'
                ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-100 shadow-emerald-500/10'
                : 'bg-amber-500/20 border-amber-400/40 text-amber-100 shadow-amber-500/10'
            }`}
          >
            <Radio className={`w-3.5 h-3.5 shrink-0 ${systemStatus === 'healthy' ? 'text-emerald-300 animate-pulse' : 'text-amber-300'}`} />
            <span className="leading-tight font-extrabold text-[11px]">
              {systemStatus === 'healthy' ? 'ระบบออนไลน์ (LIVE)' : 'กำลังเชื่อมต่อ'}
            </span>
          </div>
        </div>

      </div>
    </header>
  );
};

export default Navbar;

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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between gap-4">
        
        {/* Brand & Municipal Identity */}
        <div className="flex items-center space-x-3.5 py-2">
          <div className="relative">
            <div className="bg-gradient-to-br from-sky-400 to-blue-600 p-2.5 rounded-2xl flex items-center justify-center shadow-lg shadow-sky-500/30 border border-white/20">
              <Waves className="w-6 h-6 text-white animate-pulse" />
            </div>
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#071e3d] animate-ping" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#071e3d]" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-black text-xl tracking-tight text-white drop-shadow-sm font-sans">
                Hatyai FloodLens
              </span>
              <span className="bg-sky-400/25 text-sky-200 text-[11px] px-2.5 py-0.5 rounded-full font-bold border border-sky-300/30 shadow-sm hidden sm:inline-flex items-center space-x-1">
                <span>AI EARLY WARNING</span>
              </span>
            </div>
            <p className="text-[12px] text-sky-100/90 font-medium">
              ศูนย์เฝ้าระวังและพยากรณ์ระดับน้ำลุ่มน้ำคลองอู่ตะเภา &bull; เทศบาลนครหาดใหญ่
            </p>
          </div>
        </div>

        {/* Center: Strategic Station Switcher Tabs */}
        <div className="hidden md:flex items-center bg-black/25 p-1 rounded-2xl border border-white/15 backdrop-blur-md shadow-inner">
          <div className="flex items-center space-x-1">
            {stations.map((stn) => {
              const isSelected = selectedStation?.station_code === stn.station_code;
              const shortCode = stn.station_code.replace('STN-', '');
              const shortName = stn.name.split(' ')[0];
              return (
                <button
                  key={stn.station_code}
                  onClick={() => onSelectStation(stn)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
                    isSelected
                      ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/30 border border-white/30 scale-[1.02]'
                      : 'text-sky-100/80 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white animate-pulse' : 'bg-sky-300/60'}`} />
                  <span>{shortName}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${isSelected ? 'bg-black/30 text-white' : 'text-sky-200'}`}>
                    {shortCode}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Live Telemetry Indicator & Mobile Selector */}
        <div className="flex items-center space-x-3">
          {/* Mobile Station Selector Dropdown */}
          <div className="md:hidden flex items-center bg-black/30 px-2.5 py-1.5 rounded-xl border border-white/20">
            <select
              value={selectedStation?.station_code || ''}
              onChange={(e) => {
                const found = stations.find((s) => s.station_code === e.target.value);
                if (found) onSelectStation(found);
              }}
              className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer"
            >
              {stations.map((stn) => (
                <option key={stn.station_code} value={stn.station_code} className="bg-slate-900 text-white">
                  {stn.name.split(' ')[0]} ({stn.station_code.replace('STN-', '')})
                </option>
              ))}
            </select>
          </div>

          {/* System Health Badge */}
          <div
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-bold border backdrop-blur-md shadow-sm transition-all ${
              systemStatus === 'healthy'
                ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-100 shadow-emerald-500/10'
                : 'bg-amber-500/20 border-amber-400/40 text-amber-100 shadow-amber-500/10'
            }`}
          >
            <Radio className={`w-3.5 h-3.5 ${systemStatus === 'healthy' ? 'text-emerald-300 animate-pulse' : 'text-amber-300'}`} />
            <div className="flex flex-col text-left">
              <span className="leading-tight font-extrabold text-[11px]">
                {systemStatus === 'healthy' ? 'ระบบออนไลน์ (LIVE)' : 'กำลังเชื่อมต่อ'}
              </span>
              <span className="text-[9px] text-sky-200/80 font-normal leading-none hidden lg:inline">
                AI Vision & Telemetry Active
              </span>
            </div>
          </div>
        </div>

      </div>
    </header>
  );
};

export default Navbar;

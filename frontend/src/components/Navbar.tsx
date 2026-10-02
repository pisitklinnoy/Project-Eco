import React from 'react';
import { Waves, Radio, MapPin, ChevronDown, Bell } from 'lucide-react';
import type { Station } from '../types';

interface NavbarProps {
  stations: Station[];
  selectedStation: Station | null;
  onSelectStation: (stn: Station) => void;
  systemStatus: 'healthy' | 'warning' | 'error';
  activeSection?: string;
  onNavigate?: (sectionId: string) => void;
  alertCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  stations,
  selectedStation,
  onSelectStation,
  systemStatus,
  activeSection = 'hero',
  onNavigate = () => {},
  alertCount = 0,
}) => {
  const navLinks = [
    { id: 'hero', label: 'ภาพรวม' },
    { id: 'gis-cctv', label: 'แผนที่ GIS & กล้อง' },
    { id: 'cctv-inspector', label: 'AI Staff Gauge' },
    { id: 'simulation', label: 'จำลองสภาวะน้ำ' },
    { id: 'forecast-alerts', label: 'พยากรณ์ล่วงหน้า' },
  ];

  return (
    <header className="sticky top-3 sm:top-5 z-40 w-full px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto transition-all duration-300">
      <div className="rounded-full bg-white/80 backdrop-blur-2xl border border-white/90 shadow-[0_16px_40px_-10px_rgba(15,23,42,0.07)] px-3.5 sm:px-5 py-2.5 flex items-center justify-between gap-3 select-none">
        
        {/* Brand & Municipal Identity */}
        <div
          onClick={() => onNavigate('hero')}
          className="flex items-center space-x-2.5 shrink-0 cursor-pointer group"
        >
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 via-sky-500 to-blue-700 p-2 flex items-center justify-center shadow-md shadow-blue-500/25 border border-white/40 group-hover:scale-105 transition-transform duration-200">
              <Waves className="w-5 h-5 text-white animate-pulse" />
            </div>
            <span className="absolute 0 top-0 right-0 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-white animate-ping" />
            <span className="absolute 0 top-0 right-0 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-white" />
          </div>

          <div className="hidden sm:block">
            <div className="flex items-center space-x-1.5">
              <span className="font-black text-sm tracking-tight text-slate-900 leading-none">
                FloodLens
              </span>
              <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-slate-900 text-white tracking-widest leading-none">
                AI
              </span>
            </div>
            <p className="text-[10px] text-slate-500 font-medium leading-none mt-1">
              เทศบาลนครหาดใหญ่ &bull; ลุ่มน้ำคลองอู่ตะเภา
            </p>
          </div>
        </div>

        {/* Center: Main Navigation (Desktop) */}
        <nav className="hidden md:flex items-center space-x-1 bg-slate-100/70 p-1 rounded-full border border-slate-200/50">
          {navLinks.map((link) => {
            const isActive = activeSection === link.id;
            return (
              <button
                key={link.id}
                onClick={() => onNavigate(link.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200/60 font-black'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                {link.label}
              </button>
            );
          })}
        </nav>

        {/* Right: Station Selector & Telemetry Status */}
        <div className="flex items-center space-x-2 shrink-0">
          {/* Station Selector Pill */}
          <div className="relative flex items-center bg-slate-100/90 hover:bg-slate-100 border border-slate-200/80 rounded-full px-3 py-1.5 shadow-inner transition-colors">
            <MapPin className="w-3.5 h-3.5 text-blue-600 mr-1.5 shrink-0" />
            <select
              value={selectedStation?.station_code || ''}
              onChange={(e) => {
                const found = stations.find((s) => s.station_code === e.target.value);
                if (found) onSelectStation(found);
              }}
              className="bg-transparent text-xs font-extrabold text-slate-800 focus:outline-none cursor-pointer pr-4 appearance-none max-w-[140px] sm:max-w-[200px] truncate"
            >
              {stations.map((stn) => (
                <option
                  key={stn.station_code}
                  value={stn.station_code}
                  className="bg-white text-slate-900 font-semibold"
                >
                  {stn.name.split(' ')[0]} ({stn.station_code})
                </option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2.5 pointer-events-none" />
          </div>

          {/* Alert Notification Indicator */}
          <button
            onClick={() => onNavigate('forecast-alerts')}
            title="การแจ้งเตือนภัยน้ำท่วม"
            className="relative w-8 h-8 rounded-full bg-slate-100/90 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors cursor-pointer border border-slate-200/70"
          >
            <Bell className="w-3.5 h-3.5" />
            {alertCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-white">
                {alertCount}
              </span>
            )}
          </button>

          {/* Live Heartbeat Status Pill */}
          <div
            className={`hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
              systemStatus === 'healthy'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-800'
            }`}
          >
            <Radio
              className={`w-3 h-3 shrink-0 ${
                systemStatus === 'healthy' ? 'text-emerald-600 animate-pulse' : 'text-amber-600'
              }`}
            />
            <span className="text-[11px] font-extrabold tracking-tight">LIVE</span>
          </div>
        </div>

      </div>
    </header>
  );
};

export default Navbar;

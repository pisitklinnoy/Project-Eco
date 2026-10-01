import React from 'react';
import { Waves, ExternalLink } from 'lucide-react';
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
    <header className="bg-gradient-to-r from-[#0b2545] via-[#134074] to-[#0284c7] border-b border-sky-400/30 text-white sticky top-0 z-50 shadow-lg shadow-blue-950/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="bg-white/10 backdrop-blur-md p-2 rounded-xl flex items-center justify-center border border-white/20 shadow-md">
            <Waves className="w-6 h-6 text-sky-300 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-lg tracking-tight text-white drop-shadow-sm">
                Hatyai FloodLens
              </span>
              <span className="bg-sky-400/20 text-sky-200 text-xs px-2.5 py-0.5 rounded-full font-semibold border border-sky-300/30 shadow-sm">
                ศูนย์เฝ้าระวังน้ำท่วม AI
              </span>
            </div>
            <p className="text-xs text-sky-100/80 font-medium">
              ระบบโทรมาตรและพยากรณ์ระดับน้ำลุ่มน้ำคลองอู่ตะเภา 1–3 ชม.
            </p>
          </div>
        </div>

        {/* Station Selector & Status */}
        <div className="flex items-center space-x-4">
          <div className="hidden md:flex items-center space-x-2 bg-black/20 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/15">
            <span className="text-xs text-sky-200 font-medium">จุดตรวจวัด:</span>
            <select
              value={selectedStation?.station_code || ''}
              onChange={(e) => {
                const found = stations.find((s) => s.station_code === e.target.value);
                if (found) onSelectStation(found);
              }}
              className="bg-transparent text-sm font-bold text-white focus:outline-none cursor-pointer"
            >
              {stations.map((stn) => (
                <option key={stn.station_code} value={stn.station_code} className="bg-slate-900 text-white">
                  {stn.name} ({stn.station_code})
                </option>
              ))}
            </select>
          </div>

          {/* Quick System Links */}
          <div className="hidden lg:flex items-center space-x-2 border-l border-white/20 pl-4 text-xs">
            <a
              href="http://localhost:8000/docs"
              target="_blank"
              rel="noreferrer"
              className="text-sky-100 hover:text-white flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 transition font-medium"
            >
              <span>Swagger API</span>
              <ExternalLink className="w-3 h-3 text-sky-300" />
            </a>
            <a
              href="http://localhost:5000"
              target="_blank"
              rel="noreferrer"
              className="text-sky-100 hover:text-white flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 transition font-medium"
            >
              <span>MLflow</span>
              <ExternalLink className="w-3 h-3 text-purple-300" />
            </a>
            <a
              href="http://localhost:8085"
              target="_blank"
              rel="noreferrer"
              className="text-sky-100 hover:text-white flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 transition font-medium"
            >
              <span>Label Studio</span>
              <ExternalLink className="w-3 h-3 text-amber-300" />
            </a>
          </div>

          {/* System Health */}
          <div className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold border backdrop-blur-md ${
            systemStatus === 'healthy' 
              ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200' 
              : 'bg-amber-500/20 border-amber-400/40 text-amber-200'
          }`}>
            <span className={`w-2 h-2 rounded-full ${systemStatus === 'healthy' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
            <span>{systemStatus === 'healthy' ? 'สถานะ: ปกติ (Online)' : 'กำลังเชื่อมต่อ'}</span>
          </div>
        </div>
      </div>
    </header>
  );
};

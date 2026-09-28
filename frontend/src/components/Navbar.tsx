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
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-50 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="bg-blue-600 p-2 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Waves className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-lg tracking-tight">Hatyai FloodLens</span>
              <span className="bg-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded-full font-medium border border-blue-500/30">
                AI Ecosystem
              </span>
            </div>
            <p className="text-xs text-slate-400">ระบบเฝ้าระวังและพยากรณ์ระดับน้ำหาดใหญ่ 1–3 ชม.</p>
          </div>
        </div>

        {/* Station Selector & Status */}
        <div className="flex items-center space-x-4">
          <div className="hidden md:flex items-center space-x-2">
            <span className="text-xs text-slate-400">จุดเฝ้าระวัง:</span>
            <select
              value={selectedStation?.station_code || ''}
              onChange={(e) => {
                const found = stations.find((s) => s.station_code === e.target.value);
                if (found) onSelectStation(found);
              }}
              className="bg-slate-800 border border-slate-700 text-sm rounded-lg px-3 py-1.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            >
              {stations.map((stn) => (
                <option key={stn.station_code} value={stn.station_code}>
                  {stn.name} ({stn.station_code})
                </option>
              ))}
            </select>
          </div>

          {/* Quick System Links */}
          <div className="hidden lg:flex items-center space-x-2 border-l border-slate-800 pl-4 text-xs text-slate-300">
            <a
              href="http://localhost:8000/docs"
              target="_blank"
              rel="noreferrer"
              className="hover:text-blue-400 flex items-center space-x-1 px-2 py-1 rounded bg-slate-800/60 hover:bg-slate-800 transition"
            >
              <span>Swagger API</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href="http://localhost:5000"
              target="_blank"
              rel="noreferrer"
              className="hover:text-purple-400 flex items-center space-x-1 px-2 py-1 rounded bg-slate-800/60 hover:bg-slate-800 transition"
            >
              <span>MLflow</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href="http://localhost:8085"
              target="_blank"
              rel="noreferrer"
              className="hover:text-orange-400 flex items-center space-x-1 px-2 py-1 rounded bg-slate-800/60 hover:bg-slate-800 transition"
            >
              <span>Label Studio</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* System Health */}
          <div className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
            systemStatus === 'healthy' 
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' 
              : 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
          }`}>
            <span className={`w-2 h-2 rounded-full ${systemStatus === 'healthy' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
            <span>{systemStatus === 'healthy' ? 'ระบบออนไลน์' : 'กำลังเชื่อมต่อ'}</span>
          </div>
        </div>
      </div>
    </header>
  );
};

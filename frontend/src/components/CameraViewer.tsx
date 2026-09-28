import React from 'react';
import type { Station, WaterMeasurement } from '../types';
import { Camera, Eye } from 'lucide-react';

interface CameraViewerProps {
  station: Station | null;
  measurement: WaterMeasurement | null;
  onOpenReview: () => void;
}

export const CameraViewer: React.FC<CameraViewerProps> = ({
  station,
  measurement,
  onOpenReview,
}) => {
  if (!station) return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 bg-slate-800/60 border-b border-slate-700/60 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Camera className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-white">กล้อง CCTV ประจำสถานี ({station.camera_id || 'CAM-HY01'})</h3>
        </div>
        <div className="flex items-center space-x-2">
          <span className="flex items-center space-x-1 text-[11px] text-emerald-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Live Stream / Snapshot</span>
          </span>
        </div>
      </div>

      {/* Frame Container */}
      <div className="relative aspect-video bg-slate-950 flex items-center justify-center overflow-hidden group">
        {/* Simulated or Real Frame Representation */}
        <div className="absolute inset-0 bg-gradient-to-b from-sky-900/40 via-slate-900 to-blue-950 flex items-center justify-center">
          {/* Visual Canvas Representation of Hat Yai Canal */}
          <svg className="w-full h-full opacity-80" viewBox="0 0 640 360" preserveAspectRatio="none">
            {/* Bridge / Sky */}
            <rect x="0" y="0" width="640" height="120" fill="#334155" />
            <line x1="0" y1="120" x2="640" y2="120" stroke="#475569" strokeWidth="4" />
            {/* Water Canal */}
            <rect x="0" y="120" width="640" height="240" fill="#0284c7" fillOpacity="0.6" />
            
            {/* Staff Gauge (เสาวัดระดับน้ำ) */}
            <rect x="290" y="80" width="40" height="260" fill="#f8fafc" stroke="#0f172a" strokeWidth="2" />
            {/* Gauge Markings */}
            {[100, 130, 160, 190, 220, 250, 280, 310].map((y, idx) => (
              <g key={y}>
                <line x1="290" y1={y} x2="310" y2={y} stroke="#dc2626" strokeWidth="2" />
                <text x="315" y={y + 4} fill="#0f172a" fontSize="10" fontWeight="bold">
                  {(4.5 - idx * 0.4).toFixed(1)}
                </text>
              </g>
            ))}

            {/* AI Detected Waterline Indicator */}
            <line x1="150" y1="210" x2="490" y2="210" stroke="#38bdf8" strokeWidth="3" strokeDasharray="6,4" />
          </svg>

          {/* Overlay Tag */}
          <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10 text-white text-[11px] font-mono">
            {station.station_code} | {new Date().toLocaleTimeString()} | 640x480
          </div>

          <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-lg border border-blue-500/30 text-blue-300 text-xs flex items-center space-x-1.5 font-semibold">
            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
            <span>AI Waterline: {(measurement?.water_level || 3.12).toFixed(2)} ม.</span>
          </div>

          {/* Quick Review Button Overlay */}
          <div className="absolute bottom-3 right-3 opacity-90 group-hover:opacity-100 transition">
            <button
              onClick={onOpenReview}
              className="bg-blue-600/90 hover:bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg backdrop-blur-md font-semibold flex items-center space-x-1.5 shadow-lg transition"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>ตรวจทานภาพ (Review)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

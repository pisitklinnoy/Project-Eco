import React, { useState, useEffect } from 'react';
import type { Station, WaterMeasurement } from '../types';
import { Camera, Eye, Radio } from 'lucide-react';

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
  const [imgError, setImgError] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(Date.now());

  useEffect(() => {
    setImgError(false);
  }, [station?.station_code]);

  // Auto refresh image every 60s
  useEffect(() => {
    const timer = setInterval(() => {
      setRefreshKey(Date.now());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  if (!station) return null;

  const currentLevel = measurement ? measurement.water_level : station.normal_level;
  const streamUrl = station.camera_stream_url
    ? `${station.camera_stream_url}?t=${refreshKey}`
    : null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 bg-slate-800/60 border-b border-slate-700/60 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Camera className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-white">กล้อง CCTV สด ({station.camera_id || station.station_code})</h3>
        </div>
        <div className="flex items-center space-x-2">
          <span className="flex items-center space-x-1.5 text-[11px] text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
            <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
            <span>LIVE STREAM</span>
          </span>
        </div>
      </div>

      {/* Frame Container */}
      <div className="relative aspect-video bg-slate-950 flex items-center justify-center overflow-hidden group">
        {streamUrl && !imgError ? (
          <img
            src={streamUrl}
            alt={station.name}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover object-center"
          />
        ) : (
          /* Simulated Canal SVG Fallback */
          <div className="absolute inset-0 bg-gradient-to-b from-sky-900/40 via-slate-900 to-blue-950 flex items-center justify-center">
            <svg className="w-full h-full opacity-80" viewBox="0 0 640 360" preserveAspectRatio="none">
              <rect x="0" y="0" width="640" height="120" fill="#334155" />
              <line x1="0" y1="120" x2="640" y2="120" stroke="#475569" strokeWidth="4" />
              <rect x="0" y="120" width="640" height="240" fill="#0284c7" fillOpacity="0.6" />
              <rect x="290" y="80" width="40" height="260" fill="#f8fafc" stroke="#0f172a" strokeWidth="2" />
              {[100, 130, 160, 190, 220, 250, 280, 310].map((y, idx) => (
                <g key={y}>
                  <line x1="290" y1={y} x2="310" y2={y} stroke="#dc2626" strokeWidth="2" />
                  <text x="315" y={y + 4} fill="#0f172a" fontSize="10" fontWeight="bold">
                    {(4.5 - idx * 0.4).toFixed(1)}
                  </text>
                </g>
              ))}
              <line x1="150" y1="210" x2="490" y2="210" stroke="#38bdf8" strokeWidth="3" strokeDasharray="6,4" />
            </svg>
          </div>
        )}

        {/* AI Waterline Overlay Line */}
        <div className="absolute inset-x-8 top-[55%] pointer-events-none border-b-2 border-dashed border-sky-400 opacity-80 shadow-[0_0_12px_rgba(56,189,248,0.8)] flex items-center justify-between">
          <span className="text-[10px] bg-sky-500 text-slate-950 font-bold px-1.5 py-0.5 rounded -translate-y-3">
            AI Waterline Target
          </span>
          <span className="text-[10px] text-sky-300 font-mono -translate-y-3 bg-slate-900/80 px-1 rounded">
            Conf: {(measurement?.vision_confidence ? measurement.vision_confidence * 100 : 92).toFixed(0)}%
          </span>
        </div>

        {/* Top-Left Station & Source Tag */}
        <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10 text-white text-[11px] font-mono flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          <span>{station.station_code} | {station.name.split(' ')[0]}</span>
        </div>

        {/* Bottom-Left AI Detected Water Level */}
        <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-lg border border-blue-500/40 text-blue-300 text-xs flex items-center space-x-1.5 font-semibold">
          <span className="w-2 h-2 rounded-full bg-blue-400"></span>
          <span>ระดับน้ำตรวจวัด: {currentLevel.toFixed(2)} ม.</span>
        </div>

        {/* Bottom-Right Quick Review Button */}
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
  );
};

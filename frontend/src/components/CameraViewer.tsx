import React, { useState, useEffect } from 'react';
import type { Station, WaterMeasurement } from '../types';
import { Camera, Eye, Radio, Target, Sparkles } from 'lucide-react';

interface CameraViewerProps {
  station: Station | null;
  measurement: WaterMeasurement | null;
  onOpenReview: () => void;
  onOpenCalibrate?: () => void;
}

export const CameraViewer: React.FC<CameraViewerProps> = ({
  station,
  measurement,
  onOpenReview,
  onOpenCalibrate,
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
    <div className="bg-white border-2 border-blue-100 rounded-2xl overflow-hidden shadow-[0_4px_20px_-4px_rgba(2,132,199,0.08)] hover:shadow-[0_8px_30px_-4px_rgba(2,132,199,0.12)] transition-all flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-blue-50/90 via-sky-50/50 to-white border-b border-blue-100 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700">
            <Camera className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              ภาพกล้อง CCTV สด ({station.camera_id || station.station_code})
            </h3>
            <p className="text-[11px] text-slate-500">ตรวจจับเสาวัดน้ำและคำนวณระดับผิวน้ำด้วย AI Vision</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className="flex items-center space-x-1.5 text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 shadow-sm">
            <Radio className="w-3 h-3 text-emerald-600 animate-pulse" />
            <span>LIVE CCTV</span>
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
        {(() => {
          const minLvl = station.normal_level * 0.5;
          const maxLvl = station.bank_level;
          const clampedRatio = Math.min(Math.max((currentLevel - minLvl) / Math.max(1, maxLvl - minLvl), 0.05), 0.95);
          const topPercent = Math.round(82 - clampedRatio * 57);
          return (
            <div
              className="absolute inset-x-6 pointer-events-none border-b-2 border-dashed border-sky-400 opacity-90 shadow-[0_0_14px_rgba(56,189,248,0.9)] flex items-center justify-between transition-all duration-700 ease-out"
              style={{ top: `${topPercent}%` }}
            >
              <span className="text-[10px] bg-blue-600 text-white font-extrabold px-2 py-0.5 rounded shadow -translate-y-3 flex items-center space-x-1">
                <Sparkles className="w-3 h-3 text-sky-200" />
                <span>AI ผิวน้ำ: {currentLevel.toFixed(2)} ม.</span>
              </span>
              <span className="text-[10px] text-sky-200 font-mono -translate-y-3 bg-black/80 border border-sky-400/40 px-2 py-0.5 rounded shadow">
                ความเชื่อมั่น: {(measurement?.vision_confidence ? measurement.vision_confidence * 100 : 90).toFixed(0)}%
              </span>
            </div>
          );
        })()}

        {/* Top-Left Station & Source Tag */}
        <div className="absolute top-3 left-3 bg-black/75 backdrop-blur-md px-3 py-1 rounded-lg border border-white/20 text-white text-[11px] font-mono flex items-center space-x-2 shadow-lg">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          <span className="font-bold">{station.station_code} | {station.name.split(' ')[0]}</span>
        </div>

        {/* Bottom-Left AI Detected Water Level */}
        <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-blue-200 text-blue-950 text-xs flex items-center space-x-2 font-bold shadow-lg">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
          <span>ระดับน้ำตรวจวัด: <span className="text-blue-600 text-sm font-extrabold">{currentLevel.toFixed(2)}</span> ม.</span>
        </div>

        {/* Bottom-Right Quick Action Buttons */}
        <div className="absolute bottom-3 right-3 opacity-90 group-hover:opacity-100 transition flex items-center space-x-2">
          {onOpenCalibrate && (
            <button
              onClick={onOpenCalibrate}
              className="bg-white/95 hover:bg-white text-slate-800 hover:text-blue-700 text-xs px-3 py-1.5 rounded-xl backdrop-blur-md font-bold flex items-center space-x-1.5 shadow-lg border border-slate-200 transition"
              title="คลิกมาร์ก 2 จุดเพื่อปรับเทียบสเกลเสาวัดน้ำ"
            >
              <Target className="w-3.5 h-3.5 text-blue-600" />
              <span>ปรับเทียบเสา (Calibrate)</span>
            </button>
          )}

          <button
            onClick={onOpenReview}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-xl backdrop-blur-md font-bold flex items-center space-x-1.5 shadow-lg transition"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>ตรวจทานภาพ (Review)</span>
          </button>
        </div>
      </div>
    </div>
  );
};

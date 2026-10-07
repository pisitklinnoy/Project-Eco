import { useEffect, useState } from 'react';
import {
  Camera,
  RefreshCw,
  Eye,
  ChevronDown,
  CloudRain,
  Droplets,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  Layers,
  Flag,
  Sparkles,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  MapPin,
} from 'lucide-react';
import type { Station, WaterMeasurement, RainfallMeasurement, ForecastRecord } from '../types';
import { getStationFlagInfo } from './CameraViewer';
import { SectionHeader } from './ui/SectionHeader';

interface CameraSnapshotProps {
  station: Station;
  stamp: number;
  currentLevel: number;
  onSelect: () => void;
}

function CameraSnapshot({ station, stamp, currentLevel, onSelect }: CameraSnapshotProps) {
  const [imgError, setImgError] = useState(false);
  const flagInfo = getStationFlagInfo(station, currentLevel);

  // Fallback image from pre-rendered high-res benchmarks
  const fallbackUrl = `/ai_dashboards/${station.station_code}.jpg`;
  const streamUrl = `/api/v1/stations/${encodeURIComponent(station.station_code)}/live-feed.jpg?t=${stamp}`;

  const shortCode = station.station_code.includes('MUANGKONG')
    ? 'X.173A'
    : station.station_code.includes('BANGSALA')
    ? 'X.90'
    : 'X.44';

  return (
    <div className="relative w-full aspect-[16/10] sm:aspect-video rounded-2xl overflow-hidden bg-slate-950 shadow-inner border border-slate-800/80 group my-2.5">
      <img
        src={imgError ? fallbackUrl : streamUrl}
        alt={`กล้อง CCTV ${station.name}`}
        onError={() => setImgError(true)}
        className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
      />

      {/* Cinematic subtle vignette for high contrast and readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-slate-950/60 pointer-events-none" />

      {/* Top Overlays: Live Status Pill (Left) & Warning Flag Badge (Right) */}
      <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none gap-2 z-10">
        <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-slate-950/80 backdrop-blur-md text-white text-[11px] font-bold border border-white/15 shadow-sm">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="tracking-tight">กล้องสด</span>
          <span className="text-white/40">&bull;</span>
          <span className="text-sky-300 font-mono font-bold">{shortCode}</span>
        </div>

        <div
          className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full ${flagInfo.containerBg} ${flagInfo.containerBorder} border backdrop-blur-md shadow-md`}
        >
          <Flag className={`w-3 h-3 ${flagInfo.flagColorClass}`} />
          <span className={`text-[11px] font-black tracking-tight ${flagInfo.flagTextClass}`}>
            {flagInfo.flagName}
          </span>
          <span className="text-white/30 text-[10px]">|</span>
          <span className={`text-[10px] font-bold ${flagInfo.flagTextClass}`}>
            {flagInfo.statusTitle}
          </span>
        </div>
      </div>

      {/* Bottom Overlays: Current Water Level Metric (Left) & Quick Inspect (Right) */}
      <div className="absolute bottom-2.5 left-3 right-3 flex items-end justify-between z-10">
        <div className="flex flex-col text-white drop-shadow-md">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
            ระดับน้ำปัจจุบัน
          </span>
          <div className="flex items-baseline space-x-1">
            <span className="text-2xl sm:text-3xl font-black font-mono text-white tracking-tight">
              {currentLevel.toFixed(2)}
            </span>
            <span className="text-xs font-semibold text-slate-300">ม. (รทก.)</span>
          </div>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
            setTimeout(() => {
              const elem = document.getElementById('gis-map-section');
              if (elem) {
                elem.scrollIntoView({ behavior: 'smooth' });
              }
            }, 50);
          }}
          className="px-2.5 py-1.5 rounded-xl bg-sky-500/90 hover:bg-sky-500 text-white text-[11px] font-bold flex items-center space-x-1 shadow-lg backdrop-blur-md transition-all hover:scale-105 cursor-pointer"
          title="สลับไปยังหน้าตรวจวัด AI และดูกราฟสถานีนี้"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>ส่องกล้อง AI</span>
        </button>
      </div>
    </div>
  );
}

interface StationOverviewProps {
  stations: Station[];
  measurements: Record<string, WaterMeasurement>;
  forecasts: Record<string, ForecastRecord>;
  errors: Record<string, string>;
  rain: Record<string, RainfallMeasurement>;
  refreshing: boolean;
  onRefresh: () => void;
  onSelect: (station: Station) => void;
}

export function StationOverview({
  stations,
  measurements,
  rain,
  forecasts,
  errors,
  refreshing,
  onRefresh,
  onSelect,
}: StationOverviewProps) {
  const [stamp, setStamp] = useState(() => Date.now());
  const [expandedStations, setExpandedStations] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const timer = setInterval(() => setStamp(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const toggleExpand = (code: string) => {
    setExpandedStations((prev) => ({
      ...prev,
      [code]: !prev[code],
    }));
  };

  return (
    <section className="space-y-6" aria-label="กล้องและพยากรณ์ระดับน้ำทั้ง 3 สถานี">
      {/* Section Header with integrated luxury action button */}
      <SectionHeader
        number="00"
        badge="Multi-Station Live AI"
        badgeIcon={<Camera className="w-3.5 h-3.5" />}
        title="กล้องและพยากรณ์ระดับน้ำทั้ง 3 สถานี"
        subtitle="ภาพมุมกล้องสด CCTV เรียลไทม์ พร้อมการคาดการณ์ระดับน้ำล่วงหน้า 1–3 ชั่วโมง (RF v2 AI / RID / HII)"
        action={
          <button
            disabled={refreshing}
            onClick={() => {
              setStamp(Date.now());
              onRefresh();
            }}
            className="px-4 py-2.5 rounded-2xl bg-white/90 hover:bg-white text-slate-800 text-xs font-bold border border-slate-200/90 shadow-sm hover:shadow-md transition-all flex items-center space-x-2 cursor-pointer disabled:opacity-50 select-none"
            title="อัปเดตข้อมูลระดับน้ำ ฝน และพยากรณ์ใหม่ทั้ง 3 สถานี"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-sky-600 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'กำลังดึงข้อมูลและคำนวณ…' : 'อัปเดตทั้ง 3 สถานี'}</span>
          </button>
        }
      />

      {/* 3-Column Luxury Station Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stations.map((station) => {
          const measurement = measurements[station.station_code];
          const forecast = forecasts[station.station_code];
          const rainfall = rain[station.station_code];
          const currentLevel = measurement ? measurement.water_level : station.normal_level;
          const isExpanded = !!expandedStations[station.station_code];

          const shortCode = station.station_code.includes('MUANGKONG')
            ? 'X.173A'
            : station.station_code.includes('BANGSALA')
            ? 'X.90'
            : 'X.44';

          const delta1h = forecast ? forecast.predicted_1h - currentLevel : 0;

          return (
            <article
              key={station.station_code}
              className="group relative bg-white/90 backdrop-blur-xl border border-slate-200/80 hover:border-sky-300/80 rounded-3xl p-4 sm:p-5 shadow-lg shadow-slate-200/40 hover:shadow-2xl hover:shadow-sky-500/10 transition-all duration-300 flex flex-col justify-between"
            >
              <div>
                {/* Station Title & Location Header */}
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="min-w-0">
                    <h3
                      onClick={() => onSelect(station)}
                      className="font-black text-slate-900 text-sm sm:text-base leading-snug group-hover:text-sky-600 transition-colors cursor-pointer truncate"
                      title={station.name}
                    >
                      {station.name}
                    </h3>
                    <p className="text-[11px] text-slate-400 font-medium flex items-center gap-1 mt-0.5 truncate">
                      <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="truncate">{station.location_name || 'จุดเฝ้าระวังหลัก'}</span>
                    </p>
                  </div>

                  <span className="shrink-0 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-mono font-bold tracking-tight border border-slate-200/70">
                    {shortCode}
                  </span>
                </div>

                {/* Hero Camera Photo View (Focal Point) */}
                <CameraSnapshot
                  key={`${station.station_code}-${stamp}`}
                  station={station}
                  stamp={stamp}
                  currentLevel={currentLevel}
                  onSelect={() => onSelect(station)}
                />

                {/* Quick Key Metrics Ribbon (3 Clean Columns) */}
                <div className="grid grid-cols-3 gap-1.5 p-2 bg-slate-50/90 rounded-2xl border border-slate-200/80">
                  {/* 1. Water Level */}
                  <div className="flex flex-col items-center justify-center p-1 text-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight flex items-center gap-1">
                      <Droplets className="w-3 h-3 text-sky-500" />
                      <span>ระดับน้ำ</span>
                    </span>
                    <span className="text-xs sm:text-sm font-black font-mono text-slate-800 mt-0.5">
                      {measurement ? `${measurement.water_level.toFixed(2)} ม.` : '—'}
                    </span>
                  </div>

                  {/* 2. Rainfall 1h */}
                  <div className="flex flex-col items-center justify-center p-1 text-center border-x border-slate-200/70">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight flex items-center gap-1">
                      <CloudRain className="w-3 h-3 text-indigo-500" />
                      <span>ฝน 1 ชม.</span>
                    </span>
                    <span className="text-xs sm:text-sm font-black font-mono text-slate-800 mt-0.5">
                      {rainfall ? `${rainfall.rain_amount_1h.toFixed(1)} มม.` : '—'}
                    </span>
                  </div>

                  {/* 3. Forecast +1h */}
                  <div className="flex flex-col items-center justify-center p-1 text-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-amber-500" />
                      <span>คาดการณ์ +1h</span>
                    </span>
                    <span className="text-xs sm:text-sm font-black font-mono text-slate-800 mt-0.5 flex items-center gap-0.5">
                      {forecast ? (
                        <>
                          <span>{forecast.predicted_1h.toFixed(2)} ม.</span>
                          {delta1h > 0.02 ? (
                            <TrendingUp className="w-3 h-3 text-amber-500 shrink-0" />
                          ) : delta1h < -0.02 ? (
                            <TrendingDown className="w-3 h-3 text-emerald-500 shrink-0" />
                          ) : (
                            <Minus className="w-3 h-3 text-slate-400 shrink-0" />
                          )}
                        </>
                      ) : (
                        '—'
                      )}
                    </span>
                  </div>
                </div>

                {/* Expandable Dropdown Accordion Toggle Button */}
                <button
                  type="button"
                  onClick={() => toggleExpand(station.station_code)}
                  className={`w-full mt-2.5 py-2 px-3 rounded-2xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer select-none ${
                    isExpanded
                      ? 'bg-sky-50/80 border-sky-200 text-sky-800'
                      : 'bg-white hover:bg-slate-50 border-slate-200/80 text-slate-700 shadow-sm'
                  }`}
                >
                  <span className="flex items-center space-x-1.5">
                    <Layers className="w-3.5 h-3.5 text-sky-600" />
                    <span>
                      {isExpanded
                        ? 'ย่อรายละเอียดการพยากรณ์'
                        : 'ดูรายละเอียดการพยากรณ์ 3 ชม. & ฝน'}
                    </span>
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-300 text-slate-500 ${
                      isExpanded ? 'rotate-180 text-sky-600' : ''
                    }`}
                  />
                </button>

                {/* Dropdown Expanded Details Container */}
                {isExpanded && (
                  <div className="mt-3 space-y-3 pt-2.5 border-t border-slate-200/80">
                    {/* 3-Hour Forecast Horizon Cards */}
                    {forecast ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                          <span className="flex items-center gap-1 text-slate-700">
                            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                            <span>คาดการณ์ระดับน้ำ 3 ชม. ข้างหน้า (RF v2 AI)</span>
                          </span>
                          <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            {forecast.context_json?.mode === 'replay' ? 'Replay' : 'Operational'}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { h: 1, val: forecast.predicted_1h },
                            { h: 2, val: forecast.predicted_2h },
                            { h: 3, val: forecast.predicted_3h },
                          ].map(({ h, val }) => {
                            const futureTime = new Date(
                              new Date(forecast.forecast_time).getTime() + h * 3600000
                            );
                            const delta = currentLevel ? val - currentLevel : 0;
                            return (
                              <div
                                key={h}
                                className="bg-sky-50/70 border border-sky-100 rounded-xl p-2 text-center"
                              >
                                <span className="text-[10px] font-extrabold text-sky-700 block">
                                  +{h} ชม.
                                </span>
                                <span className="text-xs font-black font-mono text-slate-900 block my-0.5">
                                  {val.toFixed(2)} ม.
                                </span>
                                <span
                                  className={`text-[10px] font-bold block ${
                                    delta > 0.02
                                      ? 'text-amber-600'
                                      : delta < -0.02
                                      ? 'text-emerald-600'
                                      : 'text-slate-400'
                                  }`}
                                >
                                  {delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)} ม.
                                </span>
                                <span className="text-[9px] text-slate-400 block font-mono">
                                  {futureTime.toLocaleTimeString('th-TH', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-amber-50/80 border border-amber-200/60 rounded-xl text-xs text-amber-700 flex items-center space-x-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
                        <span>
                          {errors[station.station_code] ||
                            (refreshing
                              ? 'กำลังประมวลผลโมเดล...'
                              : 'ยังไม่มีข้อมูลพอสำหรับพยากรณ์')}
                        </span>
                      </div>
                    )}

                    {/* Detailed Rainfall HII Section */}
                    <div className="p-2.5 bg-slate-50/90 border border-slate-200/70 rounded-xl space-y-1.5 text-xs text-slate-600">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-700 flex items-center gap-1.5">
                          <CloudRain className="w-3.5 h-3.5 text-indigo-500" />
                          <span>สถานีฝน HII ({rainfall?.rain_station_code ?? '—'})</span>
                        </span>
                        <span className="font-mono text-[11px] font-bold text-slate-800">
                          {rainfall?.rain_amount_1h.toFixed(1) ?? '—'} มม./ชม.
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>ฝนสะสม 24 ชม.:</span>
                        <span className="font-mono font-bold text-slate-700">
                          {rainfall?.rain_amount_24h?.toFixed(1) ?? '—'} มม.
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-200/60">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>
                            {rainfall
                              ? `เวลาข้อมูล: ${new Date(rainfall.timestamp).toLocaleTimeString(
                                  'th-TH',
                                  { hour: '2-digit', minute: '2-digit' }
                                )} น.`
                              : 'รอข้อมูลฝน'}
                          </span>
                        </span>
                        {rainfall && rainfall.age_minutes > 120 && (
                          <span className="text-amber-600 font-bold">ข้อมูลล่าช้า &gt;2h</span>
                        )}
                      </div>
                    </div>

                    {/* Model & Input Data Quality Status */}
                    {forecast && (
                      <div className="text-[11px] px-2.5 py-1.5 rounded-lg bg-emerald-50/70 border border-emerald-200/60 text-emerald-800 flex items-center justify-between">
                        <span className="flex items-center gap-1.5 font-medium">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>
                            {forecast.context_json?.rain_available === false
                              ? forecast.context_json.rain_input_summary?.used_count
                                ? `ฝนจริง ${forecast.context_json.rain_input_summary.used_count}/${forecast.context_json.rain_input_summary.total_count} ตัวแปร`
                                : 'ข้อมูลฝนบางชั่วโมงขาด'
                              : 'ใช้ข้อมูลฝนและระดับน้ำครบถ้วน'}
                          </span>
                        </span>
                        <span className="font-mono text-[10px] text-emerald-600 font-bold">
                          RF v2
                        </span>
                      </div>
                    )}

                    {/* Action Button: Navigate to Station Full Graph & AI Vision */}
                    <button
                      type="button"
                      onClick={() => onSelect(station)}
                      className="w-full py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black flex items-center justify-center space-x-1.5 shadow-sm transition-all cursor-pointer group/btn mt-1"
                    >
                      <span>เปิดดูกราฟและกล้องตรวจวัดสถานีนี้</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover/btn:translate-x-1 transition-transform" />
                    </button>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

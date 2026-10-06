import React from 'react';
import type { Station, WaterMeasurement, ForecastRecord, AlertEvent } from '../types';
import { ForecastChart } from './ForecastChart';
import { ForecastHistory } from './ForecastHistory';
import { AlertsList } from './AlertsList';
import { SectionHeader } from './ui/SectionHeader';
import { getStationFlagInfo } from './CameraViewer';
import {
  ShieldAlert,
  LifeBuoy,
  MapPin,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react';

interface PublicForecastViewProps {
  stations: Station[];
  station: Station | null;
  onSelectStation: (stn: Station) => void;
  history: WaterMeasurement[];
  forecast: ForecastRecord | null;
  alerts: AlertEvent[];
  forecastError: string;
  triggeringForecast: boolean;
  onTriggerForecast: () => void;
  onAlertCreated: () => void;
  stationMeasurements?: Record<string, WaterMeasurement>;
}

export const PublicForecastView: React.FC<PublicForecastViewProps> = ({
  stations,
  station,
  onSelectStation,
  history,
  forecast,
  alerts,
  forecastError,
  triggeringForecast,
  onTriggerForecast,
  onAlertCreated,
  stationMeasurements = {},
}) => {
  return (
    <div className="space-y-8 animate-fadeIn">
      <SectionHeader
        number="02"
        badge="Early Warning Horizon"
        title="ระบบพยากรณ์ระดับน้ำล่วงหน้า 1–3 ชม. & การแจ้งเตือนภัย"
        subtitle="ประเมินแนวโน้มมวลน้ำคลองอู่ตะเภาด้วยแบบจำลอง AI (LightGBM) พร้อมระบบส่งข้อความแจ้งเตือนภัยฉุกเฉิน"
        actionLabel="AI 3-Hour Horizon"
      />

      {/* ========================================================================= */}
      {/* Station Selector Bar (เลือกสถานีพยากรณ์ได้ทันทีจากหน้านี้)                        */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs font-extrabold text-slate-700 uppercase tracking-wider">
            <MapPin className="w-4 h-4 text-blue-600" />
            <span>เลือกสถานีตรวจวัด & พยากรณ์ระดับน้ำ (3 สถานีหลักลุ่มน้ำคลองอู่ตะเภา):</span>
          </div>
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            คลิกที่การ์ดเพื่อสลับดูกราฟและผลพยากรณ์ของสถานีนั้นๆ ทันที
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {stations.map((stn) => {
            const isSelected = station?.station_code === stn.station_code;
            const meas = stationMeasurements[stn.station_code];
            const currentLevel = meas ? meas.water_level : stn.normal_level;
            const flag = getStationFlagInfo(stn, currentLevel);
            const shortCode = stn.station_code.includes('MUANGKONG')
              ? 'X.173A'
              : stn.station_code.includes('BANGSALA')
              ? 'X.90'
              : 'X.44';

            return (
              <button
                key={stn.station_code}
                onClick={() => onSelectStation(stn)}
                className={`relative text-left p-4 rounded-[24px] transition-all duration-200 cursor-pointer border flex flex-col justify-between space-y-3 group ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xl shadow-slate-900/15 scale-[1.02]'
                    : 'bg-white/80 hover:bg-white text-slate-800 border-white/90 shadow-sm hover:shadow-md hover:border-blue-200'
                }`}
              >
                {/* Header: Short Code & Flag Indicator */}
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center space-x-2">
                    <span
                      className={`text-[10px] font-mono font-black px-2 py-0.5 rounded-lg uppercase ${
                        isSelected
                          ? 'bg-white/15 text-blue-300 border border-white/20'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {shortCode}
                    </span>
                    <span className="text-[11px] font-bold truncate max-w-[130px]">
                      {stn.name.split(' ')[0]}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${flag.dotColor} ${flag.pingDotColor}`} />
                    <span className={`text-[11px] font-bold ${isSelected ? 'text-white' : flag.flagTextClass}`}>
                      {flag.flagName}
                    </span>
                  </div>
                </div>

                {/* Body: Water Level & Bank Distance */}
                <div className="flex items-baseline justify-between w-full pt-1">
                  <div>
                    <div className="flex items-baseline space-x-1.5">
                      <span className={`text-2xl font-black font-display tracking-tight ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                        {currentLevel.toFixed(2)}
                      </span>
                      <span className={`text-xs font-bold ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                        ม. รทก.
                      </span>
                    </div>
                    <span className={`text-[11px] font-medium block mt-0.5 ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                      {flag.statusTitle} &bull; ตลิ่ง {stn.bank_level.toFixed(2)} ม.
                    </span>
                  </div>

                  {/* Active Indicator or Action Icon */}
                  <div
                    className={`w-7 h-7 rounded-xl flex items-center justify-center transition-transform group-hover:translate-x-0.5 ${
                      isSelected
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600'
                    }`}
                  >
                    {isSelected ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Municipal Emergency Hotline Banner */}
      <div className="rounded-[28px] bg-gradient-to-r from-blue-900 via-sky-900 to-slate-900 p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-80 h-80 bg-sky-400/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/10 text-sky-200 text-xs font-bold border border-white/20">
              <LifeBuoy className="w-3.5 h-3.5 text-sky-300" />
              <span>ศูนย์อำนวยการป้องกันและบรรเทาสาธารณภัย เทศบาลนครหาดใหญ่</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black font-display tracking-tight text-white">
              สายด่วนแจ้งเหตุน้ำท่วม & ขอความช่วยเหลือ 24 ชั่วโมง
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              หากระดับน้ำในพื้นที่เพิ่มสูงอย่างรวดเร็ว หรือต้องการความช่วยเหลือเร่งด่วนในการเคลื่อนย้ายผู้ป่วย/ผู้สูงอายุ
              สามารถติดต่อหน่วยงานที่เกี่ยวข้องได้ทันที
            </p>
          </div>

          {/* Emergency Hotline Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 shrink-0">
            <a
              href="tel:199"
              className="flex flex-col p-3 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 transition-all text-center group cursor-pointer"
            >
              <span className="text-[10px] text-slate-300 font-semibold">ดับเพลิง & กู้ภัยหาดใหญ่</span>
              <span className="text-lg font-black text-amber-300 group-hover:scale-105 transition-transform">199</span>
            </a>
            <a
              href="tel:074200000"
              className="flex flex-col p-3 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 transition-all text-center group cursor-pointer"
            >
              <span className="text-[10px] text-slate-300 font-semibold">เทศบาลนครหาดใหญ่</span>
              <span className="text-base font-black text-sky-300 group-hover:scale-105 transition-transform truncate">074-200000</span>
            </a>
            <a
              href="tel:1784"
              className="col-span-2 sm:col-span-1 flex flex-col p-3 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 transition-all text-center group cursor-pointer"
            >
              <span className="text-[10px] text-slate-300 font-semibold">สายด่วน ปภ. (ทั่วประเทศ)</span>
              <span className="text-lg font-black text-rose-300 group-hover:scale-105 transition-transform">1784</span>
            </a>
          </div>
        </div>
      </div>

      {/* Main Forecast & Alerts Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Forecast Chart & Historical Trend (8 Cols) */}
        <div className="lg:col-span-8 space-y-6">
          <ForecastChart
            station={station}
            history={history}
            forecast={forecast}
            onTriggerForecast={onTriggerForecast}
            triggering={triggeringForecast}
            error={forecastError}
          />
          <ForecastHistory
            stationCode={station?.station_code ?? null}
            refreshKey={forecast?.id ?? 0}
          />
        </div>

        {/* Emergency Alerts Feed & Advice Card (4 Cols) */}
        <div className="lg:col-span-4 space-y-6">
          <AlertsList
            alerts={alerts}
            selectedStation={station}
            onAlertCreated={onAlertCreated}
          />

          {/* Citizen Guidance Card */}
          <div className="rounded-[28px] bg-white/80 backdrop-blur-xl border border-white/90 p-5 shadow-sm space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-slate-100">
              <ShieldAlert className="w-5 h-5 text-blue-600" />
              <h4 className="font-extrabold text-sm text-slate-900">เกณฑ์การเตรียมพร้อมสำหรับประชาชน</h4>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-start space-x-2.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1 shrink-0" />
                <div>
                  <span className="font-bold text-emerald-900">ธงเขียว (ภาวะปกติ):</span>
                  <p className="text-emerald-700 mt-0.5">ระดับน้ำอยู่ในเกณฑ์ปลอดภัย ดำเนินชีวิตได้ตามปกติ</p>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-100 flex items-start space-x-2.5">
                <span className="w-2 h-2 rounded-full bg-amber-500 mt-1 shrink-0" />
                <div>
                  <span className="font-bold text-amber-900">ธงเหลือง (เฝ้าระวัง):</span>
                  <p className="text-amber-700 mt-0.5">ระดับน้ำเพิ่มสูง ให้เตรียมยกของมีค่าขึ้นที่สูง และติดตามข่าวสาร</p>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-100 flex items-start space-x-2.5">
                <span className="w-2 h-2 rounded-full bg-rose-500 mt-1 shrink-0" />
                <div>
                  <span className="font-bold text-rose-900">ธงแดง (วิกฤต/ล้นตลิ่ง):</span>
                  <p className="text-rose-700 mt-0.5">มวลน้ำเอ่อล้นตลิ่ง ตัดกระแสไฟฟ้าชั้นล่าง และเตรียมอพยพตามแผน</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicForecastView;

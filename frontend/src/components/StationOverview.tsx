import { useEffect, useState } from 'react';
import type { Station, WaterMeasurement, ForecastRecord } from '../types';

function CameraSnapshot({ station, stamp }: { station: Station; stamp: number }) {
  const [failed, setFailed] = useState(false);
  return <div className="relative h-44 bg-slate-100 rounded-2xl overflow-hidden mb-3">
    <img className={`w-full h-full object-cover ${failed ? 'hidden' : ''}`}
      src={`/api/v1/stations/${encodeURIComponent(station.station_code)}/live-feed.jpg?t=${stamp}`}
      alt={`ภาพกล้อง ${station.name}`} onError={() => setFailed(true)} />
    {failed && <p className="p-6 text-sm text-slate-500">ติดต่อกล้องต้นทางไม่ได้ · ลองรีเฟรชอีกครั้ง</p>}
    <span className="absolute bottom-2 left-2 bg-slate-900/80 text-white rounded-lg px-2 py-1 text-xs">ภาพล่าสุดที่ดึงได้ · ดูเวลาในภาพ</span>
  </div>;
}

export function StationOverview({ stations, measurements, forecasts, errors, refreshing, onRefresh, onSelect }: {
  stations: Station[]; measurements: Record<string, WaterMeasurement>;
  forecasts: Record<string, ForecastRecord>; errors: Record<string, string>;
  refreshing: boolean; onRefresh: () => void; onSelect: (station: Station) => void;
}) {
  const [stamp, setStamp] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setStamp(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  return <section className="space-y-4" aria-label="กล้องและพยากรณ์ทั้ง 3 สถานี">
    <div className="flex justify-between items-center gap-3">
      <h2 className="text-xl font-bold">กล้องและพยากรณ์ระดับน้ำทั้ง 3 สถานี</h2>
      <button disabled={refreshing} className="px-4 py-2 bg-slate-900 text-white rounded-full text-sm disabled:opacity-50"
        onClick={() => { setStamp(Date.now()); onRefresh(); }}>{refreshing ? 'กำลังดึงข้อมูลและคำนวณ…' : 'อัปเดตทั้ง 3 สถานี'}</button>
    </div>
    <div className="grid md:grid-cols-3 gap-4">{stations.map(station => {
      const measurement = measurements[station.station_code];
      const forecast = forecasts[station.station_code];
      return <article key={station.station_code} className="bg-white border border-slate-200 rounded-3xl p-4">
        <h3 className="font-bold text-sm mb-3">{station.name}</h3>
        <CameraSnapshot key={`${station.station_code}-${stamp}`} station={station} stamp={stamp} />
        <p className="text-sm">ระดับน้ำ RID: <strong>{measurement?.water_level.toFixed(2) ?? '—'} ม.</strong></p>
        <p className="text-xs text-slate-500 mb-3">{measurement ? new Date(measurement.timestamp).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : 'รอข้อมูลตรวจวัด'}</p>
        {forecast ? <>
          <p className={`text-xs mb-2 ${forecast.context_json?.mode === 'replay' ? 'text-amber-700' : 'text-sky-700'}`}>
            {forecast.context_json?.mode === 'replay' ? 'Replay · ข้อมูลล่าช้า ไม่ใช่พยากรณ์เวลาปัจจุบัน' : 'RF v2 · พยากรณ์จากข้อมูลล่าสุด'}
          </p>
          <p className="text-xs text-slate-500 mb-2">เวลาข้อมูล: {new Date(forecast.forecast_time).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</p>
          <div className="grid grid-cols-3 gap-2 text-center">{[forecast.predicted_1h, forecast.predicted_2h, forecast.predicted_3h].map((value, index) =>
            <div key={index} className="bg-sky-50 rounded-xl p-2"><div className="text-xs text-slate-500">+{index + 1} ชม.</div><strong>{value.toFixed(2)} ม.</strong>
              <div className="text-xs text-slate-500">{new Date(new Date(forecast.forecast_time).getTime() + (index + 1) * 3600000).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })}</div>
            </div>)}</div>
          {forecast.context_json?.rain_available === false && <p className="text-xs text-amber-700 mt-2">ไม่มีข้อมูลฝนครบ · ผลเพื่อทดลอง</p>}
        </> : <p role="status" className="text-sm text-amber-700">{errors[station.station_code] || (refreshing ? 'กำลังคำนวณโมเดล…' : 'ยังไม่มีข้อมูลพอสำหรับพยากรณ์')}</p>}
        <button className="mt-3 text-sm text-sky-700 font-semibold" onClick={() => onSelect(station)}>ดูกราฟและกล้องสถานีนี้</button>
      </article>;
    })}</div>
  </section>;
}

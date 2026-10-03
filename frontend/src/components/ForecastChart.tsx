import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import type { Station, WaterMeasurement, ForecastRecord } from '../types';
import { TrendingUp, Sparkles } from 'lucide-react';
import { PillButton } from './ui/PillButton';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface ForecastChartProps {
  station: Station | null;
  history: WaterMeasurement[];
  forecast: ForecastRecord | null;
  onTriggerForecast: () => void;
  triggering: boolean;
  error?: string;
}

export const ForecastChart: React.FC<ForecastChartProps> = ({
  station,
  history,
  forecast,
  onTriggerForecast,
  triggering,
  error,
}) => {
  if (!station) return null;

  const issue = forecast ? new Date(forecast.forecast_time).getTime()
    : history.length ? new Date(history[history.length - 1].timestamp).getTime() : null;
  const timeline = issue === null ? [] : Array.from({ length: forecast ? 28 : 25 }, (_, i) => issue + (i - 24) * 3600000);
  const byTime = new Map(history.map(row => [new Date(row.timestamp).getTime(), row.water_level]));
  const allLabels = timeline.map(t => new Date(t).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }));
  const actualDataset = timeline.map(t => byTime.get(t) ?? null);
  const forecastValues = [forecast?.context_json?.current_level_m ?? null, forecast?.predicted_1h ?? null, forecast?.predicted_2h ?? null, forecast?.predicted_3h ?? null];
  const forecastDataset = timeline.map((_, i) => forecast && i >= 24 ? forecastValues[i - 24] : null);
  const historyValues = actualDataset.filter((value): value is number => value !== null);
  const isSimulation = forecast?.context_json?.mode === 'simulation';

  const data = {
    labels: allLabels,
    datasets: [
      {
        label: 'ระดับน้ำ RID (เมตรตามรายงาน)',
        data: actualDataset,
        borderColor: '#0284c7',
        backgroundColor: 'rgba(2, 132, 199, 0.08)',
        borderWidth: 2.5,
        tension: 0.35,
        fill: true,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: '#0284c7',
      },
      {
        label: isSimulation ? 'สถานการณ์จำลอง (สูตรทดลอง)' : 'พยากรณ์ระดับน้ำ AI (เมตรตามรายงาน)',
        data: forecastDataset,
        borderColor: '#d97706',
        borderDash: [6, 4],
        backgroundColor: 'rgba(217, 119, 6, 0.05)',
        borderWidth: 2.5,
        tension: 0.35,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBackgroundColor: '#d97706',
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: '#334155',
          font: { size: 11, weight: 'bold' as const, family: 'Plus Jakarta Sans' },
          usePointStyle: true,
          boxWidth: 8,
        },
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        padding: 10,
        cornerRadius: 12,
        titleColor: '#f8fafc',
        bodyColor: '#e2e8f0',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(226, 232, 240, 0.6)' },
        ticks: { color: '#64748b', font: { size: 10, weight: 'bold' as const } },
      },
      y: {
        grid: { color: 'rgba(226, 232, 240, 0.6)' },
        ticks: { color: '#64748b', font: { size: 10, weight: 'bold' as const } },
        suggestedMin: historyValues.length ? Math.min(...historyValues) - 0.5 : undefined,
      },
    },
  };

  return (
    <div className="relative overflow-hidden rounded-[32px] sm:rounded-[36px] bg-white/85 backdrop-blur-2xl border border-white/80 p-6 sm:p-7 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.05)] transition-all flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-sky-50 text-sky-600 border border-sky-100 flex items-center justify-center shadow-sm">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold font-display text-slate-900">
              กราฟแนวโน้มระดับน้ำและการพยากรณ์ล่วงหน้า 1–3 ชม.
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">เปรียบเทียบข้อมูลย้อนหลัง 24 ชม. และการคาดการณ์มวลน้ำล่วงหน้า</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-[11px] px-3 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold border border-slate-200">
            โหมด: {isSimulation ? 'สถานการณ์จำลอง' : forecast?.input_mode || 'รอข้อมูล'}
          </span>
          <PillButton
            onClick={onTriggerForecast}
            disabled={triggering}
            variant="glass"
            size="sm"
            icon={<Sparkles className={`w-3.5 h-3.5 text-sky-600 ${triggering ? 'animate-spin' : ''}`} />}
            loading={triggering}
            className="!py-1.5 text-xs font-semibold"
          >
            คำนวณพยากรณ์ใหม่
          </PillButton>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="text-xs text-slate-600 mb-3" role="status">
        {error ? <p className="text-amber-700">{error}</p> : !forecast ? <p>ยังไม่มีผลพยากรณ์จากโมเดลที่มีข้อมูลล่าสุดเพียงพอ</p> : (
          <p>{isSimulation ? 'ผลจากสูตรสถานการณ์จำลอง' : forecast.context_json?.mode === 'replay' ? 'คำนวณย้อนหลังจากข้อมูลล่าสุดที่มี (Replay) · ไม่ใช่พยากรณ์ ณ เวลาปัจจุบัน' : 'ผลพยากรณ์เพื่อทดลอง'} · ข้อมูล ณ {new Date(forecast.forecast_time).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}
            {!isSimulation && forecast.context_json?.missing_features?.length ? ` · ข้อมูลเข้าขาด ${forecast.context_json.missing_features.length} ตัวแปร` : ''}
            {!isSimulation && forecast.context_json?.rain_available === false ? ` · ใช้ฝนจริง ${forecast.context_json.rain_input_summary?.used_count ?? 0}/${forecast.context_json.rain_input_summary?.total_count ?? '—'} ตัวแปร · ฝนบางชั่วโมงขาด` : ''}
            {!isSimulation && forecast.context_json?.rain_available === true ? ' · ใช้ฝน HII รายชั่วโมงจริงครบ' : ''}
          </p>
        )}
      </div>
      <div className="w-full h-64 sm:h-72 my-auto">
        <Line data={data} options={options} />
      </div>

      {/* Predictions Cards */}
      <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-slate-100 text-center">
        <div className="p-3 rounded-2xl bg-slate-50/80 border border-slate-200/80 shadow-sm transition-all hover:bg-slate-50">
          <span className="text-[11px] text-slate-500 font-semibold block mb-1">+1 ชม. จากเวลาข้อมูล</span>
          <div className="text-xl font-bold font-display text-slate-900">
            {forecast?.predicted_1h?.toFixed(2) || '-'} <span className="text-xs font-normal text-slate-500">ม.</span>
          </div>
        </div>
        <div className="p-3 rounded-2xl bg-amber-50/60 border border-amber-200/70 shadow-sm transition-all hover:bg-amber-50">
          <span className="text-[11px] text-amber-800 font-semibold block mb-1">+2 ชม. จากเวลาข้อมูล</span>
          <div className="text-xl font-bold font-display text-amber-700">
            {forecast?.predicted_2h?.toFixed(2) || '-'} <span className="text-xs font-normal text-amber-600">ม.</span>
          </div>
        </div>
        <div className="p-3 rounded-2xl bg-rose-50/60 border border-rose-200/70 shadow-sm transition-all hover:bg-rose-50">
          <span className="text-[11px] text-rose-800 font-semibold block mb-1">+3 ชม. จากเวลาข้อมูล</span>
          <div className="text-xl font-bold font-display text-rose-700">
            {forecast?.predicted_3h?.toFixed(2) || '-'} <span className="text-xs font-normal text-rose-600">ม.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForecastChart;

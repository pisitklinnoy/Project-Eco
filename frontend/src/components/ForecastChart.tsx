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
}

export const ForecastChart: React.FC<ForecastChartProps> = ({
  station,
  history,
  forecast,
  onTriggerForecast,
  triggering,
}) => {
  if (!station) return null;

  // Prepare labels & data points
  const recentHistory = history.length > 0 ? history.slice(-8) : [];
  const historyLabels = recentHistory.length > 0
    ? recentHistory.map((h) =>
        new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      )
    : ['ปัจจุบัน'];
  const historyValues = recentHistory.length > 0
    ? recentHistory.map((h) => h.water_level)
    : [station.normal_level];

  // 2. Forecast points
  const forecastLabels = ['+1 ชม.', '+2 ชม.', '+3 ชม.'];
  const allLabels = [...historyLabels, ...forecastLabels];

  // Actual history line (null for forecast part)
  const actualDataset = [...historyValues, null, null, null];

  // Forecast line (connects from last history point)
  const lastHistoryVal = historyValues[historyValues.length - 1] ?? station.normal_level;
  const paddingLength = Math.max(0, historyValues.length - 1);
  const forecastDataset = [
    ...new Array(paddingLength).fill(null),
    lastHistoryVal,
    forecast?.predicted_1h ?? Number((lastHistoryVal + 0.2).toFixed(2)),
    forecast?.predicted_2h ?? Number((lastHistoryVal + 0.4).toFixed(2)),
    forecast?.predicted_3h ?? Number((lastHistoryVal + 0.6).toFixed(2)),
  ];

  const data = {
    labels: allLabels,
    datasets: [
      {
        label: 'ระดับน้ำตรวจวัดจริง (ม. รทก.)',
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
        label: 'พยากรณ์ระดับน้ำ AI (ม. รทก.)',
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
        min: Math.max(0, Math.min(...historyValues, 1.0) - 0.5),
        max: station.bank_level + 0.5,
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
            โหมด: {forecast?.input_mode || 'API_PLUS_VISION'}
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
      <div className="w-full h-64 sm:h-72 my-auto">
        <Line data={data} options={options} />
      </div>

      {/* Predictions Cards */}
      <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-slate-100 text-center">
        <div className="p-3 rounded-2xl bg-slate-50/80 border border-slate-200/80 shadow-sm transition-all hover:bg-slate-50">
          <span className="text-[11px] text-slate-500 font-semibold block mb-1">อีก 1 ชั่วโมง (+1h)</span>
          <div className="text-xl font-bold font-display text-slate-900">
            {forecast?.predicted_1h?.toFixed(2) || '-'} <span className="text-xs font-normal text-slate-500">ม.</span>
          </div>
        </div>
        <div className="p-3 rounded-2xl bg-amber-50/60 border border-amber-200/70 shadow-sm transition-all hover:bg-amber-50">
          <span className="text-[11px] text-amber-800 font-semibold block mb-1">อีก 2 ชั่วโมง (+2h)</span>
          <div className="text-xl font-bold font-display text-amber-700">
            {forecast?.predicted_2h?.toFixed(2) || '-'} <span className="text-xs font-normal text-amber-600">ม.</span>
          </div>
        </div>
        <div className="p-3 rounded-2xl bg-rose-50/60 border border-rose-200/70 shadow-sm transition-all hover:bg-rose-50">
          <span className="text-[11px] text-rose-800 font-semibold block mb-1">อีก 3 ชั่วโมง (+3h)</span>
          <div className="text-xl font-bold font-display text-rose-700">
            {forecast?.predicted_3h?.toFixed(2) || '-'} <span className="text-xs font-normal text-rose-600">ม.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForecastChart;

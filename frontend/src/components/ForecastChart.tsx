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
        backgroundColor: 'rgba(2, 132, 199, 0.12)',
        borderWidth: 2.5,
        tension: 0.3,
        fill: true,
        pointRadius: 4,
        pointBackgroundColor: '#0284c7',
      },
      {
        label: 'พยากรณ์ระดับน้ำ AI (ม. รทก.)',
        data: forecastDataset,
        borderColor: '#d97706',
        borderDash: [6, 4],
        backgroundColor: 'rgba(217, 119, 6, 0.08)',
        borderWidth: 2.5,
        tension: 0.3,
        pointRadius: 5,
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
          font: { size: 11, weight: 'bold' as const },
          usePointStyle: true,
        },
      },
      tooltip: {
        backgroundColor: '#0f172a',
        titleColor: '#f8fafc',
        bodyColor: '#e2e8f0',
        borderColor: '#94a3b8',
        borderWidth: 1,
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(226, 232, 240, 0.8)' },
        ticks: { color: '#64748b', font: { size: 10, weight: 'bold' as const } },
      },
      y: {
        grid: { color: 'rgba(226, 232, 240, 0.8)' },
        ticks: { color: '#64748b', font: { size: 10, weight: 'bold' as const } },
        min: Math.max(0, Math.min(...historyValues, 1.0) - 0.5),
        max: station.bank_level + 0.5,
      },
    },
  };

  return (
    <div className="bg-white border-2 border-blue-100 rounded-2xl p-5 shadow-[0_4px_20px_-4px_rgba(2,132,199,0.08)] hover:shadow-[0_8px_30px_-4px_rgba(2,132,199,0.12)] transition-all flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-blue-100/80">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">กราฟแนวโน้มระดับน้ำและการพยากรณ์ล่วงหน้า 1–3 ชม.</h3>
            <p className="text-[11px] text-slate-500">เปรียบเทียบข้อมูลย้อนหลังและการคาดการณ์มวลน้ำ</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold">
            โหมด: {forecast?.input_mode || 'API_PLUS_VISION'}
          </span>
          <button
            onClick={onTriggerForecast}
            disabled={triggering}
            className="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition"
          >
            <Sparkles className={`w-3.5 h-3.5 ${triggering ? 'animate-spin' : ''}`} />
            <span>คำนวณพยากรณ์ใหม่</span>
          </button>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="w-full h-64 my-auto">
        <Line data={data} options={options} />
      </div>

      {/* Predictions Cards */}
      <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-slate-100 text-center">
        <div className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-100 shadow-sm">
          <span className="text-[11px] text-slate-500 font-bold block mb-0.5">อีก 1 ชั่วโมง (+1h)</span>
          <div className="text-lg font-extrabold text-blue-700 font-mono">
            {forecast?.predicted_1h?.toFixed(2) || '-'} ม.
          </div>
        </div>
        <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/80 shadow-sm">
          <span className="text-[11px] text-amber-800 font-bold block mb-0.5">อีก 2 ชั่วโมง (+2h)</span>
          <div className="text-lg font-extrabold text-amber-700 font-mono">
            {forecast?.predicted_2h?.toFixed(2) || '-'} ม.
          </div>
        </div>
        <div className="p-2.5 rounded-xl bg-rose-50/70 border border-rose-200/80 shadow-sm">
          <span className="text-[11px] text-rose-800 font-bold block mb-0.5">อีก 3 ชั่วโมง (+3h)</span>
          <div className="text-lg font-extrabold text-rose-700 font-mono">
            {forecast?.predicted_3h?.toFixed(2) || '-'} ม.
          </div>
        </div>
      </div>
    </div>
  );
};

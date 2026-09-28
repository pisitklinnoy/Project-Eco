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
  // 1. History labels & values (take last 8 points for cleanliness)
  const recentHistory = history.slice(-8);
  const historyLabels = recentHistory.map((h) =>
    new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );
  const historyValues = recentHistory.map((h) => h.water_level);

  // 2. Forecast points
  const forecastLabels = ['+1 ชม.', '+2 ชม.', '+3 ชม.'];
  const allLabels = [...historyLabels, ...forecastLabels];

  // Actual history line (null for forecast part)
  const actualDataset = [...historyValues, null, null, null];

  // Forecast line (connects from last history point)
  const lastHistoryVal = historyValues[historyValues.length - 1] || station.normal_level;
  const forecastDataset = [
    ...new Array(historyValues.length - 1).fill(null),
    lastHistoryVal,
    forecast?.predicted_1h ?? lastHistoryVal + 0.2,
    forecast?.predicted_2h ?? lastHistoryVal + 0.4,
    forecast?.predicted_3h ?? lastHistoryVal + 0.6,
  ];

  const data = {
    labels: allLabels,
    datasets: [
      {
        label: 'ระดับน้ำจริงย้อนหลัง (ม.)',
        data: actualDataset,
        borderColor: '#38bdf8',
        backgroundColor: 'rgba(56, 189, 248, 0.1)',
        borderWidth: 2.5,
        tension: 0.3,
        fill: true,
        pointRadius: 4,
        pointBackgroundColor: '#38bdf8',
      },
      {
        label: 'ผลพยากรณ์ AI ล่วงหน้า (ม.)',
        data: forecastDataset,
        borderColor: '#f59e0b',
        borderDash: [6, 4],
        backgroundColor: 'rgba(245, 158, 11, 0.05)',
        borderWidth: 2.5,
        tension: 0.3,
        pointRadius: 5,
        pointBackgroundColor: '#f59e0b',
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
          color: '#94a3b8',
          font: { size: 11 },
          usePointStyle: true,
        },
      },
      tooltip: {
        backgroundColor: '#0f172a',
        titleColor: '#e2e8f0',
        bodyColor: '#cbd5e1',
        borderColor: '#334155',
        borderWidth: 1,
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(51, 65, 85, 0.4)' },
        ticks: { color: '#94a3b8', font: { size: 10 } },
      },
      y: {
        grid: { color: 'rgba(51, 65, 85, 0.4)' },
        ticks: { color: '#94a3b8', font: { size: 10 } },
        min: Math.max(0, Math.min(...historyValues, 1.5) - 0.5),
        max: station.bank_level + 0.5,
      },
    },
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <TrendingUp className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold text-white">กราฟแนวโน้มและการพยากรณ์ 1–3 ชม.</h3>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-[11px] px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800/80 font-medium">
            โหมด: {forecast?.input_mode || 'API_PLUS_VISION'}
          </span>
          <button
            onClick={onTriggerForecast}
            disabled={triggering}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold transition"
          >
            <Sparkles className={`w-3.5 h-3.5 ${triggering ? 'animate-spin' : ''}`} />
            <span>คำนวณรอบใหม่</span>
          </button>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="w-full h-64 my-auto">
        <Line data={data} options={options} />
      </div>

      {/* Predictions Cards */}
      <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-800 text-center">
        <div className="p-2 rounded-xl bg-slate-800/50 border border-slate-700/50">
          <span className="text-[11px] text-slate-400">อีก 1 ชั่วโมง</span>
          <div className="text-base font-extrabold text-amber-400">
            {forecast?.predicted_1h?.toFixed(2) || '-'} ม.
          </div>
        </div>
        <div className="p-2 rounded-xl bg-slate-800/50 border border-slate-700/50">
          <span className="text-[11px] text-slate-400">อีก 2 ชั่วโมง</span>
          <div className="text-base font-extrabold text-amber-400">
            {forecast?.predicted_2h?.toFixed(2) || '-'} ม.
          </div>
        </div>
        <div className="p-2 rounded-xl bg-slate-800/50 border border-slate-700/50">
          <span className="text-[11px] text-slate-400">อีก 3 ชั่วโมง</span>
          <div className="text-base font-extrabold text-amber-400">
            {forecast?.predicted_3h?.toFixed(2) || '-'} ม.
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import {
  ExternalLink,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  Clock,
  Layers,
  Flame,
  MonitorCheck,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Cpu,
  Activity,
  Award
} from 'lucide-react';
import type { RetrainStatus, TimeSeriesRetrainStatus, SensorDriftStatus } from '../types';
import { floodlensApi } from '../api/floodlensApi';

interface ReviewHubProps {
  onRefreshTelemetry?: () => void;
}

export const ReviewHub: React.FC<ReviewHubProps> = () => {
  const [activeTab, setActiveTab] = useState<'vision' | 'timeseries'>('vision');

  // Vision MLOps States
  const [visionStatus, setVisionStatus] = useState<RetrainStatus | null>(null);
  const [visionLoading, setVisionLoading] = useState<boolean>(true);
  const [visionTriggering, setVisionTriggering] = useState<boolean>(false);
  const [visionMessage, setVisionMessage] = useState<string | null>(null);
  const [embedLabelStudio, setEmbedLabelStudio] = useState<boolean>(false);

  // Time Series MLOps States
  const [tsStatus, setTsStatus] = useState<TimeSeriesRetrainStatus | null>(null);
  const [tsDrift, setTsDrift] = useState<SensorDriftStatus | null>(null);
  const [tsLoading, setTsLoading] = useState<boolean>(true);
  const [tsTriggering, setTsTriggering] = useState<boolean>(false);
  const [tsMessage, setTsMessage] = useState<string | null>(null);

  // Load Vision Retrain Status
  const loadVisionStatus = async () => {
    try {
      setVisionLoading(true);
      const data = await floodlensApi.getRetrainStatus();
      setVisionStatus(data);
    } catch (err) {
      console.error('Failed to load vision retrain status', err);
    } finally {
      setVisionLoading(false);
    }
  };

  // Load Time Series Retrain & Drift Status
  const loadTimeSeriesStatus = async () => {
    try {
      setTsLoading(true);
      const [statusData, driftData] = await Promise.all([
        floodlensApi.getTimeSeriesRetrainStatus(),
        floodlensApi.getSensorDriftStatus()
      ]);
      setTsStatus(statusData);
      setTsDrift(driftData);
    } catch (err) {
      console.error('Failed to load time series retrain status', err);
    } finally {
      setTsLoading(false);
    }
  };

  useEffect(() => {
    loadVisionStatus();
    loadTimeSeriesStatus();
    const interval = setInterval(() => {
      loadVisionStatus();
      loadTimeSeriesStatus();
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  // Trigger Vision Manual Retrain
  const handleVisionRetrain = async () => {
    if (visionTriggering) return;
    try {
      setVisionTriggering(true);
      setVisionMessage(null);
      const res = await floodlensApi.triggerManualRetrain();
      setVisionMessage(`สั่งฝึกฝนสำเร็จ! อัปเกรดเป็นโมเดล Vision ${res.result.model_version} (MAE ${res.result.mae_meters} ม.) บน MLflow แล้ว`);
      await loadVisionStatus();
    } catch (err) {
      console.error('Vision retrain error', err);
    } finally {
      setVisionTriggering(false);
    }
  };

  // Trigger Time Series Manual Retrain
  const handleTimeSeriesRetrain = async () => {
    if (tsTriggering) return;
    try {
      setTsTriggering(true);
      setTsMessage(null);
      const res = await floodlensApi.triggerTimeSeriesRetrain();
      const r = res.result;
      setTsMessage(
        `ฝึกฝนโมเดล Time-Series สำเร็จ! [${r.status}] เวอร์ชัน ${r.model_version} (Challenger MAE: ${r.challenger_mae} ม., พัฒนาขึ้น ${r.improvement_pct}%)`
      );
      await loadTimeSeriesStatus();
    } catch (err) {
      console.error('Time series retrain error', err);
    } finally {
      setTsTriggering(false);
    }
  };

  // Vision Status Values
  const pending = visionStatus?.pending_count ?? 0;
  const target = visionStatus?.target_count ?? 20;
  const progressPct = visionStatus?.progress_percent ?? Math.min(100, Math.round((pending / target) * 100));
  const remaining = Math.max(0, target - pending);
  const visionVersion = visionStatus?.current_model_version ?? 'v1.2';
  const visionMae = visionStatus?.last_mae_meters ?? 0.042;
  const visionHistory = visionStatus?.history ?? [];

  // Time Series Status Values
  const tsVersion = tsStatus?.current_model_version ?? 'v1.1';
  const tsMae = tsStatus?.last_mae_meters ?? 0.0699;
  const tsSamples = tsStatus?.training_samples ?? 1170;
  const tsHistory = tsStatus?.history ?? [];

  return (
    <div className="space-y-8">
      {/* 1. Header & Vision Statement */}
      <div className="relative rounded-[32px] bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 p-6 sm:p-10 text-white shadow-2xl overflow-hidden border border-white/10">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 rounded-full bg-blue-500/20 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-20 w-80 h-80 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-xs font-bold tracking-wide">
              <Sparkles className="w-3.5 h-3.5 text-blue-300 animate-spin" />
              <span>Full-Stack Dual MLOps Lifecycle Architecture</span>
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black font-display tracking-tight text-white">
              ศูนย์บริหารจัดการโมเดล AI (MLOps Hub)
            </h2>
            <p className="text-sm sm:text-base text-slate-300 font-normal leading-relaxed">
              ครอบคลุมวงจรชีวิตโมเดล AI ทั้ง 2 แกนหลัก: <strong className="text-white font-semibold">Computer Vision</strong> (วิเคราะห์ภาพระดับน้ำจากกล้อง) และ{' '}
              <strong className="text-white font-semibold">Time-Series Hydrology</strong> (พยากรณ์น้ำลุ่มน้ำ 1-3 ชม. ด้วย LightGBM & Champion-Challenger Gatekeeper)
            </p>
          </div>

          {/* Quick External Actions */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <a
              href="http://localhost:8085"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center space-x-2 px-5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm shadow-lg shadow-emerald-500/25 transition-all hover:scale-105 active:scale-95 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Label Studio (:8085)</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-70" />
            </a>

            <a
              href="http://localhost:5000"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center space-x-2 px-4 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-sm border border-white/20 transition-all hover:scale-105 active:scale-95 cursor-pointer"
            >
              <span>MLflow Registry (:5000)</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-70" />
            </a>
          </div>
        </div>
      </div>

      {/* 2. Dual MLOps Mode Selector (Tabs) */}
      <div className="flex items-center p-1.5 rounded-2xl bg-slate-200/80 p-1.5 border border-slate-300/80 shadow-inner max-w-xl mx-auto sm:mx-0">
        <button
          onClick={() => setActiveTab('vision')}
          className={`flex-1 flex items-center justify-center space-x-2.5 py-3 px-4 rounded-xl text-xs sm:text-sm font-black transition-all ${
            activeTab === 'vision'
              ? 'bg-white text-blue-900 shadow-md scale-[1.02]'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <MonitorCheck className={`w-4 h-4 ${activeTab === 'vision' ? 'text-blue-600' : 'text-slate-400'}`} />
          <span>Computer Vision MLOps</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold">CCTV</span>
        </button>

        <button
          onClick={() => setActiveTab('timeseries')}
          className={`flex-1 flex items-center justify-center space-x-2.5 py-3 px-4 rounded-xl text-xs sm:text-sm font-black transition-all ${
            activeTab === 'timeseries'
              ? 'bg-white text-indigo-900 shadow-md scale-[1.02]'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Activity className={`w-4 h-4 ${activeTab === 'timeseries' ? 'text-indigo-600' : 'text-slate-400'}`} />
          <span>Time Series MLOps</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-bold">Hydrology</span>
        </button>
      </div>

      {/* ============================================================== */}
      {/* TAB 1: COMPUTER VISION MLOPS                                   */}
      {/* ============================================================== */}
      {activeTab === 'vision' && (
        <div className="space-y-8 animate-fade-in">
          {/* Success Alert Notification */}
          {visionMessage && (
            <div className="rounded-2xl bg-emerald-50 border border-emerald-300 p-4 flex items-center space-x-3 text-emerald-900 shadow-sm animate-fade-in">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div className="text-sm font-bold flex-1">{visionMessage}</div>
              <button
                onClick={() => setVisionMessage(null)}
                className="text-emerald-700 hover:text-emerald-900 text-xs font-extrabold px-2 py-1 rounded"
              >
                ปิด
              </button>
            </div>
          )}

          {/* Grid: Progress Tracker + Model Vitals + Manual Trigger */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Card 1: Batch Progress Tracker (7 Cols) */}
            <div className="lg:col-span-7 rounded-[32px] bg-white p-6 sm:p-8 border border-slate-200/80 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black font-display text-slate-900">
                      โควตาภาพรอบปัจจุบัน (Batch Quota)
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">
                      ระบบจะทริกเกอร์ Retrain อัตโนมัติเมื่อครบ 20 ภาพที่ผ่านการตรวจทานใน Label Studio
                    </p>
                  </div>
                </div>

                <button
                  onClick={loadVisionStatus}
                  disabled={visionLoading}
                  title="รีเฟรชข้อมูล"
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${visionLoading ? 'animate-spin text-blue-600' : ''}`} />
                </button>
              </div>

              {/* Progress Bar & Numerical Counter */}
              <div className="space-y-3 bg-slate-50/70 p-5 rounded-2xl border border-slate-100">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    ความคืบหน้าการสะสมภาพเฉลย
                  </span>
                  <div className="flex items-baseline space-x-1">
                    <span className="text-3xl font-black text-slate-900 font-mono tracking-tight">{pending}</span>
                    <span className="text-base font-bold text-slate-400 font-mono">/ {target} ภาพ</span>
                  </div>
                </div>

                {/* Visual Bar */}
                <div className="w-full h-4 bg-slate-200/80 rounded-full overflow-hidden p-0.5 shadow-inner">
                  <div
                    className="h-full bg-gradient-to-r from-blue-600 to-emerald-500 rounded-full transition-all duration-700 ease-out shadow-sm"
                    style={{ width: `${Math.max(5, progressPct)}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 pt-1">
                  <div className="flex items-center space-x-1.5">
                    <Clock className="w-3.5 h-3.5 text-blue-500" />
                    <span>ต้องการอีก {remaining} ภาพเพื่อรัน Auto-Retrain</span>
                  </div>
                  <span className="font-extrabold text-blue-700 font-mono">{progressPct}%</span>
                </div>
              </div>

              {/* Trigger Threshold Highlights */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-blue-50/50 border border-blue-100 flex items-center space-x-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
                  <div>
                    <div className="font-bold text-blue-900">Active Learning Loop</div>
                    <div className="text-slate-500 text-[11px]">เลือกเฉพาะภาพมั่นใจต่ำส่งคนตรวจ</div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-emerald-50/50 border border-emerald-100 flex items-center space-x-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <div>
                    <div className="font-bold text-emerald-900">Automated Promotion</div>
                    <div className="text-slate-500 text-[11px]">ลงทะเบียน MLflow Registry อัตโนมัติ</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Current Model Vitals & Manual Retrain (5 Cols) */}
            <div className="lg:col-span-5 rounded-[32px] bg-white p-6 sm:p-8 border border-slate-200/80 shadow-sm flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-wider">
                    โมเดล Vision ใช้งานปัจจุบัน
                  </span>
                  <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-black">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>PRODUCTION ACTIVE</span>
                  </span>
                </div>

                <div>
                  <h4 className="text-2xl font-black text-slate-900 font-display flex items-baseline space-x-2">
                    <span>{visionVersion}</span>
                    <span className="text-xs font-bold text-slate-400 font-normal">
                      (StaffGauge-Vision-Detector)
                    </span>
                  </h4>
                  <p className="text-xs text-slate-500 font-medium mt-1">
                    อัปเดตล่าสุด: {visionStatus?.last_retrained_at ? new Date(visionStatus.last_retrained_at).toLocaleString('th-TH') : 'เพิ่งเริ่มต้นระบบ'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                    <div className="text-[11px] font-bold text-slate-400">MAE ความคลาดเคลื่อน</div>
                    <div className="text-lg font-black text-slate-900 font-mono mt-0.5">
                      {visionMae} <span className="text-xs font-semibold text-slate-500">เมตร</span>
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                    <div className="text-[11px] font-bold text-slate-400">พิกเซลเทียบเท่า</div>
                    <div className="text-lg font-black text-slate-900 font-mono mt-0.5">
                      ~{Math.round(visionMae * 85)} <span className="text-xs font-semibold text-slate-500">px</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Button: Manual Retrain */}
              <div className="space-y-2 pt-2">
                <button
                  onClick={handleVisionRetrain}
                  disabled={visionTriggering}
                  className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-black text-sm shadow-lg shadow-blue-500/25 flex items-center justify-center space-x-2 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                >
                  {visionTriggering ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>กำลังสั่ง Retrain โมเดล Vision...</span>
                    </>
                  ) : (
                    <>
                      <Flame className="w-4 h-4 text-amber-300" />
                      <span>สั่ง Retrain โมเดล Vision ทันที (Manual Override)</span>
                    </>
                  )}
                </button>
                <p className="text-[11px] text-center text-slate-400 font-medium">
                  สั่งเทรนได้ทันทีโดยไม่ต้องรอสะสมครบ 20 ภาพ
                </p>
              </div>
            </div>
          </div>

          {/* Embedded Label Studio Viewer Option */}
          <div className="rounded-[32px] bg-white border border-slate-200/80 shadow-sm overflow-hidden">
            <div
              onClick={() => setEmbedLabelStudio(!embedLabelStudio)}
              className="p-6 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 transition-colors"
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black font-display text-slate-900">
                    หน้าต่างตรวจทาน Label Studio แบบฝังในระบบ (Embedded Reviewer)
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    เปิด/ปิดการแสดงหน้าจอตรวจทานภาพระดับน้ำและกล่องเสาวัดน้ำได้โดยตรง
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2 text-xs font-bold text-blue-600">
                <span>{embedLabelStudio ? 'ซ่อนหน้าต่าง' : 'แสดงหน้าต่างตรวจทาน'}</span>
                {embedLabelStudio ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </div>

            {embedLabelStudio && (
              <div className="border-t border-slate-200 bg-slate-900 p-2 sm:p-4">
                <div className="rounded-2xl overflow-hidden bg-white shadow-inner h-[680px]">
                  <iframe
                    src="http://localhost:8085/projects/2/data"
                    title="Label Studio Project 2"
                    className="w-full h-full border-0"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Vision Model History Audit Trail Table */}
          <div className="rounded-[32px] bg-white p-6 sm:p-8 border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black font-display text-slate-900">
                  ประวัติการฝึกฝนโมเดล Vision (Model Versions & Retraining Audit Trail)
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  บันทึกทุกรอบการ Re-train พร้อมค่า Metrics และ Run ID ใน MLflow Model Registry
                </p>
              </div>
              <span className="text-xs font-extrabold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                {visionHistory.length} เวอร์ชัน
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-extrabold uppercase tracking-wider">
                    <th className="py-3 px-3">เวอร์ชันโมเดล</th>
                    <th className="py-3 px-3">ประเภทการสั่งเทรน</th>
                    <th className="py-3 px-3">ขนาดชุดข้อมูล</th>
                    <th className="py-3 px-3">MAE ความคลาดเคลื่อน</th>
                    <th className="py-3 px-3">เวลาที่สร้าง</th>
                    <th className="py-3 px-3 text-right">MLflow Run</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visionHistory.map((item, idx) => {
                    const isLatest = idx === 0;
                    return (
                      <tr key={item.id} className={`hover:bg-slate-50/70 transition-colors ${isLatest ? 'bg-blue-50/40' : ''}`}>
                        <td className="py-3.5 px-3 font-black text-slate-900 flex items-center space-x-2">
                          <span>{item.model_version}</span>
                          {isLatest && (
                            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-blue-600 text-white">
                              LATEST
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                              item.trigger_type.includes('AUTO')
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-indigo-100 text-indigo-800'
                            }`}
                          >
                            {item.trigger_type.includes('AUTO') ? 'AUTO (ครบ 20 รูป)' : 'MANUAL OVERRIDE'}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 font-semibold text-slate-700">
                          {item.images_count} ภาพ
                        </td>
                        <td className="py-3.5 px-3 font-black text-emerald-600">
                          {item.mae_meters} ม. <span className="text-slate-400 text-[10px] font-normal">(~{Math.round(item.mae_meters * 100)} ซม.)</span>
                        </td>
                        <td className="py-3.5 px-3 text-slate-500 font-medium">
                          {new Date(item.timestamp).toLocaleString('th-TH')}
                        </td>
                        <td className="py-3.5 px-3 text-right">
                          <a
                            href={`http://localhost:5000/#/experiments/1/runs/${item.mlflow_run_id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 hover:text-blue-800 font-bold inline-flex items-center space-x-1"
                          >
                            <span className="font-mono text-[11px]">{item.mlflow_run_id.slice(0, 8)}...</span>
                            <ExternalLink className="w-3 h-3 ml-0.5" />
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: TIME SERIES MLOPS                                       */}
      {/* ============================================================== */}
      {activeTab === 'timeseries' && (
        <div className="space-y-8 animate-fade-in">
          {/* Success Alert Notification */}
          {tsMessage && (
            <div className="rounded-2xl bg-indigo-50 border border-indigo-300 p-4 flex items-center space-x-3 text-indigo-900 shadow-sm animate-fade-in">
              <CheckCircle2 className="w-5 h-5 text-indigo-600 shrink-0" />
              <div className="text-sm font-bold flex-1">{tsMessage}</div>
              <button
                onClick={() => setTsMessage(null)}
                className="text-indigo-700 hover:text-indigo-900 text-xs font-extrabold px-2 py-1 rounded"
              >
                ปิด
              </button>
            </div>
          )}

          {/* Top Vitals & Gatekeeper Evaluation Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Card 1: Time Series Model Specification (7 Cols) */}
            <div className="lg:col-span-7 rounded-[32px] bg-white p-6 sm:p-8 border border-slate-200/80 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                    <Cpu className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black font-display text-slate-900">
                      แบบจำลองเดี่ยว Unified LightGBM (3 สถานี)
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">
                      Multi-Station & Multi-Horizon Panel Data Training with Critical Flood Sample Weights
                    </p>
                  </div>
                </div>

                <button
                  onClick={loadTimeSeriesStatus}
                  disabled={tsLoading}
                  title="รีเฟรชข้อมูล"
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${tsLoading ? 'animate-spin text-indigo-600' : ''}`} />
                </button>
              </div>

              {/* Training Specs Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                  <div className="text-[11px] font-bold text-slate-400 uppercase">ขนาดชุดข้อมูลเทรน</div>
                  <div className="text-2xl font-black text-slate-900 font-mono tracking-tight">
                    {tsSamples.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium">Panel Samples (25 Features)</div>
                </div>

                <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-100 space-y-1">
                  <div className="text-[11px] font-bold text-indigo-700 uppercase">น้ำหนักช่วงวิกฤต</div>
                  <div className="text-2xl font-black text-indigo-900 font-mono tracking-tight">
                    2.5x Weight
                  </div>
                  <div className="text-[10px] text-indigo-600 font-medium">ถ่วงน้ำหนักน้ำเกินเกณฑ์เตือนภัย</div>
                </div>

                <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-100 space-y-1">
                  <div className="text-[11px] font-bold text-emerald-700 uppercase">Champion MAE</div>
                  <div className="text-2xl font-black text-emerald-900 font-mono tracking-tight">
                    {tsMae} <span className="text-xs font-bold text-emerald-700">ม.</span>
                  </div>
                  <div className="text-[10px] text-emerald-600 font-medium">เฉลี่ย 3 สถานี (~{Math.round(tsMae * 100)} ซม.)</div>
                </div>
              </div>

              {/* Gatekeeper Rule */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                <div className="flex items-center space-x-2 text-xs font-bold text-slate-700">
                  <Award className="w-4 h-4 text-amber-500" />
                  <span>เกณฑ์การประเมิน Champion vs Challenger Gatekeeper</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed font-normal">
                  โมเดลใหม่ (Challenger) จะต้องได้รับการประเมินความคลาดเคลื่อน MAE บนชุดข้อมูลทดสอบ และต้องมีประสิทธิภาพไม่แย่กว่าโมเดลเดิม (Champion) เกิน 5% จึงจะได้รับอนุมัติให้โปรโมตขึ้นระบบจริง
                </p>
              </div>
            </div>

            {/* Card 2: Manual Trigger & Sensor Drift Quality Gate (5 Cols) */}
            <div className="lg:col-span-5 rounded-[32px] bg-white p-6 sm:p-8 border border-slate-200/80 shadow-sm flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-wider">
                    สถานะโมเดล Time-Series
                  </span>
                  <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-800 text-xs font-black">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>CHAMPION ACTIVE ({tsVersion})</span>
                  </span>
                </div>

                {/* Telemetry Sensor Drift Status */}
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-600 flex items-center space-x-1.5">
                    <Activity className="w-3.5 h-3.5 text-blue-500" />
                    <span>Hydraulic Drift & Sensor Quality Gate:</span>
                  </div>
                  <div className="space-y-1.5">
                    {tsDrift?.stations && Object.entries(tsDrift.stations).map(([code, stn]) => (
                      <div key={code} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                        <span className="font-extrabold text-slate-800">{code}</span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
                          {stn.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Button: Manual Time Series Retrain */}
              <div className="space-y-2 pt-2">
                <button
                  onClick={handleTimeSeriesRetrain}
                  disabled={tsTriggering}
                  className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-black text-sm shadow-lg shadow-indigo-500/25 flex items-center justify-center space-x-2 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                >
                  {tsTriggering ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>กำลังฝึกฝนโมเดล LightGBM & ทดสอบ Champion...</span>
                    </>
                  ) : (
                    <>
                      <Flame className="w-4 h-4 text-amber-300" />
                      <span>สั่ง Retrain โมเดล Time Series ทันที (Expanding Window)</span>
                    </>
                  )}
                </button>
                <p className="text-[11px] text-center text-slate-400 font-medium">
                  ฝึกฝนโมเดล Challenger ใหม่และเปรียบเทียบกับ Champion ตามเกณฑ์อัตโนมัติ
                </p>
              </div>
            </div>
          </div>

          {/* Time Series Retrain Audit Trail Table */}
          <div className="rounded-[32px] bg-white p-6 sm:p-8 border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black font-display text-slate-900">
                  ประวัติการฝึกฝนโมเดล Time Series (Champion vs Challenger Audit Trail)
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  บันทึกประวัติการเทรน ผลการเปรียบเทียบ Champion และการสำรองไฟล์โมเดลในคลังประวัติ
                </p>
              </div>
              <span className="text-xs font-extrabold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                {tsHistory.length} รอบฝึกฝน
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-extrabold uppercase tracking-wider">
                    <th className="py-3 px-3">เวอร์ชัน</th>
                    <th className="py-3 px-3">ประเภทคำสั่ง</th>
                    <th className="py-3 px-3">Challenger MAE</th>
                    <th className="py-3 px-3">Champion MAE</th>
                    <th className="py-3 px-3">ผลการตรวจสอบ (Gatekeeper)</th>
                    <th className="py-3 px-3">ขนาดตัวอย่าง</th>
                    <th className="py-3 px-3">เวลาที่สร้าง</th>
                    <th className="py-3 px-3 text-right">MLflow Run</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tsHistory.map((item, idx) => {
                    const isLatest = idx === 0;
                    return (
                      <tr key={item.id} className={`hover:bg-slate-50/70 transition-colors ${isLatest ? 'bg-indigo-50/40' : ''}`}>
                        <td className="py-3.5 px-3 font-black text-slate-900 flex items-center space-x-2">
                          <span>{item.model_version}</span>
                          {isLatest && (
                            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-indigo-600 text-white">
                              ACTIVE
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-800">
                            {item.trigger_type}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 font-black text-indigo-600">
                          {item.challenger_mae} ม.
                        </td>
                        <td className="py-3.5 px-3 font-semibold text-slate-600">
                          {item.champion_mae} ม.
                        </td>
                        <td className="py-3.5 px-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                              item.promoted
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {item.promoted ? '🏆 PROMOTED CHAMPION' : 'REJECTED CHALLENGER'}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 font-semibold text-slate-700">
                          {item.train_samples?.toLocaleString()} ตัวอย่าง
                        </td>
                        <td className="py-3.5 px-3 text-slate-500 font-medium">
                          {new Date(item.timestamp).toLocaleString('th-TH')}
                        </td>
                        <td className="py-3.5 px-3 text-right">
                          <a
                            href={`http://localhost:5000/#/experiments/1/runs/${item.mlflow_run_id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 hover:text-blue-800 font-bold inline-flex items-center space-x-1"
                          >
                            <span className="font-mono text-[11px]">{item.mlflow_run_id.slice(0, 8)}...</span>
                            <ExternalLink className="w-3 h-3 ml-0.5" />
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewHub;

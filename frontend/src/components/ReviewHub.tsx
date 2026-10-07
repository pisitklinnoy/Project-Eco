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
  Award,
  AlertTriangle,
  AlertOctagon,
  ShieldAlert,
  CheckCheck,
  SlidersHorizontal,
  UserCheck,
  Eye,
  Radio,
  TrendingUp,
  Zap,
  X
} from 'lucide-react';
import type {
  RetrainStatus,
  TimeSeriesRetrainStatus,
  SensorDriftStatus,
  IngestionQueueItem,
  ForecastDriftReport
} from '../types';
import { floodlensApi } from '../api/floodlensApi';

interface ReviewHubProps {
  onRefreshTelemetry?: () => void;
}

export const ReviewHub: React.FC<ReviewHubProps> = ({ onRefreshTelemetry }) => {
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

  // HITL Validation States
  const [ingestionQueue, setIngestionQueue] = useState<IngestionQueueItem[]>([]);
  const [ingestionLoading, setIngestionLoading] = useState<boolean>(false);
  const [driftReport, setDriftReport] = useState<ForecastDriftReport | null>(null);
  const [driftLoading, setDriftLoading] = useState<boolean>(false);
  const [driftActionLoading, setDriftActionLoading] = useState<boolean>(false);

  // Ingestion Override Modal / Active Item State
  const [selectedQueueItem, setSelectedQueueItem] = useState<IngestionQueueItem | null>(null);
  const [overrideChoice, setOverrideChoice] = useState<'SENSOR' | 'VISION' | 'MANUAL'>('SENSOR');
  const [overrideLevel, setOverrideLevel] = useState<number>(2.45);
  const [overrideNotes, setOverrideNotes] = useState<string>('');
  const [reviewerName, setReviewerName] = useState<string>('ผู้เชี่ยวชาญชลประทาน (Hydrologist Operator)');
  const [overrideSubmitting, setOverrideSubmitting] = useState<boolean>(false);

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

  // Load HITL Ingestion Queue & Forecast Drift Data
  const loadHITLData = async () => {
    try {
      setIngestionLoading(true);
      setDriftLoading(true);
      const [queueData, driftData] = await Promise.all([
        floodlensApi.getIngestionQueue(),
        floodlensApi.getForecastDriftReport(),
      ]);
      setIngestionQueue(queueData);
      setDriftReport(driftData);
    } catch (err) {
      console.error('Failed to load HITL data', err);
    } finally {
      setIngestionLoading(false);
      setDriftLoading(false);
    }
  };

  useEffect(() => {
    loadVisionStatus();
    loadTimeSeriesStatus();
    loadHITLData();
    const interval = setInterval(() => {
      loadVisionStatus();
      loadTimeSeriesStatus();
      loadHITLData();
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  // Open Ingestion Override Modal
  const openOverrideModal = (item: IngestionQueueItem) => {
    setSelectedQueueItem(item);
    setOverrideChoice('SENSOR');
    setOverrideLevel(item.sensor_water_level);
    setOverrideNotes('');
  };

  // Apply Ingestion Manual Override
  const handleApplyOverride = async () => {
    if (!selectedQueueItem) return;
    try {
      setOverrideSubmitting(true);
      await floodlensApi.applyIngestionOverride({
        review_id: selectedQueueItem.id,
        selected_choice: overrideChoice,
        verified_water_level: overrideLevel,
        reviewer_name: reviewerName,
        reviewer_notes: overrideNotes || 'ยืนยันค่าจริงหน้างานโดยผู้เชี่ยวชาญ',
      });
      setTsMessage(
        `ยืนยันค่าจริง ${overrideLevel.toFixed(2)} ม. สำหรับสถานี ${selectedQueueItem.station_name} สำเร็จ! ปลดการระงับและบันทึกเข้าสู่ระบบเรียบร้อย`
      );
      setSelectedQueueItem(null);
      await loadHITLData();
      if (onRefreshTelemetry) onRefreshTelemetry();
    } catch (err: any) {
      alert(err.message || 'เกิดข้อผิดพลาดในการบันทึกค่า Manual Override');
    } finally {
      setOverrideSubmitting(false);
    }
  };

  // Trigger Retrain from Drift Review
  const handleTriggerDriftRetrain = async () => {
    if (driftActionLoading) return;
    try {
      setDriftActionLoading(true);
      const res = await floodlensApi.triggerDriftRetrain({
        reviewer_name: reviewerName,
        reviewer_notes: 'ผู้เชี่ยวชาญสั่ง Retrain โมเดลใหม่หลังพบ Residual Error เกินเกณฑ์ความปลอดภัย',
      });
      setTsMessage(
        `สั่งฝึกฝนโมเดลใหม่ผ่านไปป์ไลน์ MLOps สำเร็จ! อัปเกรดเป็นเวอร์ชัน ${res.retrain_result?.model_version} (Challenger MAE: ${res.retrain_result?.challenger_mae} ม.)`
      );
      await Promise.all([loadTimeSeriesStatus(), loadHITLData()]);
    } catch (err: any) {
      alert(err.message || 'เกิดข้อผิดพลาดในการสั่ง Retrain');
    } finally {
      setDriftActionLoading(false);
    }
  };

  // Acknowledge Drift
  const handleAcknowledgeDrift = async () => {
    if (driftActionLoading) return;
    try {
      setDriftActionLoading(true);
      await floodlensApi.acknowledgeDrift({
        reviewer_name: reviewerName,
        reviewer_notes: 'รับทราบการแจ้งเตือน อยู่ระหว่างติดตามสภาวะน้ำ',
      });
      setTsMessage('รับทราบการแจ้งเตือน Forecast Drift เรียบร้อยแล้ว');
      await loadHITLData();
    } catch (err: any) {
      alert(err.message || 'เกิดข้อผิดพลาด');
    } finally {
      setDriftActionLoading(false);
    }
  };

  // Simulate Drift for Testing
  const handleSimulateDrift = async () => {
    try {
      await floodlensApi.simulateForecastDrift(0.72);
      setTsMessage('จำลองเหตุการณ์ Forecast Drift สำเร็จ (Residual Error 0.72 ม. เกินเกณฑ์ความปลอดภัย 0.40 ม.)');
      await loadHITLData();
    } catch (err: any) {
      alert(err.message || 'เกิดข้อผิดพลาด');
    }
  };

  // Simulate Ingestion Anomaly for Testing
  const handleSimulateIngestion = async () => {
    try {
      await floodlensApi.simulateIngestionAnomaly({
        station_code: 'STN-BANGSALA',
        station_name: 'บ้านบางศาลา (กลางน้ำ)',
        vision_water_level: 18.50,
        sensor_water_level: 2.30,
      });
      setTsMessage('จำลองข้อมูลนำเข้าผิดปกติสำเร็จ: กล้องอ่านได้ 18.50 ม. vs เซ็นเซอร์อ่านได้ 2.30 ม. (ระงับข้อมูลชั่วคราวแล้ว)');
      await loadHITLData();
    } catch (err: any) {
      alert(err.message || 'เกิดข้อผิดพลาด');
    }
  };

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
                          {item.mlflow_run_id ? (
                            <a
                              href={`http://localhost:5000/#/experiments/2/runs/${item.mlflow_run_id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 hover:text-blue-800 font-bold inline-flex items-center space-x-1"
                            >
                              <span className="font-mono text-[11px]">{String(item.mlflow_run_id).slice(0, 8)}...</span>
                              <ExternalLink className="w-3 h-3 ml-0.5" />
                            </a>
                          ) : (
                            <span className="text-slate-400 font-mono text-[11px]">-</span>
                          )}
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

          {/* ============================================================== */}
          {/* HITL 1: ด่านตรวจสอบข้อมูลนำเข้า (Data Ingestion Verification) */}
          {/* ============================================================== */}
          <div className="rounded-[32px] bg-white p-6 sm:p-8 border border-slate-200/80 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-lg font-black font-display text-slate-900">
                      ด่านตรวจสอบข้อมูลนำเข้า (Data Ingestion Verification)
                    </h3>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 uppercase">
                      Cross-Validation
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium">
                    เปรียบเทียบความสอดคล้องระหว่าง Vision AI กับ RID Sensor หากต่างเกินเกณฑ์ (0.80 ม.) ข้อมูลจะถูกระงับชั่วคราวเพื่อให้ผู้เชี่ยวชาญตรวจสอบ (Manual Override)
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <button
                  onClick={handleSimulateIngestion}
                  className="px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold border border-amber-200/80 transition-all flex items-center space-x-1.5 cursor-pointer"
                  title="จำลองสถานการณ์ค่ากล้องเพี้ยน"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>จำลองข้อมูลผิดปกติ (Test)</span>
                </button>

                <button
                  onClick={loadHITLData}
                  disabled={ingestionLoading}
                  title="รีเฟรชคิวข้อมูล"
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${ingestionLoading ? 'animate-spin text-amber-600' : ''}`} />
                </button>
              </div>
            </div>

            {/* Ingestion Metric Chips */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase">รายการรอตรวจสอบ (Quarantined)</div>
                  <div className="text-xl font-black text-amber-600 font-mono mt-0.5">
                    {ingestionQueue.filter(q => q.status === 'QUARANTINED').length} รายการ
                  </div>
                </div>
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                  <Clock className="w-4 h-4" />
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase">ตรวจทานแล้ว (Verified & Released)</div>
                  <div className="text-xl font-black text-emerald-600 font-mono mt-0.5">
                    {ingestionQueue.filter(q => q.status === 'RELEASED').length} รายการ
                  </div>
                </div>
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase">เกณฑ์ผลต่างความปลอดภัย (Threshold)</div>
                  <div className="text-xl font-black text-slate-900 font-mono mt-0.5">
                    0.80 <span className="text-xs font-semibold text-slate-500">เมตร</span>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* Ingestion Queue Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-extrabold uppercase tracking-wider">
                    <th className="py-3 px-3">สถานีตรวจวัด</th>
                    <th className="py-3 px-3">ค่าจากกล้อง (Vision AI)</th>
                    <th className="py-3 px-3">ค่าจากเซ็นเซอร์ (RID)</th>
                    <th className="py-3 px-3">ผลต่าง (|Δ|)</th>
                    <th className="py-3 px-3">สถานะ & สาเหตุ</th>
                    <th className="py-3 px-3">เวลาที่ตรวจวัด</th>
                    <th className="py-3 px-3 text-right">การจัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ingestionQueue.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 font-medium">
                        ไม่มีข้อมูลที่ถูกระงับในขณะนี้ ข้อมูลจากกล้องและเซ็นเซอร์สอดคล้องกันตามปกติ
                      </td>
                    </tr>
                  ) : (
                    ingestionQueue.map((item) => {
                      const isQuarantined = item.status === 'QUARANTINED';
                      return (
                        <tr key={item.id} className={`hover:bg-slate-50/70 transition-colors ${isQuarantined ? 'bg-amber-50/30' : ''}`}>
                          <td className="py-3.5 px-3">
                            <div className="font-black text-slate-900">{item.station_name}</div>
                            <div className="text-[11px] text-slate-400 font-mono">{item.station_code}</div>
                          </td>
                          <td className="py-3.5 px-3 font-mono font-bold text-blue-700">
                            <div className="flex items-center space-x-1.5">
                              <Eye className="w-3.5 h-3.5 text-blue-500" />
                              <span>{item.vision_water_level.toFixed(2)} ม.</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-3 font-mono font-bold text-emerald-700">
                            <div className="flex items-center space-x-1.5">
                              <Radio className="w-3.5 h-3.5 text-emerald-500" />
                              <span>{item.sensor_water_level.toFixed(2)} ม.</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-3 font-mono font-black text-rose-600">
                            +{item.discrepancy_m.toFixed(2)} ม.
                          </td>
                          <td className="py-3.5 px-3">
                            {isQuarantined ? (
                              <div className="space-y-1">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800">
                                  <AlertTriangle className="w-3 h-3 mr-1" />
                                  ระงับชั่วคราว (QUARANTINED)
                                </span>
                                <p className="text-[10px] text-slate-500 font-medium max-w-xs">{item.flag_reason}</p>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800">
                                  <CheckCheck className="w-3 h-3 mr-1" />
                                  ยืนยันแล้ว: {item.verified_water_level?.toFixed(2)} ม.
                                </span>
                                <p className="text-[10px] text-slate-500">
                                  โดย {item.resolved_by} ({item.resolution_type})
                                </p>
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-3 text-slate-500 font-medium">
                            {new Date(item.timestamp).toLocaleString('th-TH')}
                          </td>
                          <td className="py-3.5 px-3 text-right">
                            {isQuarantined ? (
                              <button
                                onClick={() => openOverrideModal(item)}
                                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs shadow-md shadow-amber-500/20 transition-all hover:scale-105 active:scale-95 inline-flex items-center space-x-1 cursor-pointer"
                              >
                                <UserCheck className="w-3.5 h-3.5" />
                                <span>ตรวจทาน & Override</span>
                              </button>
                            ) : (
                              <span className="text-[11px] font-bold text-slate-400">ตรวจสอบเรียบร้อย</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ============================================================== */}
          {/* HITL 2: ด่านประเมินผลการพยากรณ์ (Forecast Drift & Retrain)   */}
          {/* ============================================================== */}
          <div className="rounded-[32px] bg-white p-6 sm:p-8 border border-slate-200/80 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-lg font-black font-display text-slate-900">
                      ด่านประเมินผลการพยากรณ์ (Forecast Drift & Retrain Trigger)
                    </h3>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 uppercase">
                      Residual Monitoring
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium">
                    เปรียบเทียบค่าจริงหน้างานกับค่าที่โมเดล LightGBM เคยพยากรณ์ล่วงหน้าไว้ (+1h, +2h, +3h) หาก Residual Error เกินเกณฑ์ (0.40 ม.) ระบบจะแจ้งเตือนให้สั่ง Retrain โมเดลใหม่ทันที
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <button
                  onClick={handleSimulateDrift}
                  className="px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-bold border border-indigo-200/80 transition-all flex items-center space-x-1.5 cursor-pointer"
                  title="จำลองกรณี Forecast Drift"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>จำลอง Forecast Drift (Test)</span>
                </button>

                <button
                  onClick={loadHITLData}
                  disabled={driftLoading}
                  title="รีเฟรชผลประเมิน"
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${driftLoading ? 'animate-spin text-indigo-600' : ''}`} />
                </button>
              </div>
            </div>

            {/* Active Drift Banner */}
            {driftReport?.drift_detected || driftReport?.alert_status === 'ACTIVE_ALERT' ? (
              <div className="rounded-2xl bg-gradient-to-r from-rose-50 via-rose-100/60 to-amber-50 border-2 border-rose-400 p-5 shadow-sm space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="flex items-start space-x-3.5">
                    <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center font-bold shrink-0 shadow-md">
                      <AlertOctagon className="w-5 h-5 animate-pulse" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h4 className="text-base font-black text-rose-950">
                          ตรวจพบสภาวะ Forecast Drift (Residual Error เกินเกณฑ์ความปลอดภัย)!
                        </h4>
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-rose-600 text-white uppercase">
                          URGENT REVIEW
                        </span>
                      </div>
                      <p className="text-xs text-rose-800 font-medium mt-1 leading-relaxed">
                        {driftReport.alert_message || 'พบค่าคลาดเคลื่อนสูงกว่า 0.40 ม. อาจเกิดจากอุทกภัยฉับพลันหรือการเปลี่ยนแปลงทางชลศาสตร์ที่โมเดลปัจจุบันยังไม่ครอบคลุม'}
                      </p>
                      <div className="flex flex-wrap items-center gap-4 mt-2 text-xs font-mono">
                        <span className="text-rose-900">
                          Max Residual: <strong className="font-black text-rose-950">{driftReport.max_residual_m.toFixed(3)} ม.</strong>
                        </span>
                        <span className="text-slate-400">•</span>
                        <span className="text-rose-900">
                          Safety Threshold: <strong>{driftReport.safety_threshold_m.toFixed(2)} ม.</strong>
                        </span>
                        <span className="text-slate-400">•</span>
                        <span className="text-rose-900">
                          โมเดลปัจจุบัน: <strong>{driftReport.current_model.version}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* HITL Retrain Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <button
                      onClick={handleTriggerDriftRetrain}
                      disabled={driftActionLoading}
                      className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs shadow-lg shadow-rose-600/30 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 flex items-center space-x-2 cursor-pointer"
                    >
                      {driftActionLoading ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>กำลังส่งงานเข้า MLOps Pipeline...</span>
                        </>
                      ) : (
                        <>
                          <Flame className="w-3.5 h-3.5 text-amber-200" />
                          <span>สั่ง Retrain โมเดลใหม่ผ่าน MLOps ทันที</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleAcknowledgeDrift}
                      disabled={driftActionLoading}
                      className="px-3 py-2.5 rounded-xl bg-white/80 hover:bg-white text-slate-700 font-bold text-xs border border-slate-300 transition-all hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
                    >
                      ✓ รับทราบ (Acknowledge)
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-emerald-50/70 border border-emerald-200 p-4 flex items-center justify-between text-emerald-900">
                <div className="flex items-center space-x-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <span className="text-xs font-black">ประสิทธิภาพการพยากรณ์อยู่ในเกณฑ์ปลอดภัย (No Drift Detected)</span>
                    <p className="text-[11px] text-emerald-700 font-medium">
                      ค่าคลาดเคลื่อนเฉลี่ย {driftReport?.mean_residual_m.toFixed(3) ?? '0.045'} ม. (เกณฑ์จำกัดความปลอดภัย {driftReport?.safety_threshold_m.toFixed(2) ?? '0.40'} ม.) โมเดล Champion {driftReport?.current_model.version ?? 'v1.1'} ทำงานได้ตามมาตรฐาน
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-200/80 text-emerald-900">
                  NORMAL RESIDUAL
                </span>
              </div>
            )}

            {/* Forecast Residual Comparison Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-extrabold uppercase tracking-wider">
                    <th className="py-3 px-3">สถานี</th>
                    <th className="py-3 px-3">ช่วงเวลาทำนาย</th>
                    <th className="py-3 px-3">เวลาเป้าหมาย</th>
                    <th className="py-3 px-3">ค่าตรวจวัดจริง (Actual)</th>
                    <th className="py-3 px-3">ค่าพยากรณ์ของโมเดล (Forecast)</th>
                    <th className="py-3 px-3">Residual Error (|e|)</th>
                    <th className="py-3 px-3 text-right">สถานะความคลาดเคลื่อน</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(!driftReport?.matched_evaluations || driftReport.matched_evaluations.length === 0) ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-400 font-medium">
                        กำลังรวบรวมข้อมูลคู่เปรียบเทียบพยากรณ์กับค่าจริงหน้างาน...
                      </td>
                    </tr>
                  ) : (
                    driftReport.matched_evaluations.map((ev, idx) => {
                      const isExceeded = ev.residual_error > (driftReport?.safety_threshold_m ?? 0.40);
                      return (
                        <tr key={idx} className={`hover:bg-slate-50/70 transition-colors ${isExceeded ? 'bg-rose-50/40' : ''}`}>
                          <td className="py-3 px-3 font-bold text-slate-900">
                            {ev.station_name}
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                              {ev.horizon}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-500 font-medium">
                            {new Date(ev.target_time).toLocaleString('th-TH')}
                          </td>
                          <td className="py-3 px-3 font-mono font-black text-slate-800">
                            {ev.actual_level.toFixed(2)} ม.
                          </td>
                          <td className="py-3 px-3 font-mono font-semibold text-indigo-700">
                            {ev.predicted_level.toFixed(2)} ม.
                          </td>
                          <td className={`py-3 px-3 font-mono font-black ${isExceeded ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {ev.residual_error.toFixed(2)} ม.
                          </td>
                          <td className="py-3 px-3 text-right">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                isExceeded
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {isExceeded ? '⚠️ DRIFT DETECTED' : '✓ NORMAL'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ============================================================== */}
          {/* MODAL: MANUAL OVERRIDE DIALOG                                  */}
          {/* ============================================================== */}
          {selectedQueueItem && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
              <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-6 relative">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                      <UserCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black font-display text-slate-900">
                        ตรวจสอบและยืนยันค่าจริงหน้างาน
                      </h3>
                      <p className="text-xs text-slate-500 font-medium">
                        สถานี {selectedQueueItem.station_name} ({selectedQueueItem.station_code})
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedQueueItem(null)}
                    className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Discrepancy comparison badge */}
                <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-600">ค่าอ่านจากกล้อง (Vision AI):</span>
                    <span className="font-mono font-black text-blue-700 text-sm">{selectedQueueItem.vision_water_level.toFixed(2)} ม.</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-600">ค่าอ่านจากเซ็นเซอร์ (RID Sensor):</span>
                    <span className="font-mono font-black text-emerald-700 text-sm">{selectedQueueItem.sensor_water_level.toFixed(2)} ม.</span>
                  </div>
                  <div className="border-t border-amber-200 pt-1.5 flex items-center justify-between text-xs">
                    <span className="font-black text-rose-700">ผลต่างคลาดเคลื่อน (|Δ|):</span>
                    <span className="font-mono font-black text-rose-700 text-sm">+{selectedQueueItem.discrepancy_m.toFixed(2)} ม.</span>
                  </div>
                  <p className="text-[11px] text-amber-800 font-medium pt-1">
                    ⚠️ เหตุผลที่ระงับ: {selectedQueueItem.flag_reason}
                  </p>
                </div>

                {/* Decision Radio Choices */}
                <div className="space-y-3">
                  <label className="text-xs font-black text-slate-700 uppercase tracking-wider block">
                    เลือกแนวทางยืนยันค่าจริงหน้างาน (Manual Override Choice):
                  </label>

                  <div className="space-y-2 text-xs">
                    {/* Choice 1: SENSOR */}
                    <label
                      onClick={() => {
                        setOverrideChoice('SENSOR');
                        setOverrideLevel(selectedQueueItem.sensor_water_level);
                      }}
                      className={`flex items-center space-x-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                        overrideChoice === 'SENSOR'
                          ? 'bg-emerald-50/80 border-emerald-500 shadow-sm'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="overrideChoice"
                        checked={overrideChoice === 'SENSOR'}
                        onChange={() => {}}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      <div className="flex-1">
                        <div className="font-black text-slate-900">ยึดค่าตาม RID Telemetry Sensor</div>
                        <div className="text-slate-500 font-mono text-[11px]">
                          บันทึก {selectedQueueItem.sensor_water_level.toFixed(2)} ม. (ภาพกล้องอาจมีเงาสะท้อนหรือหยดน้ำรบกวน)
                        </div>
                      </div>
                    </label>

                    {/* Choice 2: VISION */}
                    <label
                      onClick={() => {
                        setOverrideChoice('VISION');
                        setOverrideLevel(selectedQueueItem.vision_water_level);
                      }}
                      className={`flex items-center space-x-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                        overrideChoice === 'VISION'
                          ? 'bg-blue-50/80 border-blue-500 shadow-sm'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="overrideChoice"
                        checked={overrideChoice === 'VISION'}
                        onChange={() => {}}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <div className="font-black text-slate-900">ยึดค่าตาม Vision AI Camera</div>
                        <div className="text-slate-500 font-mono text-[11px]">
                          บันทึก {selectedQueueItem.vision_water_level.toFixed(2)} ม. (ฮาร์ดแวร์เซ็นเซอร์อาจค้างหรือขัดข้อง)
                        </div>
                      </div>
                    </label>

                    {/* Choice 3: MANUAL */}
                    <label
                      onClick={() => setOverrideChoice('MANUAL')}
                      className={`flex items-center space-x-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                        overrideChoice === 'MANUAL'
                          ? 'bg-amber-50/80 border-amber-500 shadow-sm'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="overrideChoice"
                        checked={overrideChoice === 'MANUAL'}
                        onChange={() => {}}
                        className="text-amber-600 focus:ring-amber-500"
                      />
                      <div className="flex-1">
                        <div className="font-black text-slate-900">ระบุค่าจริงหน้างานด้วยตนเอง (Custom Manual Entry)</div>
                        <div className="text-slate-500 text-[11px]">
                          ผู้เชี่ยวชาญกรอกค่าระดับน้ำจริงที่ตรวจสอบแล้ว
                        </div>
                      </div>
                    </label>
                  </div>

                  {/* Level input */}
                  <div className="pt-2">
                    <label className="text-xs font-bold text-slate-600 block mb-1">
                      ค่าระดับน้ำที่ต้องการยืนยันและบันทึกลงระบบ (เมตร):
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={overrideLevel}
                      onChange={(e) => setOverrideLevel(parseFloat(e.target.value) || 0)}
                      disabled={overrideChoice !== 'MANUAL'}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 font-mono text-base font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100 disabled:text-slate-600"
                    />
                  </div>

                  {/* Reviewer notes */}
                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">
                      หมายเหตุการตรวจสอบ (Audit Note):
                    </label>
                    <input
                      type="text"
                      value={overrideNotes}
                      onChange={(e) => setOverrideNotes(e.target.value)}
                      placeholder="เช่น ยืนยันใช้ค่าเซ็นเซอร์เนื่องจากภาพกล้องมีแสงสะท้อนผิวน้ำรบกวน"
                      className="w-full px-4 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  {/* Reviewer name */}
                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">
                      ชื่อผู้ตรวจทาน:
                    </label>
                    <input
                      type="text"
                      value={reviewerName}
                      onChange={(e) => setReviewerName(e.target.value)}
                      className="w-full px-4 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center space-x-3 pt-2">
                  <button
                    onClick={() => setSelectedQueueItem(null)}
                    className="flex-1 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={handleApplyOverride}
                    disabled={overrideSubmitting}
                    className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-black text-xs shadow-lg shadow-amber-500/25 transition-all flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
                  >
                    {overrideSubmitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>กำลังบันทึกค่า...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>ยืนยันค่าจริงและปลดระงับ</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

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
                          {item.mlflow_run_id ? (
                            <a
                              href={`http://localhost:5000/#/experiments/1/runs/${item.mlflow_run_id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 hover:text-blue-800 font-bold inline-flex items-center space-x-1"
                            >
                              <span className="font-mono text-[11px]">{String(item.mlflow_run_id).slice(0, 8)}...</span>
                              <ExternalLink className="w-3 h-3 ml-0.5" />
                            </a>
                          ) : (
                            <span className="text-slate-400 font-mono text-[11px]">-</span>
                          )}
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

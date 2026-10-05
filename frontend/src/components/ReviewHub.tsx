import React, { useState, useEffect } from 'react';
import {
  ExternalLink,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  Clock,
  Layers,
  Flame,
  ArrowRight,
  TrendingDown,
  MonitorCheck,
  ShieldCheck,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import type { RetrainStatus } from '../types';
import { floodlensApi } from '../api/floodlensApi';

interface ReviewHubProps {
  onRefreshTelemetry?: () => void;
}

export const ReviewHub: React.FC<ReviewHubProps> = () => {
  const [status, setStatus] = useState<RetrainStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [triggering, setTriggering] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [embedLabelStudio, setEmbedLabelStudio] = useState<boolean>(false);

  // ดึงสถานะปัจจุบันของ Retrain
  const loadRetrainStatus = async () => {
    try {
      setLoading(true);
      const data = await floodlensApi.getRetrainStatus();
      setStatus(data);
    } catch (err) {
      console.error('Failed to load retrain status', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRetrainStatus();
    // Poll updates every 15 seconds
    const interval = setInterval(loadRetrainStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  // สั่งรัน Manual Retrain
  const handleManualRetrain = async () => {
    if (triggering) return;
    try {
      setTriggering(true);
      setSuccessMessage(null);
      const res = await floodlensApi.triggerManualRetrain();
      setSuccessMessage(`สั่งฝึกฝนสำเร็จ! อัปเกรดเป็นโมเดล ${res.result.model_version} (MAE ${res.result.mae_meters} ม.) บน MLflow แล้ว`);
      await loadRetrainStatus();
    } catch (err) {
      console.error('Manual retrain error', err);
    } finally {
      setTriggering(false);
    }
  };

  const pending = status?.pending_count ?? 0;
  const target = status?.target_count ?? 20;
  const progressPct = status?.progress_percent ?? Math.min(100, Math.round((pending / target) * 100));
  const remaining = Math.max(0, target - pending);
  const currentVersion = status?.current_model_version ?? 'v1.2';
  const lastMae = status?.last_mae_meters ?? 0.042;
  const history = status?.history ?? [];

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
              <span>Human-in-the-Loop & Active Learning Pipeline</span>
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black font-display tracking-tight text-white">
              ศูนย์ตรวจทานข้อมูล & ฝึกฝนโมเดลอัตโนมัติ
            </h2>
            <p className="text-sm sm:text-base text-slate-300 font-normal leading-relaxed">
              เชื่อมโยงผลตรวจทานจากผู้เชี่ยวชาญบน <strong className="text-white font-semibold">Label Studio</strong> เข้าสู่กระบวนการ Retrain อัตโนมัติเมื่อครบทุกๆ{' '}
              <span className="text-emerald-400 font-bold underline decoration-emerald-400/50 underline-offset-4">20 ภาพ</span> เพื่อยกระดับความแม่นยำของ AI อย่างต่อเนื่อง
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
              <span>เข้าตรวจทานใน Label Studio (:8085)</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-70" />
            </a>

            <a
              href="http://localhost:5000"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center space-x-2 px-4 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-sm border border-white/20 transition-all hover:scale-105 active:scale-95 cursor-pointer"
            >
              <span>คลังโมเดล MLflow (:5000)</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-70" />
            </a>
          </div>
        </div>
      </div>

      {/* 2. Success Alert Notification */}
      {successMessage && (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-300 p-4 flex items-center space-x-3 text-emerald-900 shadow-sm animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <div className="text-sm font-bold flex-1">{successMessage}</div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-extrabold px-2 py-1 rounded"
          >
            ปิด
          </button>
        </div>
      )}

      {/* 3. Grid: Progress Tracker + Model Vitals + Manual Trigger */}
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
                  ระบบจะทริกเกอร์ Retrain อัตโนมัติเมื่อครบ 20 ภาพที่ผ่านการตรวจ
                </p>
              </div>
            </div>

            <button
              onClick={loadRetrainStatus}
              disabled={loading}
              title="รีเฟรชข้อมูล"
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            </button>
          </div>

          {/* Large Counter Numbers */}
          <div className="bg-slate-50/80 rounded-2xl p-5 border border-slate-100 flex items-baseline justify-between">
            <div>
              <span className="text-4xl sm:text-5xl font-black font-display text-slate-900 tracking-tight">
                {pending}
              </span>
              <span className="text-2xl font-bold text-slate-400 ml-2">/ {target}</span>
              <span className="text-sm font-semibold text-slate-500 ml-2">ภาพที่ตรวจแล้ว</span>
            </div>

            <div className="text-right">
              <span className="text-xl font-extrabold text-blue-600 font-display">
                {progressPct}%
              </span>
              <p className="text-[11px] font-bold text-slate-400">ความคืบหน้า</p>
            </div>
          </div>

          {/* Dynamic Progress Bar */}
          <div className="space-y-2">
            <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/50">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 via-sky-400 to-emerald-400 transition-all duration-700 relative overflow-hidden"
                style={{ width: `${Math.max(5, progressPct)}%` }}
              >
                <div className="absolute inset-0 bg-white/25 animate-pulse" />
              </div>
            </div>

            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 pt-1">
              <span>0 ภาพ</span>
              <span className="font-extrabold text-emerald-600">
                {remaining === 0 ? '✨ โควตาครบ 20 ภาพแล้ว พร้อมสั่งเทรน!' : `เหลืออีก ${remaining} ภาพสู่การ Retrain อัตโนมัติ`}
              </span>
              <span>เป้าหมาย: 20 ภาพ</span>
            </div>
          </div>

          {/* Quick Helper Note */}
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3.5 flex items-start space-x-3 text-xs text-amber-900 font-medium">
            <Flame className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong>กลไกอัตโนมัติ:</strong> ทุกครั้งที่คุณเลื่อนจุดผิวน้ำใน Label Studio แล้วกดปุ่ม{' '}
              <code className="bg-white/80 px-1 py-0.5 rounded text-amber-950 font-bold border border-amber-200">Submit</code>{' '}
              ตัวเลขนี้จะเพิ่มขึ้น +1 ทันที เมื่อครบ 20 ภาพ โมเดลจะฝึกฝนใหม่และโปรโมตเวอร์ชันทันทีครับ
            </div>
          </div>
        </div>

        {/* Card 2: Current Model Vitals & Manual Retrain (5 Cols) */}
        <div className="lg:col-span-5 rounded-[32px] bg-white p-6 sm:p-8 border border-slate-200/80 shadow-sm flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase px-2.5 py-1 rounded-full bg-slate-900 text-white tracking-wider">
                Production Model
              </span>
              <span className="inline-flex items-center text-xs font-bold text-emerald-600">
                <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5 animate-ping" />
                Active on Registry
              </span>
            </div>

            <div>
              <div className="text-xs font-bold text-slate-400">โมเดลที่ใช้งานอยู่บนระบบ</div>
              <div className="text-2xl font-black font-display text-slate-900 mt-0.5">
                {status?.current_model_name || 'Flood-Forecaster'}{' '}
                <span className="text-blue-600 font-extrabold">({currentVersion})</span>
              </div>
            </div>

            {/* Metrics Chips */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="text-[11px] font-bold text-slate-400 flex items-center space-x-1">
                  <TrendingDown className="w-3 h-3 text-emerald-500" />
                  <span>ความแม่นยำ (MAE)</span>
                </div>
                <div className="text-lg font-black text-slate-900 mt-1">
                  {lastMae} <span className="text-xs font-semibold text-slate-500">เมตร</span>
                </div>
                <div className="text-[10px] text-emerald-600 font-bold">~{Math.round(lastMae * 100)} ซม.</div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="text-[11px] font-bold text-slate-400 flex items-center space-x-1">
                  <Clock className="w-3 h-3 text-blue-500" />
                  <span>อัปเดตล่าสุด</span>
                </div>
                <div className="text-xs font-black text-slate-800 mt-1.5 truncate" title={status?.last_retrained_at}>
                  {status?.last_retrained_at ? new Date(status.last_retrained_at).toLocaleTimeString('th-TH') : 'ไม่ระบุ'}
                </div>
                <div className="text-[10px] text-slate-400 font-bold">
                  {status?.last_retrained_at ? new Date(status.last_retrained_at).toLocaleDateString('th-TH') : ''}
                </div>
              </div>
            </div>
          </div>

          {/* Emergency Manual Retrain Button */}
          <div className="pt-4 border-t border-slate-100 space-y-2">
            <button
              onClick={handleManualRetrain}
              disabled={triggering}
              className={`w-full py-3.5 px-4 rounded-2xl font-black text-sm flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-md ${
                triggering
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-500/25 hover:scale-[1.02] active:scale-98'
              }`}
            >
              {triggering ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>กำลังรันการฝึกฝนโมเดล...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>สั่ง Retrain ทันที (Manual Override)</span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </>
              )}
            </button>
            <p className="text-[11px] text-center text-slate-400 font-medium leading-tight">
              * สั่งเทรนได้ทันทีโดยไม่ต้องรอให้สะสมครบ 20 ภาพ
            </p>
          </div>

        </div>
      </div>

      {/* 4. Embedded Label Studio Workspace (Toggleable) */}
      <div className="rounded-[32px] bg-white border border-slate-200/80 shadow-sm overflow-hidden">
        <button
          onClick={() => setEmbedLabelStudio(!embedLabelStudio)}
          className="w-full px-6 sm:px-8 py-5 flex items-center justify-between text-left hover:bg-slate-50/60 transition-colors cursor-pointer"
        >
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
              <MonitorCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black font-display text-slate-900">
                ฝังหน้าจอตรวจทานภาพ Label Studio (Embedded Workspace)
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {embedLabelStudio ? 'คลิกเพื่อซ่อนหน้าต่างตรวจทานภาพ' : 'คลิกเพื่อเปิดหน้าต่างตรวจทานภาพภายในหน้านี้โดยไม่ต้องสลับแท็บ'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 text-xs font-bold text-blue-600">
            <span>{embedLabelStudio ? 'ซ่อนหน้าต่าง' : 'เปิดในหน้านี้'}</span>
            {embedLabelStudio ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {embedLabelStudio && (
          <div className="p-4 sm:p-6 border-t border-slate-100 bg-slate-950/5">
            <div className="rounded-2xl overflow-hidden border border-slate-300 bg-white shadow-inner h-[650px] relative">
              <iframe
                src="http://localhost:8085"
                title="Label Studio Embedded Workspace"
                className="w-full h-full border-0"
              />
            </div>
            <div className="flex items-center justify-between pt-3 text-xs text-slate-500">
              <span>เข้าสู่ระบบด้วย: <strong>admin@example.com</strong> / <strong>password123</strong></span>
              <a
                href="http://localhost:8085"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 font-bold hover:underline inline-flex items-center"
              >
                <span>เปิดแบบเต็มจอในแท็บใหม่</span>
                <ExternalLink className="w-3 h-3 ml-1" />
              </a>
            </div>
          </div>
        )}
      </div>

      {/* 5. Retraining Audit Trail & Version History Table */}
      <div className="rounded-[32px] bg-white p-6 sm:p-8 border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black font-display text-slate-900">
              ประวัติการฝึกฝนโมเดล (Model Versions & Retraining Audit Trail)
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              บันทึกทุกรอบการ Re-train พร้อมค่า Metrics และ Run ID ใน MLflow Model Registry
            </p>
          </div>
          <span className="text-xs font-extrabold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
            {history.length} เวอร์ชัน
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
              {history.map((item, idx) => {
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
  );
};

export default ReviewHub;

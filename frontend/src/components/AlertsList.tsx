import React, { useState } from 'react';
import type { AlertEvent, Station } from '../types';
import { Bell, CheckCircle2, Send, MessageSquare } from 'lucide-react';
import { floodlensApi } from '../api/floodlensApi';
import { PillButton } from './ui/PillButton';

interface AlertsListProps {
  alerts: AlertEvent[];
  selectedStation: Station | null;
  onAlertCreated: () => void;
}

export const AlertsList: React.FC<AlertsListProps> = ({
  alerts,
  selectedStation,
  onAlertCreated,
}) => {
  const [triggering, setTriggering] = useState<boolean>(false);

  const handleTestAlert = async () => {
    if (!selectedStation) return;
    setTriggering(true);
    try {
      await floodlensApi.testTriggerAlert(
        selectedStation.station_code,
        selectedStation.critical_level + 0.1,
        'CRITICAL'
      );
      onAlertCreated();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการยิงแจ้งเตือนทดสอบ');
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-[32px] sm:rounded-[36px] bg-white/85 backdrop-blur-2xl border border-white/80 p-6 sm:p-7 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.05)] transition-all flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center shadow-sm">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold font-display text-slate-900">ศูนย์แจ้งเตือนภัยฉุกเฉิน</h3>
            <p className="text-xs text-slate-500 mt-0.5">สัญญาณเตือนภัย & LINE Bot</p>
          </div>
        </div>

        <PillButton
          onClick={handleTestAlert}
          disabled={triggering}
          variant="glass"
          size="sm"
          icon={<Send className={`w-3 h-3 text-rose-600 ${triggering ? 'animate-spin' : ''}`} />}
          loading={triggering}
          className="!py-1.5 text-xs font-semibold text-rose-700 hover:text-rose-800"
          title="ทดสอบยิงเตือนภัยเข้า LINE Bot จริง"
        >
          ทดสอบ LINE
        </PillButton>
      </div>

      {/* Alert Feed */}
      <div className="space-y-3 overflow-y-auto max-h-72 pr-1 custom-scrollbar">
        {alerts.length === 0 ? (
          <div className="text-center py-10 text-slate-500 text-xs flex flex-col items-center justify-center bg-slate-50/60 rounded-2xl border border-slate-200/60 p-6">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2" />
            <span className="font-bold text-slate-800 text-sm font-display">ไม่มีการแจ้งเตือนภัยวิกฤต</span>
            <span className="text-xs text-slate-500 mt-1">สถานการณ์น้ำปัจจุบันอยู่ในเกณฑ์ควบคุมได้</span>
          </div>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-4 rounded-2xl border text-xs flex flex-col space-y-2 shadow-sm transition-all hover:translate-y-[-1px] ${
                alert.severity_level === 'CRITICAL'
                  ? 'bg-rose-50/70 border-rose-200/80 text-rose-950'
                  : 'bg-amber-50/70 border-amber-200/80 text-amber-950'
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`font-bold px-2.5 py-0.5 rounded-full text-[10px] uppercase shadow-sm ${
                    alert.severity_level === 'CRITICAL'
                      ? 'bg-rose-600 text-white'
                      : 'bg-amber-500 text-white'
                  }`}
                >
                  {alert.severity_level === 'CRITICAL' ? 'วิกฤตน้ำท่วม' : 'เตือนภัยเฝ้าระวัง'}
                </span>
                <span className="text-[11px] text-slate-500 font-medium">
                  {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} น.
                </span>
              </div>

              <p className="text-slate-800 font-medium leading-relaxed">{alert.message}</p>

              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-200/50 font-medium">
                <span>ระดับน้ำ: <strong className="text-slate-900 font-display">{alert.trigger_water_level.toFixed(2)} ม.</strong></span>
                <span className="flex items-center space-x-1 text-emerald-700 font-semibold">
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{alert.is_sent_line ? 'ส่งเข้า LINE สำเร็จ' : 'บันทึกใน Outbox'}</span>
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AlertsList;

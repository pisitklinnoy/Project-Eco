import React, { useState } from 'react';
import type { AlertEvent, Station } from '../types';
import { Bell, CheckCircle2, Send, MessageSquare } from 'lucide-react';
import { floodlensApi } from '../api/floodlensApi';

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
    <div className="bg-white border-2 border-blue-100 rounded-2xl p-5 shadow-[0_4px_20px_-4px_rgba(2,132,199,0.08)] hover:shadow-[0_8px_30px_-4px_rgba(2,132,199,0.12)] transition-all flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-blue-100/80">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-rose-100 text-rose-700">
            <Bell className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">ศูนย์แจ้งเตือนภัยน้ำท่วมฉุกเฉิน</h3>
            <p className="text-[11px] text-slate-500">ประวัติการส่งสัญญาณเตือนภัย & LINE Bot</p>
          </div>
        </div>
        <button
          onClick={handleTestAlert}
          disabled={triggering}
          className="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition shadow-sm"
          title="ทดสอบยิงเตือนภัยเข้า LINE Bot จริง"
        >
          <Send className={`w-3 h-3 ${triggering ? 'animate-spin' : ''}`} />
          <span>ทดสอบ LINE Alert</span>
        </button>
      </div>

      {/* Alert Feed */}
      <div className="space-y-2.5 overflow-y-auto max-h-64 pr-1">
        {alerts.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-xs flex flex-col items-center justify-center bg-blue-50/40 rounded-xl border border-blue-100">
            <CheckCircle2 className="w-7 h-7 text-emerald-500 mb-1.5" />
            <span className="font-bold text-slate-700">ไม่มีประวัติการแจ้งเตือนภัยวิกฤต</span>
            <span className="text-[11px] text-slate-400 mt-0.5">สถานการณ์น้ำปัจจุบันอยู่ในเกณฑ์ควบคุมได้</span>
          </div>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-3 rounded-xl border text-xs flex flex-col space-y-1.5 shadow-sm ${
                alert.severity_level === 'CRITICAL'
                  ? 'bg-rose-50/80 border-rose-200 text-rose-950'
                  : 'bg-amber-50/80 border-amber-200 text-amber-950'
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`font-bold px-2 py-0.5 rounded-full text-[10px] uppercase shadow-sm ${
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

              <p className="text-slate-800 font-semibold leading-snug">{alert.message}</p>

              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1.5 border-t border-slate-200/60 font-medium">
                <span>ระดับน้ำแจ้งเตือน: <strong className="text-slate-900">{alert.trigger_water_level.toFixed(2)} ม.</strong></span>
                <span className="flex items-center space-x-1 text-emerald-700 font-bold">
                  <MessageSquare className="w-3 h-3 text-emerald-600" />
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

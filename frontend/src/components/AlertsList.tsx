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
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Bell className="w-4 h-4 text-red-400" />
          <h3 className="text-sm font-bold text-white">ประวัติการแจ้งเตือนภัยน้ำท่วม</h3>
        </div>
        <button
          onClick={handleTestAlert}
          disabled={triggering}
          className="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 text-xs font-semibold transition"
          title="ทดสอบยิงเตือนภัยเข้า LINE Bot จริง"
        >
          <Send className={`w-3 h-3 ${triggering ? 'animate-spin' : ''}`} />
          <span>ทดสอบส่ง LINE Alert</span>
        </button>
      </div>

      {/* Alert Feed */}
      <div className="space-y-2.5 overflow-y-auto max-h-64 pr-1">
        {alerts.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-xs flex flex-col items-center">
            <CheckCircle2 className="w-6 h-6 text-emerald-500/50 mb-1" />
            <span>ยังไม่มีประวัติการแจ้งเตือนภัยวิกฤต (สถานะปกติ)</span>
          </div>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-3 rounded-xl border text-xs flex flex-col space-y-1.5 ${
                alert.severity_level === 'CRITICAL'
                  ? 'bg-red-500/10 border-red-500/30 text-red-200'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`font-bold px-2 py-0.5 rounded text-[10px] uppercase ${
                    alert.severity_level === 'CRITICAL'
                      ? 'bg-red-500 text-white'
                      : 'bg-amber-500 text-slate-900'
                  }`}
                >
                  {alert.severity_level}
                </span>
                <span className="text-[11px] text-slate-400">
                  {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <p className="text-slate-200 leading-snug">{alert.message}</p>

              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800">
                <span>ระดับน้ำเตือน: {alert.trigger_water_level.toFixed(2)} ม.</span>
                <span className="flex items-center space-x-1 text-emerald-400">
                  <MessageSquare className="w-3 h-3" />
                  <span>{alert.is_sent_line ? 'ส่งเข้า LINE สำเร็จ' : 'บันทึกในระบบ Outbox'}</span>
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

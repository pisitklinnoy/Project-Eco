import React, { useState, useEffect } from 'react';
import type { Station, WaterMeasurement, ReviewPackage } from '../types';
import { floodlensApi } from '../api/floodlensApi';
import { X, CheckCircle, AlertTriangle, ExternalLink, Send, ShieldAlert } from 'lucide-react';

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  station: Station | null;
  measurement: WaterMeasurement | null;
  onReviewSubmitted: () => void;
}

export const ReviewModal: React.FC<ReviewModalProps> = ({
  isOpen,
  onClose,
  station,
  measurement,
  onReviewSubmitted,
}) => {
  const [reviewPackage, setReviewPackage] = useState<ReviewPackage | null>(null);
  const [correctedLevel, setCorrectedLevel] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string>('');

  useEffect(() => {
    if (isOpen && measurement && station) {
      setCorrectedLevel(measurement.water_level.toString());
      setLoading(true);
      floodlensApi
        .getReviewPackage(measurement.id, station.station_code)
        .then((pkg) => setReviewPackage(pkg))
        .catch((err) => console.error('Failed to load review package', err))
        .finally(() => setLoading(false));
    } else {
      setReviewPackage(null);
      setSuccessMsg('');
    }
  }, [isOpen, measurement, station]);

  if (!isOpen || !station) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!measurement) return;

    setSubmitting(true);
    try {
      await floodlensApi.submitReview(measurement.id, parseFloat(correctedLevel), notes);
      setSuccessMsg('บันทึกผลการตรวจทานโดยมนุษย์เรียบร้อยแล้ว!');
      setTimeout(() => {
        onReviewSubmitted();
        onClose();
      }, 1500);
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการบันทึกผลตรวจทาน');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white border-2 border-blue-200 rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-blue-50/90 via-sky-50/50 to-white border-b border-blue-100 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-blue-100 text-blue-700">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-blue-950">ระบบช่วยตรวจทานภาพ (Review Agent)</h3>
              <p className="text-xs text-slate-500 font-medium">สถานี: {station.name} ({station.station_code})</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-slate-700 text-sm bg-slate-50/40">
          {/* Reason Alert */}
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start space-x-2.5 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
            <div>
              <span className="font-bold">สาเหตุที่ส่งเข้าตรวจทาน: </span>
              {reviewPackage?.reason_flagged || 'LOW_CONFIDENCE_AMBIGUOUS_WATERLINE (ระดับความมั่นใจ AI ต่ำกว่าเกณฑ์)'}
            </div>
          </div>

          {/* Context from Review Agent */}
          <div>
            <h4 className="text-xs font-extrabold text-blue-950 uppercase tracking-wider mb-2">
              หลักฐานบริบทย้อนหลัง 1 ชม. (รวบรวมโดย Review Agent)
            </h4>
            <div className="grid grid-cols-3 gap-2.5">
              {reviewPackage?.historical_images && reviewPackage.historical_images.length > 0 ? (
                reviewPackage.historical_images.slice(0, 3).map((item, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-white border border-blue-100 text-[11px] shadow-sm">
                    <div className="text-slate-500 font-medium">{new Date(item.snapshot_time).toLocaleTimeString()}</div>
                    <div className="font-extrabold text-blue-700 mt-1">น้ำ: {item.ai_detected_level} ม.</div>
                    <div className="text-slate-400">ฝน: {item.rain_amount_1h} มม.</div>
                  </div>
                ))
              ) : (
                <div className="col-span-3 text-center py-5 text-xs text-slate-500 bg-white rounded-xl border border-blue-100">
                  {loading ? 'กำลังรวบรวมข้อมูลเฟรมภาพและปริมาณฝนย้อนหลัง...' : 'ไม่มีข้อมูลภาพย้อนหลัง'}
                </div>
              )}
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                ระดับน้ำจริงที่มนุษย์ตรวจพบ (เมตร รทก.) *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={correctedLevel}
                onChange={(e) => setCorrectedLevel(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                บันทึกหมายเหตุจากผู้ตรวจทาน (Optional)
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="เช่น แสงสะท้อนจ้าตอนพลบค่ำทำให้โมเดลอ่านค่าคลาดเคลื่อน..."
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
              />
            </div>

            {successMsg && (
              <div className="p-3 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>{successMsg}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <a
                href="http://localhost:8085"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center space-x-1"
              >
                <span>เปิดดูใน Label Studio</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs transition"
                >
                  ปิด
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs flex items-center space-x-1.5 shadow-md shadow-blue-500/20 transition"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submitting ? 'กำลังบันทึก...' : 'ยืนยันผลตรวจทาน'}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

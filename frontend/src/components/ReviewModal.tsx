import React, { useState, useEffect } from 'react';
import type { Station, WaterMeasurement, ReviewPackage } from '../types';
import { floodlensApi } from '../api/floodlensApi';
import { X, CheckCircle, AlertTriangle, ExternalLink, Send, ShieldAlert } from 'lucide-react';
import { PillButton } from './ui/PillButton';
import { IconButton } from './ui/IconButton';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xl animate-fade-in">
      <div className="bg-white/95 backdrop-blur-2xl border border-white/80 rounded-[32px] sm:rounded-[36px] max-w-2xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-50 text-sky-600 border border-sky-100 flex items-center justify-center shadow-sm">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold font-display text-slate-900">ระบบช่วยตรวจทานภาพ (Review Agent)</h3>
              <p className="text-xs text-slate-500 font-medium">สถานี: {station.name} ({station.station_code})</p>
            </div>
          </div>
          <IconButton onClick={onClose} variant="ghost" size="sm" tooltip="ปิดหน้าต่าง">
            <X className="w-5 h-5 text-slate-400 hover:text-slate-700" />
          </IconButton>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-slate-700 text-sm bg-transparent">
          {/* Reason Alert */}
          <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200/80 text-amber-900 flex items-start space-x-3 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
            <div>
              <span className="font-bold">สาเหตุที่ส่งเข้าตรวจทาน: </span>
              {reviewPackage?.reason_flagged || 'LOW_CONFIDENCE_AMBIGUOUS_WATERLINE (ระดับความมั่นใจ AI ต่ำกว่าเกณฑ์)'}
            </div>
          </div>

          {/* Context from Review Agent */}
          <div>
            <h4 className="text-xs font-bold font-display text-slate-900 uppercase tracking-wider mb-2.5">
              หลักฐานบริบทย้อนหลัง 1 ชม. (รวบรวมโดย Review Agent)
            </h4>
            <div className="grid grid-cols-3 gap-2.5">
              {reviewPackage?.historical_images && reviewPackage.historical_images.length > 0 ? (
                reviewPackage.historical_images.slice(0, 3).map((item, idx) => (
                  <div key={idx} className="p-3.5 rounded-2xl bg-white border border-slate-200/80 text-[11px] shadow-sm">
                    <div className="text-slate-500 font-medium">{new Date(item.snapshot_time).toLocaleTimeString()}</div>
                    <div className="font-bold font-display text-sky-700 mt-1">น้ำ: {item.ai_detected_level} ม.</div>
                    <div className="text-slate-400">ฝน: {item.rain_amount_1h} มม.</div>
                  </div>
                ))
              ) : (
                <div className="col-span-3 text-center py-6 text-xs text-slate-500 bg-white rounded-2xl border border-slate-200/80">
                  {loading ? 'กำลังรวบรวมข้อมูลเฟรมภาพและปริมาณฝนย้อนหลัง...' : 'ไม่มีข้อมูลภาพย้อนหลัง'}
                </div>
              )}
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                ระดับน้ำจริงที่มนุษย์ตรวจพบ (เมตร รทก.) *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={correctedLevel}
                onChange={(e) => setCorrectedLevel(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-2.5 text-sm text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-slate-900 shadow-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                บันทึกหมายเหตุจากผู้ตรวจทาน (Optional)
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="เช่น แสงสะท้อนจ้าตอนพลบค่ำทำให้โมเดลอ่านค่าคลาดเคลื่อน..."
                className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 shadow-sm"
              />
            </div>

            {successMsg && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>{successMsg}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-3">
              <a
                href="http://localhost:8085"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-sky-700 hover:text-sky-900 font-semibold flex items-center space-x-1"
              >
                <span>เปิดดูใน Label Studio</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <div className="flex space-x-2">
                <PillButton
                  type="button"
                  onClick={onClose}
                  variant="secondary"
                  size="sm"
                  className="font-semibold text-xs"
                >
                  ปิด
                </PillButton>
                <PillButton
                  type="submit"
                  disabled={submitting}
                  variant="primary"
                  size="sm"
                  loading={submitting}
                  icon={<Send className="w-3.5 h-3.5" />}
                  className="font-semibold text-xs shadow-md"
                >
                  {submitting ? 'กำลังบันทึก...' : 'ยืนยันผลตรวจทาน'}
                </PillButton>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ReviewModal;

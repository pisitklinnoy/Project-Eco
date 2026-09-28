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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">ระบบช่วยตรวจทานภาพ (Review Agent)</h3>
              <p className="text-xs text-slate-400">สถานี: {station.name} ({station.station_code})</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-slate-300 text-sm">
          {/* Reason Alert */}
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-start space-x-2.5 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">สาเหตุที่ส่งเข้าตรวจทาน: </span>
              {reviewPackage?.reason_flagged || 'LOW_CONFIDENCE_AMBIGUOUS_WATERLINE (ระดับความมั่นใจ AI ต่ำกว่าเกณฑ์)'}
            </div>
          </div>

          {/* Context from Review Agent */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              หลักฐานบริบทย้อนหลัง 1 ชม. (รวบรวมโดย Review Agent)
            </h4>
            <div className="grid grid-cols-3 gap-2">
              {reviewPackage?.historical_images && reviewPackage.historical_images.length > 0 ? (
                reviewPackage.historical_images.slice(0, 3).map((item, idx) => (
                  <div key={idx} className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-[11px]">
                    <div className="text-slate-400">{new Date(item.snapshot_time).toLocaleTimeString()}</div>
                    <div className="font-bold text-blue-400 mt-1">น้ำ: {item.ai_detected_level} ม.</div>
                    <div className="text-slate-500">ฝน: {item.rain_amount_1h} มม.</div>
                  </div>
                ))
              ) : (
                <div className="col-span-3 text-center py-4 text-xs text-slate-500">
                  {loading ? 'กำลังรวบรวมข้อมูลเฟรมภาพและปริมาณฝนย้อนหลัง...' : 'ไม่มีข้อมูลภาพย้อนหลัง'}
                </div>
              )}
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                ระดับน้ำจริงที่มนุษย์ตรวจพบ (เมตร) *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={correctedLevel}
                onChange={(e) => setCorrectedLevel(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white font-bold text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                บันทึกหมายเหตุของผู้ตรวจ (Reviewer Notes)
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="เช่น ภาพมีแสงสะท้อนผิวน้ำ แต่ระดับน้ำจริงเทียบกับขีดแดงอยู่ที่ 3.20 ม."
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {successMsg && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center space-x-2">
                <CheckCircle className="w-4 h-4" />
                <span>{successMsg}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <a
                href="http://localhost:8085"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-orange-400 hover:text-orange-300 flex items-center space-x-1"
              >
                <span>เปิดใน Label Studio</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white flex items-center space-x-1.5 shadow-lg shadow-blue-500/20 transition"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submitting ? 'กำลังบันทึก...' : 'ยืนยันผลตรวจ'}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

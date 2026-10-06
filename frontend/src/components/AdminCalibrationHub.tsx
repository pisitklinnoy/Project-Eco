import React from 'react';
import type { Station, WaterMeasurement } from '../types';
import { CameraViewer } from './CameraViewer';
import { SectionHeader } from './ui/SectionHeader';
import {
  Crop,
  Target,
  Sparkles,
  Camera,
  MapPin,
  CheckCircle2,
} from 'lucide-react';

interface AdminCalibrationHubProps {
  stations?: Station[];
  station: Station | null;
  onSelectStation?: (stn: Station) => void;
  measurement: WaterMeasurement | null;
  onOpenManualBBox: () => void;
  onOpenCalibrate: () => void;
  onOpenOnDemand: () => void;
  onOpenReview: () => void;
}

export const AdminCalibrationHub: React.FC<AdminCalibrationHubProps> = ({
  stations = [],
  station,
  onSelectStation,
  measurement,
  onOpenManualBBox,
  onOpenCalibrate,
  onOpenOnDemand,
  onOpenReview,
}) => {
  return (
    <div className="space-y-8 animate-fadeIn">
      <SectionHeader
        number="ADMIN 02"
        badge="Vision Calibration & AI Tools"
        title="ศูนย์ปรับเทียบพิกัดเสาวัดน้ำ & เครื่องมือ AI Vision"
        subtitle="เครื่องมือเฉพาะทางสำหรับวิศวกรและผู้เชี่ยวชาญ: ปรับจูน Bounding Box, สอบเทียบสเกลพิกเซลกับเมตรจริง และตรวจวัดภาพถ่ายนอกรอบ"
        actionLabel="Engineering View Active"
      />

      {/* Station Selector Bar for Calibration */}
      {stations.length > 0 && onSelectStation && (
        <div className="flex flex-wrap items-center gap-2 p-2 rounded-2xl bg-white/70 backdrop-blur-md border border-white/80 shadow-sm">
          <div className="flex items-center space-x-1.5 px-3 py-1 text-xs font-bold text-slate-500">
            <MapPin className="w-3.5 h-3.5 text-blue-600" />
            <span>เลือกสถานีที่ต้องการปรับเทียบ:</span>
          </div>
          {stations.map((stn) => {
            const isSelected = station?.station_code === stn.station_code;
            return (
              <button
                key={stn.station_code}
                onClick={() => onSelectStation(stn)}
                className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-md'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                <span>{stn.name}</span>
                <span className="text-[10px] opacity-75 font-mono">({stn.station_code})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Quick Interactive Tools Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Tool 1: Manual BBox */}
        <div className="rounded-[24px] bg-white/80 backdrop-blur-xl border border-white/90 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                <Crop className="w-5 h-5" />
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-extrabold uppercase border border-blue-200">
                YOLO v2 Override
              </span>
            </div>
            <h4 className="font-extrabold text-slate-900 text-sm">กำหนดกรอบเสาวัดน้ำ (Manual BBox)</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              ลากกรอบระบุตำแหน่งเสาวัดน้ำบนภาพสดด้วยตนเอง เพื่อแก้ไขกรณีมุมกล้องเบี้ยว หรือ AI ตรวจหาเสาไม่เจอ
            </p>
          </div>
          <button
            onClick={onOpenManualBBox}
            className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-blue-600 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
          >
            <Crop className="w-4 h-4" />
            <span>เปิดเครื่องมือวาดกรอบ BBox</span>
          </button>
        </div>

        {/* Tool 2: Click to Calibrate */}
        <div className="rounded-[24px] bg-white/80 backdrop-blur-xl border border-white/90 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                <Target className="w-5 h-5" />
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-extrabold uppercase border border-emerald-200">
                Pixel-to-Meter
              </span>
            </div>
            <h4 className="font-extrabold text-slate-900 text-sm">ปรับเทียบสเกลเสา (Click-to-Calibrate)</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              คลิกกำหนดจุด Anchor บนเสาเพื่อปรับเทียบสเกลความสัมพันธ์ระหว่างพิกเซลกับระดับความสูงจริง (ม. รทก.)
            </p>
          </div>
          <button
            onClick={onOpenCalibrate}
            className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-emerald-600 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
          >
            <Target className="w-4 h-4" />
            <span>เปิดเครื่องมือปรับเทียบสเกล</span>
          </button>
        </div>

        {/* Tool 3: On-Demand Predictor */}
        <div className="rounded-[24px] bg-white/80 backdrop-blur-xl border border-white/90 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                <Sparkles className="w-5 h-5 text-amber-500" />
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-extrabold uppercase border border-amber-200">
                Active Learning
              </span>
            </div>
            <h4 className="font-extrabold text-slate-900 text-sm">ตรวจวัดภาพถ่ายอิสระ (On-Demand AI)</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              อัปโหลดรูปภาพจากมือถือหรือกล้องภายนอก เพื่อให้โมเดลประมวลผลคำนวณระดับน้ำและป้อนผลลัพธ์เข้าสู่ระบบ
            </p>
          </div>
          <button
            onClick={onOpenOnDemand}
            className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-sky-600 hover:brightness-110 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>ทดสอบวิเคราะห์ภาพถ่าย</span>
          </button>
        </div>
      </div>

      {/* Main Engineering Camera Inspector */}
      <div className="rounded-[32px] bg-white/70 backdrop-blur-xl border border-white/80 p-6 sm:p-8 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">
                Engineering Camera Inspector: {station?.name} ({station?.station_code})
              </h3>
              <p className="text-xs text-slate-500">
                ตรวจสอบภาพความละเอียดสูง, พิกัดเสาวัดน้ำ, สเกลไม้บรรทัด และผลลัพธ์โมเดลแบบเจาะลึก
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200">
              สถานะ: พิกัดเสาเปิดใช้งาน
            </span>
          </div>
        </div>

        <div className="h-[600px] w-full">
          <CameraViewer
            station={station}
            measurement={measurement}
            onOpenReview={onOpenReview}
            onOpenCalibrate={onOpenCalibrate}
            onOpenManualBBox={onOpenManualBBox}
          />
        </div>
      </div>
    </div>
  );
};

export default AdminCalibrationHub;

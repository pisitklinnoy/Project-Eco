import React from 'react';
import {
  Waves,
  LayoutDashboard,
  MapPin,
  Camera,
  TrendingUp,
  ShieldCheck,
  Target,
  RefreshCw,
  Cpu,
  Sparkles,
} from 'lucide-react';
import { IconButton } from './ui/IconButton';

interface FloatingSidebarProps {
  activeSection: string;
  onNavigate: (sectionId: string) => void;
  onOpenReview: () => void;
  onOpenCalibrate: () => void;
  onOpenOnDemand?: () => void;
  onRefresh: () => void;
  loading?: boolean;
}

export const FloatingSidebar: React.FC<FloatingSidebarProps> = ({
  activeSection,
  onNavigate,
  onOpenReview,
  onOpenCalibrate,
  onOpenOnDemand,
  onRefresh,
  loading = false,
}) => {
  const navItems = [
    { id: 'hero', icon: <LayoutDashboard className="w-4 h-4" />, label: 'ภาพรวมระบบ (Overview)' },
    { id: 'gis-cctv', icon: <MapPin className="w-4 h-4" />, label: 'แผนที่ GIS & กล้อง CCTV' },
    { id: 'cctv-inspector', icon: <Camera className="w-4 h-4" />, label: 'วิเคราะห์ AI Staff Gauge' },
    { id: 'forecast-alerts', icon: <TrendingUp className="w-4 h-4" />, label: 'พยากรณ์ล่วงหน้า & แจ้งเตือน' },
    { id: 'review-hub', icon: <Cpu className="w-4 h-4 text-emerald-600" />, label: 'ศูนย์ตรวจทาน & Retrain AI' },
  ];

  return (
    <aside
      className="hidden lg:flex fixed left-5 top-1/2 -translate-y-1/2 z-50 flex-col items-center py-4 px-2 rounded-[32px] bg-white/75 backdrop-blur-2xl border border-white/90 shadow-[0_20px_50px_rgba(15,23,42,0.08)] gap-3 select-none transition-all duration-300"
      aria-label="Sidebar Navigation Rail"
    >
      {/* Brand Icon (Logo) */}
      <button
        onClick={() => onNavigate('hero')}
        title="Hatyai FloodLens AI"
        className="w-11 h-11 rounded-full bg-gradient-to-tr from-blue-600 via-sky-500 to-blue-700 text-white flex items-center justify-center shadow-md shadow-blue-500/30 hover:scale-105 active:scale-95 transition-all cursor-pointer border border-white/30"
      >
        <Waves className="w-5 h-5 animate-pulse" />
      </button>

      {/* Primary Section Divider */}
      <div className="w-6 h-[1px] bg-slate-200/80 my-0.5" />

      {/* Navigation Group */}
      <div className="flex flex-col items-center space-y-2">
        {navItems.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <IconButton
              key={item.id}
              onClick={() => onNavigate(item.id)}
              active={isActive}
              tooltip={item.label}
              size="md"
              className={isActive ? '!bg-slate-900 !text-white shadow-lg shadow-slate-900/20' : ''}
            >
              {item.icon}
            </IconButton>
          );
        })}
      </div>

      {/* Secondary Action Divider */}
      <div className="w-6 h-[1px] bg-slate-200/80 my-0.5" />

      {/* Quick Human-in-the-Loop & Inspection Actions */}
      <div className="flex flex-col items-center space-y-2">
        {onOpenOnDemand && (
          <IconButton
            onClick={onOpenOnDemand}
            tooltip="ตรวจวัดระดับน้ำจากภาพถ่าย (On-Demand AI)"
            size="md"
            className="text-sky-600 hover:!bg-sky-50 hover:!text-sky-700"
          >
            <Sparkles className="w-4 h-4" />
          </IconButton>
        )}

        <IconButton
          onClick={onOpenReview}
          tooltip="ตรวจทานผลวัดน้ำ (Human-in-the-Loop)"
          size="md"
          className="text-emerald-700 hover:!bg-emerald-50 hover:!text-emerald-800"
        >
          <ShieldCheck className="w-4 h-4" />
        </IconButton>

        <IconButton
          onClick={onOpenCalibrate}
          tooltip="ปรับเทียบสเกลเสาวัดน้ำ (Calibrate)"
          size="md"
          className="text-blue-700 hover:!bg-blue-50 hover:!text-blue-800"
        >
          <Target className="w-4 h-4" />
        </IconButton>

        <IconButton
          onClick={onRefresh}
          disabled={loading}
          tooltip="รีเฟรชโทรมาตรทันที"
          size="md"
          className="text-slate-600 hover:!bg-slate-100"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
        </IconButton>
      </div>
    </aside>
  );
};

export default FloatingSidebar;

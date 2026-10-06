import React from 'react';
import {
  Waves,
  LayoutDashboard,
  TrendingUp,
  Cpu,
  Sliders,
  Server,
  RefreshCw,
  ShieldCheck,
  Target,
  Globe,
  ShieldAlert,
  Camera,
  Crop,
} from 'lucide-react';
import { IconButton } from './ui/IconButton';
import type { UserRole } from './Navbar';

interface FloatingSidebarProps {
  role: UserRole;
  activePage: string;
  onNavigate: (pageId: string) => void;
  onSwitchRole: (role: UserRole) => void;
  onOpenReview: () => void;
  onOpenCalibrate: () => void;
  onOpenManualBBox?: () => void;
  onOpenOnDemand?: () => void;
  onRefresh: () => void;
  loading?: boolean;
}

export const FloatingSidebar: React.FC<FloatingSidebarProps> = ({
  role,
  activePage,
  onNavigate,
  onSwitchRole,
  onOpenReview,
  onOpenCalibrate,
  onOpenManualBBox,
  onOpenOnDemand,
  onRefresh,
  loading = false,
}) => {
  const publicNavItems = [
    { id: 'overview', icon: <LayoutDashboard className="w-4 h-4" />, label: 'สถานการณ์สด & แผนที่ GIS' },
    { id: 'forecast', icon: <TrendingUp className="w-4 h-4" />, label: 'พยากรณ์ล่วงหน้า & แจ้งเตือน' },
  ];

  const adminNavItems = [
    { id: 'admin-review', icon: <Cpu className="w-4 h-4" />, label: 'ศูนย์ตรวจทาน & Retrain AI' },
    { id: 'admin-calibration', icon: <Sliders className="w-4 h-4" />, label: 'ปรับเทียบเสา & Vision Tools' },
    { id: 'admin-observability', icon: <Server className="w-4 h-4" />, label: 'สถานะระบบ MLOps' },
  ];

  const navItems = role === 'public' ? publicNavItems : adminNavItems;

  return (
    <aside
      className="hidden lg:flex fixed left-5 top-1/2 -translate-y-1/2 z-50 flex-col items-center py-4 px-2 rounded-[32px] bg-white/80 backdrop-blur-2xl border border-white/90 shadow-[0_20px_50px_rgba(15,23,42,0.08)] gap-3 select-none transition-all duration-300"
      aria-label="Sidebar Navigation Rail"
    >
      {/* Brand Icon (Logo) */}
      <button
        onClick={() => onNavigate(role === 'public' ? 'overview' : 'admin-review')}
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
          const isActive = activePage === item.id;
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

      {/* Role Switcher Button */}
      <IconButton
        onClick={() => onSwitchRole(role === 'public' ? 'admin' : 'public')}
        tooltip={role === 'public' ? 'สลับไปโหมดเจ้าหน้าที่ (Admin)' : 'สลับไปโหมดประชาชน (Public)'}
        size="md"
        className={role === 'admin' ? '!bg-amber-100 !text-amber-800' : 'text-blue-600 hover:!bg-blue-50'}
      >
        {role === 'public' ? <ShieldAlert className="w-4 h-4 text-amber-500" /> : <Globe className="w-4 h-4 text-blue-600" />}
      </IconButton>

      {/* Citizen & Admin Instant Water Level Check Tool */}
      {onOpenOnDemand && (
        <IconButton
          onClick={onOpenOnDemand}
          tooltip="ตรวจวัดระดับน้ำจากภาพถ่าย (Instant Water Check)"
          size="md"
          className="text-sky-600 hover:!bg-sky-50 hover:!text-sky-700"
        >
          <Camera className="w-4 h-4 text-sky-600" />
        </IconButton>
      )}

      {/* Admin Engineering Quick Actions (Only visible in admin mode) */}
      {role === 'admin' && (
        <div className="flex flex-col items-center space-y-2 pt-1 border-t border-slate-200/60 w-full">
          {onOpenManualBBox && (
            <IconButton
              onClick={onOpenManualBBox}
              tooltip="วาดกรอบเสาภาพสด / ครอปเสา (Manual Crop)"
              size="md"
              className="text-amber-700 hover:!bg-amber-50 hover:!text-amber-800"
            >
              <Crop className="w-4 h-4 text-amber-600" />
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
        </div>
      )}

      {/* General Refresh Telemetry Button */}
      <IconButton
        onClick={onRefresh}
        disabled={loading}
        tooltip="รีเฟรชข้อมูลทันที"
        size="md"
        className="text-slate-600 hover:!bg-slate-100"
      >
        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
      </IconButton>
    </aside>
  );
};

export default FloatingSidebar;

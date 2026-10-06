import React from 'react';
import {
  Waves,
  Radio,
  MapPin,
  ChevronDown,
  Globe,
  ShieldAlert,
  TrendingUp,
  Cpu,
  Sliders,
  Server,
  LayoutDashboard,
  Camera,
} from 'lucide-react';
import type { Station } from '../types';

export type UserRole = 'public' | 'admin';

export interface NavLinkItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

interface NavbarProps {
  stations: Station[];
  selectedStation: Station | null;
  onSelectStation: (stn: Station) => void;
  systemStatus: 'healthy' | 'warning' | 'error';
  role: UserRole;
  onSwitchRole: (role: UserRole) => void;
  activePage: string;
  onNavigate: (pageId: string) => void;
  alertCount?: number;
  onOpenOnDemand?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  stations,
  selectedStation,
  onSelectStation,
  systemStatus,
  role,
  onSwitchRole,
  activePage,
  onNavigate,
  alertCount = 0,
  onOpenOnDemand,
}) => {
  const publicNavLinks: NavLinkItem[] = [
    { id: 'overview', label: 'สถานการณ์สด & แผนที่ GIS', icon: <LayoutDashboard className="w-3.5 h-3.5" /> },
    { id: 'forecast', label: 'พยากรณ์ & เตือนภัย', icon: <TrendingUp className="w-3.5 h-3.5" />, badge: alertCount },
  ];

  const adminNavLinks: NavLinkItem[] = [
    { id: 'admin-review', label: 'ศูนย์ตรวจทาน & Retrain AI', icon: <Cpu className="w-3.5 h-3.5" /> },
    { id: 'admin-calibration', label: 'ปรับเทียบเสา & Vision', icon: <Sliders className="w-3.5 h-3.5" /> },
    { id: 'admin-observability', label: 'สถานะระบบ MLOps', icon: <Server className="w-3.5 h-3.5" /> },
  ];

  const currentNavLinks = role === 'public' ? publicNavLinks : adminNavLinks;

  return (
    <header className="sticky top-3 sm:top-5 z-40 w-full px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto transition-all duration-300">
      <div className="rounded-full bg-white/85 backdrop-blur-2xl border border-white/90 shadow-[0_16px_40px_-10px_rgba(15,23,42,0.07)] px-3.5 sm:px-5 py-2.5 flex items-center justify-between gap-3 select-none">
        
        {/* Brand & Municipal Identity */}
        <div
          onClick={() => onNavigate(role === 'public' ? 'overview' : 'admin-review')}
          className="flex items-center space-x-2.5 shrink-0 cursor-pointer group"
        >
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 via-sky-500 to-blue-700 p-2 flex items-center justify-center shadow-md shadow-blue-500/25 border border-white/40 group-hover:scale-105 transition-transform duration-200">
              <Waves className="w-5 h-5 text-white animate-pulse" />
            </div>
            <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-white animate-ping" />
            <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-white" />
          </div>

          <div className="hidden sm:block">
            <div className="flex items-center space-x-1.5">
              <span className="font-black text-sm tracking-tight text-slate-900 leading-none">
                FloodLens
              </span>
              <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-slate-900 text-white tracking-widest leading-none">
                AI
              </span>
            </div>
            <p className="text-[10px] text-slate-500 font-medium leading-none mt-1">
              เทศบาลนครหาดใหญ่ &bull; ลุ่มน้ำคลองอู่ตะเภา
            </p>
          </div>
        </div>

        {/* Center: Dynamic Mode Navigation Links */}
        <nav className="hidden md:flex items-center space-x-1 bg-slate-100/80 p-1 rounded-full border border-slate-200/60">
          {currentNavLinks.map((link) => {
            const isActive = activePage === link.id;
            return (
              <button
                key={link.id}
                onClick={() => onNavigate(link.id)}
                className={`relative flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200/60 font-black'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                {link.icon}
                <span>{link.label}</span>
                {typeof link.badge === 'number' && link.badge > 0 && (
                  <span className="w-4 h-4 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                    {link.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Right Area: Role Switcher & Station Dropdown */}
        <div className="flex items-center space-x-2 shrink-0">
          
          {/* Instant Tab Role Switcher (Public vs Admin) */}
          <div className="flex items-center bg-slate-100/90 p-1 rounded-full border border-slate-200/80 shadow-inner">
            <button
              onClick={() => onSwitchRole('public')}
              title="สลับสู่มุมมองประชาชน (Public Citizen View)"
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                role === 'public'
                  ? 'bg-blue-600 text-white shadow-sm font-extrabold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">ประชาชน</span>
            </button>
            <button
              onClick={() => onSwitchRole('admin')}
              title="สลับสู่มุมมองเจ้าหน้าที่ / แอดมิน (Admin & Operator View)"
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                role === 'admin'
                  ? 'bg-slate-900 text-white shadow-sm font-extrabold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              <span>เจ้าหน้าที่</span>
            </button>
          </div>

          {/* Station Selector Dropdown */}
          <div className="relative flex items-center bg-slate-100/90 hover:bg-slate-100 border border-slate-200/80 rounded-full px-2.5 sm:px-3 py-1.5 shadow-inner transition-colors">
            <MapPin className="w-3.5 h-3.5 text-blue-600 mr-1.5 shrink-0" />
            <select
              value={selectedStation?.station_code || ''}
              onChange={(e) => {
                const found = stations.find((s) => s.station_code === e.target.value);
                if (found) onSelectStation(found);
              }}
              className="bg-transparent text-xs font-extrabold text-slate-800 focus:outline-none cursor-pointer pr-4 appearance-none max-w-[110px] sm:max-w-[180px] truncate"
            >
              {stations.map((stn) => (
                <option
                  key={stn.station_code}
                  value={stn.station_code}
                  className="bg-white text-slate-900 font-semibold"
                >
                  {stn.name.split(' ')[0]} ({stn.station_code})
                </option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 pointer-events-none" />
          </div>

          {/* Instant Photo Water Level Check (Citizen & Admin Access) */}
          {onOpenOnDemand && (
            <button
              onClick={onOpenOnDemand}
              title="ตรวจวัดระดับน้ำจากภาพถ่ายจุดที่ท่านอยู่ (Instant Water Level Check)"
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-black bg-gradient-to-r from-blue-600 via-sky-600 to-blue-700 hover:from-blue-500 hover:to-sky-500 text-white shadow-sm hover:shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer border border-white/30"
            >
              <Camera className="w-3.5 h-3.5 text-amber-300" />
              <span className="hidden sm:inline">ตรวจวัดภาพถ่าย</span>
              <span className="sm:hidden">วัดภาพ</span>
            </button>
          )}

          {/* Live Status Indicator */}
          <div
            className={`hidden sm:flex items-center space-x-1.5 px-2.5 py-1.5 rounded-full text-xs font-bold border transition-all ${
              systemStatus === 'healthy'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-800'
            }`}
          >
            <Radio
              className={`w-3 h-3 shrink-0 ${
                systemStatus === 'healthy' ? 'text-emerald-600 animate-pulse' : 'text-amber-600'
              }`}
            />
            <span className="text-[10px] font-extrabold tracking-tight uppercase">ONLINE</span>
          </div>
        </div>

      </div>
    </header>
  );
};

export default Navbar;

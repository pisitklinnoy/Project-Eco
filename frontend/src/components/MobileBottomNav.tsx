import React from 'react';
import {
  LayoutDashboard,
  TrendingUp,
  Cpu,
  Sliders,
  Server,
  Globe,
  ShieldAlert,
} from 'lucide-react';
import type { UserRole } from './Navbar';

interface MobileBottomNavProps {
  role: UserRole;
  activePage: string;
  onNavigate: (pageId: string) => void;
  onSwitchRole: (role: UserRole) => void;
  alertCount?: number;
}

interface MobileNavItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  role,
  activePage,
  onNavigate,
  onSwitchRole,
  alertCount = 0,
}) => {
  const publicItems: MobileNavItem[] = [
    { id: 'overview', icon: <LayoutDashboard className="w-5 h-5" />, label: 'สถานการณ์สด' },
    { id: 'forecast', icon: <TrendingUp className="w-5 h-5" />, label: 'พยากรณ์', badge: alertCount },
  ];

  const adminItems: MobileNavItem[] = [
    { id: 'admin-review', icon: <Cpu className="w-5 h-5" />, label: 'Retrain AI' },
    { id: 'admin-calibration', icon: <Sliders className="w-5 h-5" />, label: 'ปรับเทียบเสา' },
    { id: 'admin-observability', icon: <Server className="w-5 h-5" />, label: 'MLOps' },
  ];

  const items: MobileNavItem[] = role === 'public' ? publicItems : adminItems;

  return (
    <nav
      className="lg:hidden fixed bottom-4 left-4 right-4 z-50 flex items-center justify-between py-2 px-3 rounded-full bg-white/90 backdrop-blur-2xl border border-white/90 shadow-[0_16px_40px_rgba(0,0,0,0.14)]"
      aria-label="Mobile Bottom Navigation"
    >
      <div className="flex items-center space-x-1">
        {items.map((item) => {
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`relative flex flex-col items-center justify-center py-1 px-3 rounded-full transition-all duration-200 cursor-pointer ${
                isActive
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
              }`}
            >
              <span className="relative">
                {item.icon}
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span className="absolute -top-1 -right-1.5 w-4 h-4 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-white">
                    {item.badge}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-bold mt-0.5 tracking-tight">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Role Toggle on Mobile Bottom Bar */}
      <button
        onClick={() => onSwitchRole(role === 'public' ? 'admin' : 'public')}
        className="flex items-center space-x-1 px-3 py-1.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-200 cursor-pointer active:scale-95 transition-transform"
      >
        {role === 'public' ? (
          <>
            <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
            <span>โหมดแอดมิน</span>
          </>
        ) : (
          <>
            <Globe className="w-3.5 h-3.5 text-blue-600" />
            <span>โหมดประชาชน</span>
          </>
        )}
      </button>
    </nav>
  );
};

export default MobileBottomNav;

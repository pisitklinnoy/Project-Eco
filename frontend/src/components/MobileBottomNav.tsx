import React from 'react';
import { LayoutDashboard, MapPin, Camera, Bell, Cpu } from 'lucide-react';

interface MobileBottomNavProps {
  activeSection: string;
  onNavigate: (sectionId: string) => void;
  alertCount?: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeSection,
  onNavigate,
  alertCount = 0,
}) => {
  const items = [
    { id: 'hero', icon: <LayoutDashboard className="w-5 h-5" />, label: 'ภาพรวม' },
    { id: 'gis-cctv', icon: <MapPin className="w-5 h-5" />, label: 'GIS' },
    { id: 'cctv-inspector', icon: <Camera className="w-5 h-5" />, label: 'AI เสา' },
    { id: 'forecast-alerts', icon: <Bell className="w-5 h-5" />, label: 'แจ้งเตือน', badge: alertCount },
    { id: 'review-hub', icon: <Cpu className="w-5 h-5" />, label: 'Retrain' },
  ];

  return (
    <nav
      className="lg:hidden fixed bottom-4 left-4 right-4 z-50 flex items-center justify-around py-2 px-3 rounded-full bg-white/85 backdrop-blur-2xl border border-white/90 shadow-[0_16px_40px_rgba(0,0,0,0.12)]"
      aria-label="Mobile Bottom Navigation"
    >
      {items.map((item) => {
        const isActive = activeSection === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`relative flex flex-col items-center justify-center py-1 px-3 rounded-full transition-all duration-200 cursor-pointer ${
              isActive
                ? 'bg-slate-900 text-white shadow-md'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/60'
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
    </nav>
  );
};

export default MobileBottomNav;

import React from 'react';

interface SectionHeaderProps {
  number?: string;
  badge?: string;
  badgeIcon?: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  actionLabel?: string;
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  number,
  badge,
  badgeIcon,
  title,
  subtitle,
  action,
  actionLabel,
  className = '',
}) => {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2 ${className}`}>
      <div className="space-y-1.5 max-w-3xl">
        <div className="flex items-center space-x-2.5">
          {number && (
            <span className="w-7 h-7 rounded-full bg-slate-900 text-white font-mono text-xs font-black flex items-center justify-center shadow-sm">
              {number}
            </span>
          )}
          {badge && (
            <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-white/80 backdrop-blur-md text-slate-700 text-[11px] font-extrabold border border-white/90 shadow-sm tracking-wide uppercase">
              {badgeIcon && <span className="text-sky-600">{badgeIcon}</span>}
              <span>{badge}</span>
            </span>
          )}
        </div>

        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
          {title}
        </h2>

        {subtitle && (
          <p className="text-xs sm:text-sm text-slate-500 font-medium leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>

      {(action || actionLabel) && (
        <div className="shrink-0 flex items-center space-x-2">
          {action}
          {actionLabel && (
            <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200">
              <span className="w-2 h-2 rounded-full bg-sky-500 animate-ping" />
              <span>{actionLabel}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default SectionHeader;

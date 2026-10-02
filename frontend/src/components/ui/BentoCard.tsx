import React from 'react';
import { GlassCard } from './GlassCard';

interface BentoCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  variant?: 'light' | 'soft' | 'solid' | 'dark';
  noPadding?: boolean;
}

export const BentoCard: React.FC<BentoCardProps> = ({
  children,
  title,
  subtitle,
  icon,
  badge,
  action,
  className = '',
  headerClassName = '',
  contentClassName = '',
  variant = 'light',
  noPadding = false,
  ...props
}) => {
  const hasHeader = title || subtitle || icon || badge || action;

  return (
    <GlassCard
      variant={variant}
      rounded="3xl"
      className={`flex flex-col h-full ${className}`}
      {...props}
    >
      {hasHeader && (
        <div
          className={`px-6 pt-5 pb-3 flex items-center justify-between gap-3 border-b border-slate-100/80 ${headerClassName}`}
        >
          <div className="flex items-center space-x-3 min-w-0">
            {icon && (
              <div className="w-9 h-9 rounded-2xl bg-slate-100/90 text-slate-800 flex items-center justify-center shrink-0 shadow-inner border border-slate-200/60">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              {title && (
                <h3 className="text-sm font-black text-slate-900 tracking-tight truncate">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {badge}
            {action}
          </div>
        </div>
      )}

      <div className={`flex-1 flex flex-col ${noPadding ? '' : 'p-6'} ${contentClassName}`}>
        {children}
      </div>
    </GlassCard>
  );
};

export default BentoCard;

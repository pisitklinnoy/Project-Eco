import React from 'react';
import { ArrowUpRight, Loader2 } from 'lucide-react';

interface PillButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'glass' | 'dark' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  hasArrow?: boolean;
  loading?: boolean;
  className?: string;
}

export const PillButton: React.FC<PillButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  hasArrow = false,
  loading = false,
  className = '',
  disabled,
  ...props
}) => {
  const sizeClass =
    size === 'sm'
      ? 'px-3.5 py-1.5 text-xs'
      : size === 'lg'
      ? 'px-6 py-3 text-sm font-extrabold'
      : 'px-4.5 py-2 text-xs font-bold';

  const variantClass =
    variant === 'primary'
      ? 'bg-gradient-to-r from-blue-600 via-sky-600 to-blue-700 text-white shadow-md shadow-blue-500/25 hover:shadow-lg hover:shadow-blue-500/35 hover:brightness-105 border border-white/20'
      : variant === 'secondary'
      ? 'bg-slate-100/90 text-slate-800 hover:bg-slate-200/90 border border-slate-200/80 shadow-sm'
      : variant === 'glass'
      ? 'bg-white/80 backdrop-blur-xl text-slate-900 border border-white/90 shadow-sm hover:bg-white hover:shadow-md'
      : variant === 'dark'
      ? 'bg-slate-900 text-white hover:bg-black border border-white/10 shadow-md'
      : variant === 'outline'
      ? 'bg-transparent border border-slate-300 text-slate-700 hover:bg-slate-100/60'
      : 'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900';

  return (
    <button
      disabled={disabled || loading}
      className={`group inline-flex items-center justify-center space-x-1.5 rounded-full cursor-pointer transition-all duration-200 ease-out active:scale-95 disabled:opacity-50 disabled:pointer-events-none select-none tracking-tight ${sizeClass} ${variantClass} ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
      ) : (
        icon && iconPosition === 'left' && (
          <span className="shrink-0 transition-transform duration-200 group-hover:scale-110">{icon}</span>
        )
      )}
      <span>{children}</span>
      {!loading && icon && iconPosition === 'right' && (
        <span className="shrink-0 transition-transform duration-200 group-hover:scale-110">{icon}</span>
      )}
      {!loading && hasArrow && (
        <ArrowUpRight className="w-3.5 h-3.5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      )}
    </button>
  );
};

export default PillButton;

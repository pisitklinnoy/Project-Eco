import React from 'react';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: 'glass' | 'light' | 'dark' | 'primary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  tooltip?: string;
  className?: string;
  active?: boolean;
}

export const IconButton: React.FC<IconButtonProps> = ({
  children,
  variant = 'glass',
  size = 'md',
  tooltip,
  className = '',
  active = false,
  ...props
}) => {
  const sizeClass =
    size === 'sm'
      ? 'w-8 h-8 text-xs'
      : size === 'lg'
      ? 'w-12 h-12 text-base'
      : 'w-10 h-10 text-sm';

  const variantClass = active
    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30 border border-white/20'
    : variant === 'glass'
    ? 'bg-white/80 backdrop-blur-xl text-slate-700 border border-white/90 shadow-sm hover:bg-white hover:text-blue-600 hover:shadow-md'
    : variant === 'dark'
    ? 'bg-slate-900/85 backdrop-blur-xl text-white border border-white/10 hover:bg-black'
    : variant === 'primary'
    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-500/20'
    : variant === 'light'
    ? 'bg-slate-100/90 text-slate-700 hover:bg-slate-200 border border-slate-200/60'
    : 'bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-900';

  return (
    <button
      title={tooltip}
      className={`group relative inline-flex items-center justify-center rounded-full transition-all duration-200 ease-out active:scale-90 disabled:opacity-40 cursor-pointer select-none ${sizeClass} ${variantClass} ${className}`}
      {...props}
    >
      <span className="transition-transform duration-200 group-hover:scale-110">{children}</span>

      {/* Tooltip on Hover */}
      {tooltip && (
        <span className="pointer-events-none absolute left-full ml-2.5 z-50 hidden whitespace-nowrap rounded-xl bg-slate-900/90 backdrop-blur-md px-2.5 py-1 text-[11px] font-semibold text-white shadow-xl border border-white/10 opacity-0 transition-opacity group-hover:block group-hover:opacity-100">
          {tooltip}
        </span>
      )}
    </button>
  );
};

export default IconButton;

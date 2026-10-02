import React from 'react';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  hoverEffect?: boolean;
  variant?: 'light' | 'soft' | 'solid' | 'dark';
  rounded?: '2xl' | '3xl' | '4xl' | 'full';
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className = '',
  hoverEffect = false,
  variant = 'light',
  rounded = '3xl',
  ...props
}) => {
  const roundedClass =
    rounded === 'full'
      ? 'rounded-full'
      : rounded === '4xl'
      ? 'rounded-[36px]'
      : rounded === '2xl'
      ? 'rounded-2xl'
      : 'rounded-[28px]';

  const variantClass =
    variant === 'dark'
      ? 'bg-slate-900/85 backdrop-blur-2xl border border-white/10 text-white shadow-[0_20px_50px_rgba(0,0,0,0.25)]'
      : variant === 'solid'
      ? 'bg-white border border-slate-200/70 shadow-[0_16px_40px_-12px_rgba(15,23,42,0.06)]'
      : variant === 'soft'
      ? 'bg-white/60 backdrop-blur-xl border border-white/70 shadow-[0_12px_36px_-10px_rgba(15,23,42,0.04)]'
      : 'bg-white/85 backdrop-blur-2xl border border-white/90 shadow-[0_20px_50px_-12px_rgba(15,23,42,0.05)]';

  const hoverClass = hoverEffect
    ? 'transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_24px_60px_-12px_rgba(15,23,42,0.09)]'
    : 'transition-all duration-200';

  return (
    <div
      className={`relative overflow-hidden ${roundedClass} ${variantClass} ${hoverClass} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export default GlassCard;

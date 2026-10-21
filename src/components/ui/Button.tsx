import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 border border-blue-600 disabled:bg-blue-300 disabled:border-blue-300',
  secondary: 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 hover:border-slate-400 disabled:text-slate-400',
  ghost: 'bg-transparent text-slate-700 border border-transparent hover:bg-slate-100 disabled:text-slate-300',
  danger: 'bg-white text-red-700 border border-red-300 hover:bg-red-50 disabled:text-red-300',
  subtle: 'bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 disabled:text-slate-400',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-[13px] gap-1.5',
  md: 'h-10 px-3.5 text-sm gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, block, className = '', children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: 'sm' | 'md';
  active?: boolean;
}

/** Knop met alleen een icoon; `label` wordt zowel aria-label als tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'md', active, className = '', children, type = 'button', ...rest },
  ref,
) {
  const dim = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9';
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${dim} ${
        active ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});

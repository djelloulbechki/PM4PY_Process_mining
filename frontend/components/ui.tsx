import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}) {
  const variants = {
    primary:
      "bg-brand-600 text-white hover:bg-brand-500 shadow-sm shadow-brand-600/20",
    secondary:
      "bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700",
    ghost: "text-slate-300 hover:bg-slate-800 hover:text-white",
    danger: "bg-red-600/90 text-white hover:bg-red-500",
  };
  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-5 py-2.5 text-base",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500",
        className
      )}
      {...props}
    />
  );
}

export function Label({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn("block text-sm font-medium text-slate-300 mb-1.5", className)}
    >
      {children}
    </label>
  );
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm",
        className
      )}
    >
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}) {
  const tones = {
    default: "bg-slate-800 text-slate-300",
    success: "bg-emerald-500/15 text-emerald-400",
    warning: "bg-amber-500/15 text-amber-400",
    danger: "bg-red-500/15 text-red-400",
    info: "bg-brand-500/15 text-brand-400",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone]
      )}
    >
      {children}
    </span>
  );
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

import type { ReactNode } from "react";

type CardProps = {
  className?: string;
  children: ReactNode;
};

export function Card({ className = "", children }: CardProps) {
  return (
    <div
      className={`rounded-3xl border border-slate-200 bg-white/80 ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className = "", children }: CardProps) {
  return <div className={`space-y-1.5 p-6 ${className}`}>{children}</div>;
}

export function CardTitle({ className = "", children }: CardProps) {
  return (
    <h2 className={`font-semibold leading-none tracking-tight ${className}`}>
      {children}
    </h2>
  );
}

export function CardDescription({ className = "", children }: CardProps) {
  return <p className={`text-sm text-slate-600 ${className}`}>{children}</p>;
}

export function CardContent({ className = "", children }: CardProps) {
  return <div className={`px-6 pb-6 ${className}`}>{children}</div>;
}

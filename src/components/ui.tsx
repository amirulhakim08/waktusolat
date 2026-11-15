import type { ComponentProps, ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "danger" | "ghost" | "gold";
const variants: Record<Variant, string> = {
  primary: "bg-brand-700 text-white hover:bg-brand-800 disabled:bg-brand-700/50",
  secondary: "bg-white text-ink ring-1 ring-black/10 hover:bg-black/[.03] disabled:opacity-50",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/50",
  ghost: "text-brand-800 hover:bg-brand-50 disabled:opacity-50",
  gold: "bg-gold-500 text-brand-950 hover:bg-gold-400 disabled:opacity-50",
};

export function buttonClass(variant: Variant = "primary", size: "sm" | "md" = "md") {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 disabled:cursor-not-allowed",
    size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2.5 text-sm",
    variants[variant],
  );
}

export function Button({ variant = "primary", size = "md", className, ...props }: ComponentProps<"button"> & { variant?: Variant; size?: "sm" | "md" }) {
  return <button className={cx(buttonClass(variant, size), className)} {...props} />;
}

export function Card({ className, children, ...props }: ComponentProps<"section">) {
  return (
    <section className={cx("rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5", className)} {...props}>
      {children}
    </section>
  );
}

export function CardTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold text-ink">{children}</h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-black/60">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Field({ label, htmlFor, hint, error, children }: { label: string; htmlFor: string; hint?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-black/55">{hint}</p>}
      {error && <p className="text-xs font-medium text-red-600" role="alert">{error}</p>}
    </div>
  );
}

const inputBase =
  "block w-full rounded-lg border-0 bg-white px-3 py-2.5 text-sm text-ink ring-1 ring-black/15 placeholder:text-black/35 focus:ring-2 focus:ring-brand-600 focus:outline-none disabled:bg-black/5";

export function Input({ className, invalid, ...props }: ComponentProps<"input"> & { invalid?: boolean }) {
  return <input aria-invalid={invalid || undefined} className={cx(inputBase, invalid && "ring-red-500", className)} {...props} />;
}
export function Select({ className, invalid, ...props }: ComponentProps<"select"> & { invalid?: boolean }) {
  return <select aria-invalid={invalid || undefined} className={cx(inputBase, "pr-8", invalid && "ring-red-500", className)} {...props} />;
}
export function Textarea({ className, invalid, ...props }: ComponentProps<"textarea"> & { invalid?: boolean }) {
  return <textarea aria-invalid={invalid || undefined} className={cx(inputBase, invalid && "ring-red-500", className)} {...props} />;
}

const badgeTones = {
  green: "bg-brand-50 text-brand-800 ring-brand-600/20",
  gold: "bg-gold-100 text-gold-600 ring-gold-500/30",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  gray: "bg-black/5 text-black/70 ring-black/10",
  blue: "bg-sky-50 text-sky-800 ring-sky-600/20",
};
export function Badge({ tone = "gray", children }: { tone?: keyof typeof badgeTones; children: ReactNode }) {
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", badgeTones[tone])}>{children}</span>;
}

const alertTones = {
  info: "bg-sky-50 text-sky-900 ring-sky-200",
  success: "bg-brand-50 text-brand-900 ring-brand-200",
  warning: "bg-amber-50 text-amber-900 ring-amber-200",
  error: "bg-red-50 text-red-900 ring-red-200",
};
export function Alert({ tone = "info", title, children }: { tone?: keyof typeof alertTones; title?: string; children?: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("rounded-xl px-4 py-3 text-sm ring-1", alertTones[tone])}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-1" : undefined}>{children}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "gold" | "green" }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <p className="text-xs font-medium uppercase tracking-wide text-black/50">{label}</p>
      <p className={cx("mt-2 text-2xl font-semibold", tone === "gold" ? "text-gold-600" : "text-brand-800")}>{value}</p>
      {hint && <p className="mt-1 text-xs text-black/55">{hint}</p>}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-black/15 bg-white/60 px-6 py-10 text-center">
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="mt-2 text-sm text-black/60">{children}</div>}
    </div>
  );
}

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const tone = pct >= 95 ? "bg-red-600" : pct >= 80 ? "bg-amber-500" : "bg-brand-600";
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/10" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx("h-full rounded-full transition-all", tone)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
      <table className="min-w-full divide-y divide-black/5 text-sm">{children}</table>
    </div>
  );
}
export const th = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-black/55 bg-black/[.02]";
export const td = "px-4 py-3 align-top text-ink";

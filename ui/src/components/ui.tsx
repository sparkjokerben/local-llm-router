import type { ReactNode } from "react";

export function cls(...xs: (string | false | undefined | null)[]) {
  return xs.filter(Boolean).join(" ");
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cls(
        "glass rounded-2xl shadow-xl shadow-black/30 transition-all",
        "hover:border-white/[0.12]",
        className,
      )}
    >
      {children}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  className,
  type = "button",
  title,
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
  title?: string;
  ariaLabel?: string;
}) {
  const styles: Record<ButtonVariant, string> = {
    primary:
      "bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-900/40 hover:shadow-violet-800/50 hover:brightness-110 active:brightness-95",
    secondary:
      "border border-white/10 bg-white/[0.05] text-zinc-300 hover:bg-white/[0.1] hover:text-white active:bg-white/[0.07]",
    ghost: "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100",
    danger:
      "border border-red-500/25 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300",
  };
  return (
    <button
      type={type}
      title={title}
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      className={cls(
        "inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-150",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100",
        styles[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium tracking-wide text-zinc-400">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-zinc-500">{hint}</span> : null}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cls(
        "w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-zinc-100",
        "placeholder:text-zinc-500 transition-all focus:border-violet-400/50 focus:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-violet-500/20",
        props.className,
      )}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cls(
        "w-full appearance-none rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-zinc-100",
        "focus:border-violet-400/50 focus:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-violet-500/20",
        props.className,
      )}
    />
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-fade-up relative w-full max-w-lg rounded-2xl border border-white/10 bg-[#12141d]/95 p-6 shadow-2xl shadow-black/60 backdrop-blur-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-200"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const badgeTones: Record<string, string> = {
  green: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
  amber: "bg-amber-500/10 text-amber-300 border-amber-500/25",
  red: "bg-red-500/10 text-red-300 border-red-500/25",
  slate: "bg-white/5 text-zinc-400 border-white/10",
  violet: "bg-violet-500/10 text-violet-300 border-violet-500/25",
};

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: keyof typeof badgeTones }) {
  return (
    <span
      className={cls(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        badgeTones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  desc,
  action,
}: {
  icon?: ReactNode;
  title: string;
  desc?: string;
  action?: ReactNode;
}) {
  return (
    <div className="animate-fade-up flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-20 text-center">
      {icon ? <div className="mb-4 text-zinc-600">{icon}</div> : null}
      <p className="text-sm font-medium text-zinc-200">{title}</p>
      {desc ? <p className="mt-2 max-w-sm text-xs leading-relaxed text-zinc-500">{desc}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function Spinner() {
  return (
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-violet-400" />
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="animate-fade-up fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div className="rounded-xl border border-white/10 bg-[#171a26]/95 px-4 py-2.5 text-sm text-zinc-100 shadow-2xl backdrop-blur">
        {message}
      </div>
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cls(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        checked ? "bg-violet-500" : "bg-white/10",
      )}
    >
      <span
        className={cls(
          "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
          checked && "translate-x-5",
        )}
      />
    </button>
  );
}

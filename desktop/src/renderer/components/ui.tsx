import { type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes } from "react";

// Primitives in the new dark-mode palette. Default surface: ink (near-black),
// text: paper (cream). Accents are saturated pulls from the monpaco palette
// — cobalt, rose, mustard, vermilion. Buttons split into "primary" (cream
// pill on dark) and "color" (any palette accent) so callers don't reinvent
// hover states. Keep the editorial typography from the light-mode design;
// this is the same family with the lights flipped.

export function Button({
  variant = "primary",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline" | "danger" | "cobalt" | "rose";
}) {
  const base =
    "inline-flex items-center justify-center px-5 py-2.5 text-sm font-medium rounded-pill transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const styles = {
    primary: "bg-paper text-ink hover:bg-paper/90",
    ghost: "text-paper/80 hover:text-paper hover:bg-paper/5",
    outline: "border border-ink-3 text-paper hover:border-paper",
    danger: "text-vermilion hover:bg-vermilion/10",
    cobalt: "bg-cobalt text-paper hover:bg-cobalt/90",
    rose: "bg-rose text-ink hover:bg-rose/90",
  }[variant];
  return <button className={`${base} ${styles} ${className}`} {...rest} />;
}

export function Input({
  className = "",
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full px-3 py-2 text-sm bg-transparent border-b border-ink-3 focus:border-paper focus:outline-none placeholder:text-ash transition-colors text-paper ${className}`}
      {...rest}
    />
  );
}

export function Card({
  children,
  className = "",
  tone = "default",
}: {
  children: ReactNode;
  className?: string;
  tone?: "default" | "raised";
}) {
  const surface = tone === "raised" ? "bg-ink-2" : "bg-ink";
  return (
    <div className={`border border-ink-3 ${surface} rounded-soft p-6 ${className}`}>
      {children}
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <span className="block text-xs font-medium uppercase tracking-tight text-ash mb-1.5">
      {children}
    </span>
  );
}

// Status dots use the saturated brights so a "running" feels celebratory.
export function StatusDot({ status }: { status: string }) {
  const color =
    status === "running"
      ? "bg-cobalt"
      : status === "pending"
        ? "bg-mustard"
        : "bg-vermilion";
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${color}`}
      aria-label={status}
    />
  );
}

export function Hairline({ className = "" }: { className?: string }) {
  return <div className={`h-px bg-ink-3 ${className}`} />;
}

export function Mono({ children, tone = "ash" }: { children: ReactNode; tone?: "ash" | "paper" }) {
  const c = tone === "paper" ? "text-paper" : "text-ash";
  return <code className={`font-mono text-[0.85em] ${c} break-all`}>{children}</code>;
}

// ─── Decorative shape language ──────────────────────────────────────────────
// These are the chunky cut-outs from monpaco's hero. Used sparingly — section
// titles, empty states, the wordmark's flourish. Each is a single SVG so they
// scale crisply at any size.

export function Shapes({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} aria-hidden>
      <svg width="22" height="22" viewBox="0 0 22 22" className="shape">
        <rect x="2" y="2" width="18" height="10" rx="0" fill="#D4A82B" />
      </svg>
      <svg width="22" height="22" viewBox="0 0 22 22" className="shape">
        <path d="M11 2 a9 9 0 0 1 0 18 z" fill="#3D52E2" />
      </svg>
      <svg width="22" height="22" viewBox="0 0 22 22" className="shape">
        <circle cx="11" cy="11" r="9" fill="#F5B9C9" />
      </svg>
      <svg width="22" height="22" viewBox="0 0 22 22" className="shape">
        <path d="M2 11 a9 9 0 0 1 18 0 z" fill="#E33627" />
      </svg>
    </span>
  );
}

// A larger flourish for hero / empty states. Composed of overlapping arcs and
// a wedge in the four palette colors — same vocabulary as the wordmark page.
export function HeroShape({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 220 120"
      width="220"
      height="120"
      className={`shape ${className}`}
      aria-hidden
    >
      <rect x="6" y="14" width="34" height="60" fill="#D4A82B" />
      <path d="M70 90 a40 40 0 0 1 0 -80 z" fill="#3D52E2" />
      <circle cx="130" cy="60" r="44" fill="#F5B9C9" />
      <path d="M180 100 a40 40 0 0 1 0 -80 l0 80 z" fill="#E33627" />
      <circle cx="180" cy="60" r="9" fill="#1A1815" />
    </svg>
  );
}

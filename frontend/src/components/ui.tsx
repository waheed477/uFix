import { useEffect, useState } from "react";
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { cn } from "@/utils/cn";
import type { Category, JobStatus } from "@/lib/types";
import { categoryById, STATUS } from "@/lib/types";

/* ============================================================
   SVG ICONS  (custom, consistent stroke style)
   ============================================================ */

type SvgProps = {
  className?: string;
  children: ReactNode;
  filled?: boolean;
  sw?: number;
  style?: CSSProperties;
};

function Svg({ className, children, filled = false, sw = 1.8, style }: SvgProps) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const icon = (node: ReactNode) =>
  function Icon({ className }: { className?: string }) {
    return <Svg className={className}>{node}</Svg>;
  };

export const HomeIcon = icon(
  <><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></>
);
export const BriefcaseIcon = icon(
  <><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>
);
export const ChatIcon = icon(<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />);
export const UserIcon = icon(
  <><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>
);
export const PhoneIcon = icon(
  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
);
export const ChevronLeftIcon = icon(<path d="m15 18-6-6 6-6" />);
export const ChevronRightIcon = icon(<path d="m9 18 6-6-6-6" />);
export const ChevronDownIcon = icon(<path d="m6 9 6 6 6-6" />);
export const CloseIcon = icon(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>);
export const CheckIcon = icon(<path d="M20 6 9 17l-5-5" />);
export const PlusIcon = icon(<><path d="M12 5v14" /><path d="M5 12h14" /></>);
export const DotsIcon = icon(
  <><circle cx="5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="19" cy="12" r="1.3" fill="currentColor" /></>
);
export const ClockIcon = icon(<><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>);
export const MapPinIcon = icon(
  <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>
);
export const NavigateIcon = icon(<path d="m3 11 19-9-9 19-2-8-8-2z" />);
export const LocateIcon = icon(
  <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>
);
export const SearchIcon = icon(
  <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></>
);
export const WrenchIcon = icon(
  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
);
export const BoltIcon = icon(<path d="M13 2 3 14h8l-1 8 10-12h-8l1-8z" />);
export const CarIcon = icon(
  <><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" /><circle cx="7" cy="17" r="2" /><path d="M9 17h6" /><circle cx="17" cy="17" r="2" /></>
);
export const SendIcon = icon(<><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>);
export const ShieldIcon = icon(
  <><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></>
);
export const UploadIcon = icon(
  <><path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24" /><path d="M12 12v9" /><path d="m16 16-4-4-4 4" /></>
);
export const BellIcon = icon(
  <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>
);
export const LogoutIcon = icon(
  <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>
);
export const GearIcon = icon(
  <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>
);
export const EditIcon = icon(<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />);
export const HistoryIcon = icon(
  <><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></>
);
export const BanknoteIcon = icon(
  <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2" /><path d="M6 12h.01M18 12h.01" /></>
);
export const PowerIcon = icon(<><path d="M12 2v10" /><path d="M18.4 6.6a9 9 0 1 1-12.77.04" /></>);
export const CheckCircleIcon = icon(<><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></>);
export const InfoIcon = icon(<><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>);
export const WalletIcon = icon(
  <><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></>
);

export function StarIcon({
  className,
  filled = false,
  style,
}: {
  className?: string;
  filled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <Svg className={className} style={style} filled={filled}>
      <path d="M12 2l2.9 6.26 6.6 1.04-4.75 4.4 1.15 6.8L12 17.3l-5.9 3.2 1.15-6.8L2.5 9.3l6.6-1.04L12 2z" />
    </Svg>
  );
}

export function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.55-5.17 3.55-8.87z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.29A7.2 7.2 0 0 1 4.9 12c0-.8.14-1.57.37-2.29v-3.1H1.29a12 12 0 0 0 0 10.78l3.98-3.1z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.61l3.98 3.1C6.22 6.86 8.87 4.75 12 4.75z" />
    </svg>
  );
}

/* ============================================================
   LOGO
   ============================================================ */

export function Logo({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn("relative inline-flex items-center justify-center rounded-[28%]", className)}
      style={{ width: size, height: size }}
    >
      <span className="absolute inset-0 rounded-[28%] bg-gradient-to-br from-brand-400 via-brand-600 to-brand-800 shadow-glow" />
      <Svg className="relative text-white" filled>
        <path d="M12 3.5c-3.2 0-5.7 2.5-5.7 5.7 0 3.8 5.7 10.5 5.7 10.5s5.7-6.7 5.7-10.5c0-3.2-2.5-5.7-5.7-5.7Z" />
      </Svg>
      <span
        className="absolute rounded-full bg-accent-400"
        style={{ width: size * 0.3, height: size * 0.3, top: "31%", left: "35%" }}
      />
    </span>
  );
}

export function Wordmark({
  className,
  tone = "dark",
}: {
  className?: string;
  tone?: "dark" | "light";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline font-display font-extrabold leading-none tracking-tight",
        className
      )}
    >
      <span className="bg-gradient-to-br from-brand-300 via-brand-400 to-brand-600 bg-clip-text text-transparent">
        u
      </span>
      <span className={cn("ml-[0.04em]", tone === "light" ? "text-white" : "text-ink-900")}>
        Fix
      </span>
      <span className="ml-[0.1em] inline-block h-[0.2em] w-[0.2em] rounded-full bg-accent-500" />
    </span>
  );
}

/* ============================================================
   CATEGORY ICON
   ============================================================ */

export function CategoryIcon({
  category,
  size = 44,
  className,
  soft = false,
}: {
  category: Category;
  size?: number;
  className?: string;
  soft?: boolean;
}) {
  const meta = categoryById(category);
  const Glyph = category === "plumber" ? WrenchIcon : category === "electrician" ? BoltIcon : CarIcon;
  return (
    <span
      className={cn("inline-flex items-center justify-center rounded-2xl", className)}
      style={{
        width: size,
        height: size,
        background: soft ? meta.soft : `linear-gradient(135deg, ${meta.color}, ${meta.color}dd)`,
        color: soft ? meta.color : "#fff",
      }}
    >
      <Glyph className="h-[52%] w-[52%]" />
    </span>
  );
}

/* ============================================================
   AVATAR
   ============================================================ */

export function Avatar({
  initials,
  color,
  size = 44,
  online,
  className,
  src,
}: {
  initials: string;
  color: string;
  size?: number;
  online?: boolean;
  className?: string;
  /** Optional photo URL. Initials remain the design default and are the fallback when
      src is missing or fails to load (e.g. dev Cloudinary mock URLs). Pre-Deploy Item 2. */
  src?: string;
}) {
  const [imgOk, setImgOk] = useState(true);
  useEffect(() => { setImgOk(true); }, [src]);
  return (
    <span className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      <span
        className="flex h-full w-full items-center justify-center overflow-hidden rounded-full font-display font-semibold text-white"
        style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)`, fontSize: size * 0.34 }}
      >
        {src && imgOk ? (
          <img
            src={src}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setImgOk(false)}
          />
        ) : (
          initials
        )}
      </span>
      {online !== undefined && (
        <span
          className={cn(
            "absolute bottom-0 right-0 rounded-full ring-2 ring-white",
            online ? "bg-emerald-500" : "bg-ink-300"
          )}
          style={{ width: size * 0.28, height: size * 0.28 }}
        />
      )}
    </span>
  );
}

/* ============================================================
   BUTTON
   ============================================================ */

type ButtonVariant = "primary" | "accent" | "dark" | "secondary" | "outline" | "ghost" | "danger";

export function Button({
  variant = "primary",
  size = "md",
  full,
  className,
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  full?: boolean;
  className?: string;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants: Record<ButtonVariant, string> = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-glow",
    accent: "bg-accent-500 text-white hover:bg-accent-600 shadow-[0_10px_30px_-8px_rgba(249,143,7,0.55)]",
    dark: "bg-ink-900 text-white hover:bg-ink-800",
    secondary: "bg-ink-100 text-ink-800 hover:bg-ink-200",
    outline: "border border-ink-200 bg-white text-ink-700 hover:bg-ink-50",
    ghost: "text-brand-700 hover:bg-brand-50",
    danger: "bg-rose-500 text-white hover:bg-rose-600",
  };
  const sizes = {
    sm: "h-9 px-3.5 text-sm rounded-xl gap-1.5",
    md: "h-12 px-5 text-[15px] rounded-2xl gap-2",
    lg: "h-14 px-6 text-base rounded-2xl gap-2",
  };
  return (
    <button
      className={cn(
        "inline-flex select-none items-center justify-center font-semibold transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        full && "w-full",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ============================================================
   STATUS BADGE
   ============================================================ */

export function StatusBadge({ status, className }: { status: JobStatus; className?: string }) {
  const meta = STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        meta.bg,
        meta.color,
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.dot }} />
      {meta.label}
    </span>
  );
}

/* ============================================================
   STAR RATING
   ============================================================ */

export function Stars({ value, size = 16, className }: { value: number; size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <span key={i} className="relative" style={{ width: size, height: size }}>
            <StarIcon className="text-ink-200" style={{ width: size, height: size }} />
            <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <StarIcon className="text-accent-400" filled style={{ width: size, height: size }} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function StarInput({ value, onChange, size = 38 }: { value: number; onChange: (v: number) => void; size?: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          className="transition-transform active:scale-90 hover:scale-110"
          style={{ width: size, height: size }}
          aria-label={`${i} star`}
        >
          <StarIcon
            className={cn("h-full w-full transition-colors", i <= value ? "text-accent-400" : "text-ink-200")}
            filled={i <= value}
          />
        </button>
      ))}
    </div>
  );
}

/* ============================================================
   SKELETON + EMPTY STATE
   ============================================================ */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-xl", className)} />;
}

export function EmptyState({
  icon,
  title,
  subtitle,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-8 py-14 text-center", className)}>
      <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-ink-100 text-ink-400">
        {icon}
      </div>
      <h3 className="font-display text-lg font-semibold text-ink-900">{title}</h3>
      {subtitle && <p className="mt-1.5 max-w-[260px] text-sm leading-relaxed text-ink-500">{subtitle}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/* ============================================================
   HELPERS
   ============================================================ */

export function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function maskPhone(phone: string): string {
  const clean = phone.replace(/[^0-9+]/g, "");
  if (clean.length <= 6) return clean;
  return `${clean.slice(0, 4)} •••• ${clean.slice(-4)}`;
}

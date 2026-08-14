import { useRef, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/utils/cn";
import type { Category } from "@/lib/types";
import { categoryById } from "@/lib/types";
import { BoltIcon, CarIcon, WrenchIcon } from "./ui";

export interface MapMarker {
  x: number;
  y: number;
  kind: "user" | "provider" | "pin";
  category?: Category;
  label?: string;
}

/* Stylised city backdrop — reads like a native map without an API key */
function Backdrop() {
  const minorV = [14, 28, 40, 62, 76, 88];
  const minorH = [16, 34, 46, 68, 82];
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <rect width="100" height="100" fill="#e9e8e0" />

      {/* land parcels */}
      <g fill="#efeee8">
        <rect x="2" y="2" width="26" height="24" rx="2" />
        <rect x="56" y="2" width="30" height="18" rx="2" />
        <rect x="2" y="36" width="24" height="16" rx="2" />
        <rect x="30" y="40" width="14" height="12" rx="2" />
        <rect x="52" y="70" width="32" height="20" rx="2" />
        <rect x="2" y="62" width="26" height="12" rx="2" />
      </g>
      <g fill="#e4e3da">
        <rect x="32" y="2" width="16" height="18" rx="2" />
        <rect x="70" y="24" width="18" height="18" rx="2" />
        <rect x="34" y="60" width="16" height="12" rx="2" />
        <rect x="2" y="86" width="30" height="12" rx="2" />
      </g>

      {/* park */}
      <rect x="66" y="4" width="26" height="14" rx="3" fill="#d4e6c7" />
      <rect x="72" y="34" width="20" height="10" rx="3" fill="#cde3bf" />
      <circle cx="70" cy="11" r="2" fill="#bcd7a6" />
      <circle cx="74" cy="9" r="1.6" fill="#c4d9b2" />
      <circle cx="79" cy="12" r="1.8" fill="#bcd7a6" />

      {/* water */}
      <path d="M0 74 Q 16 71 32 80 L 32 100 L 0 100 Z" fill="#c3dceb" />
      <path d="M0 74 Q 16 71 32 80" stroke="#a9cbdf" strokeWidth="0.5" fill="none" />

      {/* road casings */}
      <rect x="45.5" y="0" width="7" height="100" fill="#dad8cf" />
      <rect x="0" y="54" width="100" height="7" fill="#dad8cf" />
      {minorV.map((x) => (
        <rect key={x} x={x - 0.9} y="0" width="1.8" height="100" fill="#dfddd3" />
      ))}
      {minorH.map((y) => (
        <rect key={y} x="0" y={y - 0.9} width="100" height="1.8" fill="#dfddd3" />
      ))}

      {/* roads */}
      <rect x="47.4" y="0" width="3.2" height="100" fill="#ffffff" />
      <rect x="0" y="55.9" width="100" height="3.2" fill="#ffffff" />
      {minorV.map((x) => (
        <rect key={x} x={x - 0.45} y="0" width="0.9" height="100" fill="#ffffff" />
      ))}
      {minorH.map((y) => (
        <rect key={y} x="0" y={y - 0.45} width="100" height="0.9" fill="#ffffff" />
      ))}

      {/* avenue center line */}
      <rect x="48.9" y="0" width="0.28" height="100" fill="#f4c766" />
      <rect x="0" y="57.35" width="100" height="0.28" fill="#f4c766" />
    </svg>
  );
}

function MapPin({ color, children, size = 34 }: { color: string; children?: ReactNode; size?: number }) {
  return (
    <span className="relative block drop-shadow-[0_3px_5px_rgba(17,22,24,0.35)]" style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" className="h-full w-full">
        <path d="M12 21.5S4.5 14.6 4.5 9.2a7.5 7.5 0 0 1 15 0c0 5.4-7.5 12.3-7.5 12.3Z" fill={color} />
        <circle cx="12" cy="9.2" r="3.1" fill="#fff" />
      </svg>
      {children && (
        <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ top: "38%" }}>
          {children}
        </span>
      )}
    </span>
  );
}

export function UserDot({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex h-4 w-4", className)}>
      <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-brand-500" />
      <span className="relative inline-flex h-full w-full rounded-full border-[3px] border-white bg-brand-500 shadow-md" />
    </span>
  );
}

export function CategoryPin({ category, size = 34 }: { category: Category; size?: number }) {
  const meta = categoryById(category);
  const Glyph = category === "plumber" ? WrenchIcon : category === "electrician" ? BoltIcon : CarIcon;
  return (
    <MapPin color={meta.color} size={size}>
      <Glyph className="h-3.5 w-3.5 text-[#1d2326]" />
    </MapPin>
  );
}

export function MapView({
  className,
  markers = [],
  pin,
  onPinMove,
  children,
}: {
  className?: string;
  markers?: MapMarker[];
  pin?: { x: number; y: number } | null;
  onPinMove?: (x: number, y: number) => void;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef(false);

  const clamp = (v: number) => Math.max(4, Math.min(96, v));

  const handleDown = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const handleMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !ref.current || !onPinMove) return;
    const rect = ref.current.getBoundingClientRect();
    onPinMove(clamp(((e.clientX - rect.left) / rect.width) * 100), clamp(((e.clientY - rect.top) / rect.height) * 100));
  };
  const handleUp = () => {
    drag.current = false;
  };

  return (
    <div ref={ref} className={cn("relative overflow-hidden bg-ink-100", className)}>
      <Backdrop />
      {markers.map((m, i) => {
        if (m.kind === "user") {
          return (
            <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${m.x}%`, top: `${m.y}%`, zIndex: 5 }}>
              <UserDot />
            </div>
          );
        }
        if (m.kind === "provider" && m.category) {
          return (
            <div key={i} className="absolute -translate-x-1/2 -translate-y-full" style={{ left: `${m.x}%`, top: `${m.y}%`, zIndex: 4 }}>
              <CategoryPin category={m.category} />
            </div>
          );
        }
        return null;
      })}

      {pin && (
        <div
          className="absolute z-10 -translate-x-1/2 -translate-y-full cursor-grab touch-none active:cursor-grabbing"
          style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
        >
          <MapPin color="#167a6c" size={42}>
            <span className="h-3.5 w-3.5 rounded-full bg-white" />
          </MapPin>
          <span className="absolute -bottom-2 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-ink-900/30" />
        </div>
      )}

      {children}
    </div>
  );
}

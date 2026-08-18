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

/* Perfect Stylised City Map - 100% Free, No API Key, No Verification, No Charges */
function Backdrop({ cityName }: { cityName?: string }) {
  const minorV = [12, 22, 32, 44, 58, 70, 84, 92];
  const minorH = [14, 26, 38, 50, 64, 78, 88];
  
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <rect width="100" height="100" fill="#f5f3eb" />
      <g fill="#ede9dc" opacity="0.8">
        <rect x="1" y="1" width="28" height="26" rx="2.5" />
        <rect x="34" y="1" width="18" height="20" rx="2" />
        <rect x="58" y="1" width="32" height="16" rx="2" />
        <rect x="1" y="32" width="26" height="18" rx="2" />
        <rect x="32" y="30" width="16" height="14" rx="2" />
        <rect x="54" y="24" width="22" height="20" rx="2.5" />
        <rect x="1" y="56" width="28" height="16" rx="2" />
        <rect x="34" y="50" width="18" height="18" rx="2" />
        <rect x="58" y="50" width="20" height="20" rx="2" />
        <rect x="82" y="50" width="16" height="20" rx="2" />
        <rect x="1" y="78" width="32" height="20" rx="2.5" />
        <rect x="38" y="76" width="20" height="16" rx="2" />
        <rect x="64" y="78" width="34" height="20" rx="2" />
      </g>
      <g fill="#e8e4d6" opacity="0.5">
        <rect x="2" y="2" width="26" height="24" rx="2" />
        <rect x="80" y="4" width="14" height="10" rx="2" />
        <rect x="2" y="88" width="30" height="10" rx="2" />
      </g>
      <g>
        <rect x="68" y="2" width="28" height="16" rx="4" fill="#c8e6c9" />
        <rect x="70" y="28" width="22" height="12" rx="3.5" fill="#aed581" opacity="0.8" />
        <rect x="2" y="34" width="12" height="8" rx="2.5" fill="#c5e1a5" opacity="0.6" />
        <circle cx="74" cy="10" r="2.2" fill="#a5d6a7" />
        <circle cx="81" cy="8" r="1.8" fill="#c8e6c9" />
        <circle cx="78" cy="14" r="2" fill="#aed581" />
      </g>
      <path d="M0 80 Q 18 76 36 84 Q 52 90 72 86 L 72 100 L 0 100 Z" fill="#bbdefb" />
      <path d="M0 80 Q 18 76 36 84 Q 52 90 72 86" stroke="#90caf9" strokeWidth="0.4" fill="none" opacity="0.8" />
      <path d="M85 0 Q 88 20 86 40 Q 84 60 88 80" stroke="#bbdefb" strokeWidth="1.5" fill="none" opacity="0.6" />
      <rect x="46" y="0" width="8" height="100" fill="#d7ccc8" />
      <rect x="0" y="46" width="100" height="8" fill="#d7ccc8" />
      {minorV.map((x) => (<rect key={x} x={x - 1} y="0" width="2" height="100" fill="#efebe9" />))}
      {minorH.map((y) => (<rect key={y} x="0" y={y - 1} width="100" height="2" fill="#efebe9" />))}
      <rect x="47.5" y="0" width="5" height="100" fill="#ffffff" />
      <rect x="0" y="47.5" width="100" height="5" fill="#ffffff" />
      {minorV.map((x) => (<rect key={x} x={x - 0.4} y="0" width="0.8" height="100" fill="#ffffff" />))}
      {minorH.map((y) => (<rect key={y} x="0" y={y - 0.4} width="100" height="0.8" fill="#ffffff" />))}
      <rect x="49.8" y="0" width="0.35" height="100" fill="#ffcc80" opacity="0.9" />
      <rect x="0" y="49.8" width="100" height="0.35" fill="#ffcc80" opacity="0.9" />
      {cityName && (<text x="50" y="92" textAnchor="middle" fontSize="6" fontWeight="bold" fill="#bcaaa4" opacity="0.4" fontFamily="system-ui">{cityName.toUpperCase()}</text>)}
      <g fill="#d7ccc8" opacity="0.3">
        {Array.from({ length: 10 }).map((_, i) => Array.from({ length: 10 }).map((_, j) => (<circle key={`${i}-${j}`} cx={5 + i * 10} cy={5 + j * 10} r="0.3" />)))}
      </g>
    </svg>
  );
}

function MapPin({ color, children, size = 34 }: { color: string; children?: ReactNode; size?: number }) {
  return (
    <span className="relative block drop-shadow-[0_4px_8px_rgba(17,22,24,0.35)]" style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" className="h-full w-full"><path d="M12 21.5S4.5 14.6 4.5 9.2a7.5 7.5 0 0 1 15 0c0 5.4-7.5 12.3-7.5 12.3Z" fill={color} /><circle cx="12" cy="9.2" r="3.1" fill="#fff" /></svg>
      {children && (<span className="pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ top: "38%" }}>{children}</span>)}
    </span>
  );
}

export function UserDot({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex h-5 w-5", className)}>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-60" />
      <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-brand-500" />
      <span className="relative inline-flex h-full w-full rounded-full border-[3px] border-white bg-brand-500 shadow-lg" />
    </span>
  );
}

export function CategoryPin({ category, size = 36 }: { category: Category; size?: number }) {
  const meta = categoryById(category);
  const Glyph = category === "plumber" ? WrenchIcon : category === "electrician" ? BoltIcon : CarIcon;
  return (<MapPin color={meta.color} size={size}><Glyph className="h-4 w-4 text-[#1d2326]" /></MapPin>);
}

export function MapView({ className, markers = [], pin, onPinMove, cityName, children }: { className?: string; markers?: MapMarker[]; pin?: { x: number; y: number } | null; onPinMove?: (x: number, y: number) => void; cityName?: string; children?: ReactNode; }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef(false);
  const clamp = (v: number) => Math.max(4, Math.min(96, v));
  const handleDown = (e: PointerEvent<HTMLDivElement>) => { drag.current = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); };
  const handleMove = (e: PointerEvent<HTMLDivElement>) => { if (!drag.current || !ref.current || !onPinMove) return; const rect = ref.current.getBoundingClientRect(); onPinMove(clamp(((e.clientX - rect.left) / rect.width) * 100), clamp(((e.clientY - rect.top) / rect.height) * 100)); };
  const handleUp = () => { drag.current = false; };
  return (
    <div ref={ref} className={cn("relative overflow-hidden bg-[#f5f3eb]", className)}>
      <Backdrop cityName={cityName} />
      {markers.map((m, i) => {
        if (m.kind === "user") {
          return (<div key={i} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${m.x}%`, top: `${m.y}%`, zIndex: 10 }}><div className="flex flex-col items-center"><UserDot /><span className="mt-1 rounded-full bg-ink-900/80 px-2 py-0.5 text-[9px] font-bold text-white backdrop-blur">YOU</span></div></div>);
        }
        if (m.kind === "provider" && m.category) {
          return (<div key={i} className="absolute -translate-x-1/2 -translate-y-full" style={{ left: `${m.x}%`, top: `${m.y}%`, zIndex: 8 }}><CategoryPin category={m.category} />{m.label && (<span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-full bg-white/90 px-2 py-0.5 text-[9px] font-semibold text-ink-700 shadow-sm">{m.label}</span>)}</div>);
        }
        return null;
      })}
      {pin && (<div className="absolute z-20 -translate-x-1/2 -translate-y-full cursor-grab touch-none active:cursor-grabbing" style={{ left: `${pin.x}%`, top: `${pin.y}%` }} onPointerDown={handleDown} onPointerMove={handleMove} onPointerUp={handleUp}><MapPin color="#167a6c" size={44}><span className="h-3.5 w-3.5 rounded-full bg-white shadow-inner" /></MapPin><span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-ink-900/20 blur-[1px]" /></div>)}
      <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-2"><span className="rounded-full bg-white/90 px-2 py-1 text-[10px] font-medium text-ink-600 shadow-sm backdrop-blur">🆓 Free Map · No API Key · No Charges</span></div>
      {cityName && (<div className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-ink-900/80 px-3 py-1 text-[11px] font-bold text-white backdrop-blur">📍 {cityName}</div>)}
      {children}
    </div>
  );
}

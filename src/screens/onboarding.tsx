import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/utils/cn";
import { useApp } from "@/lib/store";
import { CATEGORIES, type Category, type Role } from "@/lib/types";
import {
  Button,
  CategoryIcon,
  CheckIcon,
  ChevronLeftIcon,
  GoogleIcon,
  Logo,
  ShieldIcon,
  UploadIcon,
  Wordmark,
  WrenchIcon,
  HomeIcon,
} from "@/components/ui";

/* ============================================================
   SPLASH
   ============================================================ */

export function SplashScreen() {
  const { setStage } = useApp();
  useEffect(() => {
    const t = setTimeout(() => setStage("auth"), 2500);
    return () => clearTimeout(t);
  }, [setStage]);

  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden bg-ink-950">
      <div className="pointer-events-none absolute -left-20 -top-24 h-72 w-72 rounded-full bg-brand-600/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-accent-500/15 blur-3xl" />

      <div className="animate-scale-in relative">
        <Logo size={92} />
        <span className="absolute -right-2 -top-2 flex h-6 w-6 animate-float items-center justify-center rounded-full bg-accent-500 text-xs font-bold text-white shadow-lg">
          ✦
        </span>
      </div>

      <div className="animate-fade-in mt-7" style={{ animationDelay: "120ms" }}>
        <Wordmark tone="light" className="text-[42px]" />
      </div>
      <p className="animate-fade-in mt-2.5 text-[15px] font-medium text-ink-300" style={{ animationDelay: "240ms" }}>
        Real help, nearby — on demand
      </p>

      <div className="animate-fade-in mt-5 flex items-center gap-3 text-white/35" style={{ animationDelay: "340ms" }}>
        <span className="h-px w-8 bg-white/15" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.3em]">On-demand services</span>
        <span className="h-px w-8 bg-white/15" />
      </div>

      <div className="animate-fade-in absolute bottom-14 flex items-center gap-1.5" style={{ animationDelay: "500ms" }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 animate-bounce rounded-full bg-brand-400"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   AUTH
   ============================================================ */

type AuthStep = "welcome" | "otp" | "details";

const ROLES: { id: Role; title: string; desc: string; Icon: typeof HomeIcon }[] = [
  { id: "customer", title: "I need a service", desc: "Book nearby plumbers, electricians & mechanics", Icon: HomeIcon },
  { id: "provider", title: "I provide services", desc: "Accept requests, send offers & earn money", Icon: WrenchIcon },
];

function OtpBoxes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => {
    refs.current[0]?.focus();
  }, []);
  const set = (i: number, raw: string) => {
    const digit = raw.replace(/\D/g, "").slice(-1);
    const next = value.split("");
    next[i] = digit;
    onChange(next.join("").slice(0, 6));
    if (digit && i < 5) refs.current[i + 1]?.focus();
  };
  const keyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !value[i] && i > 0) refs.current[i - 1]?.focus();
  };
  return (
    <div className="flex justify-between gap-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          inputMode="numeric"
          maxLength={1}
          value={value[i] ?? ""}
          onChange={(e) => set(i, e.target.value)}
          onKeyDown={(e) => keyDown(i, e)}
          className={cn(
            "h-14 w-full rounded-2xl border-2 bg-white text-center font-display text-xl font-bold text-ink-900 outline-none transition-all",
            value[i] ? "border-brand-500" : "border-ink-200 focus:border-brand-400"
          )}
        />
      ))}
    </div>
  );
}

export function AuthScreen() {
  const { completeAuth } = useApp();
  const [step, setStep] = useState<AuthStep>("welcome");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [role, setRole] = useState<Role | null>(null);
  const [busy, setBusy] = useState(false);

  const phoneValid = phone.replace(/\D/g, "").length >= 10;

  const google = () => {
    setBusy(true);
    setTimeout(() => {
      setPhone("+92 321 5432 100");
      setBusy(false);
      setStep("details");
    }, 900);
  };

  const verify = () => {
    if (otp.length < 6) return;
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      setStep("details");
    }, 1000);
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white px-6 pb-8 pt-14">
        <div className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-brand-100/70 blur-2xl" />
        <div className="relative mx-auto flex flex-col items-center text-center">
          <div className="flex items-center gap-2.5">
            <Logo size={46} />
            <Wordmark tone="dark" className="text-[30px]" />
          </div>
          <div className="mt-4 font-display text-2xl font-bold text-ink-900">
            {step === "welcome" ? "Welcome to uFix" : step === "otp" ? "Enter the code" : "Tell us about you"}
          </div>
          <p className="mt-1.5 max-w-[260px] text-sm text-ink-500">
            {step === "welcome" && "Get expert help at your price — in minutes."}
            {step === "otp" && `We sent a 6-digit code to ${phone}`}
            {step === "details" && "Pick your role to personalise your experience."}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-8">
        {step === "welcome" && (
          <div className="animate-slide-up space-y-4">
            <Button full size="lg" variant="outline" onClick={google} disabled={busy}>
              {busy ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-ink-300 border-t-brand-600" />
              ) : (
                <GoogleIcon className="h-5 w-5" />
              )}
              Sign in with Google
            </Button>

            <div className="flex items-center gap-3 py-1">
              <span className="h-px flex-1 bg-ink-100" />
              <span className="text-xs font-medium text-ink-400">or continue with phone</span>
              <span className="h-px flex-1 bg-ink-100" />
            </div>

            <label className="block text-sm font-semibold text-ink-700">Phone number</label>
            <div className="flex gap-2">
              <div className="flex h-14 shrink-0 items-center gap-1.5 rounded-2xl border-2 border-ink-200 bg-white px-3 text-sm font-semibold text-ink-700">
                <span className="text-base">🇵🇰</span> +92
              </div>
              <input
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="98765 43210"
                className="h-14 w-full rounded-2xl border-2 border-ink-200 bg-white px-4 text-[15px] font-medium text-ink-900 outline-none transition-all placeholder:text-ink-300 focus:border-brand-500"
              />
            </div>

            <Button full size="lg" onClick={() => setStep("otp")} disabled={!phoneValid}>
              Continue
            </Button>

            <p className="pt-2 text-center text-xs leading-relaxed text-ink-400">
              By continuing you agree to our Terms of Service & Privacy Policy.
            </p>
          </div>
        )}

        {step === "otp" && (
          <div className="animate-slide-up space-y-5">
            <OtpBoxes value={otp} onChange={setOtp} />
            <Button full size="lg" onClick={verify} disabled={otp.length < 6 || busy}>
              {busy ? (
                <span className="flex items-center gap-2">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Verifying…
                </span>
              ) : (
                "Verify & continue"
              )}
            </Button>
            <button className="w-full text-center text-sm font-medium text-brand-700">
              Didn't get it? <span className="underline">Resend code</span>
            </button>
          </div>
        )}

        {step === "details" && (
          <div className="animate-slide-up space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-ink-700">Your name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ali Hassan"
                className="h-14 w-full rounded-2xl border-2 border-ink-200 bg-white px-4 text-[15px] font-medium text-ink-900 outline-none transition-all placeholder:text-ink-300 focus:border-brand-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-ink-700">Your city / region</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Faisalabad"
                className="h-14 w-full rounded-2xl border-2 border-ink-200 bg-white px-4 text-[15px] font-medium text-ink-900 outline-none transition-all placeholder:text-ink-300 focus:border-brand-500"
              />
              <p className="mt-1 text-[11px] text-ink-400">
                For account reference only — your live location is detected automatically.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-ink-700">I am here to…</label>
              <div className="space-y-3">
                {ROLES.map(({ id, title, desc, Icon }) => (
                  <button
                    key={id}
                    onClick={() => setRole(id)}
                    className={cn(
                      "flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left transition-all active:scale-[0.99]",
                      role === id ? "border-brand-500 bg-brand-50" : "border-ink-200 bg-white hover:border-ink-300"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-xl",
                        role === id ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-500"
                      )}
                    >
                      <Icon className="h-6 w-6" />
                    </span>
                    <span className="flex-1">
                      <span className="block font-display text-[15px] font-semibold text-ink-900">{title}</span>
                      <span className="block text-xs text-ink-500">{desc}</span>
                    </span>
                    <span
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all",
                        role === id ? "border-brand-600 bg-brand-600 text-white" : "border-ink-300"
                      )}
                    >
                      {role === id && <CheckIcon className="h-4 w-4" />}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <Button full size="lg" disabled={!name.trim() || !role} onClick={() => completeAuth(role!, name.trim(), phone, city.trim())}>
              {role === "provider" ? "Continue to profile setup" : "Start exploring"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   PROVIDER SETUP
   ============================================================ */

export function ProviderSetupScreen() {
  const { completeProviderSetup } = useApp();
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState<Category | null>(null);
  const [radius, setRadius] = useState(8);
  const [experience, setExperience] = useState("4–7");
  const [doc, setDoc] = useState(false);

  const steps = ["Category", "Coverage", "Verification"];

  const next = () => {
    if (step === 0 && !category) return;
    setStep((s) => Math.min(2, s + 1));
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-ink-100 px-5 py-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {step > 0 && (
              <button onClick={() => setStep((s) => s - 1)} className="tap-highlight-none -ml-1 rounded-xl p-1.5 text-ink-500 hover:bg-ink-100">
                <ChevronLeftIcon className="h-5 w-5" />
              </button>
            )}
            <div>
              <h1 className="font-display text-lg font-bold text-ink-900">Set up your profile</h1>
              <p className="text-xs text-ink-500">Step {step + 1} of 3 · {steps[step]}</p>
            </div>
          </div>
          <Logo size={34} />
        </div>
        <div className="flex gap-1.5">
          {steps.map((_, i) => (
            <span key={i} className={cn("h-1 flex-1 rounded-full transition-all", i <= step ? "bg-brand-600" : "bg-ink-100")} />
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        {step === 0 && (
          <div className="animate-slide-up space-y-5">
            <div>
              <h2 className="font-display text-xl font-bold text-ink-900">What service do you offer?</h2>
              <p className="mt-1 text-sm text-ink-500">This determines the requests you'll receive.</p>
            </div>
            <div className="space-y-3">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  className={cn(
                    "flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left transition-all active:scale-[0.99]",
                    category === c.id ? "border-brand-500 bg-brand-50" : "border-ink-200 hover:border-ink-300"
                  )}
                >
                  <CategoryIcon category={c.id} size={52} />
                  <span className="flex-1">
                    <span className="block font-display text-base font-semibold text-ink-900">{c.label}</span>
                    <span className="block text-xs text-ink-500">{c.tagline}</span>
                  </span>
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all",
                      category === c.id ? "border-brand-600 bg-brand-600 text-white" : "border-ink-300"
                    )}
                  >
                    {category === c.id && <CheckIcon className="h-4 w-4" />}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="animate-slide-up space-y-6">
            <div>
              <h2 className="font-display text-xl font-bold text-ink-900">Service radius</h2>
              <p className="mt-1 text-sm text-ink-500">How far are you willing to travel for a job?</p>
            </div>

            <div className="rounded-2xl border border-ink-100 bg-ink-50 p-5">
              <div className="mb-2 flex items-end justify-between">
                <span className="text-sm font-medium text-ink-500">Coverage area</span>
                <span className="font-display text-3xl font-bold text-brand-600">{radius} km</span>
              </div>
              <input
                type="range"
                min={2}
                max={25}
                value={radius}
                onChange={(e) => setRadius(+e.target.value)}
                className="w-full accent-brand-600"
              />
              <div className="mt-1 flex justify-between text-[11px] font-medium text-ink-400">
                <span>2 km</span>
                <span>25 km</span>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink-700">Years of experience</h3>
              <div className="flex gap-2">
                {["1–3", "4–7", "8+"].map((e) => (
                  <button
                    key={e}
                    onClick={() => setExperience(e)}
                    className={cn(
                      "flex-1 rounded-xl border-2 py-3 text-sm font-semibold transition-all",
                      experience === e ? "border-brand-500 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-500"
                    )}
                  >
                    {e} yrs
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-slide-up space-y-6">
            <div>
              <h2 className="font-display text-xl font-bold text-ink-900">Verify your identity</h2>
              <p className="mt-1 text-sm text-ink-500">Upload a government ID or licence to build trust with customers.</p>
            </div>

            <button
              onClick={() => setDoc(true)}
              className={cn(
                "flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-all",
                doc ? "border-brand-400 bg-brand-50" : "border-ink-300 bg-ink-50 hover:border-brand-400"
              )}
            >
              <span
                className={cn(
                  "flex h-14 w-14 items-center justify-center rounded-2xl",
                  doc ? "bg-brand-600 text-white" : "bg-white text-ink-400 shadow-sm"
                )}
              >
                {doc ? <CheckIcon className="h-7 w-7" /> : <UploadIcon className="h-7 w-7" />}
              </span>
              <span className="font-semibold text-ink-800">{doc ? "document_uploaded.jpg" : "Tap to upload document"}</span>
              <span className="max-w-[240px] text-xs text-ink-400">
                {doc ? "Verified! Your profile will show a badge." : "JPG, PNG or PDF · max 5MB"}
              </span>
            </button>

            <div className="flex items-start gap-3 rounded-2xl bg-accent-50 p-4">
              <ShieldIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent-600" />
              <p className="text-xs leading-relaxed text-ink-600">
                Your details are encrypted and shared with customers only after they accept your offer.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-ink-100 p-5">
        {step < 2 ? (
          <Button full size="lg" onClick={next} disabled={step === 0 && !category}>
            Continue
          </Button>
        ) : (
          <Button full size="lg" onClick={() => completeProviderSetup(category!, radius)}>
            Go live & start earning
          </Button>
        )}
      </div>
    </div>
  );
}

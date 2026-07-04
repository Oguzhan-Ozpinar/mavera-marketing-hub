// Paylaşılan Tailwind sınıfları — tüm uygulamada tutarlı, net state'li.

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white " +
  "disabled:opacity-50 disabled:pointer-events-none active:scale-[.98] px-4 py-2";

const VARIANTS: Record<string, string> = {
  primary: "bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 active:bg-indigo-800 focus-visible:ring-indigo-500",
  secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 focus-visible:ring-slate-400",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800 focus-visible:ring-red-500",
  warning: "bg-amber-500 text-white shadow-sm hover:bg-amber-600 active:bg-amber-700 focus-visible:ring-amber-500",
  ghost: "text-slate-600 hover:bg-slate-100 active:bg-slate-200 focus-visible:ring-slate-300",
};

export function btn(variant: keyof typeof VARIANTS = "primary", extra = ""): string {
  return `${BTN_BASE} ${VARIANTS[variant]} ${extra}`.trim();
}

export const input =
  "w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder-slate-400 " +
  "hover:border-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 outline-none transition";

export const label = "block text-sm font-medium text-slate-700 mb-1";
export const card = "bg-white rounded-xl border border-slate-200 shadow-sm";
export const hint = "text-xs text-slate-500";

// Sayfa başlığı satırı (başlık + sağda aksiyon) — mobilde alt alta
export const pageHead = "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5";

export function badge(cls: string): string {
  return `inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}`;
}

/**
 * Colour maths for the theme: reading colours, mixing them, and measuring contrast the way WCAG does.
 * Pure functions with no React, so the contrast tests can check every token.
 */

export type Rgba = { r: number; g: number; b: number; a: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Reads `#RGB`, `#RRGGBB`, `#RRGGBBAA`, `rgb(...)` and `rgba(...)`. Anything else is black. */
export function parseColor(color: string): Rgba {
  const c = color.trim();
  if (c === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (c.startsWith('#')) {
    let h = c.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map((x) => x + x).join('');
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  const m = /^rgba?\(([^)]+)\)$/i.exec(c);
  if (m) {
    const [r, g, b, a] = m[1].split(',').map((x) => parseFloat(x));
    return { r, g, b, a: Number.isFinite(a) ? a : 1 };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

const hex2 = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');

/** `#RRGGBB`, or `rgba(...)` when it isn't opaque. */
export function formatColor({ r, g, b, a }: Rgba): string {
  if (a >= 1) return `#${hex2(r)}${hex2(g)}${hex2(b)}`.toUpperCase();
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Math.round(a * 1000) / 1000})`;
}

/** The colour at `alpha` opacity: `withAlpha('#17121F', 0.5)`. */
export function withAlpha(color: string, alpha: number): string {
  return formatColor({ ...parseColor(color), a: clamp(alpha, 0, 1) });
}

/** A see-through colour laid over an opaque one, as the eye sees it. */
export function over(fg: string, bg: string): string {
  const f = parseColor(fg);
  const b = parseColor(bg);
  const a = f.a;
  return formatColor({ r: f.r * a + b.r * (1 - a), g: f.g * a + b.g * (1 - a), b: f.b * a + b.b * (1 - a), a: 1 });
}

/** `t` of the way from `a` to `b`, both opaque: `mix(table, text, 0.1)`. */
export function mix(a: string, b: string, t: number): string {
  const x = parseColor(a);
  const y = parseColor(b);
  const k = clamp(t, 0, 1);
  return formatColor({ r: x.r + (y.r - x.r) * k, g: x.g + (y.g - x.g) * k, b: x.b + (y.b - x.b) * k, a: 1 });
}

/** Relative luminance, 0 for black to 1 for white. */
export function luminance(color: string): number {
  const { r, g, b } = parseColor(color);
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * The WCAG contrast ratio of text `fg` on background `bg`, from 1 to 21. A see-through `fg` is first
 * laid over `bg`. `bg` should be opaque.
 */
export function contrast(fg: string, bg: string): number {
  const solidBg = over(bg, '#FFFFFF');
  const solidFg = over(fg, solidBg);
  const a = luminance(solidFg);
  const b = luminance(solidBg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** The faintest opacity of `fg` on `bg` that still reaches `ratio`, between `min` and 1. */
export function faintestAlpha(fg: string, bg: string, ratio: number, min = 0.3): number {
  if (contrast(fg, bg) < ratio) return 1;
  let lo = min;
  let hi = 1;
  if (contrast(withAlpha(fg, lo), bg) >= ratio) return lo;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (contrast(withAlpha(fg, mid), bg) >= ratio) hi = mid;
    else lo = mid;
  }
  // Rounded up to the next hundredth so the ratio still holds once written out.
  return Math.ceil(hi * 100) / 100;
}

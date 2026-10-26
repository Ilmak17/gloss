import type { ModelKey } from "./models";

/** Highlighter colours. */
export type Marker = "yellow" | "green" | "blue" | "pink";
export const MARKERS: { key: Marker; label: string; color: string }[] = [
  { key: "yellow", label: "Yellow", color: "#f2c438" },
  { key: "green", label: "Green", color: "#7cc66f" },
  { key: "blue", label: "Blue", color: "#6aa8f0" },
  { key: "pink", label: "Pink", color: "#f084ac" },
];

/** Reading faces. Literata is the bundled default for long-form reading. */
export const FACES: { key: Settings["face"]; label: string; css: string }[] = [
  { key: "serif", label: "Newsreader", css: "var(--font-serif)" },
  { key: "book", label: "Literata", css: "var(--font-book)" },
  { key: "sans", label: "Sans", css: "var(--font-sans)" },
  { key: "legible", label: "Atkinson", css: "var(--font-legible)" },
];

/** Everything a reader can tune. Applied to <html> as data attributes and CSS variables. */
export type Settings = {
  theme: "auto" | "paper" | "sepia" | "snow" | "night" | "ink";
  pen: "vermilion" | "cobalt" | "moss" | "graphite";
  face: "serif" | "book" | "sans" | "legible";
  size: number;
  leading: "tight" | "normal" | "loose";
  width: "narrow" | "normal" | "wide";
  align: "left" | "justify";
  paras: "spaced" | "indented";
  bookDensity: "comfort" | "compact";
  marker: Marker;
  length: "short" | "normal" | "long";
  model: ModelKey;
  /**
   * Let answers look things up on the web: the model gets a search tool and decides when to use it.
   * On by default. (It replaced "web", an opt-in toggle, so older saved settings start on.)
   */
  search: boolean;
  numbers: boolean;
  rail: boolean;
  /** Read aloud. Off by default: when on, a listen button joins the reader's top bar. */
  listen: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  theme: "auto",
  pen: "vermilion",
  face: "book",
  size: 20,
  leading: "normal",
  width: "normal",
  align: "left",
  paras: "spaced",
  bookDensity: "comfort",
  marker: "yellow",
  length: "normal",
  model: "flash",
  search: true,
  numbers: false,
  rail: true,
  listen: true,
};

/** Only reading typography changes; voice, theme, typeface and column width stay personal. */
export const READING_PRESETS = {
  comfort: { bookDensity: "comfort", size: 21, leading: "normal", align: "left", paras: "spaced" },
  compact: { bookDensity: "compact", size: 20, leading: "tight", align: "left", paras: "spaced" },
} as const satisfies Record<Settings["bookDensity"], Partial<Settings>>;

export function readingPreset(settings: Settings): Settings["bookDensity"] | "custom" {
  for (const mode of ["comfort", "compact"] as const) {
    const preset = READING_PRESETS[mode];
    if ((Object.keys(preset) as (keyof typeof preset)[]).every(key => settings[key] === preset[key])) return mode;
  }
  return "custom";
}

/** Swatch colours for the settings panel. The real palettes live in globals.css. */
export const THEMES: { key: Settings["theme"]; label: string; bg: string; fg: string; dark: boolean }[] = [
  { key: "auto", label: "Auto", bg: "#f6f3ec", fg: "#1d1b18", dark: false },
  { key: "paper", label: "Paper", bg: "#f6f3ec", fg: "#1d1b18", dark: false },
  { key: "sepia", label: "Sepia", bg: "#f1e6cf", fg: "#33281b", dark: false },
  { key: "snow", label: "Snow", bg: "#ffffff", fg: "#141518", dark: false },
  { key: "night", label: "Night", bg: "#151412", fg: "#e9e3d6", dark: true },
  { key: "ink", label: "Ink", bg: "#0f1319", fg: "#e3e8f0", dark: true },
];

export const PENS: { key: Settings["pen"]; label: string; light: string; dark: string }[] = [
  { key: "vermilion", label: "Vermilion", light: "#c1401b", dark: "#ef7a50" },
  { key: "cobalt", label: "Cobalt", light: "#2c58c9", dark: "#86a8ff" },
  { key: "moss", label: "Moss", light: "#3b7a3d", dark: "#8fc68c" },
  { key: "graphite", label: "Graphite", light: "#4b4a47", dark: "#cfc9bd" },
];

export const LEADING: Record<Settings["leading"], number> = { tight: 1.5, normal: 1.64, loose: 1.82 };
export const MEASURE: Record<Settings["width"], number> = { narrow: 28, normal: 32, wide: 37 };
export const LENGTH_WORDS: Record<Settings["length"], number> = { short: 50, normal: 90, long: 180 };

export const SETTINGS_KEY = "gloss:settings";

export function resolveTheme(theme: Settings["theme"]): Exclude<Settings["theme"], "auto"> {
  if (theme !== "auto") return theme;
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "paper";
}

export function applySettings(s: Settings) {
  const el = document.documentElement;
  el.dataset.theme = resolveTheme(s.theme);
  el.dataset.pen = s.pen;
  el.dataset.face = s.face;
  el.dataset.align = s.align;
  el.dataset.paras = s.paras;
  el.dataset.bookDensity = s.bookDensity ?? "comfort";
  el.style.setProperty("--read-size", `${s.size}px`);
  el.style.setProperty("--leading", String(LEADING[s.leading]));
  el.style.setProperty("--measure-k", String(MEASURE[s.width]));
}

/**
 * The same thing as applySettings, as an inline script for <head>, so the
 * first paint already has the reader's theme, pen and type. Kept in sync by hand.
 */
export const BOOT_SCRIPT = `try{var s=JSON.parse(localStorage.getItem("${SETTINGS_KEY}")||"{}"),e=document.documentElement,t=s.theme||"auto";if(t==="auto")t=matchMedia("(prefers-color-scheme: dark)").matches?"night":"paper";e.dataset.theme=t;e.dataset.pen=s.pen||"vermilion";e.dataset.face=s.face||"book";e.dataset.align=s.align||"left";e.dataset.paras=s.paras||"spaced";e.dataset.bookDensity=s.bookDensity||"comfort";if(s.size)e.style.setProperty("--read-size",s.size+"px");var L={tight:1.5,normal:1.64,loose:1.82},M={narrow:28,normal:32,wide:37};if(s.leading)e.style.setProperty("--leading",L[s.leading]);if(s.width)e.style.setProperty("--measure-k",M[s.width])}catch(x){}`;

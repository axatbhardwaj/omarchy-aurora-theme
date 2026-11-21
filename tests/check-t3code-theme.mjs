#!/usr/bin/env node
// Checks Aurora’s T3 v1 roles and contrast on their opaque fallback surfaces.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const path = fileURLToPath(new URL("../t3code.json", import.meta.url));
const theme = JSON.parse(readFileSync(process.argv[2] ?? path, "utf8"));
const c = theme.colors;
const failures = [];

const hex = /^#[0-9a-f]{6}$/i;
if (theme.version !== 1) failures.push("version must be 1");
if (theme.name !== "Aurora" || theme.id !== "aurora") failures.push("expected Aurora (aurora)");
if (Object.keys(c).length !== 61) failures.push("expected all 61 T3 v1 color roles");
if (!theme.css?.includes("var(--theme-background-image,")) failures.push("missing published wallpaper hook");

// T3 v0.1.11 paints .surface-glass (the composer context strip under the
// prompt, glass buttons, chart tooltips) with 80% of --background, which is the
// opaque canvas seed. Aurora must let the wallpaper continue through that strip.
const declarations = (selector) =>
  [...(theme.css ?? "").replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => selectors.split(",").some((s) => s.trim() === selector))
    .map(([, , body]) => body)
    .join(";");
const strip = declarations('[data-slot="composer-context-strip"]');
if (!/background:\s*transparent\s*!important/.test(strip)) failures.push("composer context strip must be transparent");
if (!/backdrop-filter:\s*none\s*!important/.test(strip)) failures.push("composer context strip must not re-blur the pane");
const glass = declarations('html[data-theme-id] .surface-glass');
if (!/background:\s*rgb\(10 16 13 \/ \d+%\)/.test(glass)) failures.push("surface glass must use lake ink, not the opaque canvas");
// The turn diff card ("N changed files / Open diff") header carries T3's
// dark:bg-background, an opaque canvas fill inside the translucent card.
const ink = /background:\s*rgb\(10 16 13 \/ (\d+)%\)\s*!important/;
for (const selector of ["[data-changed-files-state]", "[data-changed-files-state] > [data-changed-files-header]"]) {
  const alpha = Number(declarations(selector).match(ink)?.[1]);
  if (!(alpha > 0 && alpha < 60)) failures.push(`${selector} must use translucent lake ink !important`);
}
if (!/backdrop-filter:\s*blur\(/.test(declarations("[data-changed-files-state] > [data-changed-files-header]"))) {
  failures.push("sticky changed-files header must blur rows scrolling beneath it");
}
for (const [role, expected] of Object.entries({
  accent: "#85d9ac",
  focus: "#85d9ac",
  text: "#edf7ef",
  textMuted: "#b0c8bc",
})) {
  if (c[role]?.toLowerCase() !== expected) failures.push(`${role} must match ${expected}`);
}
if (theme.canvas?.toLowerCase() !== "#0e1613" || theme.accent !== c.accent) {
  failures.push("wrong glass or accent seed");
}

if (theme.appearance !== "dark") failures.push("appearance must be dark");
for (const key of ["canvas", "accent"]) {
  if (!hex.test(theme[key] ?? "")) failures.push(`${key} seed must be #rrggbb`);
}
for (const [role, value] of Object.entries(c)) {
  if (!hex.test(value)) failures.push(`${role} must be #rrggbb, got ${value}`);
}

const luminance = (value) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(value.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// [foreground, background, minimum ratio]
const pairs = [
  ["text", "canvas", 4.5],
  ["text", "chrome", 4.5],
  ["border", "canvas", 3],
  ["toolbarBorder", "toolbar", 3],
  ["sidebarBorder", "sidebar", 3],
  ["textMuted", "canvas", 4.5],
  ["toolbarForeground", "toolbar", 4.5],
  ["toolbarControlForeground", "toolbarControl", 4.5],
  ["toolbarControlForeground", "toolbarControlHover", 4.5],
  ["text", "surface", 4.5],
  ["text", "surfaceRaised", 4.5],
  ["text", "surfaceOverlay", 4.5],
  ["accentForeground", "accent", 4.5],
  ["accentSurfaceForeground", "accentSurface", 4.5],
  ["secondaryForeground", "secondary", 4.5],
  ["mutedForeground", "muted", 4.5],
  ["placeholder", "input", 4.5],
  ["secondaryLabel", "canvas", 4.5],
  ["iconMuted", "canvas", 3],
  ["errorForeground", "errorSurface", 4.5],
  ["warning", "canvas", 4.5],
  ["warningForeground", "warningSurface", 4.5],
  ["update", "canvas", 4.5],
  ["updateForeground", "updateSurface", 4.5],
  ["messageForeground", "messageSurface", 4.5],
  ["messageActionForeground", "messageAction", 4.5],
  ["messageActionForeground", "messageActionHover", 4.5],
  ["codeForeground", "codeBackground", 4.5],
  ["sidebarForeground", "sidebar", 4.5],
  ["sidebarMutedForeground", "sidebar", 4.5],
  ["sidebarForeground", "sidebarRowHover", 4.5],
  ["sidebarForeground", "sidebarRowActive", 4.5],
  ["sidebarForeground", "sidebarRowSelected", 4.5],
  ["sidebarForeground", "sidebarControlSurface", 4.5],
  ["terminalForeground", "terminalBackground", 4.5],
  ["terminalForeground", "terminalSelection", 4.5],
  ["terminalCursor", "terminalBackground", 3],
  ["terminalScrollbar", "terminalBackground", 3],
  ["terminalScrollbarHover", "terminalBackground", 3],
  ["focus", "canvas", 3],
  ["textMuted", "messageSurface", 4.5],
  ["sidebarMutedForeground", "sidebarRowSelected", 4.5],
  ["searchMatchForeground", "searchMatchBackground", 4.5],
  ["searchMatchActiveForeground", "searchMatchActiveBackground", 4.5],
  ["searchMatchActiveBackground", "searchMatchBackground", 3],
  // T3 draws white glyphs on bg-destructive (stop button) and also uses the
  // same role as text-destructive, so it must work in both directions.
  ["white", "error", 3],
  ["error", "canvas", 4.5],
  ["error", "errorSurface", 4.5],
];

c.white = "#ffffff"; // T3 hard-codes text-white on some role fills

for (const [fg, bg, min] of pairs) {
  if (!c[fg] || !c[bg]) {
    failures.push(`missing role ${c[fg] ? bg : fg}`);
    continue;
  }
  const r = ratio(c[fg], c[bg]);
  if (r < min) failures.push(`${fg} on ${bg}: ${r.toFixed(2)} < ${min}`);
}

if (failures.length > 0) {
  console.error(`t3code.json: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`t3code.json: ok (${pairs.length} contrast pairs)`);

#!/usr/bin/env node
// Validates t3code.json: shape T3 Code accepts, and WCAG contrast for every
// foreground/background pair the app actually draws together.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const path = fileURLToPath(new URL("../t3code.json", import.meta.url));
const theme = JSON.parse(readFileSync(path, "utf8"));
const c = theme.colors;
const failures = [];

const hex = /^#[0-9a-f]{6}$/i;
if (theme.version !== 1) failures.push("version must be 1");
if (!theme.name || theme.name.length > 48) failures.push("name must be 1-48 chars");
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
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
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
  ["placeholder", "input", 3],
  ["secondaryLabel", "canvas", 4.5],
  ["iconMuted", "canvas", 3],
  ["errorForeground", "errorSurface", 4.5],
  ["warningForeground", "warningSurface", 4.5],
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
  ["focus", "canvas", 3],
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

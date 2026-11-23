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
// A new thread has no timeline rows, so T3 v0.1.11 fills the conversation pane
// with an opaque bg-background [data-timeline-loading] placeholder. That covers
// the pane's lake, crest and blur with solid canvas green-black.
const placeholder = declarations('[data-workspace-area="conversation"] [data-timeline-loading]');
if (!/background:\s*transparent\s*!important/.test(placeholder)) {
  failures.push("empty-timeline placeholder must be transparent so the conversation lake shows");
}
// User message bubbles sit on the lake as translucent black. A light layer
// (e.g. rgb(237 247 239 / 8%)) washed them out to grey-white on io.
const bubble = declarations("[data-user-message-bubble]");
const bubbleAlpha = Number(bubble.match(/background:\s*rgb\(0 0 0 \/ (\d+)%\)\s*(?:!important)?\s*(?:;|$)/)?.[1]);
if (!(bubbleAlpha >= 30 && bubbleAlpha < 70)) failures.push("user message bubble must be a single translucent black fill");
if (/linear-gradient|rgb\((?:1\d\d|2\d\d)\s/.test(bubble)) failures.push("user message bubble must not carry a light wash layer");
if (!/border:\s*1px solid var\(--app-theme-border\)/.test(bubble)) failures.push("user message bubble must keep its subtle theme border");
// T3 panes must read as dense as Ghostty over the same lake. Ghostty composites
// background-opacity of lake ink over the blurred wallpaper; T3 stacks one flat
// pane scrim over the glass tint, then the approved preset's 92% window opacity
// lets 8% unscrimmed wallpaper back in. Top-to-bottom fades made the lower
// conversation half as dense as the terminal beside it.
const ghosttyAlpha = Number(
  readFileSync(fileURLToPath(new URL("../desktop/lake/ghostty.conf", import.meta.url)), "utf8")
    .match(/^background-opacity\s*=\s*([\d.]+)/m)?.[1],
);
const css = (theme.css ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
const stops = (name) =>
  [...css.matchAll(new RegExp(`--aurora-${name}:\\s*linear-gradient\\(([^;]*)\\);`, "g"))].map(([, body]) =>
    [...body.matchAll(/rgb\(10 16 13 \/ (\d+)%\)/g)].map(([, a]) => Number(a) / 100),
  );
const [pane, ...extraPanes] = stops("pane");
const [tint] = stops("glass");
if (extraPanes.length > 0 || !pane || new Set(pane).size !== 1) {
  failures.push("all T3 panes must share one flat lake ink scrim");
} else if (tint?.length) {
  const effective = 1 - (1 - pane[0]) * (1 - tint[0]);
  if (Math.abs(effective * 0.92 - ghosttyAlpha) > 0.01) {
    failures.push(`T3 pane scrim ${effective.toFixed(4)} at 92% window opacity must match Ghostty ${ghosttyAlpha}`);
  }
}
// Hyprland covers the portrait or landscape monitor with a centred wallpaper,
// so a centred cover crop lines a full-height T3 window up with the desktop.
if (!/var\(--aurora-backdrop\) center \/ cover fixed/.test(css)) {
  failures.push("T3 wallpaper must use the desktop's centred cover crop");
}
// T3 blurs its own cover copy of the wallpaper by only 24px. A tiled or
// full-height window therefore puts the sharp aurora core behind the reading
// area. Ghostty shows the desktop under Hyprland's much wider blur. A
// darken-blended crest caps each wallpaper channel before the pane blur, which
// limits the worst band in any layout and leaves darker lake detail unchanged.
// Bounds come from a 2026-11-22 side-by-side capture. In it, Ghostty's
// text-free p99.5 is sRGB luma 55 and its median is 25. The T3 window's 8% leak
// adds about 5.
const crest = css.match(/--aurora-crest:\s*linear-gradient\((#[0-9a-f]{6}),\s*\1\)/i)?.[1];
const paneRule = declarations('[data-workspace-area="conversation"]');
if (
  !crest ||
  !/background:\s*var\(--aurora-crest\),\s*var\(--app-theme-canvas\) var\(--aurora-backdrop\)/.test(paneRule) ||
  !/background-blend-mode:\s*darken,\s*normal/.test(paneRule)
) {
  failures.push("T3 panes must cap the wallpaper with a darken-blended --aurora-crest layer");
} else if (pane && tint?.length) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(crest.slice(i, i + 2), 16));
  const luma = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  const scrim = 1 - (1 - pane[0]) * (1 - tint[0]);
  const peak = 0.92 * ((1 - scrim) * luma([r, g, b]) + scrim * luma([10, 16, 13]));
  if (peak > 50) failures.push(`T3 crest peak ${peak.toFixed(1)} must not outshine Ghostty's brightest lake (50)`);
  if (peak < 40) failures.push(`T3 crest peak ${peak.toFixed(1)} must keep the aurora visible above the lake (40)`);
  if (!(g > r && g >= b)) failures.push("T3 crest must keep the aurora green, not grey or violet");
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

// T3 v0.1.11 opens Usage and Settings in one AppRouteModal: [data-app-modal]
// filled with opaque bg-background over a .dialog-backdrop of 64% canvas.
// Aurora keeps that modal glass. Alerts and ordinary dialogs keep T3's own
// fills, and Settings › Appearance previews keep their bg-background swatches.
const rules = [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].flatMap(([, s]) => s.split(",").map((x) => x.trim()));
const blanket = [
  ".dialog-backdrop",
  ".dialog-glass",
  '[data-slot="dialog-popup"]',
  '[data-slot="dialog-backdrop"]',
  '[data-slot="alert"]',
  '[role="alertdialog"]',
  "[data-app-modal] .bg-background",
  "[data-app-modal] .bg-sidebar",
];
for (const s of rules.filter((s) => blanket.includes(s))) failures.push(`${s} is too broad; scope glass to the app modal`);
const modal = "[data-app-modal]";
const modalBackdrop = ".dialog-backdrop:has(~ * [data-app-modal])";
const settingsPanels = ["[data-app-modal] nav.bg-sidebar", "[data-app-modal] .bg-card"];
const alphaOf = (selector) => Number(declarations(selector).match(ink)?.[1]) / 100;
for (const s of [modal, modalBackdrop, ...settingsPanels]) {
  const a = alphaOf(s);
  if (!(a > 0 && a < 0.6)) failures.push(`${s} must use translucent lake ink !important`);
  if (/(?:^|;)\s*opacity\s*:/.test(declarations(s))) failures.push(`${s} must not fade its content`);
}
for (const s of [modal, ...settingsPanels]) {
  if (!/backdrop-filter:\s*blur\(/.test(declarations(s))) failures.push(`${s} must blur what passes beneath`);
}
const seeThrough = (1 - alphaOf(modalBackdrop)) * (1 - alphaOf(modal));
if (!(seeThrough >= 1 / 3)) failures.push(`app modal must show at least a third of the app behind it`);
// Worst large fill behind the modal: the selected thread row's accent wash over
// the crest-capped pane peak. Blur averages away text, so labels and chart
// ticks must stay readable over that fill seen through backdrop, modal and card.
const selected = declarations('[data-thread-item] [aria-current="page"]').match(
  /background:\s*rgb\((\d+) (\d+) (\d+) \/ (\d+)%\)/,
);
if (crest && pane && selected) {
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const hexOf = (v) => `#${v.map((x) => Math.round(x).toString(16).padStart(2, "0")).join("")}`;
  const over = (top, a, under) => top.map((v, i) => a * v + (1 - a) * under[i]);
  const lake = [10, 16, 13];
  // Leaving out the 2% glass tint keeps this pane peak slightly brighter (worse).
  const peak = over(lake, pane[0], rgb(crest)).map((v) => 0.92 * v);
  const behind = over(selected.slice(1, 4).map(Number), Number(selected[4]) / 100, peak);
  const modalFill = over(lake, alphaOf(modal), over(lake, alphaOf(modalBackdrop), behind));
  const fills = { modal: modalFill };
  for (const s of settingsPanels) fills[s] = over(lake, alphaOf(s), modalFill);
  for (const [name, fill] of Object.entries(fills)) {
    for (const role of ["text", "textMuted"]) {
      const r = ratio(c[role], hexOf(fill));
      if (!(r >= 4.5)) failures.push(`${role} on ${name} glass ${hexOf(fill)}: ${r.toFixed(2)} < 4.5`);
    }
  }
}

// T3 v0.1.11 fills the right panel ([data-workspace-area="panel"]) and the
// pull request detail inside it with opaque bg-background. That detail root is
// the only element whose direct child carries the @container/pr-header class.
// Its sticky Summary section headers, Timeline cards, rail badges, reply
// composer and Code toolbar repeat the same canvas fill. Aurora shares the
// anchored pane lake with that panel and turns those named fills into glass.
const prHeader = ".\\@container\\/pr-header";
const prPanel = `[data-workspace-area="panel"]:has(${prHeader})`;
const prRoot = `.bg-background:has(> ${prHeader})`;
const lakeRule = declarations(prPanel);
if (!/background:\s*var\(--aurora-crest\),\s*var\(--app-theme-canvas\) var\(--aurora-backdrop\) center \/ cover fixed/.test(lakeRule)) {
  failures.push("PR panel must share the anchored, crest-capped pane lake");
}
if (!/backdrop-filter:\s*blur\(24px\)/.test(declarations(`${prPanel}::before`))) {
  failures.push("PR panel must share the pane scrim and blur");
}
if (!/background:\s*transparent\s*!important/.test(declarations(prRoot))) {
  failures.push("PR detail root must be transparent so the panel lake shows");
}
const sticky = `${prRoot} .sticky.bg-background`;
const prCards = [`${prRoot} article.bg-background`, `${prRoot} .rounded-xl.bg-background`, `${prRoot} .\\@container.bg-background`];
for (const s of [sticky, ...prCards]) {
  const a = alphaOf(s);
  if (!(a > 0 && a < 0.6)) failures.push(`${s} must use translucent lake ink !important`);
}
if (!/backdrop-filter:\s*blur\(/.test(declarations(sticky))) failures.push("sticky PR section headers must blur rows beneath");
for (const s of [`${prRoot} .size-8.bg-background`, `${prRoot} .size-7.bg-background`]) {
  const badge = declarations(s);
  if (!/background:\s*transparent\s*!important/.test(badge) || !/backdrop-filter:\s*blur\(/.test(badge)) {
    failures.push(`${s} must be a blurred clear badge that still hides the timeline rail`);
  }
}
// T3's outline controls and label chips also carry bg-background, with dark
// and hover fills that a blanket override would hide. Diff surfaces keep their
// code background so additions and deletions keep their T3 tints.
for (const s of rules) {
  if (/(^|\s)\.bg-background$/.test(s) || (/\*$/.test(s) && /panel|pull-request|pr-header/.test(s))) {
    failures.push(`${s} is too broad; scope glass to named PR fills`);
  }
  if (/diffs|diff-render-surface|\.shiki|chat-markdown-codeblock pre/.test(s)) {
    failures.push(`${s} must leave diff and syntax rendering to T3`);
  }
}
// Fenced chat code blocks get T3's opaque --code-background. Aurora uses a
// black glass instead. Over the crest-capped pane peak, every pierre-dark token
// (T3's dark syntax theme) must keep at least 95% of its contrast on the stock
// Aurora code background, and at least a third of the lake must show through.
const codeblock = declarations(".chat-markdown .chat-markdown-codeblock");
const codeAlpha = Number(codeblock.match(/background-color:\s*rgb\(0 0 0 \/ (\d+)%\)\s*!important/)?.[1]) / 100;
if (!(codeAlpha > 0 && codeAlpha <= 2 / 3)) failures.push("chat code blocks must use black glass that shows the lake");
if (/(?:^|;)\s*(?:color|opacity)\s*:/.test(codeblock)) failures.push("chat code blocks must keep T3 text and syntax colors");
if (crest && pane && codeAlpha > 0) {
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const hexOf = (v) => `#${v.map((x) => Math.round(x).toString(16).padStart(2, "0")).join("")}`;
  const over = (top, a, under) => top.map((v, i) => a * v + (1 - a) * under[i]);
  const peak = hexOf(over([10, 16, 13], pane[0], rgb(crest)).map((v) => 0.92 * v));
  const fill = hexOf(over([0, 0, 0], codeAlpha, rgb(peak)));
  const pierreDark = ["#ff678d", "#636363", "#ff855e", "#ffab16", "#ffd452", "#08c0ef", "#9d6afb", "#5ecc71",
    "#ffa359", "#d568ea", "#fafafa", "#737373", "#a3a3a3", "#69b1ff", "#68cdf2", "#60d199", "#64d1db", "#61d5c0"];
  for (const token of [...pierreDark, c.codeForeground]) {
    const stock = ratio(token, c.codeBackground);
    if (ratio(token, fill) < 0.95 * stock) failures.push(`code token ${token} on glass ${fill} loses contrast`);
  }
  // PR text sits on the bare panel lake or on a 34% card over it.
  for (const [name, bg] of [["panel", peak], ["card", hexOf(over([10, 16, 13], alphaOf(prCards[0]), rgb(peak)))]]) {
    for (const role of ["text", "textMuted"]) {
      const r = ratio(c[role], bg);
      if (!(r >= 4.5)) failures.push(`${role} on PR ${name} ${bg}: ${r.toFixed(2)} < 4.5`);
    }
  }
}

if (failures.length > 0) {
  console.error(`t3code.json: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`t3code.json: ok (${pairs.length} contrast pairs)`);

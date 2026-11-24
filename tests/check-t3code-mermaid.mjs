#!/usr/bin/env node
// Renders a T3 v0.1.11 Mermaid diagram the way T3 draws it inline and the way
// its Expand button serializes it into the lightbox image, then checks that
// Aurora's roles reach both. Run with CHROMIUM=<binary> if `chromium` is not on PATH.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const theme = JSON.parse(readFileSync(process.argv[2] ?? fileURLToPath(new URL("../t3code.json", import.meta.url)), "utf8"));
const c = theme.colors;
const kebab = (role) => role.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
const roleVars = Object.entries(c).map(([role, value]) => `--app-theme-${kebab(role)}:${value}`).join(";");

// T3 v0.1.11 main-C7LLcwbG.css, verbatim where it decides diagram and lightbox colours.
const t3Css = `
html,body{background-color:var(--app-chrome-background)}
html[data-theme-id]:not([data-theme-id=""]){--background:var(--app-theme-canvas);--app-chrome-background:var(--app-theme-chrome);--foreground:var(--app-theme-text);--primary:var(--app-theme-message-action);--secondary:var(--app-theme-secondary);--muted-foreground:var(--app-theme-muted-foreground);--accent:var(--app-theme-accent-surface);--error:var(--app-theme-error);--destructive:var(--error);--ring:var(--app-theme-focus)}
.pele{--pele-bg:var(--background);--pele-fg:var(--foreground);--pele-muted:var(--muted-foreground);--pele-line:var(--muted-foreground);--pele-surface:var(--secondary);--pele-surface-alt:var(--accent);--pele-border:var(--foreground)}
.pele{--pele-border:color-mix(in srgb, var(--foreground) 28%, transparent)}
.pele{--pele-accent:var(--primary);--pele-critical:var(--destructive)}
.bg-background{background-color:var(--background)}
`;
// pele (77XECAW3-Cek1N3Gv.js) root style and default series, verbatim.
const peleStyle = "--_bg:var(--pele-bg,#fff);--_fg:var(--pele-fg,#1f1f1f);--_m:var(--pele-muted,#6e6e6e);--_l:var(--pele-line,#1f1f1f);--_s:var(--pele-surface,#f3f3f3);--_a:var(--pele-surface-alt,#e6e6e6);--_b:var(--pele-border,#8a8a8a);--_c:var(--pele-accent,#5b7bd5);color:var(--_fg)";
const peleSeries = ["#4c78a8", "#f58518", "#54a24b", "#e45756", "#72b7b2", "#eeca3b", "#b279a2", "#9d755d"];
// ChatMarkdown-Cx4oPqLw.js: Expand copies these roles and body's background into an SVG blob.
const t3Expand = "var rA=[`--pele-bg`,`--pele-fg`,`--pele-muted`,`--pele-line`,`--pele-surface`,`--pele-surface-alt`,`--pele-border`,`--pele-accent`,`--pele-critical`,...Array.from({length:8},(e,t)=>`--pele-series-${t+1}`)],iA=null;function aA(e){let t=e.cloneNode(!0),n=getComputedStyle(e);for(let e of rA){let r=n.getPropertyValue(e).trim();r&&t.style.setProperty(e,r)}return t.style.maxWidth=`none`,t.style.backgroundColor=getComputedStyle(document.body).backgroundColor,iA&&URL.revokeObjectURL(iA),iA=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(t)],{type:`image/svg+xml`})),iA}";

// A flowchart cluster with a node inside, a lone node, an edge, an edge-label
// plate, role swatches (thick, so pixel centres are pure) and the 8 series.
const samples = {
  backdrop: [5, 5], clusterNode: [100, 90], cluster: [40, 160], node: [240, 70], border: [200, 160],
  edge: [300, 100], plate: [350, 35], text: [350, 70], muted: [350, 100], accent: [350, 130], critical: [350, 160],
  authored: [240, 120],
  ...Object.fromEntries(peleSeries.map((_, i) => [`series${i + 1}`, [30 + i * 48, 220]])),
};
const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="pele pele-flowchart" viewBox="0 0 400 240" width="400" height="240" style="max-width:100%;height:auto;${peleStyle}" fill="var(--_fg)">
<rect data-sample="cluster" x="20" y="20" width="160" height="160" fill="var(--_a)" fill-opacity="0.5" stroke="var(--_b)"/>
<rect data-sample="clusterNode" x="60" y="60" width="80" height="60" fill="var(--_s)" stroke="var(--_b)"/>
<rect data-sample="node" x="200" y="40" width="80" height="60" fill="var(--_s)" stroke="var(--_b)"/>
<rect data-sample="authored" x="200" y="110" width="80" height="20" fill="var(--_s)" stroke="var(--_b)" style="fill:#ff99ff;"/>
<rect data-sample="border" data-paint="stroke" x="200" y="140" width="60" height="40" fill="none" stroke="var(--_b)" stroke-width="16"/>
<path data-sample="edge" data-paint="stroke" d="M300 20V180" stroke="var(--_l)" stroke-width="8"/>
<rect data-sample="plate" x="320" y="20" width="60" height="30" rx="3" fill="var(--_bg)"/>
<rect data-sample="text" x="320" y="60" width="60" height="20" fill="var(--_fg)"/>
<rect data-sample="muted" x="320" y="90" width="60" height="20" fill="var(--_m)"/>
<rect data-sample="accent" x="320" y="120" width="60" height="20" fill="var(--_c)"/>
<rect data-sample="critical" x="320" y="150" width="60" height="20" fill="var(--pele-critical,#e45756)"/>
${peleSeries.map((hex, i) => `<rect data-sample="series${i + 1}" x="${10 + i * 48}" y="210" width="40" height="20" fill="var(--pele-series-${i + 1},${hex})"/>`).join("")}
</svg>`;

const page = `<!doctype html><html data-theme-id="aurora" class="dark" style="${roleVars};background-color:${c.chrome}">
<head><style>${t3Css}</style><style id="aurora">${theme.css}</style></head>
<body style="background-color:${c.chrome}">
<div class="chat-markdown-mermaid overflow-x-auto" data-markdown-mermaid=""><button type="button" class="block w-full cursor-zoom-in rounded-md"><span class="flex w-full justify-center">${svg}</span></button></div>
<div data-slot="dialog-backdrop" id="shade"></div><div data-slot="dialog-viewport"><div class="relative isolate z-10 flex max-h-full max-w-[var(--media-width)] flex-col items-center" id="lightbox">
<div class="absolute left-0 top-0 z-20 max-[8rem]:left-1/2 max-[8rem]:-translate-x-1/2"><button type="button" id="back">Back</button></div>
<button type="button" class="left-0 top-auto bottom-0 translate-y-0 sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2" id="previous">Previous</button>
<div role="region" tabindex="0" id="region" class="max-w-[var(--media-width)] overflow-auto overscroll-contain rounded-lg bg-background shadow-2xl ring-1 ring-border/70 outline-none"><img id="image" alt="Mermaid diagram" class="block max-w-none select-none"></div>
<div class="mt-2 flex max-w-[var(--media-width)] items-center justify-center gap-1.5 text-xs text-white/80 max-sm:px-10" id="caption">Mermaid diagram</div>
</div>
</div><pre id="result">pending</pre>
<script>${t3Expand}
const samples = ${JSON.stringify(samples)};
const out = (value) => { document.getElementById("result").textContent = JSON.stringify(value); };
try {
  const parse = (v) => {
    const rgb = v.match(/rgba?\\(([^)]+)\\)/);
    if (rgb) { const [r, g, b, a = 1] = rgb[1].split(/[ ,/]+/).map(Number); return [r, g, b, a * 255]; }
    const srgb = v.match(/color\\(srgb ([^ )]+) ([^ )]+) ([^ /)]+)(?: \\/ ([^ )]+))?\\)/);
    if (srgb) return [srgb[1] * 255, srgb[2] * 255, srgb[3] * 255, (srgb[4] ?? 1) * 255];
    throw new Error("unsupported colour " + v);
  };
  // Inline: the live SVG's own computed paint, as the conversation shows it.
  const inline = Object.fromEntries([...document.querySelectorAll("[data-markdown-mermaid] [data-sample]")].map((el) => {
    const paint = el.dataset.paint ?? "fill", style = getComputedStyle(el), [r, g, b, a] = parse(style[paint]);
    return [el.dataset.sample, [r, g, b, a * Number(style[paint + "Opacity"])]];
  }));
  inline.backdrop = [0, 0, 0, 0];
  const image = document.getElementById("image");
  const fill = (id) => parse(getComputedStyle(document.getElementById(id)).backgroundColor);
  image.onload = () => {
    const canvas = Object.assign(document.createElement("canvas"), { width: 400, height: 240 });
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    const pixels = Object.fromEntries(Object.entries(samples).map(([name, [x, y]]) => [name, [...ctx.getImageData(x, y, 1, 1).data]]));
    const region = fill("region"), shade = fill("shade");
    image.alt = "Photo";
    const rasterRegion = fill("region"), rasterShade = fill("shade");
    out({ inline, pixels, region, shade, rasterRegion, rasterShade,
      window: parse(getComputedStyle(document.documentElement).backgroundColor) });
  };
  image.onerror = () => out({ error: "expanded diagram image failed to load" });
  image.src = aA(document.querySelector("[data-markdown-mermaid] svg"));
} catch (error) { out({ error: String(error) }); }
</script></body></html>`;

const dir = await mkdtemp(join(tmpdir(), "aurora-mermaid-"));
let result;
try {
  const fixture = join(dir, "fixture.html");
  await writeFile(fixture, page);
  const dom = execFileSync(process.env.CHROMIUM ?? "chromium", [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-background-networking",
    `--user-data-dir=${join(dir, "profile")}`, "--virtual-time-budget=5000", "--dump-dom", pathToFileURL(fixture).href,
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 60_000 });
  result = JSON.parse(dom.match(/<pre id="result">([^<]*)<\/pre>/)?.[1].replace(/&amp;/g, "&") ?? "{}");
} finally {
  await rm(dir, { recursive: true, force: true });
}
if (!result.pixels || !result.inline) throw new Error(`Mermaid fixture did not render: ${JSON.stringify(result)}`);

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hexOf = (v) => `#${v.map((x) => Math.round(x).toString(16).padStart(2, "0")).join("")}`;
const over = ([r, g, b, a], under) => [r, g, b].map((v, i) => (a / 255) * v + (1 - a / 255) * under[i]);
const luminance = (rgb) => {
  const [r, g, b] = rgb.map((v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const purple = ([r, g, b]) => {
  const max = Math.max(r, g, b), chroma = max - Math.min(r, g, b);
  if (chroma < 4) return false;
  const h = max === r ? ((g - b) / chroma) % 6 : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4;
  const hue = (h * 60 + 360) % 360;
  return hue >= 250 && hue <= 335;
};
const blackGreen = ([r, g, b]) => g >= r && g >= b;

const failures = [];
// Inline diagrams sit on the bare conversation lake (T3's diagram frame has no
// fill). Check against its crest-capped peak, the brightest backdrop.
const css = theme.css.replace(/\/\*[\s\S]*?\*\//g, "");
const crest = css.match(/--aurora-crest:\s*linear-gradient\((#[0-9a-f]{6}),/i)?.[1];
const pane = Number(css.match(/--aurora-pane:\s*linear-gradient\(rgb\(10 16 13 \/ (\d+)%\)/)?.[1]) / 100;
if (!crest || !(pane > 0)) failures.push("cannot derive the inline lake peak from --aurora-crest and --aurora-pane");
const peak = over([10, 16, 13, pane * 255], hex(crest ?? "#000000")).map((v) => 0.92 * v);

// Expand stamps body's background onto the image. It must not paint T3's
// chrome behind the diagram; the lightbox's own Aurora canvas shows instead.
const expandedBackdrop = over(result.region, over(result.shade, peak));
for (const fill of [result.shade, result.region]) {
  if (!(fill[3] > 0 && fill[3] < 220)) failures.push("expanded Mermaid viewer must show the backdrop");
}
if (result.pixels.backdrop[3] !== 0) {
  failures.push(`expanded diagram paints ${hexOf(result.pixels.backdrop.slice(0, 3))} behind itself, not the lightbox canvas`);
}
if (!blackGreen(expandedBackdrop)) failures.push(`expanded diagram backdrop ${hexOf(expandedBackdrop)} is not black-green`);
if (hexOf(result.window.slice(0, 3)) !== c.chrome.toLowerCase()) failures.push(`app window background changed to ${hexOf(result.window.slice(0, 3))}`);

// Inline paint comes from the live SVG; expanded paint from the decoded image.
for (const [where, p, back] of [["inline", result.inline, peak], ["expanded", result.pixels, expandedBackdrop]]) {
  const text = over(p.text, back);
  const cluster = over(p.cluster, back);
  const node = over(p.node, back);
  const clusterNode = over(p.clusterNode, cluster);
  for (const [name, fill] of [["node", node], ["node in a subgraph", clusterNode], ["subgraph", cluster]]) {
    if (!blackGreen(fill)) failures.push(`${where} ${name} ${hexOf(fill)} is not black-green`);
    if (ratio(text, fill) < 4.5) failures.push(`${where} label on ${name} ${hexOf(fill)}: ${ratio(text, fill).toFixed(2)} < 4.5`);
    if (ratio(over(p.border, fill), fill) < 3) failures.push(`${where} outline on ${name} ${hexOf(fill)}: ${ratio(over(p.border, fill), fill).toFixed(2)} < 3`);
  }
  // Glass: nodes let the lake through instead of stamping an opaque tile.
  if (!(p.node[3] < 255)) failures.push(`${where} nodes must be translucent glass, not an opaque tile`);
  const subgraphLabel = ratio(over(p.muted, back), cluster);
  if (subgraphLabel < 4.5) failures.push(`${where} subgraph title on ${hexOf(cluster)}: ${subgraphLabel.toFixed(2)} < 4.5`);
  const plate = over(p.plate, back);
  if (ratio(text, plate) < 4.5) failures.push(`${where} edge label on plate ${hexOf(plate)}: ${ratio(text, plate).toFixed(2)} < 4.5`);
  for (const [name, under] of [["lake", back], ["subgraph", cluster]]) {
    const edge = ratio(over(p.edge, under), under);
    if (edge < 3) failures.push(`${where} edge on ${name} ${hexOf(under)}: ${edge.toFixed(2)} < 3`);
  }
  const accent = hexOf(over(p.accent, back)), critical = hexOf(over(p.critical, back));
  if (accent !== c.accent.toLowerCase()) failures.push(`${where} diagram accent ${accent} must be ${c.accent}`);
  if (critical !== c.error.toLowerCase()) failures.push(`${where} critical marks ${critical} must keep Aurora's error ${c.error}`);
  // Mermaid `style` and `classDef` fills are the author's; Aurora only sets roles.
  const authored = hexOf(over(p.authored, back));
  if (authored !== "#ff99ff") failures.push(`${where} authored fill:#ff99ff rendered ${authored}`);

  // Series colours (pie slices, chart lines, git branches) stay distinct and out
  // of the purple band Aurora never paints. Pie percentages inside a slice are
  // drawn in --pele-bg, and lines and slices must stand off the brightest lake.
  const series = peleSeries.map((_, i) => over(p[`series${i + 1}`], back));
  series.forEach((rgb, i) => {
    const label = ratio(rgb, plate);
    if (purple(rgb)) failures.push(`${where} series ${i + 1} ${hexOf(rgb)} is purple`);
    if (label < 4.5) failures.push(`${where} slice label on series ${i + 1} ${hexOf(rgb)}: ${label.toFixed(2)} < 4.5`);
    if (ratio(rgb, peak) < 3) failures.push(`${where} series ${i + 1} ${hexOf(rgb)} on inline lake ${hexOf(peak)}: ${ratio(rgb, peak).toFixed(2)} < 3`);
    series.slice(0, i).forEach((other, j) => {
      if (Math.hypot(...rgb.map((v, k) => v - other[k])) < 48) failures.push(`${where} series ${j + 1} and ${i + 1} are too alike`);
    });
  });
}

if (result.rasterRegion[3] !== 255 || result.rasterShade[3] !== 0) {
  failures.push("Mermaid styles leaked onto the photo control");
}

if (failures.length > 0) {
  console.error(`t3code.json Mermaid: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log("t3code.json Mermaid: ok (inline and expanded diagrams)");

#!/usr/bin/env node
// Aurora paints no purple UI: every active theme colour must sit outside the
// violet-magenta hue band. ANSI magenta slots stay magenta for terminal
// semantics; historical presets and contrast fixtures are not shipped surfaces.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const skipDirs = new Set([".git", "tests", "presets", "backgrounds", ".playwright-mcp"]);
const textFile = /\.(toml|json|css|ini|conf|theme|lua|tpl)$|\/theme-set$/;
const ansiMagenta = /\b(bright_)?magenta\b|\bcolor(5|13)\b/;

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) skipDirs.has(name) || walk(path);
    else if (textFile.test(path)) files.push(path);
  }
};
walk(root);

// Returns [r, g, b] triples for #rgb(a), #rrggbb(aa), rgb()/rgba() in comma,
// space or Hyprland rrggbbaa form, and Chromium's bare "r,g,b".
const colours = (line) => {
  const found = [];
  for (const [, h] of line.matchAll(/#([0-9a-f]{3,8})\b/gi)) {
    if (h.length === 3 || h.length === 4) found.push([...h.slice(0, 3)].map((c) => parseInt(c + c, 16)));
    else if (h.length === 6 || h.length === 8) found.push([0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)));
  }
  for (const [, h] of line.matchAll(/rgba?\(([0-9a-f]{6})(?:[0-9a-f]{2})?\)/gi)) {
    found.push([0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)));
  }
  for (const [, r, g, b] of line.matchAll(/(?:rgba?\(|^)\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\b/g)) {
    found.push([r, g, b].map(Number));
  }
  return found;
};

// Purple: hue 250°–335° with any visible chroma. A 4/255 floor ignores
// rounding noise in near-grey values; #0b0910 (chroma 7) still fails.
const purple = ([r, g, b]) => {
  const max = Math.max(r, g, b);
  const chroma = max - Math.min(r, g, b);
  if (chroma < 4) return false;
  let hue;
  if (max === r) hue = ((g - b) / chroma) % 6;
  else if (max === g) hue = (b - r) / chroma + 2;
  else hue = (r - g) / chroma + 4;
  hue = (hue * 60 + 360) % 360;
  return hue >= 250 && hue <= 335;
};

const failures = [];
let checked = 0;
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const lines = file.endsWith(".json") ? JSON.stringify(JSON.parse(text), null, 1).split(/\\n|\n/) : text.split("\n");
  lines.forEach((line, i) => {
    if (ansiMagenta.test(line)) return;
    for (const rgb of colours(line)) {
      checked++;
      if (purple(rgb)) failures.push(`${relative(root, file)}:${i + 1}: rgb(${rgb.join(" ")}) in ${line.trim().slice(0, 100)}`);
    }
  });
}

if (failures.length > 0) {
  console.error(`no-purple: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`no-purple: ok (${checked} colours in ${files.length} files)`);

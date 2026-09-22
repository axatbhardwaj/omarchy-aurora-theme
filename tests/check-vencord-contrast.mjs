import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testsDir = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(testsDir, "vencord-contrast-fixture.html");
const screenshotFlag = process.argv.indexOf("--screenshot");
const screenshot = screenshotFlag >= 0 ? resolve(process.argv[screenshotFlag + 1]) : null;
const profile = await mkdtemp(resolve(tmpdir(), "aurora-contrast-"));
const browser = spawn("chromium", [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-background-networking",
  "--host-resolver-rules=MAP clearvision.github.io ~NOTFOUND, MAP raw.githubusercontent.com ~NOTFOUND",
  "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--window-size=1200,900",
  pathToFileURL(fixture).href,
], { stdio: ["ignore", "ignore", "pipe"] });

let stderr = "";
browser.stderr.setEncoding("utf8");
browser.stderr.on("data", chunk => { stderr += chunk; });

try {
  const endpoint = await waitForEndpoint();
  const ws = new WebSocket(endpoint);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let nextId = 0;
  const pending = new Map();
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (!message.id) return;
    const waiter = pending.get(message.id);
    pending.delete(message.id);
    message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

  await Promise.all([send("Runtime.enable"), send("DOM.enable"), send("CSS.enable"), send("Page.enable")]);
  await send("Runtime.evaluate", {
    expression: `new Promise(resolve => {
      const ready = () => requestAnimationFrame(() => requestAnimationFrame(resolve));
      document.readyState === "complete" ? ready() : addEventListener("load", ready, { once: true });
    })`,
    awaitPromise: true,
  });
  const { root } = await send("DOM.getDocument", { depth: -1 });

  async function hover(selector) {
    const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector });
    if (!nodeId) throw new Error(`Fixture selector not found: ${selector}`);
    await send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: ["hover"] });
  }

  async function measure(selector, backgroundSelector = selector, backgroundPseudo = null, colorPseudo = null) {
    const expression = `(() => {
      const parse = value => {
        const rgb = value.match(/rgba?\\(([^)]+)\\)/);
        if (rgb) { const p = rgb[1].split(/[ ,/]+/).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; }
        const srgb = value.match(/color\\(srgb ([^ )]+) ([^ )]+) ([^ /)]+)(?: \\/ ([^ )]+))?\\)/);
        if (srgb) return [+srgb[1]*255, +srgb[2]*255, +srgb[3]*255, srgb[4] ? +srgb[4] : 1];
        throw new Error("Unsupported computed color: " + value);
      };
      const composite = (front, back) => {
        const a = front[3] + back[3] * (1 - front[3]);
        return [0,1,2].map(i => (front[i]*front[3] + back[i]*back[3]*(1-front[3])) / a).concat(a);
      };
      const luminance = color => {
        const linear = color.slice(0,3).map(v => { v /= 255; return v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4; });
        return .2126*linear[0] + .7152*linear[1] + .0722*linear[2];
      };
      const fgStyle = getComputedStyle(document.querySelector(${JSON.stringify(selector)}), ${JSON.stringify(colorPseudo)});
      const bgStyle = getComputedStyle(document.querySelector(${JSON.stringify(backgroundSelector)}), ${JSON.stringify(backgroundPseudo)});
      let fg = parse(fgStyle.color), bg = parse(bgStyle.backgroundColor);
      if (bg[3] < 1) bg = composite(bg, parse(getComputedStyle(document.body).backgroundColor));
      if (fg[3] < 1) fg = composite(fg, bg);
      const contrast = (Math.max(luminance(fg), luminance(bg)) + .05) / (Math.min(luminance(fg), luminance(bg)) + .05);
      return { color: fgStyle.color, background: bgStyle.backgroundColor, rgb: fg.slice(0,3), contrast };
    })()`;
    const { result } = await send("Runtime.evaluate", { expression, returnByValue: true });
    if (result.subtype === "error") throw new Error(result.description);
    return result.value;
  }

  const failures = [];
  const checkContrast = async (name, selector, minimum, options = {}) => {
    if (options.hover) await hover(selector);
    const got = await measure(selector, options.backgroundSelector, options.backgroundPseudo, options.colorPseudo);
    const pass = got.contrast >= minimum;
    console.log(`${name}: ${got.contrast.toFixed(2)}:1 (${got.color} on ${got.background}) ${pass ? "PASS" : "FAIL"}`);
    if (!pass) failures.push(`${name}: ${got.contrast.toFixed(2)} < ${minimum}`);
  };
  const checkColor = async (name, selector, expected) => {
    const got = await measure(selector);
    const actual = got.rgb.map(Math.round).join(",");
    const pass = actual === expected;
    console.log(`${name}: rgb(${actual}) ${pass ? "PASS" : "FAIL"}`);
    if (!pass) failures.push(`${name}: rgb(${actual}) != rgb(${expected})`);
  };

  for (const [name, selector] of [
    ["legacy brand", "#legacy-brand"], ["legacy success", "#legacy-success"],
    ["legacy danger", "#legacy-danger"], ["legacy inverted", "#legacy-white"],
    ["modern primary", "#modern-primary"], ["modern active", "#modern-active"],
    ["modern critical", "#modern-critical"], ["badge", "#badge"], ["bot badge", "#bot-badge"],
  ]) await checkContrast(name, selector, 4.5);
  await checkContrast("accent icon", "#icon-control", 3);
  await checkContrast("selected voice name", "#voice-name", 4.5, { backgroundSelector: "#voice-surface", backgroundPseudo: "::before" });
  await checkContrast("selected voice secondary", "#voice-secondary", 4.5, { backgroundSelector: "#voice-surface", backgroundPseudo: "::before" });
  await checkContrast("text selection", "#selection", 4.5, { colorPseudo: "::selection", backgroundSelector: "#selection", backgroundPseudo: "::selection" });
  await checkContrast("outlined default stays light", "#legacy-outline", 4.5);
  await checkContrast("modern secondary stays light", "#modern-secondary", 4.5);
  await checkContrast("custom profile stays paired", "#custom-primary", 4.5);
  await checkColor("critical secondary keeps role colour", "#modern-critical-secondary", "240,112,142");
  await checkColor("role colour remains untouched", "#role-color", "217,140,192");

  for (const [name, selector] of [
    ["legacy brand hover", "#legacy-brand"], ["legacy success hover", "#legacy-success"],
    ["legacy danger hover", "#legacy-danger"], ["outlined hover", "#legacy-outline"],
    ["modern primary hover", "#modern-primary"], ["modern active hover", "#modern-active"],
    ["modern critical hover", "#modern-critical"],
  ]) await checkContrast(name, selector, 4.5, { hover: true });

  if (screenshot) {
    const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    await writeFile(screenshot, Buffer.from(data, "base64"));
    console.log(`Rendered fixture: ${screenshot}`);
  }
  ws.close();
  if (failures.length) throw new Error(`${failures.length} contrast regression(s):\n${failures.join("\n")}`);
  console.log("Aurora Discord contrast matrix: PASS");
} finally {
  browser.kill("SIGTERM");
  if (browser.exitCode === null) await new Promise(resolve => browser.once("exit", resolve));
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
}

async function waitForEndpoint() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
    if (match) {
      const browserUrl = new URL(match[1]);
      const targets = await fetch(`http://${browserUrl.host}/json/list`).then(response => response.json());
      const page = targets.find(target => target.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    }
    if (browser.exitCode !== null) throw new Error(`Chromium exited ${browser.exitCode}: ${stderr}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for Chromium DevTools endpoint: ${stderr}`);
}

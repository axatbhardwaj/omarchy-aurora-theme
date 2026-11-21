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

let failure;
let cleanupFailure;
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

  async function measure(selector, backgroundSelector = selector, backgroundPseudo = null, colorPseudo = null, foregroundProperty = "color") {
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
      const color = fgStyle[${JSON.stringify(foregroundProperty)}];
      let fg = parse(color), bg = parse(bgStyle.backgroundColor);
      if (bg[3] < 1) bg = composite(bg, parse(getComputedStyle(document.body).backgroundColor));
      if (fg[3] < 1) fg = composite(fg, bg);
      const contrast = (Math.max(luminance(fg), luminance(bg)) + .05) / (Math.min(luminance(fg), luminance(bg)) + .05);
      return { color, background: bgStyle.backgroundColor, shadow: fgStyle.boxShadow, content: fgStyle.content, rgb: fg.slice(0,3), contrast };
    })()`;
    const { result } = await send("Runtime.evaluate", { expression, returnByValue: true });
    if (result.subtype === "error") throw new Error(result.description);
    return result.value;
  }

  async function measureSvgFill(selector, backgroundSelector) {
    const expression = `(() => {
      const icon = document.querySelector(${JSON.stringify(selector)});
      const background = document.querySelector(${JSON.stringify(backgroundSelector)});
      const parse = value => value.match(/rgba?\\(([^)]+)\\)/)[1].split(/[ ,/]+/).map(Number);
      const luminance = color => {
        const linear = color.slice(0,3).map(v => { v /= 255; return v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4; });
        return .2126*linear[0] + .7152*linear[1] + .0722*linear[2];
      };
      const fillStyle = getComputedStyle(icon);
      const backgroundStyle = getComputedStyle(background);
      const fill = parse(fillStyle.fill), bg = parse(backgroundStyle.backgroundColor);
      const contrast = (Math.max(luminance(fill), luminance(bg)) + .05) / (Math.min(luminance(fill), luminance(bg)) + .05);
      return { fill: fillStyle.fill, background: backgroundStyle.backgroundColor, contrast };
    })()`;
    const { result } = await send("Runtime.evaluate", { expression, returnByValue: true });
    if (result.subtype === "error") throw new Error(result.description);
    return result.value;
  }

  const failures = [];
  const checkContrast = async (name, selector, minimum, options = {}) => {
    if (options.hover) await hover(selector);
    const got = await measure(selector, options.backgroundSelector, options.backgroundPseudo, options.colorPseudo, options.foregroundProperty);
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
  const checkStyle = async (name, selector, property, expected, pseudo = null) => {
    const got = await measure(selector, selector, null, pseudo);
    const actual = got[property];
    const pass = actual === expected;
    console.log(`${name}: ${actual} ${pass ? "PASS" : "FAIL"}`);
    if (!pass) failures.push(`${name}: ${actual} != ${expected}`);
  };
  const checkProperty = async (name, selector, property, expected) => {
    const { result } = await send("Runtime.evaluate", {
      expression: `getComputedStyle(document.querySelector(${JSON.stringify(selector)}))[${JSON.stringify(property)}]`,
      returnByValue: true,
    });
    const pass = result.value === expected;
    console.log(`${name}: ${result.value} ${pass ? "PASS" : "FAIL"}`);
    if (!pass) failures.push(`${name}: ${result.value} != ${expected}`);
  };
  const checkSvgContrast = async (name, selector, backgroundSelector, minimum) => {
    const got = await measureSvgFill(selector, backgroundSelector);
    const pass = got.contrast >= minimum;
    console.log(`${name}: ${got.contrast.toFixed(2)}:1 (${got.fill} on ${got.background}) ${pass ? "PASS" : "FAIL"}`);
    if (!pass) failures.push(`${name}: ${got.contrast.toFixed(2)} < ${minimum}`);
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
  await checkColor("selected channel label", "#voice-name", "237,247,239");
  for (const selector of ["#channel-name", "#status-label", "#idle-name", "#speaking-name"]) {
    await checkContrast(selector, selector, 4.5, { backgroundSelector: "#voice-glass" });
  }
  await checkColor("idle voice name", "#idle-name", "176,200,188");
  await checkColor("speaking voice name", "#speaking-name", "253,255,253");
  await checkColor("voice live badge", "#voice-live", "255,255,255");
  await checkColor("voice microphone", "#voice-mic", "122,123,131");
  await checkStyle("desktop title", "#app-title", "content", '"Vesktop"', "::before");
  const glass = await send("Runtime.evaluate", {
    expression: `(() => {
      document.querySelector("#composer").focus();
      const style = selector => getComputedStyle(document.querySelector(selector));
      const root = style("html");
      const composer = style(".channelTextArea_fixture");
      const row = getComputedStyle(document.querySelector("#voice-surface"), "::before");
      const tint = getComputedStyle(document.querySelector(".bg_fixture"), "::after");
      return [
        root.getPropertyValue("--background-filter").trim(),
        root.getPropertyValue("--muted-text").trim().toUpperCase(),
        style(".sidebarList_fixture").backgroundImage,
        style(".chatContent_fixture").backgroundImage,
        composer.backgroundColor, composer.outlineWidth, composer.outlineColor,
        row.borderInlineStartWidth, row.backgroundColor, tint.backgroundColor,
      ];
    })()`, returnByValue: true,
  });
  const expectedGlass = [
    "blur(24px)", "#B0C8BC",
    "linear-gradient(rgba(10, 16, 13, 0.44), rgba(10, 16, 13, 0.3))",
    "linear-gradient(rgba(10, 16, 13, 0.42), rgba(10, 16, 13, 0.2))",
    "rgba(10, 16, 13, 0.52)", "2px", "rgb(133, 217, 172)", "3px",
    "rgba(133, 217, 172, 0.2)", "rgba(14, 22, 19, 0.02)",
  ];
  if (JSON.stringify(glass.result.value) !== JSON.stringify(expectedGlass)) {
    failures.push(`Unexpected Aurora glass: ${JSON.stringify(glass.result.value)}`);
  }
  await checkContrast("text selection", "#selection", 4.5, { colorPseudo: "::selection", backgroundSelector: "#selection", backgroundPseudo: "::selection" });
  await checkContrast("outlined default stays light", "#legacy-outline", 4.5);
  await checkContrast("modern secondary stays light", "#modern-secondary", 4.5);
  await checkContrast("custom profile stays paired", "#custom-primary", 4.5);
  await checkContrast("custom profile active", "#custom-active", 4.5);
  await checkContrast("custom profile critical", "#custom-critical", 4.5);
  await checkColor("critical secondary keeps role colour", "#modern-critical-secondary", "240,112,142");
  await checkColor("role colour remains untouched", "#role-color", "217,140,192");
  await checkStyle("selected navigation foreground", "#selected-navigation", "color", "rgb(10, 16, 13)");
  await checkStyle("selected navigation surface", "#selected-navigation", "background", "rgb(133, 217, 172)");
  await checkStyle("selected navigation descendant stays transparent", "#selected-navigation-label", "background", "rgba(0, 0, 0, 0)");
  await checkContrast("public navItem selected text", "#settings-selected-label", 4.5, { backgroundSelector: "#settings-selected" });
  await checkSvgContrast("public navItem selected icon", "#settings-selected-icon", "#settings-selected", 3);
  await checkContrast("public navItem neutral text stays light", "#settings-neutral-label", 4.5, { backgroundSelector: "#settings-neutral" });
  await checkSvgContrast("public navItem neutral icon stays light", "#settings-neutral-icon", "#settings-neutral", 3);
  await checkContrast("live selected settings text", "#live-settings-selected-label", 4.5, { backgroundSelector: "#live-settings-selected" });
  await checkSvgContrast("live selected settings icon", "#live-settings-selected-icon", "#live-settings-selected", 3);
  await checkContrast("live neutral settings text stays light", "#live-settings-neutral-label", 4.5, { backgroundSelector: "#live-settings-neutral" });
  await checkSvgContrast("live neutral settings icon stays light", "#live-settings-neutral-icon", "#live-settings-neutral", 3);
  await checkContrast("unread bar text", "#unread-bar-text", 4.5, { backgroundSelector: "#unread-bar" });
  await checkContrast("new messages bar text", "#new-messages-text", 4.5, { backgroundSelector: "#new-messages" });
  await checkContrast("autocomplete selected row", "#autocomplete-selected-text", 4.5, { backgroundSelector: "#autocomplete-selected" });
  await checkContrast("autocomplete neutral row stays light", "#autocomplete-neutral-text", 4.5, { backgroundSelector: "#autocomplete-neutral" });
  await checkContrast("idle server badge", "#guild-badge", 4.5);
  await checkContrast("server badge when connected", "#guild-badge-connected", 4.5);
  await checkContrast("server rail count", "#rail-count", 4.5);
  await checkSvgContrast("server rail activity glyph", "#rail-glyph", "#rail-activity", 3);
  for (const selector of ["#rail-count", "#rail-activity"]) {
    await checkStyle("rail badge fill", selector, "background", "rgb(133, 217, 172)");
    await checkStyle("rail badge keyline", selector, "shadow", "rgb(10, 16, 13) 0px 0px 0px 1px inset");
  }
  await checkContrast("green badge against dark artwork", "#rail-count", 3, { backgroundSelector: "#dark-art", foregroundProperty: "backgroundColor" });
  await checkContrast("dark badge ink and keyline against light artwork", "#rail-activity", 3, { backgroundSelector: "#light-art" });
  await checkContrast("selected server initials", "#guild-acronym", 4.5);
  await checkContrast("idle server initials stay light", "#guild-acronym-idle", 4.5, { backgroundSelector: "body" });
  await hover("#guild-list");
  await checkContrast("idle server initials while hovering the list", "#guild-acronym-idle", 4.5, { backgroundSelector: "body" });
  await hover("#guild-acronym-hover");
  await checkContrast("hovered server initials", "#guild-acronym-hover", 4.5);
  await checkContrast("server list NEW pill", "#guild-unread-text", 4.5, { backgroundSelector: "#guild-unread-bar" });
  await checkContrast("unread divider NEW text", "#unread-divider-pill", 4.5);
  await checkStyle("unread divider pill stays Aurora green", "#unread-divider-pill", "background", "rgb(133, 217, 172)");
  await checkProperty("unread divider line is drawn", "#unread-divider", "borderTopStyle", "solid");
  await checkProperty("unread divider line stays Aurora green", "#unread-divider", "borderTopColor", "rgb(133, 217, 172)");
  await checkProperty("unread divider cap outline stays Aurora green", "#unread-divider-cap-stroke", "stroke", "rgb(133, 217, 172)");
  await checkProperty("unread divider cap fill stays Aurora green", "#unread-divider-cap-stroke", "fill", "rgb(133, 217, 172)");
  await checkContrast("unread divider cap against chat", "#unread-divider-cap-stroke", 3, { backgroundSelector: "body", foregroundProperty: "stroke" });
  await checkContrast("menu item stays light", "#menu-label", 4.5, { backgroundSelector: "body" });
  await checkContrast("focused menu item", "#menu-focused-label", 4.5, { backgroundSelector: "#menu-focused" });
  await checkContrast("focused danger menu item", "#menu-danger-label", 4.5, { backgroundSelector: "#menu-danger-focused" });
  await checkSvgContrast("focused danger menu icon", "#menu-danger-icon", "#menu-danger-focused", 3);
  await checkContrast("vencord primary button", "#vc-primary", 4.5);
  await checkContrast("vencord positive button", "#vc-positive", 4.5);
  await checkContrast("vencord settings selected without aria-current", "#vc-settings-selected-label", 4.5, { backgroundSelector: "#vc-settings-selected" });

  // Vesktop screen share picker: the audio Select opens upward over the
  // picker's own chips. Separate occlusion (menu must hide what it covers and
  // show an edge) from dimming (unselected rows must not use Discord's grey).
  const checkPickerMenuLayer = async name => {
    const { result } = await send("Runtime.evaluate", { returnByValue: true, expression: `(() => {
      const parse = value => {
        const rgb = value.match(/rgba?\\(([^)]+)\\)/);
        if (rgb) { const p = rgb[1].split(/[ ,/]+/).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; }
        const srgb = value.match(/color\\(srgb ([^ )]+) ([^ )]+) ([^ /)]+)(?: \\/ ([^ )]+))?\\)/);
        if (srgb) return [+srgb[1]*255, +srgb[2]*255, +srgb[3]*255, srgb[4] ? +srgb[4] : 1];
        throw new Error("Unsupported computed color: " + value);
      };
      const over = (front, back) => [0,1,2].map(i => front[i]*front[3] + back[i]*(1-front[3])).concat(1);
      const lum = c => { const l = c.slice(0,3).map(v => { v /= 255; return v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4; }); return .2126*l[0] + .7152*l[1] + .0722*l[2]; };
      const ratio = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);
      const listbox = document.querySelector("#picker-listbox"), under = document.querySelector("#picker-under-text");
      under.scrollIntoView({ block: "center" });
      const box = under.getBoundingClientRect();
      const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      const style = getComputedStyle(listbox), bg = parse(style.backgroundColor);
      const page = parse(getComputedStyle(document.body).backgroundColor);
      const surface = over(parse(getComputedStyle(document.querySelector("#picker-theme")).backgroundColor), page);
      const menu = over(bg, surface);
      return {
        covered: listbox.contains(top), alpha: bg[3],
        bleed: ratio(over(bg, parse(getComputedStyle(under).color)), menu),
        edge: style.borderTopStyle === "solid" ? ratio(over(parse(style.borderTopColor), menu), surface) : 0,
      };
    })()` });
    if (result.subtype === "error") throw new Error(result.description);
    const got = result.value;
    const pass = got.covered && got.alpha === 1 && got.bleed <= 1.01 && got.edge >= 3;
    console.log(`${name}: covers=${got.covered} alpha=${got.alpha} bleed=${got.bleed.toFixed(2)}:1 edge=${got.edge.toFixed(2)}:1 ${pass ? "PASS" : "FAIL"}`);
    if (!pass) failures.push(`${name}: ${JSON.stringify(got)}`);
  };
  for (const theme of ["theme-dark", "theme-darker", "theme-midnight"]) {
    await send("Runtime.evaluate", { expression: `document.querySelector("#picker-theme").className = "${theme} picker_fixture"` });
    const label = `picker ${theme}`;
    await checkContrast(`${label} Go Live`, "#picker-go-live-text", 4.5, { backgroundSelector: "#picker-go-live" });
    await checkContrast(`${label} Cancel stays light`, "#picker-cancel-text", 4.5, { backgroundSelector: "#picker-theme" });
    await checkContrast(`${label} checked chip`, "#picker-chip-checked-text", 4.5, { backgroundSelector: "#picker-chip-checked" });
    await checkStyle(`${label} checked chip is Aurora green, not blurple`, "#picker-chip-checked", "background", "rgb(133, 217, 172)");
    await checkContrast(`${label} idle chip stays light`, "#picker-chip-text", 4.5, { backgroundSelector: "#picker-theme" });
    await checkPickerMenuLayer(`${label} audio menu occludes the chips beneath`);
    await checkColor(`${label} unselected audio option uses body text`, "#picker-option", "237,247,239");
    await checkContrast(`${label} unselected audio option`, "#picker-option", 7, { backgroundSelector: "#picker-listbox" });
    await checkContrast(`${label} selected audio option`, "#picker-option-selected", 4.5);
  }
  await hover("#picker-screen");
  await checkProperty("picker source hover outline is Aurora green", "#picker-screen", "outlineColor", "rgb(133, 217, 172)");

  for (const [name, selector] of [
    ["picker Go Live hover", "#picker-go-live"],
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
} catch (error) {
  failure = error;
} finally {
  browser.kill("SIGTERM");
  await waitForBrowserExit(1000);
  if (browser.exitCode === null) {
    browser.kill("SIGKILL");
    await waitForBrowserExit(1000);
  }
  try {
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  } catch (error) {
    cleanupFailure = error;
  }
}
if (failure) throw failure;
if (cleanupFailure) throw cleanupFailure;

function waitForBrowserExit(timeoutMs) {
  if (browser.exitCode !== null) return Promise.resolve();
  return new Promise(resolve => {
    const finish = () => {
      clearTimeout(timer);
      browser.off("exit", finish);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    browser.once("exit", finish);
  });
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

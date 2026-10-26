/**
 * Browser smoke test for the P0 flow (acceptance criteria 1-9). Drives headless
 * Chrome over the DevTools protocol; no extra dependencies.
 *
 *   npm run build && npm start -- -p 3123     # in one terminal
 *   npm run smoke                             # in another
 *
 * Env: BASE_URL (default http://localhost:3123), CHROME_PATH, SMOKE_OUT (screenshot dir).
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const S = process.env.SMOKE_OUT ?? mkdtempSync(path.join(tmpdir(), "vfr-smoke-"));
mkdirSync(S, { recursive: true });
const BASE = process.env.BASE_URL ?? "http://localhost:3123";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
rmSync(`${S}/e2e-profile`, { recursive: true, force: true });
const chrome = spawn(CHROME, [
  "--headless=new", "--remote-debugging-port=9333", `--user-data-dir=${S}/e2e-profile`,
  "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars", "--window-size=1300,1000", "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 50 && !wsUrl; i++) {
  try {
    const list = await (await fetch("http://127.0.0.1:9333/json")).json();
    wsUrl = list.find((t) => t.type === "page")?.webSocketDebuggerUrl;
  } catch {}
  if (!wsUrl) await sleep(200);
}
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0;
const pending = new Map();
const logs = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === "Runtime.consoleAPICalled") logs.push(`${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(" ")}`);
  if (m.method === "Runtime.exceptionThrown") logs.push(`EXCEPTION [${curPath}]: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description);
  return r.result.result.value;
};
let curPath = "";
const go = async (path, wait = 2500) => { curPath = path; await send("Page.navigate", { url: BASE + path }); await sleep(wait); };
const shot = async (name) => { const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${S}/${name}.png`, Buffer.from(r.result.data, "base64")); };
const HELPERS = `
  const $ = (s) => document.querySelector(s);
  const btn = (t) => [...document.querySelectorAll('button,a')].find(b => b.textContent.trim().startsWith(t));
  const setVal = (el, v) => { const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value'); d.set.call(el, v); el.dispatchEvent(new Event('input',{bubbles:true})); };
  const wait = (ms) => new Promise(r => setTimeout(r, ms));`;
const results = [];
const check = (name, ok, detail = "") => { results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); console.log(results.at(-1)); };

await send("Page.enable");
await send("Runtime.enable");

// 1. Avatar editor: validation, units, save
await go("/avatar", 4000);
let r = await evalJs(`${HELPERS}
  setVal($('#m-heightCm'), '120'); await wait(200);
  const err = $('#m-heightCm-err')?.textContent; const saveDisabled = btn('Save avatar').disabled;
  setVal($('#m-heightCm'), '182'); await wait(200);
  setVal($('#m-hipsCm'), '104'); await wait(200);
  btn('Inches').click(); await wait(200);
  const inchHeight = $('#m-heightCm').value;
  btn('Save avatar').click(); await wait(400);
  return { err, saveDisabled, inchHeight, notice: document.querySelector('[role=status]')?.textContent, stored: localStorage.getItem('vfr.avatarProfiles.v1') };`);
check("range validation message", r.err === "Height must be between 140 and 210 cm.", r.err);
check("save disabled while invalid", r.saveDisabled === true);
check("cm→in conversion in form", r.inchHeight === "71.7", `182 cm shown as ${r.inchHeight} in`);
check("save confirmation", /saved/i.test(r.notice ?? ""), r.notice);
const stored = JSON.parse(r.stored ?? "[]")[0];
check("persisted canonical cm + unit pref", stored?.measurements.heightCm === 182 && stored?.measurements.hipsCm === 104 && stored?.unitPreference === "in", JSON.stringify(stored?.measurements));
await shot("e2e-avatar-saved");

// 2. Reload: profile restored; edit then reset
await go("/avatar", 4000);
r = await evalJs(`${HELPERS}
  const before = $("#m-heightCm").value;
  setVal($('#m-heightCm'), '60'); await wait(200);
  btn('Discard changes').click(); await wait(200);
  return { before, after: $('#m-heightCm').value, unitPressed: btn('Inches').getAttribute('aria-checked') };`);
check("reload restores saved avatar in inches", r.before === "71.7" && r.unitPressed === "true", `${r.before} in`);
check("discard changes resets unsaved edit", r.after === "71.7", r.after);

// 3. Try-on: saved avatar used, size switching preserves avatar
await go("/try-on/demo-a-line-skirt?variant=terracotta&size=S", 5000);
r = await evalJs(`${HELPERS} return { sel: $('.selection').textContent, defaultNotice: !!document.body.textContent.includes('default avatar'), you: [...document.querySelectorAll('tbody tr')].map(t=>t.textContent) };`);
check("try-on shows selected variant/size", r.sel.includes("Terracotta") && r.sel.includes("S"), r.sel);
check("try-on uses saved avatar", !r.defaultNotice && r.you.some((t) => t.includes("Hip") && t.includes("40.9 in")), r.you.join(" | "));
await shot("e2e-skirt-s");
r = await evalJs(`${HELPERS} [...document.querySelectorAll('.sizes button')].find(b=>b.textContent==='M').click(); await wait(2500);
  return { url: location.search, sel: $('.selection').textContent, lDisabled: [...document.querySelectorAll('.sizes button')].find(b=>b.textContent==='L').disabled, notes: $('.size-notes').textContent };`);
check("size switch updates URL + label", r.url.includes("size=M") && r.sel.includes("M"), r.url);
check("unapproved size L disabled with reason", r.lDisabled && r.notes.includes("quality review"), r.notes);
await shot("e2e-skirt-m");
r = await evalJs(`${HELPERS} btn('Side').click(); await wait(800); return true;`);
await shot("e2e-skirt-m-side");

// 4. Deep link to unavailable size falls back
await go("/try-on/demo-relaxed-tee?variant=ecru&size=XL", 4000);
r = await evalJs(`${HELPERS} return { sel: $('.selection').textContent, note: [...document.querySelectorAll('[role=status]')].map(n=>n.textContent).join(' ') };`);
check("deep link to XL falls back with explanation", r.sel.includes("XS") && /XL can.t be shown/.test(r.note), `${r.sel} / ${r.note}`);

// 5. Broken asset fallback
await go("/try-on/qa-missing-file-tee?variant=grey&size=M", 6000);
r = await evalJs(`${HELPERS} return [...document.querySelectorAll('[role=alert]')].map(n=>n.textContent).join(' ');`);
check("missing asset shows fallback, no crash", r.includes("couldn't load the 3D garment"), r.slice(0, 80));
await shot("e2e-broken-asset");

// 6. Catalog hides fixtures by default
await go("/catalog", 2000);
r = await evalJs(`${HELPERS} return [...document.querySelectorAll('.product-card h2')].map(h=>h.textContent);`);
check("catalog lists only shopper products", JSON.stringify(r) === JSON.stringify(["Demo Relaxed Tee", "Demo A-line Midi Skirt"]), r.join(", "));

// 7. Delete avatar
await go("/avatar", 4000);
r = await evalJs(`${HELPERS} btn('Delete avatar').click(); await wait(200); btn('Yes, delete').click(); await wait(400);
  return { stored: localStorage.getItem('vfr.avatarProfiles.v1'), height: $('#m-heightCm').value, text: document.body.textContent.includes('Not saved yet') };`);
check("delete removes stored measurements", r.stored === null && r.text, `height now ${r.height}`);

// 8. Mobile layout
await send("Emulation.setDeviceMetricsOverride", { width: 400, height: 860, deviceScaleFactor: 2, mobile: true });
await go("/try-on/demo-relaxed-tee?variant=ecru&size=M", 5000);
r = await evalJs(`return document.documentElement.scrollWidth <= window.innerWidth;`);
check("no horizontal scroll at 400px", r === true);
await shot("e2e-mobile");

console.log(`\nScreenshots: ${S}`);
const bad = logs.filter((l) => /^(error|EXCEPTION)/.test(l) && !l.includes("intentionally-missing") && !/Failed to load resource/.test(l));
console.log(`\nconsole errors (excluding the intentional 404): ${bad.length}`);
bad.slice(0, 10).forEach((l) => console.log("  " + l.slice(0, 300)));
ws.close();
chrome.kill();
process.exit(results.some((x) => x.startsWith("FAIL")) ? 1 : 0);

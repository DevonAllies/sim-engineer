// Setup Engineer - Electron main process
// Starts the telemetry bridge, shows the main window (setup tool) and the see-through overlays.
const { app, BrowserWindow, Tray, Menu, ipcMain, globalShortcut, screen, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const updater = require('./updater');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');   // the team radio may speak without a click

const RES = app.isPackaged ? process.resourcesPath : __dirname;
const BRIDGE = path.join(RES, 'bridge', 'se-bridge.exe');
const WEB = path.join(RES, 'web');
const ICON = app.isPackaged ? path.join(process.resourcesPath, 'icon.ico') : path.join(__dirname, 'build', 'icon.ico');
const EDIT_KEY = 'CommandOrControl+Alt+O';

// ---------- overlay catalogue ----------
const OVERLAYS = {
  engineer: { title: 'Bono the Engineer', desc: 'Your race engineer (named after Peter "Bono" Bonnington). While driving: live understeer / neutral / oversteer, a verdict after every corner (too fast in, too slow in, good), time lost per corner to the fastest car in your class, and live brake bias / TC / ABS suggestions. In the pits or garage: stint report with tyre temps, pressures and tread.', url: 'overlays/engineer.html', w: 340, h: 206 },
  fuel: { title: 'Hanna', desc: 'Fuel and strategy (named after Hannah Schmitz). Fuel per lap, laps of fuel left, pit stops needed for the race and what to add, and the fuel-per-lap targets to stretch one more lap or save a whole stop, and whether the tyres can do a double stint.', url: 'overlays/fuel.html', w: 320, h: 250 },
  gp: { title: 'GP', desc: 'Your driver coach (named after Gianpiero "GP" Lambiase). After every corner: what to change in your driving, from your brake, throttle and steering against your best lap (braking point and pressure, trail braking, coasting, throttle pick-up, lifts, steering corrections). Each corner shows your time against the fastest driver in your class this session, and where you lose it (entry, mid or exit). A focus corner builds up over laps and sessions. The full breakdown (iRacing\'s sectors, entry / mid / exit times and speeds) is in the app\'s GP window.', url: 'overlays/gp.html', w: 380, h: 150 },
  garage: { title: 'Garage', desc: 'The changes to make, laid out like the car (LF RF / LR RR). Shows in the garage and pit stall, hidden while you drive. Handy on a single screen.', url: 'overlays/garage.html', w: 440, h: 320 },
  testprog: { title: 'Test step', desc: 'The test programme step to set up: what to change from the baseline, a live check that the garage matches, and the baseline values. Shows in the garage and pit stall, hidden while you drive.', url: 'overlays/testprog.html', w: 400, h: 460 },
};

// ---------- settings (userData/config.json) ----------
const CFG_FILE = path.join(app.getPath('userData'), 'config.json');
const LOGOS = path.join(app.getPath('userData'), 'logos');   // your own car-logo PNGs (e.g. acura.png)
let cfg = { overlays: {}, settings: { hideMainOnClose: true } };
try { cfg = Object.assign(cfg, JSON.parse(fs.readFileSync(CFG_FILE, 'utf8'))); } catch (e) {}
delete cfg.settings.frontInGarage;   // the main app is never forced on top; only the overlays are (user's choice in 0.7.2)
const FONTS = ['Segoe UI', 'Bahnschrift', 'Arial', 'Verdana', 'Tahoma', 'Calibri', 'Trebuchet MS', 'Consolas'];
let saveTimer = null;
function saveCfg() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { fs.mkdirSync(path.dirname(CFG_FILE), { recursive: true }); fs.writeFileSync(CFG_FILE, JSON.stringify(cfg, null, 2)); } catch (e) {} }, 300); }
function ovCfg(id) {
  if (!cfg.overlays[id]) {
    const d = OVERLAYS[id], wa = screen.getPrimaryDisplay().workArea;
    const i = Object.keys(OVERLAYS).indexOf(id);   // stack new overlays so they don't start on top of each other
    cfg.overlays[id] = { enabled: id === 'garage',   // the garage list is on by default (single-screen users need it)
      x: wa.x + wa.width - d.w - 40, y: wa.y + Math.round(wa.height * 0.12) + i * 380, w: d.w, h: d.h, opacity: 1, units: 'kPa' };
    saveCfg();
  }
  const c = cfg.overlays[id];
  // text size is now separate from the window size; older versions scaled both together
  if (!(c.text > 0)) c.text = c.scale || (c.w && OVERLAYS[id] ? Math.round(c.w / OVERLAYS[id].w * 100) / 100 : 1);
  if (!c.font) c.font = 'Segoe UI';
  return c;
}
const styleOf = (c) => ({ text: Math.max(0.6, Math.min(2.5, +c.text || 1)), font: FONTS.includes(c.font) ? c.font : 'Segoe UI' });

// ---------- bridge ----------
let bridge = null, port = 0;
function startBridge() {
  return new Promise((resolve, reject) => {
    try { fs.mkdirSync(LOGOS, { recursive: true }); } catch (e) {}
    bridge = spawn(BRIDGE, ['--port', '8766', '--web', WEB, '--parent', String(process.pid), '--logos', LOGOS], { windowsHide: true });
    let buf = '';
    const t = setTimeout(() => reject(new Error('bridge did not start')), 10000);
    bridge.stdout.on('data', (d) => {
      buf += d.toString();
      const m = buf.match(/PORT (\d+)/); if (m && !port) { port = +m[1]; clearTimeout(t); resolve(port); }
    });
    bridge.on('exit', () => { bridge = null; });
    bridge.on('error', reject);
  });
}
const url = (p = '') => `http://localhost:${port}/${p}`;

// ---------- main window ----------
let main = null, tray = null, editMode = false, editKey = '';
function createMain() {
  main = new BrowserWindow({
    width: 1320, height: 920, minWidth: 900, minHeight: 600, title: 'Setup Engineer', icon: ICON,
    backgroundColor: '#0f1115', autoHideMenuBar: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  main.loadURL(url());
  main.once('ready-to-show', () => main.show());
  main.on('close', (e) => { if (!app.isQuitting && cfg.settings.hideMainOnClose) { e.preventDefault(); main.hide(); } });
  main.webContents.setWindowOpenHandler(({ url: u }) => { shell.openExternal(u); return { action: 'deny' }; });
}
function showMain() { if (!main) createMain(); main.show(); main.focus(); }

// ---------- overlays ----------
const wins = {};
// an overlay always fits on a screen: one dragged past the edge (or left on a monitor that's gone) is pulled back in
function onScreen(c) {
  try { const wa = screen.getDisplayMatching({ x: c.x | 0, y: c.y | 0, width: c.w | 0, height: c.h | 0 }).workArea;
    const w = Math.min(c.w, wa.width), h = Math.min(c.h, wa.height);
    const x = Math.max(wa.x, Math.min(c.x, wa.x + wa.width - w)), y = Math.max(wa.y, Math.min(c.y, wa.y + wa.height - h));
    if (x !== c.x || y !== c.y || w !== c.w || h !== c.h) { Object.assign(c, { x, y, w, h }); return true; } } catch (e) {}
  return false; }
function openOverlay(id) {
  if (wins[id]) return;
  const c = ovCfg(id), d = OVERLAYS[id]; if (onScreen(c)) saveCfg();
  const w = new BrowserWindow({
    x: c.x, y: c.y, width: c.w, height: c.h, transparent: true, frame: false, resizable: true, movable: true,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, focusable: editMode, show: false, minimizable: false, maximizable: false,
    backgroundColor: '#00000000', title: `Setup Engineer ${d.title}`,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, backgroundThrottling: false },
  });
  w.setAlwaysOnTop(true, 'screen-saver');
  w.setMinimumSize(120, 60);   // free resize: any width and height
  w.setIgnoreMouseEvents(!editMode);
  w.setOpacity(c.opacity || 1);
  w.loadURL(url(d.url + '?id=' + id + '&units=' + encodeURIComponent(c.units || 'kPa') + '&numbers=' + (c.numbers ? 1 : 0)));
  w.webContents.on('did-finish-load', () => w.webContents.send('overlay-style', styleOf(c)));
  w.once('ready-to-show', () => { if (c.enabled) w.showInactive(); w.webContents.send('edit-mode', editMode); w.webContents.send('overlay-style', styleOf(c)); });
  const remember = () => { const b = w.getBounds(); Object.assign(c, { x: b.x, y: b.y, w: b.width, h: b.height }); saveCfg(); };
  w.on('moved', remember); w.on('resized', remember);
  w.on('closed', () => { delete wins[id]; });
  wins[id] = w;
}
function closeOverlay(id) { if (wins[id]) { wins[id].destroy(); delete wins[id]; } }
// An overlay runs when it's shown, or when its character's voice is on (then it runs hidden, just to talk)
function applyOverlays() {
  for (const id of Object.keys(OVERLAYS)) {
    const c = ovCfg(id), need = c.enabled || voiceOn(id);
    if (!need) { closeOverlay(id); continue; }
    openOverlay(id);
    const w = wins[id]; if (w && !w.webContents.isLoading()) { if (c.enabled) { if (!w.isVisible()) w.showInactive(); } else w.hide(); }
    if (w) { const b = w.getBounds(), cc = { x: b.x, y: b.y, w: b.width, h: b.height }; if (onScreen(cc)) w.setBounds({ x: cc.x, y: cc.y, width: cc.w, height: cc.h }); }
  }
}

// ---------- radio: Bono, Hanna and GP talk to you (Windows voices), one at a time ----------
const VOICE_OF = { engineer: 'bono', fuel: 'hanna', gp: 'gp' };
function radioCfg() {
  const r = cfg.settings.radio = cfg.settings.radio || {};
  // voices are off unless you switch them on (Settings → Team radio); once from 0.15.10 an existing install is switched off too
  if (r.on === undefined || !r.offDefault) { r.on = false; r.offDefault = 1; saveCfg(); } if (r.quiet === undefined) r.quiet = false; if (r.beep === undefined) r.beep = true; if (!(r.rate > 0)) r.rate = 1.05;
  r.who = r.who || {};
  for (const [k, v] of Object.entries({ bono: 'George', hanna: 'Hazel', gp: 'Susan' })) r.who[k] = Object.assign({ on: true, voice: v, vol: 1 }, r.who[k] || {});
  return r;
}
function voiceOn(id) { const who = VOICE_OF[id], r = radioCfg(); return !!(who && r.on && r.who[who] && r.who[who].on); }
let radioWin = null;
function createRadio() {
  radioWin = new BrowserWindow({ show: false, width: 200, height: 100, skipTaskbar: true, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, backgroundThrottling: false } });
  radioWin.loadURL(url('overlays/radio.html'));
  radioWin.webContents.on('did-finish-load', () => radioWin.webContents.send('radio-settings', radioCfg()));
  radioWin.on('closed', () => { radioWin = null; });
}
ipcMain.on('radio:say', (_e, m) => { if (radioWin && m && m.text) radioWin.webContents.send('radio', m); });
ipcMain.handle('radio:get', () => radioCfg());
ipcMain.handle('radio:set', (_e, patch) => {
  const r = radioCfg();
  for (const [k, v] of Object.entries(patch || {})) { if (k === 'who') { for (const [w, p] of Object.entries(v)) Object.assign(r.who[w], p); } else r[k] = v; }
  saveCfg(); if (radioWin) radioWin.webContents.send('radio-settings', r); applyOverlays(); return r;
});
function setEditMode(on) {
  editMode = on;
  for (const w of Object.values(wins)) { w.setIgnoreMouseEvents(!on); w.setFocusable(on); w.webContents.send('edit-mode', on); }
  if (main) main.webContents.send('edit-mode', on);
  buildTrayMenu();
}

// ---------- tray ----------
function buildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Setup Engineer', click: showMain },
    { label: (editMode ? 'Lock overlays' : 'Move / resize overlays') + (editKey ? `   (${editKey})` : ''), click: () => setEditMode(!editMode) },
    { type: 'separator' },
    ...Object.entries(OVERLAYS).map(([id, d]) => ({ label: d.title, type: 'checkbox', checked: !!ovCfg(id).enabled,
      click: (mi) => { ovCfg(id).enabled = mi.checked; saveCfg(); applyOverlays(); if (main) main.webContents.send('overlays-changed'); } })),
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
}

// ---------- IPC ----------
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('overlay:list', () => Object.entries(OVERLAYS).map(([id, d]) => ({ id, ...d, dw: d.w, dh: d.h, ...ovCfg(id), editMode, editKey, fonts: FONTS })));
ipcMain.handle('overlay:set', (_e, id, patch) => {
  if (!OVERLAYS[id]) return;
  const c = ovCfg(id); Object.assign(c, patch); saveCfg();
  if ('enabled' in patch) applyOverlays();
  if (wins[id] && 'opacity' in patch) wins[id].setOpacity(c.opacity);
  if (wins[id] && ('text' in patch || 'font' in patch)) wins[id].webContents.send('overlay-style', styleOf(c));
  if ('fit' in patch && wins[id]) {   // resize the window to the text size (keeps the original shape)
    const d = OVERLAYS[id], s = styleOf(c).text, b = wins[id].getBounds();
    c.w = Math.round(d.w * s); c.h = Math.round(d.h * s); delete c.fit; saveCfg();
    wins[id].setBounds({ x: b.x, y: b.y, width: c.w, height: c.h });
  }
  if (wins[id] && ('units' in patch || 'numbers' in patch)) { closeOverlay(id); openOverlay(id); }
  buildTrayMenu();
  return c;
});
ipcMain.handle('overlay:reset', (_e, id) => { delete cfg.overlays[id]; const en = true; ovCfg(id).enabled = en; saveCfg(); closeOverlay(id); applyOverlays(); });
ipcMain.handle('overlay:edit', (_e, on) => { setEditMode(!!on); return editMode; });
ipcMain.handle('settings:get', (_e, k) => cfg.settings[k]);
ipcMain.handle('settings:set', (_e, k, v) => { cfg.settings[k] = v; saveCfg(); return v; });
ipcMain.handle('logos:open', () => { try { fs.mkdirSync(LOGOS, { recursive: true }); } catch (e) {} return shell.openPath(LOGOS); });
// ---------- your data: a dedicated folder (Documents\Setup Engineer by default, any drive in Settings) ----------
//   database\setup-engineer.db   every stint, lap, setup, best-lap reference, shared memory and car profile (SQLite)
//   csv\<car>\<track>.csv        rewritten in the background after each stint: one row per lap (for Excel)
//   reports\                     the PDF reports        manuals\  car manuals
// The program itself lives in Program Files; nothing of yours is kept there, so updates never touch it.
// Old seasons are kept but ignored by default: iRacing updates cars and tracks each season (12 weeks, from March, June, September and December).
const { Store } = require('./db');
const DATA_DIR = () => cfg.settings.dataDir || path.join(app.getPath('documents'), 'Setup Engineer');
const OLD_LEARN = () => path.join(cfg.settings.learnDir || app.getPath('userData'), 'learning.json');   // versions before 0.12
let store = null, LEARN_FILE = '';
let learn = null, learnTimer = null;
const csvTouched = new Set();
async function initData() {
  store = new Store(DATA_DIR()); LEARN_FILE = store.file;
  const had = await store.open();
  learn = store.load();
  if (!had) {   // first start on 0.12: bring over learning.json once (kept where it was, as a backup)
    try { const old = JSON.parse(fs.readFileSync(OLD_LEARN(), 'utf8')); learn.stints = old.stints || {}; learn.refs = old.refs || {}; learn.kv = old.kv || {};
      for (const r of Object.values(learn.stints)) csvTouched.add(r.car + '|' + r.track); } catch (e) {}
    learnWrite();
  }
  try { if (fixCutLaps(learnLoad())) learnWrite(); } catch (e) {}
}
// one-time repair (0.15.5): older versions could take a lap with time off track as the stint's best (a cut chicane at Spa gave a
// 2:15.4). From the stored laps: the best is the fastest lap that stayed on track, laps that went off AND came out clearly quicker
// are marked as cuts and dropped, and a best-lap reference faster than any corrected stint is removed (the next stint replaces it)
function fixCutLaps(L) {
  L.kv = L.kv || {}; const mig = L.kv.mig = L.kv.mig || {}; if (mig.cut1) return false;
  const med = a => { const s = a.slice().sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
  let fixed = 0;
  for (const [id, r] of Object.entries(L.stints)) { const rows = L.laps[id]; if (!Array.isArray(rows) || !rows.length) continue;
    const pool = rows.filter(x => x.full !== false && Number.isFinite(x.time)), on = pool.filter(x => !(x.offTrack_s > 0.05)), m = med(on.map(x => x.time));
    let changed = false;
    for (const x of pool) if (x.offTrack_s > 0.05 && Number.isFinite(m) && x.time < m - 0.8 && !x.cut) { x.cut = true; x.used = false; x.clean = false; changed = true; }
    // fastest uncut lap at your pace; the best is the fastest of those that stayed on track (within 3%), never a slow out lap
    const uncut = pool.filter(x => !x.cut && (x.used || x.best)), fastU = uncut.reduce((a, x) => !a || x.time < a.time ? x : a, null);
    const near = fastU ? on.filter(x => !x.cut && (x.used || x.best) && x.time <= fastU.time * 1.03) : [];
    const b = near.length ? near.reduce((a, x) => !a || x.time < a.time ? x : a, null) : fastU;
    if (b && Number.isFinite(r.best) && Math.abs(b.time - r.best) > 0.0005 && b.time > r.best) { r.bestCut = r.best; r.best = +b.time.toFixed(3); for (const x of rows) x.best = x === b; changed = true; }
    if (changed) { const used = rows.filter(x => x.used && !x.cut).map(x => x.time); if (used.length) { r.med = +med(used).toFixed(3); r.laps = used.length; }
      L.stints[id] = r; csvTouched.add(r.car + '|' + r.track); fixed++; } }
  // best-lap references: one quicker than every stint you have there came from a cut lap
  for (const [k, ref] of Object.entries(L.refs)) { const [c, t] = k.split('|'); const bs = Object.values(L.stints).filter(r => r.car === c && String(r.track) === t && Number.isFinite(r.best)).map(r => r.best);
    if (bs.length && ref && ref.best < Math.min(...bs) - 0.05) { delete L.refs[k]; fixed++; } }
  mig.cut1 = Date.now(); console.log('fixCutLaps:', fixed); return true;
}
function seasonStart(t) {   // approx. iRacing season start: 2nd Tuesday of Mar / Jun / Sep / Dec
  let best = 0; const d = new Date(t);
  for (const y of [d.getFullYear() - 1, d.getFullYear()]) for (const m of [2, 5, 8, 11]) {
    const first = new Date(y, m, 1), tue = 1 + ((2 - first.getDay() + 7) % 7) + 7, s = new Date(y, m, tue).getTime();
    if (s <= t && s > best) best = s; }
  return best;
}
function seasonName(s) { const d = new Date(s), m = d.getMonth(); return m === 11 ? `${d.getFullYear() + 1} Season 1` : `${d.getFullYear()} Season ${[, , 2, , , 3, , , 4][m]}`; }
function learnCutoff() {   // stints before this date are ignored when learning
  const sc = cfg.settings.learnScope || 'season', now = Date.now();
  let c = sc === 'all' ? 0 : sc === 'two' ? seasonStart(seasonStart(now) - 864e5) : seasonStart(now);
  if (cfg.settings.learnFresh > c) c = cfg.settings.learnFresh;   // "start fresh from today"
  return c;
}
ipcMain.handle('learn:info', () => { let size = 0; try { size = fs.statSync(store.file).size; } catch (e) {}
  const s = learnLoad().stints; return { file: LEARN_FILE, size, cutoff: learnCutoff(), scope: cfg.settings.learnScope || 'season', fresh: cfg.settings.learnFresh || 0,
    season: seasonName(seasonStart(Date.now())), total: Object.keys(s).length, old: Object.values(s).filter(r => r.date < learnCutoff()).length }; });
ipcMain.handle('learn:scope', (_e, scope, fresh) => { if (scope) cfg.settings.learnScope = scope; if (fresh !== undefined) cfg.settings.learnFresh = fresh; saveCfg(); return learnCutoff(); });
ipcMain.handle('learn:prune', () => { const L = learnLoad(), c = learnCutoff(); let n = 0;
  for (const [k, r] of Object.entries(L.stints)) if (!(r.date >= c)) { delete L.stints[k]; n++; }
  for (const [k, r] of Object.entries(L.refs)) if (!(r.date >= c)) delete L.refs[k];
  learnSave(); return n; });
// move the whole data folder (database, CSVs, reports, manuals) to another place / drive
ipcMain.handle('learn:chooseDir', async () => {
  const { dialog } = require('electron');
  const r = await dialog.showOpenDialog(main, { title: 'Where should Setup Engineer keep your data (database, CSVs, reports)?', properties: ['openDirectory', 'createDirectory'], defaultPath: store.dir });
  if (r.canceled || !r.filePaths[0]) return null;
  const nd = path.basename(r.filePaths[0]).toLowerCase() === 'setup engineer' ? r.filePaths[0] : path.join(r.filePaths[0], 'Setup Engineer');
  if (path.resolve(nd) === path.resolve(store.dir)) return store.file;
  if (learnTimer) { clearTimeout(learnTimer); learnTimer = null; }
  const old = store.dir;
  try { fs.mkdirSync(nd, { recursive: true }); for (const sub of ['csv', 'reports', 'manuals']) { try { fs.cpSync(path.join(old, sub), path.join(nd, sub), { recursive: true, force: false, errorOnExist: false }); } catch (e) {} } } catch (e) { return null; }
  store.setDir(nd); LEARN_FILE = store.file;
  // a database already there (another PC, an earlier choice): merge it in, newest wins per stint
  try { const other = new Store(nd); await other.open(); if (other.exists()) { const o = other.load();
      learn.stints = Object.assign({}, o.stints, learn.stints); learn.laps = Object.assign({}, o.laps, learn.laps);
      for (const [k, v] of Object.entries(o.refs || {})) if (!learn.refs[k] || v.best < learn.refs[k].best) learn.refs[k] = v; } } catch (e) {}
  learnWrite();
  cfg.settings.dataDir = nd; saveCfg();
  return store.file;
});
function learnLoad() { if (!learn) learn = { v: 1, stints: {}, refs: {}, kv: {}, laps: {} }; learn.stints = learn.stints || {}; learn.refs = learn.refs || {}; learn.laps = learn.laps || {};
  learn.hist = learn.hist || { stints: {}, refs: {}, kv: {} }; return learn; }
// ---------- historic: data from an older iRacing build (cars / tracks updated) is kept but never used ----------
// scope: car + track, a whole car (every track), or everything. Moves the stints, the best-lap references, and what Bono / GP /
// the aero map remembered for them. Undo moves them back.
const inScope = (car, track) => (c, t) => (!car || c === car) && (!track || String(t) === String(track));
ipcMain.handle('learn:historic', (_e, car, track, undo) => {
  const L = learnLoad(), H = L.hist, ok = inScope(car, track), now = Date.now(); let n = 0;
  const [from, to] = undo ? [H, L] : [L, H];
  for (const [id, r] of Object.entries(from.stints)) if (ok(r.car, r.track)) { const x = Object.assign({}, r); if (undo) delete x.historic; else x.historic = now; to.stints[id] = x; delete from.stints[id]; n++; csvTouched.add(r.car + '|' + r.track); }
  for (const [k, r] of Object.entries(from.refs)) { const [c, t] = k.split('|'); if (ok(c, t)) { to.refs[k] = r; delete from.refs[k]; } }
  for (const [ns, o] of Object.entries(from.kv || {})) for (const [k, v] of Object.entries(o || {})) {
    const p = k.split('|'), c = ns === 'aeromap' ? k : ns === 'bono' ? null : p[0], t = ns === 'aeromap' ? null : p[1];   // the steering ratio (bono) doesn't change with a build
    const trackOk = ns === 'aeromap' ? (undo || !track) : (!track || String(t) === String(track));   // the aero map is per car: it moves with the whole car (and comes back with any restore)
    if (c && (!car || c === car) && trackOk) { ((to.kv[ns] = to.kv[ns] || {}))[k] = v; delete o[k]; } }
  learnSave(); return n;
});
ipcMain.handle('learn:histInfo', () => { const H = learnLoad().hist, by = {};
  for (const r of Object.values(H.stints)) { const k = r.car + '|' + r.track; const x = by[k] || (by[k] = { car: r.car, carName: r.carName, track: r.track, trackName: r.trackName, n: 0, moved: 0 }); x.n++; x.moved = Math.max(x.moved, r.historic || 0); }
  return Object.values(by); });
// ---------- team folder (Google Drive for desktop, OneDrive, Dropbox: any synced folder) ----------
// <team folder>\laps\<car>\<track>\<driver> <date time> L<lap>.json.gz : one compressed lap each, written by whoever drove it
const teamDir = () => cfg.settings.teamDir || '';
const safeRel = (rel) => { const p = path.normalize(String(rel || '')).replace(/^([\\/])+/, ''); if (!p || p.includes('..') || path.isAbsolute(p)) throw new Error('bad path'); return p; };
ipcMain.handle('team:get', () => ({ dir: teamDir(), driver: cfg.settings.teamDriver || '', auto: cfg.settings.teamAuto !== false, eventDir: eventDir() }));
ipcMain.handle('team:set', (_e, patch) => { for (const k of ['teamDriver', 'teamAuto']) if (patch && patch[k] !== undefined) cfg.settings[k] = patch[k]; saveCfg(); return true; });
ipcMain.handle('team:choose', async () => {
  const { dialog } = require('electron');
  const r = await dialog.showOpenDialog(main, { title: 'Team folder (e.g. a shared Google Drive folder)', properties: ['openDirectory', 'createDirectory'], defaultPath: teamDir() || app.getPath('home') });
  if (r.canceled || !r.filePaths[0]) return null;
  cfg.settings.teamDir = r.filePaths[0]; saveCfg(); try { fs.mkdirSync(path.join(r.filePaths[0], 'laps'), { recursive: true }); } catch (e) {}
  return r.filePaths[0];
});
ipcMain.handle('team:write', (_e, rel, bytes) => { const d = teamDir(); if (!d) return null; const f = path.join(d, safeRel(rel)); fs.mkdirSync(path.dirname(f), { recursive: true });
  if (fs.existsSync(f)) return f; fs.writeFileSync(f + '.tmp', Buffer.from(bytes)); fs.renameSync(f + '.tmp', f); return f; });
// list files under the team folder: lap files (laps\<car>\<track>), stint summaries (stints\<driver>), or a teammate's raw .ibt recordings anywhere in it
ipcMain.handle('team:list', (_e, sub, ext) => { const d = teamDir(); if (!d && !(eventDir() && !ext)) return []; const e0 = ext || '.json.gz';
  const root = ext ? (sub ? path.join(d, safeRel(sub)) : d) : path.join(d, 'laps', sub ? safeRel(sub) : ''), out = [];
  const walk = (p, depth) => { let ents = []; try { ents = fs.readdirSync(p, { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) { const q = path.join(p, e.name); if (e.isDirectory() && depth < 4) walk(q, depth + 1); else if (e.isFile() && e.name.toLowerCase().endsWith(e0)) { let st = null; try { st = fs.statSync(q); } catch (x) {} out.push({ rel: path.relative(d, q), size: st ? st.size : 0, time: st ? st.mtimeMs : 0 }); } } };
  if (d) walk(root, 0);
  // the active team event's laps too (rel starts with @event/), so teammates' event laps work everywhere team laps do
  const ed = eventDir(); if (ed && !ext){ const r2 = path.join(ed, 'laps', sub ? safeRel(sub) : '');
    const walk2 = (p, depth) => { let ents = []; try { ents = fs.readdirSync(p, { withFileTypes: true }); } catch (e) { return; }
      for (const e of ents) { const q = path.join(p, e.name); if (e.isDirectory() && depth < 4) walk2(q, depth + 1); else if (e.isFile() && e.name.toLowerCase().endsWith(e0)) { let st = null; try { st = fs.statSync(q); } catch (x) {} out.push({ rel: '@event/' + path.relative(ed, q), size: st ? st.size : 0, time: st ? st.mtimeMs : 0 }); } } };
    walk2(r2, 0); }
  return out; });
ipcMain.handle('team:read', (_e, rel) => { if (String(rel).startsWith('@event/')) { const ed = eventDir(); if (!ed) return null; try { return fs.readFileSync(path.join(ed, safeRel(String(rel).slice(7)))); } catch (e) { return null; } }
  const d = teamDir(); if (!d) return null; try { return fs.readFileSync(path.join(d, safeRel(rel))); } catch (e) { return null; } });
// ---------- team events: one folder per race inside the team (hub) folder: anyone creates one, everyone else joins or not ----------
// <team folder>\events\<id>\event.json, laps\<car>\<track>\<driver> <when> <time>.json.gz, stints\<driver>\<id>.json.gz, plan.csv, fuel-map.csv
const safeId = (id) => String(id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
const evDirOf = (id) => { const d = teamDir(), s = safeId(id); return d && s ? path.join(d, 'events', s) : ''; };
const eventDir = () => { const id = cfg.settings.eventActive; const d = evDirOf(id); return d && fs.existsSync(path.join(d, 'event.json')) ? d : ''; };
// every event in the hub, with what you've said about each (joined / not this one) and which is active
ipcMain.handle('event:all', () => { const d = teamDir(); const out = []; if (!d) return { list: out, active: '' };
  let ents = []; try { ents = fs.readdirSync(path.join(d, 'events'), { withFileTypes: true }); } catch (e) {}
  for (const e of ents) if (e.isDirectory()) { try { const ev = JSON.parse(fs.readFileSync(path.join(d, 'events', e.name, 'event.json'), 'utf8')); if (ev && ev.id === e.name) out.push(ev); } catch (x) {} }
  return { list: out, joined: cfg.settings.eventJoined || [], declined: cfg.settings.eventDeclined || [], active: cfg.settings.eventActive || '' }; });
ipcMain.handle('event:create', (_e, ev) => { const d = teamDir(); if (!d || !ev) return null; const id = safeId(ev.id); if (!id) return null; const dir = path.join(d, 'events', id);
  fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'event.json'), JSON.stringify(Object.assign({}, ev, { id }), null, 1)); return id; });
ipcMain.handle('event:respond', (_e, id, how) => { id = safeId(id); const J = new Set(cfg.settings.eventJoined || []), D = new Set(cfg.settings.eventDeclined || []);
  J.delete(id); D.delete(id); if (how === 'join') { J.add(id); cfg.settings.eventActive = id; } else if (how === 'decline') { D.add(id); if (cfg.settings.eventActive === id) cfg.settings.eventActive = ''; }
  else if (how === 'active') { J.add(id); cfg.settings.eventActive = id; } else if (how === 'leave') { if (cfg.settings.eventActive === id) cfg.settings.eventActive = ''; }
  cfg.settings.eventJoined = [...J]; cfg.settings.eventDeclined = [...D]; saveCfg(); return true; });
ipcMain.handle('event:write', (_e, id, rel, bytes, overwrite) => { const d = evDirOf(id); if (!d || !fs.existsSync(d)) return null; const f = path.join(d, safeRel(rel)); fs.mkdirSync(path.dirname(f), { recursive: true });
  if (fs.existsSync(f) && !overwrite) return f; fs.writeFileSync(f + '.tmp', Buffer.from(bytes)); fs.renameSync(f + '.tmp', f); return f; });
ipcMain.handle('event:list', (_e, id, sub, ext) => { const d = evDirOf(id); if (!d) return []; const root = path.join(d, sub ? safeRel(sub) : ''), out = [], e0 = ext || '.json.gz';
  const walk = (p, depth) => { let ents = []; try { ents = fs.readdirSync(p, { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) { const q = path.join(p, e.name); if (e.isDirectory() && depth < 4) walk(q, depth + 1); else if (e.isFile() && e.name.toLowerCase().endsWith(e0)) { let st = null; try { st = fs.statSync(q); } catch (x) {} out.push({ rel: path.relative(d, q), size: st ? st.size : 0, time: st ? st.mtimeMs : 0 }); } } };
  walk(root, 0); return out; });
ipcMain.handle('event:read', (_e, id, rel) => { const d = evDirOf(id); if (!d) return null; try { return fs.readFileSync(path.join(d, safeRel(rel))); } catch (e) { return null; } });
// close an event: remove its lap traces, one driver's files, or the whole event
ipcMain.handle('event:remove', (_e, id, what) => { const d = evDirOf(id); if (!d) return false; const rm = p => { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) {} };
  if (what === 'laps') rm(path.join(d, 'laps'));
  else if (what === 'all') { rm(d); if (cfg.settings.eventActive === safeId(id)) { cfg.settings.eventActive = ''; saveCfg(); } }
  else if (String(what).startsWith('driver:')) { const who = String(what).slice(7); if (!who || /[\\/]|\.\./.test(who)) return false; rm(path.join(d, 'stints', who));
    const walk = (p) => { let ents = []; try { ents = fs.readdirSync(p, { withFileTypes: true }); } catch (e) { return; } for (const e of ents) { const q = path.join(p, e.name); if (e.isDirectory()) walk(q); else if (e.name.startsWith(who + ' ')) rm(q); } }; walk(path.join(d, 'laps')); }
  return true; });
ipcMain.handle('event:open', (_e, id) => { const d = evDirOf(id); if (d && fs.existsSync(d)) shell.openPath(d); return d; });
ipcMain.handle('team:info', () => { const d = teamDir(); if (!d) return null; try { return JSON.parse(fs.readFileSync(path.join(d, 'team.json'), 'utf8')); } catch (e) { return {}; } });
ipcMain.handle('team:saveInfo', (_e, info) => { const d = teamDir(); if (!d) return false; const o = { name: String((info && info.name) || ''), link: String((info && info.link) || '') };
  if (o.link && !/^https:\/\/drive\.google\.com\//.test(o.link)) return false; fs.writeFileSync(path.join(d, 'team.json'), JSON.stringify(o, null, 1)); return true; });
const safeName = (s) => String(s || '').replace(/[\\/:*?"<>|]/g, '-').replace(/\.\./g, '').trim().slice(0, 60);
ipcMain.handle('team:hello', (_e, name, version) => { const d = teamDir(), n = safeName(name); if (!d || !n) return false; const dir = path.join(d, 'members'); fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, n + '.json'); let o = {}; try { o = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {}
  o = Object.assign(o, { name: n, version: String(version || ''), seen: Date.now(), since: o.since || Date.now() }); fs.writeFileSync(f, JSON.stringify(o, null, 1)); return true; });
ipcMain.handle('team:members', () => { const d = teamDir(); if (!d) return []; const dir = path.join(d, 'members'); let L = []; try { L = fs.readdirSync(dir).filter(x => x.endsWith('.json')); } catch (e) {}
  return L.map(x => { try { return JSON.parse(fs.readFileSync(path.join(dir, x), 'utf8')); } catch (e) { return null; } }).filter(Boolean); });
ipcMain.handle('event:reply', (_e, id, name, how, avail) => { const d = evDirOf(id), n = safeName(name); if (!d || !n || !fs.existsSync(d)) return false; const dir = path.join(d, 'replies'); fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, n + '.json'); let o = {}; try { o = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {}
  if (how) o.reply = String(how); if (avail) o.avail = { stints: String(avail.stints || '').replace(/[^0-9,\- ]/g, '').slice(0, 40), max: Math.max(0, Math.min(99, +avail.max || 0)) };
  fs.writeFileSync(f, JSON.stringify(Object.assign(o, { name: n, at: Date.now() }))); return true; });
ipcMain.handle('event:replies', (_e, id) => { const d = evDirOf(id); if (!d) return []; const dir = path.join(d, 'replies'); let L = []; try { L = fs.readdirSync(dir).filter(x => x.endsWith('.json')); } catch (e) {}
  return L.map(x => { try { return JSON.parse(fs.readFileSync(path.join(dir, x), 'utf8')); } catch (e) { return null; } }).filter(Boolean); });
// the owner makes the team folder: pick where (your Google Drive), the app makes "Setup Engineer team" in it and uses it
ipcMain.handle('team:create', async (_e, owner) => { const { dialog } = require('electron');
  const r = await dialog.showOpenDialog(main, { title: 'Where to make the team folder (pick your Google Drive, e.g. G:\\My Drive)', properties: ['openDirectory'], defaultPath: app.getPath('home') });
  if (r.canceled || !r.filePaths[0]) return null; let d = r.filePaths[0];
  if (path.basename(d).toLowerCase() !== 'setup engineer team') d = path.join(d, 'Setup Engineer team');
  fs.mkdirSync(path.join(d, 'events'), { recursive: true }); fs.mkdirSync(path.join(d, 'members'), { recursive: true });
  const tj = path.join(d, 'team.json'); if (!fs.existsSync(tj)) fs.writeFileSync(tj, JSON.stringify({ owner: String(owner || ''), created: Date.now(), link: '' }, null, 1));
  cfg.settings.teamDir = d; saveCfg(); return d; });
ipcMain.handle('team:openLink', (_e, url) => { const u = String(url || ''); if (/^https:\/\/drive\.google\.com\//.test(u)) { shell.openExternal(u); return true; } return false; });
ipcMain.handle('team:open', () => { if (teamDir()) shell.openPath(teamDir()); return teamDir(); });
// export for your own analysis: a folder with a copy of the database, flat CSVs (stints, laps, setups) and a README with the columns
ipcMain.handle('data:export', async () => {
  const { dialog } = require('electron');
  const r = await dialog.showOpenDialog(main, { title: 'Export your data to…', properties: ['openDirectory', 'createDirectory'], defaultPath: app.getPath('documents') });
  if (r.canceled || !r.filePaths[0]) return null;
  if (learnTimer) { clearTimeout(learnTimer); learnTimer = null; } learnWrite();   // everything on disk first
  const day = new Date(), stamp = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')} ${String(day.getHours()).padStart(2, '0')}${String(day.getMinutes()).padStart(2, '0')}`;
  const out = path.join(r.filePaths[0], `Setup Engineer export ${stamp}`); fs.mkdirSync(out, { recursive: true });
  const L = learnLoad(), q = v => { if (v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v))) return ''; const s = typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = (file, cols, rows) => fs.writeFileSync(path.join(out, file), '﻿' + [cols.join(','), ...rows.map(r => cols.map(c => q(r[c])).join(','))].join('\r\n'));
  const iso = t => t ? new Date(t).toISOString() : '';
  // stints: one row each, the main numbers as columns (the full record is in the database's json column)
  const S = Object.values(L.stints).sort((a, b) => (a.date || 0) - (b.date || 0)).map(s => { const b = s.bal || {}, a = s.aero || {}, p = s.prof || {}, f = s.ffb || {}, d = s.drag || {}, t = s.tyreT || {};
    return { stint_id: s.id, car: s.car, car_name: s.carName, track: s.track, track_name: s.trackName, date: iso(s.date), session: s.session, setup_name: s.setupName, sim_hour: s.tod,
      clean_laps: s.laps, best_s: s.best, typical_s: s.med, spread_s: s.sd, track_temp_c: s.trackT, air_temp_c: s.airT, wet: s.wet ? 1 : 0, fuel_per_lap_l: s.fuel,
      bal_entry_deg: b.entry, bal_mid_deg: b.mid, bal_exit_deg: b.exit, bal_slow_deg: b.slow, bal_fast_deg: b.fast, slides_per_lap: s.slides, lap_time_drop_s_per_lap: s.deg,
      tyre_front_c: t.F, tyre_rear_c: t.R, start_press_front_kpa: t.sPF, start_press_rear_kpa: t.sPR, hot_press_front_kpa: t.pF, wear_front_pct_per_lap: s.wearF, wear_rear_pct_per_lap: s.wearR,
      wing: a.w, static_rh_front_mm: a.sF, static_rh_rear_mm: a.sR, rh_at_speed_front_mm: a.fA, rh_at_speed_rear_mm: a.rA, rh_speed_kmh: a.vF, downforce_n: a.df, front_downforce_pct: a.fpct,
      spring_front_n_mm: a.kF, spring_rear_n_mm: a.kR, top_speed_kmh: p.vmax != null ? p.vmax : a.vmax, mass_kg: s.mass, drag_k_n_per_ms2: d.K, wheel_power_w: d.P,
      track_full_throttle: p.full, track_slow_corners: p.slowN, track_fast_corners: p.fastN, track_roughness: p.rough != null ? p.rough : (s.susp || {}).rough,
      ffb_max_nm: f.maxNm, ffb_clipping: f.clip, wind_on_lock_s: f.tWind, corrections_per_corner: f.corr }; });
  if (S.length) csv('stints.csv', Object.keys(S[0]), S);
  // laps: every lap of every stint
  const lapRows = []; for (const [id, rows] of Object.entries(L.laps || {})) for (const x of rows || []) lapRows.push(Object.assign({ stint_id: id }, x));
  const lapCols = ['stint_id', ...[...new Set(lapRows.flatMap(x => Object.keys(x)))].filter(k => k !== 'stint_id')];
  if (lapRows.length) csv('laps.csv', lapCols, lapRows);
  // setups: long format (one row per stint and setting)
  const set = []; for (const s of Object.values(L.stints)) for (const [k, v] of Object.entries(s.setup || {})) set.push({ stint_id: s.id, setting: k, value: v, number: parseFloat(String(v).replace(/^[^-\d]*/, '')) });
  if (set.length) csv('setups.csv', ['stint_id', 'setting', 'value', 'number'], set);
  try { if (store && store.file && fs.existsSync(store.file)) fs.copyFileSync(store.file, path.join(out, 'setup-engineer.db')); } catch (e) {}
  fs.writeFileSync(path.join(out, 'README.md'), `# Setup Engineer data export (${stamp})

Exported from Setup Engineer ${app.getVersion()}. All of it comes from your own iRacing telemetry.

- **stints.csv**: one row per stint (${S.length}). Joins to the other files on \`stint_id\` (car|track|best lap).
- **laps.csv**: every lap (${lapRows.length}). \`clean\` = full lap without going off track; \`used\` = used in the analysis; \`cut\` = went off track and came out clearly quicker (left out); \`fuel\` litres at the start of the lap; \`tyreF\`/\`tyreR\` tyre temperature (°C, garage-equivalent); \`s1\`..\`s3\` sector times; \`g\` grip used; \`age\` laps on the tyres.
- **setups.csv**: every setting per stint, long format (\`setting\`, raw \`value\`, and \`number\` parsed from it).
- **setup-engineer.db**: the full SQLite database (tables \`stints\`, \`laps\`, \`setup\`, \`refs\`, \`kv\`; the \`json\` columns hold every field).

Units: times in seconds, temperatures °C, ride heights mm, springs N/mm, downforce N (measured from how far the suspension compresses at \`rh_speed_kmh\`, calibrated to iRacing's aero calculator), balance in degrees of understeer (positive = understeer), drag as K in drag force = K·v² (N, v in m/s, rolling resistance included) with the wheel power P, both fitted from full-throttle acceleration (m·a·v = P − K·v³).
Balance, downforce and drag are estimates from telemetry, not iRacing's internal values.
`);
  shell.openPath(out); return { dir: out, stints: S.length, laps: lapRows.length, settings: set.length };
});
ipcMain.handle('data:csv', (_e, on) => { if (on !== undefined) { cfg.settings.csv = !!on; saveCfg(); if (on) { for (const r of Object.values(learnLoad().stints)) csvTouched.add(r.car + '|' + r.track); learnSave(); } } return !!cfg.settings.csv; });
let lastSaveError = null, lastSaved = 0;
function learnWrite() {
  if (!store || !store.db) return;
  try { store.save(learnLoad()); lastSaved = Date.now(); lastSaveError = null; }
  catch (e) { lastSaveError = String(e && e.message || e); console.error('save failed', e); }
  // the database is where everything lives; a CSV copy per car + track (for Excel) only if you switched it on
  if (cfg.settings.csv) for (const k of csvTouched) { const [car, track] = k.split('|'); try { store.writeCsv(learn, car, track); } catch (e) {} }
  csvTouched.clear();
}
function learnSave() { clearTimeout(learnTimer); learnTimer = setTimeout(() => { learnTimer = null; learnWrite(); }, 800); }
ipcMain.handle('learn:get', () => learnLoad().stints);
ipcMain.handle('learn:put', (_e, rec) => {
  if (!rec || !rec.id) return false; const L = learnLoad(), S = L.stints, old = S[rec.id];
  if (old && old.date && (!rec.date || old.date < rec.date)) rec.date = old.date;   // the same stint seen live and later as a .ibt file: keep the first date
  // every lap of the stint goes into its own table (and the CSV), not into the stint record
  if (Array.isArray(rec.lapRows)) { if (rec.lapRows.length) L.laps[rec.id] = rec.lapRows; delete rec.lapRows; }
  // re-reading a recording (new version, more data per lap) must not lose what you told the app about that stint
  if (old) for (const k of ['feel', 'feelDrv']) if (old[k] !== undefined && rec[k] === undefined) rec[k] = old[k];
  S[rec.id] = rec; csvTouched.add(rec.car + '|' + rec.track); learnSave(); return true;
});
ipcMain.handle('data:info', () => ({ dir: store && store.dir, db: store && store.file, csv: store && store.csvDir, reports: store && store.reportDir, manuals: store && store.manualDir, lastSaved, lastSaveError }));
ipcMain.handle('data:open', (_e, which) => { const p = which === 'csv' ? store.csvDir : which === 'reports' ? store.reportDir : which === 'manuals' ? store.manualDir : store.dir; shell.openPath(p); return p; });
ipcMain.handle('data:laps', (_e, id) => (learnLoad().laps || {})[id] || null);
ipcMain.handle('cars:put', (_e, list) => { try { for (const c of list || []) store.putCar(c.car, c.name, c); learnSave(); return true; } catch (e) { return false; } });
ipcMain.handle('learn:forget', (_e, car, track) => { const L = learnLoad(); csvTouched.add(car + '|' + track);
  for (const [k, r] of Object.entries(L.stints)) if (r.car === car && (!track || r.track === track)) delete L.stints[k];
  for (const k of Object.keys(L.refs)) if (k.startsWith(car + '|') && (!track || k === car + '|' + track)) delete L.refs[k];
  learnSave(); return true; });
ipcMain.handle('learn:refGet', (_e, k) => { const r = learnLoad().refs[k]; return r && r.date >= learnCutoff() ? r : null; });   // a best lap from an older season doesn't count
ipcMain.handle('learn:refPut', (_e, k, ref) => { const R = learnLoad().refs;
  if (!k || !ref || !(ref.best > 0)) return false;
  if (!R[k] || ref.best < R[k].best || !(R[k].date >= learnCutoff())) { R[k] = ref; learnSave(); return true; } return false; });
ipcMain.handle('learn:file', () => LEARN_FILE);
// Bono's memory, shared with Hanna and GP: small named values (e.g. steering ratio per car, corner history per track)
ipcMain.handle('learn:kvGet', (_e, ns, k) => { const L = learnLoad(); const v = ((L.kv || {})[ns] || {})[k]; return v && (!v.date || v.date >= learnCutoff()) ? v : null; });
ipcMain.handle('learn:kvPut', (_e, ns, k, v) => { if (!ns || !k) return false; const L = learnLoad(); L.kv = L.kv || {}; (L.kv[ns] = L.kv[ns] || {})[k] = v; learnSave(); return true; });
// what your past stints say about fuel and tyre wear here (this season, stints of 5+ clean laps)
ipcMain.handle('learn:summary', (_e, car, track) => {
  const c = learnCutoff(), med = a => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const L = Object.values(learnLoad().stints).filter(r => r.car === car && (!track || r.track === String(track)) && r.date >= c && r.laps >= 5).sort((a, b) => b.date - a.date).slice(0, 8);
  if (!L.length) return null;
  return { n: L.length, fuel: med(L.map(r => r.fuel)), outFuel: med(L.map(r => r.outFuel)), wearF: med(L.map(r => r.wearF)), wearR: med(L.map(r => r.wearR)),
    lapMed: med(L.map(r => r.med)), best: Math.min(...L.map(r => r.best)), trackT: med(L.map(r => r.trackT)) };
});
app.on('before-quit', () => { if (learnTimer) { clearTimeout(learnTimer); learnWrite(); } });
let latestPlan = null;
// PDF report: render the report HTML in a hidden window and print it to PDF
ipcMain.handle('pdf:save', async (_e, html, name) => {
  const { dialog } = require('electron');
  // saved straight into Documents\Setup Engineer reports (no dialog: it can open hidden behind iRacing), never over an older report
  const dir = store ? store.reportDir : path.join(app.getPath('documents'), 'Setup Engineer', 'reports'); try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
  const base = String(name || 'report.pdf').replace(/[\\/:*?"<>|]/g, '-').replace(/\.pdf$/i, '');
  let file = path.join(dir, base + '.pdf'); for (let i = 2; fs.existsSync(file); i++) file = path.join(dir, `${base} (${i}).pdf`);
  const r = { filePath: file };
  const tmp = path.join(app.getPath('temp'), 'se-report.html'); fs.writeFileSync(tmp, html, 'utf8');
  const w = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true } });
  await w.loadFile(tmp);
  const pdf = await w.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { marginType: 'default' }, displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: '<div style="font-size:7.5px;width:100%;padding:0 12mm;color:#6b7380;display:flex;justify-content:space-between"><span>Setup Engineer v' + app.getVersion() + ' · race engineering report</span><span>page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>' });
  fs.writeFileSync(r.filePath, pdf); w.destroy(); openReport(r.filePath);
  return r.filePath;
});
// ---------- how reports open: your default PDF app, a browser you pick, any program, or not at all ----------
function pdfApps() {
  const pf = process.env['ProgramFiles'] || 'C:\\Program Files', pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', la = process.env.LOCALAPPDATA || '';
  const cand = [['firefox', 'Firefox', [path.join(pf, 'Mozilla Firefox', 'firefox.exe'), path.join(pf86, 'Mozilla Firefox', 'firefox.exe')]],
    ['chrome', 'Google Chrome', [path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(la, 'Google', 'Chrome', 'Application', 'chrome.exe')]],
    ['edge', 'Microsoft Edge', [path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe')]],
    ['brave', 'Brave', [path.join(pf, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'), path.join(la, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe')]],
    ['acrobat', 'Adobe Acrobat', [path.join(pf, 'Adobe', 'Acrobat DC', 'Acrobat', 'Acrobat.exe'), path.join(pf86, 'Adobe', 'Acrobat Reader DC', 'Reader', 'AcroRd32.exe'), path.join(pf, 'Adobe', 'Acrobat Reader DC', 'Reader', 'AcroRd32.exe')]],
    ['sumatra', 'SumatraPDF', [path.join(pf, 'SumatraPDF', 'SumatraPDF.exe'), path.join(la, 'SumatraPDF', 'SumatraPDF.exe')]]];
  const out = [{ id: 'default', name: 'Windows default PDF app' }];
  for (const [id, name, ps] of cand) { const p = ps.find(x => { try { return fs.existsSync(x); } catch (e) { return false; } }); if (p) out.push({ id, name, exe: p }); }
  const c = cfg.settings.pdfOpen || {}; if (c.mode === 'exe' && c.exe) out.push({ id: 'exe', name: path.basename(c.exe, '.exe'), exe: c.exe });
  out.push({ id: 'none', name: "Don't open (just save)" });
  return out;
}
function openReport(file) {
  const c = cfg.settings.pdfOpen || { mode: 'default' };
  if (c.mode === 'none') return;
  const exe = c.mode === 'exe' ? c.exe : (pdfApps().find(a => a.id === c.mode) || {}).exe;
  if (exe && fs.existsSync(exe)) { try { spawn(exe, [file], { detached: true, stdio: 'ignore' }).unref(); return; } catch (e) {} }
  shell.openPath(file);
}
ipcMain.handle('pdf:apps', () => ({ apps: pdfApps(), current: (cfg.settings.pdfOpen || { mode: 'default' }).mode }));
ipcMain.handle('pdf:setApp', async (_e, mode) => {
  if (mode === 'pick') { const { dialog } = require('electron');
    const r = await dialog.showOpenDialog(main, { title: 'Open reports with…', properties: ['openFile'], filters: [{ name: 'Programs', extensions: ['exe'] }] });
    if (r.canceled || !r.filePaths[0]) return cfg.settings.pdfOpen || { mode: 'default' };
    cfg.settings.pdfOpen = { mode: 'exe', exe: r.filePaths[0] }; }
  else { const a = pdfApps().find(x => x.id === mode); cfg.settings.pdfOpen = a && a.exe && mode !== 'exe' ? { mode } : mode === 'none' ? { mode: 'none' } : mode === 'exe' ? cfg.settings.pdfOpen : { mode: 'default' }; }
  saveCfg(); return cfg.settings.pdfOpen;
});
ipcMain.handle('pdf:open', (_e, file) => { if (file && fs.existsSync(file)) openReport(file); return true; });
// the main app is never pinned above iRacing (only the overlays are); kept as no-ops for older pages
ipcMain.handle('win:pin', () => { if (main) main.setAlwaysOnTop(false); return false; });
ipcMain.handle('win:front', () => false);
ipcMain.handle('plan:publish', (_e, p) => { latestPlan = p; for (const w of Object.values(wins)) w.webContents.send('plan', p); });
ipcMain.handle('plan:get', () => latestPlan);
ipcMain.handle('update:check', () => updater.check());
ipcMain.handle('update:install', () => updater.install());

// ---------- start ----------
app.on('second-instance', showMain);
app.on('window-all-closed', (e) => e.preventDefault());
app.on('before-quit', () => { app.isQuitting = true; if (bridge) try { bridge.kill(); } catch (e) {} });
app.on('will-quit', () => globalShortcut.unregisterAll());

app.whenReady().then(async () => {
  app.setAppUserModelId('com.setupengineer.app');
  try { await initData(); }
  catch (e) { require('electron').dialog.showErrorBox('Setup Engineer', 'Could not open your data folder / database: ' + e.message); }
  try { await startBridge(); }
  catch (e) { require('electron').dialog.showErrorBox('Setup Engineer', 'Could not start the telemetry reader: ' + e.message); app.quit(); return; }
  tray = new Tray(nativeImage.createFromPath(ICON));
  tray.setToolTip('Setup Engineer');
  tray.on('double-click', showMain);
  buildTrayMenu();
  // first free shortcut wins (another program may already own one)
  for (const k of [EDIT_KEY, 'CommandOrControl+Shift+O', 'CommandOrControl+Alt+F12']) {
    try { if (globalShortcut.register(k, () => setEditMode(!editMode))) { editKey = k.replace('CommandOrControl', 'Ctrl'); break; } } catch (e) {}
  }
  buildTrayMenu();
  createMain();
  createRadio();
  applyOverlays();
  updater.init((s) => { if (main) main.webContents.send('update-status', s); });
});
ipcMain.handle('update:status', () => updater.current());

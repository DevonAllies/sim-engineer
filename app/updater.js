// Auto-update from GitHub Releases (electron-updater).
// Downloads in the background; installs only when the user clicks "Restart" or quits the app,
// so an update never interrupts a session.
const { app } = require('electron');
const pkg = require('./package.json');

let autoUpdater = null, status = { state: 'idle' }, send = () => {}, retry = null;

// the installed app carries app-update.yml (the GitHub repo to update from); package.json loses its build section when packaged
function configured() {
  if (!app.isPackaged) return false;
  try { const y = require("fs").readFileSync(require("path").join(process.resourcesPath, "app-update.yml"), "utf8"); return /provider:\s*github/.test(y) && /owner:\s*\S+/.test(y) && !/YOUR-GITHUB-NAME/.test(y); } catch (e) { return false; }
}

function set(s) { status = s; send(s); }

function init(sendFn) {
  send = sendFn;
  if (!configured()) { set({ state: 'off', reason: app.isPackaged ? 'Updates are not set up yet (no GitHub repository configured).' : 'Updates are off while running from source.' }); return; }
  ({ autoUpdater } = require('electron-updater'));
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => set({ state: 'checking' }));
  autoUpdater.on('update-available', (i) => set({ state: 'downloading', version: i.version, percent: 0 }));
  autoUpdater.on('download-progress', (p) => set({ state: 'downloading', version: status.version, percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (i) => set({ state: 'ready', version: i.version }));
  autoUpdater.on('update-not-available', () => set({ state: 'latest' }));
  // a failed check (offline, or a release still uploading) tries again in 10 minutes
  autoUpdater.on('error', (e) => { set({ state: 'error', message: String(e && e.message || e).slice(0, 200) }); clearTimeout(retry); retry = setTimeout(check, 10 * 60 * 1000); });
  check();
  setInterval(check, 60 * 60 * 1000);   // every hour
}

function check() { if (autoUpdater && status.state !== 'downloading' && status.state !== 'ready') { set({ state: 'checking' }); autoUpdater.checkForUpdates().catch(() => {}); } return status; }
function install() { if (autoUpdater && status.state === 'ready') { app.isQuitting = true; autoUpdater.quitAndInstall(false, true); } }
function current() { return status; }

module.exports = { init, check, install, current };

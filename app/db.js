// Setup Engineer - local database (SQLite via sql.js: pure JavaScript, nothing to compile)
// One file, <data folder>\database\setup-engineer.db, holds every stint, every lap, each stint's full setup,
// best-lap references, the shared memory (Bono / Hanna / GP, aero map) and the car profiles.
// Next to it, csv\<car>\<track>.csv is rewritten in the background after each stint: one row per lap, for Excel.
const fs = require('fs');
const path = require('path');

let SQL = null;
async function initSql() {
  if (SQL) return SQL;
  const initSqlJs = require('sql.js');
  const wasm = fs.readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'));
  SQL = await initSqlJs({ wasmBinary: wasm });
  return SQL;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS stints (id TEXT PRIMARY KEY, car TEXT, car_name TEXT, track TEXT, track_name TEXT, date INTEGER, session TEXT, live INTEGER,
  laps INTEGER, best REAL, typical REAL, spread REAL, track_temp REAL, air_temp REAL, fuel_per_lap REAL, json TEXT);
CREATE INDEX IF NOT EXISTS stints_car_track ON stints(car, track, date);
CREATE TABLE IF NOT EXISTS laps (stint_id TEXT, lap INTEGER, time REAL, clean INTEGER, used INTEGER, fuel REAL, tyre_f REAL, tyre_r REAL, s1 REAL, s2 REAL, s3 REAL, json TEXT,
  PRIMARY KEY (stint_id, lap));
CREATE TABLE IF NOT EXISTS setup (stint_id TEXT, path TEXT, value TEXT, PRIMARY KEY (stint_id, path));
CREATE TABLE IF NOT EXISTS refs (k TEXT PRIMARY KEY, date INTEGER, json TEXT);
CREATE TABLE IF NOT EXISTS kv (ns TEXT, k TEXT, date INTEGER, json TEXT, PRIMARY KEY (ns, k));
CREATE TABLE IF NOT EXISTS cars (car TEXT PRIMARY KEY, name TEXT, updated INTEGER, json TEXT);
`;

class Store {
  constructor(dir) { this.setDir(dir); this.db = null; this.dirtyCsv = new Set(); }
  setDir(dir) {
    this.dir = dir;
    this.dbDir = path.join(dir, 'database'); this.csvDir = path.join(dir, 'csv'); this.reportDir = path.join(dir, 'reports'); this.manualDir = path.join(dir, 'manuals');
    this.file = path.join(this.dbDir, 'setup-engineer.db');
    for (const d of [this.dbDir, this.csvDir, this.reportDir, this.manualDir]) { try { fs.mkdirSync(d, { recursive: true }); } catch (e) {} }
  }
  async open() {
    await initSql();
    let buf = null; try { buf = fs.readFileSync(this.file); } catch (e) {}
    this.db = buf ? new SQL.Database(buf) : new SQL.Database();
    this.db.exec(SCHEMA);
    try { this.db.exec('ALTER TABLE stints ADD COLUMN historic INTEGER'); } catch (e) {}   // added in 0.12: moved to historic (date), null = current
    return !!buf;
  }
  exists() { return fs.existsSync(this.file); }
  all(sql, p) { const st = this.db.prepare(sql); if (p) st.bind(p); const out = []; while (st.step()) out.push(st.getAsObject()); st.free(); return out; }
  run(sql, p) { this.db.run(sql, p || []); }

  // ---- read everything into the shape the app has always used ({stints, refs, kv, laps}) ----
  // historic data (an older iRacing build) sits in L.hist: kept, never used for learning
  load() {
    const L = { v: 1, stints: {}, refs: {}, kv: {}, laps: {}, hist: { stints: {}, refs: {}, kv: {} } };
    for (const r of this.all('SELECT id, json FROM stints')) { try { const x = JSON.parse(r.json); (x.historic ? L.hist.stints : L.stints)[r.id] = x; } catch (e) {} }
    for (const r of this.all('SELECT k, json FROM refs')) { try { const x = JSON.parse(r.json); if (r.k.startsWith('H|')) L.hist.refs[r.k.slice(2)] = x; else L.refs[r.k] = x; } catch (e) {} }
    for (const r of this.all('SELECT ns, k, json FROM kv')) { try { const x = JSON.parse(r.json); if (r.ns.startsWith('H|')) (L.hist.kv[r.ns.slice(2)] = L.hist.kv[r.ns.slice(2)] || {})[r.k] = x; else (L.kv[r.ns] = L.kv[r.ns] || {})[r.k] = x; } catch (e) {} }
    for (const r of this.all('SELECT stint_id, json FROM laps ORDER BY stint_id, lap')) { try { (L.laps[r.stint_id] = L.laps[r.stint_id] || []).push(JSON.parse(r.json)); } catch (e) {} }
    return L;
  }
  // ---- write everything (a few hundred stints: small and quick), in one transaction ----
  save(L) {
    const db = this.db, n = v => (typeof v === 'number' && isFinite(v)) ? v : null;
    db.exec('BEGIN');
    try {
      db.exec('DELETE FROM stints; DELETE FROM setup; DELETE FROM refs; DELETE FROM kv;');
      const sS = db.prepare('INSERT INTO stints (id,car,car_name,track,track_name,date,session,live,laps,best,typical,spread,track_temp,air_temp,fuel_per_lap,json,historic) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'), sU = db.prepare('INSERT OR REPLACE INTO setup VALUES (?,?,?)');
      const H = L.hist || { stints: {}, refs: {}, kv: {} };
      for (const [id, r] of [...Object.entries(L.stints || {}), ...Object.entries(H.stints || {})]) {
        sS.run([id, r.car || '', r.carName || '', String(r.track || ''), r.trackName || '', n(r.date), r.session || '', r.live ? 1 : 0, n(r.laps), n(r.best), n(r.med), n(r.sd), n(r.trackT), n(r.airT), n(r.fuel), JSON.stringify(r), n(r.historic)]);
        for (const [p, v] of Object.entries(r.setup || {})) sU.run([id, p, String(v)]);
      }
      sS.free(); sU.free();
      const sR = db.prepare('INSERT OR REPLACE INTO refs VALUES (?,?,?)');
      for (const [k, r] of Object.entries(L.refs || {})) sR.run([k, n(r && r.date), JSON.stringify(r)]);
      for (const [k, r] of Object.entries(H.refs || {})) sR.run(['H|' + k, n(r && r.date), JSON.stringify(r)]); sR.free();
      const sK = db.prepare('INSERT OR REPLACE INTO kv VALUES (?,?,?,?)');
      for (const [ns, o] of Object.entries(L.kv || {})) for (const [k, v] of Object.entries(o || {})) sK.run([ns, k, n(v && v.date), JSON.stringify(v)]);
      for (const [ns, o] of Object.entries(H.kv || {})) for (const [k, v] of Object.entries(o || {})) sK.run(['H|' + ns, k, n(v && v.date), JSON.stringify(v)]); sK.free();
      // laps: replace the ones given, drop laps of stints that no longer exist
      const sL = db.prepare('INSERT OR REPLACE INTO laps VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
      for (const [id, rows] of Object.entries(L.laps || {})) for (const x of rows || []) sL.run([id, n(x.lap), n(x.time), x.clean ? 1 : 0, x.used ? 1 : 0, n(x.fuel), n(x.tyreF), n(x.tyreR), n(x.s1), n(x.s2), n(x.s3), JSON.stringify(x)]);
      sL.free();
      for (const [id, rows] of Object.entries((H.laps) || {})) for (const x of rows || []) sL.run([id, n(x.lap), n(x.time), x.clean ? 1 : 0, x.used ? 1 : 0, n(x.fuel), n(x.tyreF), n(x.tyreR), n(x.s1), n(x.s2), n(x.s3), JSON.stringify(x)]);
      db.exec('DELETE FROM laps WHERE stint_id NOT IN (SELECT id FROM stints)');
      db.exec('COMMIT');
    } catch (e) { try { db.exec('ROLLBACK'); } catch (e2) {} throw e; }
    this.flush();
  }
  flush() {
    const data = Buffer.from(this.db.export());
    fs.writeFileSync(this.file + '.tmp', data); fs.renameSync(this.file + '.tmp', this.file);
  }
  putCar(car, name, json) { this.run('INSERT OR REPLACE INTO cars VALUES (?,?,?,?)', [car, name || car, Date.now(), JSON.stringify(json)]); }

  // ---- CSV per car + track: one row per lap, with the stint's results and its full setup ----
  writeCsv(L, car, track) {
    const S = Object.entries(L.stints || {}).filter(([, r]) => r.car === car && String(r.track) === String(track)).sort((a, b) => a[1].date - b[1].date);
    if (!S.length) return null;
    const keys = [...new Set(S.flatMap(([, r]) => Object.keys(r.setup || {})))].sort();
    const q = v => { const s = v == null || (typeof v === 'number' && !isFinite(v)) ? '' : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const head = ['stint_date', 'stint_time', 'session', 'live', 'lap', 'lap_time_s', 'clean', 'used_for_analysis', 'fuel_used_l', 'tyre_front_C', 'tyre_rear_C',
      'stint_laps', 'stint_best_s', 'stint_typical_s', 'stint_spread_s', 'bal_slow', 'bal_fast', 'bal_entry', 'bal_mid', 'bal_exit', 'slides_per_lap',
      'track_C', 'air_C', 'start_kPa_F', 'start_kPa_R', 'hot_kPa_F', 'rh_speed_F', 'rh_speed_R', 'rake_speed', ...keys];
    const lines = [head.map(q).join(',')];
    for (const [id, r] of S) {
      const d = new Date(r.date), day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, tm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      const b = r.bal || {}, t = r.tyreT || {}, a = r.aero || {};
      const stint = [r.laps, r.best, r.med, r.sd, b.slow, b.fast, b.entry, b.mid, b.exit, r.slides, r.trackT, r.airT, t.sPF, t.sPR, t.pF, a.fA, a.rA, (a.rA != null && a.fA != null) ? +(a.rA - a.fA).toFixed(2) : null, ...keys.map(k => (r.setup || {})[k])];
      const laps = (L.laps || {})[id];
      if (laps && laps.length) for (const x of laps) lines.push([day, tm, r.session, r.live ? 1 : 0, x.lap, x.time, x.clean ? 1 : 0, x.used ? 1 : 0, x.fuel, x.tyreF, x.tyreR, ...stint].map(q).join(','));
      else lines.push([day, tm, r.session, r.live ? 1 : 0, '', '', '', '', '', t.F, t.R, ...stint].map(q).join(','));   // older stints: one summary row
    }
    const safe = s => String(s || '').replace(/[\\/:*?"<>|]/g, '-').trim() || 'unknown';
    const carName = (S[S.length - 1][1].carName || car), trackName = (S[S.length - 1][1].trackName || track);
    const dir = path.join(this.csvDir, safe(carName)); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, safe(trackName) + '.csv');
    try { fs.writeFileSync(file, '﻿' + lines.join('\r\n')); } catch (e) { return null; }   // open in Excel right now: written next time
    return file;
  }
}
module.exports = { Store };

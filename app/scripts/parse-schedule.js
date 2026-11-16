// iRacing season schedule (pdftotext -raw) → schedule.json for Setup Engineer
// usage: node parse.js raw.txt out.json
const fs = require('fs');
const lines = fs.readFileSync(process.argv[2], 'latin1').split(/\r?\n/).map(s => s.replace(/\uFFFD/g, '').trimEnd());
// table of contents: "Title . . . . . page" → the series titles
const titles = new Set(), disc = {};
let curDisc = '';
for (const l of lines.slice(0, 400)) {
  const m = l.match(/^(.+?)\s(\.\s){3,}.*?\d*$/); if (!m) continue;
  const t = m[1].trim();
  if (/^(OVAL|SPORTS CAR|FORMULA CAR|DIRT OVAL|DIRT ROAD|UNRANKED)$/.test(t)) { curDisc = t; continue; }
  if (/Class Series \(/.test(t)) continue;
  titles.add(t); disc[t] = curDisc;
}
const series = [];
let cur = null, wk = null;
const stop = l => /^(Week \d+ \(|Races every|Min entries|Penalty every|Forecast|Class [A-Z]|Rookie|Week Track)/.test(l);
for (let i = 400; i < lines.length; i++) {
  const l = lines[i].trim(); if (!l) continue;
  if (titles.has(l) && !/\.\s\./.test(lines[i])) {
    cur = { name: l, discipline: disc[l] || '', cars: '', every: '', weeks: [] }; series.push(cur); wk = null;
    // cars: the lines until the licence / "Races every" line
    let j = i + 1, cars = [];
    while (j < lines.length && !stop(lines[j].trim()) && cars.length < 8) { cars.push(lines[j].trim()); j++; }
    cur.cars = cars.join(' ').replace(/\s+/g, ' ').trim(); continue;
  }
  if (!cur) continue;
  let m;
  if ((m = l.match(/^Races (every .+|.*\d{1,2}:\d\d.*)$/)) && !cur.every) { cur.every = 'Races ' + m[1]; continue; }
  if ((m = l.match(/^Week (\d+) \((\d{4}-\d\d-\d\d)\)\s*(.*)$/))) {
    let track = m[3].trim();
    // a track name can wrap onto the next line
    const nx = (lines[i + 1] || '').trim();
    if (track && nx && !/^\(|^(Rain|Dry|Clear|Partly|Overcast|Mostly|Cloudy|Grid|Rolling|Standing|\d)/.test(nx) && !/^[A-Z0-9]{2,8}:/.test(nx) && !/^Week /.test(nx) && nx.length < 40) { track += ' ' + nx; i++; }
    wk = { week: +m[1], start: m[2], track, notes: [], bop: {}, length: '' }; cur.weeks.push(wk); continue;
  }
  if (!wk) continue;
  if ((m = l.match(/^\((\d{4}-\d\d-\d\d \d\d:\d\d)[^)]*\)$/))) { wk.simTime = m[1]; continue; }
  if ((m = l.match(/^([A-Z0-9]{2,8}): (.*)$/))) { wk.bop[m[1]] = m[2]; wk._lastBop = m[1]; continue; }
  if (/^\d+(\.\d+)?%$|^-?\d+(\.\d+)?%,?$/.test(l) && wk._lastBop) { wk.bop[wk._lastBop] += ' ' + l; continue; }
  if ((m = l.match(/^(\d+ (mins|laps|hours?|hrs?)( \d+ mins)?)$/))) { if (!wk.length) wk.length = m[1]; continue; }
  if (/^\d+$/.test(l) && /^(mins|laps|hours?)$/.test((lines[i + 1] || '').trim())) { if (!wk.length) wk.length = l + ' ' + lines[i + 1].trim(); i++; continue; }   // "180" / "mins" on two lines
  if (wk.notes.length < 8) wk.notes.push(l);
}
for (const s of series) for (const w of s.weeks) { delete w._lastBop; w.notes = w.notes.join(' ').replace(/\s+/g, ' ').replace(/ - (Strict|Moderate|Relaxed)\./, ' - $1.').trim(); }
const out = { source: 'iRacing season schedule PDF', parsed: new Date().toISOString().slice(0, 10), series: series.filter(s => s.weeks.length) };
fs.writeFileSync(process.argv[3], JSON.stringify(out));
console.log(out.series.length, 'series');
for (const n of ['GT Sprint Series by Simucube', 'GT3 Challenge Fixed', 'IMSA iRacing Series', 'LMP2 Challenge', 'Prototype Challenge', 'GT Endurance', 'IMSA Endurance', 'Proto-GT'])
  for (const s of out.series.filter(s => s.name.includes(n))) console.log('==', s.name, '|', s.every, '|', s.weeks.map(w => `W${w.week} ${w.start} ${w.track} [${w.length}]${w.bop.NSXE22 ? ' NSX:' + w.bop.NSXE22 : ''}`).join(' ; '));

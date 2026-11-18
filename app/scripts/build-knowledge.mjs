// Builds the car knowledge that ships with each release, from testers' shared test programme results.
//
//   node scripts/build-knowledge.mjs "<team folder>" ["<folder of exported files>" ...]
//
// Reads every testresults/<tester>/<car>.json.gz in the team folder and any exported "test-results … .json" files,
// and writes web/knowledge/<car>.json (+ index.json). Only what a tested change did to the car is used: each step is
// taken as the tester's own change against their own baseline, so different drivers, tracks and days compare.
// Nothing personal is in the input or the output (testers are anonymous numbers).
import fs from "fs"; import path from "path"; import zlib from "zlib"; import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url)), outDir = path.join(here, "..", "web", "knowledge");
const MEAS = ["med","fA","rA","onF","onR","fpct","vmax","entry","mid","exit","slow","fast","slides","kerbS","tF","tR","cF","cR"];
const ORDER = ["sprFrontmin","sprFrontmax","sprRearmin","sprRearmax","sprApp","rhRearLow","rhRearHigh","rhApp","arbFrontSoft","arbFront","arbRearSoft","arbRear","arbApp",
  "dfronthighspeedcompression","drearhighspeedcompression","dfronthighspeedrebound","drearhighspeedrebound","dfrontlowspeedcompression","drearlowspeedcompression","dfrontlowspeedrebound","drearlowspeedrebound",
  "wingMin","wingLess","wingMore","wingMax"];

function walk(d, out=[]){ let L=[]; try { L=fs.readdirSync(d, {withFileTypes:true}); } catch(e){ return out; }
  for (const e of L){ const p=path.join(d,e.name); if (e.isDirectory()) walk(p,out); else if (/\.json(\.gz)?$/i.test(e.name)) out.push(p); } return out; }
function read(p){ try { let b=fs.readFileSync(p); if (/\.gz$/i.test(p)) b=zlib.gunzipSync(b); const o=JSON.parse(b.toString("utf8")); return o && o.v===1 && o.car && Array.isArray(o.programmes) ? o : null; } catch(e){ return null; } }

const files = process.argv.slice(2).flatMap(d => fs.existsSync(d) && fs.statSync(d).isDirectory() ? walk(d) : [d]);
const results = files.map(read).filter(Boolean);
if (!results.length){ console.log("No test result files found in: " + process.argv.slice(2).join(", ")); process.exit(0); }

// newest file per tester and car (a tester's file is rewritten as they drive more)
const latest = {}; for (const r of results){ const k=r.tester+"|"+r.car; if (!latest[k] || (r.made||"")>(latest[k].made||"")) latest[k]=r; }

const cars = {};
for (const r of Object.values(latest)){
  const C = cars[r.car] = cars[r.car] || {car:r.car, carName:r.carName, testers:new Set(), groups:{}};
  for (const P of r.programmes) for (const s of P.steps){
    if (!(s.laps>=3) || !(s.refLaps>=3) || !s.m || !s.ref) continue;
    const d={}; for (const k of MEAS) if (Number.isFinite(s.m[k]) && Number.isFinite(s.ref[k])) d[k]=s.m[k]-s.ref[k];
    if (!Object.keys(d).length) continue;
    // the wing depends on the track: kept per track; everything else is the car
    const key = P.kind==="track" ? `${s.id}@${P.track}` : s.id;
    const g = C.groups[key] = C.groups[key] || {label: P.kind==="track" ? `${s.label} (${P.trackName||P.track})` : s.label, block:s.block, order:ORDER.indexOf(s.id), per:{}};
    // a long gap between the step and its baseline lets you and the track change too: it counts for less
    const w = Math.min(s.laps, 10) * (s.hoursApart>2 ? 0.5 : 1);
    const T = g.per[r.tester] = g.per[r.tester] || {w:0, laps:0, sum:{}, wk:{}};
    T.w+=w; T.laps+=s.laps; for (const [k,v] of Object.entries(d)){ T.sum[k]=(T.sum[k]||0)+v*w; T.wk[k]=(T.wk[k]||0)+w; }
    C.testers.add(r.tester); } }

fs.mkdirSync(outDir, {recursive:true}); const index=[];
for (const C of Object.values(cars)){
  const steps={};
  for (const [key,g] of Object.entries(C.groups)){
    let per=Object.entries(g.per).map(([t,T])=>({t, w:T.w, laps:T.laps, d:Object.fromEntries(Object.keys(T.sum).map(k=>[k, T.sum[k]/T.wk[k]]))}));
    // with three or more testers, one whose lap-time change is far from everyone else's (over 1 s) is left out
    if (per.length>=3) per=per.filter(p=>{ const o=per.filter(q=>q!==p && Number.isFinite(q.d.med)); if (!o.length || !Number.isFinite(p.d.med)) return true; const m=o.reduce((a,q)=>a+q.d.med,0)/o.length; return Math.abs(p.d.med-m)<=1; });
    if (!per.length) continue;
    const d={}; for (const k of MEAS){ let s=0,w=0; for (const p of per) if (Number.isFinite(p.d[k])){ s+=p.d[k]*p.w; w+=p.w; } if (w) d[k]=Math.round(s/w*1000)/1000; }
    const agree = Number.isFinite(d.med) && Math.abs(d.med)>=0.05 ? per.filter(p=>Number.isFinite(p.d.med) && Math.sign(p.d.med)===Math.sign(d.med)).length/per.length : null;
    steps[key]={label:g.label, block:g.block, order:g.order<0?99:g.order, n:per.length, laps:per.reduce((a,p)=>a+p.laps,0), d, agree}; }
  const out={car:C.car, carName:C.carName, updated:new Date().toISOString().slice(0,10), testers:C.testers.size, steps};
  fs.writeFileSync(path.join(outDir, `${C.car}.json`), JSON.stringify(out, null, 1));
  index.push({car:C.car, carName:C.carName, testers:out.testers, steps:Object.keys(steps).length, updated:out.updated});
  console.log(`${C.carName}: ${out.testers} tester(s), ${Object.keys(steps).length} tested change(s)`); }
fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify(index, null, 1));
console.log("Written to " + outDir);

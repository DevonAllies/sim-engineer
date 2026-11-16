# Setup Engineer

A race engineer for iRacing. It reads your telemetry (recorded `.ibt` files and the live feed while you drive), tells you what the car is doing and why, suggests setup changes, coaches your driving, plans endurance races, and compares you with your teammates.

Built mainly around the **Acura NSX GT3 EVO 22**, with profiles for the other GT3s, Porsche Cup and Dallara P217 LMP2.

Private repo: for the four of us only.

---

## Install (for the team)

1. Download the latest `Setup-Engineer-Setup-x.y.z.exe` (from the team Google Drive folder, or build it yourself, see below).
2. Close iRacing, run the installer and approve the Windows admin prompt. It installs to `C:\Program Files\Setup Engineer` for everyone on the PC (an older per-user copy is removed automatically).
3. Start **Setup Engineer**. It finds your iRacing telemetry folder (`Documents\iRacing\telemetry`) and starts reading.
4. In iRacing, turn on telemetry recording (Alt+L in the car, or "Telemetry" in the options) so every stint is saved as an `.ibt`.
5. **Team sharing:** install Google Drive for desktop, add the shared team folder to your Drive, and point Setup Engineer at it under **Learning → Team folder**. *(Google Drive link: to follow.)*

Your data stays on your PC in `Documents\Setup Engineer`; only the team folder is shared.

**Updates:** from 0.13.4 on, the app checks this repo's [Releases](https://github.com/DevonAllies/sim-engineer/releases) every 4 hours, downloads a new version in the background and installs it when you close the app (one Windows admin click). Versions before 0.13.4 don't check: install 0.13.4 by hand once.

**Releasing a new version** (maintainer): bump `version` in `app/package.json`, run `npm run dist` in `app/`, then create a GitHub release tagged `v<version>` with `app/dist/Setup-Engineer-Setup-<version>.exe`, its `.blockmap` and `latest.yml` attached.

---

## What it does

### Reading the car
- **Recordings and live:** opens any `.ibt`; while you drive it reads the live feed through a small local bridge (`se-bridge.exe`). After a stint ends it reloads the stint's full recording.
- **Live setup changes** are picked up mid-stint (garage changes without saving the setup), so the report always shows the setup you actually ran.
- **Balance** (understeer / oversteer) at entry, mid and exit, slow and fast corners, from yaw rate vs steering. Verdicts and balance changes only after **5 clean laps** on the same setup; before that it's a "first read".
- **Driving style:** choose understeery, balanced or oversteery; tell it how the car felt per phase. It checks whether understeer was caused by driving (too fast in, early throttle) and weights that out before suggesting setup changes.
- **ARB grid:** where your front/rear bar combination sits, where you should aim and *why*, and what bars alone can't fix.
- **Grip limit:** the limit is measured from your own laps (best 2% of combined cornering and braking g at each speed), not a fixed 2 g. Each corner is shown as under / at / over the limit.

### Tyres and brakes
- **Starting pressure:** best pressure for grip and for tyre temperature, and when each matters.
- **Endurance pressure:** predicted starting pressure for a given track and air temperature (gas law, calibrated from your stints).
- **Tyre temperatures** per lap (garage-equivalent), tyre wear per lap, double-stint call.
- **Brake bias:** a concrete number, from how each braking zone behaves.

### Aero and ride height
- **Ride height at speed** vs targets from iRacing's in-garage aero calculator (Acura: max downforce F 37–41 / R 40–44 mm, min drag F 23–27 / R 18–22).
- **Rake and aero per phase:** braking, turn-in, mid-corner, exit and straights.
- **Optimal rake** for the car.
- **Aero map:** built from every aero calculator point seen (garage clicks + recordings), fitted as a balance map; shown as a heat map in the app and the PDF.

### Track and corners
- **Track map** with corner numbers (T1, T2…), fast bends (F1, F2…), slow / medium / fast corners, and brake, turn-in, apex and exit points.
- **Corner coach:** per corner brake point, apex speed, throttle point, time lost.
- **Sectors:** iRacing's own sectors (not mini sectors), optimal lap from your best sectors.

### Graphs
- **General:** time slip, traction circle, roll and pitch gradients, balance vs speed, best-lap trace (speed, throttle, brake), ride height vs speed.
- **Setup:** shock velocity histograms per corner (slow / fast, bump / rebound; recordings only), understeer along the lap (map and trace), ride height and rake along the lap with the aero window, rake against speed (as measured and aero-only, with the squat from acceleration taken out), tread temperatures lap by lap (inner − outer for camber, middle − edges for pressure).
- **Driving:** brake traces per corner for every lap (brake-point spread), apex speed per corner per lap, throttle ramp on exit (flagging exits where the car stepped out), RPM at upshifts and downshifts against the shift light and limiter.
- **Endurance:** lap time over the stint split into fuel and tyres, fuel and lap time against coasting (you and teammates), tyre temperature and hot pressure settling over the run.

### Overlays (in the car)
- **Bono:** race engineer on the radio.
- **Hanna:** fuel and strategy.
- **GP:** driving coach (corner by corner, sectors, vs teammate).
- **Garage:** setup changes to make in the pits.
- **Team radio:** spoken calls.

Overlays can be moved and resized in edit mode.

### Endurance
- **Endurance test:** every car you (and your teammates) have tested at a track, projected over the race length: typical lap, lap-time drop, fuel per lap, laps per tank, tyre wear, double stint, stops, projected race laps. Pit-stop time loss is editable.
- **Lift and coast vs teammates:** per braking zone, how long each driver coasts, how far before the brake point they lift, speed at the lift and on what share of laps; coasting per lap; fuel saved per second of coasting (measured from the stints, ~0.042 L/s for the Acura).
- **Tyre wear vs teammates:** wear per lap front and rear, laps to 70% tread, at what track temperature.

### Team (shared Google Drive folder)
- After every stint your clean laps are shared automatically (`laps\<car>\<track>\<driver> <date> <lap time>.json.gz`, ~100 KB each), and long runs (5+ clean laps) as a small summary (`stints\<driver>\…`).
- A teammate can also just drop raw `.ibt` files anywhere in the folder; the app extracts the laps and run summary.
- **GP → vs teammate:** time slip, speed and brake/throttle overlays, and per corner: brake point, peak brake, brake at turn-in (trail), apex speed and gear, throttle back on, plus plain-words tips ("he brakes 12 m later, carries 11 km/h more"). His setup vs yours.
- Teammate data is **never** used for your own setup learning, only for driving and endurance comparison.

### Models (learned from every stint, each with its ±)
- **All-stints setup model (Learning):** what each setting does to entry / mid / exit balance and lap time on this car, fitted over every stint at once (Bayesian ridge regression, stints compared within each track). Track temperature and the session's rubbering-in are separate effects, so they're not blamed on a setting. Anti-roll bars start from physics until your data takes over. Odd stints (lap time far from what everything else explains) are left out and listed.
- **What to test next (Learning):** the change the model knows least about, plus settings never changed on this car.
- **Fuel weight and tyre age, measured (Hanna):** lap time against fuel in the tank, laps on the tyres and track temperature, over every clean lap at the track. Needs runs at different fuel loads; replaces the weight-based estimate once it can.
- **Tyre temperature model (Tyres):** each lap the tyre heats toward a track-temperature-dependent balance point; predicts temperature and hot pressure lap by lap for the race temperatures.
- **Lift-and-coast planner (Hanna):** for a fuel target per lap, where to lift before which braking zones for the least lap time, from the measured burn rate, coasting drag and acceleration.
- **Race strategy (Hanna):** every plan (stops, fuel saving, new tyres every stop or double stints) simulated lap by lap; each teammate's best plan and laps.
- **Temperature over the race (Hanna, races of 90 min+):** track and air temperature through the race from the sim time of day, with the starting pressure for each tyre change and the lap-time and balance shift.
- **Starting setup at a new track (Home):** your best setup at the most similar track you've driven (straights, slow / fast corners, braking, kerbs, top speed).
- **Realistic target lap (GP):** each sector at the time you beat on one lap in three.
- **Tyre heat sources (Tyres):** second by second, how much of each axle's tyre heat comes from braking, cornering load, sliding and wheel slip; how to drive for more (or less) heat, and the setup levers with their measured effect (brake bias, pressure, toe, bars, camber).
- **Grip against tyre temperature (Tyres):** grip at the limit per lap against tyre temperature: what cold tyres cost, and the **measured tyre window** (where the car keeps 98.5% of its peak grip), which replaces the generic window once there are 20+ laps over 15°C+.
- **Wet and dry:** track wetness and tyre compound are recorded; tyre models, windows and the setup model learn wet and dry separately.
- **Odd laps:** laps clearly slower than your typical (traffic, a moment) are left out of the analysis and listed.

### Data, reports and history
- **Database:** everything (stints, laps, setups, aero map) in a local SQLite database: `Documents\Setup Engineer\database\setup-engineer.db`. Optional CSV per car + track (off by default).
- **Compare stints:** every stint for this car and track side by side, what changed in the setup, without loading files.
- **PDF reports:** saved to `Documents\Setup Engineer\reports`, opened with the program you choose (Firefox, Chrome, Edge, Acrobat…).
- **Historic:** when an iRacing build changes a car or track, move the old data to historic (car + track, car, or everything). It's kept but nothing learns from it; it can be restored.

---

## Tabs

| Group | Tabs |
|---|---|
| This stint | Home, Changes, Compare |
| Driver | GP (coach), Graphs |
| Car | Balance, Tyres, Aero, Brakes, Dampers |
| Race | Hanna (fuel, strategy, endurance test) |
| Data & help | Laps, FFB, Learning, Guide |

Home shows the summary, your balance and feel, the rotation table, and the car's strengths and weaknesses and which tracks suit it.

---

## Build from source

Requirements: Windows, Node.js 20+, .NET Framework C# compiler (for the bridge; ships with Windows).

```bash
cd app
npm install
npm start          # run in development
npm run dist       # build the bridge and the installer into app\dist
```

`npm run dist` compiles `bridge\Bridge.cs` into `app\bridge\se-bridge.exe` (stop any running bridge first), then builds the NSIS installer.

Test in a browser without Electron:

```bash
app\bridge\se-bridge.exe --port 8790 --web "app\web"
```

then open http://localhost:8790/setup-engineer.html.

## Project layout

```
app/
  main.js            Electron main process: windows, overlays, data folder, database, PDF, team folder
  preload.js         safe bridge between the pages and the app (window.se)
  db.js              SQLite database (sql.js / WASM)
  updater.js         auto-update from this repo's GitHub Releases
  web/setup-engineer.html   the main app: telemetry parser, analysis, all tabs
  web/overlays/      Bono (engineer), Hanna (fuel), GP, Garage, radio
  build/             icon, installer script (removes the old per-user install)
  scripts/           build-bridge.ps1
bridge/Bridge.cs     live telemetry bridge (iRacing shared memory → local HTTP)
src/                 original stand-alone launcher
setup-engineer.html, live-bridge.ps1, start-live.bat   original stand-alone version (pre-Electron)
```

Not in the repo: `node_modules`, installers, `.ibt` telemetry, the database, and the car manual PDFs (download them from iRacing).

---

## Version history

| Version | Changes |
|---|---|
| 0.15.0 | Schedule panel from the iRacing season schedule PDF (your series this / next week, endurance rounds, special events, BoP); test programme points to next week's track. |
| 0.14.10 | Tab list sized to the visible window so the last group (Dev) is always reachable. |
| 0.14.9 | Test programme in Learning (dev): baseline, springs min/max, dampers, bars and wing (per track), one change at a time, auto-ticked from your stints with laps needed; wing sweep per track in Aero. |
| 0.14.8 | "Your inputs" (GP and FFB tabs): steering, brake and throttle too smooth or too aggressive, judged by what the car did, with tyre-heat and force feedback advice; Learning moved to a Dev tab group. |
| 0.14.7 | Damper suggestions use the cross-track model: each carries its measured effect from your other tracks (damper load, balance, lap time); new suggestion when a track will work the dampers harder than usual. |
| 0.14.6 | App shows lap averages only (aero ride heights, tyre temps); "lap-by-lap tables" tick box adds them to the PDF. |
| 0.14.5 | ARB grid sensitivity from the all-stints model once it is sure of the bars. |
| 0.14.4 | Cross-track aero platform model (static ride heights for the window at any track's speed) and damper model (fast-damper share by roughness and clicks); new-track predictions on Home; lap-by-lap tyre temperatures hidden (still stored). |
| 0.14.3 | Setting history (every value of a setting, where, when and what it did); reference lap from all stints (kept automatically, compared in GP); optimal and realistic lap across all stints; tyre temperature model learns across tracks using each lap's load; tread temps per stint; recordings re-read once more. |
| 0.14.2 | "Learn from" selector for the tyre and fuel models (this stint, 7 / 30 days, season; this track or all); past recordings re-read once in the background so old stints get the per-lap grip and tyre data. |
| 0.14.1 | Tyre heat sources with driving and setup advice, grip against tyre temperature, measured tyre window, wet / dry learned separately. |
| 0.14.0 | Models: all-stints setup model with track conditions, what to test next, measured fuel effect, tyre temperature model, lift-and-coast planner, race strategy, temperature over the race, starting setup from the most similar track, realistic target lap, odd lap / stint detection. |
| 0.13.7 | Tab list scrolls on its own, independent of the page. |
| 0.13.6 | Rake against speed: measured vs aero-only (acceleration squat removed). |
| 0.13.5 | 11 new graphs: setup (shocks, balance and ride height along the lap, tread temps), driving (brake traces, apex speed, throttle on exit, shifting), endurance (stint pace fuel vs tyres, fuel vs coasting, tyres over the run). |
| 0.13.4 | Auto-update from this repo's GitHub Releases. |
| 0.13.3 | Teammate long runs in the Endurance test; lift and coast and tyre wear vs teammates. |
| 0.13.2 | Teammate data used for driving comparison only; speed and brake/throttle overlays, peak brake, trail, coasting, gear per corner. |
| 0.13.x | Team sharing through Google Drive (laps pushed and pulled automatically, raw .ibt pickup). Endurance test table. Endurance starting pressure for track/air temps. |
| 0.12.x | Installs to Program Files; data in `Documents\Setup Engineer`; SQLite database; optional CSV; historic data; choose the PDF program; driving style and feel feedback; "what to aim for and why"; iRacing sectors; corner map with slow/medium/fast and fast bends; graphs; redesigned tabs; rotation table and car strengths on Home. |
| 0.11 and earlier | Live setup refresh mid-stint; stint reload after it ends; best starting pressure; brake bias number; balance after 5 laps; rake and aero per phase; optimal rake; full aero map; corner numbers; grip limit explained; PDF export fixes; compare stints without loading files. |

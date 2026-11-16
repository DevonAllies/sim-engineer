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
Time slip, traction circle, roll and pitch gradients, balance vs speed, lap traces (speed, brake, throttle, steering), ride height vs speed.

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
| 0.13.4 | Auto-update from this repo's GitHub Releases. |
| 0.13.3 | Teammate long runs in the Endurance test; lift and coast and tyre wear vs teammates. |
| 0.13.2 | Teammate data used for driving comparison only; speed and brake/throttle overlays, peak brake, trail, coasting, gear per corner. |
| 0.13.x | Team sharing through Google Drive (laps pushed and pulled automatically, raw .ibt pickup). Endurance test table. Endurance starting pressure for track/air temps. |
| 0.12.x | Installs to Program Files; data in `Documents\Setup Engineer`; SQLite database; optional CSV; historic data; choose the PDF program; driving style and feel feedback; "what to aim for and why"; iRacing sectors; corner map with slow/medium/fast and fast bends; graphs; redesigned tabs; rotation table and car strengths on Home. |
| 0.11 and earlier | Live setup refresh mid-stint; stint reload after it ends; best starting pressure; brake bias number; balance after 5 laps; rake and aero per phase; optimal rake; full aero map; corner numbers; grip limit explained; PDF export fixes; compare stints without loading files. |

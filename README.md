# Setup Engineer

A race engineer for iRacing. It reads your telemetry (recorded `.ibt` files and the live feed while you drive), tells you what the car is doing and why, suggests setup changes, coaches your driving, plans endurance races, and compares you with your teammates.

Built mainly around the **Acura NSX GT3 EVO 22**, with profiles for the other GT3s, Porsche Cup and Dallara P217 LMP2.

---

## Install

1. Download the latest `Setup-Engineer-Setup-x.y.z.exe` from [Releases](https://github.com/DevonAllies/sim-engineer/releases/latest) (or build it yourself, see below).
2. Close iRacing, run the installer and approve the Windows admin prompt. It installs to `C:\Program Files\Setup Engineer` for everyone on the PC (an older per-user copy is removed automatically).
3. Start **Setup Engineer**. It finds your iRacing telemetry folder (`Documents\iRacing\telemetry`) and starts reading.
4. In iRacing, turn on telemetry recording (Alt+L in the car, or "Telemetry" in the options) so every stint is saved as an `.ibt`.
5. **Team sharing:** install Google Drive for desktop, add the shared team folder to your Drive, and point Setup Engineer at it under **Learning → Team folder**. *(Google Drive link: to follow.)*

Your data stays on your PC in `Documents\Setup Engineer`; only the team folder is shared.

**Updates:** from 0.13.4 on, the app checks this repo's [Releases](https://github.com/DevonAllies/sim-engineer/releases) every 4 hours, downloads a new version in the background and installs it when you close the app (one Windows admin click). Versions before 0.13.4 don't check: install 0.13.4 by hand once.

**Team folder and team events (set up once):** one person makes a folder in Google Drive, shares it (General access: *Anyone with the link*, *Editor*), and pastes that link in **Settings → Learning → Team folder → Team invite**, where it's saved for everyone. **Copy invite for Discord** writes the message for teammates; the steps are also in [TEAMMATES.md](TEAMMATES.md). Teammates paste the link in **Join a team**, add the folder to their Drive and pick it as their team folder. After that the folder simply grows: anyone starts an event on the **Team events** page and everyone else joins or not; only joined drivers share, only that car and track, and only compact laps and summaries (never .ibt files).

**Car knowledge from testers:** testers switch on *Share these test results* on the Test programme tab (anonymous: the settings tested and what they did, never names, laps or telemetry). Their app writes `testresults/<tester>/<car>.json.gz` to the team folder, or they send an exported file. Before a release, in `app/` run `npm run knowledge -- "<team folder>"` (add any folders of exported files): it writes `web/knowledge/<car>.json`, which ships with the release and shows on the Test programme tab as *What the test team found on this car*.

**Releasing a new version** (maintainer): bump `version` in `app/package.json`, then in `app/` run `npm run release` with a GitHub token in `GH_TOKEN` (for example `$env:GH_TOKEN = gh auth token`). It builds the installer and publishes it, with the `latest.yml` the updater reads, as release `v<version>`; installed apps pick it up within 4 hours, or at once with **Settings → Check for updates**.

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
| 0.15.1 | Short same-setup stints (same day, similar track temp and time of day) combined for the setup and balance learning, tagged "combined"; owned cars and tracks picker (base content + driven by default, saved) used by the Schedule. |
| 0.15.2 | Tracks tab (surface, slow/fast corners, full throttle, heavy stops, top speed, downforce call, best lap and wing per car, from every stint); force feedback "lighter / stronger / keep" verdict from turn-in speed vs wheel force, fatigue over the stint, clipping and front wash-out; Schedule shows this week and next week from the PC's date, with endurance rounds placed in the iRacing week their race falls in. |
| 0.15.3 | Track rules: Nordschleife GT3 70 mm minimum ride height / splitter (suggestions below it are blocked, noted in the Guide); force feedback setting stored per stint, with a "what each max force did here" table per car and track. |
| 0.15.4 | "I own it" buttons next to every not-owned track in the Schedule (the owned list opens by default until saved); your GT3s rated for each track this week / next week and in the Tracks tab (track character measured from your laps, or estimated for new tracks, against each car's strengths). |
| 0.15.5 | Best laps: a lap with time off track is never the best, and a lap that went off and came out clearly quicker is treated as a cut and left out (e.g. a 2:15.4 at Spa from cutting the Bus Stop); a one-time repair corrects stored best laps and removes reference laps that came from a cut. |
| 0.15.6 | Wind tunnel tab: downforce, front share and drag models learned from your stints (background worker, 1500 bootstrap resamples, leave-one-out checks), ride heights at speed solved from springs and load, top speed from measured wheel power, side view with flow lines and force arrows, speed sweep with 90% bands. Drag and wheel power measured per stint from full-throttle acceleration; car weight from corner weights. Export data button (database copy, stints / laps / setups CSVs, README). Settings never spill between cars: car properties per car, pressure and tyre targets per car + track. Test programme warns when the open stint isn't this or next week's track and lists your programmes. |
| 0.15.16 | Test programme: on spring steps, camber and toe that move with the spring (the car sits differently) don't count as another change; starting tyre pressures never block a step. The note on a stint that changed more lists the extra settings with their values. |
| 0.15.17 | Test programme: a garage sheet for each step, laid out like iRacing's garage. It shows what to change (baseline → new value), what to put back (ride heights on spring steps) and what stays at the baseline, and marks any setting in the open stint that doesn't match the step. A drop-down shows the sheet for any step. |
| 0.15.18 | Test programme: in the car at the programme's track, the step's garage sheet checks the live garage as you change it ("Garage now: matches this step" or which settings are off), not just the last stint.
| 0.15.19 | Test programme garage sheet laid out like iRacing's garage (two columns: Front | In-car, LF | RF, LR | RR, Rear | Gears). Ride heights within 2 mm of the baseline count as back, and never as 'not set up'. Min/max steps check the garage moved the right way and show the live value. |
| 0.15.20 | Test programme gets its own tab, with 'What the tests show so far' (each tested step against the baseline: lap time, balance by phase, slides, and what it tells you, with a warning when you and the track have moved on). A step unticked by hand ticks again when new laps come in. Bono doesn't ask for brake bias, TC or ABS changes while a programme runs at your car and track. New Drills page: brake, throttle and steering exercises on your own wheel and pedals, no iRacing needed, scored, with the ones that match your weak corners marked 'for you'. Dampers across tracks: when the dampers work harder (or less) than usual but what one click does isn't learned yet, a rule-of-thumb suggestion instead of 'nothing to change'. |
| 0.15.21 | Drills: an Invert button on throttle, brake and steering. 'Find it' takes the rest position from where the control sits after you let go (some pedals read 0 until first moved). |
| 0.15.22 | Test programme: a 'The baseline' box listing the baseline's key settings (springs, ride heights, ARBs, wing, dampers, camber, toe, diff) and which stint it came from. New 'Test step' overlay for the garage: the step, what to change from the baseline, a live check that the garage matches, and the baseline values, without tabbing out. |
| 0.15.23 | Test programme controls: Pause, Continue, and Finish now (keeps and summarises the steps driven, leaves the rest; can be continued later). Bono and the Test step overlay only act on a running programme. 'Stop' is now 'Delete this programme'. Drills: optional brake and throttle dead zone, for one set in iRacing's calibration rather than the pedal software. |
| 0.15.24 | Corner drills: every corner of the open stint is a drill, with your fastest pass's brake, steering and throttle as the target, ranked by time lost, with how your typical pass differs from your best (braking point, pressure, trail, throttle, apex speed). Long-trail and short-trail brake drills. Kerbs: strikes are detected from the dampers (one side moving much faster than the other), left out of the track roughness, counted per lap, and the damper table says how much of the extra damper work is kerbs rather than the track. |
| 0.15.25 | Test programme: the controls (Running / Paused / Finished, Pause, Continue, Finish now, Delete) sit in a bar right under the title. |
| 0.15.26 | 'What the tests show so far' reads each sweep end against end (softest against stiffest): ride height at speed, bump-rubber contact, front share of downforce, balance by phase and slow/fast corners, tyre temperatures and inner-outer spread, sector times, slides, and lap time with the time gap, then says what it means and what to do ('So:'). Single steps list what moved against the baseline. Every measure is in a table under each sweep. |
| 0.15.27 | Test programme 'The app's spring suggestion' step: shows the actual spring values (the app's suggested change applied to the baseline) instead of flagging every spring; when the app has no spring change to suggest, it says there's nothing to test (tick it by hand to skip). |
| 0.15.28 | Test programme split, like F1 testing: a Car programme (baseline, springs, dampers, anti-roll bars) driven once at one test track, whose results are used at every track, and a short Track check per track (baseline and wing sweep). Switch between them at the top of the Test programme tab. An existing per-track programme becomes the car programme at its track (and that track's check), ticks kept. Bono and the Test step overlay follow whichever is running where you are. |
| 0.15.29 | Car programme: the spring-suggestion step becomes 'Springs: the best of both sweeps': front and rear springs together, each halfway from the baseline towards the quicker end of its sweep (or the baseline when the ends were within 0.1 s), with the reason. It only counts a stint with exactly those springs. An old hand tick on that step is cleared once. |
| 0.15.30 | Car programme builds step by step, like F1 testing: spring sweeps, then 'Springs: the best of both sweeps', which once driven becomes the baseline; then the anti-roll bars on those springs (one step softer and one step stiffer per axle), then 'Bars: the best side on these springs' (the quicker side, or the one that puts mid-corner balance nearest a touch of understeer), which becomes the baseline; then the dampers. The baseline box and the Test step overlay show the baseline as it is now. |
| 0.15.31 | Car programme choices use one score from all the data, in seconds of lap time: typical lap, consistency, balance (entry, mid, exit against a touch of understeer), slides and kerb slides, bump-rubber contact, and tyre temperature against the working window. Each choice says what it won and lost on. A combination step counts any stint after its sweeps that changes only its settings, and each new baseline builds on the one before. |
| 0.15.32 | Car programme: a ride-height (rake) step after the springs and before the bars: rear 3 mm lower, rear 3 mm higher (within 1 mm counts), then 'Ride height: the best rake' on the combined score, which becomes the baseline for the bars. A combination step takes only the laps it needs, so later stints on the same setup go to the next steps. |
| 0.15.33 | Public on GitHub: install from Releases. Releases publish straight away (not as drafts), so installed apps update themselves. Settings shows the version, the update state and a Check for updates button. |
| 0.15.34 | Test results for everyone: an opt-in, anonymous 'Share these test results' switch on the Test programme tab (only the settings tested and what they did), written to the team folder or exported as a file. `npm run knowledge` merges testers' results into car knowledge that ships with each release, shown as 'What the test team found on this car'. |
| 0.15.35 | Auto-update fixed: the installed app now reads its update source (app-update.yml); before, it wrongly said updates weren't set up, so 0.15.33 and 0.15.34 need installing once by hand. New Team events page: anyone in the team folder starts an event for one race (car, track, date, length); everyone else's app shows it with Join / Not this one. Joined drivers share compact laps and stint summaries for that car and track (never .ibt files); teammates' event laps work in GP and Compare. Fuel map per driver, lift and coast corner by corner, a start plan (laps per tank, stops, driver rotation, fuel at each stop) saved as plan.csv and fuel-map.csv for Google Sheets, and closing options (delete lap traces, remove my data, delete the event). |
| 0.15.36 | Team invite: the team folder's Drive link is saved once in the team folder; Copy invite for Discord writes the whole joining message. Join a team: paste a teammate's link and the app opens the folder to add to your Drive. TEAMMATES.md: the joining steps for friends. |
| 0.15.37 | Team events shows the team (everyone whose app uses the team folder, when they were last on, their app version) and, per event, who's in, who's out and who hasn't answered. Updates are checked every hour, and again 10 minutes after a failed check; a failed check shows in Settings only. |
| 0.15.38 | Team setup in the app: Start a team (Create the team folder makes 'Setup Engineer team' in your Google Drive) and Join a team (paste the team key you were sent). The team key is the folder's Drive link, shared as 'Anyone with the link, Editor' so nobody has to request access; Copy the invite puts it in the Discord message. Team events: each driver sets their availability (stints they can drive, most stints), and the start plan gives each stint to someone available, fewest stints first; drivers come from who said they're in. |
| 0.15.39 | Team key: SE1- plus the team folder's random Drive ID, stored in the team folder. Join a team: paste the key and click Join; the browser opens the folder once to add it to Drive, and the app finds the synced folder by itself (no folder picking). The Discord invite carries the key. |
| 0.15.40 | Team event files for other apps (e.g. an overlay), read straight from the synced team folder with nothing else running: events/index.json (every event) and events/<id>/plan.json (event, replies and availability, fuel map per driver, start plan with driver, laps and fuel per stint); see TEAM-DATA.md. The Test programme tab works on a stint with no full lap yet (start a programme in a new car straight away). Ride heights within the margin show as close enough. Wind tunnel: the Acura NSX GT3 and Dallara P217 outlines measured from side-on screenshots (axles, roofline, deck, wing), the P217's axles cross-checked against its paint template. |
| 0.15.41 | Wind tunnel cars drawn in detail from side, rear and front screenshots (our own simplified lines): the NSX with its nose, headlight, canard, mirror, windows, floating rear pillar and intake, door lines, wheel arches, 10-spoke rims that turn, short tail, diffuser with strakes and the wing on swan necks; the P217 with its canopy, sidepod intake, rear deck, rims and diffuser. |
| 0.15.42 | Team events from the iRacing schedule (the next 8 weeks of the series you follow: name, date, track, the series' cars and the race length) or entered by hand for leagues (any car and track, typed if you haven't driven it). Stints are matched to such events by car and track name. Races by laps are planned by laps. |
| 0.15.43 | The team list fills itself: every member's app adds itself when it starts or joins, not only when Team events is opened. Each member shows when they were last on, their app version, what they last drove (car, track, clean laps, best) and 'on track now' with the car and track while driving. Joining instructions match Google Drive's current menu (▾ next to the folder name → Organise → Add shortcut → My Drive). |
| 0.15.44 | Test programme follows the car you are live in: sitting in another car's garage, the tab (and the Test step overlay) shows that car's programme from its live garage setup, before a lap, even with a stint of another car open. Each car keeps its own programme. |
| 0.15.45 | Fix: the Test programme tab was blank for a car whose programme had no combination step driven yet (e.g. the Dallara P217): a later baseline check added an empty stint to the scoring. |
| 0.15.46 | Team events from the schedule: every race of 1½ hours or more from any series is listed (e.g. the Global Endurance Tour 6 hours), as well as the series you follow; Find searches any series, track or car, and 'show every series' lists them all. |
| 0.15.47 | LMP2 (Dallara P217) test programme from its user manual: the front torsion bars are swept as the front springs (torsion bar turns put the ride height back), heave (front) and third (rear) spring steps, ARB stiffness steps, front dive planes in the track check. Word settings (Soft/Medium/Hard, On/Off) count as ordered values everywhere. |
| 0.15.48 | P217 torsion bar steps say how to pass tech: torsion bar turns put the front back up (and the heave gap above zero), camber back inside the range; those still count for the step. |
| 0.15.49 | P217: the lowest static front ride height that passes tech (25.0 mm) is built in: the torsion bar steps say it, the garage sheet flags a front below it with the fix, and it can be changed under Targets (Minimum front static ride height). |
| 0.15.50 | Team events: the schedule list shows only endurance races (1½ hours or more) in the next two weeks; show every series or a search looks 8 weeks ahead at everything. |
| 0.15.51 | Test step overlay reads plainly: one change line per setting (both sides together) with the direction (e.g. 3 mm lower), green with a tick once the garage matches, the garage values in the garage box, and the setting being changed highlighted with its new value in the Everything else stays as it is list. |
| 0.15.52 | Bono shows when a test programme is running: the step and how many laps count towards it (already counted plus this stint), says when the car is not set up for the step, logs each test lap, and says when the step is done. The Test programme garage sheet says which way each change goes (e.g. 3 mm lower) and ticks it green once the garage has it. |
| 0.15.53 | Test programme: the combination steps (springs, heave and third, ride height, bars) decide only once every step of their sweep has its laps (or was ticked to skip), on every axle; until then they say to drive both steps first. |
| 0.15.54 | Bono counts test laps with the app's rule, odd laps (traffic or a moment) left out and named, so its count matches the Test programme. The "can't count for" note only names a step still to do, not one finished on an older baseline. |
| 0.15.55 | Test programme and track conditions: a 3-lap baseline check before the ride-height, heave/third and bar combinations, which skips itself when the track temperature is within 4 °C of the baseline; combinations only decide on stints within 4 °C of each other; lap time in every score is corrected to one track temperature (s/°C measured from your own stints on the same setup, 0.08 s/°C until there is enough); the score also counts ride height at speed outside the downforce window; the next step says when today's track differs from the baseline's. |
| 0.15.56 | A baseline check after the ride-height or combination steps shows ride heights more than 2 mm from the baseline as not set up (with the value to put back), since such a stint does not count. |
| 0.15.57 | Test programme: the anti-roll bars are swept end to end like the springs (softest and stiffest the garage allows; an end the baseline is already at is skipped), and the bars combination goes halfway from the baseline towards the better end. A baseline step with the garage still on the last step says what to put back (e.g. LR RH 65.1 → 61.6 mm) instead of Change nothing. |
| 0.15.58 | Aero & ride height: a ride height and wing calculator. Change the static front and rear heights and the wing, and it predicts the ride heights at speed, rake, aero balance and splitter against the downforce window (more wing = more rear squash: 2.5% rear load per degree until your stints at other wings measure it; the bump-rubber model when the car rests on its rubbers). Get me into the window works out the static changes, the front only as low as the splitter or tech minimum allows. Test programme baseline checks are 3 laps in every text. |
| 0.15.59 | Test programme: a combination step whose sweeps say the baseline is right ticks itself (nothing to drive) and the programme moves on; untick it to drive it anyway. |
| 0.15.60 | Aero & ride height: rake charts. Rake against speed (every clean lap, braking in red, the typical rake per speed) and rake through the best lap (green inside the max-downforce window, orange outside, speed and corners marked), with how much of the time above 150 km/h is inside the window. The front and rear ride height chart shades the downforce windows. |
| 0.15.61 | Aero & ride height: the rake summary counts the fast corners (above 140 km/h and 0.8 g), and the speed chart shades their speeds. New: Fast corners, each one with its speed, front and rear ride height and rake against the window, balance, best vs typical pass and what is happening there; and Getting the fast corners into the window, each option (softer front springs, front static to the splitter or tech minimum, rear static up or down, less wing) worked out from the stint with its trade-off. Getting into the window also works out softer front springs with the bump rubber gap that lets the front sink to the window and catches it there (the bump-rubber model), and the test programme has a step for it: Front aero platform (softer front springs on the bump rubbers), after the springs combination, for cars with front bump rubbers and a downforce window. Check for updates shows checking straight away. |
| 0.15.62 | Test programme: an Aero platform block before the ride height, bars and dampers (cars with front bump rubbers and a downforce window). Each platform sets the springs, bump rubber gap and rear ride height together so the car runs as close to the downforce window at speed as those springs allow (worked out once from a stint), is driven as one step, and the best one (full score) becomes the baseline; then the mechanical balance (bars) and dampers are tuned on it. Replaces the single Front aero platform step. |
| 0.15.63 | Aero & ride height: Aero platform as a system. Change the front and rear springs, bump rubber gaps, static heights and wing and see the front and rear ride heights and the rake at every speed (now dashed, with your changes solid) against the downforce windows, the fast-corner speeds and the end of the straight with the braking point; plus the heights in the fast corners, at top speed and on the brakes, the splitter's lowest point, where each axle reaches its bump rubbers and the aero balance. Calibrated on the stint (ride height against speed on the straights, the spring and bump-rubber model); the programme's platforms load with one click. |
| 0.15.64 | Aero & ride height: Compare with another stint, side by side (track temperature, temperature-corrected lap, wing, springs, bump gaps, static heights, fast-corner front/rear/rake and time in the window, at speed, end of the straight, braking, splitter, top speed, drag index, fast-corner balance). Every stint now keeps those aero numbers and a drag index (from full-throttle acceleration on the straights). A live stint explains that ride heights come with the full-data stint and opens it. A paused car programme stays paused in the Test step overlay and Bono (the track check no longer takes over). Compare stints: Two stints side by side, any two stored stints (pace with the temperature taken out, what changed in the setup, balance, aero platform, dampers and track, tyres), from what each stint stored, so it works any time later; the live and full-data copies of a stint count once. |
| 0.15.65 | Aero & ride height opens with Aero platform at a glance: front, rear and rake against their windows in the fast corners, on the straights and at the end of the straight (green in, amber within 1.5 mm, orange out), a front-against-rear picture (the max-downforce window as a box, the rake window as a band, each fast corner, the straights and the end of the straight, and where the suggestion moves them), and the smallest static change to get in (the rake first when the splitter holds the front up). The spring and bump-rubber options are worked out on the platform model at their own speeds, so each spring shows its own fast-corner, top-speed and braking heights. |
| 0.15.66 | Suspension & track opens with Roll: roll gradient front and rear (°/g), front against rear, the outside front edge in the fast corners, roll against cornering g, the car from behind at your cornering g, and roll and outside/inside heights per fast corner. The test programme scores balance against your preferred balance (style and feel, Balance page), not a fixed touch of understeer; so does the two-stint comparison. Lower the front now says how: the static room left before the splitter or tech limit, then the front spring and bump gap options worked out from the stint, and what the bump gap alone does. |
| 0.15.67 | New overlay: Setup brief, a few one-liners on what the car is doing from your last stint (balance against your preference, aero front/rear/rake in the fast corners, roll and the outside front edge, tyres, slides) and the one change to try first; in the garage and pit stall. The Test step overlay hides unless a programme is running here. Rake charts: compare with an earlier stint (drawn dashed on both charts, with the fast-corner rake and time in the window before and now); every stint keeps its rake curves. The rake summary says inside, under or over correctly. Roll and the Aero page explain a live stint and open its full-data version. |
| 0.15.68 | Home: Setup, in order (aero platform, mechanical balance against your preference, tyres, dampers, brakes), each with its state and the change to make, and an Open button; the Setup brief's try-first is the first item not ticked. Ride-height suggestions use the downforce window when the car has one (no more rear −2 mm for 44.1 mm in a 40–44 window). Spring options that would take the front under the window at top speed or the splitter too close are no longer offered, and the platform says so when softer springs can't lower the front. |
| 0.15.69 | Compare stints, two stints side by side: At a glance pictures, A solid and B dashed: rake against speed with the max-downforce window, front against rear with arrows from B to A (fast corners, straights, end of the straight) over the window, and roll against cornering g front and rear with the outside front edge. Every stint now keeps its roll gradients and outside front edge. Aero & ride height: the summary, the At speed card and What to do measure against the downforce window (no more lower the rear 2 mm at 44.1 in a 40–44 window); new chart Front and rear against speed, each with its own window. |
| 0.15.70 | The 5-clean-lap rule counts every stint today on exactly the same setup (same car and track, within 2½ hours and 4 °C of track temperature; bias, TC, ABS, pressures and fuel don't count as setup changes), and says which stints it added. A live session no longer adds up stints with different setups. |
| 0.15.71 | Home: Since your baseline (the programme baseline, or your first stint today): every setting you changed, from and to, what each change does (tagged understeer / rotation / aero platform), how they add up, and the one change to undo first for what the car is doing now (pushing: the change that added understeer, bars first; loose or wheelspin: the one that freed the rear), then the next. The clean-lap count no longer counts a stint's own live copy. |
| 0.15.72 | Acura NSX GT3 EVO 22: the garage's spring range is built in (front 160–320, rear 120–280 N/mm, from the spring sweeps). Spring options stay inside it; with the front at its softest and the splitter at its limit, the app says the front is as low as it goes in the fast corners and points to the rake and balance instead. The full-data (.ibt) version of a live stint: the app keeps looking for up to 3 hours (it gave up after 10 minutes), finds the file by when the stint ended, and a live stint has a Load the full data now button. |
| 0.15.73 | Aero, Lower the front: goes through each option against the car's limits (static room left before the splitter minimum, springs already at their softest, bump gap only where the front is on the rubbers) and ends with a decision: what to change, what to leave, and when the front is done so you move on to the balance. |
| 0.15.74 | Balance: the legend shows the understeer and loose limits rounded (0.7°, −0.4°). Live stints have no GPS, so instead of a blank map the balance page draws your best lap as understeer against lap distance, with the slides marked; the track map comes with the full-data stint. |
| 0.15.75 | Balance: mid-corner split into coasting (off both pedals) and light throttle (5–40%) per speed band, with what it points at (front grip, or the diff and rear when it only pushes on throttle). Since your baseline: undo first also catches push in the medium and fast corners (averaging all speeds hid it), and prefers the front bar over the rear bar when the rear spins on exit. Roll chart: the cornering g label no longer sits on the last number. |
| 0.15.76 | Aero platform at a glance and Setup, in order: the max-downforce box is the target on the straights and at the end of the straight; in the fast corners (150–200 km/h, rolling) the target is the rake band. No static change when the straights are within 1.5 mm; a suggestion never pushes the end of the straight out of the box; with the front springs at their softest it says the front is as low as it goes. |
| 0.15.77 | Downforce points (top of Aero): downforce, drag and efficiency against a reference stint of the car (= 100, the programme baseline by default; make any stint 100), with an Aim for target (a rough guide from the track until 3 downforce levels are run there, then where your temperature-corrected lap times are quickest) and a downforce-against-drag chart of your stints. Compare with another stint shows the points. Pictures first: each section shows its charts, tiles and tables, the long text folds into ⓘ Explain (show explanations brings it back). Car tabs before Driver; Aero, Balance, Tyres, Brakes, Suspension in the order the work goes; the Aero tab leads with its pictures. |
| 0.15.85 | The Setup overlay, rebuilt around the driver cards: a status strip (balance, aero, roll, tyres, slides as coloured chips, the problem ones spelled out), then every change you switched on with its plain headline, the exact garage clicks (tab › section · setting from → to) and what you should feel. With iRacing running, each click ticks itself off (✓) as your live garage matches it, with "2 of 5 set in the garage" and "All set" when done; the from/save-as setup names at the bottom. Bigger default size (400×440), and text shrinks a little when the list is long. |
| 0.15.84 | Change cards written for the driver. Each card leads with what you feel on track ("The car won't turn in slow and medium corners"), with the measurement underneath; each option lists the exact garage clicks (Chassis › Rear · ARB blades: 4 → 3, in-car settings marked "or from the cockpit"); then "You should feel:" what the change should do. ⓘ Why gives a plain one- or two-sentence reason, with the engineer's notes, evidence and how sure the app is one level deeper. |
| 0.15.83 | Bumpy or smooth is now judged by how fast the wheels move over the bumps on the straights (shock speed, 90th percentile), not the body's vertical vibration, which read Sebring (51 mm/s, very bumpy) and Silverstone (45 mm/s) the same. GT3: under 38 mm/s smooth, 48+ bumpy; prototypes scaled 1.5×. Sebring now reads bumpy (softer, more mechanical advice), Silverstone medium; the Tracks table shows mm/s. Live stints without shock data still use the vibration. |
| 0.15.82 | Fix: a blank Aero tab. Every Aero section is now drawn on its own, so one that can't be drawn for a stint shows a one-line note (with the reason) and the rest of the tab still appears; any tab that fails says so instead of going blank. |
| 0.15.81 | Asymmetric setups when they're better. Starting pressures split left and right when one side heats up more (the outside of the track's main corner direction), so both reach the same hot pressure; the card says it's asymmetric on purpose. Balance is now measured separately in left- and right-handers per speed band; when the car pushes clearly more one way, the app suggests cross weight (±0.5% via the diagonal ride heights, front and rear heights unchanged) instead of a bar, which would change both directions alike. |
| 0.15.80 | The window map names its markers on the chart: the blue square says "straights" and the white triangle "top speed", so the legend only explains the fast-corner dots. |
| 0.15.79 | Downforce points you can trust: 100 is now the median of every stint on the baseline setup (same track, wing and springs), not one stint, and the reference and this stint use the same formula. Each number shows its stint-to-stint wobble (about ±7 points), and the Aim for tile only flags a gap bigger than that. The target is only fitted when 3+ wing or ride-height settings sit clearly apart, else it is a rough track guide. Drag points come from top speed (drag ∝ 1/top speed³ at the same track), since the acceleration fit swung 5× between identical stints; the unreliable drag index row is gone from the comparison. Without drag the chart shows your stints over time. |
| 0.15.78 | Fewer words on screen: the What to change cards keep the title and options, the reasons fold under ⓘ Why; the bars box keeps its verdict with the theory under ⓘ Why the bars; long explanation lists (bars, car character, damper shapes) fold into ⓘ Explain while verdicts and tips stay. Aero: the What to do box and Optimal rake use the same 1.5 mm rule as the platform at a glance, so they no longer ask for a change when you are in the box; the ride-height options fold under ⓘ The options. |
| 0.15.15 | Test programme: each step shows the baseline value (not the open stint's) and, once done, what you ran; a stint that made a step's change but changed other settings too is listed on that step with what else changed, and the open stint says so at the top. Brake bias, TC, ABS and fuel never stop a stint counting. |
| 0.15.14 | Bono counts clean laps again (0.15.13 reused a name, so every lap looked too slow). Balance tab: "Where it pushes or slides, and why": every corner split into entry, mid (to the apex) and exit, each marked understeer / oversteer / neutral and driving, setup, or both, judged lap against lap (more push on faster turn-ins, off the brake before turning, slides on earlier throttle) with what to change. |
| 0.15.13 | Balance: judged near the grip limit (75%+ of the cornering g the car makes at that speed), so light-load stretches no longer water exit and entry down to "neutral"; one scale everywhere (neutral to 0.7°, slight understeer to 1.6°, oversteer below −0.4°), the same as Bono. Gears (GP tab): the best exit gear for each corner from the engine's power curve and your apex speeds, the fastest speed to change down into it, and late downshifts. Clean laps: Bono counts them the way the learning does (up to 0.5 s off track, within 3% of your best) and logs laps it leaves out; the test programme lists the laps it didn't count and why. |
| 0.15.12 | Live: when the app opens your latest recording and there isn't one at the track you're on yet, it keeps checking and switches to one there as soon as it's written. Meanwhile the test programme says you're live elsewhere instead of offering a programme for the other track. |
| 0.15.11 | Test programme: when a stint runs a whole different setup from the baseline (5+ settings), it says so at the top and offers to make that setup the baseline; the programme then starts again from that stint (which counts). The baseline setup's name is shown. |
| 0.15.10 | Team radio voices are off by default (and switched off once on existing installs); turn them on under Overlays → Team radio. |
| 0.15.9 | Overlays (Bono, Hanna, GP) show whenever iRacing is connected, garage and pits included; an overlay dragged off screen is pulled back. Back in the garage after a stint, every tab switches to that live stint even if a recording was open. Connected with nothing open: your latest recording in that car (this track first) opens by itself, so the tabs are never empty. |
| 0.15.8 | Starting setup from the models (Tracks tab): for any car + track, including this and next week's tracks you haven't driven: your best setups at the most similar tracks blended by similarity, then wing from the track's downforce need, static ride heights from the aero platform at the track's speed (with the Nordschleife 70 mm rule), dampers for the track's bumps, anti-roll bar toward your balance target, starting pressures from your hot window and the track temperature, fuel per lap. Each setting says where it came from and how sure it is, plus what to check on the first laps. |
| 0.15.7 | Wind tunnel: still streamline picture by default (coloured by air speed, smooth wake behind the car and wing), optional animation, a Stop button while the models run; the animation never runs while you're on track. |
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

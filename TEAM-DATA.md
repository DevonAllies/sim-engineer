# Team event data for other apps

Setup Engineer keeps each team race's plan in the shared team folder (a Google Drive folder synced to every teammate's PC). Any app can read it straight from disk: Setup Engineer doesn't need to be running, and there's nothing to log in to.

The files are rewritten whenever a teammate's Setup Engineer has something new (a stint shared, the Team events page opened), and Google Drive syncs them to everyone.

## Where

```
<team folder>\
  team.json                     team key and owner
  events\
    index.json                  every event
    <event id>\
      event.json                the event as created
      plan.json                 the plan: read this one
      plan.csv, fuel-map.csv    the same for Google Sheets (when someone saved them)
```

The team folder is wherever the user added it in Google Drive for desktop, usually `G:\My Drive\Setup Engineer team`. Find it by looking for a `team.json` whose `key` starts with `SE1-`.

## events/index.json

```json
{
  "v": 1,
  "updated": "2026-11-18T11:02:17.372Z",
  "events": [
    { "id": "20261118-k3x9q", "name": "Silverstone 3h", "carName": "Acura NSX GT3 EVO 22", "trackName": "Silverstone",
      "date": "2026-11-29", "hours": 3, "folder": "events/20261118-k3x9q", "plan": "events/20261118-k3x9q/plan.json",
      "in": ["Devon", "Jason"] }
  ]
}
```

## events/<id>/plan.json

```json
{
  "v": 1,
  "updated": "2026-11-18T11:02:17.372Z",
  "event": { "id": "20261118-k3x9q", "name": "Silverstone 3h", "car": "acuransxevo22gt3", "carName": "Acura NSX GT3 EVO 22",
             "track": "341", "trackName": "Silverstone", "date": "2026-11-29", "hours": 3, "startedBy": "Devon" },
  "replies": [
    { "name": "Devon", "reply": "in", "stints": null, "maxStints": null },
    { "name": "Jason", "reply": "in", "stints": "2-4", "maxStints": 2 }
  ],
  "drivers": [
    { "driver": "Devon", "laps": 9, "bestLap": 120.133, "typicalLap": 121.4, "lapSpread": 0.863, "fuelPerLap": 3.758,
      "coastingPerLap": 12.17, "fuelSavedPerSecondCoasting": 0.045, "frontTreadPerLap": 0.333, "rearTreadPerLap": 0.111 }
  ],
  "plan": {
    "tank": 56, "fuelPerLap": 3.758, "typicalLap": 121.4, "lapsPerTank": 13, "raceLaps": 90, "stops": 6, "pitLossTotal": 360,
    "stints": [
      { "stint": 1, "driver": "Devon", "fromLap": 1,  "toLap": 13, "laps": 13, "fuelAtStart": 52.7, "fuelToAdd": null, "canDrive": ["Devon"] },
      { "stint": 2, "driver": "Jason", "fromLap": 14, "toLap": 26, "laps": 13, "fuelAtStart": 52.7, "fuelToAdd": 48.9, "canDrive": ["Jason", "Devon"] }
    ]
  }
}
```

- Times are seconds, fuel litres, tread in % per lap. `null` means not measured yet.
- `fuelToAdd` is what to add at the stop that starts that stint (`null` for the start). It assumes you arrive with the safety margin still in the tank.
- `plan` is `{ "missing": "…why…" }` until someone in the event has driven a stint in that car at that track.
- `reply` is `in`, `no` or `paused`. `stints` is the stints a driver said they can do (`"2-4"`, `"1, 3"`), `maxStints` the most they'll do.
- `v` changes if the format ever changes in a way that breaks readers.

## Reading it (example, Node)

```js
const fs = require('fs'), path = require('path');
const team = 'G:\\My Drive\\Setup Engineer team';
const index = JSON.parse(fs.readFileSync(path.join(team, 'events', 'index.json'), 'utf8'));
const next = index.events.sort((a, b) => a.date.localeCompare(b.date))[0];
const plan = JSON.parse(fs.readFileSync(path.join(team, next.plan), 'utf8'));
for (const s of plan.plan.stints || []) console.log(`Stint ${s.stint}: ${s.driver}, laps ${s.fromLap}-${s.toLap}, add ${s.fuelToAdd ?? 'start'} L`);
```

Treat the files as read-only: only Setup Engineer writes them, and a change made by another app is overwritten next time.

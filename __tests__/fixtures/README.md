# Route derivation fixtures

Real-device GPS traces extracted from the user's SQLite backup, used by Tasks 4–5 as
inputs to the GPS route derivation tests. Each fixture is JSON of shape
`{points: GpsPoint[], events: ActivityEvent[], anchors: RouteAnchor[]}`.

`points` = `gps_track` rows for the day. `events` = **all** `activity_events` rows with
`timestamp <= last point timestamp` — no lower bound. This is intentionally
production-faithful: `routeHistoryService.refreshRouteDayOnce` feeds `deriveRouteDay` via
`getActivityEventsThrough(endTs)`, which likewise has no lower bound, because an activity
state active at the day's first fix may have been entered hours or days earlier — clipping
at the day's start can drop that opening `enter` and corrupt the replayed initial state.
`anchors` = all `locations` (`type: 'saved'`) and `named_places` (`type: 'reusable'`) rows,
i.e. every saved/reusable place in the account — not filtered per day, so both fixtures
carry the same 7 anchors.

## `routeDay-65196.json`

2026-08-21, day_id 65196. Commute day with a mid-drive pause 12:37–12:42. 1140 points,
2106 events, 7 anchors.

## `routeDay-parkkipaikka.json`

2026-08-19, day_id 62593. Picked as the most recent day whose morning stop sequence shows
the parkkipaikka-before-Easy-Turku pattern: the user parks at "Easy Turku parkkipaikka",
then the day's derived stops include an intermediate stop, then "Easy Turku" itself. This
gives future derivation-fix tests a real "Easy Turku" stop to target. Persisted stop
sequence for that day (`day_route_stops`):

1. `05:48:54.857Z` — Easy Turku parkkipaikka
2. `09:01:05.564Z` — Työturvallisuuskoulutus ja Tulityökoulutus Teppo Suominen Oy Turku
3. `09:22:57.024Z` — Easy Turku

(2026-08-20/day_id 64421 is one day more recent and also starts at "Easy Turku
parkkipaikka", but its stops never resolve to "Easy Turku" — it only has parkkipaikka →
Home — so it doesn't fit the target pattern and was skipped in favor of 62593.)

1185 points, 1972 events, 7 anchors.

Extracted from realUserData backup 2026-08-24; single-user app, no privacy concern (see
kelomit-realuserdata-backups memory).

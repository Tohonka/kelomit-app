# How a day's worked-hours are calculated

Source of truth: `src/utils/hoursUtils.ts` (`calcDayWorkBreakdown`). This is the
"work day is the minimum" model. **Priority 1 is the day's own start/end time.**

## The rule in one line

`worked = max(0, day span + work outside the span − personal inside the span)`

…where each note is **placed** on the timeline by its from- and to-time.

## Every note now has a from→to (since migration v12)

As of Iteration 5.2, *all* notes carry a real `time_from`/`time_to`, so every
note can be placed precisely. There are three ways a note gets its span:

- **Range note** — you pick from and to directly.
- **Duration note** — you enter a length; the app stores `start → start+length`.
  Start defaults to **now** (creation time) but you can set it explicitly in the
  editor ("Start (optional)"). `duration_sec` is still kept as the number you
  typed; the span is derived from it.
- **Timer / quick-add** — start = when it ran / now, to = +elapsed.

Migration v12 backfilled old duration-only notes with `start = created time`,
`to = +duration`, so history is consistent too. A note with `duration_sec` but
no `time_to` should now only exist transiently — the duration-only rows in the
table below are the **legacy fallback**, kept defensively.

## Table

Day has a start + end time set ("legs"). For each note:

| Note has…                 | Activity        | Effect on worked hours                          |
|---------------------------|-----------------|-------------------------------------------------|
| from–to, **outside** legs | work            | **adds** the outside portion ("after hours")    |
| from–to, **inside** legs  | work            | nothing — the day span already covers it        |
| from–to, **straddling** a leg edge | work   | **adds only the outside slice** (it's split)    |
| from–to, **inside** legs  | personal        | **deducts** the inside portion                  |
| from–to, **straddling** a leg edge | personal | **deducts only the inside slice**             |
| from–to, **outside** legs | personal        | nothing (it's outside the work day)             |
| anything                  | personal_work   | nothing — it's only a label (see below)         |
| unconfirmed to-do         | any             | nothing until it's completed                    |
| _(legacy)_ duration only  | work / personal | adds / deducts the full duration                |

Straddle, multi-leg gaps, and overlapping legs are all handled by interval math
(`merge`/`intersect`/`subtract` in `hoursUtils.ts`): legs are merged so an
overlap is counted once, and a note that crosses a leg boundary is split at the
edge — never all-or-nothing.

**No start/end set for the day:** there's no baseline, so we just sum the
`work` notes' time. Personal doesn't deduct (nothing to deduct from).

**Clamp:** worked can't go below 0 — if personal deductions exceed the span
plus after-hours work, the result is 0, not negative.

## personal_work is a label only

`personal_work` ("Personal (work)") never adds and never deducts — it's a tag
for "personal stuff that still counts as work time," and the day span already
covers it when it's inside the legs. It does **not** add when it falls outside
the legs (unlike `work`). If you do contract-counted work after hours, log it as
`work`, not `personal_work`.

## Tracked vs worked — two different numbers

- **Tracked** = the plain sum of every note's length. It's "how much did I log,"
  and overlapping notes are summed twice. It can exceed the day span.
- **Worked** = the placed model above. This is the hours figure.

Don't read "tracked" as "coverage of the work day" — two notes over the same
hour count as two hours of tracked, one hour of the span.

## Worked example (the messy day)

Day legs: **09:00–16:00** (7h) and **20:00–22:00** (2h) → span **9h**.

| Note                         | Span        | Where        | Effect       |
|------------------------------|-------------|--------------|--------------|
| Bughunt (work)               | 09:00–10:00 | inside leg 1 | —            |
| Vibing (work)                | 10:00–11:45 | inside leg 1 | —            |
| Early lunch (work, duration) | 12:00–13:00 | inside leg 1 | —            |
| Cleaning (work, duration)    | start+15m   | wherever its start lands | — if inside, **+15m** if outside |
| Meeting (work)               | 14:30–15:30 | inside leg 1 | —            |
| Phone meeting (work, dur.)   | 17:45–18:00 | in the gap   | **+15m**     |
| Night driving (work)         | 20:00–22:00 | inside leg 2 | —            |
| Car wash (work, duration)    | 22:30–22:45 | after leg 2  | **+15m**     |

Worked = 9h span + 15m (phone) + 15m (car wash) [+ 15m cleaning **iff** its
start is outside a leg] = **9h 30m** (or 9h 45m if cleaning lands outside).

The key difference from the old hand-written sample: **Cleaning is no longer a
free-floating "counted in full" item.** It has a start now (its creation time,
or one you set), so it's placed like everything else — if its 15 minutes fall
inside a leg, they add nothing; only if outside do they add. Set the start
deliberately when it matters.

## Edge: a duration note that crosses midnight

A duration note started near midnight ends on the next calendar day, so its
"to" sits past 24:00 — outside that day's legs, counted as a few minutes of
after-hours work. Rare; set an explicit earlier start if it bites.

## Quick worked examples

- Day 09:00–17:00 (8h), + "2h work" duration starting 18:00 → **10h** (after hours).
- Day 09:00–17:00 (8h), + "2h work" duration starting 10:00 → **8h** (inside, no add).
- Day 09:00–17:00 (8h), + "1h personal" 12:00–13:00 → **7h**.
- Day 09:00–17:00 (8h), + work note 18:00–19:00 → **9h** (after hours).
- No day start/end, + "2h work" duration → **2h**.

## Small-task notice (soft "outside the workday" warning)

`spanIntersectsDayLegs(day, from, to, usualEndIso)` decides whether a small task
touches the day's legs. Rules:

- No legs on the day → no notice.
- Open leg (started, no end) → extends to +∞.
- A leg's end is trusted as-is **only when `ended_at_source === 'manual'`**. A
  geofence `'auto'` end (or a legacy unsourced one) is a guess — the user may
  still be working — so the leg extends to `max(ended_at, usual end + 2 h)`,
  or `ended_at + 2 h` when the day has no usual end (day off / unset).
  `DAY_END_GRACE_SEC` in `hoursUtils.ts`. Usual hours come from the Work
  details setting (`usualHoursForDate`), not from history.
- Leg 2 has no source column and is only ever set by hand → trusted.

This is display-only: it never changes any hours calculation above.

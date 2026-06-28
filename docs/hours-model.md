# How a day's worked-hours are calculated

Source of truth: `src/utils/hoursUtils.ts` (`calcDayWorkBreakdown`). This is the
"work day is the minimum" model. **Priority 1 is the day's own start/end time.**

## The rule in one line

`worked = max(0, day span + work outside the span − personal inside the span)`

…where each note contributes based on whether it can be **placed** on the
timeline (has both a from- and a to-time) or not (duration-only / no to-time).

## Table

Day has a start + end time set ("legs"). For each note:

| Note has…                | Activity        | Effect on worked hours                          |
|--------------------------|-----------------|-------------------------------------------------|
| from–to, **outside** legs | work            | **adds** the outside portion ("after hours")    |
| from–to, **inside** legs  | work            | nothing — the day span already covers it        |
| from–to, **inside** legs  | personal        | **deducts** the inside portion                  |
| from–to, **outside** legs | personal        | nothing (it's outside the work day)             |
| duration only (no "to")   | work            | **adds** the full duration                      |
| duration only (no "to")   | personal        | **deducts** the full duration                   |
| anything                  | personal_work   | nothing — it's only a label                     |
| unconfirmed to-do         | any             | nothing until it's completed                    |

**No start/end set for the day:** there's no baseline, so we just sum the
`work` notes' time (duration-only included). Personal doesn't deduct (nothing
to deduct from).

## The one gotcha (accepted)

A **duration-only** note can't be located in time, so it's counted in full. If
that duration actually overlaps time already inside your start/end span, it
**double-counts**. Fix: give the note real from–to times when you want it placed
exactly. Duration is for "this much happened, don't care exactly when."

## Worked examples

- Day 09:00–17:00 (8h), + manual "2h work" duration → **10h**.
- Day 09:00–17:00 (8h), + "1h personal" duration → **7h**.
- Day 09:00–17:00 (8h), + work note 18:00–19:00 (from–to) → **9h** (after hours).
- Day 09:00–17:00 (8h), + work note 10:00–11:00 (from–to, inside) → **8h** (no double count).
- No day start/end, + "2h work" duration → **2h**.

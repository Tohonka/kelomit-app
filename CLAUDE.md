# Kelomit-app - Project context, MVP

## Project overview and intent

Keep track of my workday and hours by using notes, photos, videos and voice recordings. Also for personal time. My adhd-autistic head can't keep track of anything anymore. For real though, I have severe ADHD with a hint of ASD, both diagnosed. That should be one guideline.

## Platform and tech

- For android
- React-native (so could later be used on iOS if needed)
- Should use database. I think sqlite or similar should do the trick as it's local data.

## Style

- I like warm colors, clean shapes with a hint of retro vibes. The app should be visually "Friendly". Will define better after MVP.

## Basic views

- Home, overview of current day, buttons to add notes.
- Calendar view (day/week/month), also custom range. Day view is a list.
- "Clicking" a day in week/month view will show that day in the day view mode.
- Settings

## functionality

- Allows me to take photos, notes, videos and voice recordings. App keeps track of these. Also, option to add from gallery.
- Option to add a title and a text note to photo, video or voice recording.
- Option to add either duration or from-to -timestamps for hour tracking.
- UI focuses on fast and easy use.
- Single day is considered an "object" for tracking hours and events during said day and content related to it.
- Calendar view will show hours worked for selected time period.
- User can add a manual day started / day ended -time for the day. This should be editable in the day-view.
- An activity is marked either: Work (default), Personal (during work) and Personal. Intent: Keep track if work housed used for personal things so they won't count towards hours worked. Personal is just personal and ignored from all time calculations, more like a journal.
- For later consideration: Support for using different LLM-services to interpret photos, videos and voice notes (convert speech to text).
- GPS-tracking, user can disable if they want. For MVP, let's just save where the user (me) has been during the day and tag content with current location. Considerations on limiting gps-drift/jumping: Android Activity detection API (react-native-activity-recognition). Also Outlier rejection with reasonable margins. Maybe Kalman filter for smoothing noisy data? Most reasonable base: Perhaps react-native-geolocation-service set to use Google Fused Location Provider?
- Option to export data as csv or other format.

## Interoperability, Future plan

- Need readiness for online sync. I have a server ready, so this option should be taken into account when making choices.
- Intention is to allow viewing and editing days on a regular browser.
- Server is a Hetzner CCX23 with 16gigs of ram. It is running docker, so a new dedicated environment will be made for this app.

## Suggestions, ideas

I'm also taking recommendations of what could be added for keeping track of my days easily.

Okelie dokelie. Got the maps api figured out, secured some hard usage limits and found out that maps sdk is free for basic use on android apps. API key is in the .maps.env file, didn't know where else to put it right now.

# fixes and changes for version 0.3.0

- Make sure that everything is on the latest version possible, as little deprecated stuff as possible. Especially regarding the audio recorder.
- The bottom "more" menu. I think it should be excluded from the 300ms delay. In fact, it should follow the finger on drag like the android notification center so it's clear that there is content. So, touch to toggle instantly, drag up to open manually.
- Bottom navigation: By default, always visible. Setting in the UI part that let's user select if they want it visible only on homescreen or always.
- Got the following comment from an audit a friend (or most likely some AI did): The manifest includes modern granular media permissions and old external storage permissions with max SDK caps:
-- `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `READ_MEDIA_AUDIO`: `android/app/src/main/AndroidManifest.xml:9-11`.
-- `READ_EXTERNAL_STORAGE` with `maxSdkVersion="32"` and `WRITE_EXTERNAL_STORAGE` with `maxSdkVersion="28"`: `android/app/src/main/AndroidManifest.xml:12-15`.
--- This is broadly compatible. However, for future Google Play distribution, using Android's system photo picker can reduce or remove the need for broad media-library permissions when selecting existing photos/videos.

# gallery, "the big change"

- A simple gallery view of the images taken with the app. A modern grid view, grouped by day, week or month (selection on top). When user touches an image, it opens  a modal with the note info.
- Secondary action on all images: Ability to touch-open and then zoom.
- Gallery will live in the "more" section of navigation, as it is more for fun than need. Secondary reason: I sometimes use just photos as a diary when going through a "closed" phase with my asd or adhd.

# map view, relates to gallery

- I think the logical place for the map view is within the gallery, or it's own section. I feel like creating a new section for everything makes things too busy. The calendar -section would also work. Open to suggestions.

# Hour calculation logic

- "Work day" consists of the full from-to hours at minimum. So visualizations, charts etc. should count that as tracked time.
- The projects, tags, durations and work type are specifiers, adding accuracy to tracking. If a work item is outside the defined "Work day", it is added to the hours.
- If there is a personal thing - not work(personal) but actually personal - within the "from-to" segments of a work day, that time will be deducted from work time.
- Add an option to settings to define "usual working hours", so a simple from - to time. Only one set. This will not be used to prefill the daily data, unless user so chooses in the settings.

# gps logic

- Adjustment for the GPS radius for work/home detection. Default can stay at 150 meters. To protect user, minimum shouldn't be able to be set too low. I feel like 50 meters is the absolute minimum value, don't see the benefit of a lower radius in this specific use case.
- Now it counts "home" as the end of a work day. Let's change it to when the user leaves office within 30 minutes of the usual "to" time in the settings. If no such time is set, use arrival at home.
- Secondary method of end of day decision: If the user leaves the radius for more than 1 hour, set the "left" time as end of day. If the end of day differs by more than 1 hour of the usual time (if set), ask the user if it was the end of workday. Push notification could work here, and internal confirmation log with a quick yes/no button.

# personal note
- My brain goes brrrrrrrr quite easily, so feature creep is a thing that could happen. This far, these are things that i'd thought about while using the app. Map: "Where was this exactly...". Breakdowns: "have I really spent x amount of time on this". GPS: Just to help with memory. Gallery: The last-resort "diary".

# Future needs / ideas

- Some sort of quick set timer, can't fully explain yet.
- Widget support
-- A button/buttons that lets me map a project and tags to it, then push it to start, push it to end. It logs "duration" and adds it to that day. The Philips Hue app uses these (single icon size) to toggle scenes or lights.
-- A full width widget that shows the current session duration with said button.
- Intent: When functionality grows, next step needs to be focusing on trimming things down and making it more intuitive and faster to use. This will be the next big push that needs a longer real world testing set from me.

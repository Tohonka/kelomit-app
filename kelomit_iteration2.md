# Changes to Kelomit-app

Notes and needed changes based on on-device use of the app.

## Functionality

- Implement the previously talked about "share to" functionality.
- Export as xlm, export as Json needed in addition to csv.
- Calendar views not updating hour data unless user changes views.
- Time selector: Current scrollable version slow to use. Needs to be a hybrid: User can type in the time, or select from UI. The "analog clockface" selector is preferred, but this needs to be an option.
- Reg. previous: Settings menu needs subsections at some point, so let's start now. Interface will be where the time selector lives.
- Swipe to change month/day doesn't work well. Most often no change on swipe. Also, doesn't go in order (If swipe right from say, monday june 8th, it goes to 9th. Then swiping right isn't possible. Swiping back left goes to sunday june 7th).
- In "Today" view. Add a hour calculation to each partial day segment. The upper right corner on the day view is the total hours. This helps user to see at a glance if there are significant errors when they set the times.
- In calendar when a day is selected for viewing. The empty area between the "header" and total hours row and the row with tags/project names. It should have a visual, color coded representation on how the day was split between projects/tags. This is mostly for fun for now :)
- New button for navigation: Not sure about the name, but intent: It will contain breakdowns and different options for visual and text representation on my time use.
- Keeping clutter down. I need search functions and other neat little things. So, I propose a dual functin menu: Default is the 3 base icons. Other functionality like search and the "new button that I don't know the name of" will be accessible by pulling up the menu. It needs a tiny "hold finger" delay, perhaps 300ms to avoid accidental pulls.
- Quick add note: Holding finger on the + button will extend it to offer a "quick add" for each item type. This requires a new setting submenu: Quick add. User will set the default tags, projects etc from there. If not set, default is "work", tag is "Quick add". Quick add is a modal that only offers option for title and duration (no to-from). By default, duration is "none", and it is just a simple item add.
- Need to be able to add a new project directly on the add entry -view. So, a "New project" button is needed there. When amount of projects increase, I'm not sure if the rolling row is the best option. The rolling should show 3 most used projects and some sort of "type to search" field.

## Small issues

- When adding tags, I'm writing blind. Keyboard covers the input field. Two possible solutions. 1: Dynamically move the view up with the keyboard so that input stays visible. 2: Add a "helper modal" for input that is shown above the keyboard. Modal could offer extended options for future features. The issue is for the description field and other fields too, essentially. What is the modern suggested solution for this? I suspect google has some ideas for UX design on things like this too.

## Bigger feature additions

- Future items: Add an item for upcoming days, if a task is to be done later. It will be marked as "to do". If duration is set, it is not considered completed work hours until confirmed on or after the date.
- Optional notification from the app that pops up at a specified time before the item.
- Upcoming items that are coming "next day" should be visible on the "today" view, at the very bottom. Visually different. On fridays, monday is considered to be "next day" in addition to saturday.
- Calendar view: The week view should show a list of upcoming items that week if there are any.
- Use the GPS-data. Possibility to set / use work and home location. If possible, could offer to use android / google maps home/work locations, if that data is available to apps. If not, user can set a work location with a simple "Currently at work" that saves the position.
- GPS use intention: Allow user to add a "radius" and an optional to-from timeframe. If the location is within these parameters, it should pre-set the from-time when user arrives to work and set the to-time when leaving. It would not overwrite values that user has written themselves. This data should be saved anyway. Specifically, log every time the user (me) leaves the radius. This will help me remember things if I miss logging things manually.
- Preparation: Map view for gps data. Items plotted over the map. Does google provide map access for this use?
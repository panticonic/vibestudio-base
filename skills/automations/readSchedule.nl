---
description: Read a scheduling request into its parts, without doing date arithmetic.
args:
  request: string
returns: ScheduleReading
---
Fill in a ScheduleReading for request. Take each field from the words of the request only; leave a field null (weekdays empty) when the request does not say it.
1. cadence: "manual" if the work only runs when asked. "interval" if it repeats after an elapsed time ("every 15 minutes", "every 2 hours", "hourly", "daily" with no time of day). "calendar" if it names wall-clock times ("every day at 9am", "Thursdays at 05:05", "on the 1st at noon").
2. For interval, set everyMinutes in minutes. For calendar, set hour in 24-hour time and minute; add weekdays for named weekdays, or dayOfMonth for a day of the month. "Weekdays" means MON, TUE, WED, THU, FRI.
3. timezone only if the request names a place or zone; use its IANA name ("New York time" is America/New_York).
4. An end condition: lastDay for an absolute end date, forDays for "for the next N days/weeks", maxRuns for "N times". Leave the others null.

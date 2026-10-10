# Golden Hour

_Also in this repo: [Nearby Owners](nearby-owners/), which flags non owner-occupied homes near you in Tarrant County._

A small phone-friendly web app that tells you when golden hour is where you are.

**Live:** https://briangooding.github.io/bg_github/ (once GitHub Pages is turned on — see below)

- Uses your phone's location, or a city / coordinates you pick
- Countdown to the next golden hour, or how much is left if it's happening now
- Today's sunrise, sunset, golden hour and blue hour, with a day timeline; pick any date to plan ahead
- **Remind me 30 min before**: one tap adds the next golden hour to your calendar with an alert 30 minutes ahead
- More reminders:
  - **Add to calendar** downloads an event (optionally the next 7 days) with an alert 0–60 min before.
    This works even when the app is closed.
  - **Alert in this app** rings with a notification while the app is open.
- Add to your home screen for an app-like icon and full-screen view

Golden hour = sun between 6° above and 4° below the horizon; blue hour = 4°–6° below.
Sun positions use Jean Meeus's algorithms (`sun.js`) and match the PyEphem reference
library to within 5 seconds.

## Hosting on GitHub Pages

Settings → Pages → Build and deployment → Source: **Deploy from a branch** →
Branch: `claude/golden-hour-location-app-6iyw88`, folder `/ (root)` → Save.

## Run locally

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

Location access needs `https://` or `localhost`.

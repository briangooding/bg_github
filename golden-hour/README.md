# Golden Hour

A small phone-friendly web app that tells you when golden hour is where you are.

**Live:** https://briangooding.github.io/bg_github/golden-hour/

- Uses your phone's location, or a city / coordinates you pick
- Countdown to the next golden hour, or how much is left if it's happening now
- **Sun right now**: a live map of where you are with the sun's compass direction, sunrise/sunset directions and which way shadows fall, plus a gauge of how high the sun is (golden-hour band marked)
- Today's sunrise, sunset, golden hour and blue hour, with a day timeline; pick any date to plan ahead
- **Remind me 30 min before**: one tap adds the next golden hour to your calendar with an alert 30 minutes ahead
- More reminders:
  - **Add to calendar** downloads an event (optionally the next 7 days) with an alert 0–60 min before.
    This works even when the app is closed.
  - **Alert in this app** rings with a notification while the app is open.
- **iPhone app:** open the Live link in Safari, tap Share, then **Add to Home Screen**. It opens full
  screen with its own icon, keeps working without signal (except map tiles), and Safari shows a
  one-time tip explaining this

Golden hour = sun between 6° above and 4° below the horizon; blue hour = 4°–6° below.
Sun positions use Jean Meeus's algorithms (`sun.js`) and match the PyEphem reference
library to within 5 seconds and 0.05° of direction. Map: Leaflet (bundled in `vendor/`)
with OpenStreetMap tiles.

## Run locally

```sh
python3 -m http.server 8000   # from this folder, then open http://localhost:8000
```

Location access needs `https://` or `localhost`.

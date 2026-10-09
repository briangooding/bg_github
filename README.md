# Golden Hour

A tiny web app that tells you when golden hour is for your current location.

- Uses your browser's location (or coordinates you type in)
- Live countdown to the next golden hour, or how much is left if it's happening now
- Today's sunrise, sunset, morning/evening golden hour and blue hour, plus a day timeline
- Pick any date to plan ahead
- No dependencies, no network calls — the sun position math runs locally (`sun.js`)

Golden hour is defined as the sun between 6° above and 4° below the horizon; blue hour is 4°–6° below.

## Run

Open `index.html` in a browser, or serve the folder (geolocation needs `https://` or `localhost`):

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

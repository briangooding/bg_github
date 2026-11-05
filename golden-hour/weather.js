// "Weather for golden hour": forecast clouds, rain, visibility and air quality for the next golden
// hour (or the one on the day being viewed), and what they are likely to do to the light.
// Data: Open-Meteo (free, no key). A rough guide, not a guarantee.
(function () {
  const WX = 'https://api.open-meteo.com/v1/forecast';
  const AQ = 'https://air-quality-api.open-meteo.com/v1/air-quality';
  const FRESH = 30 * 60000;
  let data = null, loading = null, failed = '', triedAt = 0;

  const key = () => `${state.lat.toFixed(2)},${state.lng.toFixed(2)}`;
  const cache = {
    get() { try { return JSON.parse(localStorage.getItem('gh-weather')); } catch { return null; } },
    set(v) { try { localStorage.setItem('gh-weather', JSON.stringify(v)); } catch {} },
  };

  async function getJSON(url) {
    const res = await fetch(url);
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) {
      const err = new Error(body.reason || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return body;
  }

  async function load() {
    const k = key();
    const saved = cache.get();
    if (saved && saved.key === k && Date.now() - saved.at < FRESH) { data = saved; return; }
    const q = `latitude=${state.lat.toFixed(3)}&longitude=${state.lng.toFixed(3)}&timezone=GMT&timeformat=unixtime`;
    const [wx, aq] = await Promise.allSettled([
      getJSON(`${WX}?${q}&forecast_days=16&hourly=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,precipitation_probability,weather_code,visibility`),
      getJSON(`${AQ}?${q}&forecast_days=7&hourly=pm2_5,aerosol_optical_depth,dust,us_aqi`),
    ]);
    if (wx.status === 'rejected' && aq.status === 'rejected') throw wx.reason;
    data = { key: k, at: Date.now(), wx: wx.value ? wx.value.hourly : null, aq: aq.value ? aq.value.hourly : null };
    if (wx.value) cache.set(data); // keep a full answer only
  }

  // The golden hour to report on: the current or next one today, else the viewed day's evening.
  function target() {
    if (!viewingToday()) {
      const w = windowsFor(state.date);
      return w.find((x) => x.name.startsWith('Evening')) || w[0] || null;
    }
    const now = new Date();
    for (let i = 0; i < 3; i++) {
      const d = new Date(now); d.setDate(d.getDate() + i);
      const hit = windowsFor(d).find((x) => x.w.end > now);
      if (hit) return hit;
    }
    return null;
  }

  // Value of each series at the hour nearest `t`, or null if the forecast doesn't reach it.
  function at(hourly, t) {
    if (!hourly || !hourly.time || !hourly.time.length) return null;
    const s = t.valueOf() / 1000;
    let best = 0;
    for (let i = 1; i < hourly.time.length; i++) if (Math.abs(hourly.time[i] - s) < Math.abs(hourly.time[best] - s)) best = i;
    if (Math.abs(hourly.time[best] - s) > 2 * 3600) return null;
    const out = {};
    for (const k of Object.keys(hourly)) if (k !== 'time') out[k] = hourly[k][best];
    return out;
  }

  const aqiName = (v) => v <= 50 ? 'Good' : v <= 100 ? 'Moderate' : v <= 150 ? 'Unhealthy for sensitive groups'
    : v <= 200 ? 'Unhealthy' : v <= 300 ? 'Very unhealthy' : 'Hazardous';

  // Turn the numbers into a verdict and plain-language notes. Simple rules of thumb.
  function assess(w, a) {
    const notes = [];
    let level = 2; // 2 promising, 1 mixed, 0 poor
    const down = (n) => { level = Math.min(level, n); };
    if (w) {
      const low = w.cloud_cover_low ?? 0, mid = w.cloud_cover_mid ?? 0, high = w.cloud_cover_high ?? 0, total = w.cloud_cover ?? 0;
      const rain = w.precipitation_probability ?? 0, vis = w.visibility, code = w.weather_code ?? 0;
      if (rain >= 60 || code >= 61) { down(0); notes.push(`Rain likely (${rain}% chance): grey, flat light.`); }
      else if (rain >= 30) { down(1); notes.push(`Some chance of showers (${rain}%).`); }
      if (low >= 70 || total >= 90) { down(0); notes.push('Thick or low cloud is likely to hide the sun: soft, grey light and little color.'); }
      else if (low >= 40) { down(1); notes.push('Patchy low cloud may block the sun at times.'); }
      if (low < 40 && total < 90 && mid + high >= 20) notes.push('High or mid-level clouds can catch orange and pink light: good odds for a colorful sky.');
      else if (total < 10) notes.push('Clear sky: warm direct light, but little color in the sky itself.');
      if (vis != null && vis < 2000) { down(0); notes.push('Fog or mist: very soft light, the sun may not show.'); }
      else if (vis != null && vis < 8000 && rain < 30) { down(1); notes.push(`Hazy (visibility about ${Math.round(vis / 1000)} km): softer, warmer light.`); }
    }
    if (a) {
      const aod = a.aerosol_optical_depth ?? 0, pm = a.pm2_5 ?? 0, dust = a.dust ?? 0, aqi = a.us_aqi;
      if (aod >= 0.5 || pm >= 55) { down(1); notes.push('Heavy haze or smoke: the sun dims and turns deep red near the horizon, and colors look muted.'); }
      else if (aod >= 0.2 || pm >= 12) notes.push('Some haze or pollution: warmer, softer light and a redder sun near the horizon.');
      if (dust >= 50) notes.push('Dust in the air: hazy, yellowish light.');
      if (aqi != null && aqi > 100) notes.push(`Air quality is ${aqiName(aqi).toLowerCase()} (AQI ${aqi}): consider limiting time outside.`);
    }
    if (!w) return { verdict: 'Cloud forecast unavailable right now', level: -1, notes: notes.length ? notes : ['Air quality looks fine.'] };
    if (!notes.length) notes.push('Nothing in the forecast should get in the way.');
    const verdict = ['Poor light likely', 'Mixed: worth a look', 'Promising'][level];
    return { verdict, level, notes };
  }

  function stats(w, a) {
    const parts = [];
    if (w) {
      parts.push(`Clouds: low ${w.cloud_cover_low ?? '–'}% · mid ${w.cloud_cover_mid ?? '–'}% · high ${w.cloud_cover_high ?? '–'}%`);
      parts.push(`Rain chance ${w.precipitation_probability ?? '–'}%`);
      if (w.visibility != null) parts.push(`Visibility ${w.visibility >= 10000 ? '10+' : (w.visibility / 1000).toFixed(1)} km`);
    }
    if (a && a.us_aqi != null) parts.push(`Air quality ${a.us_aqi} (${aqiName(a.us_aqi)})`);
    if (a && a.aerosol_optical_depth != null) parts.push(`Haze (AOD) ${a.aerosol_optical_depth.toFixed(2)}`);
    return parts;
  }

  function show() {
    const tgt = target();
    if (!tgt) {
      $('wxTitle').textContent = 'Weather for golden hour';
      $('wxVerdict').textContent = 'No golden hour to check in the next few days.';
      $('wxNotes').innerHTML = ''; $('wxStats').innerHTML = '';
      return;
    }
    const mid = new Date((tgt.w.start.valueOf() + tgt.w.end.valueOf()) / 2);
    const day = sameDay(tgt.w.start, new Date()) ? 'today' : tgt.w.start.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    $('wxTitle').textContent = `Weather for ${tgt.name.toLowerCase()}, ${day} ${fmtShortRange(tgt.w.start, tgt.w.end)}`;
    $('wxVerdict').className = 'wx-verdict';
    if (!data) {
      $('wxVerdict').textContent = failed || 'Checking the forecast…';
      $('wxNotes').innerHTML = ''; $('wxStats').innerHTML = '';
      return;
    }
    const w = at(data.wx, mid), a = at(data.aq, mid);
    if (!w && !a) {
      $('wxVerdict').textContent = 'No forecast for this day yet: weather is forecast up to 16 days ahead, air quality up to 7.';
      $('wxNotes').innerHTML = ''; $('wxStats').innerHTML = '';
      return;
    }
    const r = assess(w, a);
    $('wxVerdict').textContent = r.verdict;
    if (r.level >= 0) $('wxVerdict').classList.add(['poor', 'mixed', 'good'][r.level]);
    $('wxNotes').innerHTML = '';
    for (const n of r.notes) { const li = document.createElement('li'); li.textContent = n; $('wxNotes').append(li); }
    $('wxStats').textContent = stats(w, a).join('  ·  ');
  }

  window.renderWeather = function () {
    if (state.lat == null) return;
    show();
    const stale = !data || data.key !== key() || Date.now() - data.at > FRESH;
    if (!stale || loading || (failed && Date.now() - triedAt < 5 * 60000)) return;
    triedAt = Date.now();
    loading = load()
      .then(() => { failed = ''; })
      .catch((err) => {
        failed = err.status === 429
          ? 'The weather service is busy right now. It will try again shortly.'
          : navigator.onLine === false ? 'No connection: the weather will show when you are back online.'
            : 'Couldn\'t get the weather forecast right now. It will try again shortly.';
        if (!data || data.key !== key()) data = null;
      })
      .finally(() => { loading = null; show(); });
  };

  window.renderWeather();
})();

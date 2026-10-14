// [name, lat, lng, IANA time zone used to guess a starting city]
const CITIES = [
  ['New York', 40.7128, -74.006, 'America/New_York'], ['Boston', 42.3601, -71.0589], ['Washington DC', 38.9072, -77.0369],
  ['Philadelphia', 39.9526, -75.1652], ['Miami', 25.7617, -80.1918], ['Atlanta', 33.749, -84.388], ['Toronto', 43.6532, -79.3832, 'America/Toronto'],
  ['Montreal', 45.5017, -73.5673], ['Detroit', 42.3314, -83.0458, 'America/Detroit'], ['Chicago', 41.8781, -87.6298, 'America/Chicago'],
  ['Minneapolis', 44.9778, -93.265], ['Dallas', 32.7767, -96.797], ['Houston', 29.7604, -95.3698], ['Austin', 30.2672, -97.7431],
  ['New Orleans', 29.9511, -90.0715], ['Mexico City', 19.4326, -99.1332, 'America/Mexico_City'], ['Winnipeg', 49.8951, -97.1384, 'America/Winnipeg'],
  ['Denver', 39.7392, -104.9903, 'America/Denver'], ['Salt Lake City', 40.7608, -111.891], ['Phoenix', 33.4484, -112.074, 'America/Phoenix'],
  ['Calgary', 51.0447, -114.0719, 'America/Edmonton'], ['Las Vegas', 36.1699, -115.1398], ['Los Angeles', 34.0522, -118.2437, 'America/Los_Angeles'],
  ['San Diego', 32.7157, -117.1611], ['San Francisco', 37.7749, -122.4194], ['Portland', 45.5152, -122.6784], ['Seattle', 47.6062, -122.3321],
  ['Vancouver', 49.2827, -123.1207, 'America/Vancouver'], ['Anchorage', 61.2181, -149.9003, 'America/Anchorage'], ['Honolulu', 21.3069, -157.8583, 'Pacific/Honolulu'],
  ['Halifax', 44.6488, -63.5752, 'America/Halifax'], ['St. John\'s', 47.5615, -52.7126, 'America/St_Johns'], ['Havana', 23.1136, -82.3666, 'America/Havana'],
  ['Bogotá', 4.711, -74.0721, 'America/Bogota'], ['Lima', -12.0464, -77.0428, 'America/Lima'], ['Santiago', -33.4489, -70.6693, 'America/Santiago'],
  ['Buenos Aires', -34.6037, -58.3816, 'America/Argentina/Buenos_Aires'], ['São Paulo', -23.5505, -46.6333, 'America/Sao_Paulo'], ['Rio de Janeiro', -22.9068, -43.1729],
  ['Caracas', 10.4806, -66.9036, 'America/Caracas'], ['Reykjavík', 64.1466, -21.9426, 'Atlantic/Reykjavik'], ['Dublin', 53.3498, -6.2603, 'Europe/Dublin'],
  ['London', 51.5074, -0.1278, 'Europe/London'], ['Edinburgh', 55.9533, -3.1883], ['Manchester', 53.4808, -2.2426], ['Lisbon', 38.7223, -9.1393, 'Europe/Lisbon'],
  ['Madrid', 40.4168, -3.7038, 'Europe/Madrid'], ['Barcelona', 41.3874, 2.1686], ['Paris', 48.8566, 2.3522, 'Europe/Paris'], ['Brussels', 50.8503, 4.3517, 'Europe/Brussels'],
  ['Amsterdam', 52.3676, 4.9041, 'Europe/Amsterdam'], ['Berlin', 52.52, 13.405, 'Europe/Berlin'], ['Munich', 48.1351, 11.582], ['Zurich', 47.3769, 8.5417, 'Europe/Zurich'],
  ['Vienna', 48.2082, 16.3738, 'Europe/Vienna'], ['Prague', 50.0755, 14.4378, 'Europe/Prague'], ['Rome', 41.9028, 12.4964, 'Europe/Rome'], ['Milan', 45.4642, 9.19],
  ['Copenhagen', 55.6761, 12.5683, 'Europe/Copenhagen'], ['Oslo', 59.9139, 10.7522, 'Europe/Oslo'], ['Stockholm', 59.3293, 18.0686, 'Europe/Stockholm'],
  ['Helsinki', 60.1699, 24.9384, 'Europe/Helsinki'], ['Warsaw', 52.2297, 21.0122, 'Europe/Warsaw'], ['Budapest', 47.4979, 19.0402, 'Europe/Budapest'],
  ['Athens', 37.9838, 23.7275, 'Europe/Athens'], ['Istanbul', 41.0082, 28.9784, 'Europe/Istanbul'], ['Kyiv', 50.4501, 30.5234, 'Europe/Kyiv'],
  ['Moscow', 55.7558, 37.6173, 'Europe/Moscow'], ['Cairo', 30.0444, 31.2357, 'Africa/Cairo'], ['Lagos', 6.5244, 3.3792, 'Africa/Lagos'],
  ['Nairobi', -1.2921, 36.8219, 'Africa/Nairobi'], ['Johannesburg', -26.2041, 28.0473, 'Africa/Johannesburg'], ['Cape Town', -33.9249, 18.4241],
  ['Casablanca', 33.5731, -7.5898, 'Africa/Casablanca'], ['Tel Aviv', 32.0853, 34.7818, 'Asia/Jerusalem'], ['Dubai', 25.2048, 55.2708, 'Asia/Dubai'],
  ['Riyadh', 24.7136, 46.6753, 'Asia/Riyadh'], ['Tehran', 35.6892, 51.389, 'Asia/Tehran'], ['Karachi', 24.8607, 67.0011, 'Asia/Karachi'],
  ['Mumbai', 19.076, 72.8777], ['Delhi', 28.6139, 77.209, 'Asia/Kolkata'], ['Bengaluru', 12.9716, 77.5946], ['Kathmandu', 27.7172, 85.324, 'Asia/Kathmandu'],
  ['Dhaka', 23.8103, 90.4125, 'Asia/Dhaka'], ['Bangkok', 13.7563, 100.5018, 'Asia/Bangkok'], ['Chiang Mai', 18.7883, 98.9853], ['Phuket', 7.8804, 98.3923],
  ['Hanoi', 21.0278, 105.8342], ['Ho Chi Minh City', 10.8231, 106.6297, 'Asia/Ho_Chi_Minh'], ['Kuala Lumpur', 3.139, 101.6869, 'Asia/Kuala_Lumpur'],
  ['Singapore', 1.3521, 103.8198, 'Asia/Singapore'], ['Jakarta', -6.2088, 106.8456, 'Asia/Jakarta'], ['Bali', -8.4095, 115.1889, 'Asia/Makassar'],
  ['Manila', 14.5995, 120.9842, 'Asia/Manila'], ['Hong Kong', 22.3193, 114.1694, 'Asia/Hong_Kong'], ['Taipei', 25.033, 121.5654, 'Asia/Taipei'],
  ['Shanghai', 31.2304, 121.4737, 'Asia/Shanghai'], ['Beijing', 39.9042, 116.4074], ['Seoul', 37.5665, 126.978, 'Asia/Seoul'],
  ['Tokyo', 35.6762, 139.6503, 'Asia/Tokyo'], ['Osaka', 34.6937, 135.5023], ['Perth', -31.9505, 115.8605, 'Australia/Perth'],
  ['Adelaide', -34.9285, 138.6007, 'Australia/Adelaide'], ['Brisbane', -27.4698, 153.0251, 'Australia/Brisbane'], ['Sydney', -33.8688, 151.2093, 'Australia/Sydney'],
  ['Melbourne', -37.8136, 144.9631, 'Australia/Melbourne'], ['Hobart', -42.8821, 147.3272, 'Australia/Hobart'], ['Auckland', -36.8485, 174.7633, 'Pacific/Auckland'],
];

const $ = (id) => document.getElementById(id);
const state = { lat: null, lng: null, date: new Date() };
const store = {
  get() { try { return JSON.parse(localStorage.getItem('gh-place')); } catch { return null; } },
  set(v) { try { localStorage.setItem('gh-place', JSON.stringify(v)); } catch {} },
};

const fmtTime = (d) => d ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—';
const fmtRange = (w) => w ? `${fmtTime(w.start)} – ${fmtTime(w.end)}` : 'None';
const fmtDuration = (ms) => {
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
};
const sameDay = (a, b) => a.toDateString() === b.toDateString();
const atHour = (d, h) => { const x = new Date(d); x.setHours(h, 0, 0, 0); return x; };
const coordLabel = (lat, lng) =>
  `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(3)}° ${lng >= 0 ? 'E' : 'W'}`;

function windowsFor(day) {
  const g = Sun.goldenHours(atHour(day, 12), state.lat, state.lng);
  return [
    { name: 'Morning golden hour', w: g.morningGolden },
    { name: 'Evening golden hour', w: g.eveningGolden },
  ].filter((x) => x.w).sort((a, b) => a.w.start - b.w.start);
}

function renderHero() {
  const now = new Date();
  let current = null, next = null;
  for (let i = -1; i < 4 && !next; i++) {
    const day = new Date(now); day.setDate(day.getDate() + i);
    for (const x of windowsFor(day)) {
      if (x.w.start <= now && now < x.w.end) current = x;
      else if (x.w.start > now && !next) next = x;
    }
  }
  const alt = Sun.sunAltitude(now, state.lat, state.lng);
  const sunNote = `Sun is ${Math.abs(alt).toFixed(1)}° ${alt >= 0 ? 'above' : 'below'} the horizon.`;
  $('hero').classList.toggle('now', !!current);
  if (current) {
    $('heroLabel').textContent = `${current.name} · happening now`;
    $('heroBig').textContent = fmtDuration(current.w.end - now) + ' left';
    $('heroDetail').textContent = `Ends at ${fmtTime(current.w.end)}. ${sunNote}`;
  } else if (next) {
    const when = sameDay(next.w.start, now) ? 'today'
      : next.w.start.toLocaleDateString([], { weekday: 'long' });
    $('heroLabel').textContent = `${next.name} starts in`;
    $('heroBig').textContent = fmtDuration(next.w.start - now);
    $('heroDetail').textContent = `${when[0].toUpperCase() + when.slice(1)} ${fmtTime(next.w.start)} – ${fmtTime(next.w.end)}. ${sunNote}`;
  } else {
    $('heroLabel').textContent = 'No golden hour in the next few days';
    $('heroBig').textContent = '—';
    $('heroDetail').textContent = `The sun stays too high or too low at this latitude. ${sunNote}`;
  }
}

function renderDay() {
  const day = state.date;
  const g = Sun.goldenHours(atHour(day, 12), state.lat, state.lng);
  $('dayTitle').textContent = sameDay(day, new Date()) ? 'Today'
    : day.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });

  const rows = [
    ['sun', 'Sunrise', fmtTime(g.sunrise)],
    ['sun', 'Sunset', fmtTime(g.sunset)],
    ['blue', 'Morning blue hour', fmtRange(g.morningBlue)],
    ['gold', 'Morning golden hour', fmtRange(g.morningGolden)],
    ['gold', 'Evening golden hour', fmtRange(g.eveningGolden)],
    ['blue', 'Evening blue hour', fmtRange(g.eveningBlue)],
  ];
  $('rows').innerHTML = rows.map(([dot, name, time]) =>
    `<div class="row"><span class="name"><span class="dot ${dot}"></span>${name}</span><span class="time">${time}</span></div>`
  ).join('');

  const start = atHour(day, 0).getTime();
  const pct = (t) => Math.min(100, Math.max(0, (t - start) / 864000));
  const seg = (cls, a, b) => (a && b)
    ? `<div class="seg ${cls}" style="left:${pct(a)}%;width:${pct(b) - pct(a)}%"></div>` : '';
  let html = seg('day', g.sunrise, g.sunset);
  for (const k of ['morningBlue', 'eveningBlue']) if (g[k]) html += seg('blue', g[k].start, g[k].end);
  for (const k of ['morningGolden', 'eveningGolden']) if (g[k]) html += seg('gold', g[k].start, g[k].end);
  if (sameDay(day, new Date())) html += `<div class="now-mark" style="left:${pct(Date.now())}%"></div>`;
  $('timeline').innerHTML = html;
}

function render() {
  if (state.lat == null) return;
  renderHero();
  renderDay();
  renderReminderOptions();
  renderQuickButton();
  if (window.renderSky) window.renderSky();
}

function setPlace(lat, lng, label, note) {
  state.lat = lat; state.lng = lng;
  $('lat').value = lat.toFixed(4);
  $('lng').value = lng.toFixed(4);
  $('place').textContent = label ? `${label} · ${coordLabel(lat, lng)}` : coordLabel(lat, lng);
  setStatus(note || '');
  store.set({ lat, lng, label });
  render();
}

function setStatus(msg, isError) {
  $('status').textContent = msg;
  $('status').classList.toggle('error', !!isError);
}

function guessFromTimeZone() {
  let tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch {}
  const match = CITIES.find((c) => c[3] === tz);
  if (match) return match;
  // Fall back to the city whose time zone region shares the most with the device's.
  const region = tz.split('/')[0];
  return CITIES.find((c) => c[3] && c[3].startsWith(region + '/')) || CITIES[0];
}

$('cities').innerHTML = CITIES.map((c) => `<option value="${c[0]}"></option>`).join('');

$('cityForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = $('city').value.trim().toLowerCase();
  const c = CITIES.find((x) => x[0].toLowerCase() === q) || CITIES.find((x) => x[0].toLowerCase().startsWith(q));
  if (!q || !c) {
    setStatus('That city isn\'t in the list. Enter its latitude and longitude instead.', true);
    return;
  }
  $('city').value = '';
  setPlace(c[1], c[2], c[0]);
});

$('coordForm').addEventListener('submit', (e) => {
  e.preventDefault();
  // Accept "lat, lng" pasted into the first box as well as two separate values.
  const parts = $('lat').value.split(/[,\s]+/).filter(Boolean);
  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts.length > 1 ? parts[1] : $('lng').value);
  if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) {
    setStatus('Enter a latitude from −90 to 90 and a longitude from −180 to 180.', true);
    return;
  }
  setPlace(lat, lng, '', 'Using the coordinates you entered.');
});

$('date').addEventListener('change', (e) => {
  const [y, m, d] = e.target.value.split('-').map(Number);
  state.date = y ? new Date(y, m - 1, d) : new Date();
  render();
});

function locate(quiet) {
  if (!navigator.geolocation) {
    setStatus('This page can\'t read your location. Pick a city or enter coordinates.', true);
    return;
  }
  setStatus('Asking for your location…');
  navigator.geolocation.getCurrentPosition(
    (pos) => setPlace(pos.coords.latitude, pos.coords.longitude, 'Your location',
      `Located to within ${Math.round(pos.coords.accuracy)} m.`),
    () => setStatus(quiet
      ? 'Location is off, so these times are for the place shown. Tap "Use my location" or pick your city.'
      : 'Couldn\'t get your location. Allow location access for this site, or pick a city.', !quiet),
    { timeout: 10000, maximumAge: 600000 }
  );
}
$('locate').addEventListener('click', () => locate());

// ---- Reminders ----

function upcomingWindows(days) {
  const now = new Date(), out = [];
  for (let i = -1; i <= days; i++) {
    const day = new Date(now); day.setDate(day.getDate() + i);
    for (const x of windowsFor(day)) if (x.w.end > now) out.push(x);
  }
  // A solar day can overlap two calendar days; drop duplicates.
  return out.filter((x, i) => out.findIndex((y) => Math.abs(y.w.start - x.w.start) < 60000) === i)
    .sort((a, b) => a.w.start - b.w.start);
}

function dayWord(d) {
  const today = new Date(), tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, tomorrow)) return 'Tomorrow';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function renderReminderOptions() {
  const sel = $('remWhich'), keep = sel.value;
  const opts = upcomingWindows(3).slice(0, 6);
  sel.innerHTML = opts.map((x) => {
    const kind = x.name.startsWith('Morning') ? 'morning' : 'evening';
    return `<option value="${x.w.start.toISOString()}|${kind}">${dayWord(x.w.start)} · ${kind} · ${fmtTime(x.w.start)}</option>`;
  }).join('');
  if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
}

// The chosen golden hour, plus the same one (morning/evening) on each following day if asked.
function chosenWindows() {
  const [iso, kind] = $('remWhich').value.split('|');
  if (!iso) return [];
  const first = new Date(iso);
  const all = upcomingWindows(9).filter((x) => x.name.toLowerCase().startsWith(kind) && x.w.start >= first - 60000);
  return $('remWeek').checked ? all.slice(0, 7) : all.slice(0, 1);
}

const icsDate = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = (t) => t.replace(/[\;,]/g, (c) => '\\' + c);

// Opens the phone's calendar with one event per window, each alerting `lead` minutes before.
function saveToCalendar(wins, lead) {
  const place = $('place').textContent;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Golden Hour//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const x of wins) {
    lines.push('BEGIN:VEVENT',
      `UID:${icsDate(x.w.start)}-${state.lat.toFixed(3)}-${state.lng.toFixed(3)}@golden-hour`,
      `DTSTAMP:${icsDate(new Date())}`,
      `DTSTART:${icsDate(x.w.start)}`,
      `DTEND:${icsDate(x.w.end)}`,
      `SUMMARY:${icsText(x.name)}`,
      `DESCRIPTION:${icsText(`Golden hour ${fmtTime(x.w.start)} – ${fmtTime(x.w.end)} at ${place}.`)}`,
      `GEO:${state.lat.toFixed(5)};${state.lng.toFixed(5)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(x.name)}`,
      `TRIGGER:-PT${lead}M`, 'END:VALARM',
      'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'golden-hour.ics';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

$('remCal').addEventListener('click', () => {
  const wins = chosenWindows();
  if (!wins.length) return;
  saveToCalendar(wins, Number($('remLead').value));
  setRemStatus(`Opening ${wins.length === 1 ? 'a calendar event' : `${wins.length} calendar events`}. Tap Add in your calendar to save ${wins.length === 1 ? 'it' : 'them'}.`);
});

// One-tap reminder: the next golden hour that is still more than 30 minutes away.
const QUICK_LEAD = 30;
function quickTarget() {
  const cutoff = Date.now() + QUICK_LEAD * 60000;
  return upcomingWindows(4).find((x) => x.w.start >= cutoff) || null;
}

function renderQuickButton() {
  const x = quickTarget();
  $('quickRemind').disabled = !x;
  $('quickRemindWhen').textContent = x
    ? `${x.name} · ${dayWord(x.w.start)} ${fmtTime(x.w.start)}`
    : 'No golden hour in the next few days';
}

$('quickRemind').addEventListener('click', () => {
  const x = quickTarget();
  if (!x) return;
  saveToCalendar([x], QUICK_LEAD);
  const alertAt = new Date(x.w.start - QUICK_LEAD * 60000);
  $('quickNote').textContent = `Opening your calendar. After you tap Add, it will alert you at ${fmtTime(alertAt)}.`;
});

// In-app alerts: fire while the app is open (or in the background on some phones).
const alerts = {
  load() { try { return (JSON.parse(localStorage.getItem('gh-alerts')) || []).filter((a) => a.at > Date.now() - 300000); } catch { return []; } },
  save(list) { try { localStorage.setItem('gh-alerts', JSON.stringify(list)); } catch {} },
};
let alertTimers = [];
let swReg = null;
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((r) => { swReg = r; }).catch(() => {});
}

function setRemStatus(msg, isError) {
  $('remStatus').textContent = msg;
  $('remStatus').classList.toggle('error', !!isError);
}

function fireAlert(a) {
  showAlarm(a.title);
  try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch {}
  if ('Notification' in window && Notification.permission === 'granted') {
    const opts = { body: a.body, icon: 'icon-192.png', tag: String(a.at) };
    if (swReg) swReg.showNotification(a.title, opts).catch(() => {});
    else try { new Notification(a.title, opts); } catch {}
  }
  alerts.save(alerts.load().filter((x) => x.at !== a.at));
  armAlerts();
}

function armAlerts() {
  alertTimers.forEach(clearTimeout);
  const list = alerts.load();
  alertTimers = list.map((a) => setTimeout(() => fireAlert(a), Math.max(0, a.at - Date.now())));
  const next = list.filter((a) => a.at > Date.now()).sort((a, b) => a.at - b.at)[0];
  $('remClear').hidden = !list.length;
  if (next) setRemStatus(`${list.length} alert${list.length > 1 ? 's' : ''} set. Next: ${dayWord(new Date(next.at))} at ${fmtTime(new Date(next.at))}. Keep this app open for it to ring.`);
  else setRemStatus('Calendar reminders work even when this app is closed.');
}

$('remAlert').addEventListener('click', async () => {
  const wins = chosenWindows();
  if (!wins.length) return;
  if ('Notification' in window && Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch {}
  }
  const lead = Number($('remLead').value);
  const list = alerts.load();
  for (const x of wins) {
    const at = x.w.start.valueOf() - lead * 60000;
    if (at <= Date.now() || list.some((a) => a.at === at)) continue;
    list.push({
      at,
      title: lead ? `${x.name} in ${lead} min` : `${x.name} starts now`,
      body: `${fmtTime(x.w.start)} – ${fmtTime(x.w.end)}`,
    });
  }
  alerts.save(list);
  armAlerts();
  if (!list.length) setRemStatus('That time has already passed. Pick a later golden hour.', true);
});

$('remClear').addEventListener('click', () => {
  alerts.save([]);
  armAlerts();
  setRemStatus('Alerts cleared.');
});

// The alert banner only exists while an alert is showing.
function showAlarm(text) {
  document.getElementById('alarm')?.remove();
  const bar = document.createElement('div');
  bar.className = 'alarm';
  bar.id = 'alarm';
  bar.setAttribute('role', 'alert');
  const msg = document.createElement('span');
  msg.textContent = text;
  const ok = document.createElement('button');
  ok.type = 'button';
  ok.textContent = 'OK';
  ok.addEventListener('click', () => bar.remove());
  bar.append(msg, ok);
  document.body.append(bar);
}

// Phones pause timers in the background; catch up when the app comes back.
document.addEventListener('visibilitychange', () => { if (!document.hidden) { armAlerts(); render(); } });

const d = state.date;
$('date').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const saved = store.get();
if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lng)) {
  setPlace(saved.lat, saved.lng, saved.label);
} else {
  const c = guessFromTimeZone();
  setPlace(c[1], c[2], c[0], `Guessed ${c[0]} from your time zone. Pick your city or enter coordinates for exact times.`);
}
armAlerts();
locate(true);
setInterval(render, 30000);

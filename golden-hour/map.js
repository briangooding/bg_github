// "Sun right now": map with the sun's compass direction, plus an altitude gauge.
(function () {
  const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const compass = (az) => POINTS[Math.round(az / 22.5) % 16];
  const rad = Math.PI / 180;

  function phaseOf(alt) {
    if (alt > 6) return 'Daylight';
    if (alt >= -4) return 'Golden hour light';
    if (alt >= -6) return 'Blue hour light';
    if (alt >= -18) return 'Twilight';
    return 'Night';
  }

  // Point `meters` away from [lat, lng] along compass bearing `az` (spherical Earth).
  function destination(lat, lng, az, meters) {
    const d = meters / 6371000, p1 = lat * rad, l1 = lng * rad, b = az * rad;
    const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
    const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    return [p2 / rad, l2 / rad];
  }

  // ---- Altitude gauge (SVG) ----
  const CX = 30, CY = 70, R = 64, MIN = -20, MAX = 90;
  const pt = (a, r = R) => [CX + r * Math.cos(a * rad), CY - r * Math.sin(a * rad)];
  const arc = (a0, a1, r = R) => {
    const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r);
    return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 0 0 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  };
  const wedge = (a0, a1) => `M${CX} ${CY} ${arc(a0, a1).replace('M', 'L')} Z`;

  function drawGauge(alt) {
    const a = Math.max(MIN, Math.min(MAX, alt));
    const [sx, sy] = pt(a);
    const [hx] = pt(0, R + 6);
    const up = alt > -0.833;
    $('gauge').innerHTML = `
      <path d="${wedge(-6, -4)}" style="fill: var(--blue); opacity: .35"></path>
      <path d="${wedge(-4, 6)}" style="fill: var(--gold); opacity: .45"></path>
      <path d="${arc(MIN, MAX)}" style="fill: none; stroke: var(--line); stroke-width: 2"></path>
      <line x1="${CX}" y1="${CY}" x2="${hx}" y2="${CY}" style="stroke: var(--muted); stroke-width: 1.5"></line>
      <line x1="${CX}" y1="${CY}" x2="${CX}" y2="${CY - R - 4}" style="stroke: var(--line); stroke-width: 1"></line>
      <text x="${hx + 3}" y="${CY + 4}" style="fill: var(--muted); font-size: 10px">0°</text>
      <text x="${CX + 4}" y="${CY - R}" style="fill: var(--muted); font-size: 10px">90°</text>
      <line x1="${CX}" y1="${CY}" x2="${sx.toFixed(1)}" y2="${sy.toFixed(1)}"
        style="stroke: ${up ? 'var(--gold)' : 'var(--blue)'}; stroke-width: 2"></line>
      <circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="7" style="fill: ${up ? 'var(--gold)' : 'var(--blue)'}"></circle>
      <circle cx="${CX}" cy="${CY}" r="3" style="fill: var(--text)"></circle>`;
  }

  // ---- Map ----
  let map = null, layers = null, centered = null;
  if (window.L) {
    map = L.map('map', { zoomControl: false, attributionControl: true }).setView([0, 0], 15);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    layers = L.layerGroup().addTo(map);
    map.on('zoomend resize', () => window.renderSky && window.renderSky());
  } else {
    $('map').innerHTML = '<div class="map-fallback">The map couldn\'t load (no connection?). Direction and height below still update.</div>';
  }

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // Compass bearing from one point to another, clockwise from north.
  function bearing(lat1, lng1, lat2, lng2) {
    const p1 = lat1 * rad, p2 = lat2 * rad, dl = (lng2 - lng1) * rad;
    const y = Math.sin(dl) * Math.cos(p2);
    const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return (Math.atan2(y, x) / rad + 360) % 360;
  }

  // When, on the selected day, the sun stands in direction `az` (degrees). The sun sweeps every
  // direction once a day at most latitudes; near the tropics it can pass a direction more than
  // once, so prefer a time when it is up. Returns null if it never points that way.
  function timeAtAzimuth(az, lat, lng) {
    const start = atHour(state.date, 0).valueOf(), step = 10 * 60000;
    const diff = (t) => ((Sun.sunPosition(new Date(t), lat, lng).azimuth - az + 540) % 360) - 180;
    const hits = [];
    let t0 = start, d0 = diff(t0);
    for (let t1 = start + step; t1 <= start + 24 * 3600000; t1 += step) {
      const d1 = diff(t1);
      if (Math.abs(d1 - d0) < 90 && ((d0 <= 0 && d1 > 0) || (d0 >= 0 && d1 < 0))) {
        let a = t0, b = t1, da = d0;
        while (b - a > 15000) {
          const m = (a + b) / 2, dm = diff(m);
          if ((dm > 0) === (da > 0)) { a = m; da = dm; } else b = m;
        }
        hits.push(new Date((a + b) / 2));
      }
      t0 = t1; d0 = d1;
    }
    return hits.find((t) => Sun.sunPosition(t, lat, lng).altitude > -0.833) || hits[0] || null;
  }

  // The moment the map shows: now, or the time picked by dragging the sun.
  let pickedAz = null;
  const shownTime = () => (pickedAz == null ? null : timeAtAzimuth(pickedAz, state.lat, state.lng));

  function whenLabel(t) {
    const now = new Date();
    if (sameDay(t, now)) return `${t < now ? 'earlier today' : 'today'} at ${fmtTime(t)}`;
    return `${t.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} at ${fmtTime(t)}`;
  }

  function showChip(t) {
    $('sunChip').hidden = pickedAz == null;
    if (pickedAz == null) return;
    $('sunChipText').textContent = t ? `Sun here ${whenLabel(t)}` : 'The sun never points this way on this day';
  }

  // Your location: a dot you can drag anywhere. Lines follow it while dragging; dropping it
  // makes that spot the app's place, so every time and the countdown update.
  // The sun: drag it around you to see when the sun will stand in that direction.
  let you = null, sun = null, dragging = false, frame = 0;
  if (map) {
    you = L.marker([0, 0], {
      icon: L.divIcon({ className: '', html: '<div class="you-marker" title="Drag to move"></div>', iconSize: [30, 30] }),
      draggable: true, autoPan: true, keyboard: false, zIndexOffset: 1000,
    }).addTo(map);
    you.on('dragstart', () => { dragging = true; });
    you.on('drag', () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { const p = you.getLatLng(); drawRays(p.lat, p.lng); });
    });
    you.on('dragend', () => {
      dragging = false;
      const p = you.getLatLng();
      const lat = Math.max(-89.9, Math.min(89.9, p.lat));
      const lng = ((p.lng + 540) % 360) - 180; // wrap after dragging across the date line
      centered = `${lat},${lng}`;
      map.panTo([lat, lng]); // glide to the new spot so its lines fit on the map
      setPlace(lat, lng, 'Pinned spot', 'Using the spot you pinned on the map.');
    });

    sun = L.marker([0, 0], {
      icon: L.divIcon({ className: '', html: '<div class="sun-hit" title="Drag to pick a time"><div class="sun-marker"></div></div>', iconSize: [40, 40] }),
      draggable: true, autoPan: false, keyboard: false, zIndexOffset: 900,
    }).addTo(map);
    sun.on('dragstart', () => { dragging = true; });
    sun.on('drag', () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const p = sun.getLatLng();
        pickedAz = bearing(state.lat, state.lng, p.lat, p.lng);
        const t = shownTime();
        drawRays(state.lat, state.lng, t, true);
        showStats(t);
      });
    });
    sun.on('dragend', () => { dragging = false; window.renderSky(); });
    $('sunNow').addEventListener('click', () => { pickedAz = null; window.renderSky(); });
  }

  // Draws the lines for `when` (default now). While the sun is being dragged it stays under
  // the finger; otherwise it sits at the end of its line.
  function drawRays(lat, lng, when, keepSun) {
    // Lines span ~40% of the smaller map side, whatever the zoom.
    const size = map.getSize();
    const metersPerPx = 156543.03 * Math.cos(lat * rad) / Math.pow(2, map.getZoom());
    const len = 0.42 * Math.min(size.x, size.y) * metersPerPx;

    const t = when || new Date();
    const pos = Sun.sunPosition(t, lat, lng);
    const g = Sun.goldenHours(t, lat, lng);
    const up = pos.altitude > -0.833;
    const ray = (az, color, opts) =>
      L.polyline([[lat, lng], destination(lat, lng, az, len)], { color, weight: 3, interactive: false, ...opts });

    layers.clearLayers();
    if (g.sunrise) ray(Sun.sunPosition(g.sunrise, lat, lng).azimuth, css('--map-rise'), { dashArray: '8 7' }).addTo(layers);
    if (g.sunset) ray(Sun.sunPosition(g.sunset, lat, lng).azimuth, css('--map-set'), { dashArray: '8 7' }).addTo(layers);
    if (pos.altitude > 0) {
      // Shadow length relative to the ray: long when the sun is low, capped so it stays on screen.
      const k = Math.min(1, 0.25 / Math.tan(pos.altitude * rad));
      L.polyline([[lat, lng], destination(lat, lng, (pos.azimuth + 180) % 360, len * Math.max(0.15, k))],
        { color: css('--map-shadow'), weight: 3, dashArray: '2 6', interactive: false }).addTo(layers);
    }
    ray(pos.azimuth, up ? css('--map-sun') : css('--map-night'), { weight: 5, opacity: up ? 1 : 0.7, dashArray: up ? null : '10 8' })
      .addTo(layers);
    if (!keepSun) sun.setLatLng(destination(lat, lng, pos.azimuth, len));
    sun.getElement()?.querySelector('.sun-marker')?.classList.toggle('down', !up);
  }

  function drawMap(t) {
    if (!map || state.lat == null || dragging) return;
    const { lat, lng } = state;
    const key = `${lat},${lng}`;
    if (centered !== key) { map.setView([lat, lng], map.getZoom()); centered = key; }
    you.setLatLng([lat, lng]);
    drawRays(lat, lng, t);
  }

  function showStats(t) {
    const pos = Sun.sunPosition(t || new Date(), state.lat, state.lng);
    $('sunAz').textContent = `${Math.round(pos.azimuth)}° ${compass(pos.azimuth)}`;
    $('sunAlt').textContent = `${pos.altitude.toFixed(1)}°`;
    $('sunPhase').textContent = phaseOf(pos.altitude) + (pos.altitude < -0.833 ? ' · sun below the horizon' : '')
      + (t ? ` · ${whenLabel(t)}` : '');
    $('skyTitle').textContent = t ? `Sun ${whenLabel(t)}` : 'Sun right now';
    drawGauge(pos.altitude);
    showChip(t);
  }

  window.renderSky = function () {
    if (state.lat == null) return;
    const t = shownTime();
    showStats(t);
    drawMap(t);
  };

  window.renderSky();
})();

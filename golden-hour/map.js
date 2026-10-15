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
    map.on('zoomend resize', () => drawMap());
  } else {
    $('map').innerHTML = '<div class="map-fallback">The map couldn\'t load (no connection?). Direction and height below still update.</div>';
  }

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function drawMap() {
    if (!map || state.lat == null) return;
    const { lat, lng } = state;
    const key = `${lat},${lng}`;
    if (centered !== key) { map.setView([lat, lng], map.getZoom()); centered = key; }

    // Lines span ~40% of the smaller map side, whatever the zoom.
    const size = map.getSize();
    const metersPerPx = 156543.03 * Math.cos(lat * rad) / Math.pow(2, map.getZoom());
    const len = 0.42 * Math.min(size.x, size.y) * metersPerPx;

    const now = new Date();
    const pos = Sun.sunPosition(now, lat, lng);
    const g = Sun.goldenHours(now, lat, lng);
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
    L.marker(destination(lat, lng, pos.azimuth, len), {
      icon: L.divIcon({ className: '', html: `<div class="sun-marker${up ? '' : ' down'}"></div>`, iconSize: [22, 22] }),
      interactive: false, keyboard: false,
    }).addTo(layers);
    L.marker([lat, lng], {
      icon: L.divIcon({ className: '', html: '<div class="you-marker"></div>', iconSize: [14, 14] }),
      interactive: false, keyboard: false,
    }).addTo(layers);
  }

  window.renderSky = function () {
    if (state.lat == null) return;
    const pos = Sun.sunPosition(new Date(), state.lat, state.lng);
    $('sunAz').textContent = `${Math.round(pos.azimuth)}° ${compass(pos.azimuth)}`;
    $('sunAlt').textContent = `${pos.altitude.toFixed(1)}°`;
    $('sunPhase').textContent = phaseOf(pos.altitude) + (pos.altitude < -0.833 ? ' · sun below the horizon' : '');
    drawGauge(pos.altitude);
    drawMap();
  };

  window.renderSky();
})();

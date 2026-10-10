const $ = (id) => document.getElementById(id);
const state = { hidden: 0, fields: null, lat: null, lng: null, label: '', homes: [], watchId: null, lastQuery: null, busy: false };
const MOVE_FT = 150;          // re-query after moving this far
const MIN_GAP_MS = 20000;     // and no more often than this

const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(`no-${k}`)); return v ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`no-${k}`, JSON.stringify(v)); } catch {} },
};
const alerted = new Set(store.get('alerted', []));

// ---- Talking to the parcel service ---------------------------------------------------

// ArcGIS servers usually allow cross-origin fetch; JSONP is the fallback if one doesn't.
async function arcgis(path, params) {
  const url = `${Owners.LAYER_URL}${path}?${new URLSearchParams(params)}`;
  let data;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    data = await r.json();
  } catch {
    data = await jsonp(url);
  }
  if (data && data.error) throw new Error(data.error.message || 'The parcel service returned an error');
  return data;
}

function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = `__no_cb_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const s = document.createElement('script');
    const done = (fn, v) => { delete window[cb]; s.remove(); clearTimeout(t); fn(v); };
    const t = setTimeout(() => done(reject, new Error('The parcel service did not respond')), 20000);
    window[cb] = (d) => done(resolve, d);
    s.onerror = () => done(reject, new Error('Could not reach the parcel service'));
    s.src = `${url}&callback=${cb}`;
    document.head.appendChild(s);
  });
}

async function loadFields() {
  if (state.fields) return state.fields;
  const info = await arcgis('', { f: 'json' });
  state.fields = Owners.mapFields(info.fields || []);
  state.paging = !!(info.advancedQueryCapabilities && info.advancedQueryCapabilities.supportsPagination);
  state.pageSize = Math.min(Number(info.maxRecordCount) || 1000, 2000);
  if (!state.fields.situs || !state.fields.ownerName) throw new Error('The parcel service changed its layout; owner fields are missing');
  return state.fields;
}

// ---- Searching -----------------------------------------------------------------------

async function checkHere(lat, lng, label) {
  if (state.busy) return;
  state.busy = true;
  state.lat = lat; state.lng = lng; state.label = label;
  const radius = Number($('radius').value);
  setStatus('Looking up nearby homes…');
  $('refreshBtn').disabled = true;
  try {
    const f = await loadFields();
    const { features, truncated } = await fetchNearby(lat, lng, radius);
    ({ homes: state.homes, hidden: state.hidden } = Owners.toHomes(features, f, lat, lng, radius));
    state.lastQuery = { lat, lng, at: Date.now() };
    if (truncated) showMsg(`Lots of parcels here, so some were left out. Try a smaller distance.`);
    else hideMsg();
    render();
    alertNew();
    $('exportBtn').disabled = !state.homes.length;
    $('exportMsg').classList.remove('error');
    $('exportMsg').textContent = state.homes.length ? `${state.homes.length} homes ready to export (every home found, not just the ones shown).` : 'No homes to export here.';
  } catch (e) {
    setStatus('Couldn\'t load property records.');
    showMsg(e.message || String(e), true);
  } finally {
    state.busy = false;
    $('refreshBtn').disabled = false;
  }
}

// The service caps each response, so page through big areas (up to MAX_PAGES requests).
const MAX_PAGES = 8;
async function fetchNearby(lat, lng, radius) {
  const features = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = Owners.nearbyQueryParams(lat, lng, radius, state.paging ? { offset: page * state.pageSize, size: state.pageSize, orderBy: state.fields.objectId } : {});
    if (page) setStatus(`Looking up nearby homes… ${features.length.toLocaleString()} parcels so far`);
    const data = await arcgis('/query', params);
    features.push(...(data.features || []));
    if (!data.exceededTransferLimit) return { features, truncated: false };
    if (!state.paging) break;
  }
  return { features, truncated: true };
}

// "Only show high quality" narrows results (and alerts) to out-of-state owners.
const isFlagged = (h) => h.absentee && (!$('strict').checked || h.confidence === 'high') && (!$('hqOnly').checked || h.outOfState);

function render() {
  const flagged = state.homes.filter(isFlagged);
  // Unclear: not flagged, but not shown to be owner-occupied either (no mailing address to
  // compare, or a possible match hidden by "Only show strong matches"). Owner-occupied homes aren't listed.
  const rest = state.homes.filter((h) => !isFlagged(h) && (h.absentee || h.confidence === 'unknown'));
  const n = flagged.length;
  const hqOnly = $('hqOnly').checked;
  $('otherSection').hidden = hqOnly;
  $('okSection').hidden = hqOnly;
  $('flagCount').textContent = n;
  $('flagCount').classList.toggle('zero', n === 0);
  setStatus(hqOnly
    ? (n ? `${n} of ${state.homes.length} nearby homes ${n === 1 ? 'has an' : 'have'} out-of-state owner${n === 1 ? '' : 's'}.` : state.homes.length ? `None of the ${state.homes.length} nearby homes have out-of-state owners.` : 'No parcels found here. Is this inside Tarrant County?')
    : n
    ? `${n} of ${state.homes.length} nearby home${state.homes.length === 1 ? '' : 's'} ${n === 1 ? 'looks' : 'look'} non owner-occupied${flagged.some((h) => h.outOfState) ? `, ${flagged.filter((h) => h.outOfState).length} high quality` : ''}.`
    : state.homes.length ? `All ${state.homes.length} nearby homes look owner-occupied.` : 'No parcels found here. Is this inside Tarrant County?');
  const hiddenNote = state.hidden ? ` · ${state.hidden} vacant lot${state.hidden === 1 ? '' : 's'} or large building${state.hidden === 1 ? '' : 's'} skipped` : '';
  $('where').textContent = `${state.label} · ${$('radius').selectedOptions[0].textContent.toLowerCase()}${hiddenNote} · ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  const hq = flagged.filter((h) => h.outOfState);
  const other = flagged.filter((h) => !h.outOfState);
  $('hqSub').textContent = hq.length ? hq.length : '';
  $('flagSub').textContent = other.length ? other.length : '';
  $('okSub').textContent = rest.length ? rest.length : '';
  fillList($('hqList'), hq, 'No out-of-state owners nearby.', VISIBLE_ROWS);
  fillList($('flagList'), other, 'Nothing else flagged nearby.', VISIBLE_ROWS);
  fillList($('okList'), rest, 'No unclear homes nearby.', VISIBLE_ROWS);
}

// With a row limit, the list is as tall as its first `limit` cards and scrolls for the rest.
const VISIBLE_ROWS = 5;
function fillList(el, homes, emptyText, limit) {
  el.replaceChildren();
  el.classList.remove('scroll');
  el.style.maxHeight = '';
  const hint = el.nextElementSibling && el.nextElementSibling.classList.contains('more') ? el.nextElementSibling : null;
  if (hint) hint.hidden = true;
  if (!homes.length) { el.append(Object.assign(document.createElement('p'), { className: 'empty', textContent: emptyText })); return; }
  for (const h of homes) el.append(homeCard(h));
  if (limit && homes.length > limit) {
    el.classList.add('scroll');
    el.dataset.limit = limit;
    fitList(el);
    if (hint) { hint.hidden = false; hint.textContent = `Showing ${limit} of ${homes.length} — scroll the list for more`; }
  }
}

function fitList(el) {
  const last = el.children[Number(el.dataset.limit) - 1];
  if (!last || el.offsetParent === null) return; // hidden: sized again when shown
  el.style.maxHeight = `${last.offsetTop + last.offsetHeight - el.firstElementChild.offsetTop}px`;
  el.scrollTop = 0;
}
window.addEventListener('resize', () => document.querySelectorAll('.list.scroll').forEach(fitList));

// Compact card: address, owner and mailing address on three short lines; tap for the rest.
function homeCard(h) {
  const el = document.createElement('details');
  el.className = `home${isFlagged(h) ? ' flag' : ''}${isFlagged(h) && h.outOfState ? ' hq' : ''}`;
  const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const row = (parent, ...kids) => { const r = node('div', 'row'); r.append(...kids); parent.append(r); return r; };

  const sum = node('summary');
  row(sum, node('span', 'addr', h.situs || 'No street address'), node('span', 'dist', `${Math.round(h.dist)} ft`));
  const owner = node('span', 'owner', h.ownerName || 'Owner not listed');
  if (h.absentee) {
    const label = h.outOfState ? `Out of state${h.state ? ` · ${h.state}` : ''}` : h.confidence === 'high' ? 'Strong' : 'Possible';
    row(sum, owner, node('span', `tag ${h.outOfState ? 'hq' : h.confidence}`, label));
  } else row(sum, owner);
  if (h.ownerMail) row(sum, node('span', 'mail', `Mail: ${h.ownerMail}`));
  el.append(sum);

  const more = node('div', 'more-info');
  const facts = [h.sqft && `${h.sqft.toLocaleString()} sq ft`, h.yearBuilt && `built ${h.yearBuilt}`, h.account && `Account ${h.account}`, h.pin && `PIN ${h.pin}`].filter(Boolean).join(' · ');
  if (facts) more.append(node('div', 'meta', facts));
  const ul = node('ul');
  for (const r of h.reasons) ul.append(node('li', null, r));
  more.append(ul);

  const links = node('div', 'links');
  links.append(Object.assign(node('a', null, 'Map'), { target: '_blank', rel: 'noopener', href: `https://www.google.com/maps/search/?api=1&query=${h.lat},${h.lng}` }));
  if (h.account) {
    const tad = Object.assign(node('button', null, 'Look up on TAD'), { type: 'button' });
    tad.onclick = async () => {
      try { await navigator.clipboard.writeText(h.account); tad.textContent = 'Account copied — paste it into TAD search'; } catch {}
      window.open('https://www.tad.org/', '_blank', 'noopener');
    };
    links.append(tad);
  }
  const share = Object.assign(node('button', null, 'Copy details'), { type: 'button' });
  share.onclick = async () => {
    try { await navigator.clipboard.writeText(homeText(h)); share.textContent = 'Copied'; } catch { share.textContent = 'Copy failed'; }
  };
  links.append(share);
  more.append(links);
  el.append(more);
  return el;
}

const homeText = (h) => [h.situs, `Owner: ${h.ownerName}`, h.ownerMail && `Mail: ${h.ownerMail}`, h.account && `TAD account: ${h.account}`, ...h.reasons].filter(Boolean).join('\n');

// ---- Location ------------------------------------------------------------------------

function start() {
  if (!('geolocation' in navigator)) { showMsg('This browser can\'t share your location. Search an address below instead.', true); return; }
  setStatus('Finding you…');
  navigator.geolocation.getCurrentPosition(
    (p) => { checkHere(p.coords.latitude, p.coords.longitude, 'Your location'); if ($('follow').checked) follow(); },
    (e) => { setStatus('Location unavailable.'); showMsg(e.code === 1 ? 'Location permission was denied. Allow it in your browser settings, or search an address below.' : 'Couldn\'t get your location. Try again or search an address below.', true); },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
}

function follow() {
  stopFollowing();
  if (!('geolocation' in navigator)) return;
  state.watchId = navigator.geolocation.watchPosition((p) => {
    const { latitude: lat, longitude: lng } = p.coords;
    const q = state.lastQuery;
    if (q && (Owners.distanceFt(q.lat, q.lng, lat, lng) < MOVE_FT || Date.now() - q.at < MIN_GAP_MS)) return;
    checkHere(lat, lng, 'Your location');
  }, () => {}, { enableHighAccuracy: true, maximumAge: 15000 });
}

function stopFollowing() {
  if (state.watchId != null) navigator.geolocation.clearWatch(state.watchId);
  state.watchId = null;
}

// ---- Address search ------------------------------------------------------------------

async function searchAddress(text) {
  const m = $('addrMsg');
  m.hidden = false; m.classList.remove('error'); m.textContent = 'Searching…';
  try {
    const f = await loadFields();
    const data = await arcgis('/query', Owners.addressQueryParams(text, f.situs));
    const best = Owners.bestAddressMatch(data.features, text, f.situs, f.situsCity);
    const feat = best && { x: best, c: Owners.centroid(best.geometry) };
    if (!feat || !feat.c) { m.textContent = 'No Tarrant County property matches that address. Check the house number and street name.'; return; }
    const cap = (x) => x.toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase());
    const found = String(feat.x.attributes[f.situs] || text).trim();
    const city = f.situsCity ? String(feat.x.attributes[f.situsCity] || '').trim() : '';
    const typedCity = Owners.parseTyped(text).city;
    if (typedCity && city && typedCity !== city.toUpperCase()) m.textContent = `Couldn't find that address in ${cap(typedCity)}, so this is the closest match, in ${cap(city)}.`;
    else m.hidden = true;
    stopFollowing();
    $('follow').checked = false;
    await checkHere(feat.c.lat, feat.c.lng, city ? `${found}, ${cap(city)}` : found);
  } catch (e) {
    m.classList.add('error'); m.textContent = e.message || String(e);
  }
}

// ---- Export ------------------------------------------------------------------------

function buildExport() {
  const when = new Date();
  const radius = $('radius').selectedOptions[0].textContent.replace(/^Within /, '');
  const blob = Xlsx.workbook([
    { name: 'Homes', rows: Owners.exportRows(state.homes), widths: Owners.EXPORT_WIDTHS },
    { name: 'Summary', rows: Owners.exportSummary(state.homes, { place: state.label, radius, when: when.toLocaleString() }), widths: [30, 70], header: false },
  ]);
  const slug = state.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'search';
  const name = `nearby-owners-${slug}-${when.toISOString().slice(0, 10)}.xlsx`;
  return new File([blob], name, { type: blob.type });
}

// Phones share the file straight to Mail (or any app); elsewhere it downloads and opens an email draft.
async function exportAndShare() {
  const m = $('exportMsg');
  m.classList.remove('error');
  if (!state.homes.length) { m.textContent = 'Run a search first.'; return; }
  const file = buildExport();
  const subject = `Nearby Owners: ${state.label}`;
  const text = `${state.homes.length} homes around ${state.label} (${state.homes.filter((h) => h.absentee).length} non owner-occupied). Spreadsheet attached.`;
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: subject, text });
      m.textContent = `Shared ${file.name}.`;
      return;
    } catch (e) {
      if (e.name === 'AbortError') { m.textContent = 'Sharing cancelled.'; return; }
    }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  m.textContent = `Downloaded ${file.name}. Attach it to the email that just opened.`;
  location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${text.replace('Spreadsheet attached.', 'Spreadsheet attached:')} ${file.name}`)}`;
}

// ---- Alerts --------------------------------------------------------------------------

let swReg = null;
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').then((r) => { swReg = r; }).catch(() => {});
}

function alertNew() {
  const fresh = state.homes.filter((h) => isFlagged(h) && !alerted.has(h.id));
  fresh.forEach((h) => alerted.add(h.id));
  store.set('alerted', [...alerted].slice(-2000));
  if (!fresh.length || !$('notify').checked) return;
  const title = fresh.length === 1 ? `Non owner-occupied: ${fresh[0].situs}` : `${fresh.length} non owner-occupied homes nearby`;
  const body = fresh.length === 1 ? [fresh[0].ownerName, fresh[0].ownerMail && `Mail: ${fresh[0].ownerMail}`].filter(Boolean).join('\n') : fresh.slice(0, 4).map((h) => `${h.situs} — ${h.ownerName}`).join('\n');
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  if ('Notification' in window && Notification.permission === 'granted') {
    const opts = { body, tag: 'nearby-owners', renotify: true, icon: 'icon-192.png' };
    if (swReg) swReg.showNotification(title, opts).catch(() => {});
    else try { new Notification(title, opts); } catch {}
  }
}

async function toggleNotify() {
  store.set('notify', $('notify').checked);
  if ($('notify').checked && 'Notification' in window && Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch {}
  }
  if ($('notify').checked && 'Notification' in window && Notification.permission === 'denied') {
    showMsg('Notifications are blocked for this site, so alerts will only vibrate and show here.');
  }
}

// ---- UI helpers ----------------------------------------------------------------------

const setStatus = (t) => { $('statusText').textContent = t; };
const showMsg = (t, err) => { const m = $('msg'); m.textContent = t; m.hidden = false; m.classList.toggle('error', !!err); };
const hideMsg = () => { $('msg').hidden = true; };

$('radius').value = String(store.get('radius', 500));
if (!$('radius').value) $('radius').value = '500'; // a saved distance from an older version
$('follow').checked = store.get('follow', true);
$('notify').checked = store.get('notify', false);
$('strict').checked = store.get('strict', false);
$('hqOnly').checked = store.get('hqOnly', false);

// ---- Light / dark ----------------------------------------------------------------------

const darkQuery = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
const isDark = () => (document.documentElement.dataset.theme || (darkQuery && darkQuery.matches ? 'dark' : 'light')) === 'dark';
function syncThemeButton() {
  const dark = isDark();
  $('themeBtn').setAttribute('aria-pressed', String(dark));
  $('themeBtn').title = dark ? 'Light mode' : 'Dark mode';
  $('themeBtn').setAttribute('aria-label', dark ? 'Light mode' : 'Dark mode');
  document.querySelector('meta[name="theme-color"]').content = dark ? '#121815' : '#f5f7f4';
}
$('themeBtn').onclick = () => {
  const next = isDark() ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  store.set('theme', next);
  syncThemeButton();
};
if (darkQuery) darkQuery.addEventListener('change', syncThemeButton);
syncThemeButton();

$('startBtn').onclick = start;
$('exportBtn').onclick = exportAndShare;
$('refreshBtn').onclick = () => { if (state.lat != null) checkHere(state.lat, state.lng, state.label); };
$('radius').onchange = () => { store.set('radius', Number($('radius').value)); if (state.lat != null) checkHere(state.lat, state.lng, state.label); };
$('follow').onchange = () => { store.set('follow', $('follow').checked); if ($('follow').checked && state.lat != null) follow(); else stopFollowing(); };
$('notify').onchange = toggleNotify;
$('strict').onchange = () => { store.set('strict', $('strict').checked); if (state.homes.length) render(); };
$('hqOnly').onchange = () => { store.set('hqOnly', $('hqOnly').checked); if (state.homes.length) render(); document.querySelectorAll('.list.scroll').forEach(fitList); };
$('addrForm').onsubmit = (e) => { e.preventDefault(); const t = $('addr').value.trim(); if (t) searchAddress(t); };

// Parcel lookup against the Tarrant County / TAD parcel layer, and the rules that decide
// whether a home looks owner-occupied (homestead exemptions are deliberately ignored).
// Pure logic lives here so it can be tested in Node.
(function (root) {
  // TAD's parcel layer on Tarrant County's map server: the full appraisal roll (~760k parcels).
  // (Tax/TCProperty on the same server has the same fields but only ~110 parcels.)
  const LAYER_URL = 'https://mapit.tarrantcounty.com/arcgis/rest/services/Dynamic/TADParcels/FeatureServer/0';

  // Field names vary between service versions, so each role lists candidates in order of preference.
  const FIELD_CANDIDATES = {
    objectId: ['OBJECTID', 'FID', 'OBJECTID_1'],
    account: ['ACCOUNT', 'ACCOUNT_NUM', 'ACCT', 'TAD_ACCOUNT'],
    pin: ['TAXPIN', 'TAX_PIN', 'PIN'],
    ownerName: ['OWNER_NAME', 'OWNER', 'OWNERNAME'],
    ownerAddr: ['OWNER_ADDR', 'OWNER_ADDRESS', 'MAIL_ADDR', 'OWNER_ADD'],
    ownerCity: ['OWNER_CITY', 'OWNER_CITYSTATE', 'MAIL_CITY'],
    ownerState: ['OWNER_STATE', 'MAIL_STATE'],
    ownerZip: ['OWNER_ZIP', 'OWNER_ZIPCODE', 'MAIL_ZIP'],
    situs: ['SITUS_ADDR', 'SITUS_ADDRESS', 'SITUS', 'PROP_ADDR'],
    situsCity: ['SITUS_CITY', 'CITY'],
    situsZip: ['ZIPCODE', 'SITUS_ZIP', 'ZIP'],
    livingArea: ['LIVING_ARE', 'LIVING_AREA', 'LIVING_SQFT', 'BLDG_SQFT'],
    yearBuilt: ['YEAR_BUILT', 'YR_BUILT'],
    use: ['STATE_CODE', 'STATE_USE', 'PROPERTY_CLASS', 'PROP_CLASS', 'LAND_USE'],
  };

  // Pick the actual field name for each role from the layer's field list.
  function mapFields(fields) {
    const names = fields.map((f) => (typeof f === 'string' ? f : f.name));
    const byUpper = new Map(names.map((n) => [n.toUpperCase(), n]));
    const out = {};
    for (const [role, cands] of Object.entries(FIELD_CANDIDATES)) {
      const hit = cands.find((c) => byUpper.has(c));
      out[role] = hit ? byUpper.get(hit) : null;
    }
    return out;
  }

  const SUFFIXES = {
    STREET: 'ST', STR: 'ST', AVENUE: 'AVE', AV: 'AVE', DRIVE: 'DR', ROAD: 'RD', LANE: 'LN',
    COURT: 'CT', CIRCLE: 'CIR', BOULEVARD: 'BLVD', PLACE: 'PL', TERRACE: 'TER', TRAIL: 'TRL',
    PARKWAY: 'PKWY', HIGHWAY: 'HWY', PKY: 'PKWY', WAY: 'WAY', COVE: 'CV', SQUARE: 'SQ',
    NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W', NORTHEAST: 'NE', NORTHWEST: 'NW',
    SOUTHEAST: 'SE', SOUTHWEST: 'SW',
    // Other spellings seen in mailing addresses.
    TERR: 'TER', TR: 'TRL', CRT: 'CT', CRCL: 'CIR', CIRC: 'CIR', BLV: 'BLVD', BOUL: 'BLVD',
    AVN: 'AVE', AVEN: 'AVE', DRV: 'DR', DRIV: 'DR', STRT: 'ST', PKWAY: 'PKWY', PARKWY: 'PKWY',
    HIWAY: 'HWY', HWAY: 'HWY', PLC: 'PL',
  };
  const UNIT_RE = /(?:\s(?:APT|UNIT|STE|SUITE|#|BLDG|LOT|SPC)(?=\s|$)(?:\s+(?:[\w-]*\d[\w-]*|[A-Z]))?)+$/;

  // "1204 W. Magnolia Avenue Apt 2" -> { num: '1204', nums: ['1204'], street: 'W MAGNOLIA AVE', raw: 'W MAGNOLIA AVENUE' }
  // "3751 & 3753 TRAIL LAKE DR" -> nums: ['3751', '3753']
  function normalizeAddress(s) {
    if (!s) return null;
    let a = ` ${String(s).toUpperCase()} `.replace(/[.,]/g, ' ').replace(/#/g, ' # ').replace(/\s+/g, ' ').trimEnd();
    a = a.replace(UNIT_RE, '').trim();
    const nums = [];
    a = a.replace(/^(\d+[A-Z]?)((?:\s*(?:&|AND|-)\s*\d+[A-Z]?)*)\s/, (_, first, more) => {
      nums.push(first, ...(more.match(/\d+[A-Z]?/g) || []));
      return `${first} `;
    });
    const rawWords = a.split(' ');
    const words = rawWords.map((w) => SUFFIXES[w] || w);
    if (!words.length || !/^\d+[A-Z]?$/.test(words[0])) return { num: null, nums: [], street: words.join(' '), raw: a, poBox: /^P ?O BOX|^BOX /.test(a) };
    return { num: words[0], nums: nums.length ? nums : [words[0]], street: words.slice(1).join(' '), raw: rawWords.slice(1).join(' '), poBox: false };
  }

  // Spelling-insensitive form of a street name: drops directions and street types, folds
  // plurals ("OAKS" -> OAK), spelled-out ordinals ("SEVENTH" -> 7TH) and a few abbreviations,
  // then joins the words so "MC KINLEY" and "MCKINLEY" compare equal.
  const ORDINALS = { FIRST: '1ST', SECOND: '2ND', THIRD: '3RD', FOURTH: '4TH', FIFTH: '5TH', SIXTH: '6TH', SEVENTH: '7TH', EIGHTH: '8TH', NINTH: '9TH', TENTH: '10TH' };
  const ABBREV = { MT: 'MOUNT', FT: 'FORT', SAINT: 'ST', STE: 'ST' };
  const singular = (w) => (/^\d/.test(w) || w.length <= 3 ? w
    : w.endsWith('IES') ? `${w.slice(0, -3)}Y`
      : /(SS|X|Z|CH|SH)ES$/.test(w) ? w.slice(0, -2)
        : w.endsWith('S') && !w.endsWith('SS') ? w.slice(0, -1) : w);
  function coreName(street) {
    const words = street.split(' ').filter(Boolean);
    const kept = words.filter((w, i) => !DIRS.has(w) && !(STREET_TYPES.has(w) && i > 0));
    return (kept.length ? kept : words).map((w) => singular(ORDINALS[w] || ABBREV[w] || w)).join('');
  }

  function editDistance(a, b) {
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }

  // Same house when the house number matches and the street name is the same allowing for
  // typos, plurals and spelling ("2015 FAIRMONT AVE" vs 2015 FAIRMOUNT AVE, "OAK" vs "OAKS").
  // The house number itself must match: a different number is usually a different house.
  function sameAddress(a, b) {
    const x = normalizeAddress(a), y = normalizeAddress(b);
    if (!x || !y || !x.num || !y.num) return false;
    const base = (n) => n.replace(/[A-Z]$/, '');
    if (!x.nums.some((n) => y.nums.some((m) => base(n) === base(m)))) return false;
    if (x.street === y.street) return true;
    const close = (p, q) => {
      const n = Math.min(p.length, q.length);
      return editDistance(p, q) <= (n <= 4 ? 1 : n <= 8 ? 2 : 3);
    };
    const p = coreName(x.street), q = coreName(y.street);
    if (!p || !q) return true; // number matches and one side has no street name to compare
    // Also compare as written, so a misspelled word ("PARK NORHT LN") isn't mistaken for a different name.
    return close(p, q) || close(x.raw.replace(/ /g, ''), y.raw.replace(/ /g, ''));
  }

  const ENTITY_RE = /\b(LLC|L L C|LP|LTD|INC|CORP|CORPORATION|COMPANY|CO|HOLDINGS|PROPERTIES|PROPERTY|INVESTMENTS?|CAPITAL|REALTY|HOMES|RENTALS?|ASSETS|PARTNERS|PARTNERSHIP|VENTURES|GROUP|FUND|REIT|SFR|BORROWER|ENTERPRISES?)\b/;
  const isEntity = (name) => !!name && ENTITY_RE.test(String(name).toUpperCase().replace(/[.,]/g, ' '));

  // Returns { absentee, confidence: 'high'|'medium'|'unknown', reasons: [...] }.
  function classify(attrs, f) {
    // The county pads text fields with spaces.
    const get = (role) => { const v = f[role] ? attrs[f[role]] : null; return typeof v === 'string' ? v.trim() : v; };
    const reasons = [];
    const situs = get('situs'), ownerAddr = get('ownerAddr'), ownerName = get('ownerName');

    let mailingElsewhere = null;
    if (ownerAddr && situs) {
      const o = normalizeAddress(ownerAddr);
      mailingElsewhere = !sameAddress(situs, ownerAddr);
      // A PO box in the same zip is common for residents, so it is not proof on its own.
      const sameZip = f.ownerZip && f.situsZip && String(get('ownerZip') || '').slice(0, 5) === String(get('situsZip') || '').slice(0, 5);
      if (mailingElsewhere && o && o.poBox && sameZip) mailingElsewhere = null;
    }
    // The state is its own field on some layers and the tail of OWNER_CITY ("IRVINE CA") on others.
    const st = String(get('ownerState') || (String(get('ownerCity') || '').trim().match(/\b([A-Z]{2})$/i) || [])[1] || '').trim().toUpperCase();
    const outOfState = !!st && st !== 'TX';
    const entity = isEntity(ownerName);

    if (mailingElsewhere) reasons.push(`Tax bills go to ${[ownerAddr, get('ownerCity')].filter(Boolean).join(', ')}`);
    if (outOfState) reasons.push(`Owner is out of state (${st})`);
    if (entity) reasons.push('Owned by a company');

    const signals = [!!mailingElsewhere, outOfState, entity].filter(Boolean).length;
    // An out-of-state owner is the clearest sign nobody who owns it lives there.
    if (outOfState) return { absentee: true, confidence: 'high', outOfState: true, state: st, reasons };
    if (signals) return { absentee: true, confidence: signals >= 2 ? 'high' : 'medium', reasons };
    if (mailingElsewhere === false) return { absentee: false, confidence: 'medium', reasons: ['Tax bills go to this address'] };
    return { absentee: false, confidence: 'unknown', reasons: ['Not enough data to tell'] };
  }

  const FT_PER_M = 3.28084;
  function distanceFt(lat1, lng1, lat2, lng2) {
    const r = Math.PI / 180, R = 6371008.8;
    const dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h)) * FT_PER_M;
  }

  // Bounding box around a point, in WGS84 degrees.
  function envelope(lat, lng, radiusFt) {
    const dLat = radiusFt / FT_PER_M / 111320;
    const dLng = dLat / Math.max(0.01, Math.cos(lat * Math.PI / 180));
    return { xmin: lng - dLng, ymin: lat - dLat, xmax: lng + dLng, ymax: lat + dLat };
  }

  // Rough centre of an Esri polygon (vertex average of its first ring) or point.
  function centroid(geom) {
    if (!geom) return null;
    if (typeof geom.x === 'number') return { lat: geom.y, lng: geom.x };
    const ring = geom.rings && geom.rings[0];
    if (!ring || !ring.length) return null;
    const pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
    const sum = pts.reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]);
    return { lng: sum[0] / pts.length, lat: sum[1] / pts.length };
  }

  // page: { offset, size, orderBy } when the service supports paging through results.
  function nearbyQueryParams(lat, lng, radiusFt, page = {}) {
    const e = envelope(lat, lng, radiusFt);
    const paging = page.size ? { resultOffset: String(page.offset || 0), resultRecordCount: String(page.size), ...(page.orderBy ? { orderByFields: page.orderBy } : {}) } : {};
    return {
      geometry: `${e.xmin},${e.ymin},${e.xmax},${e.ymax}`,
      geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
      outFields: '*', returnGeometry: 'true', outSR: '4326', f: 'json', ...paging,
    };
  }

  const DIRS = new Set(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW']);
  const STREET_TYPES = new Set(Object.values(SUFFIXES).filter((v) => !DIRS.has(v)));

  // Typed address -> house number and street-name words, ignoring city/state/zip after a comma,
  // spelled-out suffixes ("Avenue") and directions ("W"), which people often leave out.
  // Also returns the city when one follows a comma, or follows the street type ("100 Main St Arlington TX").
  function parseTyped(text) {
    const [first, ...rest] = String(text).split(',');
    const n = normalizeAddress(first.replace(/[^A-Za-z0-9 #.-]/g, ' ')) || { num: null, street: '' };
    let words = n.street.split(' ').filter(Boolean);
    let tail = rest.join(' ');
    const typeAt = words.findIndex((w, i) => i > 0 && STREET_TYPES.has(w));
    if (typeAt >= 0) {
      const end = typeAt + 1 + (DIRS.has(words[typeAt + 1]) ? 1 : 0);
      tail = `${words.slice(end).join(' ')} ${tail}`;
      words = words.slice(0, end);
    }
    words = words.filter((w) => !/^(TX|TEXAS|\d{5})$/.test(w));
    const name = words.filter((w) => !DIRS.has(w) && !STREET_TYPES.has(w));
    const city = tail.toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\b(TX|TEXAS)\b/g, ' ').replace(/\s+/g, ' ').trim();
    return { num: n.num, words, name: name.length ? name : words, city };
  }

  function addressQueryParams(text, situsField) {
    const t = parseTyped(text);
    // The longest street-name word is the most distinctive ("O'Neil" -> NEIL, not O).
    const key = t.name.reduce((x, w) => (w.length > x.length ? w : x), '').replace(/[^A-Z0-9]/g, '');
    const where = t.num
      ? `UPPER(${situsField}) LIKE '${t.num} %${key}%'`
      : `UPPER(${situsField}) LIKE '%${key}%'`;
    return { where, outFields: '*', returnGeometry: 'true', outSR: '4326', resultRecordCount: '50', f: 'json' };
  }

  // Best match for what was typed: most street words in common, then no unit/suite, then shortest.
  // Every street-name word typed must be there; a typed city breaks ties between towns.
  function bestAddressMatch(features, text, situsField, cityField) {
    const t = parseTyped(text);
    let best = null, bestScore = -Infinity;
    for (const feat of features || []) {
      const attrs = feat.attributes || {};
      const raw = String(attrs[situsField] || '').trim();
      const n = normalizeAddress(raw);
      if (!n || (t.num && n.num !== t.num)) continue;
      const have = new Set(n.street.split(' '));
      if (!t.name.every((w) => have.has(w))) continue;
      const city = cityField ? String(attrs[cityField] || '').trim().toUpperCase() : '';
      const score = t.words.filter((w) => have.has(w)).length * 10 + (t.city && city && t.city === city ? 50 : 0)
        - (/\s(STE|APT|UNIT|#)\s/.test(` ${raw} `) ? 5 : 0) - raw.length / 100;
      if (score > bestScore) { best = feat; bestScore = score; }
    }
    return best;
  }

  // Skip vacant lots and big buildings (apartment complexes, offices, retail).
  const MAX_HOME_SQFT = 5000;
  function isHomeSized(attrs, f) {
    if (!f.livingArea) return true;
    const sqft = Number(attrs[f.livingArea]);
    return sqft > 0 && sqft <= MAX_HOME_SQFT;
  }

  // Turn raw features into sorted result rows.
  // Returns { homes, hidden } where hidden counts parcels skipped by the size filter.
  function toHomes(features, f, lat, lng, radiusFt, { sizeFilter = true } = {}) {
    const seen = new Set();
    const homes = [];
    let hidden = 0;
    for (const feat of features || []) {
      const a = feat.attributes || {};
      const c = centroid(feat.geometry);
      if (!c) continue;
      const dist = distanceFt(lat, lng, c.lat, c.lng);
      if (dist > radiusFt) continue;
      const id = String((f.account && a[f.account]) || (f.pin && a[f.pin]) || `${c.lat.toFixed(6)},${c.lng.toFixed(6)}`).trim();
      if (seen.has(id)) continue;
      seen.add(id);
      if (sizeFilter && !isHomeSized(a, f)) { hidden++; continue; }
      const val = (role) => (f[role] && a[f[role]] != null ? String(a[f[role]]).trim() : '');
      homes.push({
        id, account: val('account'), pin: val('pin'), ownerName: val('ownerName'),
        ownerMail: [val('ownerAddr'), [val('ownerCity'), val('ownerState')].filter(Boolean).join(' '), val('ownerZip')].filter(Boolean).join(', '),
        situs: val('situs'), situsCity: val('situsCity'), lat: c.lat, lng: c.lng, dist,
        sqft: Number(val('livingArea')) || 0, yearBuilt: Number(val('yearBuilt')) || 0,
        ...classify(a, f),
      });
    }
    // High-quality (out-of-state owner) homes first, then nearest first.
    return { homes: homes.sort((x, y) => (y.outOfState ? 1 : 0) - (x.outOfState ? 1 : 0) || x.dist - y.dist), hidden };
  }

  const api = { LAYER_URL, mapFields, normalizeAddress, sameAddress, isEntity, classify, distanceFt, envelope, centroid, nearbyQueryParams, addressQueryParams, parseTyped, bestAddressMatch, isHomeSized, MAX_HOME_SQFT, toHomes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Owners = api;
})(typeof window !== 'undefined' ? window : globalThis);

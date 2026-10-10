// Parcel lookup against the Tarrant County / TAD parcel layer, and the rules that decide
// whether a home looks owner-occupied (homestead exemptions are deliberately ignored).
// Pure logic lives here so it can be tested in Node.
(function (root) {
  // Tarrant County's public parcel layer, built from TAD's appraisal roll.
  const LAYER_URL = 'https://mapit.tarrantcounty.com/arcgis/rest/services/Tax/TCProperty/MapServer/0';

  // Field names vary between service versions, so each role lists candidates in order of preference.
  const FIELD_CANDIDATES = {
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
  };
  const UNIT_RE = /\s(?:APT|UNIT|STE|SUITE|#|BLDG|LOT|SPC)\s*[\w-]*$/;

  // "1204 W. Magnolia Avenue Apt 2" -> { num: '1204', street: 'W MAGNOLIA AVE' }
  function normalizeAddress(s) {
    if (!s) return null;
    let a = ` ${String(s).toUpperCase()} `.replace(/[.,]/g, ' ').replace(/#/g, ' # ').replace(/\s+/g, ' ').trimEnd();
    a = a.replace(UNIT_RE, '').trim();
    const words = a.split(' ').map((w) => SUFFIXES[w] || w);
    if (!words.length || !/^\d+[A-Z]?$/.test(words[0])) return { num: null, street: words.join(' '), poBox: /^P ?O BOX|^BOX /.test(a) };
    return { num: words[0], street: words.slice(1).join(' '), poBox: false };
  }

  function sameAddress(a, b) {
    const x = normalizeAddress(a), y = normalizeAddress(b);
    if (!x || !y || !x.num || !y.num) return false;
    return x.num === y.num && x.street === y.street;
  }

  const ENTITY_RE = /\b(LLC|L L C|LP|LTD|INC|CORP|CORPORATION|COMPANY|CO|HOLDINGS|PROPERTIES|PROPERTY|INVESTMENTS?|CAPITAL|REALTY|HOMES|RENTALS?|ASSETS|PARTNERS|PARTNERSHIP|VENTURES|GROUP|FUND|REIT|SFR|BORROWER|ENTERPRISES?)\b/;
  const isEntity = (name) => !!name && ENTITY_RE.test(String(name).toUpperCase().replace(/[.,]/g, ' '));

  // Returns { absentee, confidence: 'high'|'medium'|'unknown', reasons: [...] }.
  function classify(attrs, f) {
    const get = (role) => (f[role] ? attrs[f[role]] : null);
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

  function nearbyQueryParams(lat, lng, radiusFt) {
    const e = envelope(lat, lng, radiusFt);
    return {
      geometry: `${e.xmin},${e.ymin},${e.xmax},${e.ymax}`,
      geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
      outFields: '*', returnGeometry: 'true', outSR: '4326', resultRecordCount: '1000', f: 'json',
    };
  }

  // SQL LIKE on the situs address, for searching a street address instead of using GPS.
  function addressQueryParams(text, situsField) {
    const safe = String(text).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    return {
      where: `UPPER(${situsField}) LIKE '${safe}%'`,
      outFields: '*', returnGeometry: 'true', outSR: '4326', resultRecordCount: '10', f: 'json',
    };
  }

  // Turn raw features into sorted result rows.
  function toHomes(features, f, lat, lng, radiusFt) {
    const seen = new Set();
    const homes = [];
    for (const feat of features || []) {
      const a = feat.attributes || {};
      const c = centroid(feat.geometry);
      if (!c) continue;
      const dist = distanceFt(lat, lng, c.lat, c.lng);
      if (dist > radiusFt) continue;
      const id = String((f.account && a[f.account]) || (f.pin && a[f.pin]) || `${c.lat.toFixed(6)},${c.lng.toFixed(6)}`).trim();
      if (seen.has(id)) continue;
      seen.add(id);
      const val = (role) => (f[role] && a[f[role]] != null ? String(a[f[role]]).trim() : '');
      homes.push({
        id, account: val('account'), pin: val('pin'), ownerName: val('ownerName'),
        ownerMail: [val('ownerAddr'), [val('ownerCity'), val('ownerState')].filter(Boolean).join(' '), val('ownerZip')].filter(Boolean).join(', '),
        situs: val('situs'), situsCity: val('situsCity'), lat: c.lat, lng: c.lng, dist,
        ...classify(a, f),
      });
    }
    return homes.sort((x, y) => x.dist - y.dist);
  }

  const api = { LAYER_URL, mapFields, normalizeAddress, sameAddress, isEntity, classify, distanceFt, envelope, centroid, nearbyQueryParams, addressQueryParams, toHomes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Owners = api;
})(typeof window !== 'undefined' ? window : globalThis);

// Run with: node --test
const test = require('node:test');
const assert = require('node:assert');
const O = require('./owners.js');

const FIELDS = ['OBJECTID', 'TAXPIN', 'ACCOUNT', 'OWNER_NAME', 'OWNER_ADDR', 'OWNER_CITY', 'OWNER_ZIP', 'SITUS_ADDR', 'ZIPCODE'].map((name) => ({ name }));
const f = O.mapFields(FIELDS);

test('maps the documented parcel-layer fields', () => {
  assert.deepStrictEqual(
    [f.account, f.pin, f.ownerName, f.ownerAddr, f.ownerCity, f.ownerZip, f.situs, f.situsZip],
    ['ACCOUNT', 'TAXPIN', 'OWNER_NAME', 'OWNER_ADDR', 'OWNER_CITY', 'OWNER_ZIP', 'SITUS_ADDR', 'ZIPCODE']);
});

test('normalizes address spelling differences', () => {
  assert.ok(O.sameAddress('1204 W. Magnolia Avenue', '1204 W MAGNOLIA AVE'));
  assert.ok(O.sameAddress('500 Oak Street Apt 3', '500 OAK ST'));
  assert.ok(O.sameAddress('77 North Elm Drive #B', '77 N ELM DR'));
  assert.ok(!O.sameAddress('1204 W MAGNOLIA AVE', '1206 W MAGNOLIA AVE'));
  assert.ok(!O.sameAddress('PO BOX 12', '12 MAIN ST'));
});

test('owner mailing elsewhere is flagged', () => {
  const r = O.classify({ OWNER_NAME: 'SMITH JOHN', OWNER_ADDR: '9 PALM CT', OWNER_CITY: 'ARLINGTON TX', SITUS_ADDR: '1204 W MAGNOLIA AVE' }, f);
  assert.strictEqual(r.absentee, true);
  assert.strictEqual(r.confidence, 'medium');
  assert.match(r.reasons[0], /9 PALM CT, ARLINGTON TX/);
});

test('mailing out of state is a strong match', () => {
  const r = O.classify({ OWNER_NAME: 'SMITH JOHN', OWNER_ADDR: '9 PALM CT', OWNER_CITY: 'IRVINE CA', SITUS_ADDR: '1204 W MAGNOLIA AVE' }, f);
  assert.strictEqual(r.confidence, 'high');
  assert.ok(r.reasons.includes('Owner is out of state (CA)'));
});

test('owner mailing to the house is not flagged', () => {
  const r = O.classify({ OWNER_NAME: 'SMITH JOHN', OWNER_ADDR: '1204 W Magnolia Avenue', SITUS_ADDR: '1204 W MAGNOLIA AVE' }, f);
  assert.strictEqual(r.absentee, false);
});

test('company owner is flagged even with a local address', () => {
  const r = O.classify({ OWNER_NAME: 'SFR BORROWER 2021-1 LLC', OWNER_ADDR: '1204 W MAGNOLIA AVE', SITUS_ADDR: '1204 W MAGNOLIA AVE' }, f);
  assert.strictEqual(r.absentee, true);
  assert.ok(r.reasons.includes('Owned by a company'));
});

test('same-zip PO box is not treated as absentee', () => {
  const r = O.classify({ OWNER_NAME: 'DOE JANE', OWNER_ADDR: 'PO BOX 1234', OWNER_ZIP: '76104-1234', SITUS_ADDR: '1204 W MAGNOLIA AVE', ZIPCODE: '76104' }, f);
  assert.strictEqual(r.absentee, false);
});

test('homestead fields are ignored', () => {
  const fHs = O.mapFields([...FIELDS, { name: 'HOMESTEAD' }]);
  assert.ok(!('homestead' in fHs));
  const base = { OWNER_NAME: 'DOE JANE', OWNER_ADDR: '1 ELSEWHERE RD', OWNER_CITY: 'FORT WORTH TX', SITUS_ADDR: '1204 W MAGNOLIA AVE' };
  assert.deepStrictEqual(O.classify({ ...base, HOMESTEAD: 'Y' }, fHs), O.classify(base, f));
  assert.deepStrictEqual(O.classify({ ...base, OWNER_ADDR: '1204 W MAGNOLIA AVE', HOMESTEAD: 'N' }, fHs).absentee, false);
});

test('toHomes filters by true distance, dedupes and sorts', () => {
  const lat = 32.73, lng = -97.34;
  const sq = (dLat, dLng) => ({ rings: [[[lng + dLng, lat + dLat], [lng + dLng + 0.0001, lat + dLat], [lng + dLng + 0.0001, lat + dLat + 0.0001], [lng + dLng, lat + dLat]]] });
  const feats = [
    { attributes: { ACCOUNT: '2', OWNER_NAME: 'B', SITUS_ADDR: '2 A ST', OWNER_ADDR: '2 A ST' }, geometry: sq(0.0010, 0) },
    { attributes: { ACCOUNT: '1', OWNER_NAME: 'A', SITUS_ADDR: '1 A ST', OWNER_ADDR: '9 Z ST' }, geometry: sq(0.0002, 0) },
    { attributes: { ACCOUNT: '1', OWNER_NAME: 'A', SITUS_ADDR: '1 A ST', OWNER_ADDR: '9 Z ST' }, geometry: sq(0.0002, 0) },
    { attributes: { ACCOUNT: '3', OWNER_NAME: 'C', SITUS_ADDR: '3 A ST', OWNER_ADDR: '3 A ST' }, geometry: sq(0.01, 0) },
  ];
  const homes = O.toHomes(feats, f, lat, lng, 500);
  assert.deepStrictEqual(homes.map((h) => h.account), ['1', '2']);
  assert.strictEqual(homes[0].absentee, true);
  assert.ok(homes[0].dist > 70 && homes[0].dist < 120, `dist ${homes[0].dist}`);
});

test('query params build a WGS84 envelope and safe address search', () => {
  const p = O.nearbyQueryParams(32.73, -97.34, 500);
  const [xmin, ymin, xmax, ymax] = p.geometry.split(',').map(Number);
  assert.ok(xmin < -97.34 && xmax > -97.34 && ymin < 32.73 && ymax > 32.73);
  assert.ok(Math.abs(O.distanceFt(32.73, -97.34, ymax, -97.34) - 500) < 1);
  assert.strictEqual(O.addressQueryParams("12 O'Neil St.", 'SITUS_ADDR').where, "UPPER(SITUS_ADDR) LIKE '12 O NEIL ST%'");
});

test('nearby query pages only when asked', () => {
  const plain = O.nearbyQueryParams(32.73, -97.34, 2640);
  assert.ok(!('resultOffset' in plain) && !('resultRecordCount' in plain));
  const p = O.nearbyQueryParams(32.73, -97.34, 2640, { offset: 2000, size: 1000, orderBy: 'OBJECTID' });
  assert.deepStrictEqual([p.resultOffset, p.resultRecordCount, p.orderByFields], ['2000', '1000', 'OBJECTID']);
});

test('padded county values are trimmed in reasons', () => {
  const r = O.classify({ OWNER_NAME: '1065 MAGNOLIA LLC   ', OWNER_ADDR: '1509 SHADY OAKS LN            ', OWNER_CITY: 'FORT WORTH, TX  ', SITUS_ADDR: '1065 W MAGNOLIA AVE           ' }, f);
  assert.deepStrictEqual(r.reasons, ['Tax bills go to 1509 SHADY OAKS LN, FORT WORTH, TX', 'Owned by a company']);
  assert.strictEqual(r.confidence, 'high');
});

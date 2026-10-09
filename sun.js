// Solar position math adapted from the SunCalc algorithm (Vladimir Agafonkin, BSD-2),
// itself based on formulas from https://aa.quae.nl/en/reken/zonpositie.html
(function (root) {
  const rad = Math.PI / 180;
  const dayMs = 86400000;
  const J1970 = 2440588;
  const J2000 = 2451545;
  const J0 = 0.0009;
  const e = rad * 23.4397; // obliquity of the Earth

  const toJulian = (date) => date.valueOf() / dayMs - 0.5 + J1970;
  const fromJulian = (j) => new Date((j + 0.5 - J1970) * dayMs);
  const toDays = (date) => toJulian(date) - J2000;

  const declination = (l, b) =>
    Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
  const rightAscension = (l, b) =>
    Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
  const altitude = (H, phi, dec) =>
    Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const siderealTime = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;

  const solarMeanAnomaly = (d) => rad * (357.5291 + 0.98560028 * d);
  const eclipticLongitude = (M) => {
    const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    const P = rad * 102.9372; // perihelion of the Earth
    return M + C + P + Math.PI;
  };

  const julianCycle = (d, lw) => Math.round(d - J0 - lw / (2 * Math.PI));
  const approxTransit = (Ht, lw, n) => J0 + (Ht + lw) / (2 * Math.PI) + n;
  const solarTransitJ = (ds, M, L) => J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const hourAngle = (h, phi, d) =>
    Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d)));

  /** Sun altitude in degrees above the horizon at a given time and place. */
  function sunAltitude(date, lat, lng) {
    const lw = rad * -lng;
    const phi = rad * lat;
    const d = toDays(date);
    const L = eclipticLongitude(solarMeanAnomaly(d));
    const H = siderealTime(d, lw) - rightAscension(L, 0);
    return altitude(H, phi, declination(L, 0)) / rad;
  }

  /**
   * Times on the given day when the sun crosses each altitude (degrees).
   * Returns { noon, [angle]: { rise, set } }; rise/set are null when the sun never
   * reaches that altitude that day (polar day/night).
   */
  function angleTimes(date, lat, lng, angles) {
    const lw = rad * -lng;
    const phi = rad * lat;
    const d = toDays(date);
    const n = julianCycle(d, lw);
    const ds = approxTransit(0, lw, n);
    const M = solarMeanAnomaly(ds);
    const L = eclipticLongitude(M);
    const dec = declination(L, 0);
    const Jnoon = solarTransitJ(ds, M, L);

    const result = { noon: fromJulian(Jnoon) };
    for (const angle of angles) {
      const w = hourAngle(angle * rad, phi, dec);
      if (Number.isNaN(w)) {
        result[angle] = { rise: null, set: null };
        continue;
      }
      const Jset = solarTransitJ(approxTransit(w, lw, n), M, L);
      const Jrise = Jnoon - (Jset - Jnoon);
      result[angle] = { rise: fromJulian(Jrise), set: fromJulian(Jset) };
    }
    return result;
  }

  // Photographers' golden hour: sun between 6° above and 4° below the horizon.
  // Blue hour: sun between 4° and 6° below the horizon.
  const GOLDEN_TOP = 6;
  const GOLDEN_BOTTOM = -4;
  const BLUE_BOTTOM = -6;
  const HORIZON = -0.833; // accounts for refraction and the sun's radius

  /** Morning/evening golden & blue hour windows for the day containing `date`. */
  function goldenHours(date, lat, lng) {
    const t = angleTimes(date, lat, lng, [GOLDEN_TOP, HORIZON, GOLDEN_BOTTOM, BLUE_BOTTOM]);
    const top = t[GOLDEN_TOP];
    const bottom = t[GOLDEN_BOTTOM];
    const blue = t[BLUE_BOTTOM];
    const horizon = t[HORIZON];
    const window = (start, end) => (start && end ? { start, end } : null);
    return {
      noon: t.noon,
      sunrise: horizon.rise,
      sunset: horizon.set,
      morningBlue: window(blue.rise, bottom.rise),
      morningGolden: window(bottom.rise, top.rise),
      eveningGolden: window(top.set, bottom.set),
      eveningBlue: window(bottom.set, blue.set),
    };
  }

  const api = { sunAltitude, angleTimes, goldenHours };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Sun = api;
})(typeof window !== 'undefined' ? window : globalThis);

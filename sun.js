// Sun position from Jean Meeus, "Astronomical Algorithms" (ch. 25, 12), accurate to
// about 0.01° — a few seconds of time. Crossing times are found numerically.
(function (root) {
  const rad = Math.PI / 180;
  const DELTA_T = 69 / 86400; // TT − UT in days (~69 s through the 2020s)
  const HOUR = 3600000;

  const norm360 = (x) => ((x % 360) + 360) % 360;

  /** Geometric altitude of the sun's centre, in degrees, with no refraction. */
  function sunAltitude(date, lat, lng) {
    const jd = date.valueOf() / 86400000 + 2440587.5; // UT
    const T = (jd + DELTA_T - 2451545) / 36525; // TT centuries since J2000

    const L0 = norm360(280.46646 + T * (36000.76983 + 0.0003032 * T));
    const M = (357.52911 + T * (35999.05029 - 0.0001537 * T)) * rad;
    const C = (1.914602 - T * (0.004817 + 0.000014 * T)) * Math.sin(M)
      + (0.019993 - 0.000101 * T) * Math.sin(2 * M)
      + 0.000289 * Math.sin(3 * M);
    const omega = (125.04 - 1934.136 * T) * rad;
    const lambda = (L0 + C - 0.00569 - 0.00478 * Math.sin(omega)) * rad; // apparent longitude
    const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
    const eps = (eps0 + 0.00256 * Math.cos(omega)) * rad;

    const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
    const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));

    const Tu = (jd - 2451545) / 36525;
    const gmst = norm360(280.46061837 + 360.98564736629 * (jd - 2451545)
      + Tu * Tu * (0.000387933 - Tu / 38710000));
    const H = (gmst + lng) * rad - ra;
    const phi = lat * rad;
    return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)) / rad;
  }

  /** Solar noon (sun highest) nearest to `date` at this longitude. */
  function solarNoon(date, lng) {
    // Start from mean solar noon, then refine with a few golden-section steps on altitude.
    const utcMidnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    let guess = utcMidnight + (12 - lng / 15) * HOUR;
    while (guess - date > 12 * HOUR) guess -= 24 * HOUR;
    while (date - guess > 12 * HOUR) guess += 24 * HOUR;
    let a = guess - 0.5 * HOUR, b = guess + 0.5 * HOUR;
    const g = (Math.sqrt(5) - 1) / 2;
    const f = (t) => -sunAltitude(new Date(t), 0, lng); // equator: altitude peaks at transit
    while (b - a > 1000) {
      const c = b - g * (b - a), d = a + g * (b - a);
      if (f(c) < f(d)) b = d; else a = c;
    }
    return new Date((a + b) / 2);
  }

  // First time in [from, to] where altitude crosses `angle` in the given direction, or null.
  function crossing(from, to, lat, lng, angle, rising) {
    const step = 10 * 60000;
    const f = (t) => sunAltitude(new Date(t), lat, lng) - angle;
    let t0 = from, f0 = f(t0);
    for (let t1 = from + step; t0 < to; t1 = Math.min(t1 + step, to)) {
      const f1 = f(t1);
      if (rising ? (f0 < 0 && f1 >= 0) : (f0 > 0 && f1 <= 0)) {
        let a = t0, b = t1, fa = f0;
        while (b - a > 500) {
          const m = (a + b) / 2, fm = f(m);
          if ((fm < 0) === (fa < 0)) { a = m; fa = fm; } else b = m;
        }
        return new Date(Math.round((a + b) / 2));
      }
      t0 = t1; f0 = f1;
      if (t1 === to) break;
    }
    return null;
  }

  /**
   * Times on the solar day nearest `date` when the sun crosses each altitude (degrees).
   * Returns { noon, [angle]: { rise, set } }; rise/set are null when it never crosses.
   */
  function angleTimes(date, lat, lng, angles) {
    const noon = solarNoon(date, lng);
    const n = noon.valueOf();
    const result = { noon };
    for (const angle of angles) {
      result[angle] = {
        rise: crossing(n - 12 * HOUR, n, lat, lng, angle, true),
        set: crossing(n, n + 12 * HOUR, lat, lng, angle, false),
      };
    }
    return result;
  }

  // Photographers' golden hour: sun between 6° above and 4° below the horizon.
  // Blue hour: sun between 4° and 6° below the horizon.
  const GOLDEN_TOP = 6;
  const GOLDEN_BOTTOM = -4;
  const BLUE_BOTTOM = -6;
  const HORIZON = -0.833; // sunrise/sunset: upper limb on the horizon, with refraction

  /** Morning/evening golden & blue hour windows for the solar day nearest `date`. */
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

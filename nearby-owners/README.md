# Nearby Owners

A phone web app that uses your location to look up the owners of nearby homes in
Tarrant County and alerts you when any look **non owner-occupied**.

**Live:** https://briangooding.github.io/bg_github/nearby-owners/ (once GitHub Pages is on)

## How it works

- Ownership comes from the Tarrant Appraisal District (TAD) roll, read through Tarrant County's
  public parcel map service (`mapit.tarrantcounty.com/.../Dynamic/TADParcels/FeatureServer/0`). tad.org
  itself has no public API, and browsers can't scrape it directly.
- It finds every parcel within 500 ft, ¼ mile or ½ mile of you, and flags a home when:
  - the tax bill is mailed somewhere other than the house, or
  - the owner's mailing address is out of state, or
  - the owner is a company (LLC, LP, Inc, "Properties", "Holdings", …).
- Homestead exemptions are ignored.
- Vacant lots and buildings over 5,000 sq ft (apartment complexes, offices, big retail) are skipped,
  since the county data doesn't say which parcels are homes. Small shops can still show up.
- **High quality** (gold highlight, listed first) = the owner's mailing address is out of state.
- **Strong match** = two or more signals. **Possible** = one.
- Small differences between the mailing address and the house (typos, plurals, "Avenue" vs "Ave",
  unit numbers) are ignored; the house number has to match.
- **Keep checking as I move** re-checks after you move about 150 ft.
- **Alert me** sends a notification (and vibrates) the first time a flagged home turns up.
  It only works while the app is open; browsers don't allow background location for web apps.
- **Check another spot** searches by street address instead of GPS. It's forgiving: "1200 Magnolia
  Avenue, Fort Worth TX 76104" finds 1200 W MAGNOLIA AVE, and a typed city picks between towns.

Flags are a best guess. Confirm on [tad.org](https://www.tad.org/) before acting on one.

## Run locally

```sh
cd nearby-owners && python3 -m http.server 8000   # then open http://localhost:8000
node --test                                          # logic tests
```

Location access needs `https://` or `localhost`.

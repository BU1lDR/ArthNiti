# Data sources, provenance and licences

This file records where every dataset and image in अर्थNiti came from, the terms we use it under, and what is still unresolved. A buyer's due diligence starts here, so keep it current. An item marked **UNRESOLVED** blocks a sale until someone fixes it.

The software's own licence is in [LICENSE](LICENSE), and the code dependencies are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Government schemes: `backend/app/data/schemes.json`

- **What it is.** 30 schemes across 7 administrative tiers. The name, tier, states, kinds of work, eligibility rules and documents list for each one were transcribed by hand from the publisher's own public page, then written up again in plain language and translated into 8 languages.
- **Terms.** The facts come from public government sources. The wording, the structure and the translations are our own, and they belong to the owner under [LICENSE](LICENSE). No government body endorses the dataset or is affiliated with it. The app does not link to any government site, a decision made on 10 September 2026 (see CLAUDE.md).
- **Where each scheme came from.** The source URL is the last field of that scheme's `SPEC` tuple in [backend/gen_schemes.py](backend/gen_schemes.py). That is the only place the URLs are kept, so they cannot drift out of step with a second copy.
- **Freshness.** Every scheme carries `last_verified`: 2026-09-01 for PMFME, PMEGP and PMMY, and 2026-09-07 for the other 27. Scheme rules change every budget cycle. **Re-verify all 30 before real users act on them.** The dataset needs a named owner, and a check at least every quarter and after every Union and state budget.

## Market data: `backend/app/data/market_data.json`

- **Current state: 9 illustrative rows, not real data.** All nine are in Uttar Pradesh (5 Lucknow, 4 Varanasi). Every row says `"source": "Prototype estimate / illustrative data"`, and the UI prints that on the page.
- **Decision (23 September 2026).** The hyperlocal claim stays, and these rows are to be replaced with sourced, dated, licensed data. `match_level` (`district` or `state`) remains the marker for how local a figure really is. **Until that replacement lands, the claim is not backed.**
- **Rules for any real row.** It must carry its publisher, its dataset URL, its licence, the period it describes, its unit, and the date we fetched it. Data from data.gov.in is used under the Government Open Data Licence – India (GODL-India), and we show the attribution that licence requires wherever the figure appears.

## States and districts: `frontend/src/data/indiaLocations.js`

- **What it is.** 36 states and union territories, 768 districts, compiled by hand as indicative names in the Latin script used on official documents. The names are public facts.
- **Accuracy.** Boundaries change, and Rajasthan is already known to be incomplete, with 33 of its 41 districts listed. **Before real use, reconcile the list against the Local Government Directory (LGD)**, the Government of India's master list of administrative units, and record the LGD codes.

## Images and brand assets

| Asset | Origin | Status |
|---|---|---|
| Lotus-and-coin mark (`components/BrandMark.jsx`, `public/favicon.svg`) | Drawn for this project in the repo, 8 Sept 2026 | Owner's |
| अर्थNiti wordmark (`components/BrandWordmark.jsx`) | Drawn for this project in the repo | Owner's |
| `src/assets/brand/*.png` | Rendered from the two items above by `tools/assetgen.mjs` | Owner's |
| `public/town-consulting.svg` | Hand-written SVG, added in 432b49c on 7 Sept 2026. No longer displayed | Owner's |
| `public/icons.svg`, `src/assets/hero.png` | Vite project template, added in 789397b. Not used by the app | MIT (Vite). Safe to delete |
| **`public/hero-backdrop.jpeg`** (and its copy in `src/assets/`) | Added in c92f907 on 9 Sept 2026. **No source recorded** | **UNRESOLVED.** Record where it came from and its licence, or replace it with an image we own or license |

## Fonts

None are shipped. The stylesheet asks for "Noto Sans", then Inter, then the system fonts, and uses whichever the device already has installed. So there is no font licence to track.

## People

The code was written by Aryan Verma (the owner), Manjeet and Netra, according to the git history. **UNRESOLVED:** get a written assignment of rights from Manjeet and Netra before any sale or exclusive licence.

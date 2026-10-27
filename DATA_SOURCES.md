# Data sources, provenance and licences

This file records where every dataset and image in अर्थNiti came from, the terms we use it under, and what is still unresolved. A buyer's due diligence starts here, so keep it current. An item marked **UNRESOLVED** blocks a sale until someone fixes it.

The software's own licence is in [LICENSE](LICENSE), and the code dependencies are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Government schemes: `backend/app/data/schemes.json`

- **What it is.** 30 schemes across 7 administrative tiers. The name, tier, states, kinds of work, eligibility rules and documents list for each one were transcribed by hand from the publisher's own public page, then written up again in plain language and translated into 8 languages.
- **Terms.** The facts come from public government sources. The wording, the structure and the translations are our own, and they belong to the owner under [LICENSE](LICENSE). No government body endorses the dataset or is affiliated with it. The app does not link to any government site, a decision made on 10 September 2026 (see CLAUDE.md).
- **Where each scheme came from.** The source URL is the last field of that scheme's `SPEC` tuple in [backend/gen_schemes.py](backend/gen_schemes.py). That is the only place the URLs are kept, so they cannot drift out of step with a second copy.
- **Freshness.** Every scheme carries `last_verified`: 2026-09-01 for PMFME, PMEGP and PMMY, and 2026-09-07 for the other 27. Scheme rules change every budget cycle. **Re-verify all 30 before real users act on them.** The dataset needs a named owner, and a check at least every quarter and after every Union and state budget.

## Market data: `backend/app/data/market_data.json`

- **What it is.** 20 rows, all sourced, fetched on 24 September 2026 by [tools/fetch-market-data.mjs](tools/fetch-market-data.mjs). They cover two districts, both in Uttar Pradesh: Lucknow and Varanasi, each with 3 crop prices and 7 business counts. The 9 illustrative rows they replace are gone, and so is the "Prototype estimate / illustrative data" label, because nothing on the page is an estimate any more.
- **Crop prices: 6 rows.** Daily mandi prices from Agmarknet, published on data.gov.in by the Ministry of Agriculture and Farmers Welfare (Directorate of Marketing and Inspection), in the dataset "Variety-wise Daily Market Prices Data of Commodity". Each row is the median wholesale price in rupees per kg over the district's last 30 reporting days or fewer, with a 10th-to-90th percentile range. Lucknow has wheat, paddy and potato. Varanasi has wheat, potato and onion. The prices shown are what a mandi pays, not what a shop charges, and the page says so.
- **Business counts: 14 rows.** Units in the Ministry of MSME's "List of MSME Registered Units under UDYAM", counted by the NIC 2008 activity codes in [tools/market-nic-map.json](tools/market-nic-map.json). The published list includes names and addresses. The fetch reads only the district code and the activity codes, and the file stores only counts. No name, address, PIN code or registration date is kept, and the resume checkpoint in `.market-cache/` (gitignored) holds counts only. A count under 10 is not printed. Many small businesses never register, and the page says the real number is higher.
- **Where the grouping is ours, the page says so.** Handicrafts and services are headings we chose, not ones the Ministry uses, and they carry `mknote.ourGrouping`. Dairy counts makers of dairy products (NIC 1050), not people who keep cattle, and it carries `mknote.dairyProducts`.
- **Terms.** Both datasets are used under the Government Open Data Licence – India (GODL-India, <https://www.data.gov.in/Godl>). Every row carries the attribution the licence requires in its `provenance` object. `/analysis` and `/report` print it once per dataset, in English and outside any collapsed section, followed by a line in the reader's language saying the publishers do not endorse the app. The attribution is plain text, not a link.
- **Provenance.** Every row records its resource ID, the publisher, the dataset's own update time, the query, the rows fetched, used and dropped, the period, the method, and the fetch time. [market_data.provenance.json](backend/app/data/market_data.provenance.json) records the run. Its `script_sha256` is the SHA-256 of `tools/market-lib.mjs` followed by `tools/fetch-market-data.mjs`, so a later reader can tell whether the code that wrote the file has changed since. The hash is over the files' raw bytes, so [.gitattributes](.gitattributes) keeps both files in LF line endings. Otherwise a Windows checkout would convert them to CRLF, and the hash would differ when the code had not changed.
- **How local each figure is.** Every row is `scope: "district"`. A reader in any other district, Kanpur included, sees the empty state. The fallback returns only rows marked `scope: "state"`, and none exist, so a Lucknow figure is never shown as though it were about somewhere else. `match_level` (`district` or `state`) still marks how local a figure is.
- **Poultry is not covered.** The egg prices worth using are published by the National Egg Coordination Committee (NECC), which is not on data.gov.in and is not under GODL. They wait for written permission.

**UNRESOLVED:**

- **Coverage is two districts.** Every other district in the dropdown shows the empty state. The crosswalk in [tools/market-crosswalk.json](tools/market-crosswalk.json) has to grow before the fetch can reach more.
- **The Udyam counts cannot be reproduced.** The list is live, updated daily, and data.gov.in serves only its current version. A re-run on another day will count differently. The provenance records `resource_updated_date` and `fetched_at`, so it is clear which version was counted, but the data cannot be fetched again as it was.
- **Staleness is checked only when the data is fetched.** A crop price whose last report is 8 or more days older than the fetch is marked `stale`, and the page warns the reader. Nothing re-checks this when a page is requested. So a row fetched on 24 September shows no warning weeks later, although the date of its last report is still printed. Either refresh the file at least weekly, or have `market_service` work staleness out at request time.
- **The data needs a named owner and a refresh schedule.** Prices move every week. Run `node tools/fetch-market-data.mjs --write --resume` with a key in `.env`, then the gates in [tools/README.md](tools/README.md).

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

Aryan Verma (the owner) now builds and maintains this alone. Before 26 Oct 2026 it was a six-person college team project, and the git history shows earlier code from Manjeet and Netra. **UNRESOLVED:** get a written assignment of rights, or at least a written permission to submit and reuse their work, from Manjeet and Netra (and from anyone else whose work is in the repo) before any hackathon submission, sale or exclusive licence.

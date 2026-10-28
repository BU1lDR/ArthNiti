# Data sources, provenance and licences

This file records where every dataset and image in अर्थNiti came from, the terms we use it under, and what is still unresolved. A buyer's due diligence starts here, so keep it current. An item marked **UNRESOLVED** blocks a sale until someone fixes it.

The software's own licence (MIT) is in [LICENSE](LICENSE). It does not cover the market rows, the egg prices or `hero-backdrop.jpeg`, which keep the terms given below. The code dependencies are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Government schemes: `backend/app/data/schemes.json`

- **What it is.** 30 schemes across 7 administrative tiers. The name, tier, states, kinds of work, eligibility rules and documents list for each one were transcribed by hand from the publisher's own public page, then written up again in plain language and translated into 8 languages.
- **Terms.** The facts come from public government sources. The wording, the structure and the translations are our own, and they are released with the rest of the repo under the MIT licence ([LICENSE](LICENSE)). No government body endorses the dataset or is affiliated with it. The app does not link to any government site, a decision made on 10 September 2026 (see CLAUDE.md).
- **Where each scheme came from.** The source URL is the last field of that scheme's `SPEC` tuple in [backend/gen_schemes.py](backend/gen_schemes.py). That is the only place the URLs are kept, so they cannot drift out of step with a second copy.
- **Freshness.** Every scheme carries `last_verified`: 2026-10-28 for PMFME, PMEGP, PMMY and Stand-Up India (their official pages were read again for the funding calculation), and 2026-09-07 for the other 26. Scheme rules change every budget cycle. **Re-verify all 30 before real users act on them.** The dataset needs a named owner, and a check at least every quarter and after every Union and state budget.

## Market data: `backend/app/data/market_data.json`

- **What it is.** 125 rows, all sourced, by [tools/fetch-market-data.mjs](tools/fetch-market-data.mjs). They cover 13 districts in 12 states. Lucknow and Varanasi (Uttar Pradesh) were fetched on 24 September 2026, and 11 more on 27 October 2026: Coimbatore, Warangal, Ernakulam, Mysuru, Pune, Jaipur, Indore, Ludhiana, Nadia, Guntur and Gaya. Each district has up to 3 crop prices and 7 business counts (Guntur has no crop price and Gaya one). The 9 illustrative rows they replace are gone, and so is the "Prototype estimate / illustrative data" label, because nothing on the page is an estimate any more.
- **Crop prices: 6 rows.** Daily mandi prices from Agmarknet, published on data.gov.in by the Ministry of Agriculture and Farmers Welfare (Directorate of Marketing and Inspection), in the dataset "Variety-wise Daily Market Prices Data of Commodity". Each row is the median wholesale price in rupees per kg over the district's last 30 reporting days or fewer, with a 10th-to-90th percentile range. Lucknow has wheat, paddy and potato. Varanasi has wheat, potato and onion. The prices shown are what a mandi pays, not what a shop charges, and the page says so.
- **Business counts: 14 rows.** Units in the Ministry of MSME's "List of MSME Registered Units under UDYAM", counted by the NIC 2008 activity codes in [tools/market-nic-map.json](tools/market-nic-map.json). The published list includes names and addresses. The fetch reads only the district code and the activity codes, and the file stores only counts. No name, address, PIN code or registration date is kept, and the resume checkpoint in `.market-cache/` (gitignored) holds counts only. A count under 10 is not printed. Many small businesses never register, and the page says the real number is higher.
- **Where the grouping is ours, the page says so.** Handicrafts and services are headings we chose, not ones the Ministry uses, and they carry `mknote.ourGrouping`. Dairy counts makers of dairy products (NIC 1050), not people who keep cattle, and it carries `mknote.dairyProducts`.
- **Terms.** Both datasets are used under the Government Open Data Licence – India (GODL-India, <https://www.data.gov.in/Godl>). Every row carries the attribution the licence requires in its `provenance` object. `/analysis` and `/report` print it once per dataset, in English and outside any collapsed section, followed by a line in the reader's language saying the publishers do not endorse the app. The attribution is plain text, not a link. The MIT licence of the code does not change these terms: whoever reuses the rows keeps the attribution.
- **Provenance.** Every row records its resource ID, the publisher, the dataset's own update time, the query, the rows fetched, used and dropped, the period, the method, and the fetch time. [market_data.provenance.json](backend/app/data/market_data.provenance.json) records the run. Its `script_sha256` is the SHA-256 of `tools/market-lib.mjs` followed by `tools/fetch-market-data.mjs`, so a later reader can tell whether the code that wrote the file has changed since. The hash is over the files' raw bytes, so [.gitattributes](.gitattributes) keeps both files in LF line endings. Otherwise a Windows checkout would convert them to CRLF, and the hash would differ when the code had not changed.
- **How local each figure is.** Every row is `scope: "district"`. A reader in any other district, Kanpur included, sees the empty state. The fallback returns only rows marked `scope: "state"`, and none exist in this file (the one state-wide row in the combined table is an egg price, see the next section), so a Lucknow figure is never shown as though it were about somewhere else. `match_level` (`district` or `state`) still marks how local a figure is.
- **Poultry has no row in this file.** Egg prices come from the National Egg Co-ordination Committee (NECC), which is not on data.gov.in and not under GODL. They have their own file and their own terms, in the next section.

**UNRESOLVED:**

- **Coverage is 13 districts.** Every other district in the dropdown shows the empty state. The crosswalk in [tools/market-crosswalk.json](tools/market-crosswalk.json) has to grow before the fetch can reach more.
- **The Udyam counts cannot be reproduced.** The list is live, updated daily, and data.gov.in serves only its current version. A re-run on another day will count differently. The provenance records `resource_updated_date` and `fetched_at`, so it is clear which version was counted, but the data cannot be fetched again as it was.
- **Staleness is checked only when the data is fetched.** A crop price whose last report is 8 or more days older than the fetch is marked `stale`, and the page warns the reader. Nothing re-checks this when a page is requested. So a row fetched on 24 September shows no warning weeks later, although the date of its last report is still printed. Either refresh the file at least weekly, or have `market_service` work staleness out at request time.
- **The data needs a named owner and a refresh schedule.** Prices move every week. Run `node tools/fetch-market-data.mjs --write --resume` with a key in `.env`, then the gates in [tools/README.md](tools/README.md).

## Egg prices: `backend/app/data/necc_egg_prices.json`

- **What it is.** 30 rows, one per NECC price centre, in 16 states: 20 of the prices NECC calls "suggested" and 10 of the ones it lists as "prevailing" (`price_kind` says which). One row (Delhi) is for the whole state and the other 29 are for a district. Fetched on 28 October 2026 by [tools/fetch-necc-prices.mjs](tools/fetch-necc-prices.mjs), with its helpers in [tools/necc-lib.mjs](tools/necc-lib.mjs), from NECC's public daily rate sheet at `https://www.e2necc.com/home/eggprice`. A row holds a price, a centre name and a date, and nothing else from the page.
- **What a price is.** The last price NECC printed for the centre in the month shown (October 2026), and `last_reported` is the date of that cell. Nothing is averaged, filled in or carried over. NECC's own "Average" column is never read: for Kolkata it printed 632.59, while the mean of that centre's own daily cells is 634.46. A price more than 8 days old is marked `stale` and one more than 30 days old is dropped, the thresholds of the crop prices above.
- **Which district.** [tools/necc-crosswalk.json](tools/necc-crosswalk.json) maps each NECC centre to one state and district and records the basis. 30 of NECC's 34 centres are mapped. Four are skipped on purpose, each with its reason in the file: Barwala (two towns share the name), East Godavari and West Godavari (districts split in 2022, so a price would be a guess) and Mumbai (two districts, and NECC does not say which).
- **Terms.** NECC is not under GODL and publishes no licence. NECC agreed to this use by e-mail in October 2026, and each row says so (`provenance.permission`). **That e-mail is the only permission there is.** It is an agreement, not a licence, and it does not say NECC endorses the app. The repo's MIT licence cannot pass it on, so the egg prices are outside that licence. The e-mail is not in the repo, because it carries the owner's contact details.
- **NECC's condition.** NECC's clarification says its prices are only suggestions, and asks anyone who passes them on to include the clarification. Every row carries its first three sentences word for word (`provenance.clarification`), and `/analysis` and `/report` print them once, in English, under the egg prices. A row that arrives without them is not drawn ([frontend/src/data/marketRows.js](frontend/src/data/marketRows.js)), and a data file with such a row fails `test_necc_data_guards.py`.
- **Provenance.** Every row records the publisher, the page, the sheet, the month, NECC's own label for the centre, the number as printed (`published_value`), our reading of the unit, the permission, the fetch time, the method, the crosswalk version and `script_sha256`. That is the SHA-256 of `tools/necc-lib.mjs` followed by `tools/fetch-necc-prices.mjs`, so editing either file means fetching again. [.gitattributes](.gitattributes) keeps both in LF line endings, for the reason given above.

**UNRESOLVED:**

- **The unit is our reading.** NECC prints whole numbers with no unit. We read them as paise per egg, so 640 is ₹6.40 an egg, or ₹640 for 100 eggs. That fits how egg prices are quoted and the range of the file (₹5.55 to ₹6.50 an egg), but NECC has not confirmed it. Ask NECC in writing. Until then the page prints the number as NECC printed it beside our reading of it (`mk.eggReading`).
- **The permission is an e-mail.** Whether NECC's fourth sentence asks for more than printing the clarification beside the prices, whether it wants a credit in a set form, and whether the agreement reaches a client who deploys the app or anyone who copies the public repo, are all unasked.
- **A snapshot goes stale in days.** NECC publishes every day and the file is one fetch. Run `node tools/fetch-necc-prices.mjs --write` just before a demo or a deployment.
- **Coverage is 30 centres.** A reader in any other district gets the empty state for poultry.

## Registration rules: `backend/app/services/compliance_service.py`

- **What it is.** The limits behind the "Registrations and licences to check" card on `/advisory` and `/report`: the FSSAI limit for a small food business (yearly sales Rs 12 lakh, 100 kg or litres of food a day, 500 litres of milk a day), the GST limits (goods Rs 40 lakh, or Rs 20 lakh in ten named States; services Rs 20 lakh, or Rs 10 lakh in four named States) and the Udyam line. They are constants in the service, written by hand from the three sources below. Nothing is fetched while the app runs, and no file in `backend/app/data/` holds them.
- **Where each came from.**
  - **FSSAI:** the Food Safety and Standards (Licensing and Registration of Food Businesses) Regulations, 2011 (Gazette notification of 1 August 2011), and FSSAI's compendium of them marked "Version - II (09.11.2017)". Reg. 1.2.1(4) defines a petty food business, reg. 2.1.1 says it registers and reg. 2.1.2 says any other holds a licence. Both files were read on 28 October 2026.
  - **GST:** the CBIC booklet "GST: An Update", 1 June 2019 (`https://cbic-gst.gov.in/pdf/01062019-GST-An-Update.pdf`), read on 28 October 2026. Registration is mandatory "only if the turnover exceeds" the limit, so a turnover exactly at the limit is within it.
  - **Udyam:** the Udyam Registration portal, read on 28 October 2026. Registration is free and asks for the Aadhaar number, the PAN and the GST number where GST applies.
- **Terms.** Numbers and the conditions on them are public facts. The wording of the card is our own, in 8 languages. No body endorses the app. The card prints each source's name and date as plain text, with no link, and tells the reader to confirm with the office concerned.
- **What the card does not say, because the sources above do not.** Fees. The rule for a business that sells both goods and services (the card says the sales are "between the two limits" and sends the reader to the GST office). Whether a farmer selling their own produce is exempt (the card says only that they "can be treated differently"). The rules for goods sold between States and for online sales. Whether farming alone can register with Udyam. The FSSAI definition also counts hawkers, itinerant vendors and temporary stall holders as petty whatever their sales, which the card does not print.
- **Our own reading.** Which kind of business is food, and whether it sells goods, services or both, is a whole-word lookup on the category the reader chose or typed under "other". It is ours and not the rule's. A word in a non-Latin script finds nothing, so the card says "Depends on your business" and "mixed".

**UNRESOLVED:**

- **The limits are as published in 2017 and 2019.** Neither source has been checked against later amendments. **Re-verify all three before real users act on them**, and name an owner and a quarterly check, as for the schemes above.
- **The FSSAI text is ambiguous.** The petty-business definition joins the sales limit and the daily quantities with "and/or". The card therefore says "usually" and prints both.
- **The Udyam count is narrow.** The card counts the matched schemes that carry "Udyam registration is required", which are two (the Kerala and North-East ones). A scheme that needs Udyam without saying so is not counted.
- **No native speaker has reviewed the card's wording** in the 7 other languages (`cl.*`, 32 keys).

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
| **`public/hero-backdrop.jpeg`** (and its copy in `src/assets/`) | Added in c92f907 on 9 Sept 2026. **No source recorded** | **UNRESOLVED.** Record where it came from and its licence, or replace it with an image we own or license. The MIT licence makes no promise about it. It is the landing page's backdrop (`frontend/src/index.css`) |

## Fonts

None are shipped. The stylesheet asks for "Noto Sans", then Inter, then the system fonts, and uses whichever the device already has installed. So there is no font licence to track.

## People

Aryan Verma (the owner) builds and maintains this alone. Before 26 Oct 2026 it was a six-person college team project, and the git history shows earlier commits from Manjeet and Netra. The owner's position, stated on 26 Oct 2026, is that it is now an individual project and needs nobody's permission. Whether that holds for the earlier team code still in the repo is a legal question that nobody has answered. On 29 Oct 2026 the owner also said that Manjeet and Netra agree to the repository being public under an open-source licence, which is now MIT. That is the owner's statement; nothing from either of them is on file. **UNRESOLVED:** a written note from each of them (a message or an e-mail saying their commits may be released under the MIT licence, kept outside the repo), and from anyone else whose work is in the repo, would settle it. It is the safe step before any sale or exclusive licence, and the one that backs the open-source release.

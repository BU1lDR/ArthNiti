# अर्थNiti — assets

Everything here is a **source asset for people**: the slide deck, the poster, the
report, anyone who needs the logo. Almost none of it is loaded by the running
app — see the two tables below before you move, rename or delete anything.

Written 9 Sept 2026, for the internal round on 11 Sept.

The product name is **अर्थNiti** — Devanagari अर्थ ("wealth") plus Latin *Niti*
("policy"), one word, mixed script on purpose. Never transliterate either half.
`ArthNiti` is the retired spelling and appears nowhere in the app; don't put it
in the deck either.

---

## What the app actually loads

Only **two** files in this whole repo are fetched by the running application, and
**neither of them is in this folder.** Both live in `frontend/public/`, because a
file there is served at the site root under a stable URL:

| File | Referenced by | Why it has to stay there |
|---|---|---|
| `frontend/public/favicon.svg` | `frontend/index.html:5` — `href="/favicon.svg"` | A favicon needs a fixed URL the browser can guess at |
| `frontend/public/hero-backdrop.jpeg` | `frontend/src/index.css:667` — `url("/hero-backdrop.jpeg")` | The CSS names that absolute path |

**Do not "tidy" either of them into this folder.** Files under `src/assets/` go
through the bundler and come out with a content hash in the name, so the two
references above would break. The backdrop in particular is the most heavily
measured element in the app — `hero-art.mjs`, `hero-geom.mjs` and
`hero-vibrance.mjs` all exist to tune it — so it is the last thing to move for
tidiness.

---

## What is in this folder

| File | What it is | Use it for |
|---|---|---|
| `brand/arthniti-mark.svg` | the mark, vector, light-background colours | anything printed or projected |
| `brand/arthniti-mark-dark.svg` | the same mark with a pale hairline | placing on a dark slide |
| `brand/arthniti-mark-512.png` | 512×665, transparent | a slide, a doc, any favicon size |
| `brand/arthniti-mark-1024.png` | 1024×1329, transparent | print, posters |
| `brand/arthniti-mark-dark-512.png` | 512×665, transparent | dark slides |
| `brand/arthniti-mark-dark-1024.png` | 1024×1329, transparent | dark posters |
| `brand/arthniti-lockup-on-light.png` | 1949px wide, transparent — mark + name + tagline | a title slide on white |
| `brand/arthniti-lockup-on-dark.png` | 1949px wide, transparent — same, light ink | a title slide on navy |
| `brand/arthniti-wordmark-on-light.png` | 2617×1251, transparent — dark ink on nothing | white or light slides, docs, print |
| `brand/arthniti-wordmark-on-dark.png` | 2617×1251, transparent — warm light ink | dark slides, a navy band |
| `brand/arthniti-wordmark-on-navy.png` | 1391px wide, on a `#08243F` plate | **superseded 13 Sept 2026** — see below |
| `hero-backdrop.jpeg` | 735×386 — **a copy of the live backdrop** | showing the landing page in the deck |
| `hero.png` | 343×361 | **nothing — see "Stale" below** |

### The mark: one master, two exports

`frontend/src/components/BrandMark.jsx` **is the master.** The two SVGs here were
exported from it by hand on 9 Sept 2026 — same `viewBox="13 0 94 122"`, same
paths, same paint order.

The component paints from CSS custom properties (`--mark-petal-outer`,
`--mark-edge` and nine others, defined in `frontend/src/index.css`), which is how
one element serves light mode, dark mode and the print palette. **A standalone
file cannot see those**, so every colour in these two SVGs is a hardcoded
resolved value:

```
petal gradient   #FBC02D @ 0.16  ->  #F4791F @ 0.44  ->  #DB1B72 @ 0.86
petal hairline   rgba(136, 14, 79, 0.45)   light file
                 rgba(255, 226, 240, 0.4)  dark file    <- the ONLY difference
coin ring        #E8730F        coin face   #FBCB48
coin shine       #FDEFC0        coin glyph  #7A1220
falling coin     #F5A31B        its rim     #C2410C
```

So: **if you change a `--mark-*` token, these files do not follow.** Re-export
them by hand and re-run the export below. The app will look right and the deck
will be a version behind, with nothing reporting it.

The hairline is the only thing that differs between the two files, and it mirrors
what the app does — the dark theme overrides exactly one of the eleven tokens.
It is **structural, not decoration**: the eight petals overlap, so where two meet
the outline is the only thing separating one petal from the next. Against navy a
deep-plum edge disappears and the rosette collapses into one orange blob.

**Never put a double hyphen in a comment in an SVG in this repo.** XML forbids it
inside a comment and an SVG is XML, so one stray pair makes the whole file
undecodable — and it fails *silently*: the browser drops the image and shows
nothing, while lint, build, `parity4.mjs`, `keycheck.mjs` and `drive.mjs` all
still pass, because none of them parses an image. `public/favicon.svg` shipped
broken this way from 8 Sept until it was caught on 9 Sept. That is why the
comments in these files spell the token names out in words.

`node tools/svgcheck.mjs` is the check that sees it: it loads every SVG in
the repo through a real browser and fails on any the browser refuses.

### The wordmark: live text in the app, a PNG here

`frontend/src/components/BrandWordmark.jsx` sets अर्थNiti as two spans plus an
inline swoosh, and that is **deliberately live text rather than an image** — it
takes its colours from tokens, scales with `--ui-scale`, is read aloud by a
screen reader, and does not blur on a projector.

The PNGs here exist because a deck is not the app. **There are two of them, one
per colour case, and both are transparent.** Its spec, if you need to set it by
hand:

```
family          "Noto Sans", Inter, ui-sans-serif, system-ui, "Segoe UI", sans-serif
                (inherited — there is no @font-face and no webfont link, so
                 Devanagari resolves to whatever the machine has; Nirmala UI here)
अर्थ             weight 800   no letter-spacing    light case #8A5A0A   dark case #F6C15C
Niti            weight 500   letter-spacing 0.03em             #12233A             #FFF4E0
swoosh          stroke-width 2 CSS px, round cap               #B86F10             #E8973A
dot             r 2.2 in a 100x9 viewBox                       #8A5A0A             #F6C15C
plate           none — see below
```

Three notes that are easy to get wrong.

The letter-spacing is on the **Latin half only** — applying it to the whole name
spaces out the Devanagari grapheme clusters and pulls the र्थ conjunct apart.

**There is no plate any more, and the reason the old one existed is now the reason
there are two files.** This section used to say a navy plate was *not optional*,
because `Niti` was a cream `#FFF4E0` that is invisible on white and the utility
strip the wordmark lived in was `#08243F` in *both* themes, so one file covered
both. Every clause of that died on 11 Sept 2026 when the wordmark moved into the
masthead: it sits on `var(--color-surface)` now, which flips, so the tokens gained
a **light case** (`#8A5A0A` / `#12233A` / `#B86F10`) that is dark-on-light and
needs no plate at all — and the two themes stopped sharing one rendering. Hence
two transparent files. A dark slide *is* the plate for the dark case.
`brand/arthniti-wordmark-on-navy.png` is the last plated export; it is kept so an
older deck still resolves, and nothing should use it in a new one.

**Do not scale the wordmark by raising `font-size`.** `.ui-wordmark-swoosh` is
`height: 0.36rem; width: 100%` — tied to the **root** font size, not to the
wordmark's own. So enlarging the name widens its box while the swoosh's stays
5.76px tall, and the `viewBox="0 0 100 9"` under `preserveAspectRatio="none"`
stretches non-uniformly: the curve flattens and the `r="2.2"` bead becomes an
ellipse. Leave the CSS geometry at the shipped size and raise the *capture* scale.

**The app loads no webfont.** It relies on Noto Sans being installed, falling
back to Inter and then the system UI font. So on a laptop without Noto Sans the
Devanagari अर्थ renders in whatever the OS substitutes. That is the real argument
for using these PNGs in the deck rather than typing the name into a text box.

### The backdrop copy

`hero-backdrop.jpeg` here is a **byte-identical copy** of the file the app
serves. As of 9 Sept 2026 both are:

```
sha256  63ec53c4648bb1a5c7f7475c9ef74cc7a385606700a995af740b9b090ae149a5
```

Check they still match before trusting either:

```bash
sha256sum frontend/public/hero-backdrop.jpeg frontend/src/assets/hero-backdrop.jpeg
```

The duplication is deliberate and it has a cost: **two copies can drift and
nothing checks.** If you replace the backdrop, replace both. The live one is
`frontend/public/hero-backdrop.jpeg` — that is the one the page reads, so if you
only do one, do that one.

Note the file here is the **raw photo**. On the page it is composited: 0.40
opacity in light mode with `brightness(0.5) saturate(2.6) contrast(0.91)`, and
0.26 opacity in dark. So it looks considerably more muted on the landing page
than it does in this folder. Those numbers are tuned against the contrast of the
hero copy sitting on top of it — see the note above the filter in `index.css`
before changing any of them.

### Stale

`hero.png` (343×361) predates the government-style redesign and **nothing
references it.** It was left in place because it may be someone's
work-in-progress from the team build. Don't use it in the deck; the branding on it is out of date.

Same for `frontend/public/icons.svg` and `frontend/public/town-consulting.svg` —
both unreferenced. `town-consulting.svg` is the line-art hero backdrop the photo
replaced on 8 Sept 2026.

---

## Re-exporting

The exports are produced by `tools/assetgen.mjs`, which **is** in your checkout
as of 9 September 2026. It used to live in the gitignored `screenshots/` and so
was absent from a fresh clone, which is why the recipe is also written down here.

```bash
cd frontend && npm run dev          # the lockup and wordmark come from the live app
node tools/assetgen.mjs       # from the repo root
```

It produces the eight PNGs from **two different sources on purpose**:

- The **mark** is rasterised from the two standalone SVGs in `brand/`. Going
  through the shipped file rather than through the React component is the point:
  it proves the export parses, that the gradient resolves with no page to inherit
  from, and that the U+20B9 rupee sign in `<text>` actually draws. The script
  scans the coin's own box for dark pixels and reports the count — a blank coin
  means the glyph did not render, and no font on the machine carries it.
- The **lockup** and the **wordmark** are captured from the **live app**, because
  both are built from tokens and real text. Re-implementing them standalone would
  mean guessing at font metrics, and they would drift from the masthead the
  moment a token moved. Capturing the real thing cannot drift.

If you have to redo it without the script: with `Emulation.setDefaultBackgroundColorOverride`
at alpha 0, and every chrome surface (`html`, `body`, `.ui-shell`, `.ui-utilitybar`,
`.ui-masthead`, `.ui-masthead-inner`, `.ui-brand`, `.ui-tricolour`, `.ui-topbar`,
`.ui-navbar`, `.ui-breadcrumb`) forced to `background: transparent !important;
border-color: transparent !important; box-shadow: none !important`, clip
`Page.captureScreenshot` to **`.ui-brand`'s own box** for the lockup and to
**`.ui-wordmark`'s own box** for the wordmark, once per theme. Four things that
went wrong and will again:

- **Clip to the element's own box; never to the container it happens to sit in.**
  The old wordmark step grew `.ui-utilitybar`'s padding and clamped the clip to
  that band — which stopped containing `.ui-wordmark` on 11 Sept 2026, and
  *growing* the band pushed the masthead 68px further down, so the clamp resolved
  to `bottom < top`: a negative-height clip. It failed silently, and it failed the
  moment the subject moved rather than when the step was edited.
- **Capture at a high scale, not by upscaling afterwards.** The lockup is only
  ~305 CSS px wide in the masthead; **the wordmark is 63.9 × 25.2** (measured at
  1440px, `en`, text size `md` — this line claimed ~72 until it was measured on
  13 Sept 2026). So 6× for the lockup and **40× for the wordmark**. Both are
  re-renders at that resolution, not upscales: the mark and the swoosh are vector
  and the name is live text, so everything is re-rasterised from outlines. The
  same bitmap enlarged in an image editor is mush.
- **`vector-effect="non-scaling-stroke"` DOES scale with the device scale factor**,
  which is worth knowing because it reads like it would not. Measured at 40×, the
  swoosh is **80 device px** against an 1131px ink height — exactly `2 × 40` — so
  `--wordmark-swoosh-w: 2` keeps its proportion and the line is not a hairline.
- **Pad the clip by ~5px, then re-crop off a measured alpha bounding box.** The
  tricolour band sits ~11px under the brand block, so a generous clip margin pulls
  a slice of it in — that is what put a grey hairline across the first lockup run.
  And the element box is not a frame around the *ink*: अर्थ's matra reaches the top
  of the span while the space under the swoosh is empty, so the raw 40× capture
  came out 196/61/227/208. The shipped files are the alpha bbox plus a uniform
  60px, i.e. 2617×1251 with all four corners at `(0,0,0,0)`.

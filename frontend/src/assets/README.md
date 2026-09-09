# अर्थNiti — assets

Everything here is a **source asset for people**: the slide deck, the poster, the
report, a teammate who needs the logo. Almost none of it is loaded by the running
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
| `brand/arthniti-wordmark-on-navy.png` | 1391px wide, on a `#08243F` plate | a header strip, a footer band |
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

The PNG here exists because a deck is not the app. Its spec, if you need to set
it by hand:

```
family          "Noto Sans", Inter, ui-sans-serif, system-ui, "Segoe UI", sans-serif
अर्थ             #F6C15C   weight 800   no letter-spacing
Niti            #FFF4E0   weight 500   letter-spacing 0.03em
swoosh + dot    #E8973A / #F6C15C
plate           #08243F
```

Two notes that are easy to get wrong. The letter-spacing is on the **Latin half
only** — applying it to the whole name spaces out the Devanagari grapheme
clusters and pulls the र्थ conjunct apart. And the navy plate is **not
optional**: `Niti` is a cream `#FFF4E0`, which is invisible on white. The utility
strip is `#08243F` in *both* themes, which is why one file covers both.

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
references it.** It was left in place because it may be a teammate's
work-in-progress. Don't use it in the deck; the branding on it is out of date.

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

It produces the seven PNGs from **two different sources on purpose**:

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

If you have to redo it without the script: screenshot `.ui-brand` in the masthead
at a high device-pixel ratio for the lockup, and `.ui-wordmark` in the utility
strip for the wordmark. Two things that went wrong the first time and will again:

- **Capture at a high scale, not by upscaling afterwards.** The lockup is only
  ~305 CSS px wide in the masthead and the wordmark ~64. A screenshot re-rendered
  at 6× or 12× is sharp because the mark is vector and the name is live text; the
  same bitmap enlarged in an image editor is mush.
- **The wordmark's navy plate is only 34px tall and the wordmark is 23px of it.**
  There is nowhere for padding to go, so a padded clip runs straight past the
  navy and pulls a slice of the masthead — including part of the lotus — into the
  bottom of the file. Grow the strip first, then pad.

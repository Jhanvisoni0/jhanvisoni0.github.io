# jhanvisoni0.github.io — Career transit map

A portfolio drawn as a metro map. Three lines carry the story:

- **E · Engineering** — roles (Techved, MSCI) and data-platform projects
- **A · AI & Writing** — the RAG platform, the blog posts, and the LLM chatbot in progress (dashed track)
- **L · Learning** — degrees and verifiable credentials

All lines end at the terminus: contact.

## Files

- `index.html` — the whole homepage (departure board, map, timetable/list view, Technical Toolkit, contact)
- `style.css` — design tokens (light/dark + line colours) at the top, then map, drawer, list and article styles
- `script.js` — theme toggle, Map/List toggle, departure-board animation, map builder, drawer, deep links
- `blog-*.html`, `project-*.html` — the four posts and three case studies (share the article styles)
- `assets/` — profile photo, favicons, blog diagrams
- `googlebca756fa1ded5ad0.html` — Google Search Console verification. **Keep it at the repo root.**

No build step. Open `index.html` in a browser to preview.

## One source of truth

Every station is a single `<article class="station">` in the `#timetable` section of `index.html`.
The **List** view shows those articles as they are. The **Map** view reads the same articles and
builds the stations and the drawer content from them, so edit content once.

Position and label are data attributes on the article:

| Attribute | Meaning |
|---|---|
| `data-line` | `eng`, `ai`, `lrn` (or `all` for the terminus) |
| `data-x`, `data-y` | position on the 2800 × 640 map canvas |
| `data-label` | `up`, `down` or `right` — where the name sits |
| `data-name`, `data-sub` | text on the map sign |
| `data-state="building"` | dashed ring, for work in progress |
| `data-link="eng"` | marks a transfer station |

Tracks are drawn in `script.js` (search for `track(`).

## Add a station

1. Copy an `<article class="station">` block into the right `.lgroup` and give it a unique `id="st-…"`.
2. Set its `data-x` / `data-y` so it sits on that line's track (y = 150 Engineering, 320 AI, 490 Learning), clear of neighbouring labels.
3. For a new post or case study, copy an existing `blog-*.html` / `project-*.html` and add a link inside the article.

## Look and feel

- Fonts: Overpass (headings and text) and Overpass Mono (the departures board). Both are open-source (SIL OFL) and embedded inside `style.css`, so there are no font files to upload and nothing loads from Google.
- Colours: line colours and both themes are CSS variables at the top of `style.css` — change them there and everything follows.

## The "Ask me" departure

The last row of the departure board flips through curiosity hooks (the XBRL bug, the 40% query-time cut, etc.) and each has an Open button that jumps to the matching station. Edit the list in `script.js` (search for `TEASERS`): each entry is `[text, station id]`. It auto-flips until the visitor presses Flip, and pauses on hover.

## Dot, the emoticon guide

A small flat emoticon (drawn as SVG inside `script.js`, styled at the bottom of `style.css`) sits in the bottom-right corner on screens 900px and wider. It never moves or pops up by itself. Click it to open a question bubble; **Show me** opens the right station and outlines the exact line that answers it. Its face changes with the moment: calm, hello while a bubble is open, wink while pointing at an answer, thinking and happy during the trick. The ✕ silences it for the session. Teasers are `[text, station id, phrase to highlight]` in the `TEASERS` list. The bubble also offers a mind-reading trick (think of 1 to 31, answer five yes/no cards, Dot reveals the number and explains the binary).

## Micro-interactions

- A thin route line under the top bar fills as you scroll, with a small train riding its end and two stops (Technical Toolkit, Contact). It is created in `routeInit()` and also runs on the case-study pages.
- Three small trains ride the map lines slowly (`animateMotion` in the map block). Hovering a legend badge previews that line.
- Station dots send out a ring on hover, and again when you open one.
- The "Ask me" row flips like a board when you press Next.
- Section rules draw in as you scroll, and in List view each stop sits on a rail and lights up when you reach it.
- Everything above is switched off for visitors who ask their device for reduced motion.

## Themes and views

- Theme: follows the visitor's local time (light 7:00–18:59, dark otherwise) until they press the sun/moon button; the choice is saved in `localStorage`.
- View: Map by default on screens 900px and wider, List on phones; the Map/List switch is saved too.
- `prefers-reduced-motion` turns off the track drawing, board scramble and smooth scrolling.

## Updating the site (cache-busting)

GitHub Pages and browsers cache CSS/JS. When you change `style.css` or `script.js`, bump the
version in every page (`style.css?v=32`, `script.js?v=19`), otherwise visitors may see the old look.

## Deploy on GitHub Pages

1. Repo named `<username>.github.io`, Settings → Pages → `main` branch, root.
2. Upload **everything** in this folder, replacing the old files. Delete any files from the old
   design that are not in this folder (for example a resume PDF).
3. Wait a minute or two, then hard-refresh.

## SEO

`index.html` has the title, description, Open Graph/Twitter tags and JSON-LD `Person` data.
If you move to a custom domain, update the hardcoded `https://jhanvisoni0.github.io/` URLs.

## Before you share it widely

- The Retail Banking and Real Assets stations link to your GitHub profile; swap in direct repo links when you have them.
- Blog posts are dated only "2026" — add exact months once you confirm them.

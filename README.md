# jhanvisoni.com — Portfolio

A terminal/technical-themed portfolio site, structured around Medallion Architecture
(Bronze → Silver → Gold) to mirror the way I actually organize data in production.

**Live:** https://jhanvisoni0.github.io (or your connected custom domain, once set up)

## Structure

- `index.html` — all page content and section markup
- `style.css` — theme, layout, and responsive rules (all colors via CSS variables at the top)
- `script.js` — scroll-reveal animation, mobile nav toggle
- `assets/profile.jpg` — headshot used in the hero
- No build step, no dependencies. Open `index.html` directly in a browser to preview locally.

## Sections

| Section | Metaphor | Content |
|---|---|---|
| Hero | — | photo, badge, name, title, bio, quick actions |
| Gold Layer | production-ready | featured projects (case-study style) |
| Architecture | system design | Medallion Architecture pipeline diagram + core principles |
| Bronze Layer | raw ingestion | work experience, education, certifications |
| Silver Layer | validated & structured | capabilities overview + skills grouped by category |
| Change Data Capture | streaming updates | blog posts |
| Contact | — | email, LinkedIn, GitHub, résumé download |

## To customize

- **Blog posts:** replace the three placeholder cards in the `#cdc` section of
  `index.html` with real titles, dates, one-line summaries, and links.
- **Project links:** two of the three project cards link to your GitHub profile
  as a placeholder (marked `<!-- TODO -->` in `index.html`) — swap in the direct
  repo links once you have them.
- **Résumé download:** the "Download Résumé" button in the hero links to
  `JhanviSoni_Resume.pdf`. Add that file to this same folder (root of the repo)
  for the link to work, or remove the button if you'd rather not offer a direct download.
- **Colors:** all theme colors are CSS variables at the top of `style.css` under `:root`.

## Deploy on GitHub Pages

1. Create a repo named exactly `<your-github-username>.github.io`.
2. Upload these files (`index.html`, `style.css`, `script.js`, and optionally your resume PDF) to the repo root.
3. In the repo's **Settings → Pages**, set the source to the `main` branch (root).
4. Your site goes live at `https://<your-github-username>.github.io` within a minute or two.
5. Optional: connect a custom domain (e.g. `jhanvisoni.com`) in the same Pages settings screen, then add the DNS records your domain registrar asks for.

# jhanvisoni0.github.io — Portfolio

A terminal/technical-themed portfolio site, structured around Medallion Architecture
(Bronze → Silver → Gold) to mirror the way I actually organize data in production.

**Live:** https://jhanvisoni0.github.io (or your connected custom domain, once set up)

## Structure

- `index.html` — main page: hero, projects, architecture, experience, skills, writing, contact
- `style.css` — theme, layout, and responsive rules (all colors via CSS variables at the top)
- `script.js` — scroll-reveal animation, mobile nav toggle
- `blog-databricks-realization.html`, `blog-ltap.html`, `blog-lakehouse-rt.html`, `blog-databricks-ai-layers.html` — standalone blog posts
- `project-financial-rag.html`, `project-real-assets.html`, `project-retail-banking.html` — full case study pages for all three projects
- `assets/profile.jpg` — headshot used in the hero
- `assets/blog-*.png` — diagrams used in the blog posts
- `assets/favicon-*.png`, `assets/apple-touch-icon.png` — site icon
- No build step, no dependencies. Open `index.html` directly in a browser to preview locally.

## Sections (index.html)

| Section | Metaphor | Content |
|---|---|---|
| Hero | — | photo, badge, name, bold tagline, bio, quick stats, vitals card, CTAs |
| Gold Layer | production-ready | featured projects (case-study style) + live embedded Streamlit demo |
| Architecture | system design | Medallion Architecture pipeline diagram + core principles |
| Bronze Layer | raw ingestion | work experience, education, certifications |
| Silver Layer | validated & structured | capabilities overview + skills grouped by category |
| Change Data Capture | streaming updates | real blog posts, linking to the standalone pages |
| Contact | — | email, LinkedIn, GitHub |

## SEO / search appearance

`index.html`'s `<head>` includes a title/description tuned for how it should appear in
search results, Open Graph + Twitter card tags for link previews, and a JSON-LD `Person`
schema to help Google recognize this as a person page. If you ever move to a custom domain,
update the hardcoded `https://jhanvisoni0.github.io/` URLs in the canonical link, Open Graph
tags, and JSON-LD block to match. New sites can take days to weeks to get indexed by
Google — submitting the URL in Google Search Console speeds this up.

## To customize

- **Add a new blog post:** copy one of the existing `blog-*.html` files as a template
  (they share the same header/footer and `article-*` CSS classes), update its title/meta/body,
  then add a card linking to it in `index.html`'s `#cdc` section.
- **Add a new project case study:** copy `project-real-assets.html` or `project-retail-banking.html`
  as a template (no live demo embed) or `project-financial-rag.html` (includes one), then link to it
  via a `case-study-cta` link on the matching project card in `index.html`. All three current
  projects already have case study pages linked.
- **Project links:** the Retail Banking and Real Assets project cards link to your GitHub
  profile as a placeholder (marked `<!-- TODO -->`) — swap in the direct repo links once you have them.
- **Live demo embed:** the Financial RAG project card embeds the live Streamlit app via
  `?embed=true`. It requires visitors to bring their own OpenAI API key, and free-tier
  Streamlit apps sleep after inactivity (shows a ~20-30s wake-up delay on first load).
- **Colors/fonts:** all theme colors and font variables are at the top of `style.css` under `:root`.

## Deploy on GitHub Pages

1. Create a repo named exactly `<your-github-username>.github.io`.
2. Upload **all** files/folders listed above to the repo root (replacing the whole set is
   safer than adding files one at a time — avoids stray duplicates).
3. In the repo's **Settings → Pages**, set the source to the `main` branch (root).
4. Your site goes live at `https://<your-github-username>.github.io` within a minute or two.
5. Optional: connect a custom domain (e.g. `jhanvisoni.com`) in the same Pages settings screen,
   then add the DNS records your domain registrar asks for — and update the SEO URLs mentioned above.

# Argota

A small Astro site backed by Notion as a CMS, deployable to Cloudflare Pages.

## Stack

- **[Astro](https://astro.build)** — static site generator
- **[Notion API](https://developers.notion.com/)** — content source (pages + posts)
- **TypeScript**, plain CSS (no Tailwind, easy to swap in)
- **Cloudflare Pages** — hosting
- **GitHub Actions** — CI build + deploy on push to `main`

## Quick start

```sh
# 1. Install deps and create .env
./scripts/bootstrap.sh

# 2. Fill in .env with your Notion token + database ID
$EDITOR .env

# 3. Run the dev server
npm run dev
```

Open http://localhost:4321.

## Notion setup

1. Go to https://www.notion.so/my-integrations and create a new internal integration. Copy the secret into `.env` as `NOTION_TOKEN`.
2. Create a Notion database with these properties:

   | Property      | Type          | Notes                                  |
   | ------------- | ------------- | -------------------------------------- |
   | `Title`       | Title         | Page title                             |
   | `Slug`        | Rich text     | URL slug; auto-derived from title if empty |
   | `Status`      | Select        | e.g. `Draft`, `Published`              |
   | `PublishedAt` | Date          | Used for sort order                    |
   | `Summary`     | Rich text     | Short description                      |
   | `Tags`        | Multi-select  | Optional                               |

3. Share the database with your integration (via the `...` menu → *Connections*).
4. Copy the database ID from its URL into `.env` as `NOTION_DATABASE_ID`.

By default only items with `Status = Published` are rendered. Override with `NOTION_STATUS_FILTER` in `.env` (set to empty string to disable filtering).

## Project layout

```
.
├── astro.config.mjs
├── package.json
├── public/                 # Static assets served as-is
├── scripts/
│   └── bootstrap.sh        # First-time setup helper
├── src/
│   ├── layouts/Base.astro
│   ├── lib/
│   │   ├── notion.ts       # Notion client + DB query
│   │   └── markdown.ts     # Tiny markdown → HTML
│   ├── pages/
│   │   ├── index.astro
│   │   ├── about.astro
│   │   ├── blog/
│   │   │   ├── index.astro
│   │   │   └── [slug].astro
│   │   └── rss.xml.ts
│   └── styles/global.css
├── wrangler.toml           # Cloudflare Pages config
└── .github/workflows/deploy.yml
```

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — build to `dist/`
- `npm run preview` — preview the production build
- `npm run check` — type-check Astro + TS

## Deploy: Cloudflare Pages

The included GitHub Actions workflow builds the site and deploys `dist/` to Cloudflare Pages on every push to `main`.

Required GitHub repository secrets:

| Secret                      | Where to get it                                  |
| --------------------------- | ------------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`      | Cloudflare dashboard → My Profile → API Tokens   |
| `CLOUDFLARE_ACCOUNT_ID`     | Cloudflare dashboard → right sidebar             |
| `CLOUDFLARE_PAGES_PROJECT`  | Name of the Pages project (e.g. `argota`)        |
| `NOTION_TOKEN`              | Notion integration secret                        |
| `NOTION_DATABASE_ID`        | Notion database ID (pages)                       |
| `NOTION_POSTS_DATABASE_ID`  | Notion database ID (posts) — optional            |
| `ANTHROPIC_API_KEY`         | Reserved for future build-time content steps     |

If you'd rather have Cloudflare build the project itself, point Pages at this repo with build command `npm run build` and output dir `dist`, then delete `.github/workflows/deploy.yml`.

## License

Choose one (MIT recommended). Add a `LICENSE` file before publishing.

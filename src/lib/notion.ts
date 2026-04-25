/**
 * Notion CMS client.
 *
 * Fetches pages from a Notion database and converts them to Markdown
 * via notion-to-md, returning a normalized shape the site can render.
 *
 * Expected database properties (rename to match your DB or adjust below):
 *   - Title       (title)
 *   - Slug        (rich_text)
 *   - Status      (select)        e.g. Draft / Published
 *   - PublishedAt (date)
 *   - Summary     (rich_text)
 *   - Tags        (multi_select)
 *
 * All env vars are read lazily inside functions so importing this module
 * never throws, even when secrets are missing (e.g. CI builds without
 * Notion configured fall through to empty results).
 */
import { Client } from '@notionhq/client';
// @ts-expect-error - notion-to-md ships loose types
import { NotionToMarkdown } from 'notion-to-md';

function env(name: string): string | undefined {
  // Server-only secrets: prefer process.env. import.meta.env is build-time
  // inlined and won't reflect runtime/CI values for non-PUBLIC_ vars.
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

function notionToken(): string | undefined {
  // Project standard is NOTION_API_KEY; legacy NOTION_TOKEN is accepted as fallback.
  return env('NOTION_API_KEY') ?? env('NOTION_TOKEN');
}
function pagesDbId(): string | undefined {
  // Public DB holds static pages (e.g. About). Falls back to legacy name.
  return env('NOTION_PUBLIC_DB_ID') ?? env('NOTION_DATABASE_ID');
}
function postsDbId(): string | undefined {
  // Private DB holds posts. Falls back to legacy name, then to pages DB.
  return (
    env('NOTION_PRIVATE_DB_ID') ??
    env('NOTION_POSTS_DATABASE_ID') ??
    pagesDbId()
  );
}
function statusFilter(): string | undefined {
  // Empty string disables the filter; unset defaults to "Published".
  const raw = process.env.NOTION_STATUS_FILTER;
  if (raw === undefined) return 'Published';
  return raw === '' ? undefined : raw;
}

export interface NotionEntry {
  id: string;
  slug: string;
  title: string;
  summary: string;
  publishedAt: string | null;
  tags: string[];
  markdown: string;
}

let _client: Client | null = null;
function client(): Client {
  const token = notionToken();
  if (!token) {
    throw new Error(
      'NOTION_TOKEN is not set. Copy .env.example to .env and fill it in.',
    );
  }
  if (!_client) _client = new Client({ auth: token });
  return _client;
}

function plainText(rich: any[] | undefined): string {
  if (!rich || !Array.isArray(rich)) return '';
  return rich.map((r) => r?.plain_text ?? '').join('');
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function pageToMarkdown(pageId: string): Promise<string> {
  const n2m = new NotionToMarkdown({ notionClient: client() });
  const blocks = await n2m.pageToMarkdown(pageId);
  const md = n2m.toMarkdownString(blocks);
  return md?.parent ?? '';
}

async function queryDatabase(databaseId: string): Promise<NotionEntry[]> {
  if (!databaseId) return [];

  const status = statusFilter();
  const filter = status
    ? { property: 'Status', select: { equals: status } }
    : undefined;

  const results: any[] = [];
  let cursor: string | undefined;
  do {
    const resp: any = await client().databases.query({
      database_id: databaseId,
      start_cursor: cursor,
      filter,
      sorts: [{ property: 'PublishedAt', direction: 'descending' }],
    });
    results.push(...resp.results);
    cursor = resp.has_more ? resp.next_cursor : undefined;
  } while (cursor);

  // Fetch page bodies in parallel — sequential awaits make this 5-10× slower
  // for typical post counts.
  const raw = await Promise.all(
    results.map(async (page) => {
      const props = page.properties ?? {};
      const title = plainText(props.Title?.title) || 'Untitled';
      const slugRaw = plainText(props.Slug?.rich_text);
      const baseSlug = slugRaw ? slugify(slugRaw) : slugify(title);
      const summary = plainText(props.Summary?.rich_text);
      const publishedAt = props.PublishedAt?.date?.start ?? null;
      const tags: string[] = (props.Tags?.multi_select ?? []).map(
        (t: any) => t.name,
      );
      const markdown = await pageToMarkdown(page.id);
      return {
        id: page.id,
        baseSlug,
        title,
        summary,
        publishedAt,
        tags,
        markdown,
      };
    }),
  );

  // Dedupe slugs deterministically. Astro's getStaticPaths throws on
  // duplicates, so we suffix collisions with -2, -3, … in query order.
  const seen = new Set<string>();
  const entries: NotionEntry[] = raw.map((r) => {
    let slug = r.baseSlug || r.id;
    if (seen.has(slug)) {
      let n = 2;
      while (seen.has(`${r.baseSlug}-${n}`)) n++;
      slug = `${r.baseSlug}-${n}`;
      console.warn(
        `[notion] slug collision for "${r.title}" → using "${slug}"`,
      );
    }
    seen.add(slug);
    return {
      id: r.id,
      slug,
      title: r.title,
      summary: r.summary,
      publishedAt: r.publishedAt,
      tags: r.tags,
      markdown: r.markdown,
    };
  });

  return entries;
}

// Per-build cache so multiple pages (index, blog, RSS, [slug]) share one query.
let _postsCache: Promise<NotionEntry[]> | null = null;
let _pagesCache: Promise<NotionEntry[]> | null = null;

export function getPages(): Promise<NotionEntry[]> {
  const id = pagesDbId();
  if (!id) return Promise.resolve([]);
  if (!_pagesCache) _pagesCache = queryDatabase(id);
  return _pagesCache;
}

export function getPosts(): Promise<NotionEntry[]> {
  const id = postsDbId();
  if (!id) return Promise.resolve([]);
  if (!_postsCache) _postsCache = queryDatabase(id);
  return _postsCache;
}

/**
 * Returns true if Notion env vars are configured. Useful for skipping
 * Notion-backed routes during local dev when no token is present.
 */
export function notionConfigured(): boolean {
  return Boolean(notionToken() && pagesDbId());
}

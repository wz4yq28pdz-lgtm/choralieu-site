/**
 * Notion CMS client for Choralieu.
 *
 * Pulls posts from the public and private "Posts" databases and converts
 * each page body to Markdown via notion-to-md.
 *
 * Real DB schema (verified against the live workspace):
 *   - Title          (title)
 *   - Slug           (rich_text)        URL-safe slug
 *   - Status         (select)           Draft | Published
 *   - Visibility     (select)           Public | Gated-Full | Gated-Preview | Internal-Only
 *   - Audience       (select)           Everyone | Members | Collaborators
 *   - Excerpt        (rich_text)        Card / RSS summary
 *   - Cover Image URL (url)
 *   - Tags           (multi_select)
 *   - Created Date   (created_time)     auto
 *   - Last Edited    (last_edited_time) auto, used for sort order
 *
 * All env vars are read lazily inside functions so importing this module
 * never throws, even when secrets are missing.
 */
import { Client } from '@notionhq/client';
// @ts-expect-error - notion-to-md ships loose types
import { NotionToMarkdown } from 'notion-to-md';

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

function notionToken(): string | undefined {
  return env('NOTION_API_KEY') ?? env('NOTION_TOKEN');
}
function publicDbId(): string | undefined {
  return env('NOTION_PUBLIC_DB_ID') ?? env('NOTION_DATABASE_ID');
}
function privateDbId(): string | undefined {
  return env('NOTION_PRIVATE_DB_ID') ?? env('NOTION_POSTS_DATABASE_ID');
}
function statusFilter(): string | undefined {
  const raw = process.env.NOTION_STATUS_FILTER;
  if (raw === undefined) return 'Published';
  return raw === '' ? undefined : raw;
}

export type Visibility =
  | 'Public'
  | 'Gated-Full'
  | 'Gated-Preview'
  | 'Internal-Only';

export type Audience = 'Everyone' | 'Members' | 'Collaborators';

export interface NotionEntry {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  /** Auto-set last-edited timestamp; used as the post's effective publish date. */
  lastEdited: string | null;
  /** Auto-set creation timestamp. */
  createdAt: string | null;
  visibility: Visibility | null;
  audience: Audience | null;
  coverImageUrl: string | null;
  tags: string[];
  markdown: string;
}

let _client: Client | null = null;
function client(): Client {
  const token = notionToken();
  if (!token) {
    throw new Error(
      'NOTION_API_KEY is not set. Copy .env.example to .env and fill it in.',
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
      // 'Last Edited' is the auto-timestamp column on these DBs.
      sorts: [{ property: 'Last Edited', direction: 'descending' }],
    });
    results.push(...resp.results);
    cursor = resp.has_more ? resp.next_cursor : undefined;
  } while (cursor);

  // Fetch page bodies in parallel.
  const raw = await Promise.all(
    results.map(async (page) => {
      const props = page.properties ?? {};
      const title = plainText(props.Title?.title) || 'Untitled';
      const slugRaw = plainText(props.Slug?.rich_text);
      const baseSlug = slugRaw ? slugify(slugRaw) : slugify(title);
      const excerpt = plainText(props.Excerpt?.rich_text);
      const lastEdited = props['Last Edited']?.last_edited_time ?? null;
      const createdAt = props['Created Date']?.created_time ?? null;
      const visibility = (props.Visibility?.select?.name ?? null) as
        | Visibility
        | null;
      const audience = (props.Audience?.select?.name ?? null) as
        | Audience
        | null;
      const coverImageUrl = props['Cover Image URL']?.url ?? null;
      const tags: string[] = (props.Tags?.multi_select ?? []).map(
        (t: any) => t.name,
      );
      const markdown = await pageToMarkdown(page.id);
      return {
        id: page.id,
        baseSlug,
        title,
        excerpt,
        lastEdited,
        createdAt,
        visibility,
        audience,
        coverImageUrl,
        tags,
        markdown,
      };
    }),
  );

  // Dedupe slugs deterministically. Astro's getStaticPaths throws on duplicates.
  const seen = new Set<string>();
  return raw.map((r) => {
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
      excerpt: r.excerpt,
      lastEdited: r.lastEdited,
      createdAt: r.createdAt,
      visibility: r.visibility,
      audience: r.audience,
      coverImageUrl: r.coverImageUrl,
      tags: r.tags,
      markdown: r.markdown,
    };
  });
}

// Per-build promise cache (one query per DB, shared across pages).
let _publicCache: Promise<NotionEntry[]> | null = null;
let _privateCache: Promise<NotionEntry[]> | null = null;

/** Posts from the public DB. Renders site-wide. */
export function getPublicPosts(): Promise<NotionEntry[]> {
  const id = publicDbId();
  if (!id) return Promise.resolve([]);
  if (!_publicCache) _publicCache = queryDatabase(id);
  return _publicCache;
}

/** Posts from the private DB. Render only on gated routes. */
export function getPrivatePosts(): Promise<NotionEntry[]> {
  const id = privateDbId();
  if (!id) return Promise.resolve([]);
  if (!_privateCache) _privateCache = queryDatabase(id);
  return _privateCache;
}

// Backwards-compatible aliases for the existing pages.
// `getPosts` → public DB (the main blog feed).
// `getPages` → kept for the old "static pages" call site; for now points at
// public posts. Wire to a dedicated DB later if needed.
export const getPosts = getPublicPosts;
export const getPages = getPublicPosts;

/** True when a Notion token and at least one DB ID are configured. */
export function notionConfigured(): boolean {
  return Boolean(notionToken() && (publicDbId() || privateDbId()));
}

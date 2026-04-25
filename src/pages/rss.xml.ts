import rss from '@astrojs/rss';
import { getPosts, notionConfigured } from '../lib/notion';

export async function GET(context: { site?: URL }) {
  const posts = notionConfigured() ? await getPosts() : [];
  const site = context.site ?? new URL('https://argota.example.com');
  return rss({
    title: 'Argota',
    description: 'Argota — feed of recent posts.',
    site,
    items: posts.map((p) => ({
      title: p.title,
      pubDate: p.publishedAt ? new Date(p.publishedAt) : new Date(),
      description: p.summary,
      // RSS readers require absolute URLs.
      link: new URL(`/blog/${p.slug}/`, site).toString(),
    })),
  });
}

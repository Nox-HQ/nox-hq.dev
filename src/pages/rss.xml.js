import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
  const posts = (await getCollection('blog', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf()
  );

  return rss({
    title: 'Nox blog',
    description:
      'Open-source security scanner with first-class AI application and MCP security. Notes on MCP threats, scanner precision, and AppSec.',
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.publishedAt,
      link: `/blog/${post.slug}/`,
      categories: post.data.tags,
      author: post.data.author,
    })),
    customData: '<language>en-us</language>',
  });
}

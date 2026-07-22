import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    publishedAt: z.coerce.date(),
    author: z.string().default('nox-hq'),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

/**
 * Release notes, generated from nox's own CHANGELOG.md by
 * `npm run sync:changelog`. Do not hand-edit the files in
 * `src/content/changelog/` — the next sync overwrites them.
 */
const changelog = defineCollection({
  type: 'content',
  schema: z.object({
    version: z.string(),
    date: z.coerce.date(),
    /** Minor series (`1.13`), used to group patch releases on the page. */
    series: z.string(),
    /** Section headings the release carries: Added, Fixed, Security, … */
    sections: z.array(z.string()).default([]),
    /** Prose the release opens with, before its first section. May be empty. */
    summary: z.string().default(''),
  }),
});

export const collections = { blog, changelog };

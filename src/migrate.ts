/**
 * Ghost JSON → Astro MDX Migration
 *
 * Usage: npx tsx src/migrate.ts <ghost-export.json> [options]
 *
 * Options:
 *   --out-dir <path>          Output directory (default: ./content)
 *   --collection <tag:dir>    Map a tag to a collection directory (repeatable)
 *   --default-collection <n>  Directory for untagged posts (default: posts)
 *   --pages-collection <n>    Directory for pages (default: pages)
 *   --image-manifest <path>   Path to image-manifest.json for URL rewriting
 *   --ghost-url <url>         Ghost site URL for resolving relative image paths
 *   --include-drafts          Include draft posts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { GhostExport, GhostTag, MigrateOptions } from './types.js';
import { createTurndownService, htmlToMarkdown } from './markdown.js';

function escapeYaml(str: string): string {
  if (/[:\n"'#{}[\],&*?|><!%@`]/.test(str) || str.trim() !== str) {
    return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return str;
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function migrate(options: MigrateOptions) {
  const {
    exportPath,
    outDir,
    collections,
    defaultCollection = 'posts',
    pagesCollection = 'pages',
    publishedOnly = true,
    imageManifestPath,
    ghostUrl,
  } = options;

  const exportData: GhostExport = JSON.parse(readFileSync(exportPath, 'utf-8'));
  const data = exportData.db[0].data;

  // Load image manifest if provided
  let imageManifest: Record<string, string> = {};
  if (imageManifestPath && existsSync(imageManifestPath)) {
    imageManifest = JSON.parse(readFileSync(imageManifestPath, 'utf-8'));
  }

  // Build tag lookup
  const tagsById = new Map<string, GhostTag>();
  for (const tag of data.tags) {
    tagsById.set(tag.id, tag);
  }

  // Build post → tags mapping (sorted by sort_order)
  const postTags = new Map<string, GhostTag[]>();
  const sortedPostTags = [...data.posts_tags].sort((a, b) => a.sort_order - b.sort_order);
  for (const pt of sortedPostTags) {
    const tag = tagsById.get(pt.tag_id);
    if (!tag) continue;
    const existing = postTags.get(pt.post_id) || [];
    existing.push(tag);
    postTags.set(pt.post_id, existing);
  }

  // Ensure output directories
  const pagesDir = join(outDir, pagesCollection);
  ensureDir(pagesDir);
  for (const dir of Object.values(collections)) {
    ensureDir(join(outDir, dir));
  }
  ensureDir(join(outDir, defaultCollection));

  const turndown = createTurndownService();
  const urlMap: Record<string, string> = {};
  const counts: Record<string, number> = {};

  for (const post of data.posts) {
    if (publishedOnly && post.status !== 'published') continue;

    const tags = postTags.get(post.id) || [];
    const tagSlugs = tags.map(t => t.slug);
    const visibleTags = tags.filter(t => !t.slug.startsWith('hash-'));

    // Convert HTML to markdown
    let content = htmlToMarkdown(post.html || '', turndown);

    // Rewrite image URLs from manifest
    for (const [ghostUrlStr, newUrl] of Object.entries(imageManifest)) {
      content = content.replaceAll(ghostUrlStr, newUrl);
    }

    // Replace __GHOST_URL__ placeholder
    if (ghostUrl) {
      content = content.replaceAll('__GHOST_URL__', ghostUrl);
    }

    // Rewrite feature image URL
    let image = post.feature_image;
    if (image) {
      if (imageManifest[image]) {
        image = imageManifest[image];
      }
      if (ghostUrl) {
        image = image.replace('__GHOST_URL__', ghostUrl);
      }
    }

    if (post.type === 'page') {
      const frontmatter = [
        '---',
        `title: ${escapeYaml(post.title)}`,
        post.meta_description ? `description: ${escapeYaml(post.meta_description)}` : null,
        image ? `image: ${escapeYaml(image)}` : null,
        post.feature_image_alt ? `imageAlt: ${escapeYaml(post.feature_image_alt)}` : null,
        '---',
      ].filter(Boolean).join('\n');

      const filePath = join(pagesDir, `${post.slug}.mdx`);
      writeFileSync(filePath, `${frontmatter}\n\n${content}\n`);
      urlMap[`/${post.slug}/`] = filePath;
      counts[pagesCollection] = (counts[pagesCollection] || 0) + 1;
    } else {
      const description = post.custom_excerpt || post.meta_description;
      const tagNames = visibleTags
        .filter(t => !Object.keys(collections).includes(t.slug))
        .map(t => t.name);

      const frontmatter = [
        '---',
        `title: ${escapeYaml(post.title)}`,
        description ? `description: ${escapeYaml(description)}` : null,
        post.published_at ? `pubDate: ${new Date(post.published_at).toISOString().split('T')[0]}` : null,
        post.updated_at ? `updatedDate: ${new Date(post.updated_at).toISOString().split('T')[0]}` : null,
        post.featured ? 'featured: true' : null,
        post.status === 'draft' ? 'draft: true' : null,
        image ? `image: ${escapeYaml(image)}` : null,
        post.feature_image_alt ? `imageAlt: ${escapeYaml(post.feature_image_alt)}` : null,
        tagNames.length > 0 ? `tags:\n${tagNames.map(t => `  - ${escapeYaml(t)}`).join('\n')}` : null,
        post.custom_excerpt ? `excerpt: ${escapeYaml(post.custom_excerpt)}` : null,
        '---',
      ].filter(Boolean).join('\n');

      // Determine collection from tags
      let collectionDir = defaultCollection;
      for (const [tagSlug, dirName] of Object.entries(collections)) {
        if (tagSlugs.includes(tagSlug)) {
          collectionDir = dirName;
          break;
        }
      }

      const filePath = join(outDir, collectionDir, `${post.slug}.mdx`);
      writeFileSync(filePath, `${frontmatter}\n\n${content}\n`);
      urlMap[`/${post.slug}/`] = filePath;
      counts[collectionDir] = (counts[collectionDir] || 0) + 1;
    }
  }

  // Write URL map
  const urlMapPath = join(outDir, '..', 'url-map.json');
  writeFileSync(urlMapPath, JSON.stringify(urlMap, null, 2));

  return { counts, urlMapPath, urlMap };
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('/migrate.ts')) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`Usage: npx tsx src/migrate.ts <ghost-export.json> [options]

Options:
  --out-dir <path>          Output directory (default: ./content)
  --collection <tag:dir>    Map a tag slug to a collection directory (repeatable)
                            Example: --collection blog:blog --collection portfolio:portfolio
  --default-collection <n>  Directory for untagged posts (default: posts)
  --pages-collection <n>    Directory for pages (default: pages)
  --image-manifest <path>   Path to image-manifest.json for URL rewriting
  --ghost-url <url>         Ghost site URL for resolving __GHOST_URL__ placeholders
  --include-drafts          Include draft posts
`);
    process.exit(args.includes('--help') ? 0 : 1);
  }

  const exportPath = resolve(args[0]);
  let outDir = resolve('./content');
  const collections: Record<string, string> = {};
  let defaultCollection = 'posts';
  let pagesCollection = 'pages';
  let imageManifestPath: string | undefined;
  let ghostUrl: string | undefined;
  let publishedOnly = true;

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--out-dir':
        outDir = resolve(args[++i]);
        break;
      case '--collection': {
        const [tag, dir] = args[++i].split(':');
        collections[tag] = dir;
        break;
      }
      case '--default-collection':
        defaultCollection = args[++i];
        break;
      case '--pages-collection':
        pagesCollection = args[++i];
        break;
      case '--image-manifest':
        imageManifestPath = resolve(args[++i]);
        break;
      case '--ghost-url':
        ghostUrl = args[++i];
        break;
      case '--include-drafts':
        publishedOnly = false;
        break;
    }
  }

  const result = migrate({
    exportPath,
    outDir,
    collections,
    defaultCollection,
    pagesCollection,
    publishedOnly,
    imageManifestPath,
    ghostUrl,
  });

  console.log('Migration complete:');
  for (const [collection, count] of Object.entries(result.counts)) {
    console.log(`  ${collection}: ${count}`);
  }
  console.log(`  URL map: ${result.urlMapPath}`);
}

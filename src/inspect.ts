/**
 * Inspect a Ghost JSON export
 *
 * Usage: npx tsx src/inspect.ts <ghost-export.json>
 *
 * Prints a summary of posts, pages, tags, and how they're categorized.
 */

import { readFileSync } from 'node:fs';
import type { GhostExport } from './types.js';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: npx tsx src/inspect.ts <ghost-export.json>');
  process.exit(1);
}

const exportData: GhostExport = JSON.parse(readFileSync(args[0], 'utf-8'));
const data = exportData.db[0].data;

console.log('Posts:', data.posts.length);
console.log('Tags:', data.tags.length);
console.log('Post–Tag relations:', data.posts_tags.length);
console.log('---');

const pages = data.posts.filter(p => p.type === 'page');
const posts = data.posts.filter(p => p.type === 'post');
const published = posts.filter(p => p.status === 'published');
const drafts = posts.filter(p => p.status === 'draft');

console.log(`\nPages: ${pages.length}`);
pages.forEach(p => console.log(`  - ${p.slug} [${p.status}]`));

console.log(`\nPosts: ${posts.length} (${published.length} published, ${drafts.length} drafts)`);

// Build tag lookup
const tagMap = new Map(data.tags.map(t => [t.id, t]));
const postTags = new Map<string, string[]>();
for (const pt of data.posts_tags) {
  const t = tagMap.get(pt.tag_id);
  if (!t) continue;
  const arr = postTags.get(pt.post_id) || [];
  arr.push(t.slug);
  postTags.set(pt.post_id, arr);
}

// Group published posts by their tags
const tagGroups = new Map<string, typeof published>();
for (const post of published) {
  const tags = postTags.get(post.id) || [];
  if (tags.length === 0) {
    const group = tagGroups.get('(untagged)') || [];
    group.push(post);
    tagGroups.set('(untagged)', group);
  }
  for (const tag of tags) {
    const group = tagGroups.get(tag) || [];
    group.push(post);
    tagGroups.set(tag, group);
  }
}

console.log('\nTags (with published post counts):');
const sortedTags = [...tagGroups.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [tag, tagPosts] of sortedTags) {
  console.log(`  ${tag}: ${tagPosts.length}`);
  tagPosts.forEach(p => console.log(`    - ${p.slug}`));
}

// Summary of feature images
const withImages = published.filter(p => p.feature_image);
const totalImages = new Set<string>();
for (const post of data.posts) {
  if (post.feature_image) totalImages.add(post.feature_image);
  if (post.html) {
    const matches = post.html.matchAll(/(?:src|srcset)=["']([^"']+?)["']/g);
    for (const m of matches) {
      const parts = m[1].split(',').map(s => s.trim().split(/\s+/)[0]);
      parts.forEach(url => totalImages.add(url));
    }
  }
}

console.log(`\nImages:`);
console.log(`  Posts with feature images: ${withImages.length}/${published.length}`);
console.log(`  Total unique image URLs: ${totalImages.size}`);

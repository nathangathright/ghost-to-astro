# ghost-to-astro

Migrate a Ghost CMS site to Astro with MDX content collections.

## What it does

- Converts Ghost JSON exports into MDX files with YAML frontmatter
- Handles Ghost-specific HTML (bookmark cards, gallery cards, embeds, figures)
- Categorizes posts into collections based on tag slugs
- Optionally generates responsive WebP images and uploads to Cloudflare R2
- Produces a URL map for redirect verification

## How this was made

This project was built to migrate [nathangathright.com](https://nathangathright.com) from Ghost to Astro. Agentically-authored commits are attributed via `Co-Authored-By` in the git log.

## Quick start

```bash
npm install
```

### 1. Inspect your export

```bash
npm run inspect -- path/to/ghost-export.json
```

This shows a summary of posts, pages, tags, and images in the export.

### 2. Run the migration

```bash
npm run migrate -- path/to/ghost-export.json \
  --out-dir ./src/content \
  --collection blog:blog \
  --collection portfolio:portfolio \
  --ghost-url https://your-ghost-site.com
```

### 3. Upload images to R2 (optional)

```bash
export R2_ACCOUNT_ID=...
export R2_ACCESS_KEY_ID=...
export R2_SECRET_ACCESS_KEY=...

npm run upload-images -- path/to/ghost-export.json \
  --ghost-url https://your-ghost-site.com \
  --bucket my-images \
  --image-base-url https://images.example.com
```

Then re-run the migration with the manifest to rewrite image URLs:

```bash
npm run migrate -- path/to/ghost-export.json \
  --out-dir ./src/content \
  --collection blog:blog \
  --image-manifest ./image-manifest.json
```

## CLI options

### `migrate`

| Option | Description | Default |
|--------|-------------|---------|
| `--out-dir <path>` | Output directory for MDX files | `./content` |
| `--collection <tag:dir>` | Map a Ghost tag slug to a collection directory (repeatable) | — |
| `--default-collection <name>` | Directory for posts matching no collection tag | `posts` |
| `--pages-collection <name>` | Directory for Ghost pages | `pages` |
| `--image-manifest <path>` | Path to `image-manifest.json` for URL rewriting | — |
| `--ghost-url <url>` | Ghost site URL (replaces `__GHOST_URL__` placeholders) | — |
| `--include-drafts` | Include draft posts | off |

### `upload-images`

| Option | Description | Default |
|--------|-------------|---------|
| `--ghost-url <url>` | Ghost site URL for downloading images | required |
| `--bucket <name>` | R2/S3 bucket name | — |
| `--image-base-url <url>` | Public CDN base URL for uploaded images | required |
| `--manifest <path>` | Output path for image manifest | `./image-manifest.json` |
| `--widths <w1,w2,...>` | Responsive widths to generate | `400,750,960,1140,1920` |
| `--quality <n>` | WebP quality (1-100) | `80` |
| `--dry-run` | Download but don't upload | off |

## Programmatic usage

```typescript
import { migrate } from 'ghost-to-astro';

const result = migrate({
  exportPath: './ghost-export.json',
  outDir: './src/content',
  collections: { blog: 'blog', portfolio: 'portfolio' },
  ghostUrl: 'https://your-site.com',
});

console.log(result.counts); // { blog: 18, portfolio: 6, pages: 2 }
```

## Frontmatter output

### Posts

```yaml
title: My Post Title
description: Optional excerpt or meta description
pubDate: 2024-01-15
updatedDate: 2024-02-01
featured: true
image: /content/images/2024/01/hero.jpg
imageAlt: A description of the image
tags:
  - Design
  - Development
excerpt: A custom excerpt
```

### Pages

```yaml
title: About
description: Optional meta description
image: /content/images/about.jpg
imageAlt: About page hero
```

## Ghost HTML handling

The migration uses [Turndown](https://github.com/mixmark-io/turndown) with custom rules for Ghost-specific markup:

- **Bookmark cards** → Markdown links with title
- **Gallery cards** → Individual image tags
- **Embed cards** → Iframes or linked content
- **Figures** → Images with optional captions (italic text)

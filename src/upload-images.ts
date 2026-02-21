/**
 * Ghost Image → R2/S3 Upload Script
 *
 * Usage: npx tsx src/upload-images.ts <ghost-export.json> [options]
 *
 * Options:
 *   --ghost-url <url>         Ghost site URL for downloading images
 *   --bucket <name>           R2/S3 bucket name
 *   --image-base-url <url>    Public CDN base URL for images
 *   --manifest <path>         Output path for image-manifest.json (default: ./image-manifest.json)
 *   --widths <w1,w2,...>       Responsive widths (default: 400,750,960,1140,1920)
 *   --quality <n>             WebP quality 1-100 (default: 80)
 *   --dry-run                 Download and process but don't upload
 *
 * Environment variables:
 *   R2_ACCOUNT_ID
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, basename, extname } from 'node:path';
import type { GhostExport } from './types.js';

const DEFAULT_WIDTHS = [400, 750, 960, 1140, 1920];

function extractImageUrls(html: string): string[] {
  const urls: string[] = [];
  const imgRegex = /(?:src|srcset)=["']([^"']+?)["']/g;
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    const parts = match[1].split(',').map(s => s.trim().split(/\s+/)[0]);
    urls.push(...parts);
  }
  return urls.filter(url => url.startsWith('http') || url.startsWith('/content/'));
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`Usage: npx tsx src/upload-images.ts <ghost-export.json> [options]

Options:
  --ghost-url <url>         Ghost site URL for downloading images
  --bucket <name>           R2/S3 bucket name
  --image-base-url <url>    Public CDN base URL for uploaded images
  --manifest <path>         Output path for image manifest (default: ./image-manifest.json)
  --widths <w1,w2,...>      Responsive widths (default: 400,750,960,1140,1920)
  --quality <n>             WebP quality 1-100 (default: 80)
  --dry-run                 Download and process but don't upload

Environment variables:
  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
`);
    process.exit(args.includes('--help') ? 0 : 1);
  }

  const exportPath = resolve(args[0]);
  let ghostUrl = process.env.GHOST_URL || '';
  let bucketName = process.env.R2_BUCKET_NAME || '';
  let imageBaseUrl = '';
  let manifestPath = resolve('./image-manifest.json');
  let widths = DEFAULT_WIDTHS;
  let quality = 80;
  let dryRun = false;

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--ghost-url':
        ghostUrl = args[++i];
        break;
      case '--bucket':
        bucketName = args[++i];
        break;
      case '--image-base-url':
        imageBaseUrl = args[++i];
        break;
      case '--manifest':
        manifestPath = resolve(args[++i]);
        break;
      case '--widths':
        widths = args[++i].split(',').map(Number);
        break;
      case '--quality':
        quality = parseInt(args[++i], 10);
        break;
      case '--dry-run':
        dryRun = true;
        break;
    }
  }

  if (!ghostUrl) {
    console.error('Error: --ghost-url is required (or set GHOST_URL env var)');
    process.exit(1);
  }

  if (!imageBaseUrl) {
    console.error('Error: --image-base-url is required');
    process.exit(1);
  }

  const exportData: GhostExport = JSON.parse(readFileSync(exportPath, 'utf-8'));
  const data = exportData.db[0].data;

  // Collect all unique image URLs
  const imageUrls = new Set<string>();
  for (const post of data.posts) {
    if (post.feature_image) imageUrls.add(post.feature_image);
    if (post.html) {
      for (const url of extractImageUrls(post.html)) {
        imageUrls.add(url);
      }
    }
  }

  console.log(`Found ${imageUrls.size} unique images`);

  // Create temp download directory
  const tmpDir = resolve('.tmp-images');
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

  const manifest: Record<string, string> = {};

  // Dynamically import sharp and S3 (optional deps)
  let sharp: typeof import('sharp') | null = null;
  let S3Client: any = null;
  let PutObjectCommand: any = null;

  if (!dryRun) {
    try {
      sharp = (await import('sharp')).default as any;
    } catch {
      console.warn('Warning: sharp not installed, skipping image resizing');
    }

    try {
      const s3Module = await import('@aws-sdk/client-s3');
      S3Client = s3Module.S3Client;
      PutObjectCommand = s3Module.PutObjectCommand;
    } catch {
      console.warn('Warning: @aws-sdk/client-s3 not installed, skipping uploads');
    }
  }

  const s3 = !dryRun && S3Client && process.env.R2_ACCOUNT_ID
    ? new S3Client({
        region: 'auto',
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID!,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        },
      })
    : null;

  let processed = 0;
  for (const originalUrl of imageUrls) {
    try {
      let fullUrl = originalUrl;
      if (originalUrl.startsWith('/')) {
        fullUrl = `${ghostUrl}${originalUrl}`;
      }
      if (originalUrl.includes('__GHOST_URL__')) {
        fullUrl = originalUrl.replace('__GHOST_URL__', ghostUrl);
      }

      const urlObj = new URL(fullUrl);
      const pathParts = urlObj.pathname.split('/');
      const filename = basename(urlObj.pathname, extname(urlObj.pathname));

      // Extract year/month from Ghost URL path (/content/images/YYYY/MM/...)
      let prefix = '';
      const yearIdx = pathParts.findIndex(p => /^\d{4}$/.test(p));
      if (yearIdx >= 0 && pathParts[yearIdx + 1]) {
        prefix = `${pathParts[yearIdx]}/${pathParts[yearIdx + 1]}`;
      } else {
        prefix = 'misc';
      }

      console.log(`[${++processed}/${imageUrls.size}] Downloading: ${fullUrl}`);
      const response = await fetch(fullUrl);
      if (!response.ok) {
        console.warn(`  Failed to download: ${response.status}`);
        continue;
      }
      const buffer = Buffer.from(await response.arrayBuffer());

      if (sharp && s3 && !dryRun) {
        for (const width of widths) {
          const key = `${prefix}/${filename}-${width}w.webp`;
          const webpBuffer = await (sharp as any)(buffer)
            .resize(width, null, { withoutEnlargement: true })
            .webp({ quality })
            .toBuffer();

          await s3.send(new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: webpBuffer,
            ContentType: 'image/webp',
            CacheControl: 'public, max-age=31536000, immutable',
          }));

          console.log(`  Uploaded: ${key} (${webpBuffer.length} bytes)`);
        }
      }

      const r2BasePath = `${prefix}/${filename}`;
      manifest[originalUrl] = `${imageBaseUrl}/${r2BasePath}-960w.webp`;
      console.log(`  Mapped: ${originalUrl} → ${imageBaseUrl}/${r2BasePath}-{w}w.webp`);

    } catch (err) {
      console.error(`  Error processing ${originalUrl}:`, err);
    }
  }

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nManifest written to: ${manifestPath}`);
  console.log(`Total images processed: ${processed}`);
}

main();

export interface GhostExport {
  db: Array<{
    data: {
      posts: GhostPost[];
      tags: GhostTag[];
      posts_tags: GhostPostTag[];
    };
  }>;
}

export interface GhostPost {
  id: string;
  slug: string;
  title: string;
  html: string;
  status: string;
  type: 'post' | 'page';
  published_at: string | null;
  updated_at: string | null;
  created_at: string | null;
  featured: number;
  feature_image: string | null;
  feature_image_alt: string | null;
  feature_image_caption: string | null;
  custom_excerpt: string | null;
  meta_description: string | null;
  meta_title: string | null;
  og_image: string | null;
  og_title: string | null;
  og_description: string | null;
  twitter_image: string | null;
  twitter_title: string | null;
  twitter_description: string | null;
  canonical_url: string | null;
}

export interface GhostTag {
  id: string;
  slug: string;
  name: string;
  description: string | null;
}

export interface GhostPostTag {
  post_id: string;
  tag_id: string;
  sort_order: number;
}

export interface MigrateOptions {
  /** Path to the Ghost JSON export file */
  exportPath: string;

  /** Output directory for Astro content (e.g. ./src/content) */
  outDir: string;

  /**
   * How to categorize posts into subdirectories.
   * Maps a tag slug to a directory name. Posts matching multiple tags
   * use the first match. Posts matching none go to `defaultCollection`.
   *
   * Example: { blog: 'blog', portfolio: 'portfolio' }
   */
  collections: Record<string, string>;

  /** Directory name for posts that don't match any collection tag (default: 'posts') */
  defaultCollection?: string;

  /** Directory name for Ghost pages (default: 'pages') */
  pagesCollection?: string;

  /** Only include published posts (default: true) */
  publishedOnly?: boolean;

  /** Path to image-manifest.json for URL rewriting (optional) */
  imageManifestPath?: string;

  /** Ghost site URL, used to resolve relative image URLs (optional) */
  ghostUrl?: string;
}

export interface UploadOptions {
  /** Path to the Ghost JSON export file */
  exportPath: string;

  /** Ghost site URL for downloading images */
  ghostUrl: string;

  /** R2/S3 bucket name */
  bucketName: string;

  /** Public base URL for the image CDN (e.g. https://images.example.com) */
  imageBaseUrl: string;

  /** Cloudflare account ID */
  r2AccountId: string;

  /** R2 API access key */
  r2AccessKeyId: string;

  /** R2 API secret key */
  r2SecretAccessKey: string;

  /** Responsive image widths to generate (default: [400, 750, 960, 1140, 1920]) */
  widths?: number[];

  /** WebP quality 1-100 (default: 80) */
  quality?: number;

  /** Output path for the image manifest JSON */
  manifestPath?: string;
}

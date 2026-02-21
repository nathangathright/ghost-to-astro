import TurndownService from 'turndown';

export function createTurndownService(): TurndownService {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });

  // Ghost bookmark cards → markdown links
  turndown.addRule('ghostBookmark', {
    filter: (node) => {
      return node.nodeName === 'FIGURE' &&
        (node.getAttribute('class') || '').includes('kg-bookmark-card');
    },
    replacement: (_content, node) => {
      const el = node as HTMLElement;
      const anchor = el.querySelector('a.kg-bookmark-container');
      const title = el.querySelector('.kg-bookmark-title');
      if (anchor && title) {
        return `[${title.textContent}](${anchor.getAttribute('href')})\n\n`;
      }
      return '';
    },
  });

  // Ghost gallery cards → individual images
  turndown.addRule('ghostGallery', {
    filter: (node) => {
      return node.nodeName === 'FIGURE' &&
        (node.getAttribute('class') || '').includes('kg-gallery-card');
    },
    replacement: (_content, node) => {
      const el = node as HTMLElement;
      const images = el.querySelectorAll('img');
      return Array.from(images).map(img => {
        const src = img.getAttribute('src') || '';
        const alt = img.getAttribute('alt') || '';
        return `![${alt}](${src})`;
      }).join('\n\n') + '\n\n';
    },
  });

  // Ghost embed cards (iframes, videos, etc.)
  turndown.addRule('ghostEmbed', {
    filter: (node) => {
      return node.nodeName === 'FIGURE' &&
        (node.getAttribute('class') || '').includes('kg-embed-card');
    },
    replacement: (_content, node) => {
      const el = node as HTMLElement;
      const iframe = el.querySelector('iframe');
      if (iframe) {
        const src = iframe.getAttribute('src') || '';
        return `<iframe src="${src}" width="100%" height="400" frameborder="0" allowfullscreen></iframe>\n\n`;
      }
      const figcaption = el.querySelector('figcaption');
      const caption = figcaption ? figcaption.textContent : '';
      const anchor = el.querySelector('a');
      if (anchor) {
        return `[${caption || anchor.textContent}](${anchor.getAttribute('href')})\n\n`;
      }
      return _content + '\n\n';
    },
  });

  // figure with image and optional caption
  turndown.addRule('figureImage', {
    filter: (node) => {
      return node.nodeName === 'FIGURE' &&
        !!(node as HTMLElement).querySelector('img') &&
        !(node.getAttribute('class') || '').includes('kg-bookmark-card') &&
        !(node.getAttribute('class') || '').includes('kg-gallery-card') &&
        !(node.getAttribute('class') || '').includes('kg-embed-card');
    },
    replacement: (_content, node) => {
      const el = node as HTMLElement;
      const img = el.querySelector('img');
      const figcaption = el.querySelector('figcaption');
      if (!img) return '';
      const src = img.getAttribute('src') || '';
      const alt = img.getAttribute('alt') || '';
      let md = `![${alt}](${src})`;
      if (figcaption && figcaption.textContent?.trim()) {
        md += `\n*${figcaption.textContent.trim()}*`;
      }
      return md + '\n\n';
    },
  });

  return turndown;
}

export function htmlToMarkdown(html: string, turndown: TurndownService): string {
  if (!html) return '';
  let md = turndown.turndown(html);
  md = md.replace(/\n{3,}/g, '\n\n');
  return md.trim();
}

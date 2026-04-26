import { useEffect } from 'react';

const siteName = 'Đậu Đỏ Truyện';
const defaultTitle = 'Đậu Đỏ Truyện - Đọc truyện online';
const defaultDescription = 'Nền tảng đọc truyện online với truyện hot, bảng xếp hạng, tủ truyện, ví xu, khu tác giả và quản trị nội dung.';
const defaultImage = '/images/hero.jpg';

function getAbsoluteUrl(path = '/') {
  if (typeof window === 'undefined') return path;
  try {
    return new URL(path, window.location.origin).toString();
  } catch {
    return window.location.href;
  }
}

function setMeta(selector, attributes) {
  if (typeof document === 'undefined') return;
  let node = document.head.querySelector(selector);
  if (!node) {
    node = document.createElement('meta');
    const nameMatch = selector.match(/\[name="([^"]+)"\]/);
    const propertyMatch = selector.match(/\[property="([^"]+)"\]/);
    if (nameMatch) node.setAttribute('name', nameMatch[1]);
    if (propertyMatch) node.setAttribute('property', propertyMatch[1]);
    document.head.appendChild(node);
  }
  Object.entries(attributes).forEach(([key, value]) => {
    if (value !== undefined && value !== null) node.setAttribute(key, String(value));
  });
}

function upsertLink(rel, href) {
  if (typeof document === 'undefined') return;
  let node = document.head.querySelector(`link[rel="${rel}"]`);
  if (!node) {
    node = document.createElement('link');
    node.setAttribute('rel', rel);
    document.head.appendChild(node);
  }
  node.setAttribute('href', href);
}

function upsertJsonLd(id, data) {
  if (typeof document === 'undefined') return;
  let node = document.getElementById(id);
  if (!data) {
    node?.remove();
    return;
  }
  if (!node) {
    node = document.createElement('script');
    node.id = id;
    node.type = 'application/ld+json';
    document.head.appendChild(node);
  }
  node.textContent = JSON.stringify(data);
}

export function PageSeo({
  title = defaultTitle,
  description = defaultDescription,
  image = defaultImage,
  type = 'website',
  canonical,
  schema
}) {
  useEffect(() => {
    const fullTitle = title.includes(siteName) ? title : `${title} | ${siteName}`;
    const cleanDescription = String(description || defaultDescription).slice(0, 180);
    const canonicalUrl = getAbsoluteUrl(canonical || `${window.location.pathname}${window.location.search}`);
    const imageUrl = getAbsoluteUrl(image || defaultImage);

    document.title = fullTitle;
    setMeta('meta[name="description"]', { content: cleanDescription });
    setMeta('meta[name="robots"]', { content: 'index,follow' });
    setMeta('meta[property="og:site_name"]', { content: siteName });
    setMeta('meta[property="og:title"]', { content: fullTitle });
    setMeta('meta[property="og:description"]', { content: cleanDescription });
    setMeta('meta[property="og:type"]', { content: type });
    setMeta('meta[property="og:url"]', { content: canonicalUrl });
    setMeta('meta[property="og:image"]', { content: imageUrl });
    setMeta('meta[name="twitter:card"]', { content: 'summary_large_image' });
    setMeta('meta[name="twitter:title"]', { content: fullTitle });
    setMeta('meta[name="twitter:description"]', { content: cleanDescription });
    setMeta('meta[name="twitter:image"]', { content: imageUrl });
    upsertLink('canonical', canonicalUrl);
    upsertJsonLd('daudo-page-schema', schema);
  }, [title, description, image, type, canonical, schema]);

  return null;
}

export function buildBreadcrumbSchema(items = []) {
  if (!items.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: getAbsoluteUrl(item.item || item.to || '/')
    }))
  };
}

export function buildStorySchema(story = {}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: story.title,
    author: story.author ? { '@type': 'Person', name: story.author } : undefined,
    image: getAbsoluteUrl(story.cover || defaultImage),
    description: story.description || defaultDescription,
    genre: story.categories || [],
    aggregateRating: story.rating
      ? {
          '@type': 'AggregateRating',
          ratingValue: story.rating,
          ratingCount: story.ratingCount || story.follows || 1
        }
      : undefined
  };
}

export const seoDefaults = {
  siteName,
  defaultTitle,
  defaultDescription,
  defaultImage
};

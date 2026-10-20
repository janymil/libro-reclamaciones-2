import { useEffect } from 'react';

export interface SeoProps {
  title: string;
  description: string;
  canonical?: string;
  type?: 'website' | 'article';
  publishedTime?: string;
  author?: string;
  keywords?: string[];
  ogImage?: string;
  jsonLd?: Record<string, any>;
}

const DEFAULT_IMAGE = 'https://librodigital.pe/icon.svg';
const SITE_NAME = 'LibroDigital.pe';

export function SeoHead({
  title,
  description,
  canonical,
  type = 'website',
  publishedTime,
  author = 'LibroDigital.pe',
  keywords = [],
  ogImage = DEFAULT_IMAGE,
  jsonLd,
}: SeoProps) {
  useEffect(() => {
    // 1. Title
    const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
    document.title = fullTitle;

    // Helper for meta tags
    const setMeta = (attrName: string, attrVal: string, content: string) => {
      let el = document.querySelector(`meta[${attrName}="${attrVal}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attrName, attrVal);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    // 2. Standard Meta Tags
    setMeta('name', 'description', description);
    if (keywords.length > 0) {
      setMeta('name', 'keywords', keywords.join(', '));
    }
    setMeta('name', 'robots', 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1');

    // 3. Open Graph
    setMeta('property', 'og:site_name', SITE_NAME);
    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:type', type);
    setMeta('property', 'og:url', canonical || window.location.href);
    setMeta('property', 'og:image', ogImage);
    setMeta('property', 'og:locale', 'es_PE');

    if (type === 'article' && publishedTime) {
      setMeta('property', 'article:published_time', publishedTime);
      setMeta('property', 'article:author', author);
      setMeta('property', 'article:section', 'Normativa y Gestión MYPE');
    }

    // 4. Twitter Card
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', fullTitle);
    setMeta('name', 'twitter:description', description);
    setMeta('name', 'twitter:image', ogImage);

    // 5. Canonical Link
    const targetCanonical = canonical || window.location.href.split('?')[0];
    let linkCanonical = document.querySelector('link[rel="canonical"]');
    if (!linkCanonical) {
      linkCanonical = document.createElement('link');
      linkCanonical.setAttribute('rel', 'canonical');
      document.head.appendChild(linkCanonical);
    }
    linkCanonical.setAttribute('href', targetCanonical);

    // 6. JSON-LD Structured Data
    let scriptJsonLd = document.querySelector('script[data-seo="json-ld"]');
    if (jsonLd) {
      if (!scriptJsonLd) {
        scriptJsonLd = document.createElement('script');
        scriptJsonLd.setAttribute('type', 'application/ld+json');
        scriptJsonLd.setAttribute('data-seo', 'json-ld');
        document.head.appendChild(scriptJsonLd);
      }
      scriptJsonLd.textContent = JSON.stringify(jsonLd);
    } else if (scriptJsonLd) {
      scriptJsonLd.remove();
    }
  }, [title, description, canonical, type, publishedTime, author, keywords, ogImage, jsonLd]);

  return null;
}

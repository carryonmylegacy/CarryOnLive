import React, { useEffect } from 'react';

const ORIGIN = 'https://www.carryon.us';
const STATIC_IMAGE_TAGS = 'meta[property="og:image"]:not([data-seo]), meta[name="twitter:image"]:not([data-seo]), meta[property="og:image:alt"]:not([data-seo])';

/* Page-specific share image: point the static og:image / twitter:image tags in index.html at it (no duplicate tags), restore on unmount. */
const useShareImage = (image, alt) => {
  useEffect(() => {
    if (!image) return undefined;
    const tags = Array.from(document.querySelectorAll(STATIC_IMAGE_TAGS));
    const previous = tags.map(tag => tag.getAttribute('content'));
    tags.forEach(tag => tag.setAttribute('content', tag.getAttribute('property') === 'og:image:alt' ? (alt || '') : image));
    return () => tags.forEach((tag, i) => tag.setAttribute('content', previous[i]));
  }, [image, alt]);
};

/**
 * Per-route head tags via React 19 native metadata hoisting (react-helmet-async
 * is incompatible with React 19). React hoists <title>/<meta>/<link> rendered
 * anywhere in the tree into <head> and removes them on unmount.
 *
 * Renders title, description, a self-referencing canonical (always on
 * www.carryon.us — so app.carryon.us pages canonicalize to their www
 * counterpart), matching og:/twitter: tags, and optional noindex. Global
 * static tags (og:image, og:site_name, twitter:card, icons) stay in
 * public/index.html.
 */
export const SEO = ({ title, description, path = '/', noindex = false, image, imageAlt, type = 'website' }) => {
  const url = `${ORIGIN}${path}`;
  useShareImage(image, imageAlt || title);
  // data-seo marks these tags so index.js can drop the copies baked into the
  // prerendered static HTML before React mounts (otherwise every public page
  // carries two <title>/<canonical>/og: sets after hydration).
  // createElement (not JSX) so the dev-only visual-edits babel plugin cannot
  // wrap {title} in a <span> — React 19 drops non-string <title> children.
  return (
    <>
      {React.createElement('title', { 'data-seo': '' }, title)}
      <meta name="description" content={description} data-seo="" />
      <link rel="canonical" href={url} data-seo="" />
      {noindex && <meta name="robots" content="noindex" data-seo="" />}
      <meta property="og:type" content={type} data-seo="" />
      <meta property="og:title" content={title} data-seo="" />
      <meta property="og:description" content={description} data-seo="" />
      <meta property="og:url" content={url} data-seo="" />
      <meta name="twitter:title" content={title} data-seo="" />
      <meta name="twitter:description" content={description} data-seo="" />
    </>
  );
};

/** Robots-only helper for authenticated routes. */
export const NoIndex = () => <meta name="robots" content="noindex" />;

export default SEO;

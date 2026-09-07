import React from 'react';

const ORIGIN = 'https://www.carryon.us';

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
export const SEO = ({ title, description, path = '/', noindex = false }) => {
  const url = `${ORIGIN}${path}`;
  // data-seo marks these tags so index.js can drop the copies baked into the
  // prerendered static HTML before React mounts (otherwise every public page
  // carries two <title>/<canonical>/og: sets after hydration).
  return (
    <>
      <title data-seo="">{title}</title>
      <meta name="description" content={description} data-seo="" />
      <link rel="canonical" href={url} data-seo="" />
      {noindex && <meta name="robots" content="noindex" data-seo="" />}
      <meta property="og:type" content="website" data-seo="" />
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

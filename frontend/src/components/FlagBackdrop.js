/* Shared responsive flag background — WebP with JPEG fallback, lazy-loaded. */
export const FlagBackdrop = ({ style }) => (
  <picture className="block w-full h-full">
    <source type="image/webp" srcSet="/flag-bg-800.webp 800w, /flag-bg-1280.webp 1280w" sizes="100vw" />
    <img src="/flag-bg.jpg" alt="" className="w-full h-full object-cover" style={style} loading="lazy" decoding="async" />
  </picture>
);

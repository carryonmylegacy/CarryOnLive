import React from 'react';

// Small superscript citation next to a precise figure — lands on the matching entry of /sources.
export const SourceRef = ({ id, n, testIdSuffix = '' }) => (
  <sup className="ml-0.5 text-[0.7em] leading-none">
    <a href={`/sources#${id}`} className="text-[#d4af37] hover:text-[#fcd34d] no-underline font-semibold" aria-label={`Source ${n}`} title="Source" data-testid={`source-ref-${id}${testIdSuffix}`}>[{n}]</a>
  </sup>
);

export default SourceRef;

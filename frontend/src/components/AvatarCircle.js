import React from 'react';
import { Camera } from 'lucide-react';
import { resolvePhotoUrl } from '../utils/photoUrl';
import OfflineImage from './OfflineImage';

/**
 * Avatar circle with photo or initials-over-camera-icon.
 *
 * - Has photo → shows photo, tap navigates (onNavigate)
 * - No photo → shows initials over subtle camera icon, tap opens upload (onUpload)
 * - If neither onNavigate nor onUpload is provided, circle is non-interactive
 *
 * `cacheKey` (optional but strongly recommended): a stable identifier
 * such as `beneficiary:<id>:photo` or `estate:<id>:cover`. When set,
 * the photo bytes are persisted in IndexedDB on first load and
 * survive S3 presigned-URL rotation when the user goes offline.
 */
export function AvatarCircle({
  photo,
  initials,
  color = '#60A5FA',
  size = 56,
  onNavigate,
  onUpload,
  testId,
  className = '',
  badge,
  isPrimary,
  cacheKey,
}) {
  const hasPhoto = !!photo;
  const handleClick = () => {
    if (hasPhoto && onNavigate) {
      onNavigate();
    } else if (!hasPhoto && onUpload) {
      onUpload();
    }
  };
  const isClickable = (hasPhoto && onNavigate) || (!hasPhoto && onUpload);

  // Initials fallback used both when there's no photo AND when the
  // photo is offline-unavailable (no cached blob, expired URL, etc.).
  const initialsBlock = (
    <>
      {onUpload && (
        <Camera
          className="absolute"
          style={{
            width: size * 0.45,
            height: size * 0.45,
            color: color,
            opacity: 0.15,
          }}
        />
      )}
      <span className="relative z-10" style={{ fontSize: size * 0.32, fontWeight: 700 }}>
        {initials}
      </span>
    </>
  );

  return (
    <div className={`relative ${className}`} data-testid={testId}>
      <div
        onClick={isClickable ? handleClick : undefined}
        role={isClickable ? 'button' : undefined}
        tabIndex={isClickable ? 0 : undefined}
        onKeyDown={isClickable ? (e) => { if (e.key === 'Enter') handleClick(); } : undefined}
        className="rounded-full flex items-center justify-center font-bold overflow-hidden transition-transform hover:scale-105"
        style={{
          width: size,
          height: size,
          backgroundColor: hasPhoto ? 'transparent' : (color + '25'),
          color: color,
          fontSize: size * 0.32,
          cursor: isClickable ? 'pointer' : 'default',
          border: isPrimary ? `2.5px solid var(--gold)` : `2px solid ${color}40`,
          position: 'relative',
        }}
      >
        {hasPhoto ? (
          <OfflineImage
            src={resolvePhotoUrl(photo)}
            cacheKey={cacheKey}
            alt=""
            className="w-full h-full object-cover"
            fallback={initialsBlock}
          />
        ) : initialsBlock}
      </div>
      {badge && !isPrimary && (
        <div
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-black"
          style={{ background: 'var(--gold)', color: '#080e1a' }}
        >
          {badge}
        </div>
      )}
    </div>
  );
}

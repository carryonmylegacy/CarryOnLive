import React from 'react';
import { Camera } from 'lucide-react';
import { resolvePhotoUrl } from '../utils/photoUrl';

/**
 * Avatar circle with photo or initials-over-camera-icon.
 *
 * - Has photo → shows photo, tap navigates (onNavigate)
 * - No photo → shows initials over subtle camera icon, tap opens upload (onUpload)
 * - If neither onNavigate nor onUpload is provided, circle is non-interactive
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
          <img
            src={resolvePhotoUrl(photo)}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <>
            {/* Camera icon as background */}
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
            {/* Initials on top */}
            <span className="relative z-10" style={{ fontSize: size * 0.32, fontWeight: 700 }}>
              {initials}
            </span>
          </>
        )}
      </div>
      {badge && !isPrimary && (
        <div
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black"
          style={{ background: 'var(--gold)', color: '#080e1a' }}
        >
          {badge}
        </div>
      )}
    </div>
  );
}

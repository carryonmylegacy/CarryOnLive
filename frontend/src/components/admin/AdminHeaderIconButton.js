import React from 'react';

/**
 * Shared square pill button for the admin/founder portal header toolbar.
 *
 * Every icon-only button in the Admin header (Search, Bell, Recycle,
 * Dev-switch, etc.) must use this component so the three-button trio
 * stays visually aligned at `w-10 h-10` with `w-5 h-5` glyphs.
 *
 * Do NOT add inline text labels — keep the header clean by relying on
 * the `title` tooltip for desktop hover and the icon's semantic clarity
 * on mobile. If an action truly needs a label, surface it via a
 * contextual dialog or the sidebar, not the header.
 *
 * Props:
 *   - `children`: the lucide icon node. Size is controlled by this
 *     component (`w-5 h-5`), so pass `<Search />` (no size className).
 *   - `badge`: optional React node rendered top-right corner (e.g. unread
 *     count). QueueAlertsPanel uses this for its red `9+` badge.
 *   - `indicator`: optional React node rendered bottom-right (a tiny dot
 *     for connection status or similar). Use sparingly — each dot is
 *     extra cognitive load on the user.
 *   - all other props forwarded to the underlying <button> (onClick,
 *     disabled, title, data-testid, etc.).
 */
const AdminHeaderIconButton = React.forwardRef(function AdminHeaderIconButton(
  { children, badge, indicator, className = '', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      {...rest}
      className={`relative flex items-center justify-center w-10 h-10 rounded-lg transition-colors text-[var(--t4)] hover:text-[var(--t3)] flex-shrink-0 ${className}`}
      style={{ background: 'var(--s)', border: '1px solid var(--b)', ...(rest.style || {}) }}
    >
      {/* Force all passed icons to the canonical size. */}
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child, {
              className: `${child.props.className || ''} w-5 h-5`.trim(),
            })
          : child,
      )}
      {badge}
      {indicator}
    </button>
  );
});

export default AdminHeaderIconButton;

import React from 'react';

/**
 * Shared sidebar pill button — the base for Light/Dark toggle, Collapse
 * toggle, Portal switch, Sign Out, NotificationBell, and every other
 * bottom-pinned action in the sidebar.
 *
 * Locks in:
 *   - `.sb-pill w-full` base class (CSS styling lives in index.css)
 *   - auto `justify-center` when the sidebar is collapsed
 *   - canonical icon size (`w-[18px] h-[18px]`) via React.cloneElement
 *   - conditional label (hidden when collapsed)
 *   - title = label when collapsed (so the icon-only state gets hover text)
 *
 * Usage:
 *   <SidebarPillButton
 *     collapsed={collapsed}
 *     icon={<Sun />}
 *     label="Light Mode"
 *     onClick={toggleTheme}
 *     data-testid="theme-toggle"
 *   />
 *
 * For danger-style buttons (Sign Out), pass `variant="danger"`.
 * For NotificationBell-style buttons with an absolute-positioned badge,
 * pass the badge via `children` — it renders AFTER the label and is not
 * subject to the collapsed/label visibility rule.
 */
const SidebarPillButton = React.forwardRef(function SidebarPillButton(
  {
    collapsed = false,
    icon,
    label,
    variant,
    className = '',
    children,
    ...rest
  },
  ref,
) {
  const sizedIcon = React.isValidElement(icon)
    ? React.cloneElement(icon, {
        className: `${icon.props.className || ''} w-[18px] h-[18px]`.trim(),
      })
    : icon;

  // Mirror the pattern used across the sidebar BEFORE this component
  // existed: `title` only helpful in collapsed mode (label is visible
  // otherwise). Caller can override by passing `title` explicitly.
  const title = rest.title ?? (collapsed ? label : undefined);

  return (
    <button
      ref={ref}
      {...rest}
      title={title}
      className={[
        'sb-pill w-full',
        variant === 'danger' ? 'danger' : '',
        variant === 'gold' ? 'gold' : '',
        variant === 'gold-armed' ? 'gold armed' : '',
        collapsed ? 'justify-center' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {sizedIcon}
      {!collapsed && label && <span>{label}</span>}
      {children}
    </button>
  );
});

export default SidebarPillButton;

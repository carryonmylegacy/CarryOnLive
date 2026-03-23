/**
 * Platform-wide iOS Safe Area utility.
 * Measures env(safe-area-inset-top) at runtime and caches the result.
 * Used by all Radix UI popper components (Select, DropdownMenu, Popover)
 * to prevent content from rendering behind the iOS status bar / Dynamic Island.
 */
let _safeAreaTop = null;

export function getSafeAreaTop() {
  if (_safeAreaTop !== null) return _safeAreaTop;
  if (typeof document === 'undefined') return 0;
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none';
  document.body.appendChild(el);
  _safeAreaTop = Math.ceil(el.getBoundingClientRect().height);
  el.remove();
  return _safeAreaTop;
}

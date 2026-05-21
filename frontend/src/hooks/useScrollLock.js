import { useEffect, useRef } from 'react';

/**
 * Preserves scroll position during tab transitions in admin/ops dashboards
 * so tapping between Founder Portal tabs doesn't slam the view back to the
 * top of the page. Tracks the user's most recent scroll offset continuously
 * and re-applies it for a few hundred ms after the active tab changes — long
 * enough to defeat any stray `scrollTop = 0` writes that React Router or
 * lazy-loaded child tabs fire during the swap.
 *
 * Works against the OverlayScrollbars viewport that wraps the main content
 * (.main-content [data-overlayscrollbars-viewport]) — which is the actual
 * scroll container on this layout. Falls back to .main-content itself, then
 * to window/document, so it stays correct if the layout ever swaps the
 * scrollbar wrapper.
 *
 * Restored / hardened May 5, 2026 — user reported the scroll-on-tab-tap
 * regression and stated this behavior was working previously.
 */
const findScroller = () => {
  // Pick the element that actually scrolls. With OverlayScrollbars the
  // inner viewport is the scroller on mobile / when content overflows
  // it; on desktop the layout often lets the document itself scroll
  // instead, leaving the viewport flat (scrollHeight == clientHeight).
  // So we prefer scrollers that are CURRENTLY OVERFLOWING; otherwise
  // fall back to the document element.
  const viewport = document.querySelector('.main-content [data-overlayscrollbars-viewport]');
  if (viewport && viewport.scrollHeight > viewport.clientHeight + 1) return viewport;
  const main = document.querySelector('.main-content');
  if (main && main.scrollHeight > main.clientHeight + 1) return main;
  return document.scrollingElement || document.documentElement;
};

export const useScrollLock = (activeTab) => {
  const scrollLockRef = useRef({ pos: 0, locked: false });

  // Continuously track the user's most recent scroll position when the
  // lock is OFF. We listen on whichever scroller is current — usually the
  // OverlayScrollbars viewport. Also listen on `window` so desktop layouts
  // that scroll the document (rather than the inner viewport) still get
  // their position captured.
  useEffect(() => {
    const onScroll = () => {
      if (scrollLockRef.current.locked) return;
      const sc = findScroller();
      const top = (sc === document.scrollingElement || sc === document.documentElement)
        ? (window.scrollY || document.documentElement.scrollTop || 0)
        : (sc?.scrollTop || 0);
      scrollLockRef.current.pos = top;
    };
    // The viewport may be created lazily by OverlayScrollbars after first
    // paint; re-attach listeners shortly after mount in case it wasn't in
    // the DOM yet on the synchronous first run.
    let scroller = findScroller();
    scroller?.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    const reattachId = setTimeout(() => {
      const next = findScroller();
      if (next !== scroller) {
        scroller?.removeEventListener('scroll', onScroll);
        scroller = next;
        scroller?.addEventListener('scroll', onScroll, { passive: true });
      }
    }, 250);
    return () => {
      clearTimeout(reattachId);
      scroller?.removeEventListener('scroll', onScroll);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  // When the active tab changes, freeze the scroll position at whatever
  // the user last scrolled to. We reapply the offset across several rAFs
  // and short timeouts because:
  //   • React commits the new tab content async,
  //   • lazy-loaded children fire their own scroll resets on mount,
  //   • iOS PWAs occasionally fire a delayed scrollTo(0) on layout flush.
  // 250ms of belt-and-suspenders writes catches all three and is short
  // enough to be invisible to the user.
  //
  // NOTE: For pages where each tab navigates to a NEW pathname (e.g.
  // AdminPage uses /admin/users → /admin/transition), do NOT call this
  // hook — <ScrollRestorationProvider /> handles per-pathname memory
  // and this hook would race against it. Use this only for in-page
  // tab swaps that keep the same URL (e.g. FinancialPortal's
  // Bills/Debts/Accounts tabs).
  const prevTab = useRef(activeTab);
  useEffect(() => {
    if (prevTab.current === activeTab) return;
    prevTab.current = activeTab;

    const target = scrollLockRef.current.pos;
    scrollLockRef.current.locked = true;

    const html = document.documentElement;
    const prevHtmlBehavior = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';

    const forceScroll = () => {
      const sc = findScroller();
      if (!sc) return;
      if (sc === document.scrollingElement || sc === document.documentElement) {
        window.scrollTo(0, target);
      } else {
        sc.scrollTop = target;
      }
    };

    forceScroll();
    const r1 = requestAnimationFrame(forceScroll);
    const r2 = requestAnimationFrame(() => requestAnimationFrame(forceScroll));
    const t1 = setTimeout(forceScroll, 0);
    const t2 = setTimeout(forceScroll, 30);
    const t3 = setTimeout(forceScroll, 60);
    const t4 = setTimeout(forceScroll, 100);
    const t5 = setTimeout(forceScroll, 160);
    const release = setTimeout(() => {
      scrollLockRef.current.locked = false;
      html.style.scrollBehavior = prevHtmlBehavior;
    }, 250);

    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      clearTimeout(t4); clearTimeout(t5); clearTimeout(release);
      scrollLockRef.current.locked = false;
      html.style.scrollBehavior = prevHtmlBehavior;
    };
  }, [activeTab]);
};

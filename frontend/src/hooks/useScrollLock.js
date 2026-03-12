import { useEffect, useRef } from 'react';

/**
 * Prevents scroll position reset during tab transitions in admin/ops dashboards.
 * Tracks scroll position continuously and locks it during tab changes.
 */
export const useScrollLock = (activeTab) => {
  const scrollLockRef = useRef({ pos: 0, locked: false });

  // Continuously track scroll position when not locked
  useEffect(() => {
    const mainEl = document.querySelector('.main-content');
    if (!mainEl) return;
    const onScroll = () => {
      if (!scrollLockRef.current.locked) {
        scrollLockRef.current.pos = mainEl.scrollTop;
      }
    };
    mainEl.addEventListener('scroll', onScroll, { passive: true });
    return () => mainEl.removeEventListener('scroll', onScroll);
  }, []);

  // Lock scroll during tab transition
  const prevTab = useRef(activeTab);
  useEffect(() => {
    if (prevTab.current === activeTab) return;
    prevTab.current = activeTab;

    const mainEl = document.querySelector('.main-content');
    if (!mainEl) return;

    const target = scrollLockRef.current.pos;
    scrollLockRef.current.locked = true;

    const html = document.documentElement;
    html.style.scrollBehavior = 'auto';
    mainEl.style.scrollBehavior = 'auto';

    const forceScroll = () => { mainEl.scrollTop = target; };
    mainEl.addEventListener('scroll', forceScroll);
    forceScroll();
    requestAnimationFrame(forceScroll);
    requestAnimationFrame(() => requestAnimationFrame(forceScroll));
    const t1 = setTimeout(forceScroll, 0);
    const t2 = setTimeout(forceScroll, 30);
    const t3 = setTimeout(forceScroll, 60);
    const t4 = setTimeout(forceScroll, 100);
    const t5 = setTimeout(() => {
      mainEl.removeEventListener('scroll', forceScroll);
      scrollLockRef.current.locked = false;
      html.style.scrollBehavior = '';
      mainEl.style.scrollBehavior = '';
    }, 250);

    return () => {
      mainEl.removeEventListener('scroll', forceScroll);
      scrollLockRef.current.locked = false;
      html.style.scrollBehavior = '';
      mainEl.style.scrollBehavior = '';
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5);
    };
  }, [activeTab]);
};

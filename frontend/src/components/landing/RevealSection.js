import { useRef, useState, useEffect } from 'react';

/* ─── scroll-reveal hook ─── */
export const useReveal = (threshold = 0.15) => {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, visible];
};

export const RevealSection = ({ children, className = '', delay = 0, direction = 'up', distance = 20, duration = 0.6, ...props }) => {
  const [ref, visible] = useReveal(0.12);
  const d = `${distance}px`;
  const transforms = { up: `translate3d(0,${d},0)`, down: `translate3d(0,-${d},0)`, left: `translate3d(${d},0,0)`, right: `translate3d(-${d},0,0)` };
  return (
    <div ref={ref} className={className} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translate3d(0,0,0)' : transforms[direction],
      transition: `opacity ${duration}s cubic-bezier(0.16,1,0.3,1) ${delay}s, transform ${duration}s cubic-bezier(0.16,1,0.3,1) ${delay}s`,
      backfaceVisibility: 'hidden',
      WebkitBackfaceVisibility: 'hidden',
    }} {...props}>
      {children}
    </div>
  );
};

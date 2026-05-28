/**
 * useListReorder — minimal pointer-based drag-to-reorder hook.
 *
 * Designed to coexist safely with page scrolling:
 *   - The drag ONLY starts when the user's pointer goes down on the grip
 *     handle element (you wire `bindGrip(index)` onto that element).
 *   - `touchAction: 'none'` is applied ONLY to the grip handle, not the row
 *     or the surrounding scroll container. Page scrolling elsewhere is
 *     untouched.
 *   - Uses Pointer Events (mouse + touch + pen unified). Works on iOS
 *     Safari 13+ and every modern desktop browser.
 *
 * Usage:
 *   const { bindGrip, draggingIdx } = useListReorder({
 *     items: orderedRoutes,
 *     onReorder: setOrderedRoutes,
 *     rowSelector: '[data-reorder-row]',
 *   });
 *
 *   <div data-reorder-row>
 *     <GripVertical {...bindGrip(idx)} />
 *     ...
 *   </div>
 */

import { useCallback, useRef, useState } from 'react';

export const useListReorder = ({ items, onReorder, rowSelector }) => {
  const [draggingIdx, setDraggingIdx] = useState(null);
  const dragRef = useRef(null);

  const onPointerDown = useCallback((e, fromIdx) => {
    // Only primary button / single touch — ignore multi-touch gestures.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* no-op */ }
    dragRef.current = { fromIdx, pointerId: e.pointerId, gripEl: e.currentTarget };
    setDraggingIdx(fromIdx);
  }, []);

  const onPointerMove = useCallback((e) => {
    const state = dragRef.current;
    if (!state) return;
    const y = e.clientY;
    const rows = document.querySelectorAll(rowSelector);
    let targetIdx = null;
    rows.forEach((row, i) => {
      const r = row.getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) targetIdx = i;
    });
    if (targetIdx == null || targetIdx === state.fromIdx) return;
    const next = [...items];
    const [moved] = next.splice(state.fromIdx, 1);
    next.splice(targetIdx, 0, moved);
    state.fromIdx = targetIdx;
    setDraggingIdx(targetIdx);
    onReorder(next);
  }, [items, onReorder, rowSelector]);

  const endDrag = useCallback((_e) => {
    const state = dragRef.current;
    if (!state) return;
    try {
      if (state.gripEl && state.gripEl.releasePointerCapture) {
        state.gripEl.releasePointerCapture(state.pointerId);
      }
    } catch { /* no-op */ }
    dragRef.current = null;
    setDraggingIdx(null);
  }, []);

  const bindGrip = useCallback((idx) => ({
    onPointerDown: (e) => onPointerDown(e, idx),
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    style: {
      touchAction: 'none',
      cursor: 'grab',
      userSelect: 'none',
      WebkitUserSelect: 'none',
      WebkitTouchCallout: 'none',
    },
  }), [onPointerDown, onPointerMove, endDrag]);

  return { bindGrip, draggingIdx };
};

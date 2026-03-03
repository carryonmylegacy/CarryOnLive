import { useEffect, useRef, useState } from 'react';

/**
 * Hook that filters documents in a Web Worker (off main thread).
 * Falls back to main-thread filtering if workers aren't supported.
 */
export const useWorkerFilter = (documents, searchQuery, activeCategory, sortBy) => {
  const [filtered, setFiltered] = useState(documents);
  const workerRef = useRef(null);

  useEffect(() => {
    try {
      workerRef.current = new Worker('/workers/filterWorker.js');
      workerRef.current.onmessage = (e) => {
        setFiltered(e.data.filtered);
      };
    } catch {
      workerRef.current = null;
    }
    return () => workerRef.current?.terminate();
  }, []);

  useEffect(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ documents, searchQuery, activeCategory, sortBy });
    } else {
      // Fallback: filter on main thread
      let result = documents;
      if (activeCategory && activeCategory !== 'all') {
        result = result.filter(d => d.category === activeCategory);
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        result = result.filter(d =>
          (d.name && d.name.toLowerCase().includes(q)) ||
          (d.description && d.description.toLowerCase().includes(q))
        );
      }
      setFiltered(result);
    }
  }, [documents, searchQuery, activeCategory, sortBy]);

  return filtered;
};

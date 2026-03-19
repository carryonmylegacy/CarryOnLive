/* eslint-disable no-restricted-globals */
// Web Worker for filtering/sorting documents off the main thread
self.onmessage = function(e) {
  const { documents, searchQuery, activeCategory, sortBy } = e.data;
  
  let filtered = documents;
  
  // Category filter
  if (activeCategory && activeCategory !== 'all') {
    filtered = filtered.filter(d => d.category === activeCategory);
  }
  
  // Search filter
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(d => 
      (d.name && d.name.toLowerCase().includes(q)) ||
      (d.description && d.description.toLowerCase().includes(q))
    );
  }
  
  // Sort
  if (sortBy === 'name') {
    filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  } else if (sortBy === 'date') {
    filtered.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  } else if (sortBy === 'size') {
    filtered.sort((a, b) => (b.file_size || 0) - (a.file_size || 0));
  }
  
  self.postMessage({ filtered });
};

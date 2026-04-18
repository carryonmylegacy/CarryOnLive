/**
 * useECTSearch — manages global message search state and debounce.
 * All logic moved verbatim from EstateChatPage.js.
 */
import { useState, useRef } from 'react';
import { API_URL } from '../../config';

export default function useECTSearch({ token, channels, openChannel }) {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const searchTimerRef = useRef(null);

  const handleSearch = (value) => {
    setSearchQuery(value);
    clearTimeout(searchTimerRef.current);
    if (!value.trim()) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/estate-chat/search?q=${encodeURIComponent(value.trim())}`, { headers });
        if (res.ok) setSearchResults(await res.json());
      } catch {} finally { setSearching(false); } // eslint-disable-line no-empty
    }, 400);
  };

  const jumpToMessage = (msg) => {
    const ch = channels.find(c => c.id === msg.channel_id);
    if (ch) {
      setShowSearch(false);
      setSearchQuery('');
      setSearchResults([]);
      openChannel(ch);
    }
  };

  return {
    searchQuery, setSearchQuery,
    searchResults, setSearchResults,
    searching,
    showSearch, setShowSearch,
    handleSearch,
    jumpToMessage,
  };
}

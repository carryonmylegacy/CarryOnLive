import React, { useState } from 'react';
import axios from 'axios';
import { Search, Users, Headphones, Shield, ShieldCheck, Loader2 } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { toast } from '../../utils/toast';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TYPE_CONFIG = {
  user: { icon: Users, color: '#3B82F6', label: 'User' },
  support: { icon: Headphones, color: '#F43F5E', label: 'Support' },
  dts: { icon: Shield, color: '#8B5CF6', label: 'DTS' },
  verification: { icon: ShieldCheck, color: '#F97316', label: 'Verification' },
};

export const QuickSearchTab = ({ getAuthHeaders }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (query.trim().length < 2) return toast.error('Enter at least 2 characters');
    setLoading(true);
    setSearched(true);
    try {
      const res = await axios.get(`${API_URL}/ops/search?q=${encodeURIComponent(query)}`, getAuthHeaders());
      setResults(res.data);
    } catch { toast.error('Search failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4" data-testid="quick-search-tab">
      <h2 className="text-lg font-bold text-[var(--t)]">Quick Search</h2>

      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--t5)]" />
          <input value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search by name, email, or ticket ID..."
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-[var(--bg2)] border border-[var(--b)] text-[var(--t)] text-sm"
            data-testid="search-input" />
        </div>
        <button onClick={handleSearch} disabled={loading}
          className="px-5 py-3 rounded-xl bg-[var(--gold)] text-[#0F1629] text-sm font-bold" data-testid="search-btn">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
        </button>
      </div>

      {loading && <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-[var(--t4)]" /></div>}

      {!loading && searched && results.length === 0 && (
        <Card className="glass-card"><CardContent className="p-8 text-center">
          <Search className="w-10 h-10 mx-auto mb-3 text-[var(--t5)]" />
          <p className="text-sm text-[var(--t4)]">No results found for "{query}"</p>
        </CardContent></Card>
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-[var(--t5)]">{results.length} result{results.length !== 1 ? 's' : ''}</p>
          {results.map((r, i) => {
            const cfg = TYPE_CONFIG[r.type] || TYPE_CONFIG.user;
            const Icon = cfg.icon;
            return (
              <Card key={i} className="glass-card cursor-pointer hover:scale-[1.01] transition-transform" data-testid={`search-result-${i}`}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${cfg.color}15`, border: `1px solid ${cfg.color}25` }}>
                    <Icon className="w-4 h-4" style={{ color: cfg.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[var(--t)] truncate">{r.title}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: `${cfg.color}15`, color: cfg.color }}>{cfg.label}</span>
                    </div>
                    <p className="text-xs text-[var(--t4)] truncate">{r.subtitle}</p>
                  </div>
                  {r.status && (
                    <span className="text-[10px] px-2 py-1 rounded-full bg-[var(--s)] text-[var(--t5)] capitalize flex-shrink-0">{r.status}</span>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

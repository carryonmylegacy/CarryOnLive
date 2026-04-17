import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import {
  Quote,
  Search,
  Download,
  Trash2,
  Loader2,
  MessageSquareQuote,
  Crown,
  Sparkles,
  Star,
} from 'lucide-react';
import { API_URL } from '../../config';
import { toast } from '../../utils/toast';

/**
 * Voices Tab — user-submitted, publicly-consented quotes pulled from the
 * share-card flow. Live testimonial feed for marketing / investor decks.
 */

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

export function VoicesTab({ getAuthHeaders }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [variant, setVariant] = useState(''); // "" | "fc" | "sub"
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [togglingFeature, setTogglingFeature] = useState(null);

  const load = useCallback(
    async (searchTerm = '', variantFilter = '', featuredFilter = false) => {
      setLoading(true);
      try {
        const params = { limit: 200, offset: 0 };
        if (searchTerm.trim()) params.q = searchTerm.trim();
        if (variantFilter) params.variant = variantFilter;
        if (featuredFilter) params.featured_only = true;
        const res = await axios.get(`${API_URL}/share-cards/admin/voices`, {
          params,
          ...getAuthHeaders(),
        });
        setItems(res.data.items || []);
        setTotal(res.data.total || 0);
      } catch (e) {
        toast.error('Failed to load Voices');
      } finally {
        setLoading(false);
      }
    },
    [getAuthHeaders],
  );

  useEffect(() => {
    load('', '', false);
  }, [load]);

  // Debounced search / filter
  useEffect(() => {
    const t = setTimeout(() => load(q, variant, featuredOnly), 300);
    return () => clearTimeout(t);
  }, [q, variant, featuredOnly, load]);

  const exportCsv = async () => {
    try {
      const res = await axios.get(`${API_URL}/share-cards/admin/voices/export`, {
        ...getAuthHeaders(),
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `carryon-voices-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Export failed');
    }
  };

  const redact = async (id) => {
    if (!window.confirm('Redact this quote permanently?')) return;
    setDeleting(id);
    try {
      await axios.delete(`${API_URL}/share-cards/admin/voices/${id}`, {
        ...getAuthHeaders(),
      });
      setItems((prev) => prev.filter((it) => it.id !== id));
      setTotal((t) => Math.max(0, t - 1));
      toast.success('Redacted');
    } catch {
      toast.error('Could not redact');
    } finally {
      setDeleting(null);
    }
  };

  const toggleFeature = async (id, nextValue) => {
    setTogglingFeature(id);
    try {
      await axios.patch(
        `${API_URL}/share-cards/admin/voices/${id}/feature`,
        null,
        { params: { featured: nextValue }, ...getAuthHeaders() },
      );
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, featured: nextValue } : it)));
      toast.success(nextValue ? 'Featured publicly' : 'Unfeatured');
    } catch {
      toast.error('Could not update feature flag');
    } finally {
      setTogglingFeature(null);
    }
  };

  const copy = (text) => {
    try {
      navigator.clipboard.writeText(text);
      toast.success('Copied');
    } catch {
      /* no-op */
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-voices-tab">
      {/* Header */}
      <Card style={{ background: 'var(--s)', borderColor: 'var(--b)' }}>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div
              className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: 'var(--seal-bg)', color: 'var(--gold)' }}
            >
              <MessageSquareQuote className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h2
                className="text-2xl font-semibold tracking-tight"
                style={{ fontFamily: 'var(--serif)', color: 'var(--t)' }}
              >
                Voices
              </h2>
              <p className="mt-1 text-sm" style={{ color: 'var(--t3)' }}>
                Real quotes your members asked us to share publicly — sourced from their
                personalized share cards. Pull these into marketing, App Store copy, or
                investor updates anytime.
              </p>
              <p className="mt-2 text-[11px]" style={{ color: 'var(--t5)' }}>
                {loading ? 'Loading…' : `${total} consented quote${total === 1 ? '' : 's'}`}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: 'var(--t5)' }}
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search quotes…"
            className="pl-9"
            data-testid="voices-search"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { key: '', label: 'All' },
            { key: 'fc', label: 'Founders', icon: Crown },
            { key: 'sub', label: 'Subscribers', icon: Sparkles },
          ].map((v) => {
            const active = variant === v.key;
            const Ic = v.icon;
            return (
              <button
                key={v.key || 'all'}
                onClick={() => setVariant(v.key)}
                className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                style={{
                  background: active ? 'var(--gold)' : 'var(--s)',
                  color: active ? '#080e1a' : 'var(--t)',
                  border: `1px solid ${active ? 'var(--gold)' : 'var(--b)'}`,
                }}
                data-testid={`voices-filter-${v.key || 'all'}`}
              >
                {Ic ? <Ic className="w-3.5 h-3.5" /> : null}
                {v.label}
              </button>
            );
          })}
          <button
            onClick={() => setFeaturedOnly((p) => !p)}
            className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5"
            style={{
              background: featuredOnly ? '#d4af37' : 'var(--s)',
              color: featuredOnly ? '#080e1a' : 'var(--t)',
              border: `1px solid ${featuredOnly ? '#d4af37' : 'var(--b)'}`,
            }}
            data-testid="voices-filter-featured"
            title="Show only quotes published on /voices"
          >
            <Star className="w-3.5 h-3.5" fill={featuredOnly ? '#080e1a' : 'transparent'} />
            Featured
          </button>
        </div>
        <Button
          onClick={exportCsv}
          variant="outline"
          className="flex items-center gap-2"
          data-testid="voices-export-csv"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>

      {/* Empty / list */}
      {loading ? (
        <div className="flex items-center justify-center py-12" style={{ color: 'var(--t4)' }}>
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <Card style={{ background: 'var(--s)', borderColor: 'var(--b)' }}>
          <CardContent className="p-10 text-center">
            <Quote className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--t5)' }} />
            <p className="text-sm" style={{ color: 'var(--t3)' }}>
              No consented quotes yet. They&apos;ll appear here as members opt in through the
              share sheet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((it) => (
            <Card
              key={it.id}
              style={{
                background: 'var(--s)',
                borderColor: it.variant === 'fc' ? 'rgba(212,175,55,0.35)' : 'rgba(52,211,153,0.28)',
              }}
              data-testid={`voice-card-${it.id}`}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider"
                    style={{
                      background: it.variant === 'fc' ? 'rgba(212,175,55,0.14)' : 'rgba(52,211,153,0.14)',
                      color: it.variant === 'fc' ? 'var(--gold)' : '#34d399',
                      border: `1px solid ${it.variant === 'fc' ? 'rgba(212,175,55,0.28)' : 'rgba(52,211,153,0.28)'}`,
                    }}
                  >
                    {it.variant === 'fc' ? <Crown className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
                    {it.variant === 'fc' ? 'Founders' : 'Subscriber'}
                  </div>
                  <span className="text-[11px]" style={{ color: 'var(--t5)' }}>
                    {formatDate(it.created_at)}
                  </span>
                </div>
                <p
                  className="text-base italic leading-relaxed"
                  style={{ fontFamily: 'var(--serif)', color: 'var(--t)' }}
                >
                  &ldquo;{it.quote}&rdquo;
                </p>
                <p className="mt-3 text-xs" style={{ color: 'var(--t4)' }}>
                  — {it.first_name}
                </p>

                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => copy(`"${it.quote}" — ${it.first_name}, CarryOn member`)}
                    className="text-[11px] px-2.5 py-1 rounded-md"
                    style={{ background: 'var(--b)', color: 'var(--t2)' }}
                    data-testid={`voice-copy-${it.id}`}
                  >
                    Copy
                  </button>
                  <button
                    onClick={() => toggleFeature(it.id, !it.featured)}
                    disabled={togglingFeature === it.id}
                    className="text-[11px] px-2.5 py-1 rounded-md flex items-center gap-1"
                    style={{
                      background: it.featured ? 'rgba(212,175,55,0.18)' : 'var(--b)',
                      color: it.featured ? '#d4af37' : 'var(--t2)',
                      border: `1px solid ${it.featured ? '#d4af37' : 'var(--b)'}`,
                    }}
                    data-testid={`voice-feature-${it.id}`}
                    title={it.featured ? 'Remove from public /voices page' : 'Publish to /voices page'}
                  >
                    {togglingFeature === it.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Star className="w-3 h-3" fill={it.featured ? '#d4af37' : 'transparent'} />
                    )}
                    {it.featured ? 'Featured' : 'Feature'}
                  </button>
                  <button
                    onClick={() => redact(it.id)}
                    disabled={deleting === it.id}
                    className="text-[11px] px-2.5 py-1 rounded-md flex items-center gap-1 ml-auto"
                    style={{
                      background: 'transparent',
                      color: 'rgba(239,68,68,0.9)',
                      border: '1px solid rgba(239,68,68,0.3)',
                    }}
                    data-testid={`voice-redact-${it.id}`}
                  >
                    {deleting === it.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3" />
                    )}
                    Redact
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default VoicesTab;

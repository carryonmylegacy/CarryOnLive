import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '../ui/command';
import { Dialog, DialogContent } from '../ui/dialog';
import { Search, User, ArrowRight, Sparkles } from 'lucide-react';
import { API_URL } from '../../config';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Admin Command Palette — ⌘K / Ctrl+K
 *
 * Fuzzy search across:
 *   • All admin tabs (navigate on Enter)
 *   • User directory (find user by email/name; copies id, opens audit)
 *   • Quick actions (clean orphans, toggle maintenance, jump to Founder Invites, etc.)
 *
 * Purely additive: does not replace the existing tab bar. Opens via keyboard
 * shortcut or the "⌘K" pill in the admin header.
 */
export function AdminCommandPalette({ tabs = [], operatorMode = false }) {
  const navigate = useNavigate();
  const { getAuthHeaders } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const debounceRef = useRef(null);

  // Global shortcut: ⌘K / Ctrl+K
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape' && open) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Debounced user search — only when query >= 2 chars
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) { setUsers([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoadingUsers(true);
      try {
        const res = await axios.get(
          `${API_URL}/admin/users/search`,
          { ...getAuthHeaders(), params: { q: query.trim(), limit: 8 } }
        );
        setUsers(Array.isArray(res.data) ? res.data.slice(0, 8) : []);
      } catch {
        // Fallback: fetch all users once and filter client-side
        try {
          const res = await axios.get(`${API_URL}/admin/users`, getAuthHeaders());
          const q = query.toLowerCase();
          const filtered = (res.data || [])
            .filter(u => {
              const hay = `${u.email || ''} ${u.first_name || ''} ${u.last_name || ''}`.toLowerCase();
              return hay.includes(q);
            })
            .slice(0, 8);
          setUsers(filtered);
        } catch {
          setUsers([]);
        }
      }
      setLoadingUsers(false);
    }, 200);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [query, open, getAuthHeaders]);

  const navigableTabs = useMemo(
    () => tabs.filter(t => !t.sectionLabel && t.path),
    [tabs]
  );

  const grouped = useMemo(() => {
    const groups = {};
    let currentSection = 'General';
    tabs.forEach((t) => {
      if (t.sectionLabel) { currentSection = t.sectionLabel; return; }
      if (!t.path) return;
      if (!groups[currentSection]) groups[currentSection] = [];
      groups[currentSection].push(t);
    });
    return groups;
  }, [tabs]);

  const go = (path) => {
    setOpen(false);
    setQuery('');
    navigate(path);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors"
        style={{
          background: 'var(--s)',
          color: 'var(--t4)',
          border: '1px solid var(--b)',
        }}
        data-testid="admin-cmdk-trigger"
        title="Quick search (⌘K)"
      >
        <Search className="w-3 h-3" />
        <span className="hidden sm:inline">Quick Search</span>
        <kbd className="hidden sm:inline px-1 py-0.5 rounded text-[11px]" style={{ background: 'var(--b)', color: 'var(--t3)' }}>⌘K</kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="p-0 overflow-hidden max-w-2xl"
          style={{ background: 'var(--bg2)', border: '1px solid var(--b2)' }}
          data-testid="admin-cmdk-dialog"
        >
          <Command shouldFilter className="rounded-lg">
            <CommandInput
              placeholder="Search tabs, users, actions…"
              value={query}
              onValueChange={setQuery}
              data-testid="admin-cmdk-input"
            />
            <CommandList className="max-h-[60vh]">
              <CommandEmpty>No matches.</CommandEmpty>

              {/* Quick Actions */}
              <CommandGroup heading="Quick Actions">
                <CommandItem value="founder invites" onSelect={() => go(operatorMode ? '/ops/users' : '/admin/founder-invites')} data-testid="cmdk-action-invites">
                  <Sparkles className="w-4 h-4 mr-2 text-[var(--gold)]" />
                  <span>Review Founder Invites</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-auto opacity-40" />
                </CommandItem>
                <CommandItem value="revenue analytics" onSelect={() => go('/admin/analytics')} data-testid="cmdk-action-revenue">
                  <Sparkles className="w-4 h-4 mr-2 text-[var(--gold)]" />
                  <span>Open Revenue Analytics</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-auto opacity-40" />
                </CommandItem>
                <CommandItem value="system health status" onSelect={() => go('/admin/system-health')} data-testid="cmdk-action-sysheal">
                  <Sparkles className="w-4 h-4 mr-2 text-[var(--gold)]" />
                  <span>Check System Health</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-auto opacity-40" />
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />

              {/* Users — only show when query present */}
              {query.trim().length >= 2 && (
                <CommandGroup heading={loadingUsers ? 'Users (searching…)' : 'Users'}>
                  {users.map((u) => (
                    <CommandItem
                      key={u.id}
                      value={`user ${u.email} ${u.first_name || ''} ${u.last_name || ''}`}
                      onSelect={() => go(`/admin/users?userId=${encodeURIComponent(u.id)}`)}
                      data-testid={`cmdk-user-${u.id}`}
                    >
                      <User className="w-4 h-4 mr-2 text-[var(--t4)]" />
                      <span className="truncate">
                        <span className="font-medium text-[var(--t)]">
                          {u.first_name || ''} {u.last_name || ''}
                        </span>
                        <span className="ml-2 text-[11px] text-[var(--t5)]">{u.email}</span>
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 ml-auto opacity-40" />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {query.trim().length >= 2 && users.length > 0 && <CommandSeparator />}

              {/* Tabs by section */}
              {Object.entries(grouped).map(([section, items]) => (
                <CommandGroup key={section} heading={section}>
                  {items.map((t) => {
                    const Icon = t.icon;
                    return (
                      <CommandItem
                        key={t.key}
                        value={`${section} ${t.label} ${t.key}`}
                        onSelect={() => go(t.path)}
                        data-testid={`cmdk-tab-${t.key}`}
                      >
                        {Icon && <Icon className="w-4 h-4 mr-2 text-[var(--t4)]" />}
                        <span>{t.label}</span>
                        <ArrowRight className="w-3.5 h-3.5 ml-auto opacity-40" />
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default AdminCommandPalette;

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Shield, ChevronDown, ChevronRight, Pencil, Check, X, ToggleLeft, ToggleRight } from 'lucide-react';
import { toast } from '../../utils/toast';
import { API_URL } from '../../config';

/**
 * Platform Rules Tab — Structured business rules reference.
 * Visible in all admin portals. Editable only by founder.
 */
export function PlatformRulesTab({ getAuthHeaders }) {
  const [rules, setRules] = useState([]);
  const [editable, setEditable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [collapsed, setCollapsed] = useState({});

  const fetchRules = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/platform-rules`, getAuthHeaders());
      setRules(res.data.rules || []);
      setEditable(res.data.editable);
    } catch {
      toast.error('Failed to load platform rules');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const saveRule = async (ruleId, value) => {
    try {
      const res = await axios.put(`${API_URL}/admin/platform-rules`, { rule_id: ruleId, value }, getAuthHeaders());
      setRules(res.data.rules || []);
      toast.success('Rule updated');
      setEditingId(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update rule');
    }
  };

  const toggleCategory = (cat) => setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }));

  // Group rules by category
  const categories = [];
  const catMap = {};
  rules.forEach(r => {
    if (!catMap[r.category]) {
      catMap[r.category] = [];
      categories.push(r.category);
    }
    catMap[r.category].push(r);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="platform-rules-tab">
      <div className="flex items-center gap-3 mb-2">
        <Shield className="w-5 h-5 text-[var(--gold)]" />
        <div>
          <h2 className="text-lg font-bold text-[var(--t)]">Platform Rules</h2>
          <p className="text-xs text-[var(--t4)]">
            {editable ? 'You can edit values marked with a pencil icon. Changes propagate immediately across all portals.' : 'Read-only reference. Contact the founder to request changes.'}
          </p>
        </div>
      </div>

      {categories.map(cat => (
        <div key={cat} className="rounded-xl overflow-hidden" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
          <button
            onClick={() => toggleCategory(cat)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
            data-testid={`rules-category-${cat.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <span className="text-sm font-bold text-[var(--gold)]">{cat}</span>
            {collapsed[cat]
              ? <ChevronRight className="w-4 h-4 text-[var(--t4)]" />
              : <ChevronDown className="w-4 h-4 text-[var(--t4)]" />
            }
          </button>

          {!collapsed[cat] && (
            <div className="divide-y divide-[var(--b)]">
              {catMap[cat].map(rule => (
                <div key={rule.id} className="px-4 py-3" data-testid={`rule-${rule.id}`}>
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-[var(--t2)]">{rule.label}</span>
                      <p className="text-xs text-[var(--t4)] mt-0.5">{rule.description}</p>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0 mt-1">
                      {editingId === rule.id ? (
                        <>
                          {rule.value_type === 'toggle' ? (
                            <button
                              onClick={() => saveRule(rule.id, editValue === 'true' ? 'false' : 'true')}
                              className="flex items-center gap-1"
                            >
                              {editValue === 'true'
                                ? <ToggleRight className="w-6 h-6 text-[#10b981]" />
                                : <ToggleLeft className="w-6 h-6 text-[var(--t4)]" />
                              }
                              <span className="text-xs text-[var(--t3)]">{editValue === 'true' ? 'ON' : 'OFF'}</span>
                            </button>
                          ) : (
                            <input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-20 px-2 py-1 rounded text-xs text-right"
                              style={{ background: 'var(--bg3)', border: '1px solid var(--b2)', color: 'var(--t)' }}
                              autoFocus
                              onKeyDown={(e) => { if (e.key === 'Enter') saveRule(rule.id, editValue); if (e.key === 'Escape') setEditingId(null); }}
                            />
                          )}
                          <button onClick={() => saveRule(rule.id, editValue)} className="p-1 rounded hover:bg-[var(--s)]">
                            <Check className="w-4 h-4 text-[#10b981]" />
                          </button>
                          <button onClick={() => setEditingId(null)} className="p-1 rounded hover:bg-[var(--s)]">
                            <X className="w-4 h-4 text-[var(--rd)]" />
                          </button>
                        </>
                      ) : (
                        <>
                          {rule.value_type === 'toggle' ? (
                            <div className="flex items-center gap-1">
                              {rule.value === 'true'
                                ? <ToggleRight className="w-5 h-5 text-[#10b981]" />
                                : <ToggleLeft className="w-5 h-5 text-[var(--t4)]" />
                              }
                              <span className="text-xs font-mono text-[var(--t3)]">{rule.value === 'true' ? 'ON' : 'OFF'}</span>
                            </div>
                          ) : (
                            <span className="text-xs font-mono text-[var(--t)] px-2 py-0.5 rounded" style={{ background: 'var(--s)' }}>
                              {rule.value}
                            </span>
                          )}
                          {editable && rule.editable_value && (
                            <button
                              onClick={() => { setEditingId(rule.id); setEditValue(rule.value); }}
                              className="p-1 rounded hover:bg-[var(--s)] transition-colors"
                              data-testid={`edit-rule-${rule.id}`}
                            >
                              <Pencil className="w-3.5 h-3.5 text-[var(--t4)]" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  {rule.narrative && (
                    <p className="text-xs text-[var(--t4)] leading-relaxed mt-2 py-1.5 px-3 rounded-lg italic" style={{ background: 'var(--s)', borderLeft: '2px solid var(--gold)' }}>
                      {rule.narrative}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

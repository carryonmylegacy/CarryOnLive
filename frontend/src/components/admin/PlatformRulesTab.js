import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Shield, ChevronDown, ChevronRight, Pencil, Check, X, ToggleLeft, ToggleRight, Sparkles, Loader2 } from 'lucide-react';
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
  const [editingNarrativeId, setEditingNarrativeId] = useState(null);
  const [editNarrative, setEditNarrative] = useState('');
  const [collapsed, setCollapsed] = useState({});
  const [generating, setGenerating] = useState(false);

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

  const saveNarrative = async (ruleId, narrative) => {
    try {
      const res = await axios.put(`${API_URL}/admin/platform-rules/narrative`, { rule_id: ruleId, narrative }, getAuthHeaders());
      setRules(res.data.rules || []);
      toast.success('Narrative updated');
      setEditingNarrativeId(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update narrative');
    }
  };

  const toggleCategory = (cat) => setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }));

  const generateNarratives = async () => {
    setGenerating(true);
    try {
      await axios.post(`${API_URL}/admin/platform-rules/generate-narratives`, {}, getAuthHeaders());
      toast.success('Generating narratives... will refresh automatically in 30 seconds.');
      // Poll for completion
      const poll = setInterval(async () => {
        try {
          const res = await axios.get(`${API_URL}/admin/platform-rules`, getAuthHeaders());
          const rules = res.data.rules || [];
          const hasNarratives = rules.some(r => r.narrative);
          if (hasNarratives) {
            clearInterval(poll);
            setRules(rules);
            setGenerating(false);
            toast.success('Narratives generated!');
          }
        } catch {}
      }, 5000);
      setTimeout(() => { clearInterval(poll); setGenerating(false); }, 60000);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to generate narratives');
      setGenerating(false);
    }
  };

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
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-[var(--gold)]" />
          <div>
            <h2 className="text-lg font-bold text-[var(--t)]">Platform Rules</h2>
            <p className="text-xs text-[var(--t4)]">
              {editable ? 'Edit values with the pencil icon. Changes propagate immediately across all portals.' : 'Read-only reference. Contact the founder to request changes.'}
            </p>
          </div>
        </div>
        {editable && (
          <button
            onClick={generateNarratives}
            disabled={generating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
            style={{ background: 'rgba(212,175,55,0.15)', color: 'var(--gold)', border: '1px solid rgba(212,175,55,0.3)' }}
            data-testid="generate-narratives-btn"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {generating ? 'Generating...' : 'Generate Narratives'}
          </button>
        )}
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
                    editingNarrativeId === rule.id ? (
                      <div className="mt-2">
                        <textarea
                          value={editNarrative}
                          onChange={(e) => setEditNarrative(e.target.value)}
                          className="w-full text-xs leading-relaxed p-3 rounded-lg"
                          style={{ background: 'var(--s)', border: '1px solid var(--gold)', color: 'var(--t)', resize: 'vertical', minHeight: '80px', outline: 'none', fontSize: '16px' }}
                          autoFocus
                        />
                        <div className="flex gap-2 mt-1.5">
                          <button onClick={() => saveNarrative(rule.id, editNarrative)} className="flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>
                            <Check className="w-3 h-3" /> Save
                          </button>
                          <button onClick={() => setEditingNarrativeId(null)} className="flex items-center gap-1 px-2 py-1 rounded text-xs" style={{ color: 'var(--t4)' }}>
                            <X className="w-3 h-3" /> Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 relative group">
                        <p className="text-xs text-[var(--t4)] leading-relaxed py-1.5 px-3 rounded-lg italic" style={{ background: 'var(--s)', borderLeft: '2px solid var(--gold)' }}>
                          {rule.narrative}
                        </p>
                        {editable && (
                          <button
                            onClick={() => { setEditingNarrativeId(rule.id); setEditNarrative(rule.narrative); }}
                            className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ background: 'var(--bg2)' }}
                          >
                            <Pencil className="w-3 h-3 text-[var(--t4)]" />
                          </button>
                        )}
                      </div>
                    )
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

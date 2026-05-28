import React, { useState, useEffect } from 'react';
import { Bell, Plus, Edit, Trash2, Loader2, X, Check } from 'lucide-react';
import { Switch } from '../ui/switch';
import { API_URL } from '../../config';

export const NotificationCategoriesTab = ({ getAuthHeaders }) => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ label: '', description: '', default_enabled: true, is_critical: false });
  const [saving, setSaving] = useState(false);

  const fetchCategories = async () => {
    try {
      const authHeaders = getAuthHeaders();
      const res = await fetch(`${API_URL}/admin/notification-categories`, { headers: authHeaders.headers || authHeaders });
      if (res.ok) setCategories(await res.json());
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchCategories(); }, []);

  const addCategory = async () => {
    if (!form.label.trim()) return;
    setSaving(true);
    try {
      const authHeaders = getAuthHeaders();
      const headers = { ...(authHeaders.headers || authHeaders), 'Content-Type': 'application/json' };
      const res = await fetch(`${API_URL}/admin/notification-categories`, {
        method: 'POST', headers,
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setShowAdd(false);
        setForm({ label: '', description: '', default_enabled: true, is_critical: false });
        await fetchCategories();
      } else {
        const err = await res.json();
        alert(err.detail || 'Failed to add');
      }
    } catch {} finally { setSaving(false); }
  };

  const updateCategory = async (id, updates) => {
    setSaving(true);
    try {
      const authHeaders = getAuthHeaders();
      const headers = { ...(authHeaders.headers || authHeaders), 'Content-Type': 'application/json' };
      await fetch(`${API_URL}/admin/notification-categories/${id}`, {
        method: 'PUT', headers,
        body: JSON.stringify(updates),
      });
      setEditing(null);
      await fetchCategories();
    } catch {} finally { setSaving(false); }
  };

  const deleteCategory = async (id) => {
    if (!window.confirm('Delete this notification category? Users will no longer see this toggle.')) return;
    try {
      const authHeaders = getAuthHeaders();
      await fetch(`${API_URL}/admin/notification-categories/${id}`, {
        method: 'DELETE', headers: authHeaders.headers || authHeaders,
      });
      await fetchCategories();
    } catch {}
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#d4af37' }} />
      </div>
    );
  }

  return (
    <div data-testid="notification-categories-tab" className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--t)]">Notification Categories</h2>
          <p className="text-sm text-[var(--t5)]">Manage push notification types available to all users</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.97]"
          data-testid="add-notification-category-btn"
          style={{ background: 'linear-gradient(135deg, #d4af37, #F0C95C)', color: '#080e1a' }}
        >
          <Plus className="w-4 h-4" />Add Category
        </button>
      </div>

      {/* Add Category Form */}
      {showAdd && (
        <div className="rounded-xl p-5" style={{ background: 'var(--s)', border: '1px solid var(--gold, rgba(var(--gold-rgb), 0.3))' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-[var(--t)]">New Notification Category</h3>
            <button onClick={() => setShowAdd(false)}><X className="w-4 h-4 text-[var(--t5)]" /></button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold mb-1 block text-[var(--t4)]">Label</label>
              <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="e.g., Weather Alerts" className="w-full rounded-xl px-3 py-2.5 text-base"
                data-testid="new-category-label"
                style={{ background: 'var(--bg)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px' }} />
            </div>
            <div>
              <label className="text-xs font-bold mb-1 block text-[var(--t4)]">Description</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Brief description shown to users" className="w-full rounded-xl px-3 py-2.5 text-base"
                data-testid="new-category-description"
                style={{ background: 'var(--bg)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px' }} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--t)]">Default Enabled</span>
              <Switch checked={form.default_enabled} onCheckedChange={(v) => setForm({ ...form, default_enabled: v })} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-[var(--t)]">Mark as Critical</span>
                <p className="text-xs text-[var(--t5)]">Shows a red CRITICAL badge to users</p>
              </div>
              <Switch checked={form.is_critical} onCheckedChange={(v) => setForm({ ...form, is_critical: v })} />
            </div>
            <button onClick={addCategory} disabled={saving || !form.label.trim()}
              className="w-full py-3 rounded-xl text-sm font-bold transition-all"
              data-testid="save-new-category"
              style={{ background: form.label.trim() ? 'linear-gradient(135deg, #d4af37, #F0C95C)' : 'var(--s)', color: form.label.trim() ? '#080e1a' : 'var(--t5)' }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Add Category'}
            </button>
          </div>
        </div>
      )}

      {/* Categories List */}
      <div className="space-y-2">
        {categories.map((cat, i) => (
          <div key={cat.id} className="rounded-xl p-4 flex items-center gap-4"
            data-testid={`category-row-${cat.id}`}
            style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold" style={{ background: 'rgba(var(--gold-rgb), 0.1)', color: '#d4af37' }}>
              {i + 1}
            </div>
            <div className="flex-1">
              {editing === cat.id ? (
                <EditCategoryInline
                  cat={cat}
                  onSave={(updates) => updateCategory(cat.id, updates)}
                  onCancel={() => setEditing(null)}
                  saving={saving}
                />
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-[var(--t)]">{cat.label}</span>
                    {cat.is_critical && (
                      <span className="text-[11px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(240,82,82,0.1)', color: '#F05252' }}>CRITICAL</span>
                    )}
                    <span className="text-[11px] font-medium px-1.5 py-0.5 rounded" style={{ background: cat.default_enabled ? 'rgba(34,201,147,0.1)' : 'rgba(255,255,255,0.05)', color: cat.default_enabled ? '#22C993' : 'var(--t5)' }}>
                      {cat.default_enabled ? 'ON by default' : 'OFF by default'}
                    </span>
                  </div>
                  <p className="text-xs mt-0.5 text-[var(--t5)]">{cat.description}</p>
                </>
              )}
            </div>
            {editing !== cat.id && (
              <div className="flex gap-1.5">
                <button onClick={() => setEditing(cat.id)} className="w-8 h-8 rounded-lg flex items-center justify-center"
                  data-testid={`edit-category-${cat.id}`} style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <Edit className="w-3.5 h-3.5 text-[var(--t4)]" />
                </button>
                <button onClick={() => deleteCategory(cat.id)} className="w-8 h-8 rounded-lg flex items-center justify-center"
                  data-testid={`delete-category-${cat.id}`} style={{ background: 'rgba(240,82,82,0.1)' }}>
                  <Trash2 className="w-3.5 h-3.5" style={{ color: '#F05252' }} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {categories.length === 0 && (
        <div className="text-center py-12">
          <Bell className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--t5)' }} />
          <p className="text-sm text-[var(--t5)]">No categories configured</p>
        </div>
      )}
    </div>
  );
};

function EditCategoryInline({ cat, onSave, onCancel, saving }) {
  const [label, setLabel] = useState(cat.label);
  const [description, setDescription] = useState(cat.description || '');
  const [defaultEnabled, setDefaultEnabled] = useState(cat.default_enabled);
  const [isCritical, setIsCritical] = useState(cat.is_critical);

  return (
    <div className="space-y-2">
      <input value={label} onChange={(e) => setLabel(e.target.value)}
        className="w-full rounded-lg px-3 py-2 text-base"
        style={{ background: 'var(--bg)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px' }} />
      <input value={description} onChange={(e) => setDescription(e.target.value)}
        className="w-full rounded-lg px-3 py-2 text-base"
        style={{ background: 'var(--bg)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px' }} />
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-[var(--t4)]">
          Default ON <Switch checked={defaultEnabled} onCheckedChange={setDefaultEnabled} />
        </label>
        <label className="flex items-center gap-2 text-xs text-[var(--t4)]">
          Critical <Switch checked={isCritical} onCheckedChange={setIsCritical} />
        </label>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave({ label, description, default_enabled: defaultEnabled, is_critical: isCritical })}
          disabled={saving} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: '#22C993', color: '#080e1a' }}>
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Check className="w-3 h-3 inline mr-1" />Save</>}
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--t5)]" style={{ background: 'var(--bg)' }}>Cancel</button>
      </div>
    </div>
  );
}

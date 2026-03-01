import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  FileText, Shield, Heart, Stethoscope, Loader2, Check, ChevronRight, X
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { toast } from '../utils/toast';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TEMPLATE_ICONS = {
  heart: Heart,
  shield: Shield,
  baby: Heart,
  rings: Heart,
};

const TEMPLATE_COLORS = {
  hospice: '#ef4444',
  military: '#3b82f6',
  new_parent: '#10b981',
  recently_married: '#d4af37',
};

const QuickStartTemplates = ({ estateId, onApplied }) => {
  const { getAuthHeaders } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => { fetchTemplates(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchTemplates = async () => {
    try {
      const res = await axios.get(`${API_URL}/templates/scenarios`, getAuthHeaders());
      setTemplates(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const applyTemplate = async (templateId) => {
    if (!estateId) {
      toast.error('Please select an estate first');
      return;
    }
    setApplying(templateId);
    try {
      const res = await axios.post(`${API_URL}/templates/apply`, {
        estate_id: estateId,
        template_id: templateId,
      }, getAuthHeaders());
      // toast removed
      if (onApplied) onApplied();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to apply template');
    } finally {
      setApplying(null);
    }
  };

  if (loading) return null;
  if (!templates.length) return null;

  return (
    <Card className="border-[var(--b)] bg-[#0F1629]/80 mb-6" data-testid="quick-start-templates">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#d4af37]" />
            <h3 className="text-white font-semibold text-sm">Quick-Start Templates</h3>
          </div>
          <button onClick={() => setShowAll(!showAll)} className="text-xs text-[#d4af37] hover:text-[#e5c76b] transition-colors">
            {showAll ? 'Show less' : 'View all'}
          </button>
        </div>
        <p className="text-xs text-[#94a3b8] mb-4">
          Pre-built checklists for common scenarios. Select one to add expert-curated action items to your checklist.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(showAll ? templates : templates.slice(0, 2)).map((t) => {
            const Icon = TEMPLATE_ICONS[t.icon] || FileText;
            const color = TEMPLATE_COLORS[t.id] || '#d4af37';
            return (
              <button
                key={t.id}
                onClick={() => applyTemplate(t.id)}
                disabled={applying === t.id}
                className="flex items-start gap-3 p-3 rounded-lg bg-[var(--s)] hover:bg-[var(--s)] transition-all text-left group"
                data-testid={`template-${t.id}`}
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${color}20` }}>
                  {applying === t.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" style={{ color }} />
                  ) : (
                    <Icon className="w-4 h-4" style={{ color }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white group-hover:text-[#d4af37] transition-colors">{t.name}</p>
                  <p className="text-xs text-[#64748b] mt-0.5">{t.item_count} items</p>
                </div>
                <ChevronRight className="w-4 h-4 text-[#64748b] group-hover:text-white transition-colors mt-1 flex-shrink-0" />
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default QuickStartTemplates;

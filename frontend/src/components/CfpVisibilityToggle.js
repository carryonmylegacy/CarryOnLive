/**
 * CfpVisibilityToggle — global pre-transition visibility switch for the
 * CarryOn Financial Picture (CFP) module.
 *
 * Sits at the top of the benefactor's CFP page. When OFF (default), the
 * entire CFP module is hidden from beneficiaries until the estate
 * transitions. When ON, beneficiaries see the items the benefactor has
 * individually toggled "pre" for them — per-item designations are still
 * fully respected (a bill marked post-only stays hidden during a Eurotrip).
 *
 * Use cases the benefactor flips this on for: scheduled hospital stay,
 * military deployment, extended travel, eldercare hand-off — anything
 * that requires their family to step in temporarily.
 */
import React, { useState } from 'react';
import apiClient from '../utils/apiClient';
import { Eye, EyeOff, Loader2, Plane } from 'lucide-react';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { API_URL } from '../config';
import { toast } from '../utils/toast';

export default function CfpVisibilityToggle({ estate, onUpdate }) {
  const [busy, setBusy] = useState(false);
  // Default to false if the field is missing on older estates.
  const enabled = !!(estate && estate.cfp_pre_transition_visible);

  if (!estate?.id) return null;

  const flip = async () => {
    const next = !enabled;
    setBusy(true);
    try {
      const token = localStorage.getItem('carryon_token');
      await apiClient.patch(
        `${API_URL}/estates/${estate.id}`,
        { cfp_pre_transition_visible: next },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(
        next
          ? 'CFP is now visible to your designated beneficiaries (pre-transition).'
          : 'CFP is hidden again — only visible after transition.'
      );
      if (typeof onUpdate === 'function') onUpdate({ ...estate, cfp_pre_transition_visible: next });
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not update CFP visibility.');
    } finally {
      setBusy(false);
    }
  };

  const label = enabled ? 'CFP visible now' : 'CFP visible after transition';
  const Icon = enabled ? Eye : EyeOff;

  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            onClick={flip}
            disabled={busy}
            className="outline-pill-button flex-shrink-0 px-3 sm:px-4"
            data-testid="cfp-visibility-toggle"
            aria-pressed={enabled}
          >
            {busy ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin text-[var(--gold)]" />
            ) : (
              <Icon
                className="w-4 h-4 mr-1.5"
                style={{ color: enabled ? 'var(--gold)' : 'var(--t4)' }}
              />
            )}
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{enabled ? 'Now' : 'After'}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
          <div className="flex items-start gap-2">
            <Plane className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: 'var(--gold)' }} />
            <div>
              <strong className="block mb-1" style={{ color: 'var(--t)' }}>
                Pre-transition CFP visibility
              </strong>
              {enabled
                ? "ON — your designated beneficiaries can see CFP items you've marked 'pre' for them. Items marked 'post only' stay hidden. Toggle off when you're back."
                : "OFF — the entire CFP is hidden from beneficiaries until the estate transitions. Flip on for a hospital stay, a Eurotrip, or any time your family needs to step in."}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

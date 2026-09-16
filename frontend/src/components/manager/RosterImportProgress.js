/**
 * RosterImportProgress — live progress while the import job runs, then the
 * finishing card (counts, invitation status, what to do next).
 */

import React from 'react';
import { Loader2, CheckCircle2, AlertTriangle, RotateCcw, Send } from 'lucide-react';
import { Button } from '../ui/button';

const Bar = ({ value, max, color }) => (
  <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--b)' }}>
    <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${max ? Math.min(100, Math.round((value / max) * 100)) : 0}%`, background: color }} />
  </div>
);

export const RosterImportProgress = ({ job, onReset }) => {
  const p = job.progress || {};
  if (job.status === 'running') {
    return (
      <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--s)', border: '1px solid rgba(var(--gold-rgb),0.4)' }} data-testid="roster-import-progress">
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--t)] mb-2">
          <Loader2 className="w-4 h-4 animate-spin text-[var(--gold)]" /> Setting up client portals… {p.done || 0} of {p.total || 0}
        </div>
        <Bar value={p.done || 0} max={p.total || 0} color="var(--gold)" />
        <p className="text-xs text-[var(--t5)] mt-2" data-testid="roster-progress-text">
          {p.added || 0} added · {p.renamed || 0} renamed{p.failed ? ` · ${p.failed} failed` : ''} — you can keep this page open; large lists take a minute or two.
        </p>
        {job.stalled && (
          <p className="text-xs mt-2 flex items-center gap-1" style={{ color: '#F59E0B' }} data-testid="roster-progress-stalled">
            <AlertTriangle className="w-3 h-3" /> This is taking longer than expected. Refresh the page — anything already added is safe, and re-uploading the file skips people who are already clients.
          </p>
        )}
      </div>
    );
  }
  if (job.status === 'failed') {
    return (
      <div className="rounded-xl p-4 mb-4" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)' }} data-testid="roster-import-failed">
        <div className="flex items-center gap-2 text-sm font-bold text-[#f87171] mb-1"><AlertTriangle className="w-4 h-4" /> The import stopped early</div>
        <p className="text-sm text-[var(--t3)]">{job.error || 'Something went wrong.'} Anything already added is safe — upload the same file again and we&apos;ll skip everyone who is already a client.</p>
        <Button size="sm" variant="outline" className="text-xs border-[var(--b)] mt-3" onClick={onReset} data-testid="roster-import-another">
          <RotateCcw className="w-3 h-3 mr-1" /> Try again
        </Button>
      </div>
    );
  }
  const s = job.summary || {};
  const sending = job.invites_status === 'sending';
  return (
    <div className="rounded-xl p-4 mb-4" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.35)' }} data-testid="roster-import-result">
      <div className="flex items-center gap-2 text-sm font-bold text-[#10b981] mb-1"><CheckCircle2 className="w-4 h-4" /> Import complete</div>
      <p className="text-sm text-[var(--t3)]" data-testid="roster-import-result-text">
        <strong className="text-[var(--t)]">{s.added}</strong> added · <strong className="text-[var(--t)]">{s.renamed}</strong> renamed · {s.already_client} already clients
        {s.failed ? <> · <span style={{ color: '#F59E0B' }}>{s.failed} failed</span></> : null}
      </p>
      {job.failed_rows?.length > 0 && (
        <ul className="text-xs text-[var(--t4)] mt-2 space-y-0.5" data-testid="roster-failed-rows">
          {job.failed_rows.map(f => <li key={f.row}>Row {f.row}: {f.detail}</li>)}
        </ul>
      )}
      <div className="text-xs text-[var(--t4)] mt-3" data-testid="roster-invites-status">
        {job.invites_status === 'none' && (
          <span>No invitations were sent. Your new clients are in the roster below as <strong className="text-[var(--t3)]">Awaiting claim</strong> — enter each portal to upload their documents, then use <strong className="text-[var(--t3)]">Send Invite</strong>.</span>
        )}
        {sending && (
          <div>
            <span className="flex items-center gap-1 mb-1"><Send className="w-3 h-3 text-[var(--gold)]" /> Sending invitations… {p.invites_sent || 0} of {p.invites_total || 0}</span>
            <Bar value={p.invites_sent || 0} max={p.invites_total || 0} color="#10b981" />
          </div>
        )}
        {job.invites_status === 'done' && <span>{p.invites_total || 0} invitation{p.invites_total === 1 ? '' : 's'} sent. Each client will pick their own username and password from the link.</span>}
      </div>
      <Button size="sm" variant="outline" className="text-xs border-[var(--b)] mt-3" onClick={onReset} data-testid="roster-import-another">
        <RotateCcw className="w-3 h-3 mr-1" /> Import another file
      </Button>
    </div>
  );
};

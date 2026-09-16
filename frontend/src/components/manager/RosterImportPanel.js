/**
 * RosterImportPanel — "Import roster" for the Partner Portal and the founder
 * Admin. Upload → confirm columns → review plan → add clients (invites now or later).
 * `api` = { analyze, remap, commit, imports }; `headers` = fn returning auth headers.
 */

import React, { useRef } from 'react';
import { FileSpreadsheet, Loader2, Upload, Download, Send, Clock, RotateCcw, CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/button';
import { useRosterImport } from '../../hooks/useRosterImport';
import { RosterMappingEditor } from './RosterMappingEditor';
import { RosterPreviewTable, RosterSummary } from './RosterPreviewTable';

const downloadTemplate = () => {
  const csv = 'First Name,Last Name,Email\r\nJane,Dawson,jane.dawson@example.com\r\n';
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'carryon-roster-template.csv';
  a.click();
  URL.revokeObjectURL(a.href);
};

const HowItWorks = () => (
  <ul className="text-xs text-[var(--t4)] space-y-1 mb-4" data-testid="roster-how-it-works">
    <li>· Upload the spreadsheet you already keep — any columns, any order. We remember your layout for next time.</li>
    <li>· Each person is matched by <strong className="text-[var(--t3)]">email</strong>. People already on your roster are skipped; unclaimed portals can be renamed.</li>
    <li>· Nothing is ever removed or deactivated from a spreadsheet. You review the plan before anything is added.</li>
  </ul>
);

const ImportHistory = ({ history }) => history.length > 0 && (
  <details className="mt-4 text-sm" data-testid="roster-import-history">
    <summary className="cursor-pointer text-[var(--t4)] font-semibold">Previous imports ({history.length})</summary>
    <ul className="mt-2 space-y-1 text-xs text-[var(--t4)]">
      {history.map(h => (
        <li key={h.id} className="flex flex-wrap items-center gap-x-2" data-testid={`roster-history-${h.id}`}>
          <span className="text-[var(--t3)]">{h.created_at?.slice(0, 10)}</span> · {h.filename} · {h.actor_label} ·
          <span className="text-[#10b981]">{h.summary?.added} added</span>
          {h.summary?.renamed ? <span className="text-[#a78bfa]">{h.summary.renamed} renamed</span> : null}
          · {h.summary?.already_client} already clients · {h.send_invites ? `${h.summary?.invites_sent} invites sent` : 'invites held'}
        </li>
      ))}
    </ul>
  </details>
);

const ResultCard = ({ result, onReset }) => (
  <div className="rounded-xl p-4 mb-4" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.35)' }} data-testid="roster-import-result">
    <div className="flex items-center gap-2 text-sm font-bold text-[#10b981] mb-1"><CheckCircle2 className="w-4 h-4" /> Import complete</div>
    <p className="text-sm text-[var(--t3)]" data-testid="roster-import-result-text">
      {result.summary.added} added · {result.summary.renamed} renamed · {result.summary.already_client} already clients
      {result.summary.failed ? ` · ${result.summary.failed} failed` : ''} · {result.summary.invites_sent ? `${result.summary.invites_sent} invitations sending now` : 'no invitations sent — use Send Invite on each client when ready'}
    </p>
    <Button size="sm" variant="outline" className="text-xs border-[var(--b)] mt-3" onClick={onReset} data-testid="roster-import-another">
      <RotateCcw className="w-3 h-3 mr-1" /> Import another file
    </Button>
  </div>
);

export const RosterImportPanel = ({ api, headers, onImported, title = 'Import your client roster' }) => {
  const fileRef = useRef(null);
  const s = useRosterImport({ api, headers, onImported });
  const canCommit = s.plan?.mapping_complete && s.plan.summary && (s.plan.summary.add > 0 || s.plan.summary.update_name > 0);

  return (
    <div className="glass-card p-5 mb-5" style={{ borderColor: 'rgba(var(--gold-rgb),0.35)' }} data-testid="roster-import-panel">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <h3 className="text-sm font-bold text-[var(--t)] flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-[var(--gold)]" /> {title}
        </h3>
        <button onClick={downloadTemplate} className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--gold)] hover:text-[var(--t)]" data-testid="roster-template-btn">
          <Download className="w-3 h-3" /> Blank template (.csv)
        </button>
      </div>

      {!s.plan && !s.result && <HowItWorks />}
      {s.result && <ResultCard result={s.result} onReset={s.reset} />}

      {!s.plan && !s.result && (
        <div
          className="rounded-xl p-6 text-center cursor-pointer transition-colors hover:border-[var(--gold)]"
          style={{ border: '2px dashed var(--b)', background: 'var(--s)' }}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); s.analyze(e.dataTransfer.files?.[0]); }}
          data-testid="roster-dropzone"
        >
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xlsm,.txt" className="hidden" onChange={e => { s.analyze(e.target.files?.[0]); e.target.value = ''; }} data-testid="roster-file-input" />
          {s.busy === 'analyze'
            ? <Loader2 className="w-6 h-6 animate-spin text-[var(--gold)] mx-auto" />
            : <Upload className="w-6 h-6 text-[var(--gold)] mx-auto" />}
          <p className="text-sm text-[var(--t)] mt-2 font-semibold">{s.busy === 'analyze' ? 'Reading your spreadsheet…' : 'Drop your spreadsheet here, or click to choose'}</p>
          <p className="text-xs text-[var(--t5)] mt-1">Excel (.xlsx) or CSV · up to 2,000 rows</p>
        </div>
      )}

      {s.plan && (
        <>
          <RosterMappingEditor key={s.plan.upload_id + s.plan.mapping_source} plan={s.plan} busy={s.busy} onRemap={s.remap} />
          {s.plan.mapping_complete && s.plan.summary && (
            <>
              <RosterSummary summary={s.plan.summary} />
              <RosterPreviewTable rows={s.plan.rows} notInUpload={s.plan.not_in_upload} />
              <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--s)', border: '1px solid var(--b)' }} data-testid="roster-invite-choice">
                <p className="text-sm font-bold text-[var(--t)] mb-2">Claim invitations for the {s.plan.summary.add} new client{s.plan.summary.add === 1 ? '' : 's'}</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  {[
                    { v: false, icon: Clock, label: 'Hold — I’ll send them myself', sub: 'Portals are created now; use Send Invite on each client when their documents are ready.' },
                    { v: true, icon: Send, label: 'Send now', sub: 'Each new client gets the branded claim email right away.' },
                  ].map(o => (
                    <button key={String(o.v)} onClick={() => s.setSendInvites(o.v)}
                      className="flex-1 text-left rounded-lg p-3 transition-colors"
                      style={s.sendInvites === o.v
                        ? { border: '1px solid var(--gold)', background: 'rgba(var(--gold-rgb),0.10)' }
                        : { border: '1px solid var(--b)' }}
                      data-testid={`roster-invites-${o.v ? 'now' : 'hold'}`}>
                      <span className="flex items-center gap-2 text-sm font-semibold text-[var(--t)]"><o.icon className="w-4 h-4 text-[var(--gold)]" /> {o.label}</span>
                      <span className="block text-xs text-[var(--t5)] mt-1">{o.sub}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <Button className="gold-button" disabled={!canCommit || s.busy === 'commit'} onClick={s.commit} data-testid="roster-commit-btn">
              {s.busy === 'commit' ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <>Add {s.plan.summary?.add || 0} client{s.plan.summary?.add === 1 ? '' : 's'}{s.plan.summary?.update_name ? ` · rename ${s.plan.summary.update_name}` : ''}</>
              )}
            </Button>
            <Button variant="outline" className="border-[var(--b)]" onClick={s.reset} data-testid="roster-cancel-btn">Choose a different file</Button>
          </div>
        </>
      )}

      <ImportHistory history={s.history} />
    </div>
  );
};

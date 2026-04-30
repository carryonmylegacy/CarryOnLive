import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { AlertTriangle, Loader2, Power, ImagePlus } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import { toast } from '../../utils/toast';
import { API_URL } from '../../config';

export const MaintenanceModeTab = ({ getAuthHeaders }) => {
  const [config, setConfig] = useState({ enabled: false, message: '', estimated_end: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [estimatedEnd, setEstimatedEnd] = useState('');

  const headers = getAuthHeaders()?.headers || {};

  const fetch_ = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/maintenance-mode`, { headers });
      setConfig(res.data);
      setMessage(res.data.message || 'CarryOn is undergoing scheduled maintenance. We\'ll be back shortly.');
      setEstimatedEnd(res.data.estimated_end || '');
    } catch { toast.error('Failed to load maintenance status'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch_(); }, []); // eslint-disable-line

  const toggle = async (newEnabled) => {
    setSaving(true);
    try {
      await axios.put(`${API_URL}/admin/maintenance-mode`, {
        enabled: newEnabled,
        message,
        estimated_end: estimatedEnd || null,
      }, { headers: { ...headers, 'Content-Type': 'application/json' } });
      toast.success(newEnabled ? 'Maintenance mode ENABLED' : 'Maintenance mode disabled');
      fetch_();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to toggle'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-[var(--t4)]" /></div>;

  return (
    <div className="space-y-4" data-testid="maintenance-mode-tab">
      <h2 className="text-lg font-bold text-[var(--t)]">Platform Maintenance Mode</h2>

      <Card className="glass-card" style={config.enabled ? { border: '2px solid #ef4444' } : {}}>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                config.enabled ? 'bg-red-500/10 border border-red-500/30' : 'bg-[var(--s)] border border-[var(--b)]'
              }`}>
                <Power className={`w-5 h-5 ${config.enabled ? 'text-red-500' : 'text-[var(--t5)]'}`} />
              </div>
              <div>
                <p className="text-sm font-bold text-[var(--t)]">
                  {config.enabled ? 'Maintenance Mode is ACTIVE' : 'Platform is Online'}
                </p>
                <p className="text-[11px] text-[var(--t5)]">
                  {config.enabled ? 'Users will see a maintenance message' : 'All users can access the platform normally'}
                </p>
              </div>
            </div>
            <Switch
              checked={config.enabled}
              onCheckedChange={toggle}
              disabled={saving}
              data-testid="maintenance-toggle"
            />
          </div>

          {config.enabled && (
            <div className="p-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <div className="flex items-center gap-2 text-xs text-red-400">
                <AlertTriangle className="w-3 h-3" />
                <span className="font-bold">Users cannot access the platform while maintenance mode is active</span>
              </div>
              {config.enabled_at && (
                <p className="text-[11px] text-[var(--t5)] mt-1">Enabled at {new Date(config.enabled_at).toLocaleString()}</p>
              )}
            </div>
          )}

          <div className="space-y-3 pt-2">
            <div>
              <label className="text-xs text-[var(--t5)] mb-1 block">Maintenance Message</label>
              <Input
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Message shown to users..."
                className="text-sm"
                data-testid="maintenance-message"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--t5)] mb-1 block">Estimated End Time (optional)</label>
              <Input
                type="datetime-local"
                value={estimatedEnd}
                onChange={e => setEstimatedEnd(e.target.value)}
                className="text-sm"
                data-testid="maintenance-end-time"
              />
            </div>
            {!config.enabled && (
              <Button onClick={() => toggle(true)} disabled={saving} className="w-full text-sm font-bold" variant="destructive" data-testid="enable-maintenance-btn">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Power className="w-4 h-4 mr-2" />}
                Enable Maintenance Mode
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <ReprocessAvatarsCard headers={headers} />
    </div>
  );
};

// ────────────────────────────────────────────────────────────────
// One-off tool: re-crop every stored avatar using the face-aware
// pipeline in backend/services/photo_storage.py::_process_image.
// Scans first (counts reprocessable vs. needs_reupload), then
// confirms before overwriting the display images in object storage.
// Audit-logged. Founder-only on the backend.
// ────────────────────────────────────────────────────────────────
const ReprocessAvatarsCard = ({ headers }) => {
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  const doScan = async () => {
    setScanning(true); setResult(null);
    try {
      const res = await axios.get(`${API_URL}/admin/maintenance/reprocess-avatars/scan`, { headers });
      setScan(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Scan failed');
    } finally { setScanning(false); }
  };

  const doRun = async () => {
    if (!scan || scan.reprocessable === 0) return;
    if (!window.confirm(
      `Re-crop ${scan.reprocessable} avatar${scan.reprocessable === 1 ? '' : 's'}? ` +
      `This overwrites the display image with a new face-aware crop. ` +
      `Original source bytes are preserved. ${scan.needs_reupload > 0 ? `\n\n${scan.needs_reupload} older avatars lack a retained source and must be re-uploaded manually.` : ''}`
    )) return;
    setRunning(true);
    try {
      const res = await axios.post(`${API_URL}/admin/maintenance/reprocess-avatars`, {}, { headers });
      setResult(res.data);
      toast.success(`Reprocessed ${res.data.processed} avatars`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Reprocess failed');
    } finally { setRunning(false); }
  };

  return (
    <Card className="bg-[var(--bg2)] border-[var(--b)]" data-testid="reprocess-avatars-card">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <ImagePlus className="w-5 h-5 text-[var(--gold)] mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-[var(--t)]">Reprocess all avatars</h3>
            <p className="text-xs text-[var(--t4)] mt-0.5">
              Re-runs every stored avatar through the face-aware crop pipeline.
              Only avatars uploaded after Feb 2026 (which retain source bytes)
              can be reprocessed — older ones will be listed as needing a manual
              re-upload.
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={doScan} disabled={scanning || running} variant="outline" className="text-sm font-bold" data-testid="reprocess-avatars-scan-btn">
            {scanning ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Scan
          </Button>
          {scan && scan.reprocessable > 0 && (
            <Button onClick={doRun} disabled={running || scanning} className="text-sm font-bold gold-button" data-testid="reprocess-avatars-run-btn">
              {running ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Reprocess {scan.reprocessable}
            </Button>
          )}
        </div>

        {scan && (
          <div className="text-xs text-[var(--t3)] space-y-1" data-testid="reprocess-avatars-scan-result">
            <div><span className="font-bold text-[var(--t)]">{scan.total}</span> total avatars in storage</div>
            <div><span className="font-bold text-green-400">{scan.reprocessable}</span> reprocessable (source bytes retained)</div>
            <div><span className="font-bold text-amber-400">{scan.needs_reupload}</span> need manual re-upload (uploaded pre-backfill-patch)</div>
          </div>
        )}

        {result && (
          <div className="text-xs text-[var(--t3)] space-y-1 pt-2 border-t border-[var(--b)]" data-testid="reprocess-avatars-run-result">
            <div>Processed: <span className="font-bold text-green-400">{result.processed}</span></div>
            <div>Skipped (no original): <span className="font-bold text-amber-400">{result.skipped_no_original}</span></div>
            <div>Failed: <span className="font-bold text-red-400">{result.failed}</span></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Monitor, Smartphone, ExternalLink, RefreshCw } from 'lucide-react';
import { PREVIEW_MSG, PREVIEW_READY_MSG } from '../../../copy/CopyContext';

const PHONE_WIDTH = 390;

/** Right-hand drawer: the live page in a same-origin frame with unsaved edits pushed in as you type. */
export const SiteCopyPreview = ({ page, overrides, onClose }) => {
  const paths = page.previewPaths || [page.path];
  const [path, setPath] = useState(paths[0]);
  const [device, setDevice] = useState('desktop');
  const [ready, setReady] = useState(false);
  const [nonce, setNonce] = useState(0);
  const frame = useRef(null);

  useEffect(() => { setPath(paths[0]); setReady(false); }, [page.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const push = useCallback(() => {
    frame.current?.contentWindow?.postMessage({ type: PREVIEW_MSG, overrides }, window.location.origin);
  }, [overrides]);

  useEffect(() => {
    const onMessage = (e) => {
      if (e.origin !== window.location.origin || e.data?.type !== PREVIEW_READY_MSG || e.source !== frame.current?.contentWindow) return;
      setReady(true);
      push();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [push]);

  useEffect(() => { if (ready) { const id = setTimeout(push, 120); return () => clearTimeout(id); } return undefined; }, [ready, push]);

  const src = `${path}${path.includes('?') ? '&' : '?'}copyPreview=1&n=${nonce}`;
  return (
    <aside className="fixed inset-y-0 right-0 z-[120] flex flex-col w-full lg:w-[58vw] xl:w-[52vw]" style={{ background: 'var(--bg)', borderLeft: '1px solid var(--b2)', boxShadow: '-24px 0 60px rgba(0,0,0,0.45)', paddingTop: 'env(safe-area-inset-top, 0px)' }} data-testid="site-copy-preview">
      <div className="flex items-center gap-2 px-3 py-2 flex-wrap" style={{ borderBottom: '1px solid var(--b)' }}>
        <span className="text-xs font-bold text-[var(--gold)] uppercase tracking-wider">Preview</span>
        <span className="text-xs font-bold text-[var(--t4)]" data-testid="site-copy-preview-status">{ready ? 'live — unsaved edits shown' : 'loading…'}</span>
        {paths.length > 1 && (
          <select value={path} onChange={e => { setPath(e.target.value); setReady(false); }} className="ml-2 text-xs font-bold rounded-md px-2 py-1 bg-[var(--b)] text-[var(--t)] border border-[var(--b2)]" data-testid="site-copy-preview-path">
            {paths.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => setDevice('desktop')} className={`p-1.5 rounded-md ${device === 'desktop' ? 'text-[var(--gold)] bg-[var(--b)]' : 'text-[var(--t4)]'}`} title="Desktop width" data-testid="site-copy-preview-desktop"><Monitor className="w-4 h-4" /></button>
          <button type="button" onClick={() => setDevice('phone')} className={`p-1.5 rounded-md ${device === 'phone' ? 'text-[var(--gold)] bg-[var(--b)]' : 'text-[var(--t4)]'}`} title="Phone width" data-testid="site-copy-preview-phone"><Smartphone className="w-4 h-4" /></button>
          <button type="button" onClick={() => { setReady(false); setNonce(n => n + 1); }} className="p-1.5 rounded-md text-[var(--t4)] hover:text-[var(--t)]" title="Reload" data-testid="site-copy-preview-reload"><RefreshCw className="w-4 h-4" /></button>
          <a href={path} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-md text-[var(--t4)] hover:text-[var(--t)]" title="Open the live page (saved text only)" data-testid="site-copy-preview-open"><ExternalLink className="w-4 h-4" /></a>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md text-[var(--t4)] hover:text-[var(--t)]" title="Close preview" data-testid="site-copy-preview-close"><X className="w-5 h-5" /></button>
        </div>
      </div>
      <div className="flex-1 min-h-0 flex justify-center" style={{ background: '#05080f' }}>
        <iframe ref={frame} key={`${path}-${nonce}`} src={src} title={`Preview of ${path}`} className="h-full border-0 bg-white"
          style={{ width: device === 'phone' ? PHONE_WIDTH : '100%', maxWidth: '100%' }} data-testid="site-copy-preview-frame" />
      </div>
    </aside>
  );
};

export default SiteCopyPreview;

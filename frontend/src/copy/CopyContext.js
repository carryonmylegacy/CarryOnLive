import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import apiClient from '../utils/apiClient';
import { API_URL } from '../config';
import { COPY_DEFAULTS } from './siteCopy';

const CACHE_KEY = 'carryon_site_copy_v2';
const NO_FLAGS = { guides_launched: false, guides_launched_at: null };
export const PREVIEW_MSG = 'carryon:copy-preview';
export const PREVIEW_READY_MSG = 'carryon:copy-preview-ready';

/* Preview mode: the page is framed by the Site Copy editor (same origin) and receives unsaved edits via postMessage. */
const isPreviewFrame = () => {
  try { return window.self !== window.top && new URLSearchParams(window.location.search).has('copyPreview'); } catch { return false; }
};

const readCache = () => {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') || {}; } catch { return {}; }
};
const writeCache = (overrides, flags) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ overrides, flags })); } catch { /* storage full or blocked */ }
};

export const fillVars = (text, vars) => (
  vars ? String(text).replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m)) : text
);

const CopyContext = createContext({
  overrides: {}, flags: NO_FLAGS, loaded: false, ensureLoaded: () => {}, applyOverrides: () => {},
  t: (key, vars) => fillVars(COPY_DEFAULTS[key] ?? '', vars),
});

/** Founder-editable site copy: overrides fetched lazily (first useCopy call), defaults render instantly. */
export const CopyProvider = ({ children }) => {
  const preview = useRef(isPreviewFrame()).current;
  const cached = useRef(preview ? {} : readCache()).current;
  const [overrides, setOverrides] = useState(cached.overrides || {});
  const [flags, setFlags] = useState({ ...NO_FLAGS, ...(cached.flags || {}) });
  const [loaded, setLoaded] = useState(false);
  const started = useRef(false);

  const ensureLoaded = useCallback(() => {
    if (started.current || preview) return;
    started.current = true;
    apiClient.get(`${API_URL}/public/site-copy`).then(r => {
      const next = r.data?.overrides || {};
      const nextFlags = { ...NO_FLAGS, ...(r.data?.flags || {}) };
      setOverrides(next);
      setFlags(nextFlags);
      writeCache(next, nextFlags);
    }).catch(() => {}).finally(() => setLoaded(true));
  }, [preview]);

  useEffect(() => {
    if (!preview) return undefined;
    const onMessage = (e) => {
      if (e.origin !== window.location.origin || e.data?.type !== PREVIEW_MSG) return;
      setOverrides(e.data.overrides || {});
      if (e.data.flags) setFlags(f => ({ ...f, ...e.data.flags }));
      setLoaded(true);
    };
    window.addEventListener('message', onMessage);
    window.parent.postMessage({ type: PREVIEW_READY_MSG }, window.location.origin);
    return () => window.removeEventListener('message', onMessage);
  }, [preview]);

  const applyOverrides = useCallback((next) => { setOverrides(next); if (!preview) writeCache(next, flags); }, [preview, flags]);
  const applyFlags = useCallback((next) => { setFlags(f => { const merged = { ...f, ...next }; if (!preview) writeCache(overrides, merged); return merged; }); }, [preview, overrides]);

  const value = useMemo(() => ({
    overrides, flags, loaded, ensureLoaded, applyOverrides, applyFlags, preview,
    t: (key, vars) => {
      const raw = overrides[key];
      return fillVars(raw !== undefined && raw !== '' ? raw : (COPY_DEFAULTS[key] ?? ''), vars);
    },
  }), [overrides, flags, loaded, ensureLoaded, applyOverrides, applyFlags, preview]);

  return <CopyContext.Provider value={value}>{children}</CopyContext.Provider>;
};

export const useCopy = () => {
  const ctx = useContext(CopyContext);
  useEffect(() => { ctx.ensureLoaded(); }, [ctx]);
  return ctx;
};

const EMAIL_RE = /([\w.+-]+@[\w-]+\.[\w.-]+\w)/g;
const EMAIL_TEST = /^[\w.+-]+@[\w-]+\.[\w.-]+\w$/;

/* One line → inline nodes: **bold** and (when linkClass is given) e-mail addresses as mailto links. */
const renderInline = (line, li, strongClass, linkClass) => (
  line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).flatMap((part, pi) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${li}-${pi}`} className={strongClass}>{part.slice(2, -2)}</strong>;
    }
    if (!linkClass) return part;
    return part.split(EMAIL_RE).filter(Boolean).map((seg, si) => (
      EMAIL_TEST.test(seg)
        ? <a key={`${li}-${pi}-${si}`} href={`mailto:${seg}`} className={linkClass}>{seg}</a>
        : seg
    ));
  })
);

/** Plain text → React nodes. Line breaks become <br/>; **word** becomes <strong>. Never HTML. */
export const renderCopy = (text, strongClass, linkClass) => {
  const lines = String(text ?? '').split('\n');
  return lines.flatMap((line, li) => {
    const parts = renderInline(line, li, strongClass, linkClass);
    return li < lines.length - 1 ? [...parts, <br key={`br-${li}`} />] : parts;
  });
};

/** "One item per line" field → array of trimmed, non-empty lines (leading "- " allowed). */
export const copyList = (text) => String(text ?? '').split('\n').map(l => l.replace(/^-\s+/, '').trim()).filter(Boolean);

/** Body text → paragraphs; consecutive lines starting with "- " become one bulleted list. */
export const renderBlocks = (text, { pClass = '', ulClass = '', liClass = '', strongClass, linkClass } = {}) => {
  const blocks = [];
  let list = null;
  String(text ?? '').split('\n').forEach((raw) => {
    const line = raw.trim();
    if (!line) { list = null; return; }
    if (/^-\s+/.test(line)) {
      if (!list) { list = []; blocks.push({ type: 'ul', items: list }); }
      list.push(line.replace(/^-\s+/, ''));
    } else {
      list = null;
      blocks.push({ type: 'p', text: line });
    }
  });
  return blocks.map((b, i) => (
    b.type === 'ul'
      ? <ul key={i} className={ulClass}>{b.items.map((item, j) => <li key={j} className={liClass}>{renderInline(item, `${i}-${j}`, strongClass, linkClass)}</li>)}</ul>
      : <p key={i} className={pClass}>{renderInline(b.text, i, strongClass, linkClass)}</p>
  ));
};

/** <CopyText k="home.hero.sub" /> — renders one registry field with line breaks + **bold**. */
export const CopyText = ({ k, vars, strongClass, linkClass }) => {
  const { t } = useCopy();
  return <>{renderCopy(t(k, vars), strongClass, linkClass)}</>;
};

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import apiClient from '../utils/apiClient';
import { API_URL } from '../config';
import { COPY_DEFAULTS } from './siteCopy';

const CACHE_KEY = 'carryon_site_copy_v1';

const readCache = () => {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') || {}; } catch { return {}; }
};
const writeCache = (overrides) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(overrides)); } catch { /* storage full or blocked */ }
};

export const fillVars = (text, vars) => (
  vars ? String(text).replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m)) : text
);

const CopyContext = createContext({
  overrides: {}, loaded: false, ensureLoaded: () => {}, applyOverrides: () => {},
  t: (key, vars) => fillVars(COPY_DEFAULTS[key] ?? '', vars),
});

/** Founder-editable site copy: overrides fetched lazily (first useCopy call), defaults render instantly. */
export const CopyProvider = ({ children }) => {
  const [overrides, setOverrides] = useState(readCache);
  const [loaded, setLoaded] = useState(false);
  const started = useRef(false);

  const ensureLoaded = useCallback(() => {
    if (started.current) return;
    started.current = true;
    apiClient.get(`${API_URL}/public/site-copy`).then(r => {
      const next = r.data?.overrides || {};
      setOverrides(next);
      writeCache(next);
    }).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  const applyOverrides = useCallback((next) => { setOverrides(next); writeCache(next); }, []);

  const value = useMemo(() => ({
    overrides, loaded, ensureLoaded, applyOverrides,
    t: (key, vars) => {
      const raw = overrides[key];
      return fillVars(raw !== undefined && raw !== '' ? raw : (COPY_DEFAULTS[key] ?? ''), vars);
    },
  }), [overrides, loaded, ensureLoaded, applyOverrides]);

  return <CopyContext.Provider value={value}>{children}</CopyContext.Provider>;
};

export const useCopy = () => {
  const ctx = useContext(CopyContext);
  useEffect(() => { ctx.ensureLoaded(); }, [ctx]);
  return ctx;
};

/** Plain text → React nodes. Line breaks become <br/>; **word** becomes <strong>. Never HTML. */
export const renderCopy = (text, strongClass) => {
  const lines = String(text ?? '').split('\n');
  return lines.flatMap((line, li) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, pi) => (
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={`${li}-${pi}`} className={strongClass}>{part.slice(2, -2)}</strong>
        : part
    ));
    return li < lines.length - 1 ? [...parts, <br key={`br-${li}`} />] : parts;
  });
};

/** <CopyText k="home.hero.sub" /> — renders one registry field with line breaks + **bold**. */
export const CopyText = ({ k, vars, strongClass }) => {
  const { t } = useCopy();
  return <>{renderCopy(t(k, vars), strongClass)}</>;
};

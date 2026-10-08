import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useDictation, DICTATION_ENGINES } from '../../hooks/useDictation';
import { DictationEngineChooser } from './DictationEngineChooser';

/**
 * Headless dictation control. Every mic in CarryOn goes through here so the subscriber's one
 * choice (Settings → Dictation) applies everywhere. First tap with no choice → chooser modal.
 * children({ supported, listening, transcribing, error, engine, tap, label })
 */
export const DictationControl = ({ value, onText, keyterms, onState, children }) => {
  const { user, getAuthHeaders } = useAuth();
  const engine = user?.dictation_engine || null;
  const [chooserOpen, setChooserOpen] = useState(false);
  const stableOnText = useCallback((t) => onText(t), [onText]);
  const dictation = useDictation({ engine: engine || 'private', onText: stableOnText, keyterms, authHeaders: getAuthHeaders() });

  const onStateRef = useRef(onState);
  onStateRef.current = onState;
  useEffect(() => { onStateRef.current?.({ listening: dictation.listening, transcribing: dictation.transcribing, error: dictation.error, engine }); }, [dictation.listening, dictation.transcribing, dictation.error, engine]);

  const tap = () => {
    if (dictation.listening) { dictation.stop(); return; }
    if (dictation.transcribing) return;
    if (!engine) { setChooserOpen(true); return; }
    dictation.start(value);
  };
  const label = dictation.listening ? 'Stop dictating' : dictation.transcribing ? 'Transcribing…' : `Dictate (${DICTATION_ENGINES[engine || 'private'].short})`;

  return (
    <>
      {children({ supported: dictation.supported, listening: dictation.listening, transcribing: dictation.transcribing, error: dictation.error, engine, tap, label })}
      <DictationEngineChooser open={chooserOpen} onClose={() => setChooserOpen(false)} />
    </>
  );
};

// Default round mic (used by the AI Builder shell). Renders nothing when no engine can run here.
export const DictationMicButton = ({ value, onText, keyterms, testId = 'dictation-mic', onState, className = '' }) => (
  <DictationControl value={value} onText={onText} keyterms={keyterms} onState={onState}>
    {({ supported, listening, transcribing, tap, label }) => supported && (
      <button type="button" onClick={tap} disabled={transcribing} aria-pressed={listening} aria-label={label} title={label}
        className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors disabled:opacity-70 ${listening ? 'text-[#0b1120]' : 'text-[var(--t3)] hover:text-[var(--t)]'} ${className}`}
        style={listening ? { background: '#ef4444', boxShadow: '0 0 0 6px rgba(239,68,68,0.25)' } : { background: 'var(--s)', border: '1px solid var(--b)' }}
        data-testid={testId}>
        {listening ? <Square className="w-3.5 h-3.5 fill-current" /> : transcribing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
      </button>
    )}
  </DictationControl>
);

export default DictationMicButton;

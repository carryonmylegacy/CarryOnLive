import { useCallback, useEffect, useRef, useState } from 'react';
import apiClient from '../utils/apiClient';
import { API_URL } from '../config';
import { encodeWav } from '../utils/wavEncoder';

export const DICTATION_ENGINES = {
  private: {
    id: 'private',
    label: 'CarryOn Private Dictation',
    short: 'Private (xAI)',
    blurb: 'Your voice is sent only to CarryOn and transcribed on our zero-data-retention xAI account — the same vendor and terms as every other CarryOn AI feature. The audio is discarded the moment the text comes back; nothing is stored. Text appears when you pause the mic.',
    tradeoff: 'Not live — the words show up a second or two after you stop.',
  },
  device: {
    id: 'device',
    label: 'Device dictation',
    short: 'Device (Apple / Google)',
    blurb: 'Uses the speech recognition built into your phone or browser — Apple on iPhone, iPad and Mac, Google on Chrome and Android — the same engine as your keyboard’s mic. Words appear live as you speak. Your audio is processed by that vendor under their privacy terms, not CarryOn’s; CarryOn only ever receives the finished text.',
    tradeoff: 'Live transcript, but Apple / Google handle the audio.',
  },
};

const MAX_SECONDS = 300;
const deviceSupported = () => typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
const privateSupported = () => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof (window.AudioContext || window.webkitAudioContext) === 'function';

// One hook, two engines. `engine` is the subscriber's saved choice ('private' | 'device' | null = not chosen yet).
export function useDictation({ engine, onText, keyterms = [], authHeaders }) {
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState(null);
  const baseRef = useRef('');
  const recognitionRef = useRef(null);
  const recRef = useRef(null); // { stream, ctx, node, chunks, rate, timer }

  const supported = engine === 'device' ? deviceSupported() : engine === 'private' ? privateSupported() : (deviceSupported() || privateSupported());

  const stopDevice = useCallback(() => { recognitionRef.current?.stop(); recognitionRef.current = null; }, []);

  const teardownPrivate = useCallback(() => {
    const r = recRef.current;
    if (!r) return null;
    clearTimeout(r.timer);
    try { r.node.disconnect(); r.source.disconnect(); } catch { /* already gone */ }
    r.stream.getTracks().forEach((t) => t.stop());
    r.ctx.close().catch(() => {});
    recRef.current = null;
    return r;
  }, []);

  const stop = useCallback(async () => {
    setListening(false);
    if (engine === 'device') { stopDevice(); return; }
    const r = teardownPrivate();
    if (!r || !r.chunks.length) return;
    setTranscribing(true);
    try {
      const wav = encodeWav(r.chunks, r.rate);
      const form = new FormData();
      form.append('keyterms', keyterms.join(','));
      form.append('file', wav, 'dictation.wav');
      const res = await apiClient.post(`${API_URL}/ai/transcribe`, form, { ...(authHeaders || {}), timeout: 120000 });
      const text = (res.data?.text || '').trim();
      if (text) {
        const sep = baseRef.current && !/\s$/.test(baseRef.current) ? ' ' : '';
        onText(baseRef.current + sep + text);
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not transcribe that — please try again or type instead.');
    } finally {
      setTranscribing(false);
    }
  }, [engine, stopDevice, teardownPrivate, keyterms, authHeaders, onText]);

  const startDevice = useCallback((currentValue) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    baseRef.current = currentValue || '';
    let finalText = '';
    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalText += (finalText ? ' ' : '') + event.results[i][0].transcript;
        else interim += event.results[i][0].transcript;
      }
      const sep = baseRef.current && !/\s$/.test(baseRef.current) ? ' ' : '';
      onText(baseRef.current + sep + finalText + (interim ? ' ' + interim : ''));
    };
    recognition.onerror = (e) => { setListening(false); if (e.error !== 'aborted' && e.error !== 'no-speech') setError('Device dictation stopped — tap the mic to try again.'); };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [onText]);

  const startPrivate = useCallback(async (currentValue) => {
    baseRef.current = currentValue || '';
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    await ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    node.onaudioprocess = (e) => { chunks.push(new Float32Array(e.inputBuffer.getChannelData(0))); };
    source.connect(node);
    node.connect(ctx.destination);
    const rec = { stream, ctx, source, node, chunks, rate: ctx.sampleRate, timer: null };
    rec.timer = setTimeout(() => { stop(); }, MAX_SECONDS * 1000);
    recRef.current = rec;
    setListening(true);
  }, [stop]);

  const start = useCallback(async (currentValue) => {
    setError(null);
    try {
      if (engine === 'device') startDevice(currentValue);
      else await startPrivate(currentValue);
    } catch (err) {
      setListening(false);
      setError(err?.name === 'NotAllowedError' ? 'Microphone access was blocked — allow the mic for CarryOn in your browser settings, or type instead.' : 'Could not start the microphone. You can type instead.');
    }
  }, [engine, startDevice, startPrivate]);

  useEffect(() => () => { stopDevice(); teardownPrivate(); }, [stopDevice, teardownPrivate]);

  return { supported, listening, transcribing, error, start, stop, clearError: () => setError(null) };
}

export default useDictation;

import { useCallback, useEffect, useRef, useState } from 'react';

// Web Speech API dictation (same recipe as the Estate Guardian). `supported` is false on
// browsers without it — the phone keyboard's own mic still dictates into any textarea.
export function useSpeechInput(onText) {
  const recognitionRef = useRef(null);
  const baseRef = useRef('');
  const [listening, setListening] = useState(false);
  const SpeechRecognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback((currentValue) => {
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
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
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [SpeechRecognition, onText]);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  return { supported: Boolean(SpeechRecognition), listening, start, stop };
}

export default useSpeechInput;

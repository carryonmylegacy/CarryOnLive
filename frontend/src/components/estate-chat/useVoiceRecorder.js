import { useState, useRef } from 'react';

/**
 * Voice Recorder hook for ECT chat.
 * Returns: { recording, duration, start, stop, cancel }
 */
export default function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
      const options = mimeType ? { mimeType } : {};
      const mr = new MediaRecorder(stream, options);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start(200);
      mediaRecorderRef.current = mr;
      setRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } catch {
      // permission denied or unavailable
    }
  };

  const stop = () => {
    return new Promise((resolve) => {
      const mr = mediaRecorderRef.current;
      if (!mr || mr.state === 'inactive') { resolve(null); return; }
      clearInterval(timerRef.current);
      mr.onstop = () => {
        const mimeType = mr.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        mr.stream.getTracks().forEach(t => t.stop());
        setRecording(false);
        setDuration(0);
        resolve(blob);
      };
      mr.stop();
    });
  };

  const cancel = () => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== 'inactive') {
      clearInterval(timerRef.current);
      mr.stream.getTracks().forEach(t => t.stop());
      mr.stop();
    }
    setRecording(false);
    setDuration(0);
    chunksRef.current = [];
  };

  return { recording, duration, start, stop, cancel };
}

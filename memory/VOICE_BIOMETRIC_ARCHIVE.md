# Voice Biometric Security Feature — Archive

Archived on 2026-03-22. This file contains the complete voice biometric implementation
for the Section Security (Triple Lock) system. It can be used to re-implement the feature
at a later date.

---

## Backend: Voice Biometric Service (`/app/backend/services/voice_biometrics.py`)

The full voice biometric engine is still present at `/app/backend/services/voice_biometrics.py`.
It includes:
- `extract_voiceprint()` — Multi-feature ~130-dim voiceprint extraction using librosa
- `assess_audio_quality()` — Audio quality scoring (SNR, RMS, clipping, duration)
- `compute_enrollment_model()` — Multi-sample enrollment averaging + consistency
- `verify_voiceprint()` — Multi-metric verification (cosine + euclidean + pearson)
- `match_passphrase()` — Sequence-based passphrase matching via difflib
- `is_outlier_sample()` — Outlier rejection for enrollment
- `extract_voiceprint_legacy()` / `compare_voiceprints_legacy()` — Backward compatibility

**Dependencies:** librosa, scipy, numpy, ffmpeg (system)

---

## Backend: Voice Enrollment Endpoint (was in `/app/backend/routes/security.py`)

```python
@router.post("/security/voice/enroll/{section_id}")
async def enroll_voiceprint_endpoint(
    section_id: str,
    passphrase: str = Form(...),
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Enroll voice biometric for a section — enhanced multi-feature voiceprint"""
    if section_id not in LOCKABLE_SECTIONS:
        raise HTTPException(status_code=400, detail=f"Invalid section: {section_id}")

    content = await file.read()
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large")
    if len(content) < 1000:
        raise HTTPException(
            status_code=400,
            detail="Recording too short — please hold the button for at least 2 seconds.",
        )

    import tempfile as tf
    suffix = "." + (file.filename or "audio.webm").split(".")[-1]
    logger.info(f"Voice enroll: received {len(content)} bytes, filename={file.filename}, suffix={suffix}")
    with tf.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    wav_path = tmp_path + ".wav"
    try:
        result = await asyncio.to_thread(
            subprocess.run,
            ["ffmpeg", "-y", "-i", tmp_path, "-ar", "16000", "-ac", "1", "-f", "wav", wav_path],
            capture_output=True, timeout=30,
        )
        if result.returncode != 0:
            logger.error(f"ffmpeg failed: {result.stderr.decode()[:500]}")
            raise HTTPException(status_code=400, detail="Could not process audio file.")

        with open(wav_path, "rb") as f:
            wav_bytes = f.read()

        extraction = await asyncio.to_thread(extract_voiceprint, wav_bytes)
        if extraction is None or extraction.get("failed_quality"):
            raise HTTPException(status_code=400, detail="Voice quality check failed.")

        new_voiceprint = extraction["voiceprint"]
        quality = extraction["quality"]

        existing = await db.section_security.find_one(
            {"user_id": current_user["id"], "section_id": section_id},
            {"_id": 0, "voiceprint_samples": 1, "voiceprint_version": 1},
        )

        samples = []
        if existing and existing.get("voiceprint_version") == "v2":
            samples = existing.get("voiceprint_samples", [])

        if samples and is_outlier_sample(new_voiceprint, samples):
            raise HTTPException(status_code=400, detail="Voice sample too different from enrollment.")

        samples.append(new_voiceprint)
        if len(samples) > 5:
            samples = samples[-5:]

        model = compute_enrollment_model(samples)

        await db.section_security.update_one(
            {"user_id": current_user["id"], "section_id": section_id},
            {"$set": {
                "voiceprint": model["voiceprint"],
                "voiceprint_samples": samples,
                "voiceprint_version": "v2",
                "voiceprint_dimension": extraction["dimension"],
                "enrollment_consistency": model["consistency"],
                "voice_passphrase": passphrase.strip(),
                "voice_enabled": True,
                "voice_enrolled_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True,
        )

        sample_count = len(samples)
        return {
            "success": True,
            "samples_recorded": sample_count,
            "enrollment_consistency": model["consistency"],
            "audio_quality": quality,
            "message": f"Voice enrolled. {sample_count} samples recorded.",
        }
    finally:
        if Path(tmp_path).exists(): Path(tmp_path).unlink()
        if Path(wav_path).exists(): Path(wav_path).unlink()
```

---

## Backend: Voice Verification (was part of verify_section_security)

```python
# Layer 2: Voice biometric (enhanced multi-metric)
if settings.get("voice_enabled") and settings.get("voiceprint"):
    if not voice_file:
        raise HTTPException(status_code=400, detail="Voice verification required")

    content = await voice_file.read()
    import tempfile as tf
    suffix = "." + (voice_file.filename or "audio.webm").split(".")[-1]
    with tf.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    wav_path = tmp_path + ".wav"
    try:
        await asyncio.to_thread(subprocess.run,
            ["ffmpeg", "-y", "-i", tmp_path, "-ar", "16000", "-ac", "1", "-f", "wav", wav_path],
            capture_output=True, timeout=30,
        )
        with open(wav_path, "rb") as f:
            wav_bytes = f.read()

        is_v2 = settings.get("voiceprint_version") == "v2"
        if is_v2:
            extraction = await asyncio.to_thread(extract_voiceprint, wav_bytes)
            # ... multi-metric verification with verify_voiceprint()
        else:
            # Legacy 60-dim comparison
            test_vp = await asyncio.to_thread(extract_voiceprint_legacy, wav_bytes)
            similarity, is_match = compare_voiceprints_legacy(settings["voiceprint"], test_vp)

        # Also verify passphrase via Whisper if available
        # ... OpenAI STT integration for text matching
    finally:
        cleanup temp files
```

---

## Frontend: Voice Enrollment UI (was in SecuritySettings.js SectionConfig)

```jsx
// Step 1: Request mic permission
const handleMicPermission = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());
    setMicGranted(true);
  } catch {
    toast.error('Microphone access denied');
  }
};

// Step 2: Start recording
const handleStartRecording = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  let mimeType = '';
  for (const type of ['audio/webm', 'audio/mp4', 'audio/ogg', '']) {
    if (!type || MediaRecorder.isTypeSupported(type)) { mimeType = type; break; }
  }
  const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
  // ... ondataavailable, onstop handlers
  mediaRecorder.start();
};

// Step 3: Stop recording
const handleVoiceStop = () => {
  if (mediaRecorderRef.current && recording) {
    mediaRecorderRef.current.stop();
  }
};
```

---

## Frontend: Voice Verification UI (was in SectionLock.js UnlockModal)

```jsx
// Voice step in unlock modal
{currentStep === 'voice' && (
  <div className="space-y-4">
    {s?.voice_passphrase && (
      <div className="text-center text-xs text-[var(--t4)]">
        Speak your passphrase: <span className="font-bold">"{s.voice_passphrase}"</span>
      </div>
    )}
    <div className="text-center p-6 rounded-xl" style={{ background: 'var(--s)' }}>
      <div onClick={recording ? handleStopRecording : handleVoiceRecord}
        className="w-16 h-16 rounded-full mx-auto cursor-pointer"
        style={{ background: recording ? 'rgba(240,82,82,0.2)' : 'rgba(59,123,247,0.12)' }}>
        {recording ? <Square /> : <Mic />}
      </div>
    </div>
  </div>
)}
```

---

## DB Schema Fields (in `section_security` collection)

```
voice_enabled: Boolean
voiceprint: Array[Float]        — averaged enrollment model
voiceprint_samples: Array[Array[Float]]  — raw enrollment samples (up to 5)
voiceprint_version: "v2"
voiceprint_dimension: Integer   — ~130
enrollment_consistency: Float   — pairwise similarity score
voice_passphrase: String        — the phrase user speaks
voice_enrolled_at: ISO datetime
```

---

## Key Technical Notes for Re-implementation

1. **iOS Safari**: Does not support `audio/webm`. Must use `audio/mp4` fallback.
2. **3-Step UX**: Permission → Record → Stop (prevents immediate recording on iOS).
3. **Quality Thresholds**: MIN_SNR_DB=3.0, MIN_RMS_ENERGY=0.001 (tuned for mobile).
4. **ffmpeg**: Required system dependency for audio format conversion.
5. **React Portals**: All modals must use `createPortal(... document.body)` for iOS.
6. **Input font size**: Must be 16px+ to prevent iOS auto-zoom.

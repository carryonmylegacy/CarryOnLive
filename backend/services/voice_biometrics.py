"""
CarryOn™ Enhanced Voice Biometric Engine
=========================================
Multi-feature voiceprint extraction, quality-aware enrollment,
and multi-metric verification — all built on librosa + scipy + numpy.

Replaces the basic MFCC-only approach with a ~130-dimension voiceprint
combining spectral, temporal, pitch, and energy features.
"""

import difflib
import io
import logging

import librosa
import numpy as np
from scipy.spatial.distance import cosine as cosine_distance
from scipy.stats import pearsonr

logger = logging.getLogger(__name__)

# ======================== CONSTANTS ========================

SAMPLE_RATE = 16000
MIN_DURATION_SEC = 1.0  # Minimum useful audio length
MAX_ENROLLMENT_SAMPLES = 5  # Keep last N enrollment samples
MIN_SAMPLES_FOR_ENROLLED = 1  # Minimum samples to count as enrolled
PRE_EMPHASIS_COEFF = 0.97

# Verification thresholds
DEFAULT_THRESHOLD = 0.78  # Combined confidence threshold
HIGH_CONFIDENCE_THRESHOLD = 0.88
LOW_CONFIDENCE_THRESHOLD = 0.70

# Quality thresholds
MIN_SNR_DB = 6.0  # Minimum signal-to-noise ratio
MAX_CLIPPING_RATIO = 0.02  # Max fraction of clipped samples
MIN_RMS_ENERGY = 0.005  # Minimum RMS to consider non-silent

# Passphrase matching
PASSPHRASE_THRESHOLD = 0.65  # difflib sequence match ratio

# ======================== AUDIO PREPROCESSING ========================


def preprocess_audio(audio: np.ndarray, sr: int) -> np.ndarray:
    """Clean up raw audio: trim silence, apply pre-emphasis."""
    # Trim leading/trailing silence
    audio_trimmed, _ = librosa.effects.trim(audio, top_db=25)

    # If trimming removed too much, fall back to original
    if len(audio_trimmed) < sr * MIN_DURATION_SEC * 0.5:
        audio_trimmed = audio

    # Pre-emphasis filter (boosts high-frequency formant detail)
    audio_emph = np.append(audio_trimmed[0], audio_trimmed[1:] - PRE_EMPHASIS_COEFF * audio_trimmed[:-1])

    return audio_emph


def assess_audio_quality(audio: np.ndarray, sr: int) -> dict:
    """
    Score audio quality for biometric use.
    Returns dict with quality metrics and an overall pass/fail + score.
    """
    duration = len(audio) / sr
    rms = float(np.sqrt(np.mean(audio**2)))

    # Clipping detection (samples near ±1.0)
    clipped = np.sum(np.abs(audio) > 0.98) / len(audio)

    # Estimate SNR: signal energy vs. lowest-energy frame
    frame_len = int(0.025 * sr)
    hop = int(0.010 * sr)
    frames = librosa.util.frame(audio, frame_length=frame_len, hop_length=hop)
    frame_energies = np.mean(frames**2, axis=0)

    if len(frame_energies) > 4:
        # Noise floor = bottom 10th percentile of frame energies
        noise_floor = np.percentile(frame_energies, 10)
        signal_energy = np.mean(frame_energies)
        if noise_floor > 0:
            snr_db = float(10 * np.log10(signal_energy / noise_floor))
        else:
            snr_db = 40.0  # Very clean signal
    else:
        snr_db = 20.0  # Can't estimate, assume OK

    # Quality scoring (0–1)
    issues = []
    score = 1.0

    if duration < MIN_DURATION_SEC:
        issues.append(f"Too short ({duration:.1f}s, need {MIN_DURATION_SEC}s+)")
        score -= 0.4

    if rms < MIN_RMS_ENERGY:
        issues.append("Audio too quiet")
        score -= 0.3

    if clipped > MAX_CLIPPING_RATIO:
        issues.append(f"Audio clipping detected ({clipped * 100:.1f}%)")
        score -= 0.2

    if snr_db < MIN_SNR_DB:
        issues.append(f"Noisy recording (SNR {snr_db:.1f} dB)")
        score -= 0.2

    score = max(0.0, min(1.0, score))
    passed = score >= 0.5

    return {
        "passed": passed,
        "score": round(score, 2),
        "duration_sec": round(duration, 2),
        "rms_energy": round(rms, 5),
        "snr_db": round(snr_db, 1),
        "clipping_ratio": round(clipped, 4),
        "issues": issues,
    }


# ======================== FEATURE EXTRACTION ========================


def extract_voiceprint(audio_bytes: bytes) -> dict | None:
    """
    Extract a rich ~130-dimension voiceprint from audio bytes.
    Returns dict with feature vector, quality info, and metadata.
    Returns None if extraction fails.
    """
    try:
        audio, sr = librosa.load(io.BytesIO(audio_bytes), sr=SAMPLE_RATE, mono=True)

        # Quality check on raw audio
        quality = assess_audio_quality(audio, sr)
        if not quality["passed"]:
            logger.warning(f"Audio quality check failed: {quality['issues']}")
            return None

        # Preprocess
        audio_clean = preprocess_audio(audio, sr)

        # If too short after preprocessing, bail
        if len(audio_clean) < sr * MIN_DURATION_SEC * 0.5:
            logger.warning("Audio too short after preprocessing")
            return None

        features = []
        feature_names = []

        # --- 1. MFCC features (20 coefficients × 3 = 60 dims) ---
        mfccs = librosa.feature.mfcc(y=audio_clean, sr=sr, n_mfcc=20, n_fft=512, hop_length=160)
        delta_mfccs = librosa.feature.delta(mfccs)
        delta2_mfccs = librosa.feature.delta(mfccs, order=2)

        # Mean + std for each MFCC coefficient
        mfcc_mean = np.mean(mfccs, axis=1)  # 20 dims
        mfcc_std = np.std(mfccs, axis=1)  # 20 dims
        delta_mean = np.mean(delta_mfccs, axis=1)  # 20 dims
        delta2_mean = np.mean(delta2_mfccs, axis=1)  # 20 dims

        features.extend(mfcc_mean)
        features.extend(mfcc_std)
        features.extend(delta_mean)
        features.extend(delta2_mean)
        feature_names.extend([f"mfcc_mean_{i}" for i in range(20)])
        feature_names.extend([f"mfcc_std_{i}" for i in range(20)])
        feature_names.extend([f"delta_mean_{i}" for i in range(20)])
        feature_names.extend([f"delta2_mean_{i}" for i in range(20)])

        # --- 2. Spectral features (14 dims) ---
        spectral_centroid = librosa.feature.spectral_centroid(y=audio_clean, sr=sr)
        spectral_bw = librosa.feature.spectral_bandwidth(y=audio_clean, sr=sr)
        spectral_rolloff = librosa.feature.spectral_rolloff(y=audio_clean, sr=sr)
        spectral_flatness = librosa.feature.spectral_flatness(y=audio_clean)
        spectral_contrast = librosa.feature.spectral_contrast(y=audio_clean, sr=sr, n_bands=6)  # 7 bands

        features.extend(
            [
                float(np.mean(spectral_centroid)),
                float(np.std(spectral_centroid)),
                float(np.mean(spectral_bw)),
                float(np.std(spectral_bw)),
                float(np.mean(spectral_rolloff)),
                float(np.std(spectral_rolloff)),
                float(np.mean(spectral_flatness)),
                float(np.std(spectral_flatness)),
            ]
        )
        feature_names.extend(
            [
                "spec_centroid_mean",
                "spec_centroid_std",
                "spec_bw_mean",
                "spec_bw_std",
                "spec_rolloff_mean",
                "spec_rolloff_std",
                "spec_flatness_mean",
                "spec_flatness_std",
            ]
        )

        # Spectral contrast per band (mean only)
        contrast_means = np.mean(spectral_contrast, axis=1)  # 7 dims
        features.extend(contrast_means.tolist())
        feature_names.extend([f"spec_contrast_{i}" for i in range(7)])

        # --- 3. Pitch / F0 features (5 dims) ---
        f0 = librosa.yin(audio_clean, fmin=60, fmax=500, sr=sr, frame_length=1024, hop_length=256)
        f0_valid = f0[(f0 > 60) & (f0 < 500)]
        if len(f0_valid) > 2:
            features.extend(
                [
                    float(np.mean(f0_valid)),
                    float(np.std(f0_valid)),
                    float(np.min(f0_valid)),
                    float(np.max(f0_valid)),
                    float(np.max(f0_valid) - np.min(f0_valid)),  # pitch range
                ]
            )
        else:
            # Fallback: no reliable pitch detected
            features.extend([150.0, 30.0, 80.0, 300.0, 220.0])
        feature_names.extend(["f0_mean", "f0_std", "f0_min", "f0_max", "f0_range"])

        # --- 4. Energy / RMS features (4 dims) ---
        rms = librosa.feature.rms(y=audio_clean, frame_length=512, hop_length=160)[0]
        features.extend(
            [
                float(np.mean(rms)),
                float(np.std(rms)),
                float(np.max(rms) - np.min(rms)),  # dynamic range
                float(np.percentile(rms, 90) / max(np.percentile(rms, 10), 1e-8)),  # energy ratio
            ]
        )
        feature_names.extend(["rms_mean", "rms_std", "rms_dynamic_range", "rms_energy_ratio"])

        # --- 5. Temporal features (4 dims) ---
        zcr = librosa.feature.zero_crossing_rate(audio_clean, frame_length=512, hop_length=160)[0]
        features.extend(
            [
                float(np.mean(zcr)),
                float(np.std(zcr)),
            ]
        )
        feature_names.extend(["zcr_mean", "zcr_std"])

        # Tempo-related: onset strength statistics
        onset_env = librosa.onset.onset_strength(y=audio_clean, sr=sr)
        features.extend(
            [
                float(np.mean(onset_env)),
                float(np.std(onset_env)),
            ]
        )
        feature_names.extend(["onset_strength_mean", "onset_strength_std"])

        # Convert to numpy for normalization
        feature_vec = np.array(features, dtype=np.float64)

        # Z-score normalize: stabilizes cross-session comparison
        feat_mean = np.mean(feature_vec)
        feat_std = np.std(feature_vec)
        if feat_std > 0:
            feature_vec_norm = ((feature_vec - feat_mean) / feat_std).tolist()
        else:
            feature_vec_norm = feature_vec.tolist()

        return {
            "voiceprint": feature_vec_norm,
            "raw_voiceprint": feature_vec.tolist(),
            "dimension": len(feature_vec_norm),
            "quality": quality,
            "normalization": {"mean": float(feat_mean), "std": float(feat_std)},
        }

    except Exception as e:
        logger.error(f"Enhanced voiceprint extraction failed: {e}")
        return None


# ======================== ENROLLMENT ========================


def is_outlier_sample(new_voiceprint: list, existing_samples: list, threshold: float = 0.50) -> bool:
    """
    Check if a new sample is an outlier compared to existing enrollment.
    Returns True if the sample is too different (potential impostor or bad recording).
    """
    if len(existing_samples) < 2:
        return False  # Not enough data to judge

    new_np = np.array(new_voiceprint)
    similarities = []
    for sample in existing_samples:
        sim = 1 - cosine_distance(new_np, np.array(sample))
        similarities.append(sim)

    avg_sim = np.mean(similarities)
    return avg_sim < threshold


def compute_enrollment_model(samples: list) -> dict:
    """
    Build an enrollment model from multiple voiceprint samples.
    Returns the averaged voiceprint plus variance info for adaptive thresholding.
    """
    if not samples:
        return {"voiceprint": [], "variance": [], "sample_count": 0, "consistency": 0.0}

    arr = np.array(samples)
    avg_voiceprint = np.mean(arr, axis=0).tolist()
    variance = np.var(arr, axis=0).tolist()

    # Consistency: average pairwise similarity between samples
    if len(samples) >= 2:
        pairwise_sims = []
        for i in range(len(samples)):
            for j in range(i + 1, len(samples)):
                sim = 1 - cosine_distance(np.array(samples[i]), np.array(samples[j]))
                pairwise_sims.append(sim)
        consistency = float(np.mean(pairwise_sims))
    else:
        consistency = 1.0

    return {
        "voiceprint": avg_voiceprint,
        "variance": variance,
        "sample_count": len(samples),
        "consistency": round(consistency, 4),
    }


# ======================== VERIFICATION ========================


def verify_voiceprint(enrolled_model: dict, test_voiceprint: list) -> dict:
    """
    Multi-metric voiceprint verification.
    Combines cosine similarity, Euclidean distance, and Pearson correlation
    into a weighted confidence score with adaptive thresholding.

    Returns:
        dict with confidence, is_match, individual metrics, and confidence_level
    """
    enrolled = np.array(enrolled_model["voiceprint"])
    test = np.array(test_voiceprint)

    if len(enrolled) != len(test):
        logger.error(f"Dimension mismatch: enrolled={len(enrolled)}, test={len(test)}")
        return {
            "confidence": 0.0,
            "is_match": False,
            "confidence_level": "error",
            "detail": "Feature dimension mismatch — please re-enroll",
        }

    # --- Metric 1: Cosine Similarity (primary) ---
    cosine_sim = float(1 - cosine_distance(enrolled, test))

    # --- Metric 2: Normalized Euclidean Distance → similarity ---
    eucl_dist = float(np.linalg.norm(enrolled - test))
    # Normalize to 0–1 range (empirical: typical distance 2–10 for mismatches)
    eucl_sim = float(np.exp(-eucl_dist / max(len(enrolled) ** 0.5, 1)))

    # --- Metric 3: Pearson Correlation ---
    try:
        pearson_corr, _ = pearsonr(enrolled, test)
        pearson_sim = float(max(0, pearson_corr))  # Clamp negatives
    except Exception:
        pearson_sim = 0.0

    # --- Weighted combination ---
    # Cosine is most reliable for speaker verification
    weights = {"cosine": 0.50, "euclidean": 0.20, "pearson": 0.30}
    combined = weights["cosine"] * cosine_sim + weights["euclidean"] * eucl_sim + weights["pearson"] * pearson_sim

    # --- Adaptive threshold based on enrollment quality ---
    sample_count = enrolled_model.get("sample_count", 1)
    consistency = enrolled_model.get("consistency", 0.8)

    # More samples + higher consistency = stricter threshold (more confidence in model)
    # Fewer samples = slightly more lenient
    base_threshold = DEFAULT_THRESHOLD
    if sample_count >= 3 and consistency > 0.85:
        adaptive_threshold = base_threshold + 0.03  # Stricter
    elif sample_count == 1:
        adaptive_threshold = base_threshold - 0.05  # More lenient for single sample
    else:
        adaptive_threshold = base_threshold

    is_match = combined >= adaptive_threshold

    # Confidence level
    if combined >= HIGH_CONFIDENCE_THRESHOLD:
        confidence_level = "high"
    elif combined >= adaptive_threshold:
        confidence_level = "medium"
    elif combined >= LOW_CONFIDENCE_THRESHOLD:
        confidence_level = "low"
    else:
        confidence_level = "fail"

    return {
        "confidence": round(combined, 4),
        "is_match": is_match,
        "confidence_level": confidence_level,
        "threshold_used": round(adaptive_threshold, 4),
        "metrics": {
            "cosine_similarity": round(cosine_sim, 4),
            "euclidean_similarity": round(eucl_sim, 4),
            "pearson_correlation": round(pearson_sim, 4),
        },
        "enrollment_quality": {
            "sample_count": sample_count,
            "consistency": consistency,
        },
    }


# ======================== PASSPHRASE MATCHING ========================


def match_passphrase(spoken: str, expected: str) -> dict:
    """
    Enhanced passphrase matching using sequence-based comparison.
    More accurate than simple word-overlap for short phrases.
    """
    spoken_clean = spoken.strip().lower()
    expected_clean = expected.strip().lower()

    # Direct match
    if spoken_clean == expected_clean:
        return {"match": True, "score": 1.0, "method": "exact"}

    # Sequence ratio (considers ordering and partial matches)
    seq_ratio = difflib.SequenceMatcher(None, spoken_clean, expected_clean).ratio()

    # Word-level overlap (fallback for slight misspellings)
    spoken_words = set(spoken_clean.split())
    expected_words = set(expected_clean.split())
    if expected_words:
        word_overlap = len(spoken_words & expected_words) / len(expected_words)
    else:
        word_overlap = 0.0

    # Combined score: sequence ratio weighted more (captures order)
    combined = 0.7 * seq_ratio + 0.3 * word_overlap
    is_match = combined >= PASSPHRASE_THRESHOLD

    return {
        "match": is_match,
        "score": round(combined, 3),
        "sequence_ratio": round(seq_ratio, 3),
        "word_overlap": round(word_overlap, 3),
        "method": "sequence+overlap",
    }


# ======================== BACKWARD COMPATIBILITY ========================


def extract_voiceprint_legacy(audio_bytes: bytes) -> list | None:
    """
    Legacy extraction (60-dim MFCC-only). Kept for backward compatibility
    with existing enrolled voiceprints.
    """
    try:
        audio, sr = librosa.load(io.BytesIO(audio_bytes), sr=SAMPLE_RATE, mono=True)
        if len(audio) < sr * 0.5:
            return None
        audio = np.append(audio[0], audio[1:] - PRE_EMPHASIS_COEFF * audio[:-1])
        mfccs = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=20, n_fft=512, hop_length=160)
        delta_mfccs = librosa.feature.delta(mfccs)
        delta2_mfccs = librosa.feature.delta(mfccs, order=2)
        features = np.vstack([mfccs, delta_mfccs, delta2_mfccs])
        return np.mean(features, axis=1).tolist()
    except Exception as e:
        logger.error(f"Legacy voiceprint extraction failed: {e}")
        return None


def compare_voiceprints_legacy(enrolled: list, test: list, threshold: float = 0.80) -> tuple:
    """Legacy comparison for old 60-dim voiceprints."""
    similarity = 1 - cosine_distance(np.array(enrolled), np.array(test))
    return float(similarity), similarity >= threshold

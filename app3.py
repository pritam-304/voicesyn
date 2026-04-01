"""
app3.py — Subliminal Affirmations with Chatterbox Voice Cloning
Runs on port 5002.  Uses venv311 (Python 3.11 + chatterbox-tts).
"""
import os, sys, uuid, wave, struct, json, math, threading, time
from pathlib import Path
from flask import Flask, request, jsonify, send_file, render_template

# ── paths ──────────────────────────────────────────────────────────────────
BASE   = Path(__file__).parent
TMPL   = BASE / "subliminal" / "templates"
STATIC = BASE / "subliminal" / "static"
OUT    = BASE / "subliminal" / "output"
REF    = BASE / "subliminal" / "reference"
PROFILES = BASE / "subliminal" / "profiles"
for d in [TMPL, STATIC / "css", STATIC / "js", OUT, REF, PROFILES]:
    d.mkdir(parents=True, exist_ok=True)

app = Flask(__name__, template_folder=str(TMPL), static_folder=str(STATIC))
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024   # 50 MB

# ── model state ────────────────────────────────────────────────────────────
_model       = None
_model_lock  = threading.Lock()
_load_status = {"state": "idle", "msg": ""}   # idle | loading | ready | error
# ── async job registry ──────────────────────────────────────────────────
# Each entry: {state, current, total, audio_id, duration_sec,
#              affirmation_count, loops, error}
_jobs      = {}
_jobs_lock = threading.Lock()
def get_model():
    """Load Chatterbox on first call (downloads ~1 GB on first ever run)."""
    global _model, _load_status
    with _model_lock:
        if _model is not None:
            return _model
        _load_status = {"state": "loading", "msg": "Downloading / loading model…"}
        try:
            import torch
            # Use all available CPU cores for inference
            torch.set_num_threads(torch.get_num_threads())
            torch.set_num_interop_threads(max(1, torch.get_num_interop_threads()))
            from chatterbox.tts import ChatterboxTTS
            device = "cuda" if torch.cuda.is_available() else "cpu"
            _model = ChatterboxTTS.from_pretrained(device=device)
            _load_status = {"state": "ready", "msg": f"Model loaded on {device}"}
            return _model
        except Exception as e:
            _load_status = {"state": "error", "msg": str(e)}
            raise

def load_model_bg():
    """Pre-warm model in background so first synthesis is faster."""
    try:
        get_model()
    except Exception:
        pass

threading.Thread(target=load_model_bg, daemon=True).start()


# ── helpers ────────────────────────────────────────────────────────────────
def save_audio(array, sample_rate: int, path: Path):
    """Save a torch tensor / numpy array as a 16-bit mono WAV."""
    import numpy as np
    if hasattr(array, "numpy"):
        arr = array.squeeze().cpu().numpy()
    else:
        arr = np.array(array).squeeze()
    arr = np.clip(arr, -1.0, 1.0)
    data = (arr * 32767).astype(np.int16)
    with wave.open(str(path), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(data.tobytes())


def wav_concat(paths: list, pause_ms: int, sample_rate: int) -> bytes:
    """
    Concatenate multiple WAV files with a silent pause between each.
    All inputs must be mono 16-bit.  Returns raw WAV bytes.
    """
    import numpy as np

    pause_samples = int(sample_rate * pause_ms / 1000)
    silence = np.zeros(pause_samples, dtype=np.int16)

    frames = []
    for i, p in enumerate(paths):
        with wave.open(str(p), "r") as wf:
            raw = wf.readframes(wf.getnframes())
            frames.append(np.frombuffer(raw, dtype=np.int16))
        if i < len(paths) - 1:
            frames.append(silence.copy())

    combined = np.concatenate(frames)

    import io
    buf = io.BytesIO()
    with wave.open(buf, "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(combined.tobytes())
    return buf.getvalue()


def convert_to_wav(src: Path, dst: Path) -> bool:
    """Try ffmpeg → wav. Returns True on success."""
    import subprocess
    try:
        r = subprocess.run(
            ["ffmpeg", "-y", "-i", str(src), "-ac", "1", "-ar", "24000",
             "-sample_fmt", "s16", str(dst)],
            capture_output=True, timeout=60
        )
        return r.returncode == 0 and dst.exists()
    except Exception:
        return False


# ── routes ─────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("subliminal.html")


@app.route("/api3/status")
def status():
    return jsonify(_load_status)


# ── Voice Profiles ─────────────────────────────────────────────────────
@app.route("/api3/profiles", methods=["GET"])
def list_profiles():
    profiles = []
    for prof_dir in sorted(PROFILES.iterdir()):
        meta_file = prof_dir / "meta.json"
        wav_file  = prof_dir / "voice.wav"
        if prof_dir.is_dir() and wav_file.exists():
            meta = {}
            if meta_file.exists():
                try:
                    meta = json.loads(meta_file.read_text())
                except Exception:
                    pass
            profiles.append({
                "name":    prof_dir.name,
                "created": meta.get("created", ""),
                "seconds": meta.get("seconds", 0),
            })
    return jsonify(profiles)


@app.route("/api3/profiles", methods=["POST"])
def save_profile():
    name = request.form.get("name", "").strip()
    if not name:
        return jsonify({"error": "Profile name is required"}), 400
    # Sanitise: keep only alphanumeric, spaces, dashes, underscores
    import re
    safe_name = re.sub(r"[^\w\s\-]", "", name).strip().replace(" ", "_")
    if not safe_name:
        return jsonify({"error": "Invalid profile name"}), 400

    if "audio" not in request.files:
        return jsonify({"error": "No audio file"}), 400

    f   = request.files["audio"]
    ext = Path(f.filename).suffix.lower() or ".webm"
    prof_dir = PROFILES / safe_name
    prof_dir.mkdir(parents=True, exist_ok=True)

    raw = prof_dir / f"raw{ext}"
    f.save(str(raw))

    wav_path = prof_dir / "voice.wav"
    if ext in (".webm", ".ogg", ".m4a", ".mp4", ".opus"):
        ok = convert_to_wav(raw, wav_path)
        if ok:
            raw.unlink(missing_ok=True)
        else:
            # Try renaming as-is
            import shutil
            shutil.copy2(str(raw), str(wav_path))
    else:
        import shutil
        shutil.copy2(str(raw), str(wav_path))
        if raw != wav_path:
            raw.unlink(missing_ok=True)

    # Measure duration
    seconds = 0
    try:
        with wave.open(str(wav_path), "r") as wf:
            seconds = round(wf.getnframes() / wf.getframerate(), 1)
    except Exception:
        pass

    meta = {
        "name":    name,
        "created": time.strftime("%Y-%m-%d %H:%M"),
        "seconds": seconds,
    }
    (prof_dir / "meta.json").write_text(json.dumps(meta))

    # Also update current.wav for backward compat
    try:
        import shutil
        shutil.copy2(str(wav_path), str(REF / "current.wav"))
    except Exception:
        pass

    return jsonify({"name": safe_name, "display_name": name,
                    "seconds": seconds, "msg": f"Profile '{name}' saved"})


@app.route("/api3/profiles/<name>", methods=["DELETE"])
def delete_profile(name):
    import shutil, re
    safe_name = re.sub(r"[^\w\-]", "", name)
    prof_dir  = PROFILES / safe_name
    if not prof_dir.exists():
        return jsonify({"error": "Profile not found"}), 404
    shutil.rmtree(str(prof_dir))
    return jsonify({"msg": f"Profile '{safe_name}' deleted"})
def upload_voice():
    if "audio" not in request.files:
        return jsonify({"error": "No audio file"}), 400
    f   = request.files["audio"]
    ext = Path(f.filename).suffix.lower() or ".webm"
    uid = uuid.uuid4().hex
    raw = REF / f"ref_{uid}{ext}"
    f.save(str(raw))

    # Convert to WAV if needed
    if ext in (".webm", ".ogg", ".m4a", ".mp4", ".opus"):
        wav_path = REF / f"ref_{uid}.wav"
        ok = convert_to_wav(raw, wav_path)
        if not ok:
            # Try to use as-is and hope Chatterbox can handle it
            wav_path = raw
        else:
            raw.unlink(missing_ok=True)
    else:
        wav_path = raw

    # Persist as "current reference"
    current = REF / "current.wav"
    try:
        import shutil
        shutil.copy2(str(wav_path), str(current))
    except Exception:
        pass

    return jsonify({"ref_id": uid, "path": str(wav_path), "msg": "Voice sample saved"})


@app.route("/api3/synthesize", methods=["POST"])
def synthesize():
    """Validate inputs, start background synthesis thread, return job_id immediately."""
    data         = request.get_json(force=True)
    affirmations = data.get("affirmations", [])
    loops        = int(data.get("loops", 1))
    pause_ms     = int(data.get("pause_ms", 1000))
    exaggeration = float(data.get("exaggeration", 0.5))
    cfg_weight   = float(data.get("cfg_weight", 0.5))
    profile_name = data.get("profile_name", "").strip()

    if not affirmations:
        return jsonify({"error": "No affirmations provided"}), 400

    # Resolve voice WAV: prefer named profile, fall back to legacy current.wav
    if profile_name:
        import re
        safe = re.sub(r"[^\w\-]", "", profile_name.replace(" ", "_"))
        ref_wav = PROFILES / safe / "voice.wav"
        if not ref_wav.exists():
            return jsonify({"error": f"Profile '{profile_name}' not found"}), 400
    else:
        ref_wav = REF / "current.wav"
        if not ref_wav.exists():
            return jsonify({"error": "No voice profile selected"}), 400

    job_id  = uuid.uuid4().hex
    job_dir = OUT / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    with _jobs_lock:
        _jobs[job_id] = {
            "state":   "queued",
            "current": 0,
            "total":   len([t for t in affirmations if t.strip()]),
            "loops":   loops,
            "audio_id": None,
            "duration_sec": 0,
            "affirmation_count": 0,
            "error": None,
        }

    def run_synthesis():
        with _jobs_lock:
            _jobs[job_id]["state"] = "running"
        try:
            model = get_model()
        except Exception as e:
            with _jobs_lock:
                _jobs[job_id].update({"state": "error", "error": f"Model load failed: {e}"})
            return

        import torch, numpy as np, io
        sr          = model.sr
        single_wavs = []
        valid_affs  = [t.strip() for t in affirmations if t.strip()]

        for i, text in enumerate(valid_affs):
            with _jobs_lock:
                _jobs[job_id]["current"] = i
            try:
                wav = model.generate(
                    text,
                    audio_prompt_path=str(ref_wav),
                    exaggeration=exaggeration,
                    cfg_weight=cfg_weight,
                )
                out_path = job_dir / f"aff_{i:03d}.wav"
                save_audio(wav, sr, out_path)
                single_wavs.append(out_path)
            except Exception as e:
                with _jobs_lock:
                    _jobs[job_id].update({"state": "error",
                                          "error": f"Synthesis failed on '{text[:40]}': {e}"})
                return

        if not single_wavs:
            with _jobs_lock:
                _jobs[job_id].update({"state": "error", "error": "Nothing to synthesize"})
            return

        # Build final audio (loops + pauses)
        one_loop_bytes = wav_concat(single_wavs, pause_ms, sr)

        def bytes_to_arr(b):
            buf = io.BytesIO(b)
            with wave.open(buf, "r") as wf:
                raw = wf.readframes(wf.getnframes())
            return np.frombuffer(raw, dtype=np.int16)

        loop_arr  = bytes_to_arr(one_loop_bytes)
        pause_arr = np.zeros(int(sr * pause_ms / 1000), dtype=np.int16)
        all_arrs  = []
        for i in range(loops):
            all_arrs.append(loop_arr)
            if i < loops - 1:
                all_arrs.append(pause_arr)

        final      = np.concatenate(all_arrs)
        final_name = f"subliminal_{job_id}.wav"
        final_path = OUT / final_name
        buf = io.BytesIO()
        with wave.open(buf, "w") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sr)
            wf.writeframes(final.tobytes())
        final_path.write_bytes(buf.getvalue())

        duration = len(final) / sr
        with _jobs_lock:
            _jobs[job_id].update({
                "state":             "done",
                "current":           len(valid_affs),
                "audio_id":          final_name,
                "duration_sec":      round(duration, 1),
                "affirmation_count": len(single_wavs),
            })

    threading.Thread(target=run_synthesis, daemon=True).start()
    return jsonify({"job_id": job_id,
                    "total":  _jobs[job_id]["total"]})


@app.route("/api3/jobs/<job_id>")
def job_status(job_id):
    with _jobs_lock:
        job = _jobs.get(job_id)
    if job is None:
        return jsonify({"error": "Job not found"}), 404
    return jsonify(job)


@app.route("/api3/audio/<filename>")
def serve_audio(filename):
    path = OUT / filename
    if not path.exists():
        return jsonify({"error": "Not found"}), 404
    return send_file(str(path), mimetype="audio/wav",
                     as_attachment=False,
                     download_name=filename)


@app.route("/api3/download/<filename>")
def download_audio(filename):
    path = OUT / filename
    if not path.exists():
        return jsonify({"error": "Not found"}), 404
    return send_file(str(path), mimetype="audio/wav",
                     as_attachment=True,
                     download_name=filename)


if __name__ == "__main__":
    print("Starting Subliminal Voice app on http://localhost:5002")
    print("Model is pre-loading in background …")
    app.run(host="0.0.0.0", port=5002, debug=False, threaded=True)
    print("Starting Subliminal Voice app on http://localhost:5002")
    print("Model is pre-loading in background …")
    app.run(host="0.0.0.0", port=5002, debug=False)

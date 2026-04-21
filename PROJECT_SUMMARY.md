# VoiceSynthezier — Full Project Summary
> Last updated: April 21, 2026  
> Use this file to reconstruct context in a new session.

---

## What This Project Does

A **subliminal affirmation audio player** with a paired **AI voice-cloning TTS generator**.

1. **Generate** — You type affirmations into a local web UI, pick/clone a voice, and `app3.py` uses the **Chatterbox TTS** model to synthesise WAV files for each phrase.
2. **Play** — The standalone `index.html` player loads those WAV files and plays them at ~2% volume (subliminal level) layered over a **theta binaural beat (7 Hz)** and ambient drone tones, all mixed in the browser via the **Web Audio API**.

The player is deployed as a **GitHub Pages static site** — no server needed to play. The TTS generator (`app3.py`) runs locally.

---

## Repository Structure

```
C:\Repos\VoiceSynthezier\
│
├── index.html                    ← MAIN PLAYER (served by GitHub Pages)
├── affirmations.js               ← NOTE: currently lives at subliminal-player/affirmations.js
│                                   (see "Known Issues" section below)
├── app3.py                       ← Local TTS generation server (Flask, port 5002)
├── pritam_subliminal.html        ← Original aesthetic reference / prototype page
├── .gitignore                    ← Excludes venv311/, output/, uploads/, etc.
│
├── subliminal-player/
│   ├── index.html                ← (older copy — may be stale)
│   ├── affirmations.js           ← Config file for which audio files to load
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   └── app.js
│   └── audios/                   ← Pre-generated WAV files served by GitHub Pages
│       ├── peace.wav
│       ├── clean.wav
│       ├── physics.wav
│       ├── attract.wav
│       └── self.wav
│
└── venv311/                      ← Python 3.11 virtualenv (NOT committed to git)
    └── (chatterbox-tts 0.1.7, torch 2.6.0+cpu, flask, etc.)
```

### GitHub Pages URL
```
https://<your-username>.github.io/VoiceSynthezier/
```
The root `index.html` is served directly at that URL.

---

## File-by-File Description

### `index.html`  ← THE MAIN FILE
The standalone subliminal player. ~1,486 lines. No build step, no dependencies, pure HTML/CSS/JS.

**What it does:**
- Dark starfield aesthetic (animated CSS stars, glowing orb button)
- **Setup panel** with two tabs:
  - **Saved Files tab**: a `<select multiple>` dropdown populated from `AFFIRMATIONS` config. Select All / Clear buttons. All files pre-selected by default.
  - **Local Files tab**: drag-and-drop zone + file picker. Supports WAV/MP3. Files sorted by embedded number (e.g. `affirmation_0.wav` before `affirmation_1.wav`).
- **Session UI**: animated orb, affirmation display, progress bar, loop counter, ambient/voice volume sliders
- **Web Audio mix**:
  - Theta binaural beat: left ear = C3 (130.81 Hz), right ear = C3 + 7 Hz = 137.81 Hz
  - Ambient drones: G3 (196 Hz), C4 (261.63 Hz), C2 (65.41 Hz) at ~70% gain
  - Voice layer: WAV files decoded to `AudioBuffer`, played at ~2% gain (subliminal)
- Affirmations play sequentially with 3.5-second pauses between them
- Loop support: replays through the entire set
- "Load New" button returns to setup panel without page reload
- Fetches saved audio files from `AFFIRMATIONS` URLs (works on GitHub Pages, not on `file://`)

**Key JS structure:**
```
AFFIRMATIONS config      ← comes from affirmations.js
activeTab                ← 'saved' | 'local'
pendingFiles[]           ← local file mode queue
audioBuffers[]           ← decoded Web Audio buffers
renderSavedList()        ← populates <select> from AFFIRMATIONS
updateBeginBtn()         ← enables/disables Begin button
beginBtn click handler   ← fetches/decodes audio, starts session
initAudio()              ← creates AudioContext, oscillators, gains
decodeAllUrls()          ← fetches + decodes saved files
decodeAllFiles()         ← reads + decodes local file objects
startSession()           ← kicks off playback loop
scheduleNext()           ← recursive affirmation scheduler
```

---

### `affirmations.js`  ← CONFIG FILE
**Currently located at `subliminal-player/affirmations.js`** (see Known Issues).

```js
const AFFIRMATIONS = [
  { url: "subliminal-player/audios/peace.wav",   text: "Peace" },
  { url: "subliminal-player/audios/clean.wav",   text: "Clean Body" },
  { url: "subliminal-player/audios/physics.wav", text: "Physics" },
  { url: "subliminal-player/audios/attract.wav", text: "Attraction" },
  { url: "subliminal-player/audios/self.wav",    text: "Self" },
];
```

- **To add more audio**: generate a WAV with `app3.py`, drop it in `subliminal-player/audios/`, push to GitHub, and add a line here.
- URLs are relative to the root `index.html` location on GitHub Pages.
- Leave the array `[]` to force the Local Files tab mode.

---

### `app3.py`  ← LOCAL TTS SERVER
Flask server on **port 5002**. `~420 lines`.

**What it does:**
- Loads **Chatterbox TTS** (Resemble AI, local inference, CPU or CUDA)
- First load downloads ~1 GB model weights
- **Profile system**: saves reference voice clips + metadata per user under `subliminal/profiles/<name>/`
- **Async job system**: each TTS generation runs in a background thread; frontend polls `/status/<job_id>`
- **Routes**:
  - `GET /` → renders the TTS generator UI (from `subliminal/templates/`)
  - `POST /generate` → starts async TTS job, returns `{job_id}`
  - `GET /status/<job_id>` → returns job state (queued/running/done/error + progress)
  - `GET /audio/<audio_id>` → streams the generated WAV back
  - `POST /save-profile` → saves voice profile (reference WAV + name)
  - `GET /profiles` → lists all saved profiles
  - various `/model-status`, `/warmup` endpoints

**How to start:**
```powershell
C:\Repos\VoiceSynthezier\venv311\Scripts\python.exe C:\Repos\VoiceSynthezier\app3.py
# Then open: http://localhost:5002
```

**Python environment:**
```
venv311\  (Python 3.11)
  chatterbox-tts==0.1.7
  torch==2.6.0+cpu
  flask
  soundfile
  numpy
```

---

### `subliminal-player/audios/*.wav`
Pre-generated affirmation audio files, committed to git and served via GitHub Pages CDN.

| File | Content |
|------|---------|
| `peace.wav` | "Peace" affirmation |
| `clean.wav` | "Clean Body" affirmation |
| `physics.wav` | "Physics" affirmation |
| `attract.wav` | "Attraction" affirmation |
| `self.wav` | "Self" affirmation |

---

### `pritam_subliminal.html`
Original prototype / aesthetic reference. The dark starfield + orb UI style was copied from here into `index.html`. Not actively used.

---

### `.gitignore`
Excludes: `venv311/`, `venv/`, `subliminal/output/`, `subliminal/uploads/`, `*.bat`, `*.log`, `__pycache__/`

---

## Known Issues / Pending Work

### 1. `affirmations.js` is in the wrong place
- The root `index.html` has `<script src="affirmations.js">` which expects the file at the repo root.
- But the actual file is at `subliminal-player/affirmations.js`.
- **Fix**: either move `subliminal-player/affirmations.js` to the repo root, OR change the `<script>` tag in `index.html` to `src="subliminal-player/affirmations.js"`.

### 2. `subliminal-player/index.html` may be stale
- This was the earlier version of the player before it was moved to root.
- Verify whether it's needed; if not, delete it to avoid confusion.

### 3. `file://` protocol blocks fetch
- When opening `index.html` directly from disk (double-click), the browser blocks `fetch()` for audio files due to CORS.
- **Workaround**: use the GitHub Pages URL, or run a local server: `python -m http.server 8080` then open `http://localhost:8080`.

---

## Full Chronology of Work Done

### Phase 1 — Repository Cleanup
- Removed: `app.py`, `app2.py`, `venv/` (707 MB), `scratch/`, `output/`, `templates/`, `static/`, `uploads/`, `.bat` files, `requirements.txt`, install logs
- Kept: `app3.py`, `venv311/`, `subliminal/`, `subliminal-player/`

### Phase 2 — TTS Discussion
- Discussed using browser/Edge voices with Chatterbox — not possible (Chatterbox is Python-only inference). Settled on pre-generating WAVs and hosting them statically.

### Phase 3 — `voice-player.html` Creation
- Built `subliminal-player/voice-player.html` from scratch (~1,400 lines)
- Dark starfield aesthetic matching `pritam_subliminal.html` (CSS variables, animated stars, glowing orb)
- Web Audio API: theta binaural 7 Hz + drone layers + voice layer
- Initial version: manual file picker only

### Phase 4 — Text Readability Fixes
- Multiple rounds of brightness improvements:
  - `--text-dim`: `#5a5570` → `#e0dcf5` → `#ede8ff`
  - Font sizes: 8–9 px → 11–12 px, weight 400
  - `--indigo-dim` and `--rose-dim` brightened

### Phase 5 — GitHub + GitHub Pages Setup
- Created `.gitignore`
- Pushed to GitHub (repo: `pritam-304/voicesyn` or similar)
- Enabled GitHub Pages on `master` branch root
- Added redirect `index.html` at root pointing to `subliminal-player/voice-player.html`

### Phase 6 — Audio URL Auto-load (several attempts)
- Added `AFFIRMATIONS` config array
- Created `subliminal-player/audios/` with initial WAV files
- Multiple failed auto-load approaches (missing files, `file://` blocking fetch)
- Final approach: populate from config, guard against `file://` protocol

### Phase 7 — Saved/Local Tab System
- User rejected auto-load; requested: dropdown of saved files + option for local files
- Implemented two-tab setup panel:
  - **Saved Files** tab: originally checkbox list
  - **Local Files** tab: drag-and-drop zone + file picker
- CSS: `.tab-row`, `.tab-btn`, `.tab-pane` etc.
- JS: `renderSavedList()`, `updateBeginBtn()`, tab switching, `beginBtn` handler

### Phase 8 — Checkbox → `<select multiple>` Dropdown
- User asked for dropdown instead of checkboxes
- Replaced `.saved-item` checkbox divs with `<select id="savedSelect" multiple>`
- Added Select All / Clear buttons (`.saved-action-btn`)
- Updated `renderSavedList()` to populate `<option>` elements
- Updated `updateBeginBtn()` to check `sel.options` selected count
- Updated `beginBtn` handler to read `sel.selectedOptions`
- **Bug discovered**: replacement Python script failed silently — functions were never written to file
- **Fix**: separately added `activeTab` declaration, `.tab-btn` click handler, and both missing functions

### Phase 9 — Relocation to Root
- User moved `subliminal-player/voice-player.html` → `index.html` (repo root)
- Fixed `AFFIRMATIONS` URL paths: `"audios/..."` → `"subliminal-player/audios/..."`

### Phase 10 — `affirmations.js` Extraction
- Moved `const AFFIRMATIONS = [...]` out of `index.html` into separate `affirmations.js`
- `index.html` now loads it with `<script src="affirmations.js"></script>` before the main script

---

## How to Add a New Affirmation

1. Start the local TTS server:
   ```powershell
   C:\Repos\VoiceSynthezier\venv311\Scripts\python.exe C:\Repos\VoiceSynthezier\app3.py
   ```
2. Open `http://localhost:5002` and generate a WAV for your new phrase.
3. Save the WAV as e.g. `subliminal-player/audios/myphrase.wav`.
4. Add to `affirmations.js`:
   ```js
   { url: "subliminal-player/audios/myphrase.wav", text: "My Phrase" },
   ```
5. Commit and push:
   ```powershell
   git add subliminal-player/audios/myphrase.wav affirmations.js
   git commit -m "Add myphrase affirmation"
   git push
   ```

---

## CSS Design Tokens (in `index.html`)
```css
--bg:         #07090b       /* near-black background */
--text:       #ffffff       /* primary text */
--text-dim:   #ede8ff       /* secondary text */
--text-faint: #ccc5e8       /* hint text */
--indigo:     #7c8fe0       /* accent colour */
--indigo-dim: #b8c2f0       /* soft accent */
--rose-dim:   #f0aac8       /* rose accent (status messages) */
```

---

## Audio Mix Parameters
| Layer | Frequency | Gain |
|-------|-----------|------|
| Binaural L | C3 = 130.81 Hz | ~30% |
| Binaural R | C3 + 7 Hz = 137.81 Hz | ~30% |
| Drone 1 | G3 = 196 Hz | ~70% |
| Drone 2 | C4 = 261.63 Hz | ~70% |
| Drone 3 | C2 = 65.41 Hz | ~70% |
| Voice (WAV) | — | ~2% (subliminal) |

Voice volume is adjustable via slider (Ghost / Ultra / Deep / %).  
Ambient volume is also adjustable via slider.  
Pause between affirmations: `PAUSE_MS = 3500` (3.5 seconds).

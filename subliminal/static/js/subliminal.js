/* ================================================================
   subliminal.js  —  Subliminal Voice frontend  v2 (profile system)
   ================================================================ */

const API = '/api3';

/* ── State ─────────────────────────────────────────────────────── */
let affirmations   = [];
let selectedProfile = null;   // name key of chosen profile
let mediaRecorder  = null;
let audioChunks    = [];
let recStream      = null;
let waveAnim       = null;
let timerInterval  = null;
let timerSec       = 0;
let previewBlob    = null;
let currentAudioId = null;

const $ = id => document.getElementById(id);

/* ── Init ───────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  pollModelStatus();
  loadProfiles();

  $('btn-start-voice').addEventListener('click', startVoiceRec);
  $('btn-stop-voice').addEventListener('click', stopVoiceRec);
  $('btn-save-voice').addEventListener('click', saveVoice);
  $('btn-retake-voice').addEventListener('click', retakeVoice);
  $('btn-upload-voice').addEventListener('click', () => $('voice-file-input').click());
  $('voice-file-input').addEventListener('change', uploadVoiceFile);

  $('aff-input').addEventListener('keydown', e => { if (e.key === 'Enter') addAffirmation(); });
  $('btn-add-aff').addEventListener('click', addAffirmation);
  $('btn-bulk-add').addEventListener('click', bulkAdd);
  $('btn-clear-aff').addEventListener('click', clearAffirmations);

  $('pause-slider').addEventListener('input', e => {
    $('pause-val').textContent = (e.target.value / 1000).toFixed(1) + 's';
  });
  $('exag-slider').addEventListener('input', e => {
    $('exag-val').textContent = parseFloat(e.target.value).toFixed(2);
  });
  $('cfg-slider').addEventListener('input', e => {
    $('cfg-val').textContent = parseFloat(e.target.value).toFixed(2);
  });

  $('btn-generate').addEventListener('click', generate);
  $('btn-new').addEventListener('click', () => {
    $('player-section').style.display = 'none';
    $('gen-status').textContent = '';
  });
});

/* ── Model status polling ───────────────────────────────────────── */
function pollModelStatus() {
  fetch(`${API}/status`)
    .then(r => r.json())
    .then(d => {
      const banner = $('model-banner');
      $('model-banner').className = 'model-banner ' + (d.state === 'ready' ? 'ready' : d.state === 'error' ? 'error' : 'loading');
      $('model-icon').textContent = d.state === 'ready' ? '✅' : d.state === 'error' ? '❌' : '⏳';
      $('model-msg').textContent  = d.state === 'ready' ? 'AI model loaded — ready to generate'
                                  : d.state === 'error' ? 'Model error: ' + d.msg
                                  : 'Loading AI model in background… (first load downloads ~1 GB)';
      if (d.state !== 'ready' && d.state !== 'error') setTimeout(pollModelStatus, 3000);
    })
    .catch(() => setTimeout(pollModelStatus, 5000));
}

/* ════════════════════════════════════════════════════════════════
   VOICE PROFILES
   ════════════════════════════════════════════════════════════════*/
async function loadProfiles() {
  try {
    const res  = await fetch(`${API}/profiles`);
    const list = await res.json();
    renderProfiles(list);
  } catch(e) {
    renderProfiles([]);
  }
}

function renderProfiles(list) {
  const grid    = $('profiles-grid');
  const noProfs = $('no-profiles');

  if (!list.length) {
    grid.innerHTML = '';
    noProfs.style.display = 'block';
    // Auto-open add panel when no profiles exist
    $('add-profile-details').open = true;
    return;
  }

  noProfs.style.display = 'none';
  grid.innerHTML = list.map(p => {
    const isSelected = p.name === selectedProfile;
    const initials   = p.name.split('_').map(w => w[0] || '').join('').toUpperCase().slice(0, 2) || '?';
    const created    = p.created ? ` · ${p.created}` : '';
    const dur        = p.seconds ? ` · ${p.seconds}s sample` : '';
    return `
      <div class="profile-card ${isSelected ? 'selected' : ''}" id="pcard-${escAttr(p.name)}"
           onclick="selectProfile('${escAttr(p.name)}')">
        <div class="profile-avatar">${initials}</div>
        <div class="profile-info">
          <div class="profile-name">${escHtml(p.name.replace(/_/g,' '))}</div>
          <div class="profile-meta">${escHtml(dur + created)}</div>
        </div>
        ${isSelected ? '<div class="profile-check">✔ Selected</div>' : ''}
        <button class="profile-del" title="Delete profile"
                onclick="event.stopPropagation(); deleteProfile('${escAttr(p.name)}')">✕</button>
      </div>`;
  }).join('');
}

function selectProfile(name) {
  selectedProfile = name;
  // Re-render to show checkmark (lightweight: just re-query existing cards)
  document.querySelectorAll('.profile-card').forEach(el => {
    const isMe = el.id === 'pcard-' + name;
    el.classList.toggle('selected', isMe);
    // Update / insert check badge inside card
    const existing = el.querySelector('.profile-check');
    if (isMe && !existing) {
      const chk = document.createElement('div');
      chk.className   = 'profile-check';
      chk.textContent = '✔ Selected';
      el.insertBefore(chk, el.querySelector('.profile-del'));
    } else if (!isMe && existing) {
      existing.remove();
    }
  });
  toast(`🎙 Profile "${name.replace(/_/g,' ')}" selected`, 'ok');
  // Collapse the add panel when a profile is selected
  $('add-profile-details').open = false;
}

async function deleteProfile(name) {
  if (!confirm(`Delete profile "${name.replace(/_/g,' ')}"? This cannot be undone.`)) return;
  try {
    const res = await fetch(`${API}/profiles/${encodeURIComponent(name)}`, { method:'DELETE' });
    const d   = await res.json();
    if (!res.ok) throw new Error(d.error || 'Delete failed');
    if (selectedProfile === name) selectedProfile = null;
    toast(`Profile "${name.replace(/_/g,' ')}" deleted`, 'info');
    await loadProfiles();
  } catch(e) {
    toast('Delete failed: ' + e.message, 'err');
  }
}

/* ── Recording ──────────────────────────────────────────────────── */
function bestMime() {
  const types = ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/ogg'];
  return types.find(t => MediaRecorder.isTypeSupported(t)) || '';
}

async function startVoiceRec() {
  try {
    recStream   = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    const opts  = {};
    const mime  = bestMime();
    if (mime) opts.mimeType = mime;
    mediaRecorder = new MediaRecorder(recStream, opts);
    mediaRecorder.ondataavailable = e => { if (e.data.size) audioChunks.push(e.data); };
    mediaRecorder.onstop = onVoiceStop;
    mediaRecorder.start(100);

    $('btn-start-voice').disabled = true;
    $('btn-stop-voice').disabled  = false;
    $('voice-player-wrap').style.display = 'none';

    timerSec = 0;
    $('voice-timer').textContent = '0s';
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      timerSec++;
      $('voice-timer').textContent = timerSec + 's';
      if (timerSec >= 20) stopVoiceRec();
    }, 1000);

    drawWave(recStream);
    setVoiceStatus('Recording… speak naturally. At least 10 seconds.');
  } catch(err) {
    toast('Microphone access denied. Enable mic in your browser.', 'err');
  }
}

function stopVoiceRec() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  clearInterval(timerInterval);
  cancelAnimationFrame(waveAnim);
  stopStream();
  $('btn-stop-voice').disabled  = true;
  $('btn-start-voice').disabled = false;
}

function onVoiceStop() {
  previewBlob = new Blob(audioChunks, { type: audioChunks[0]?.type || 'audio/webm' });
  const url   = URL.createObjectURL(previewBlob);
  $('voice-preview').src = url;
  $('voice-player-wrap').style.display = 'flex';
  setVoiceStatus(`Recorded ${timerSec}s — enter a name and click "Save Profile".`);
}

async function saveVoice() {
  if (!previewBlob) return;
  const name = ($('profile-name-input').value || '').trim();
  if (!name) {
    toast('Enter a profile name first', 'err');
    $('profile-name-input').focus();
    return;
  }

  $('btn-save-voice').disabled = true;
  const fd  = new FormData();
  const ext = previewBlob.type.includes('ogg') ? '.ogg' : '.webm';
  fd.append('audio', previewBlob, 'voice_sample' + ext);
  fd.append('name', name);

  try {
    const res  = await fetch(`${API}/profiles`, { method:'POST', body:fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Save failed');
    setVoiceStatus(`✔ Profile "${name}" saved.`, 'ok');
    toast(`Profile "${name}" saved ✔`, 'ok');
    $('voice-player-wrap').style.display = 'none';
    $('profile-name-input').value = '';
    clearCanvas();
    // Select the newly saved profile
    selectedProfile = data.name;
    await loadProfiles();
    $('add-profile-details').open = false;
  } catch(err) {
    toast('Save failed: ' + err.message, 'err');
    $('btn-save-voice').disabled = false;
  }
}

function retakeVoice() {
  previewBlob = null;
  $('voice-preview').src = '';
  $('voice-player-wrap').style.display = 'none';
  clearCanvas();
  setVoiceStatus('');
}

async function uploadVoiceFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const name = ($('profile-name-input').value || '').trim() ||
               file.name.replace(/\.[^.]+$/, '').replace(/[_\-]+/g, ' ').trim();

  const fd = new FormData();
  fd.append('audio', file, file.name);
  fd.append('name', name);

  setVoiceStatus(`Uploading "${file.name}"…`);
  try {
    const res  = await fetch(`${API}/profiles`, { method:'POST', body:fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    setVoiceStatus(`✔ "${name}" saved as voice profile.`, 'ok');
    toast(`Profile "${name}" saved ✔`, 'ok');
    $('profile-name-input').value = '';
    selectedProfile = data.name;
    await loadProfiles();
    $('add-profile-details').open = false;
  } catch(err) {
    setVoiceStatus('Error: ' + err.message, 'err');
    toast('Upload failed', 'err');
  }
  e.target.value = '';
}

/* ── Waveform ───────────────────────────────────────────────────── */
function drawWave(stream) {
  const cv  = $('voice-wave');
  const cx  = cv.getContext('2d');
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const src = ctx.createMediaStreamSource(stream);
  const ana = ctx.createAnalyser();
  ana.fftSize = 512;
  src.connect(ana);
  const buf = new Uint8Array(ana.frequencyBinCount);
  function draw() {
    waveAnim = requestAnimationFrame(draw);
    ana.getByteTimeDomainData(buf);
    cv.width = cv.offsetWidth;
    cx.clearRect(0, 0, cv.width, cv.height);
    cx.lineWidth   = 2;
    cx.strokeStyle = '#a78bfa';
    cx.beginPath();
    const sl = cv.width / buf.length;
    let x = 0;
    for (let i = 0; i < buf.length; i++) {
      const y = (buf[i] / 128) * (cv.height / 2);
      i === 0 ? cx.moveTo(x, y) : cx.lineTo(x, y);
      x += sl;
    }
    cx.stroke();
  }
  draw();
}
function clearCanvas() {
  const cv = $('voice-wave');
  cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
}
function stopStream() {
  if (recStream) { recStream.getTracks().forEach(t => t.stop()); recStream = null; }
}

/* ── Affirmations ───────────────────────────────────────────────── */
function addAffirmation() {
  const val = $('aff-input').value.trim();
  if (!val) return;
  affirmations.push(val); $('aff-input').value = '';
  renderAffList();
}
function bulkAdd() {
  const lines = $('aff-bulk').value.split('\n').map(l => l.trim()).filter(Boolean);
  affirmations.push(...lines); $('aff-bulk').value = '';
  renderAffList();
  toast(`Added ${lines.length} affirmations`, 'info');
}
function removeAff(i) { affirmations.splice(i, 1); renderAffList(); }
function clearAffirmations() {
  if (!affirmations.length) return;
  if (!confirm('Clear all affirmations?')) return;
  affirmations = []; renderAffList();
}
function renderAffList() {
  $('aff-list').innerHTML = affirmations.map((a, i) => `
    <li class="aff-item">
      <span class="aff-num">${i + 1}</span>
      <span class="aff-text">${escHtml(a)}</span>
      <button class="aff-del" title="Remove" onclick="removeAff(${i})">✕</button>
    </li>`).join('');
  $('aff-count').textContent = affirmations.length + ' affirmation' + (affirmations.length !== 1 ? 's' : '');
}

/* ── Generate (async job polling) ───────────────────────────────── */
async function generate() {
  if (!selectedProfile) {
    toast('Select a voice profile first (Step 1)', 'err');
    $('sec-voice').scrollIntoView({ behavior:'smooth' }); return;
  }
  if (!affirmations.length) {
    toast('Add at least one affirmation (Step 2)', 'err');
    $('sec-affirmations').scrollIntoView({ behavior:'smooth' }); return;
  }

  $('btn-generate').disabled        = true;
  $('gen-progress').style.display   = 'block';
  $('player-section').style.display = 'none';
  $('gen-status').textContent        = '';
  $('prog-fill').style.width         = '2%';

  const loops   = parseInt($('loops').value);
  const profile = selectedProfile.replace(/_/g, ' ');
  setGenMsg('Submitting job...');

  try {
    const res  = await fetch(`${API}/synthesize`, {
      method : 'POST',
      headers: { 'Content-Type':'application/json' },
      body   : JSON.stringify({
        affirmations : affirmations,
        loops        : loops,
        pause_ms     : parseInt($('pause-slider').value),
        exaggeration : parseFloat($('exag-slider').value),
        cfg_weight   : parseFloat($('cfg-slider').value),
        profile_name : selectedProfile,
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to start synthesis');
    pollJob(data.job_id, data.total, loops, profile);
  } catch(err) {
    $('gen-progress').style.display = 'none';
    setGenStatus('Error: ' + err.message, 'err');
    toast('Error: ' + err.message, 'err');
    $('btn-generate').disabled = false;
  }
}

async function pollJob(jobId, total, loops, profileLabel) {
  const estMin = Math.max(1, Math.round(total * 1.5));
  setGenMsg(
    `Synthesizing ${total} affirmation${total !== 1 ? 's' : ''} x ${loops} loop${loops !== 1 ? 's' : ''} ` +
    `using voice "${profileLabel}" -- running on CPU, ~${estMin} min estimated. ` +
    `Page will update automatically when done.`
  );

  async function check() {
    try {
      const res = await fetch(`${API}/jobs/${jobId}`);
      const job = await res.json();
      if (!res.ok) throw new Error(job.error || 'Poll error');

      const pct = job.total > 0
        ? Math.min(2 + Math.round((job.current / job.total) * 95), 97)
        : 10;
      $('prog-fill').style.width = pct + '%';

      if (job.state === 'running' || job.state === 'queued') {
        setGenMsg(
          `Processing affirmation ${job.current + 1} of ${job.total} ` +
          `using voice "${profileLabel}"... (CPU synthesis -- do not close this tab)`
        );
        setTimeout(check, 4000);

      } else if (job.state === 'done') {
        $('prog-fill').style.width = '100%';
        await new Promise(r => setTimeout(r, 300));
        $('gen-progress').style.display = 'none';

        currentAudioId             = job.audio_id;
        $('out-audio').src         = `${API}/audio/${job.audio_id}`;
        $('btn-download').href     = `${API}/download/${job.audio_id}`;
        $('btn-download').download = `subliminal_${selectedProfile}.wav`;
        $('audio-meta').textContent =
          `${job.affirmation_count} affirmations x ${job.loops} loops x ${job.duration_sec}s | voice: ${profileLabel}`;
        $('player-section').style.display = 'block';
        setGenStatus('Your subliminal is ready!', 'ok');
        toast('Generation complete', 'ok');
        $('btn-generate').disabled = false;
        $('sec-generate').scrollIntoView({ behavior:'smooth' });

      } else if (job.state === 'error') {
        $('gen-progress').style.display = 'none';
        setGenStatus('Error: ' + job.error, 'err');
        toast('Synthesis failed: ' + job.error, 'err');
        $('btn-generate').disabled = false;

      } else {
        setTimeout(check, 4000);
      }
    } catch(e) {
      setTimeout(check, 5000);
    }
  }
  check();
}

/* ── Utils ──────────────────────────────────────────────────────── */
function setVoiceStatus(msg, cls) {
  const el = $('voice-status');
  el.textContent = msg;
  el.className   = 'status-bar' + (cls ? ' ' + cls : '');
}
function setGenMsg(msg) { $('gen-status-msg').textContent = msg; }
function setGenStatus(msg, cls) {
  const el = $('gen-status');
  el.textContent = msg;
  el.className   = 'status-bar' + (cls ? ' ' + cls : '');
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(s) {
  return String(s).replace(/'/g,"\\'").replace(/"/g,'&quot;');
}
let toastTimer = null;
function toast(msg, cls) {
  const el = $('toast');
  el.textContent = msg;
  el.className   = 'toast show' + (cls ? ' ' + cls : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3500);
}


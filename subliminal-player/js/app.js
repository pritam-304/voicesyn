/* ================================================================
   Subliminal Mind — app.js  v2
   Subliminal mode · New ambient sounds · Dual volume control
   Pure browser: Web Speech API + Web Audio API · No backend
   ================================================================ */

/* ── Voice definitions ─────────────────────────────────────────── */
const TARGET_VOICES = [
  { id:'guy',         rank:'#1',  name:'Guy (Natural)',         source:'Microsoft Neural',
    desc:'Smooth, neutral American. No regional shading. Best all-round for affirmations.',
    match:['Microsoft Guy Online (Natural)','Microsoft Guy','guy'], fallback:false },
  { id:'andrew',      rank:'#2',  name:'Andrew (Natural)',      source:'Microsoft Neural',
    desc:'Warm, conversational. Feels personal — ideal for self-affirmation work.',
    match:['Microsoft Andrew Online (Natural)','Microsoft Andrew','andrew'], fallback:false },
  { id:'christopher', rank:'#3',  name:'Christopher (Natural)', source:'Microsoft Neural',
    desc:'Clear, calm, professional. Meditative delivery for deep absorption.',
    match:['Microsoft Christopher Online (Natural)','Microsoft Christopher','christopher'], fallback:false },
  { id:'google',      rank:'Alt', name:'Google US English ♂',   source:'Google (Chrome)',
    desc:'Cross-platform fallback. Available in Chrome on any OS.',
    match:['Google US English','en-US-Neural2-D','en-US-Standard-B','en-US-Standard-D'], fallback:true },
];

/* ── Subliminal thresholds ─────────────────────────────────────── */
const SUBLIMINAL_VOL      = 0.02;   // 2% — genuinely below conscious perception
const SUBLIMINAL_AMB_VOL  = 0.72;   // ambient masking boosted to cover the whisper
const NORMAL_VOL          = 0.85;
const NORMAL_AMB_VOL      = 0.35;

/* ── Default affirmations ──────────────────────────────────────── */
const DEFAULT_AFFIRMATIONS = [
  'I am calm, confident, and in control.',
  'My mind is clear and deeply focused.',
  'I attract positivity and abundance effortlessly.',
  'I deserve love, success, and happiness.',
  'Every day I grow stronger and wiser.',
  'I am at peace with myself and the world.',
  'My subconscious mind embraces positive change.',
  'I radiate confidence and inner strength.',
  'I release all fear and embrace limitless possibility.',
  'I am exactly where I need to be.',
];

/* ── State ─────────────────────────────────────────────────────── */
let availableVoices  = [];
let selectedVoiceObj = null;
let affirmations     = [];
let isPlaying        = false;
let isPaused         = false;
let currentIdx       = 0;
let currentLoop      = 1;
let pauseTimer       = null;
let activeAmbient    = 'campfire';
let audioCtx         = null;
let ambientNodes     = {};
let ambientMaster    = null;
let subliminalMode   = false;

let activeMask   = 'brown';
let maskNodes    = {};
let maskMaster   = null;

const $ = id => document.getElementById(id);

/* ════════════════════════════════════════════════════════════════
   INIT
   ════════════════════════════════════════════════════════════════*/
document.addEventListener('DOMContentLoaded', () => {
  initVoices();
  initControls();
  renderAffList();
  updateDepthMeter(SUBLIMINAL_VOL);
  setTimeout(() => selectAmbient('campfire'), 400);
  setTimeout(() => selectMask('brown'), 600);
});

/* ════════════════════════════════════════════════════════════════
   VOICES
   ════════════════════════════════════════════════════════════════*/
function initVoices() {
  const load = () => {
    availableVoices = speechSynthesis.getVoices();
    renderVoiceCards();
    for (const tv of TARGET_VOICES) {
      const v = findVoice(tv);
      if (v) { selectVoice(tv.id, v); break; }
    }
  };
  if (speechSynthesis.getVoices().length) load();
  else speechSynthesis.onvoiceschanged = load;
  setTimeout(load, 1200);
}

function findVoice(tvDef) {
  for (const frag of tvDef.match) {
    const v = availableVoices.find(v => v.name.toLowerCase().includes(frag.toLowerCase()));
    if (v) return v;
  }
  return null;
}

function renderVoiceCards() {
  $('voice-cards').innerHTML = TARGET_VOICES.map(tv => {
    const voice = findVoice(tv);
    const avail = !!voice;
    const sText = avail ? (tv.fallback ? '⚠ Available (fallback)' : '✔ Available') : '✗ Not found — use Microsoft Edge';
    const sCls  = avail ? (tv.fallback ? 'fb' : 'ok') : 'no';
    return `
    <div class="voice-card ${avail ? '' : 'unavailable'}" id="vc-${tv.id}"
         data-id="${tv.id}" onclick="clickVoiceCard('${tv.id}')">
      <div class="vc-rank">${tv.rank}</div>
      <div class="vc-name">${tv.name}</div>
      <div class="vc-source">${tv.source}</div>
      <div class="vc-desc">${tv.desc}</div>
      <div class="vc-status ${sCls}">${sText}</div>
      ${avail ? `<button class="btn-preview" onclick="event.stopPropagation();previewVoice('${tv.id}')">▶ Preview</button>` : ''}
    </div>`;
  }).join('');
}

function clickVoiceCard(id) {
  const tv = TARGET_VOICES.find(v => v.id === id);
  const v  = findVoice(tv);
  if (!v) { toast('Voice not available on this system', 'err'); return; }
  selectVoice(id, v);
}

function selectVoice(id, voiceObj) {
  selectedVoiceObj = voiceObj;
  document.querySelectorAll('.voice-card').forEach(el => el.classList.remove('selected'));
  const el = $('vc-' + id);
  if (el) el.classList.add('selected');
}

function previewVoice(id) {
  const tv = TARGET_VOICES.find(v => v.id === id);
  const v  = findVoice(tv);
  if (!v) return;
  speechSynthesis.cancel();
  const u    = new SpeechSynthesisUtterance('I am calm, confident, and deeply focused.');
  u.voice    = v;
  u.rate     = parseFloat($('rate-slider').value);
  u.pitch    = parseFloat($('pitch-slider').value);
  u.volume   = subliminalMode ? SUBLIMINAL_VOL : parseFloat($('voice-vol').value);
  speechSynthesis.speak(u);
  selectVoice(id, v);
}

/* ════════════════════════════════════════════════════════════════
   SUBLIMINAL MODE
   ════════════════════════════════════════════════════════════════*/
function toggleSubliminal() {
  subliminalMode = !subliminalMode;
  const toggle = $('sub-toggle');
  const banner = $('sub-banner');
  const title  = $('sub-toggle-title');
  const desc   = $('sub-toggle-desc');
  const icon   = toggle.querySelector('.sub-icon');
  const vr     = $('voice-range');

  toggle.classList.toggle('active', subliminalMode);
  banner.style.display = subliminalMode ? 'flex' : 'none';

  if (subliminalMode) {
    title.textContent = 'Subliminal Mode ON';
    desc.textContent  = 'Voice whispers below consciousness — subconscious hears it';
    icon.textContent  = '🔕';
    $('voice-vol').value = SUBLIMINAL_VOL;
    $('voice-vol-val').textContent = Math.round(SUBLIMINAL_VOL * 100) + '%';
    $('amb-vol').value = SUBLIMINAL_AMB_VOL;
    $('amb-vol-val').textContent = Math.round(SUBLIMINAL_AMB_VOL * 100) + '%';
    if (ambientMaster) ambientMaster.gain.value = SUBLIMINAL_AMB_VOL;
    $('mask-vol').value = 0.88;
    $('mask-vol-val').textContent = '88%';
    if (maskMaster) maskMaster.gain.value = 0.88;
    $('voice-vol-sub').textContent = 'Whispering below conscious threshold ✓';
    if (vr) vr.classList.add('subliminal');
  } else {
    title.textContent = 'Normal Mode';
    desc.textContent  = 'Voice is audible alongside sound';
    icon.textContent  = '🔊';
    $('voice-vol').value = NORMAL_VOL;
    $('voice-vol-val').textContent = Math.round(NORMAL_VOL * 100) + '%';
    $('amb-vol').value = NORMAL_AMB_VOL;
    $('amb-vol-val').textContent = Math.round(NORMAL_AMB_VOL * 100) + '%';
    if (ambientMaster) ambientMaster.gain.value = NORMAL_AMB_VOL;
    $('mask-vol').value = 0.60;
    $('mask-vol-val').textContent = '60%';
    if (maskMaster) maskMaster.gain.value = 0.60;
    $('voice-vol-sub').textContent = 'Audible alongside background sound';
    if (vr) vr.classList.remove('subliminal');
  }
  updateDepthMeter(parseFloat($('voice-vol').value));
  toast(subliminalMode
    ? '🔕 Subliminal mode ON — voice will whisper below consciousness'
    : '🔊 Normal mode ON', subliminalMode ? 'info' : '');
}

function updateDepthMeter(vol) {
  const pct  = Math.round(vol * 100);
  const bar  = $('depth-bar');
  const zone = $('depth-zone');
  if (!bar) return;
  bar.style.width = Math.min(pct, 100) + '%';
  if (pct <= 5) {
    bar.style.background = 'linear-gradient(90deg,#22c55e,#16a34a)';
    zone.textContent = 'Deep ✓'; zone.style.color = 'var(--green)';
  } else if (pct <= 15) {
    bar.style.background = 'linear-gradient(90deg,#fbbf24,#f59e0b)';
    zone.textContent = 'Borderline'; zone.style.color = 'var(--gold)';
  } else {
    bar.style.background = 'linear-gradient(90deg,#ef4444,#dc2626)';
    zone.textContent = 'Audible ⚠'; zone.style.color = 'var(--red)';
  }
}

/* ════════════════════════════════════════════════════════════════
   CONTROLS
   ════════════════════════════════════════════════════════════════*/
function initControls() {
  $('rate-slider').addEventListener('input', e => {
    $('rate-val').textContent = parseFloat(e.target.value).toFixed(2) + '×';
  });
  $('pitch-slider').addEventListener('input', e => {
    $('pitch-val').textContent = parseFloat(e.target.value).toFixed(2);
  });
  $('voice-vol').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    $('voice-vol-val').textContent = Math.round(v * 100) + '%';
    updateDepthMeter(v);
  });
  $('mask-vol').addEventListener('input', e => {
    $('mask-vol-val').textContent = Math.round(e.target.value * 100) + '%';
    if (maskMaster) maskMaster.gain.value = parseFloat(e.target.value);
  });
  document.querySelectorAll('.mask-card').forEach(el => {
    el.addEventListener('click', () => selectMask(el.dataset.mask));
  });
  $('amb-vol').addEventListener('input', e => {
    $('amb-vol-val').textContent = Math.round(e.target.value * 100) + '%';
    if (ambientMaster) ambientMaster.gain.value = parseFloat(e.target.value);
  });
  $('pause-slider').addEventListener('input', e => {
    $('pause-val').textContent = parseFloat(e.target.value).toFixed(1) + 's';
  });
  $('aff-input').addEventListener('keydown', e => { if (e.key === 'Enter') addAff(); });
  $('btn-add').addEventListener('click', addAff);
  $('btn-bulk').addEventListener('click', bulkAdd);
  $('btn-clear').addEventListener('click', clearAff);
  $('btn-load-defaults').addEventListener('click', loadDefaults);
  document.querySelectorAll('.amb-card').forEach(el => {
    el.addEventListener('click', () => selectAmbient(el.dataset.sound));
  });
  $('loop-inf').addEventListener('change', e => { $('loops').disabled = e.target.checked; });
  $('btn-play').addEventListener('click',  startPlayback);
  $('btn-pause').addEventListener('click', pausePlayback);
  $('btn-stop').addEventListener('click',  stopPlayback);
}

/* ════════════════════════════════════════════════════════════════
   AFFIRMATIONS
   ════════════════════════════════════════════════════════════════*/
function addAff() {
  const v = $('aff-input').value.trim();
  if (!v) return;
  affirmations.push(v); $('aff-input').value = ''; renderAffList();
}
function bulkAdd() {
  const lines = $('bulk-input').value.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return;
  affirmations.push(...lines); $('bulk-input').value = ''; renderAffList();
  toast(`Added ${lines.length} affirmations`, 'info');
}
function removeAff(i) { affirmations.splice(i, 1); renderAffList(); }
function clearAff() {
  if (!affirmations.length) return;
  if (!confirm('Clear all?')) return;
  affirmations = []; renderAffList();
}
function loadDefaults() {
  affirmations = [...DEFAULT_AFFIRMATIONS]; renderAffList();
  toast('Sample affirmations loaded', 'info');
}
function renderAffList() {
  $('aff-list').innerHTML = affirmations.map((a, i) => `
    <li class="aff-item" id="aff-item-${i}">
      <span class="aff-num">${i + 1}</span>
      <span class="aff-text">${escHtml(a)}</span>
      <button class="aff-del" onclick="removeAff(${i})">✕</button>
    </li>`).join('');
  $('aff-count').textContent = affirmations.length + ' affirmation' + (affirmations.length !== 1 ? 's' : '');
}

/* ════════════════════════════════════════════════════════════════
   AUDIO CONTEXT
   ════════════════════════════════════════════════════════════════*/
function ensureAudioCtx() {
  if (!audioCtx) {
    audioCtx      = new (window.AudioContext || window.webkitAudioContext)();
    ambientMaster = audioCtx.createGain();
    ambientMaster.gain.value = parseFloat($('amb-vol').value);
    ambientMaster.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

/* ── Stop ambient (─────────────────────────────────────────── */
function stopAmbient() {
  clearTimeout(ambientNodes._chirpTimer);
  clearTimeout(ambientNodes._bowlTimer);
  clearTimeout(ambientNodes._thunderTimer);
  clearTimeout(ambientNodes._omTimer);
  Object.entries(ambientNodes).forEach(([k, n]) => {
    if (k.startsWith('_')) return;
    try { n.stop?.(); n.disconnect?.(); } catch(e) {}
  });
  ambientNodes = {};
}

/* ── Masking sound management ────────────────────────────── */
function stopMask() {
  clearTimeout(maskNodes._vinylTimer);
  Object.entries(maskNodes).forEach(([k, n]) => {
    if (k.startsWith('_')) return;
    try { n.stop?.(); n.disconnect?.(); } catch(e) {}
  });
  maskNodes = {};
}

function selectMask(sound) {
  stopMask();
  activeMask = sound;
  document.querySelectorAll('.mask-card').forEach(el =>
    el.classList.toggle('active', el.dataset.mask === sound)
  );
  if (sound === 'none') return;
  ensureAudioCtx();
  if (!maskMaster) {
    maskMaster = audioCtx.createGain();
    maskMaster.gain.value = parseFloat($('mask-vol').value);
    maskMaster.connect(audioCtx.destination);
  }
  startMask(sound);
}

function startMask(sound) {
  const dest = maskMaster;
  switch(sound) {
    case 'brown':     makeBrownNoiseMask(audioCtx, dest);  break;
    case 'white':     makeWhiteNoiseMask(audioCtx, dest);  break;
    case 'pink':      makePinkNoiseMask(audioCtx, dest);   break;
    case 'waterfall': makeWaterfallMask(audioCtx, dest);   break;
    case 'heavyrain': makeHeavyRainMask(audioCtx, dest);   break;
    case 'fan':       makeBoxFanMask(audioCtx, dest);      break;
    case 'cafe':      makeCafeMurmur(audioCtx, dest);      break;
    case 'vinyl':     makeVinylStatic(audioCtx, dest);     break;
  }
}

/* ── Masking generators ───────────────────────────────────────── */

// Brown Noise: deep rumbling bass — most effective subliminal masker
function makeBrownNoiseMask(ctx, dest) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
  const d   = buf.getChannelData(0);
  let last  = 0;
  for (let i = 0; i < d.length; i++) {
    last = (last + (Math.random()*2-1) * 0.02) * 0.998;
    d[i] = last * 8;
  }
  const src = loopBuf(ctx, buf, null);
  const lpf = ctx.createBiquadFilter(); lpf.type='lowpass'; lpf.frequency.value=900;
  const g   = ctx.createGain(); g.gain.value = 0.85;
  src.connect(lpf); lpf.connect(g); g.connect(dest);
  maskNodes.src1 = src;
}

// White Noise: flat spectrum, maximum coverage
function makeWhiteNoiseMask(ctx, dest) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random()*2-1;
  const src = loopBuf(ctx, buf, null);
  const g   = ctx.createGain(); g.gain.value = 0.55;
  src.connect(g); g.connect(dest);
  maskNodes.src1 = src;
}

// Pink Noise: 1/f — natural warm spectrum, easy to listen to for long sessions
function makePinkNoiseMask(ctx, dest) {
  const buf = makePinkBuf(ctx, 6);
  const src = loopBuf(ctx, buf, null);
  const g   = ctx.createGain(); g.gain.value = 0.80;
  src.connect(g); g.connect(dest);
  maskNodes.src1 = src;
}

// Waterfall: broadband white noise shaped into a roaring cascade
function makeWaterfallMask(ctx, dest) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random()*2-1;
  const src = loopBuf(ctx, buf, null);
  const hpf = ctx.createBiquadFilter(); hpf.type='highpass'; hpf.frequency.value=300;
  const lpf = ctx.createBiquadFilter(); lpf.type='lowpass';  lpf.frequency.value=10000;
  const env = ctx.createGain(); env.gain.value = 0.72;
  const lfo = ctx.createOscillator(); const lfog = ctx.createGain();
  lfo.frequency.value = 0.05; lfog.gain.value = 0.14;
  lfo.connect(lfog); lfog.connect(env.gain); lfo.start();
  src.connect(hpf); hpf.connect(lpf); lpf.connect(env); env.connect(dest);
  maskNodes.src1 = src; maskNodes.lfo1 = lfo;
}

// Heavy Rain: dense high-intensity downpour
function makeHeavyRainMask(ctx, dest) {
  const buf = makePinkBuf(ctx, 6);
  const src = loopBuf(ctx, buf, null);
  const bpf = ctx.createBiquadFilter(); bpf.type='bandpass'; bpf.frequency.value=2600; bpf.Q.value=0.5;
  const hpf = ctx.createBiquadFilter(); hpf.type='highpass'; hpf.frequency.value=700;
  const g   = ctx.createGain(); g.gain.value = 1.0;
  src.connect(bpf); bpf.connect(hpf); hpf.connect(g); g.connect(dest);
  // Rapid patter for intensity
  const lfo = ctx.createOscillator(); const lfog = ctx.createGain();
  lfo.frequency.value = 28; lfog.gain.value = 0.22;
  lfo.connect(lfog); lfog.connect(g.gain); lfo.start();
  maskNodes.src1 = src; maskNodes.lfo1 = lfo;
}

// Box Fan: mechanical hum + brown noise rumble
function makeBoxFanMask(ctx, dest) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
  const d   = buf.getChannelData(0);
  let last  = 0;
  for (let i = 0; i < d.length; i++) {
    last = (last + (Math.random()*2-1)*0.015) * 0.998;
    d[i] = last * 6;
  }
  const src = loopBuf(ctx, buf, null);
  const lpf = ctx.createBiquadFilter(); lpf.type='lowpass'; lpf.frequency.value=650;
  const g   = ctx.createGain(); g.gain.value = 0.7;
  src.connect(lpf); lpf.connect(g); g.connect(dest);
  // Blade hum: 60 Hz fundamental + harmonics (120/180/240)
  [60, 120, 180, 240].forEach(function(f, i) {
    const osc = ctx.createOscillator(); const og = ctx.createGain();
    osc.frequency.value = f; osc.type = 'sine';
    og.gain.value = 0.09 / (i + 1);
    osc.connect(og); og.connect(dest); osc.start();
    maskNodes['fanOsc'+i] = osc;
  });
  maskNodes.src1 = src;
}

// Café Murmur: crowd babble via formant-filtered pink noise
function makeCafeMurmur(ctx, dest) {
  const buf = makePinkBuf(ctx, 8);
  const src = loopBuf(ctx, buf, null);
  // Mouth-cavity formants (conversation frequency bands)
  const f1 = ctx.createBiquadFilter(); f1.type='bandpass'; f1.frequency.value=400;  f1.Q.value=1.5;
  const f2 = ctx.createBiquadFilter(); f2.type='bandpass'; f2.frequency.value=900;  f2.Q.value=2;
  const f3 = ctx.createBiquadFilter(); f3.type='bandpass'; f3.frequency.value=2200; f3.Q.value=2.5;
  const g  = ctx.createGain(); g.gain.value = 0.55;
  // Unfiltered room wash at low level
  const gWash = ctx.createGain(); gWash.gain.value = 0.12;
  src.connect(f1); f1.connect(f2); f2.connect(f3); f3.connect(g); g.connect(dest);
  src.connect(gWash); gWash.connect(dest);
  // Slow burble variation
  const lfo = ctx.createOscillator(); const lfog = ctx.createGain();
  lfo.frequency.value = 0.28; lfog.gain.value = 0.18;
  lfo.connect(lfog); lfog.connect(g.gain); lfo.start();
  maskNodes.src1 = src; maskNodes.lfo1 = lfo;
}

// Vinyl Static: mid-range hiss + occasional vinyl pop crackles
function makeVinylStatic(ctx, dest) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random()*2-1;
  const src = loopBuf(ctx, buf, null);
  const hpf = ctx.createBiquadFilter(); hpf.type='highpass'; hpf.frequency.value=2800;
  const lpf = ctx.createBiquadFilter(); lpf.type='lowpass';  lpf.frequency.value=12000;
  const g   = ctx.createGain(); g.gain.value = 0.45;
  src.connect(hpf); hpf.connect(lpf); lpf.connect(g); g.connect(dest);
  // Vinyl pops
  function pop() {
    if (!audioCtx) return;
    const t   = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.022);
    const pb  = ctx.createBuffer(1, len, ctx.sampleRate);
    const pd  = pb.getChannelData(0);
    for (let i = 0; i < len; i++) pd[i] = (Math.random()*2-1) * (1 - i/len);
    const pSrc = ctx.createBufferSource(); pSrc.buffer = pb;
    const eg = ctx.createGain();
    eg.gain.setValueAtTime(0.25 + Math.random()*0.35, t);
    eg.gain.exponentialRampToValueAtTime(0.001, t + 0.022);
    pSrc.connect(eg); eg.connect(dest); pSrc.start(t);
    maskNodes._vinylTimer = setTimeout(pop, 700 + Math.random() * 2200);
  }
  maskNodes._vinylTimer = setTimeout(pop, 400);
  maskNodes.src1 = src;
}

/* ── Select ambient ─────────────────────────────────────────── */
function selectAmbient(sound) {
  stopAmbient();
  activeAmbient = sound;
  document.querySelectorAll('.amb-card').forEach(el =>
    el.classList.toggle('active', el.dataset.sound === sound)
  );
  if (sound !== 'none') {
    ensureAudioCtx();
    startAmbient(sound);
  }
}

/* ════════════════════════════════════════════════════════════════
   AMBIENT SOUND GENERATORS
   ════════════════════════════════════════════════════════════════*/

/* Shared: pink noise buffer */
function makePinkBuf(ctx, seconds) {
  seconds = seconds || 5;
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d   = buf.getChannelData(0);
  let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759;
    b2=0.96900*b2+w*0.1538520; b3=0.86650*b3+w*0.3104856;
    b4=0.55000*b4+w*0.5329522; b5=-0.7616*b5-w*0.0168980;
    d[i]=(b0+b1+b2+b3+b4+b5+b6+w*0.5362)*0.11; b6=w*0.115926;
  }
  return buf;
}

function loopBuf(ctx, buf, dest) {
  const src = ctx.createBufferSource();
  src.buffer = buf; src.loop = true;
  if (dest) src.connect(dest);
  src.start();
  return src;
}

/* ── Campfire 🔥 ──────────────────────────────────────────────── */
function makeCampfire(ctx, dest) {
  const browBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
  const bd = browBuf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < bd.length; i++) {
    last = (last + (Math.random()*2-1)*0.02) * 0.997;
    bd[i] = last * 6;
  }
  const browSrc = loopBuf(ctx, browBuf, null);
  const lpf  = ctx.createBiquadFilter(); lpf.type='lowpass'; lpf.frequency.value=350;
  const gBrown = ctx.createGain(); gBrown.gain.value = 0.6;
  browSrc.connect(lpf); lpf.connect(gBrown); gBrown.connect(dest);

  function crackle() {
    if (!audioCtx) return;
    const t   = ctx.currentTime;
    const len = ctx.sampleRate * 0.04;
    const cb  = ctx.createBuffer(1, len, ctx.sampleRate);
    const cd  = cb.getChannelData(0);
    for (let i = 0; i < len; i++) cd[i] = (Math.random()*2-1) * (1 - i/len);
    const cSrc = ctx.createBufferSource(); cSrc.buffer = cb;
    const eg = ctx.createGain();
    eg.gain.setValueAtTime(0, t);
    eg.gain.linearRampToValueAtTime(0.4 + Math.random()*0.3, t + 0.005);
    eg.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    const hpf = ctx.createBiquadFilter(); hpf.type='highpass'; hpf.frequency.value=600;
    cSrc.connect(hpf); hpf.connect(eg); eg.connect(dest);
    cSrc.start(t);
    ambientNodes._chirpTimer = setTimeout(crackle, 80 + Math.random() * 300);
  }
  ambientNodes._chirpTimer = setTimeout(crackle, 200);
  ambientNodes.src1 = browSrc;
}

/* ── Thunderstorm ⛈ ───────────────────────────────────────────── */
function makeThunderstorm(ctx, dest) {
  const pinkBuf = makePinkBuf(ctx, 6);
  const src     = loopBuf(ctx, pinkBuf, null);
  const bpf = ctx.createBiquadFilter(); bpf.type='bandpass'; bpf.frequency.value=2200; bpf.Q.value=0.6;
  const hpf = ctx.createBiquadFilter(); hpf.type='highpass'; hpf.frequency.value=600;
  const g   = ctx.createGain(); g.gain.value = 0.9;
  src.connect(bpf); bpf.connect(hpf); hpf.connect(g); g.connect(dest);
  ambientNodes.src1 = src;

  function thunder() {
    if (!audioCtx) return;
    const t   = ctx.currentTime;
    const dur = 2.5 + Math.random() * 3;
    const tBuf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const td   = tBuf.getChannelData(0);
    for (let i = 0; i < td.length; i++) td[i] = (Math.random()*2-1) * (1 - i/(td.length * 0.8));
    const tSrc = ctx.createBufferSource(); tSrc.buffer = tBuf;
    const tlpf = ctx.createBiquadFilter(); tlpf.type='lowpass'; tlpf.frequency.value=120;
    const tEg  = ctx.createGain();
    tEg.gain.setValueAtTime(0, t);
    tEg.gain.linearRampToValueAtTime(0.9, t + 0.1);
    tEg.gain.exponentialRampToValueAtTime(0.001, t + dur);
    tSrc.connect(tlpf); tlpf.connect(tEg); tEg.connect(dest);
    tSrc.start(t);
    ambientNodes._thunderTimer = setTimeout(thunder, 6000 + Math.random() * 12000);
  }
  ambientNodes._thunderTimer = setTimeout(thunder, 3000 + Math.random() * 5000);
}

/* ── Deep ocean 🌊 ────────────────────────────────────────────── */
function makeOcean(ctx, dest) {
  const pinkBuf = makePinkBuf(ctx, 6);
  const src     = loopBuf(ctx, pinkBuf, null);
  const lpf  = ctx.createBiquadFilter(); lpf.type='lowpass'; lpf.frequency.value=550;
  const env  = ctx.createGain(); env.gain.value = 0.5;
  src.connect(lpf); lpf.connect(env); env.connect(dest);
  const lfo = ctx.createOscillator(); const lfog = ctx.createGain();
  lfo.frequency.value=0.11; lfog.gain.value=0.5; lfo.connect(lfog); lfog.connect(env.gain); lfo.start();
  const lfo2 = ctx.createOscillator(); const lfog2 = ctx.createGain();
  lfo2.frequency.value=0.07; lfog2.gain.value=0.3; lfo2.connect(lfog2); lfog2.connect(env.gain); lfo2.start();
  ambientNodes.src1=src; ambientNodes.lfo1=lfo; ambientNodes.lfo2=lfo2;
}

/* ── Gentle rain 🌧 ───────────────────────────────────────────── */
function makeRain(ctx, dest) {
  const pinkBuf = makePinkBuf(ctx, 5);
  const src     = loopBuf(ctx, pinkBuf, null);
  const bpf = ctx.createBiquadFilter(); bpf.type='bandpass'; bpf.frequency.value=1800; bpf.Q.value=0.7;
  const hpf = ctx.createBiquadFilter(); hpf.type='highpass'; hpf.frequency.value=500;
  const env = ctx.createGain(); env.gain.value = 0.7;
  src.connect(bpf); bpf.connect(hpf); hpf.connect(env); env.connect(dest);
  const lfo = ctx.createOscillator(); const lfog = ctx.createGain();
  lfo.frequency.value=9; lfog.gain.value=0.12; lfo.connect(lfog); lfog.connect(env.gain); lfo.start();
  ambientNodes.src1=src; ambientNodes.lfo1=lfo;
}

/* ── Forest 🌿 ────────────────────────────────────────────────── */
function makeForest(ctx, dest) {
  const pinkBuf = makePinkBuf(ctx, 5);
  const src     = loopBuf(ctx, pinkBuf, null);
  const lpf = ctx.createBiquadFilter(); lpf.type='lowpass'; lpf.frequency.value=1800;
  const hpf = ctx.createBiquadFilter(); hpf.type='highpass'; hpf.frequency.value=150;
  const g   = ctx.createGain(); g.gain.value = 0.4;
  src.connect(lpf); lpf.connect(hpf); hpf.connect(g); g.connect(dest);
  ambientNodes.src1 = src;

  function chirp() {
    if (!audioCtx) return;
    const t    = ctx.currentTime;
    const osc  = ctx.createOscillator();
    const eg   = ctx.createGain();
    const freq = 2100 + Math.random()*1600;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.linearRampToValueAtTime(freq + 200, t + 0.08);
    osc.type = 'sine';
    eg.gain.setValueAtTime(0, t);
    eg.gain.linearRampToValueAtTime(0.18, t + 0.03);
    eg.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(eg); eg.connect(dest);
    osc.start(t); osc.stop(t + 0.25);
    if (Math.random() > 0.6) {
      const osc2 = ctx.createOscillator(); const eg2 = ctx.createGain();
      osc2.frequency.value = freq * 1.05; osc2.type='sine';
      eg2.gain.setValueAtTime(0,t+0.15); eg2.gain.linearRampToValueAtTime(0.14,t+0.18);
      eg2.gain.exponentialRampToValueAtTime(0.001,t+0.35);
      osc2.connect(eg2); eg2.connect(dest); osc2.start(t+0.15); osc2.stop(t+0.38);
    }
    ambientNodes._chirpTimer = setTimeout(chirp, 1200 + Math.random()*3500);
  }
  ambientNodes._chirpTimer = setTimeout(chirp, 500);
}

/* ── Night crickets 🦗 ────────────────────────────────────────── */
function makeNight(ctx, dest) {
  const buf = ctx.createBuffer(1, ctx.sampleRate*3, ctx.sampleRate);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random()*2-1;
  const nSrc = loopBuf(ctx, buf, null);
  const bpf  = ctx.createBiquadFilter(); bpf.type='bandpass'; bpf.frequency.value=4800; bpf.Q.value=4;
  const bpf2 = ctx.createBiquadFilter(); bpf2.type='bandpass'; bpf2.frequency.value=5400; bpf2.Q.value=5;
  const g    = ctx.createGain(); g.gain.value = 0.55;
  const lfo  = ctx.createOscillator(); const lfog = ctx.createGain();
  lfo.frequency.value=20; lfog.gain.value=0.5; lfo.connect(lfog); lfog.connect(g.gain); lfo.start();
  nSrc.connect(bpf); bpf.connect(bpf2); bpf2.connect(g); g.connect(dest);
  const lfo2 = ctx.createOscillator(); const lfog2 = ctx.createGain();
  lfo2.frequency.value=0.06; lfog2.gain.value=0.2; lfo2.connect(lfog2); lfog2.connect(g.gain); lfo2.start();
  ambientNodes.src1=nSrc; ambientNodes.lfo1=lfo; ambientNodes.lfo2=lfo2;
}

/* ── Mountain wind 🍃 ─────────────────────────────────────────── */
function makeMountainWind(ctx, dest) {
  const pinkBuf = makePinkBuf(ctx, 8);
  const src     = loopBuf(ctx, pinkBuf, null);
  const bpf = ctx.createBiquadFilter(); bpf.type='lowpass'; bpf.frequency.value=1200;
  const hpf = ctx.createBiquadFilter(); hpf.type='highpass'; hpf.frequency.value=80;
  const env = ctx.createGain(); env.gain.value = 0.35;
  src.connect(bpf); bpf.connect(hpf); hpf.connect(env); env.connect(dest);
  const lfo = ctx.createOscillator(); const lfog = ctx.createGain();
  lfo.type='sine'; lfo.frequency.value=0.04; lfog.gain.value=0.32;
  lfo.connect(lfog); lfog.connect(env.gain); lfo.start();
  const lfo2 = ctx.createOscillator(); const lfog2 = ctx.createGain();
  lfo2.type='sine'; lfo2.frequency.value=0.18; lfog2.gain.value=0.18;
  lfo2.connect(lfog2); lfog2.connect(env.gain); lfo2.start();
  const lfo3 = ctx.createOscillator(); const lfog3 = ctx.createGain();
  lfo3.frequency.value=0.03; lfog3.gain.value=400;
  lfo3.connect(lfog3); lfog3.connect(bpf.frequency); lfo3.start();
  ambientNodes.src1=src; ambientNodes.lfo1=lfo; ambientNodes.lfo2=lfo2; ambientNodes.lfo3=lfo3;
}

/* ── Forest stream 💧 ─────────────────────────────────────────── */
function makeStream(ctx, dest) {
  const pinkBuf = makePinkBuf(ctx, 5);
  const src     = loopBuf(ctx, pinkBuf, null);
  const bpf  = ctx.createBiquadFilter(); bpf.type='bandpass'; bpf.frequency.value=2800; bpf.Q.value=1.2;
  const bpf2 = ctx.createBiquadFilter(); bpf2.type='highpass'; bpf2.frequency.value=500;
  const g    = ctx.createGain(); g.gain.value = 0.65;
  src.connect(bpf); bpf.connect(bpf2); bpf2.connect(g); g.connect(dest);
  const lfo1 = ctx.createOscillator(); const lg1 = ctx.createGain();
  lfo1.frequency.value=14; lg1.gain.value=0.18; lfo1.connect(lg1); lg1.connect(g.gain); lfo1.start();
  const lfo2 = ctx.createOscillator(); const lg2 = ctx.createGain();
  lfo2.frequency.value=0.25; lg2.gain.value=0.25; lfo2.connect(lg2); lg2.connect(g.gain); lfo2.start();
  ambientNodes.src1=src; ambientNodes.lfo1=lfo1; ambientNodes.lfo2=lfo2;
}

/* ── Singing bowl 🎵 ──────────────────────────────────────────── */
function makeSingingBowl(ctx, dest) {
  const baseFreq = 432;
  function ring() {
    if (!audioCtx) return;
    const t   = ctx.currentTime;
    const dur = 6 + Math.random() * 3;
    [[1,0.6],[2.756,0.25],[5.404,0.12],[8.93,0.06]].forEach(function(pair) {
      const mult = pair[0]; const amp = pair[1];
      const osc = ctx.createOscillator();
      const eg  = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = baseFreq * mult;
      eg.gain.setValueAtTime(0, t);
      eg.gain.linearRampToValueAtTime(amp * 0.4, t + 0.08);
      eg.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(eg); eg.connect(dest);
      osc.start(t); osc.stop(t + dur + 0.1);
    });
    ambientNodes._bowlTimer = setTimeout(ring, (dur + 1 + Math.random()*2) * 1000);
  }
  ring();
}

/* ── Deep space 🌌 ────────────────────────────────────────────── */
function makeSpace(ctx, dest) {
  var freqs = [40, 55, 82, 110, 164];
  freqs.forEach(function(f, idx) {
    const osc  = ctx.createOscillator();
    const gn   = ctx.createGain();
    const lfo  = ctx.createOscillator();
    const lfog = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = f;
    gn.gain.value = 0.22 / (idx + 1);
    lfo.frequency.value = 0.02 + idx * 0.008;
    lfog.gain.value = 0.08;
    lfo.connect(lfog); lfog.connect(gn.gain);
    osc.connect(gn); gn.connect(dest);
    osc.start(); lfo.start();
    ambientNodes['osc' + idx] = osc;
    ambientNodes['lfo' + idx] = lfo;
  });
  const pinkBuf = makePinkBuf(ctx, 8);
  const nSrc    = loopBuf(ctx, pinkBuf, null);
  const lpf = ctx.createBiquadFilter(); lpf.type='lowpass'; lpf.frequency.value=200;
  const ng  = ctx.createGain(); ng.gain.value = 0.08;
  nSrc.connect(lpf); lpf.connect(ng); ng.connect(dest);
  ambientNodes.nSrc = nSrc;
}

/* ── Om chant 🕉 ─────────────────────────────────────────────── */
// Fundamental at 136.1 Hz ("Om" / Earth frequency / C#3)
// Layered with vowel formants (A→U→M) using resonant filters
function makeOmChant(ctx, dest) {
  const base = 136.1;

  // Harmonic stack: fundamental + overtones at natural ratios
  const partials = [
    [1,     0.55],  // fundamental
    [2,     0.28],  // octave
    [3,     0.16],  // perfect fifth
    [4,     0.10],  // double octave
    [5,     0.07],  // major third
    [6,     0.05],  // natural seventh
    [8,     0.03],  // triple octave shimmer
  ];

  const droneGain = ctx.createGain();
  droneGain.gain.value = 0;
  droneGain.connect(dest);
  // Slow fade-in over 3s
  droneGain.gain.linearRampToValueAtTime(0.6, ctx.currentTime + 3);

  partials.forEach(function(p, i) {
    const osc  = ctx.createOscillator();
    const g    = ctx.createGain();
    // Slight detune per partial for organic warmth
    osc.frequency.value = base * p[0] + (Math.random() - 0.5) * 0.4;
    osc.type = 'sine';
    g.gain.value = p[1];
    // Very slow vibrato on each partial at different rates
    const vib  = ctx.createOscillator();
    const vibg = ctx.createGain();
    vib.frequency.value = 0.08 + i * 0.013;
    vibg.gain.value     = 0.18;
    vib.connect(vibg); vibg.connect(osc.frequency);
    osc.connect(g); g.connect(droneGain);
    osc.start(); vib.start();
    ambientNodes['omOsc' + i]  = osc;
    ambientNodes['omVib' + i]  = vib;
    ambientNodes['omDroneG']   = droneGain;
  });

  // Vowel formant sweep: bandpass filters cycle A(700Hz) → U(350Hz) → M(hum)
  // One filter slowly sweeps, mimicking mouth cavity change
  const fmtFreqs = [700, 1100, 350, 800, 700]; // A-U-M cycling
  let fmtIdx = 0;

  // Pink noise bed — adds breath texture
  const pinkBuf = makePinkBuf(ctx, 4);
  const nSrc    = loopBuf(ctx, pinkBuf, null);
  const breathLpf = ctx.createBiquadFilter(); breathLpf.type='lowpass'; breathLpf.frequency.value=400;
  const breathG   = ctx.createGain(); breathG.gain.value = 0.04;
  nSrc.connect(breathLpf); breathLpf.connect(breathG); breathG.connect(dest);

  // Formant filter on drone
  const fmt = ctx.createBiquadFilter(); fmt.type='peaking'; fmt.Q.value=3; fmt.gain.value=9;
  fmt.frequency.value = fmtFreqs[0];
  droneGain.disconnect(); droneGain.connect(fmt); fmt.connect(dest);

  function sweepFormant() {
    if (!audioCtx) return;
    fmtIdx = (fmtIdx + 1) % fmtFreqs.length;
    const t   = ctx.currentTime;
    const dur = 6 + Math.random() * 4; // each vowel position holds 6-10s
    fmt.frequency.setTargetAtTime(fmtFreqs[fmtIdx], t, 1.8);
    ambientNodes._omTimer = setTimeout(sweepFormant, dur * 1000);
  }
  ambientNodes._omTimer = setTimeout(sweepFormant, 5000);
  ambientNodes.nSrc     = nSrc;
}

/* ── Binaural beats ───────────────────────────────────────────── */
function makeBinaural(ctx, dest, beatFreq) {
  const base   = 180;
  const merger = ctx.createChannelMerger(2);
  const oscL   = ctx.createOscillator();
  const oscR   = ctx.createOscillator();
  oscL.frequency.value = base; oscR.frequency.value = base + beatFreq;
  oscL.type = oscR.type = 'sine';
  const gL = ctx.createGain(); gL.gain.value = 0;
  const gR = ctx.createGain(); gR.gain.value = 0;
  oscL.connect(gL); gL.connect(merger, 0, 0);
  oscR.connect(gR); gR.connect(merger, 0, 1);
  merger.connect(dest);
  oscL.start(); oscR.start();
  gL.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 2);
  gR.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 2);
  ambientNodes.oscL = oscL; ambientNodes.oscR = oscR;
}

/* ── Dispatcher ───────────────────────────────────────────────── */
function startAmbient(sound) {
  const dest = ambientMaster;
  switch(sound) {
    case 'campfire':     makeCampfire(audioCtx, dest);        break;
    case 'thunderstorm': makeThunderstorm(audioCtx, dest);    break;
    case 'ocean':        makeOcean(audioCtx, dest);           break;
    case 'rain':         makeRain(audioCtx, dest);            break;
    case 'forest':       makeForest(audioCtx, dest);          break;
    case 'night':        makeNight(audioCtx, dest);           break;
    case 'wind':         makeMountainWind(audioCtx, dest);    break;
    case 'stream':       makeStream(audioCtx, dest);          break;
    case 'bowl':         makeSingingBowl(audioCtx, dest);     break;
    case 'space':        makeSpace(audioCtx, dest);           break;
    case 'theta':        makeBinaural(audioCtx, dest, 6);     break;
    case 'delta':        makeBinaural(audioCtx, dest, 2);     break;
    case 'alpha':        makeBinaural(audioCtx, dest, 10);    break;
    case 'om':           makeOmChant(audioCtx, dest);          break;
  }
}

/* ════════════════════════════════════════════════════════════════
   PLAYBACK ENGINE
   ════════════════════════════════════════════════════════════════*/
function startPlayback() {
  if (!affirmations.length) {
    toast('Add affirmations first (Step 2)', 'err');
    $('sec-aff').scrollIntoView({ behavior:'smooth' }); return;
  }
  if (!selectedVoiceObj) {
    toast('No voice found. Open in Microsoft Edge for best results.', 'err'); return;
  }
  if (!audioCtx) ensureAudioCtx();

  speechSynthesis.cancel();
  isPlaying = true; isPaused = false; currentIdx = 0; currentLoop = 1;

  $('btn-play').disabled  = true;
  $('btn-pause').disabled = false;
  $('btn-stop').disabled  = false;
  $('progress-wrap').style.display = 'block';
  $('now-playing').style.display   = 'flex';

  speakNext();
}

function speakNext() {
  if (!isPlaying) return;
  const infinite = $('loop-inf').checked;
  const maxLoops = parseInt($('loops').value) || 1;

  if (currentIdx >= affirmations.length) {
    if (infinite || currentLoop < maxLoops) {
      currentLoop++; currentIdx = 0;
    } else { finishPlayback(); return; }
  }

  const text = affirmations[currentIdx];
  updateNowPlaying(text);
  updateProgress();
  highlightItem(currentIdx);

  const u  = new SpeechSynthesisUtterance(text);
  u.voice  = selectedVoiceObj;
  u.rate   = parseFloat($('rate-slider').value);
  u.pitch  = parseFloat($('pitch-slider').value);
  // Always enforce subliminal level from the constant, not the slider,
  // so the user can't accidentally drift it back up while mode is active.
  u.volume = subliminalMode ? SUBLIMINAL_VOL : parseFloat($('voice-vol').value);

  u.onend = () => {
    if (!isPlaying) return;
    currentIdx++;
    pauseTimer = setTimeout(speakNext, parseFloat($('pause-slider').value) * 1000);
  };
  u.onerror = e => {
    if (e.error === 'interrupted' || e.error === 'canceled') return;
    currentIdx++;
    pauseTimer = setTimeout(speakNext, 500);
  };
  speechSynthesis.speak(u);
}

function pausePlayback() {
  if (!isPlaying) return;
  if (isPaused) {
    isPaused = false;
    $('btn-pause').textContent = '⏸ Pause';
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    speakNext();
  } else {
    isPaused = true;
    $('btn-pause').textContent = '▶ Resume';
    speechSynthesis.cancel();
    clearTimeout(pauseTimer);
    if (audioCtx && audioCtx.state === 'running') audioCtx.suspend();
  }
}

function stopPlayback() {
  isPlaying = false; isPaused = false;
  speechSynthesis.cancel();
  clearTimeout(pauseTimer);
  $('btn-play').disabled  = false;
  $('btn-pause').disabled = true;
  $('btn-stop').disabled  = true;
  $('btn-pause').textContent = '⏸ Pause';
  $('now-playing').style.display   = 'none';
  $('progress-wrap').style.display = 'none';
  $('prog-fill').style.width = '0%';
  document.querySelectorAll('.aff-item').forEach(el => el.classList.remove('active'));
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

function finishPlayback() { toast('Session complete ✔', 'ok'); stopPlayback(); }

function updateNowPlaying(text) {
  const infinite = $('loop-inf').checked;
  const maxLoops = parseInt($('loops').value);
  const label    = $('np-label');
  const npText   = $('np-text');
  if (subliminalMode) {
    label.textContent      = 'Subliminal session active:';
    npText.textContent     = '(affirmation masked — bypassing conscious filter)';
    npText.style.color     = 'var(--purple)';
    npText.style.fontStyle = 'normal';
    npText.style.fontSize  = '.82rem';
  } else {
    label.textContent      = 'Now reading:';
    npText.textContent     = '"' + text + '"';
    npText.style.color     = '';
    npText.style.fontStyle = 'italic';
    npText.style.fontSize  = '';
  }
  $('np-meta').textContent = 'Affirmation ' + (currentIdx + 1) + ' of ' + affirmations.length +
    ' · Loop ' + currentLoop + (infinite ? ' (∞)' : ' of ' + maxLoops);
}

function updateProgress() {
  $('prog-fill').style.width = (currentIdx / affirmations.length * 100) + '%';
  $('prog-current').textContent = 'Affirmation ' + (currentIdx + 1) + ' / ' + affirmations.length;
  $('prog-loop').textContent = 'Loop ' + currentLoop;
}

function highlightItem(idx) {
  document.querySelectorAll('.aff-item').forEach(el => el.classList.remove('active'));
  const el = $('aff-item-' + idx);
  if (el) { el.classList.add('active'); el.scrollIntoView({ block:'nearest', behavior:'smooth' }); }
}

/* ── Helpers ──────────────────────────────────────────────────── */
function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

let toastTimer = null;
function toast(msg, cls) {
  const el = $('toast');
  el.textContent = msg;
  el.className   = 'toast show' + (cls ? ' ' + cls : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { el.className = 'toast'; }, 3500);
}

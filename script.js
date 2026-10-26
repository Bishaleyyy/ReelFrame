// ReelFrame Creator Studio: resize photos and videos for social ratios, all in the browser
const $ = selector => document.querySelector(selector);
const $$ = selector => document.querySelectorAll(selector);

const el = {
  frame: $('#frame'), img: $('#previewImg'), video: $('#previewVideo'), empty: $('#empty'),
  input: $('#fileInput'), drop: $('#drop'), settings: $('#settings'),
  status: $('#status'), progress: $('#progress'), note: $('#note'),
  exportBtn: $('#exportBtn'), cancelBtn: $('#cancelBtn'), resetBtn: $('#resetBtn')
};

const MAX_SIZE = 1080; // longest side of every export
const FPS = 30;
const DEFAULTS = { ratio: '9/16', mode: 'contain', bg: '#0B1226' };
const TYPES = {
  photo: { accept: 'image/*', prefix: 'image/', hint: 'JPG, PNG or WebP' },
  video: { accept: 'video/*', prefix: 'video/', hint: 'MP4 or WebM' }
};

// Find a video format this browser can record. MP4 comes first because editors import it easily.
const VIDEO_MIME = window.MediaRecorder && [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4',
  'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'
].find(type => MediaRecorder.isTypeSupported(type));
const VIDEO_EXT = VIDEO_MIME && VIDEO_MIME.includes('mp4') ? 'mp4' : 'webm';
const CAN_EXPORT_VIDEO = !!(VIDEO_MIME && HTMLCanvasElement.prototype.captureStream && HTMLMediaElement.prototype.captureStream);

const state = { ...DEFAULTS, type: 'photo', url: null, fileName: '', ready: false };
let job = null; // the running video export, or null when idle

/* ---------- Small helpers ---------- */
const media = () => (state.type === 'photo' ? el.img : el.video);

function outputSize() {
  const [rw, rh] = state.ratio.split('/').map(Number);
  const k = MAX_SIZE / Math.max(rw, rh);
  // Even numbers keep video encoders happy
  return { w: Math.round(rw * k / 2) * 2, h: Math.round(rh * k / 2) * 2 };
}

function say(text, kind = '') {
  el.status.textContent = text;
  el.status.className = 'status ' + kind;
}

function formatTime(seconds) {
  if (!isFinite(seconds)) return '\u2014';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

// Highlight the buttons that match the current state
function mark(selector, isOn, attr = 'aria-pressed') {
  $$(selector).forEach(btn => {
    const on = isOn(btn);
    btn.classList.toggle('active', on);
    btn.setAttribute(attr, on);
  });
}

/* ---------- Drawing the preview and the export panel ---------- */
function render() {
  const { w, h } = outputSize(), isPhoto = state.type === 'photo';
  const ratioText = state.ratio.replace('/', ':');

  el.frame.style.setProperty('--rn', w / h);
  el.frame.style.setProperty('--fill', state.bg);
  [el.img, el.video].forEach(m => (m.style.objectFit = state.mode)); // contain = Fit, cover = Fill/Crop

  mark('[data-type]', b => b.dataset.type === state.type, 'aria-selected');
  mark('[data-ratio]', b => b.dataset.ratio === state.ratio);
  mark('[data-mode]', b => b.dataset.mode === state.mode);
  mark('[data-bg]', b => b.dataset.bg === state.bg);

  $('#bRatio').textContent = ratioText;
  $('#bSize').textContent = `${w} \u00D7 ${h}`;
  $('#bMode').textContent = state.mode === 'cover' ? 'Fill / Crop' : 'Fit';
  $('#exMedia').textContent = isPhoto ? 'Photo' : 'Video';
  $('#exRatio').textContent = ratioText;
  $('#exSize').textContent = `${w} \u00D7 ${h}`;
  $('#exFormat').textContent = isPhoto ? 'PNG' : CAN_EXPORT_VIDEO ? VIDEO_EXT.toUpperCase() : 'Unavailable';
  $('#exportLabel').textContent = isPhoto ? 'Download Image' : 'Export Video';

  el.note.hidden = isPhoto;
  el.note.textContent = CAN_EXPORT_VIDEO
    ? 'Video export records in real time and plays the clip with sound. Keep this tab open until it finishes.'
    : 'Video export is not supported in this browser, so only the preview works. Try the latest Chrome or Edge.';
  el.exportBtn.disabled = !state.ready || (!isPhoto && !CAN_EXPORT_VIDEO) || !!job;
}

function showInfo(name = 'No file selected', dims = '\u2014', duration = '\u2014') {
  $('#fiName').textContent = name;
  $('#fiName').title = name;
  $('#fiDims').textContent = dims;
  $('#fiDur').textContent = duration;
}

/* ---------- Loading files ---------- */
function clearMedia() {
  if (state.url) URL.revokeObjectURL(state.url); // free the old file from memory
  state.url = null;
  state.ready = false;
  [el.img, el.video].forEach(m => { m.hidden = true; m.removeAttribute('src'); });
  el.video.load(); // makes the video element let go of the old file
  el.empty.hidden = false;
  showInfo();
}

function switchType(type) {
  if (type === state.type || job) return;
  state.type = type;
  el.input.accept = TYPES[type].accept;
  $('#dropTitle').textContent = `Drop a ${type} here or browse`;
  $('#dropHint').textContent = TYPES[type].hint;
  $('#emptyText').textContent = `Your ${type} will appear here`;
  $('#fiDurRow').hidden = type === 'photo';
  clearMedia();
  say(`Choose a ${type} to get started.`);
  render();
}

function loadFile(file) {
  if (!file || job) return;
  if (!file.type.startsWith(TYPES[state.type].prefix)) {
    const other = state.type === 'photo' ? 'video' : 'photo';
    return say(file.type.startsWith(TYPES[other].prefix)
      ? `That file is a ${other}. Switch to the ${other} tab first.`
      : `Unsupported file. Choose a ${state.type} (${TYPES[state.type].hint}).`, 'error');
  }
  clearMedia();
  state.url = URL.createObjectURL(file);
  state.fileName = file.name;
  say('Loading file...', 'loading');
  media().src = state.url;
}

function onMediaReady() {
  if (!state.url) return;
  const isPhoto = state.type === 'photo', m = media();
  const [w, h] = isPhoto ? [m.naturalWidth, m.naturalHeight] : [m.videoWidth, m.videoHeight];
  if (!w || !h) return onMediaError(); // for example an audio-only file
  state.ready = true;
  m.hidden = false;
  el.empty.hidden = true;
  showInfo(state.fileName, `${w} \u00D7 ${h} px`, isPhoto ? '\u2014' : formatTime(m.duration));
  say('Ready. Adjust the frame, then export.', 'ok');
  render();
}

function onMediaError() {
  if (!state.url) return; // ignore events caused by clearing the media
  clearMedia();
  say(`Could not load that ${state.type}. The file may be damaged or use a format this browser cannot play.`, 'error');
  render();
}

function resetSettings() {
  Object.assign(state, DEFAULTS);
  if (state.type === 'video' && state.ready) { el.video.pause(); el.video.currentTime = 0; }
  render();
  say('Settings reset to defaults.', 'ok');
}

/* ---------- Exporting ---------- */
// Draws a source (image or video frame) onto the canvas using Fit or Fill/Crop
function drawFrame(ctx, source, sw, sh, cw, ch) {
  ctx.fillStyle = state.bg;
  ctx.fillRect(0, 0, cw, ch);
  // Fit uses the smaller scale (whole picture), Fill/Crop the larger one (centered crop)
  const k = (state.mode === 'cover' ? Math.max : Math.min)(cw / sw, ch / sh);
  ctx.drawImage(source, (cw - sw * k) / 2, (ch - sh * k) / 2, sw * k, sh * k);
}

function saveBlob(blob, name, extra = '') {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  say(`Saved ${name}.${extra}`, 'ok');
}

function exportImage() {
  try {
    const { w, h } = outputSize();
    const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
    drawFrame(canvas.getContext('2d'), el.img, el.img.naturalWidth, el.img.naturalHeight, w, h);
    canvas.toBlob(blob => blob ? saveBlob(blob, `reelframe-${w}x${h}.png`) : say('Could not create the PNG.', 'error'), 'image/png');
  } catch (err) {
    say('Image export failed. The picture may be too large for this browser.', 'error');
  }
}

function setBusy(busy) {
  el.settings.disabled = busy; // locks every setting while a video is exporting
  el.resetBtn.disabled = busy;
  el.cancelBtn.hidden = !busy;
  el.progress.hidden = !busy;
  el.progress.value = 0;
  render();
}

function exportVideo() {
  if (job || !state.ready) return;
  const v = el.video, { w, h } = outputSize();
  job = { w, h, muted: v.muted, raf: 0, chunks: [], cancelled: false, stopping: false };
  say('Starting export...', 'loading');
  setBusy(true);
  v.muted = false; // so the audio can be captured
  v.controls = false;
  v.currentTime = 0;
  // Playback must be running before the audio tracks can be captured
  v.play().then(() => startRecording(v)).catch(() => stopExport('Could not play the video for export.'));
}

function startRecording(v) {
  if (!job || job.stopping) return;
  const j = job;
  try {
    const canvas = Object.assign(document.createElement('canvas'), { width: j.w, height: j.h });
    j.ctx = canvas.getContext('2d');
    j.stream = canvas.captureStream(FPS);
    const audioTracks = v.captureStream().getAudioTracks(); // the original sound
    audioTracks.forEach(track => j.stream.addTrack(track));
    j.hasAudio = audioTracks.length > 0;
    j.recorder = new MediaRecorder(j.stream, { mimeType: VIDEO_MIME, videoBitsPerSecond: 6e6 });
    j.recorder.ondataavailable = e => e.data.size && j.chunks.push(e.data);
    j.recorder.onstop = () => endExport(j);
    j.recorder.onerror = () => stopExport('Recording failed. Try a shorter clip or another browser.');
    j.recorder.start(1000);
    say('Exporting in real time...', 'loading');
    drawLoop();
  } catch (err) {
    stopExport('Video export failed: ' + (err.message || 'unknown error'));
  }
}

// Copies the current video frame onto the recording canvas, once per screen refresh
function drawLoop() {
  if (!job || job.stopping) return;
  const v = el.video;
  drawFrame(job.ctx, v, v.videoWidth, v.videoHeight, job.w, job.h);
  el.progress.value = isFinite(v.duration) && v.duration > 0 ? v.currentTime / v.duration : 0;
  job.raf = requestAnimationFrame(drawLoop);
}

// Stops the animation loop and the recorder. Pass an error message if something went wrong.
function stopExport(error) {
  if (!job || job.stopping) return;
  const j = job;
  j.stopping = true;
  j.error = error;
  cancelAnimationFrame(j.raf);
  el.video.pause();
  if (j.recorder && j.recorder.state !== 'inactive') j.recorder.stop(); // triggers endExport
  else endExport(j);
}

// Final cleanup, then save the file or show why there is none
function endExport(j) {
  if (job !== j) return;
  if (j.stream) j.stream.getTracks().forEach(track => track.stop()); // release canvas and audio tracks
  el.video.muted = j.muted;
  el.video.controls = true;
  job = null;
  setBusy(false);
  if (j.error) say(j.error, 'error');
  else if (j.cancelled) say('Export cancelled.');
  else if (!j.chunks.length) say('Nothing was recorded. Please try again.', 'error');
  else saveBlob(new Blob(j.chunks, { type: VIDEO_MIME }), `reelframe-${j.w}x${j.h}.${VIDEO_EXT}`,
    j.hasAudio ? '' : ' No audio track was captured, so this video has no sound.');
}

/* ---------- Events ---------- */
el.img.addEventListener('load', onMediaReady);
el.video.addEventListener('loadedmetadata', onMediaReady);
[el.img, el.video].forEach(m => m.addEventListener('error', onMediaError));
el.video.addEventListener('ended', () => stopExport()); // does nothing unless an export is running

$$('[data-type]').forEach(btn => btn.addEventListener('click', () => switchType(btn.dataset.type)));
['ratio', 'mode', 'bg'].forEach(key =>
  $$(`[data-${key}]`).forEach(btn => btn.addEventListener('click', () => { state[key] = btn.dataset[key]; render(); })));

el.input.addEventListener('change', () => { loadFile(el.input.files[0]); el.input.value = ''; });
['dragenter', 'dragover'].forEach(name => el.drop.addEventListener(name, e => { e.preventDefault(); el.drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(name => el.drop.addEventListener(name, e => { e.preventDefault(); el.drop.classList.remove('over'); }));
el.drop.addEventListener('drop', e => loadFile(e.dataTransfer.files[0]));
// Stop the browser from opening a file that is dropped outside the drop zone
['dragover', 'drop'].forEach(name => window.addEventListener(name, e => e.preventDefault()));

el.resetBtn.addEventListener('click', resetSettings);
el.exportBtn.addEventListener('click', () => (state.type === 'photo' ? exportImage() : exportVideo()));
el.cancelBtn.addEventListener('click', () => { if (job) { job.cancelled = true; stopExport(); } });

render();

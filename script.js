'use strict';

const BRIDGE_URL = `ws://${location.hostname || '127.0.0.1'}:8765`;
const STALE_AFTER_MS = 1600;
const CALIBRATION_MS = 1800;
const LOSS_PERSIST_MS = 260;
const SENSITIVITY = {
  1: { label: 'Forgiving', linear: 2.2, gyro: 1.0, accel: 3.2 },
  2: { label: 'Normal', linear: 1.25, gyro: 0.65, accel: 2.1 },
  3: { label: 'Strict', linear: 0.72, gyro: 0.36, accel: 1.25 }
};
const $ = (id) => document.getElementById(id);
const ui = {
  connectionDot: $('connectionDot'), connectionStatus: $('connectionStatus'), roundStatus: $('roundStatus'), timer: $('timer'),
  intensityLabel: $('intensityLabel'), intensityBar: $('intensityBar'), intensityValue: $('intensityValue'), roundProgress: $('roundProgress'),
  startButton: $('startButton'), stopButton: $('stopButton'), resetButton: $('resetButton'), sensitivity: $('sensitivity'), sensitivityLabel: $('sensitivityLabel'),
  soundToggle: $('soundToggle'), resultPanel: $('resultPanel'), resultSymbol: $('resultSymbol'), resultTitle: $('resultTitle'), resultMessage: $('resultMessage'),
  errorPanel: $('errorPanel'), errorMessage: $('errorMessage'), accelReading: $('accelReading'), gyroReading: $('gyroReading'), linearReading: $('linearReading'),
  calibrationStatus: $('calibrationStatus'), calibrationDetail: $('calibrationDetail'), bestScore: $('bestScore'), roundResult: $('roundResult')
};
const state = {
  phase: 'idle', socket: null, bridgeOnline: false, latest: null, lastReadingAt: 0, selectedDuration: 30, roundStartedAt: 0,
  calibrationStartedAt: 0, samples: [], baseline: null, calibrationNoise: 0, accelNoise: 0, gyroNoise: 0, movementSince: null, raf: null, lastFrame: 0,
  audioContext: null, alarmNodes: [], hasSensor: false, readingSequence: 0, lastSampleSequence: -1
};

function setPhase(next) {
  state.phase = next;
  const labels = { idle: 'Ready when you are', connecting: 'Connecting to sensors…', calibrating: 'Calibrating — keep still', playing: 'Stay still!', lost: 'Caught moving', won: 'You stayed still!', error: 'Sensor error' };
  ui.roundStatus.textContent = labels[next] || next;
  ui.startButton.disabled = !['idle', 'won', 'lost', 'error'].includes(next) || !state.bridgeOnline;
  ui.stopButton.disabled = !['connecting', 'calibrating', 'playing'].includes(next);
}

function setConnection(online, text, bad = false) {
  state.bridgeOnline = online;
  ui.connectionStatus.textContent = text;
  ui.connectionDot.className = `status-dot${online ? ' connected' : bad ? ' bad' : ''}`;
  if (!online && ['connecting', 'calibrating', 'playing'].includes(state.phase)) showError('The phone sensor connection was lost. Round stopped; no win was awarded. Reconnect Nikki Streams, then reset and try again.');
  else if (state.phase === 'idle') ui.startButton.disabled = !online;
}

function connectToSensorBridge() {
  if (state.socket && state.socket.readyState <= WebSocket.OPEN) return;
  ui.connectionStatus.textContent = 'Connecting to local bridge…';
  const socket = new WebSocket(BRIDGE_URL);
  state.socket = socket;
  socket.addEventListener('open', () => { socket.send(JSON.stringify({ type: 'hello' })); });
  socket.addEventListener('message', (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === 'status') {
      const ok = message.bridge === 'ready' && message.phone === 'connected';
      setConnection(ok, message.message || (ok ? 'Phone sensors connected' : 'Waiting for phone sensors'), message.bridge === 'error');
      if (message.error) showConnectionError(message.error);
    } else if (message.type === 'sensor') handleSensorMessage(message);
    else if (message.type === 'error') showConnectionError(message.message || 'Sensor bridge reported an error.');
  });
  socket.addEventListener('close', () => setConnection(false, 'Bridge disconnected', true));
  socket.addEventListener('error', () => showConnectionError('Could not reach the local bridge. Start it with: python sensor_bridge.py'));
}

function showConnectionError(message) {
  ui.errorPanel.hidden = false;
  ui.errorMessage.textContent = message;
  setConnection(false, 'Needs attention', true);
  if (['connecting', 'calibrating', 'playing'].includes(state.phase)) showError(message);
}

function handleSensorMessage(message) {
  const reading = validateSensorReading(message);
  if (!reading) {
    if (['calibrating', 'playing'].includes(state.phase)) showError('Sensor data is missing, incomplete, or invalid. The round was stopped safely.');
    return;
  }
  state.latest = reading;
  state.readingSequence += 1;
  state.lastReadingAt = performance.now();
  state.hasSensor = true;
  setConnection(true, 'Phone sensors connected');
  ui.errorPanel.hidden = true;
  ui.accelReading.textContent = formatVector(reading.accel);
  ui.gyroReading.textContent = formatVector(reading.gyro);
  ui.linearReading.textContent = formatVector(reading.linear);
}

function validateSensorReading(message) {
  const source = message && (message.sensors || message.data || message);
  if (!source || typeof source !== 'object') return null;
  const pick = (...keys) => {
    for (const key of keys) {
      const found = Object.keys(source).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
      if (found) return vector(source[found]);
    }
    return null;
  };
  const accel = pick('Accel', 'Accelerometer', 'accelerometer');
  const gyro = pick('Gyro', 'Gyroscope', 'gyroscope');
  const linear = pick('LinAccel', 'LinearAcceleration', 'linearAcceleration');
  if (!accel && !gyro && !linear) return null;
  return { accel, gyro, linear, receivedAt: performance.now() };
}
function vector(value) {
  if (!Array.isArray(value) || value.length < 3) return null;
  const axes = value.slice(0, 3).map(Number);
  return axes.every(Number.isFinite) ? axes : null;
}
function formatVector(v) { return v ? `[${v.map((n) => n.toFixed(2)).join(', ')}]` : 'Not available'; }
function magnitude(v) { return v ? Math.hypot(...v) : null; }
function distance(a, b) { return a && b ? Math.hypot(...a.map((n, i) => n - b[i])) : null; }
function median(values) { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] || 0; }
function selectedThresholds() { return SENSITIVITY[Number(ui.sensitivity.value)]; }

function calibrateSensors() {
  state.samples = [];
  state.lastSampleSequence = -1;
  state.baseline = null;
  state.calibrationNoise = 0;
  state.calibrationStartedAt = performance.now();
  state.movementSince = null;
  ui.calibrationStatus.textContent = 'Calibrating…';
  ui.calibrationDetail.textContent = 'Measuring resting sensor values. Keep the phone still.';
  setPhase('calibrating');
  state.raf = requestAnimationFrame(gameFrame);
}

function calculateMovementScore(reading) {
  if (!state.baseline) return 0;
  const t = selectedThresholds();
  const linearDelta = distance(reading.linear, state.baseline.linear);
  const gyroSpeed = magnitude(reading.gyro);
  const accelDelta = distance(reading.accel, state.baseline.accel);
  const components = [];
  if (linearDelta !== null && state.baseline.linear) components.push(linearDelta / Math.max(t.linear, state.calibrationNoise * 4));
  if (gyroSpeed !== null && state.baseline.gyro) components.push(gyroSpeed / Math.max(t.gyro, state.gyroNoise * 4));
  if (accelDelta !== null && state.baseline.accel) components.push(accelDelta / Math.max(t.accel, state.accelNoise * 4));
  return Math.max(0, ...components);
}

function detectMovement(score, now) {
  if (score >= 1) {
    if (state.movementSince === null) state.movementSince = now;
    if (now - state.movementSince >= LOSS_PERSIST_MS) endGame('lost', 'CAUGHT! You moved the phone!', 'Sustained movement crossed the calibrated threshold.');
  } else state.movementSince = null;
}

function gameFrame(now) {
  if (!['calibrating', 'playing'].includes(state.phase)) return;
  if (!state.latest || now - state.lastReadingAt > STALE_AFTER_MS) {
    showError('Sensor readings stopped arriving. The round was stopped; stale data can never count as a win. Check Nikki Streams and Wi-Fi.');
    return;
  }
  if (state.phase === 'calibrating') {
    if (state.lastSampleSequence !== state.readingSequence) { state.samples.push(state.latest); state.lastSampleSequence = state.readingSequence; }
    const elapsed = now - state.calibrationStartedAt;
    const remaining = Math.max(0, CALIBRATION_MS - elapsed);
    ui.timer.innerHTML = `${(remaining / 1000).toFixed(1)}<span>s</span>`;
    ui.roundProgress.style.width = `${Math.min(100, elapsed / CALIBRATION_MS * 100)}%`;
    ui.calibrationDetail.textContent = `Keep still · ${(remaining / 1000).toFixed(1)} seconds`;
    if (elapsed >= CALIBRATION_MS) finishCalibration(now);
  } else {
    const elapsed = now - state.roundStartedAt;
    const left = Math.max(0, state.selectedDuration - elapsed / 1000);
    ui.timer.innerHTML = `${Math.ceil(left)}<span>s</span>`;
    ui.roundProgress.style.width = `${Math.min(100, elapsed / (state.selectedDuration * 1000) * 100)}%`;
    const score = calculateMovementScore(state.latest);
    const pct = Math.min(100, score * 60);
    ui.intensityBar.style.width = `${pct}%`;
    ui.intensityBar.style.background = score >= 1 ? 'var(--red)' : score > .55 ? 'var(--amber)' : 'var(--green)';
    ui.intensityLabel.textContent = score >= 1 ? 'High' : score > .55 ? 'Rising' : 'Low';
    ui.intensityLabel.style.color = score >= 1 ? 'var(--red)' : score > .55 ? 'var(--amber)' : 'var(--green)';
    ui.intensityValue.textContent = `Movement score ${score.toFixed(2)} · loss at 1.00`;
    detectMovement(score, now);
    if (state.phase === 'playing' && elapsed >= state.selectedDuration * 1000) endGame('won', 'YOU DID IT! Phone stayed still.', 'A complete round finished with valid live sensor readings.');
  }
  if (['calibrating', 'playing'].includes(state.phase)) state.raf = requestAnimationFrame(gameFrame);
}

function finishCalibration(now) {
  if (state.samples.length < 5) { showError('Not enough valid readings arrived for calibration. Check that accelerometer and gyroscope are enabled in Nikki Streams.'); return; }
  const vectors = (key) => state.samples.map((sample) => sample[key]).filter(Boolean);
  const average = (items) => items.length ? [0, 1, 2].map((axis) => items.reduce((sum, v) => sum + v[axis], 0) / items.length) : null;
  const lin = vectors('linear');
  state.baseline = { accel: average(vectors('accel')), gyro: average(vectors('gyro')), linear: average(lin) };
  state.calibrationNoise = lin.length ? Math.sqrt(lin.reduce((sum, v) => sum + (magnitude(v) - magnitude(state.baseline.linear)) ** 2, 0) / lin.length) : 0;
  const noiseFor = (key, baseline) => { const values = vectors(key); return values.length && baseline ? Math.sqrt(values.reduce((sum, v) => sum + distance(v, baseline) ** 2, 0) / values.length) : 0; };
  state.accelNoise = noiseFor('accel', state.baseline.accel);
  state.gyroNoise = noiseFor('gyro', state.baseline.gyro);
  state.roundStartedAt = now;
  state.movementSince = null;
  ui.calibrationStatus.textContent = 'Calibration complete';
  ui.calibrationDetail.textContent = `Resting noise ${state.calibrationNoise.toFixed(3)} m/s² · sensitivity ${selectedThresholds().label.toLowerCase()}`;
  ui.resultPanel.className = 'result-panel';
  ui.resultSymbol.textContent = '◎';
  ui.resultTitle.textContent = 'Round started — stay still!';
  ui.resultMessage.textContent = 'Movement must exceed the threshold for 260 ms to end the round.';
  ui.intensityValue.textContent = 'Movement score 0.00 · loss at 1.00';
  setPhase('playing');
}

function startGame() {
  if (!state.bridgeOnline || !state.latest || performance.now() - state.lastReadingAt > STALE_AFTER_MS) {
    showConnectionError('No fresh phone sensor data is available yet. Start Nikki Streams, enable Accelerometer and Gyroscope, and wait for readings.');
    return;
  }
  if (!['idle', 'won', 'lost', 'error'].includes(state.phase)) return;
  if (state.raf) cancelAnimationFrame(state.raf);
  state.selectedDuration = Number(document.querySelector('.choice.selected').dataset.duration);
  ui.errorPanel.hidden = true;
  ui.timer.innerHTML = `0<span>s</span>`;
  ui.roundProgress.style.width = '0%';
  ui.resultPanel.className = 'result-panel';
  ui.resultSymbol.textContent = '◎';
  ui.resultTitle.textContent = 'Place your phone on a stable surface';
  ui.resultMessage.textContent = 'Keep the phone still during the 1.8-second calibration.';
  initializeAudio();
  calibrateSensors();
}

function endGame(result, title, message) {
  if (!['playing', 'calibrating', 'connecting'].includes(state.phase)) return;
  if (state.raf) cancelAnimationFrame(state.raf);
  state.raf = null;
  state.movementSince = null;
  if (result === 'won') {
    ui.timer.innerHTML = `${state.selectedDuration}<span>s</span>`;
    ui.roundProgress.style.width = '100%';
    ui.intensityBar.style.width = '0%';
    ui.intensityLabel.textContent = 'Still';
    ui.intensityValue.textContent = 'No movement detected';
    ui.resultPanel.className = 'result-panel won';
    ui.resultSymbol.textContent = '✓';
    const best = Math.max(state.selectedDuration, Number(localStorage.getItem('dma-best') || 0));
    localStorage.setItem('dma-best', String(best));
    ui.bestScore.innerHTML = `${best}<span>s</span>`;
    ui.roundResult.textContent = 'Last round: survived';
  } else if (result === 'lost') {
    ui.resultPanel.className = 'result-panel lost';
    ui.resultSymbol.textContent = '!';
    ui.roundResult.textContent = `Last round: caught at ${Math.max(0, Math.floor((performance.now() - state.roundStartedAt) / 1000))} sec`;
    playAlarm();
  }
  ui.resultTitle.textContent = title;
  ui.resultMessage.textContent = message;
  setPhase(result);
}

function showError(message) {
  if (state.raf) cancelAnimationFrame(state.raf);
  state.raf = null;
  state.movementSince = null;
  ui.errorPanel.hidden = false;
  ui.errorMessage.textContent = message;
  ui.calibrationStatus.textContent = 'Calibration unavailable';
  ui.calibrationDetail.textContent = 'Reconnect the phone and start a new round.';
  ui.resultPanel.className = 'result-panel';
  ui.resultSymbol.textContent = '!';
  ui.resultTitle.textContent = 'Round stopped safely';
  ui.resultMessage.textContent = message;
  setPhase('error');
}

function stopGame() {
  if (!['connecting', 'calibrating', 'playing'].includes(state.phase)) return;
  if (state.raf) cancelAnimationFrame(state.raf);
  state.raf = null;
  state.movementSince = null;
  stopAlarm();
  ui.resultPanel.className = 'result-panel';
  ui.resultSymbol.textContent = '■';
  ui.resultTitle.textContent = 'Round stopped';
  ui.resultMessage.textContent = 'You stopped the round. No win was recorded.';
  ui.roundResult.textContent = 'Round stopped';
  setPhase('idle');
}

function resetGame() {
  if (state.raf) cancelAnimationFrame(state.raf);
  state.raf = null;
  stopAlarm();
  state.baseline = null;
  state.samples = [];
  state.movementSince = null;
  ui.timer.innerHTML = `${state.selectedDuration}<span>s</span>`;
  ui.roundProgress.style.width = '0%';
  ui.intensityBar.style.width = '0%';
  ui.intensityLabel.textContent = 'Waiting';
  ui.intensityLabel.style.color = '';
  ui.intensityValue.textContent = 'No live readings';
  ui.calibrationStatus.textContent = 'Calibration not started';
  ui.calibrationDetail.textContent = 'Resting noise is measured before each round.';
  ui.resultPanel.className = 'result-panel';
  ui.resultSymbol.textContent = '↗';
  ui.resultTitle.textContent = 'Place your phone on a stable surface';
  ui.resultMessage.textContent = state.bridgeOnline ? 'A live connection is ready. Choose a duration and start.' : 'A live connection is required before a round can start.';
  ui.errorPanel.hidden = true;
  setPhase('idle');
}
function disconnectSensorBridge() { if (state.socket) state.socket.close(); }

function initializeAudio() {
  if (!ui.soundToggle.checked || state.audioContext) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (AudioContextClass) state.audioContext = new AudioContextClass();
  if (state.audioContext && state.audioContext.state === 'suspended') state.audioContext.resume().catch(() => {});
}
function playAlarm() {
  if (!ui.soundToggle.checked) return;
  initializeAudio();
  if (!state.audioContext) return;
  const ctx = state.audioContext;
  try {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(660, ctx.currentTime);
    oscillator.frequency.setValueAtTime(880, ctx.currentTime + .16);
    oscillator.frequency.setValueAtTime(550, ctx.currentTime + .32);
    oscillator.frequency.setValueAtTime(770, ctx.currentTime + .48);
    gain.gain.setValueAtTime(.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.16, ctx.currentTime + .03);
    gain.gain.setValueAtTime(.16, ctx.currentTime + .58);
    gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + .68);
    oscillator.connect(gain); gain.connect(ctx.destination);
    oscillator.start(); oscillator.stop(ctx.currentTime + .7);
    state.alarmNodes = [oscillator, gain];
    oscillator.addEventListener('ended', () => { state.alarmNodes = []; });
  } catch { /* A sound failure never changes the loss result. */ }
}
function stopAlarm() {
  for (const node of state.alarmNodes) { try { node.stop(); } catch {} }
  state.alarmNodes = [];
}

document.querySelectorAll('.choice').forEach((button) => button.addEventListener('click', () => {
  if (!['idle', 'won', 'lost', 'error'].includes(state.phase)) return;
  document.querySelectorAll('.choice').forEach((option) => option.classList.remove('selected'));
  button.classList.add('selected');
  state.selectedDuration = Number(button.dataset.duration);
  ui.timer.innerHTML = `${state.selectedDuration}<span>s</span>`;
}));
ui.sensitivity.addEventListener('input', () => {
  ui.sensitivityLabel.textContent = selectedThresholds().label;
  if (state.baseline) ui.calibrationDetail.textContent = `Resting noise ${state.calibrationNoise.toFixed(3)} m/s² · sensitivity ${selectedThresholds().label.toLowerCase()}`;
});
ui.soundToggle.addEventListener('change', () => { if (!ui.soundToggle.checked) stopAlarm(); });
ui.startButton.addEventListener('click', startGame);
ui.stopButton.addEventListener('click', stopGame);
ui.resetButton.addEventListener('click', resetGame);
ui.bestScore.innerHTML = `${Number(localStorage.getItem('dma-best') || 0)}<span>s</span>`;
ui.timer.innerHTML = `${state.selectedDuration}<span>s</span>`;
setPhase('idle');
connectToSensorBridge();
window.addEventListener('beforeunload', disconnectSensorBridge);

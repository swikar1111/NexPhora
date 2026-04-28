// ─── State ───────────────────────────────────────────────────────────────────
let capturedImageBase64 = null;
let isSubmitting = false;

// ─── DOM Ready ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('emergencyForm').addEventListener('submit', handleSubmit);
  injectEnhancedStyles();
  buildStatusPanel();
});

// ─── Form Submission ──────────────────────────────────────────────────────────
async function handleSubmit(e) {
  e.preventDefault();
  if (isSubmitting) return;

  const location = document.getElementById('location').value.trim();
  const condition = document.getElementById('condition').value.trim();

  if (!location || !condition) {
    showError("Please fill in both location and patient condition.");
    return;
  }

  isSubmitting = true;
  setSubmitState(true);
  showStatusPanel();
  setStep('analyzing');

  try {
    const response = await fetch('/api/emergency', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location,
        patientCondition: condition,
        voiceNote: "",
        images: capturedImageBase64 ? [capturedImageBase64] : []
      })
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || "Server error");
    }

    setStep('dispatched');
    setTimeout(() => renderResult(result.data), 600);
    startETACountdown(result.data.eta);

  } catch (err) {
    setStep('error');
    showError(`⚠️ ${err.message || "Connection failed. Call 108 immediately."}`);
    console.error(err);
  } finally {
    isSubmitting = false;
    setSubmitState(false);
  }
}

// ─── Status Panel ─────────────────────────────────────────────────────────────
function buildStatusPanel() {
  const existing = document.getElementById('statusPanel');
  if (existing) return;

  const panel = document.createElement('div');
  panel.id = 'statusPanel';
  panel.style.display = 'none';
  panel.innerHTML = `
    <div class="status-steps">
      <div class="step" id="step-reported">
        <div class="step-dot"></div>
        <span>Reported</span>
      </div>
      <div class="step-line"></div>
      <div class="step" id="step-analyzing">
        <div class="step-dot"></div>
        <span>AI Analyzing</span>
      </div>
      <div class="step-line"></div>
      <div class="step" id="step-dispatched">
        <div class="step-dot"></div>
        <span>Dispatched</span>
      </div>
      <div class="step-line"></div>
      <div class="step" id="step-enroute">
        <div class="step-dot"></div>
        <span>En Route</span>
      </div>
    </div>
    <div id="resultCard" style="display:none;"></div>
    <div id="errorMsg" style="display:none;"></div>
  `;

  document.querySelector('.card').after(panel);
}

function showStatusPanel() {
  const panel = document.getElementById('statusPanel');
  panel.style.display = 'block';
  document.getElementById('errorMsg').style.display = 'none';
  document.getElementById('resultCard').style.display = 'none';
  setStep('reported');
}

function setStep(stepName) {
  const steps = ['reported', 'analyzing', 'dispatched', 'enroute'];
  const stepMap = {
    reported: 0,
    analyzing: 1,
    dispatched: 2,
    enroute: 3,
    error: -1
  };
  const activeIndex = stepMap[stepName] ?? -1;

  steps.forEach((s, i) => {
    const el = document.getElementById(`step-${s}`);
    if (!el) return;
    el.classList.remove('active', 'done', 'pulse');
    if (i < activeIndex) el.classList.add('done');
    else if (i === activeIndex) el.classList.add('active', 'pulse');
  });
}

// ─── Result Rendering ─────────────────────────────────────────────────────────
function renderResult(data) {
  setStep('enroute');

  const severityColor = {
    Critical: '#ef4444',
    Serious: '#f97316',
    Moderate: '#eab308',
    Stable: '#22c55e',
    Unknown: '#94a3b8'
  }[data.severity] || '#94a3b8';

  const firstAidHTML = Array.isArray(data.firstAid)
    ? data.firstAid.map((step, i) => `
        <div class="aid-step">
          <div class="aid-num">${i + 1}</div>
          <div class="aid-text">${step}</div>
        </div>`).join('')
    : `<p>${data.firstAid}</p>`;

  const equipHTML = Array.isArray(data.requiredEquipment)
    ? data.requiredEquipment.map(e => `<span class="equip-tag">${e}</span>`).join('')
    : '';

  const warningHTML = data.warnings
    ? `<div class="warning-box">⚠️ ${data.warnings}</div>`
    : '';

  const card = document.getElementById('resultCard');
  card.style.display = 'block';
  card.innerHTML = `
    <div class="result-header">
      <div class="severity-badge" style="background:${severityColor}20;color:${severityColor};border:1px solid ${severityColor}40;">
        ${data.severity || 'Assessed'}
      </div>
      <h3 style="color:#67e8f9;margin:0.5rem 0 0;">Emergency Registered</h3>
    </div>

    ${warningHTML}

    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">🏥 Hospital</div>
        <div class="info-value">${data.hospital}</div>
        <div class="info-sub">${data.hospitalContact || ''}</div>
      </div>
      <div class="info-item">
        <div class="info-label">⏱ ETA</div>
        <div class="info-value eta-display" id="etaDisplay">${data.eta}</div>
        <div class="info-sub" id="etaCountdown"></div>
      </div>
    </div>

    <div class="section-block">
      <div class="section-title">🩺 Pre-Diagnostic Assessment</div>
      <p class="diagnosis-text">${data.preDiagnosis}</p>
    </div>

    ${equipHTML ? `
    <div class="section-block">
      <div class="section-title">🧰 Equipment Being Prepared</div>
      <div class="equip-list">${equipHTML}</div>
    </div>` : ''}

    <div class="section-block first-aid-section">
      <div class="section-title urgent-title">🚨 First Aid — Do This Now</div>
      <div class="aid-steps">${firstAidHTML}</div>
    </div>

    <div class="call-bar">
      <a href="tel:108" class="call-btn">📞 Call 108</a>
      <span style="color:#94a3b8;font-size:13px;">National Ambulance Helpline</span>
    </div>
  `;

  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ─── ETA Countdown ────────────────────────────────────────────────────────────
function startETACountdown(etaString) {
  const mins = parseInt(etaString);
  if (isNaN(mins)) return;

  let totalSeconds = mins * 60;
  const el = document.getElementById('etaCountdown');

  const tick = () => {
    if (!el) return;
    if (totalSeconds <= 0) {
      el.textContent = "Ambulance arriving now";
      setStep('dispatched');
      return;
    }
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    el.textContent = `${m}:${String(s).padStart(2, '0')} remaining`;
    totalSeconds--;
    setTimeout(tick, 1000);
  };
  tick();
}

// ─── Voice Input ──────────────────────────────────────────────────────────────
function useVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showError("Voice input not supported in this browser. Try Chrome.");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'en-IN';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  const btn = document.querySelector('button[onclick="useVoiceInput()"]');
  if (btn) { btn.textContent = '🎤 Listening...'; btn.disabled = true; }

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    const conditionEl = document.getElementById('condition');
    conditionEl.value = conditionEl.value
      ? conditionEl.value + ' ' + transcript
      : transcript;
    conditionEl.focus();
  };

  recognition.onerror = (event) => {
    showError(`Voice error: ${event.error}. Please type the condition.`);
  };

  recognition.onend = () => {
    if (btn) { btn.textContent = '🎤 Voice Input'; btn.disabled = false; }
  };

  recognition.start();
}

// ─── Camera Capture ───────────────────────────────────────────────────────────
async function useCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    showCameraModal(stream);
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      showError("Camera permission denied. Please allow camera access and try again.");
    } else {
      showError("Camera not available on this device.");
    }
  }
}

function showCameraModal(stream) {
  const modal = document.createElement('div');
  modal.id = 'cameraModal';
  modal.innerHTML = `
    <div class="camera-overlay">
      <div class="camera-box">
        <p style="color:#67e8f9;margin:0 0 12px;font-weight:600;">📸 Capture Patient Photo</p>
        <video id="cameraFeed" autoplay playsinline style="width:100%;border-radius:8px;"></video>
        <canvas id="cameraCanvas" style="display:none;"></canvas>
        <div style="display:flex;gap:10px;margin-top:12px;">
          <button onclick="capturePhoto()" style="flex:1;background:#22d3ee;color:#000;padding:10px;border:none;border-radius:8px;cursor:pointer;font-weight:600;">📸 Capture</button>
          <button onclick="closeCamera()" style="flex:1;background:#ef4444;color:#fff;padding:10px;border:none;border-radius:8px;cursor:pointer;font-weight:600;">✕ Cancel</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('cameraFeed').srcObject = stream;
  window._cameraStream = stream;
}

function capturePhoto() {
  const video = document.getElementById('cameraFeed');
  const canvas = document.getElementById('cameraCanvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  capturedImageBase64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];

  const btn = document.querySelector('button[onclick="useCamera()"]');
  if (btn) btn.textContent = '📸 Photo ✓';

  closeCamera();
  showError("✅ Photo captured and attached to emergency report.", 'success');
}

function closeCamera() {
  if (window._cameraStream) {
    window._cameraStream.getTracks().forEach(t => t.stop());
    window._cameraStream = null;
  }
  const modal = document.getElementById('cameraModal');
  if (modal) modal.remove();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function setSubmitState(loading) {
  const btn = document.querySelector('#emergencyForm button[type="submit"]');
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? '⏳ Connecting to AI...' : '🚨 SEND EMERGENCY';
  btn.style.opacity = loading ? '0.7' : '1';
}

function showError(msg, type = 'error') {
  const el = document.getElementById('errorMsg') || createFloatingError();
  el.style.display = 'block';
  el.style.background = type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)';
  el.style.borderColor = type === 'success' ? '#22c55e' : '#ef4444';
  el.style.color = type === 'success' ? '#86efac' : '#fca5a5';
  el.textContent = msg;
  setTimeout(() => { if (el) el.style.display = 'none'; }, 5000);
}

function createFloatingError() {
  const el = document.createElement('div');
  el.id = 'floatingError';
  el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);padding:12px 20px;border-radius:8px;border:1px solid;font-size:14px;z-index:9999;max-width:90vw;text-align:center;';
  document.body.appendChild(el);
  return el;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
function injectEnhancedStyles() {
  const s = document.createElement('style');
  s.textContent = `
    .status-steps { display:flex; align-items:center; gap:4px; margin:1.5rem 0 1rem; flex-wrap:wrap; }
    .step { display:flex; flex-direction:column; align-items:center; gap:4px; font-size:11px; color:#64748b; flex:1; min-width:60px; }
    .step-dot { width:14px; height:14px; border-radius:50%; background:#1e2937; border:2px solid #334155; transition:all 0.3s; }
    .step.done .step-dot { background:#22d3ee; border-color:#22d3ee; }
    .step.done { color:#22d3ee; }
    .step.active .step-dot { background:#22d3ee; border-color:#67e8f9; box-shadow:0 0 10px #22d3ee80; }
    .step.active { color:#67e8f9; font-weight:600; }
    .step.pulse .step-dot { animation: pulseRing 1.2s infinite; }
    .step-line { flex:1; height:2px; background:#1e2937; min-width:10px; margin-bottom:18px; }
    @keyframes pulseRing { 0%{box-shadow:0 0 0 0 #22d3ee60} 70%{box-shadow:0 0 0 8px transparent} 100%{box-shadow:0 0 0 0 transparent} }

    #resultCard { background:rgba(255,255,255,0.04); border:1px solid rgba(103,232,249,0.2); border-radius:16px; padding:1.5rem; margin-top:1rem; }
    .result-header { margin-bottom:1rem; }
    .severity-badge { display:inline-block; font-size:12px; font-weight:700; padding:4px 12px; border-radius:20px; letter-spacing:0.05em; text-transform:uppercase; }
    .warning-box { background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); color:#fca5a5; border-radius:8px; padding:10px 14px; margin-bottom:1rem; font-size:13px; }
    .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:1.25rem; }
    .info-item { background:rgba(255,255,255,0.05); border-radius:10px; padding:12px; }
    .info-label { font-size:11px; color:#94a3b8; margin-bottom:4px; }
    .info-value { font-size:16px; font-weight:700; color:#e2e8f0; }
    .info-sub { font-size:12px; color:#64748b; margin-top:2px; }
    .eta-display { color:#22d3ee !important; }
    #etaCountdown { color:#22d3ee; font-size:13px; margin-top:4px; font-variant-numeric:tabular-nums; }

    .section-block { margin-bottom:1.25rem; }
    .section-title { font-size:12px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:8px; }
    .urgent-title { color:#f97316 !important; }
    .diagnosis-text { color:#cbd5e1; font-size:14px; line-height:1.6; margin:0; }

    .equip-list { display:flex; flex-wrap:wrap; gap:6px; }
    .equip-tag { background:rgba(34,211,238,0.1); border:1px solid rgba(34,211,238,0.2); color:#67e8f9; font-size:12px; padding:4px 10px; border-radius:20px; }

    .first-aid-section { background:rgba(249,115,22,0.05); border:1px solid rgba(249,115,22,0.2); border-radius:12px; padding:1rem; }
    .aid-steps { display:flex; flex-direction:column; gap:8px; }
    .aid-step { display:flex; align-items:flex-start; gap:10px; }
    .aid-num { min-width:24px; height:24px; border-radius:50%; background:#f97316; color:#fff; font-size:12px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .aid-text { color:#e2e8f0; font-size:14px; line-height:1.5; }

    .call-bar { display:flex; align-items:center; gap:12px; margin-top:1.25rem; padding-top:1rem; border-top:1px solid rgba(255,255,255,0.08); }
    .call-btn { background:#22d3ee; color:#000; font-weight:700; padding:10px 20px; border-radius:8px; text-decoration:none; font-size:14px; transition:0.2s; }
    .call-btn:hover { background:#67e8f9; }

    .camera-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.85); display:flex; align-items:center; justify-content:center; z-index:9998; }
    .camera-box { background:#0f172a; border:1px solid rgba(103,232,249,0.3); border-radius:16px; padding:1.5rem; max-width:400px; width:90%; }

    #statusPanel { margin-top:1.5rem; }
    #errorMsg { border-radius:8px; padding:12px; font-size:14px; border:1px solid; margin-top:8px; }
  `;
  document.head.appendChild(s);
}

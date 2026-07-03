const state = {
  telescopeAngle: 65,
  stageAngle: 35,
  mode: "small-angle",
  currentStep: 0,
  currentMeasurement: {
    L1: null,
    R1: null,
    L2: null,
    R2: null,
    deltaL: null,
    deltaR: null,
    phi: null,
    A: null
  },
  measurements: []
};

const stepHints = [
  "观察平行光管、望远镜、载物台、刻度盘和三棱镜的相对位置。",
  "拖动望远镜角度滑条，让反射像逐渐靠近十字叉丝中心。",
  "拖动载物台角度滑条，观察三棱镜和反射光路的变化。",
  "在两个不同反射位置分别记录 L1/R1 与 L2/R2。",
  "点击计算结果，查看顶角平均值、偏差和误差分析。"
];

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  bindElements();
  bindEvents();
  syncUI();
  renderTable();
  renderResults();
});

function bindElements() {
  els.instrumentCanvas = document.getElementById("instrumentCanvas");
  els.viewCanvas = document.getElementById("viewCanvas");
  els.telescopeAngle = document.getElementById("telescopeAngle");
  els.stageAngle = document.getElementById("stageAngle");
  els.telescopeValue = document.getElementById("telescopeValue");
  els.stageValue = document.getElementById("stageValue");
  els.leftReading = document.getElementById("leftReading");
  els.rightReading = document.getElementById("rightReading");
  els.alignmentBadge = document.getElementById("alignmentBadge");
  els.viewStatus = document.getElementById("viewStatus");
  els.formulaMode = document.getElementById("formulaMode");
  els.dataTable = document.getElementById("dataTable");
  els.resultContent = document.getElementById("resultContent");
  els.rowCount = document.getElementById("rowCount");
  els.stepHint = document.getElementById("stepHint");
}

function bindEvents() {
  document.querySelectorAll("[data-scroll]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector(button.dataset.scroll).scrollIntoView({ behavior: "smooth" });
    });
  });

  document.querySelectorAll(".step-item").forEach((button) => {
    button.addEventListener("click", () => {
      state.currentStep = Number(button.dataset.step);
      updateSteps();
    });
  });

  els.telescopeAngle.addEventListener("input", () => {
    state.telescopeAngle = parseAngle(els.telescopeAngle.value);
    syncUI();
  });

  els.stageAngle.addEventListener("input", () => {
    state.stageAngle = parseAngle(els.stageAngle.value);
    syncUI();
  });

  els.formulaMode.addEventListener("change", () => {
    state.mode = els.formulaMode.value;
    recalculateAll();
    renderTable();
    renderResults();
  });

  document.getElementById("recordFirst").addEventListener("click", () => {
    const readings = getReadings();
    state.currentMeasurement.L1 = readings.left;
    state.currentMeasurement.R1 = readings.right;
    state.currentStep = Math.max(state.currentStep, 3);
    recalculateCurrent();
    renderTable();
    updateSteps();
  });

  document.getElementById("recordSecond").addEventListener("click", () => {
    const readings = getReadings();
    state.currentMeasurement.L2 = readings.left;
    state.currentMeasurement.R2 = readings.right;
    state.currentStep = Math.max(state.currentStep, 3);
    recalculateCurrent();
    renderTable();
    updateSteps();
  });

  document.getElementById("addMeasurement").addEventListener("click", () => {
    recalculateCurrent();
    if (isComplete(state.currentMeasurement)) {
      state.measurements.push({ ...state.currentMeasurement });
    }
    state.currentMeasurement = blankMeasurement();
    renderTable();
    renderResults();
  });

  document.getElementById("calculateBtn").addEventListener("click", () => {
    recalculateCurrent();
    if (isComplete(state.currentMeasurement) && !state.measurements.includes(state.currentMeasurement)) {
      state.measurements.push({ ...state.currentMeasurement });
      state.currentMeasurement = blankMeasurement();
    }
    state.currentStep = 4;
    renderTable();
    renderResults();
    updateSteps();
  });

  document.getElementById("resetBtn").addEventListener("click", () => {
    state.telescopeAngle = 65;
    state.stageAngle = 35;
    state.mode = "small-angle";
    state.currentStep = 0;
    state.currentMeasurement = blankMeasurement();
    state.measurements = [];
    els.telescopeAngle.value = state.telescopeAngle;
    els.stageAngle.value = state.stageAngle;
    els.formulaMode.value = state.mode;
    syncUI();
    renderTable();
    renderResults();
    updateSteps();
  });

  window.addEventListener("resize", () => {
    drawInstrument();
    drawTelescopeView();
  });
}

function blankMeasurement() {
  return {
    L1: null,
    R1: null,
    L2: null,
    R2: null,
    deltaL: null,
    deltaR: null,
    phi: null,
    A: null
  };
}

function parseAngle(value) {
  if (typeof value === "number") {
    return normalizeAngle(value);
  }
  const text = String(value).trim();
  if (!text) return 0;
  const numbers = text.match(/-?\d+(\.\d+)?/g);
  if (!numbers) return 0;
  const degrees = Number(numbers[0] || 0);
  const minutes = Number(numbers[1] || 0);
  const seconds = Number(numbers[2] || 0);
  const sign = degrees < 0 ? -1 : 1;
  return normalizeAngle(sign * (Math.abs(degrees) + minutes / 60 + seconds / 3600));
}

function formatAngle(value, options = {}) {
  if (value === null || Number.isNaN(value)) return "--";
  const normalized = options.signed ? value : normalizeAngle(value);
  if (options.dms) {
    const sign = normalized < 0 ? "-" : "";
    const abs = Math.abs(normalized);
    const degrees = Math.floor(abs);
    const minutesFloat = (abs - degrees) * 60;
    const minutes = Math.floor(minutesFloat);
    const seconds = Math.round((minutesFloat - minutes) * 60);
    return `${sign}${degrees}°${String(minutes).padStart(2, "0")}′${String(seconds).padStart(2, "0")}″`;
  }
  return `${normalized.toFixed(2)}°`;
}

function normalizeAngle(value) {
  return ((value % 360) + 360) % 360;
}

function getClockwiseDiff(from, to) {
  return normalizeAngle(to - from);
}

function getSmallDiff(a, b) {
  const diff = getClockwiseDiff(a, b);
  return diff > 180 ? 360 - diff : diff;
}

function getLargeDiff(a, b) {
  const small = getSmallDiff(a, b);
  return small === 0 ? 0 : 360 - small;
}

function calculateApexAngle(record, mode = "small-angle") {
  if (!isRecorded(record)) {
    return { deltaL: null, deltaR: null, phi: null, A: null };
  }

  const diffGetter = mode === "supplement-angle" ? getLargeDiff : getSmallDiff;
  const deltaL = diffGetter(record.L1, record.L2);
  const deltaR = diffGetter(record.R1, record.R2);
  const phi = (deltaL + deltaR) / 2;
  const A = mode === "supplement-angle" ? (360 - phi) / 2 : phi / 2;

  return { deltaL, deltaR, phi, A };
}

function calculateStats(records) {
  const complete = records.filter((record) => Number.isFinite(record.A));
  if (!complete.length) {
    return {
      count: 0,
      avgA: null,
      avgPhi: null,
      maxDeviation: null,
      avgDeviation: null
    };
  }

  const avgA = average(complete.map((record) => record.A));
  const avgPhi = average(complete.map((record) => record.phi));
  const deviations = complete.map((record) => Math.abs(record.A - avgA));

  return {
    count: complete.length,
    avgA,
    avgPhi,
    maxDeviation: Math.max(...deviations),
    avgDeviation: average(deviations)
  };
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isRecorded(record) {
  return [record.L1, record.R1, record.L2, record.R2].every(Number.isFinite);
}

function isComplete(record) {
  return isRecorded(record) && Number.isFinite(record.A);
}

function getReadings() {
  const left = normalizeAngle(state.telescopeAngle + state.stageAngle * 0.18);
  const right = normalizeAngle(left + 180 + state.stageAngle * 0.02);
  return { left, right };
}

function getAlignmentOffset() {
  const ideal = normalizeAngle(state.stageAngle * 2 + 15);
  let offset = getClockwiseDiff(ideal, state.telescopeAngle);
  if (offset > 180) offset -= 360;
  return offset;
}

function syncUI() {
  const readings = getReadings();
  const offset = getAlignmentOffset();
  const aligned = Math.abs(offset) <= 2.2;

  els.telescopeValue.textContent = formatAngle(state.telescopeAngle);
  els.stageValue.textContent = formatAngle(state.stageAngle);
  els.leftReading.textContent = formatAngle(readings.left);
  els.rightReading.textContent = formatAngle(readings.right);

  els.alignmentBadge.textContent = aligned ? "已对准" : "调节中";
  els.viewStatus.textContent = aligned ? "已对准" : "反射像未居中";
  els.alignmentBadge.classList.toggle("aligned", aligned);
  els.viewStatus.classList.toggle("aligned", aligned);

  drawInstrument();
  drawTelescopeView();
}

function recalculateCurrent() {
  const result = calculateApexAngle(state.currentMeasurement, state.mode);
  Object.assign(state.currentMeasurement, result);
}

function recalculateAll() {
  recalculateCurrent();
  state.measurements = state.measurements.map((record) => ({
    ...record,
    ...calculateApexAngle(record, state.mode)
  }));
}

function renderTable() {
  const rows = [...state.measurements];
  const showDraft = Object.values(state.currentMeasurement).some((value) => value !== null);
  if (showDraft) rows.push({ ...state.currentMeasurement, draft: true });

  els.rowCount.textContent = `${state.measurements.length} 组数据`;

  if (!rows.length) {
    els.dataTable.innerHTML = `<tr class="empty-row"><td colspan="9">暂无数据。请先记录第一位置与第二位置。</td></tr>`;
    return;
  }

  els.dataTable.innerHTML = rows.map((record, index) => {
    const label = record.draft ? "当前" : String(index + 1);
    return `
      <tr>
        <td>${label}</td>
        <td>${formatAngle(record.L1)}</td>
        <td>${formatAngle(record.R1)}</td>
        <td>${formatAngle(record.L2)}</td>
        <td>${formatAngle(record.R2)}</td>
        <td>${formatAngle(record.deltaL)}</td>
        <td>${formatAngle(record.deltaR)}</td>
        <td>${formatAngle(record.phi)}</td>
        <td><strong>${formatAngle(record.A)}</strong></td>
      </tr>
    `;
  }).join("");
}

function renderResults() {
  const stats = calculateStats(state.measurements);
  const modeText = state.mode === "small-angle"
    ? "small-angle：φ = (ΔLsmall + ΔRsmall) / 2，A = φ / 2。"
    : "supplement-angle：φ = (ΔLlarge + ΔRlarge) / 2，A = (360° - φ) / 2。";

  if (!stats.count) {
    els.resultContent.innerHTML = `
      <p>暂无计算结果。请记录第一位置和第二位置后点击“计算结果”。</p>
      <p><strong>当前公式模式：</strong>${modeText}</p>
    `;
    return;
  }

  const quality = stats.maxDeviation <= 0.5
    ? "各组数据离散程度较小，读数一致性较好。"
    : "各组数据存在一定离散，建议重新检查叉丝对准、游标读数和跨 0° 角度差处理。";

  els.resultContent.innerHTML = `
    <div class="result-list">
      <div class="result-item"><span>有效测量组数</span><strong>${stats.count}</strong></div>
      <div class="result-item"><span>平均顶角 A</span><strong>${formatAngle(stats.avgA, { dms: true })}</strong></div>
      <div class="result-item"><span>平均夹角 φ</span><strong>${formatAngle(stats.avgPhi, { dms: true })}</strong></div>
      <div class="result-item"><span>平均偏差</span><strong>${formatAngle(stats.avgDeviation)}</strong></div>
      <div class="result-item"><span>最大偏差</span><strong>${formatAngle(stats.maxDeviation)}</strong></div>
    </div>
    <p><strong>公式模式：</strong>${modeText}</p>
    <p><strong>误差分析：</strong>${quality} 主要误差来源包括望远镜未严格对准反射像、载物台转动误差、游标估读误差和仪器零点偏差。</p>
  `;
}

function updateSteps() {
  document.querySelectorAll(".step-item").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.step) === state.currentStep);
  });
  els.stepHint.textContent = stepHints[state.currentStep];
}

function drawInstrument() {
  const canvas = els.instrumentCanvas;
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  const cx = width / 2;
  const cy = height / 2 + 18;
  const stageRadius = 94;
  const telescopeRad = degToRad(state.telescopeAngle);
  const stageRad = degToRad(state.stageAngle);

  ctx.clearRect(0, 0, width, height);
  drawInstrumentBackground(ctx, width, height);

  drawCollimator(ctx, 78, cy - 35, cx - 150, cy - 8);
  drawAngleDisk(ctx, cx, cy, 145);
  drawStage(ctx, cx, cy, stageRadius, stageRad);
  drawTelescope(ctx, cx, cy, telescopeRad);
  drawKnobs(ctx, cx, cy);
  drawLightPath(ctx, cx, cy, telescopeRad, stageRad);
  drawLabels(ctx, cx, cy, telescopeRad);
}

function drawInstrumentBackground(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#F7FAFD");
  gradient.addColorStop(1, "#D7E0E8");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(8, 17, 31, 0.08)";
  ctx.lineWidth = 1;
  for (let x = 40; x < width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 38; y < height; y += 38) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function drawAngleDisk(ctx, cx, cy, radius) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = "#C8D0D8";
  ctx.strokeStyle = "#7D8790";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  for (let i = 0; i < 360; i += 5) {
    const len = i % 30 === 0 ? 16 : 8;
    const a = degToRad(i - 90);
    ctx.strokeStyle = i % 30 === 0 ? "#313942" : "#6E7780";
    ctx.lineWidth = i % 30 === 0 ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (radius - len), Math.sin(a) * (radius - len));
    ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
    ctx.stroke();
  }

  ctx.fillStyle = "#111927";
  ctx.font = "700 18px Arial";
  ctx.textAlign = "center";
  ctx.fillText("刻度盘", 0, radius + 30);
  ctx.restore();
}

function drawStage(ctx, cx, cy, radius, angle) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = "#EEF3F7";
  ctx.strokeStyle = "#8F99A3";
  ctx.lineWidth = 4;
  roundedRect(ctx, -radius, -radius * 0.55, radius * 2, radius * 1.1, 14);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#AAB4BE";
  ctx.beginPath();
  ctx.arc(0, 0, 42, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(80, 190, 210, 0.32)";
  ctx.strokeStyle = "#2A6D86";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -62);
  ctx.lineTo(58, 42);
  ctx.lineTo(-58, 42);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#102033";
  ctx.font = "700 14px Arial";
  ctx.textAlign = "center";
  ctx.fillText("三棱镜", 0, 12);
  ctx.restore();
}

function drawCollimator(ctx, x1, y1, x2, y2) {
  const h = 54;
  ctx.fillStyle = "#D9DEE4";
  ctx.strokeStyle = "#6F7882";
  ctx.lineWidth = 4;
  roundedRect(ctx, x1, y1, x2 - x1, h, 18);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#F5F7FA";
  roundedRect(ctx, x2 - 25, y1 - 8, 54, h + 16, 14);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#1A2230";
  ctx.beginPath();
  ctx.arc(x1 + 16, y1 + h / 2, 16, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#102033";
  ctx.font = "700 15px Arial";
  ctx.textAlign = "center";
  ctx.fillText("平行光管", (x1 + x2) / 2, y1 - 14);
}

function drawTelescope(ctx, cx, cy, angle) {
  const start = 80;
  const length = 270;
  const half = 26;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const px = -uy;
  const py = ux;
  const x1 = cx + ux * start;
  const y1 = cy + uy * start;
  const x2 = cx + ux * length;
  const y2 = cy + uy * length;

  ctx.fillStyle = "#BFC8D0";
  ctx.strokeStyle = "#4E5964";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x1 + px * half, y1 + py * half);
  ctx.lineTo(x2 + px * half, y2 + py * half);
  ctx.lineTo(x2 - px * half, y2 - py * half);
  ctx.lineTo(x1 - px * half, y1 - py * half);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#F6F8FA";
  ctx.beginPath();
  ctx.ellipse(x2, y2, 34, 45, angle, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#182332";
  ctx.beginPath();
  ctx.ellipse(x2 + ux * 3, y2 + uy * 3, 18, 28, angle, 0, Math.PI * 2);
  ctx.fill();
}

function drawKnobs(ctx, cx, cy) {
  const knobs = [
    [cx - 150, cy + 150, "微调旋钮"],
    [cx + 150, cy + 150, "制动旋钮"],
    [cx, cy - 170, "升降旋钮"]
  ];

  knobs.forEach(([x, y, label]) => {
    ctx.fillStyle = "#202A36";
    ctx.strokeStyle = "#596575";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#9BA5B0";
    for (let i = 0; i < 8; i += 1) {
      const a = degToRad(i * 45);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * 12, y + Math.sin(a) * 12);
      ctx.lineTo(x + Math.cos(a) * 22, y + Math.sin(a) * 22);
      ctx.stroke();
    }
    ctx.fillStyle = "#102033";
    ctx.font = "700 13px Arial";
    ctx.textAlign = "center";
    ctx.fillText(label, x, y + 45);
  });
}

function drawLightPath(ctx, cx, cy, telescopeRad, stageRad) {
  const incomingStart = { x: 108, y: cy - 8 };
  const prismPoint = { x: cx - 28 * Math.cos(stageRad), y: cy - 28 * Math.sin(stageRad) };
  const reflectedEnd = {
    x: cx + Math.cos(telescopeRad) * 315,
    y: cy + Math.sin(telescopeRad) * 315
  };

  glowLine(ctx, incomingStart.x, incomingStart.y, prismPoint.x, prismPoint.y, "#FF4D5F", 6);
  glowLine(ctx, prismPoint.x, prismPoint.y, reflectedEnd.x, reflectedEnd.y, "#39D98A", 6);

  const splitEnd = {
    x: cx + Math.cos(telescopeRad - 0.32) * 240,
    y: cy + Math.sin(telescopeRad - 0.32) * 240
  };
  glowLine(ctx, prismPoint.x, prismPoint.y, splitEnd.x, splitEnd.y, "#3BA7FF", 4);
}

function drawLabels(ctx, cx, cy, telescopeRad) {
  ctx.fillStyle = "#102033";
  ctx.font = "700 15px Arial";
  ctx.textAlign = "center";
  ctx.fillText("载物台", cx, cy + 12);

  const x = cx + Math.cos(telescopeRad) * 265;
  const y = cy + Math.sin(telescopeRad) * 265;
  ctx.fillText("望远镜", x, y - 52);
}

function drawTelescopeView() {
  const canvas = els.viewCanvas;
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  const cx = width / 2;
  const cy = height / 2;
  const offset = getAlignmentOffset();
  const imageX = cx + clamp(offset * 13, -width * 0.38, width * 0.38);
  const imageY = cy + Math.sin(degToRad(state.stageAngle * 3)) * 18;
  const aligned = Math.abs(offset) <= 2.2;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#07101D";
  ctx.fillRect(0, 0, width, height);

  const vignette = ctx.createRadialGradient(cx, cy, 50, cx, cy, width * 0.45);
  vignette.addColorStop(0, "#16314A");
  vignette.addColorStop(0.62, "#0A1A2A");
  vignette.addColorStop(1, "#02060A");
  ctx.fillStyle = vignette;
  ctx.beginPath();
  ctx.ellipse(cx, cy, width * 0.42, height * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(244, 248, 255, 0.75)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 105, cy);
  ctx.lineTo(cx + 105, cy);
  ctx.moveTo(cx, cy - 85);
  ctx.lineTo(cx, cy + 85);
  ctx.stroke();

  ctx.strokeStyle = "rgba(53, 240, 208, 0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, 34, 0, Math.PI * 2);
  ctx.stroke();

  const glow = ctx.createRadialGradient(imageX, imageY, 4, imageX, imageY, 46);
  glow.addColorStop(0, aligned ? "#FFFFFF" : "#BFEFFF");
  glow.addColorStop(0.28, aligned ? "#39D98A" : "#3BA7FF");
  glow.addColorStop(1, "rgba(59, 167, 255, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(imageX, imageY, 46, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = aligned ? "#39D98A" : "#3BA7FF";
  ctx.beginPath();
  ctx.arc(imageX, imageY, 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#F4F8FF";
  ctx.font = "700 16px Arial";
  ctx.textAlign = "left";
  ctx.fillText(aligned ? "已对准：反射像位于叉丝中心附近" : "拖动望远镜角度，使反射像靠近中心", 24, 34);
}

function degToRad(degrees) {
  return degrees * Math.PI / 180;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function glowLine(ctx, x1, y1, x2, y2, color, width) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

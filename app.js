/* eslint-disable no-use-before-define */

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_RENDER_WIDTH = 1800;
const MAX_RENDER_HEIGHT = 1800;

const COLOR_LIBRARY = [
  { id: "teal", name: "湖水綠", hex: "#2dd4bf" },
  { id: "amber", name: "琥珀橘", hex: "#f59e0b" },
  { id: "rose", name: "玫瑰粉", hex: "#fb7185" },
  { id: "indigo", name: "靛藍", hex: "#6366f1" },
  { id: "lime", name: "青檸", hex: "#84cc16" },
  { id: "sky", name: "天空藍", hex: "#38bdf8" },
  { id: "coffee", name: "咖啡棕", hex: "#a16207" },
  { id: "slate", name: "石板灰", hex: "#94a3b8" },
  { id: "charcoal", name: "炭黑", hex: "#0f172a" },
  { id: "custom", name: "自訂（調色盤）", hex: "#2dd4bf" },
];

const SCHEMES = {
  single: { label: "單色上色", hueShift: 0, satMult: 1.0, contrast: 1.0, gamma: 1.0, lift: 0.0 },
  warm: { label: "暖色系", hueShift: 12, satMult: 1.05, contrast: 1.03, gamma: 0.98, lift: 0.02 },
  cool: { label: "冷色系", hueShift: -14, satMult: 1.02, contrast: 1.02, gamma: 1.02, lift: 0.015 },
  vintage: { label: "復古", hueShift: 18, satMult: 0.82, contrast: 0.96, gamma: 0.94, lift: 0.055 },
  morandi: { label: "莫蘭迪", hueShift: 8, satMult: 0.62, contrast: 0.98, gamma: 1.03, lift: 0.045 },
  neon: { label: "霓虹", hueShift: 0, satMult: 1.35, contrast: 1.08, gamma: 1.0, lift: 0.0 },
  ink: { label: "墨水", hueShift: -6, satMult: 0.9, contrast: 1.22, gamma: 1.05, lift: 0.0 },
};

const TONES = {
  soft: { label: "柔和", satExtra: 0.82, contrastExtra: 0.98 },
  normal: { label: "標準", satExtra: 1.0, contrastExtra: 1.0 },
  bold: { label: "濃烈", satExtra: 1.18, contrastExtra: 1.04 },
};

let currentFile = null;
let currentImageKey = null;
let originalImageData = null;
let originalDrawn = false;

document.addEventListener("DOMContentLoaded", () => {
  bindUI();
  hydrateColorOptions();
  syncIntensityLabel();
  setStatus("等待上傳圖片。", "idle");
  drawPlaceholder();
});

function bindUI() {
  const fileInput = mustGet("fileInput");
  const dropZone = mustGet("dropZone");
  const pickBtn = mustGet("pickBtn");
  const schemeSelect = mustGet("schemeSelect");
  const toneSelect = mustGet("toneSelect");
  const colorNameSelect = mustGet("colorNameSelect");
  const colorPicker = mustGet("colorPicker");
  const intensityRange = mustGet("intensityRange");
  const applyBtn = mustGet("applyBtn");
  const resetBtn = mustGet("resetBtn");
  const downloadBtn = mustGet("downloadBtn");
  const commentForm = mustGet("commentForm");
  const commentText = mustGet("commentText");
  const clearCommentsBtn = mustGet("clearCommentsBtn");
  const demoBtn = mustGet("demoBtn");

  pickBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    if (!fileInput.files || fileInput.files.length === 0) return;
    handleFile(fileInput.files[0]);
    fileInput.value = "";
  });

  dropZone.addEventListener("click", () => fileInput.click());
  dropZone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });
  dropZone.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dropZone.classList.add("drop--drag");
  });
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("drop--drag");
  });
  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("drop--drag");
  });
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("drop--drag");
    const file = e.dataTransfer && e.dataTransfer.files ? e.dataTransfer.files[0] : null;
    if (file) handleFile(file);
  });

  schemeSelect.addEventListener("change", () => {
    if (originalDrawn) setStatus("已選擇色系，按下「套用上色」更新結果。", "ready");
    updateResultMeta();
  });
  toneSelect.addEventListener("change", () => {
    if (originalDrawn) setStatus("已調整色調，按下「套用上色」更新結果。", "ready");
    updateResultMeta();
  });

  colorNameSelect.addEventListener("change", () => {
    const picked = COLOR_LIBRARY.find((c) => c.id === colorNameSelect.value);
    if (!picked) return;
    if (picked.id !== "custom") colorPicker.value = picked.hex;
    if (originalDrawn) setStatus("已選擇顏色，按下「套用上色」更新結果。", "ready");
    updateResultMeta();
  });
  colorPicker.addEventListener("input", () => {
    colorNameSelect.value = "custom";
    if (originalDrawn) setStatus("已更新調色盤顏色，按下「套用上色」更新結果。", "ready");
    updateResultMeta();
  });

  intensityRange.addEventListener("input", () => {
    syncIntensityLabel();
    if (originalDrawn) setStatus("已調整套用比例，按下「套用上色」更新結果。", "ready");
    updateResultMeta();
  });

  applyBtn.addEventListener("click", () => applyColorize());
  resetBtn.addEventListener("click", () => resetResult());
  downloadBtn.addEventListener("click", () => downloadResult());

  commentText.addEventListener("input", () => {
    mustGet("commentCount").textContent = String(commentText.value.length);
  });

  commentForm.addEventListener("submit", (e) => {
    e.preventDefault();
    postComment();
  });

  clearCommentsBtn.addEventListener("click", () => clearComments());
  demoBtn.addEventListener("click", () => fillDemoComment());
}

function hydrateColorOptions() {
  const select = mustGet("colorNameSelect");
  select.innerHTML = "";
  for (const c of COLOR_LIBRARY) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    select.appendChild(opt);
  }
  select.value = "teal";
}

function syncIntensityLabel() {
  const v = Number(mustGet("intensityRange").value);
  mustGet("intensityLabel").textContent = `${v}%`;
}

async function handleFile(file) {
  const isImage = (file.type && file.type.startsWith("image/")) || looksLikeImageName(file.name);
  if (!isImage) {
    setStatus("這個檔案不是圖片格式。", "error");
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    setStatus("檔案過大（超過 15MB）。請換一張較小的圖片。", "error");
    return;
  }

  currentFile = file;
  currentImageKey = makeImageKey(file);
  originalImageData = null;
  originalDrawn = false;

  mustGet("fileName").textContent = file.name;
  mustGet("imageSize").textContent = `${formatBytes(file.size)}`;
  mustGet("origBadge").textContent = "載入中";
  mustGet("resultBadge").textContent = "等待套用";
  mustGet("resultBadge").classList.add("badge--mute");
  updateResultMeta();

  setStatus("正在載入圖片...", "busy");

  try {
    const img = await loadImageFromFile(file);
    drawOriginal(img);
    drawResultFromOriginal();
    originalDrawn = true;
    setControlsEnabled(true);
    setCommentEnabled(true);
    loadComments();
    setStatus("圖片已載入。選擇色系與顏色後，按下「套用上色」。", "ready");
  } catch (err) {
    console.error(err);
    setControlsEnabled(false);
    setCommentEnabled(false);
    mustGet("origBadge").textContent = "載入失敗";
    setStatus("圖片載入失敗。請換一張圖片再試。", "error");
  }
}

function setControlsEnabled(enabled) {
  mustGet("applyBtn").disabled = !enabled;
  mustGet("resetBtn").disabled = !enabled;
  mustGet("downloadBtn").disabled = !enabled;
}

function setCommentEnabled(enabled) {
  mustGet("postBtn").disabled = !enabled;
  mustGet("clearCommentsBtn").disabled = !enabled;
}

function drawOriginal(img) {
  const canvas = mustGet("originalCanvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D context not available");

  const { w, h } = fitWithin(img.naturalWidth || img.width, img.naturalHeight || img.height, MAX_RENDER_WIDTH, MAX_RENDER_HEIGHT);
  canvas.width = w;
  canvas.height = h;

  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  originalImageData = ctx.getImageData(0, 0, w, h);
  mustGet("origBadge").textContent = "已載入";
  updateResultMeta();
}

function drawResultFromOriginal() {
  if (!originalImageData) return;
  const canvas = mustGet("resultCanvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D context not available");
  canvas.width = originalImageData.width;
  canvas.height = originalImageData.height;
  ctx.putImageData(originalImageData, 0, 0);
}

function applyColorize() {
  if (!originalImageData || !currentFile) {
    setStatus("請先上傳圖片。", "error");
    return;
  }
  setStatus("正在上色...（圖片較大時可能需要幾秒）", "busy");

  const schemeId = mustGet("schemeSelect").value;
  const toneId = mustGet("toneSelect").value;
  const scheme = SCHEMES[schemeId] || SCHEMES.single;
  const tone = TONES[toneId] || TONES.normal;
  const colorHex = String(mustGet("colorPicker").value || "#2dd4bf");
  const intensity = clamp01(Number(mustGet("intensityRange").value) / 100);

  const baseRGB = hexToRgb(colorHex);
  if (!baseRGB) {
    setStatus("顏色格式錯誤。", "error");
    return;
  }

  const t0 = performance.now();
  const out = colorizeImageData(originalImageData, {
    baseRGB,
    intensity,
    scheme,
    tone,
  });

  const canvas = mustGet("resultCanvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    setStatus("無法取得 Canvas 環境。", "error");
    return;
  }

  canvas.width = out.width;
  canvas.height = out.height;
  ctx.putImageData(out, 0, 0);

  const ms = Math.round(performance.now() - t0);
  mustGet("resultBadge").textContent = "已完成";
  mustGet("resultBadge").classList.remove("badge--mute");
  updateResultMeta();
  setStatus(`上色完成（${ms}ms）。可以下載成品或在下方留言。`, "ok");
}

function resetResult() {
  if (!originalImageData) return;
  drawResultFromOriginal();
  mustGet("resultBadge").textContent = "已還原";
  mustGet("resultBadge").classList.add("badge--mute");
  setStatus("已還原為原圖。", "ready");
}

function downloadResult() {
  if (!currentFile) {
    setStatus("請先上傳圖片。", "error");
    return;
  }

  const canvas = mustGet("resultCanvas");
  const ext = guessDownloadExt(currentFile.type);
  const name = safeBaseName(currentFile.name);
  const outName = `${name}-colorized.${ext}`;

  setStatus("正在準備下載...", "busy");
  canvas.toBlob(
    (blob) => {
      if (!blob) {
        setStatus("下載失敗（無法產生檔案）。", "error");
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = outName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus(`已下載：${outName}`, "ok");
    },
    mimeFromExt(ext),
    0.92
  );
}

function updateResultMeta() {
  const schemeId = mustGet("schemeSelect").value;
  const toneId = mustGet("toneSelect").value;
  const intensity = Number(mustGet("intensityRange").value);
  const colorHex = String(mustGet("colorPicker").value || "#2dd4bf").toUpperCase();
  const size = originalImageData ? `${originalImageData.width} x ${originalImageData.height}` : "-";
  const schemeLabel = (SCHEMES[schemeId] || SCHEMES.single).label;
  const toneLabel = (TONES[toneId] || TONES.normal).label;
  mustGet("resultMeta").textContent = `尺寸：${size} | 風格：${schemeLabel} | 色調：${toneLabel} | 顏色：${colorHex} | 比例：${intensity}%`;
}

function setStatus(text, kind) {
  const el = mustGet("statusText");
  el.textContent = text;

  const dot = document.querySelector(".status__dot");
  if (!dot) return;

  const styles = {
    idle: "rgba(255,255,255,0.25)",
    busy: "rgba(245,158,11,0.95)",
    ready: "rgba(45,212,191,0.95)",
    ok: "rgba(52,211,153,0.95)",
    error: "rgba(251,113,133,0.95)",
  };
  dot.style.background = styles[kind] || styles.idle;
  dot.style.boxShadow = `0 0 0 4px ${alpha(styles[kind] || styles.idle, 0.18)}`;
}

function alpha(rgbLike, a) {
  const m = String(rgbLike).match(/rgba?\((\d+),(\d+),(\d+)/);
  if (!m) return `rgba(255,255,255,${a})`;
  return `rgba(${m[1]},${m[2]},${m[3]},${a})`;
}

function drawPlaceholder() {
  const c1 = mustGet("originalCanvas");
  const c2 = mustGet("resultCanvas");
  for (const c of [c1, c2]) {
    const ctx = c.getContext("2d");
    if (!ctx) continue;
    const w = c.width;
    const h = c.height;
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "rgba(45,212,191,0.10)");
    g.addColorStop(1, "rgba(245,158,11,0.08)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "600 14px Space Grotesk, ui-sans-serif, system-ui";
    ctx.fillText("Upload an image to start", 18, 34);
    ctx.font = "12px Noto Sans TC, ui-sans-serif, system-ui";
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillText("上傳圖片後即可在這裡預覽", 18, 56);
  }
}

function colorizeImageData(imageData, opts) {
  const { baseRGB, intensity, scheme, tone } = opts;
  const { h: baseH, s: baseS } = rgbToHsl(baseRGB.r, baseRGB.g, baseRGB.b);

  const sat = clamp01(baseS * scheme.satMult * tone.satExtra);
  const contrast = scheme.contrast * tone.contrastExtra;

  const w = imageData.width;
  const h = imageData.height;
  const src = imageData.data;
  const out = new Uint8ClampedArray(src.length);

  const hue = wrapHue(baseH + scheme.hueShift);

  for (let i = 0; i < src.length; i += 4) {
    const r = src[i];
    const g = src[i + 1];
    const b = src[i + 2];
    const a = src[i + 3];
    if (a === 0) {
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 0;
      continue;
    }

    const lum = luminance01(r, g, b);
    let light = applyCurve(lum, scheme.gamma, scheme.lift);
    light = clamp01((light - 0.5) * contrast + 0.5);

    const tinted = hslToRgb(hue, sat, light);

    out[i] = mix8(r, tinted.r, intensity);
    out[i + 1] = mix8(g, tinted.g, intensity);
    out[i + 2] = mix8(b, tinted.b, intensity);
    out[i + 3] = a;
  }

  return new ImageData(out, w, h);
}

function applyCurve(x, gamma, lift) {
  const y = Math.pow(clamp01(x), 1 / Math.max(0.0001, gamma));
  return clamp01(y + lift);
}

function luminance01(r, g, b) {
  return clamp01((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255);
}

function mix8(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function wrapHue(h) {
  let out = h % 360;
  if (out < 0) out += 360;
  return out;
}

function rgbToHsl(r8, g8, b8) {
  const r = r8 / 255;
  const g = g8 / 255;
  const b = b8 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }

  return { h, s, l };
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (h % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (hp >= 0 && hp < 1) {
    r1 = c;
    g1 = x;
  } else if (hp >= 1 && hp < 2) {
    r1 = x;
    g1 = c;
  } else if (hp >= 2 && hp < 3) {
    g1 = c;
    b1 = x;
  } else if (hp >= 3 && hp < 4) {
    g1 = x;
    b1 = c;
  } else if (hp >= 4 && hp < 5) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }

  const m = l - c / 2;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

function hexToRgb(hex) {
  const m = String(hex).trim().match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return null;
  const v = m[1];
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
  };
}

function fitWithin(w, h, maxW, maxH) {
  const scale = Math.min(1, maxW / Math.max(1, w), maxH / Math.max(1, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function mustGet(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: ${id}`);
  return el;
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function makeImageKey(file) {
  return `${file.name}|${file.size}|${file.lastModified}|${file.type}`;
}

function safeBaseName(filename) {
  const base = String(filename || "image").replace(/\\/g, "/").split("/").pop() || "image";
  return base.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "") || "image";
}

function guessDownloadExt(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  return "jpg";
}

function looksLikeImageName(name) {
  const n = String(name || "").toLowerCase();
  return /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(n);
}

function mimeFromExt(ext) {
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load error"));
    };
    img.src = url;
  });
}

function commentsKey() {
  return currentImageKey ? `img-colorizer-comments::${currentImageKey}` : null;
}

function loadComments() {
  const key = commentsKey();
  if (!key) return;
  let items = [];
  try {
    const raw = localStorage.getItem(key);
    if (raw) items = JSON.parse(raw);
  } catch {
    items = [];
  }
  renderComments(Array.isArray(items) ? items : []);
}

function saveComments(items) {
  const key = commentsKey();
  if (!key) return;
  localStorage.setItem(key, JSON.stringify(items));
}

function getComments() {
  const key = commentsKey();
  if (!key) return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function postComment() {
  if (!currentImageKey) {
    setStatus("請先上傳圖片後再留言。", "error");
    return;
  }
  const name = String(mustGet("commentName").value || "").trim();
  const text = String(mustGet("commentText").value || "").trim();
  if (!text) return;

  const items = getComments();
  items.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: name || "匿名",
    text,
    ts: Date.now(),
  });
  saveComments(items);
  renderComments(items);

  mustGet("commentText").value = "";
  mustGet("commentCount").textContent = "0";
  setStatus("留言已送出（保存在本機瀏覽器）。", "ok");
}

function renderComments(items) {
  const list = mustGet("commentList");
  const empty = mustGet("emptyComments");
  list.innerHTML = "";

  if (!items || items.length === 0) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  for (const it of items) {
    const li = document.createElement("li");
    li.className = "comment";

    const top = document.createElement("div");
    top.className = "comment__top";

    const name = document.createElement("div");
    name.className = "comment__name";
    name.textContent = String(it.name || "匿名");

    const time = document.createElement("div");
    time.className = "comment__time";
    time.textContent = formatTime(it.ts);

    top.appendChild(name);
    top.appendChild(time);

    const text = document.createElement("div");
    text.className = "comment__text";
    text.textContent = String(it.text || "");

    li.appendChild(top);
    li.appendChild(text);
    list.appendChild(li);
  }
}

function clearComments() {
  const key = commentsKey();
  if (!key) return;
  localStorage.removeItem(key);
  renderComments([]);
  setStatus("已清除這張圖的留言。", "ready");
}

function fillDemoComment() {
  const samples = [
    "霓虹很有感，像夜景一樣亮！",
    "莫蘭迪很舒服，適合人像或室內照。",
    "暖色系配琥珀橘很像日落，喜歡。",
  ];
  const pick = samples[Math.floor(Math.random() * samples.length)];
  const ta = mustGet("commentText");
  ta.value = ta.value ? `${ta.value}\n${pick}` : pick;
  mustGet("commentCount").textContent = String(ta.value.length);
  ta.focus();
}

function formatTime(ts) {
  const d = new Date(Number(ts) || Date.now());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

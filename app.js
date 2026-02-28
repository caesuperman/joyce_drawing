const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_RENDER_WIDTH = 1800;
const MAX_RENDER_HEIGHT = 1800;
const THUMB_MAX_W = 840;
const THUMB_MAX_H = 560;

const POSTS_KEY = "img-colorizer-posts-v1";
const POST_COMMENTS_PREFIX = "img-colorizer-post-comments-v1::";
const DB_NAME = "img-colorizer-db";
const DB_VERSION = 1;
const STORE_POST_IMAGES = "postImages";

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
let originalImageData = null;
let originalDrawn = false;
let applyTimer = null;
let dbPromise = null;

const postThumbUrls = new Map();

document.addEventListener("DOMContentLoaded", () => {
  bindUI();
  hydrateColorOptions();
  syncIntensityLabel();
  syncCaptionCount();
  setStatus("等待上傳圖片。", "idle");
  drawPlaceholder();

  dbPromise = openDb().catch((err) => {
    console.error(err);
    setStatus("你的瀏覽器無法使用 IndexedDB（無法保存已發布圖片）。", "error");
    return null;
  });

  renderPosts();
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
  const publishBtn = mustGet("publishBtn");

  const captionText = mustGet("captionText");

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
    updateResultMeta();
    scheduleApply();
  });
  toneSelect.addEventListener("change", () => {
    updateResultMeta();
    scheduleApply();
  });
  colorNameSelect.addEventListener("change", () => {
    const picked = COLOR_LIBRARY.find((c) => c.id === colorNameSelect.value);
    if (!picked) return;
    if (picked.id !== "custom") colorPicker.value = picked.hex;
    updateResultMeta();
    scheduleApply();
  });
  colorPicker.addEventListener("input", () => {
    colorNameSelect.value = "custom";
    updateResultMeta();
    scheduleApply();
  });
  intensityRange.addEventListener("input", () => {
    syncIntensityLabel();
    updateResultMeta();
    scheduleApply();
  });

  applyBtn.addEventListener("click", () => applyColorizeNow());
  resetBtn.addEventListener("click", () => resetResult());
  downloadBtn.addEventListener("click", () => downloadResult());
  publishBtn.addEventListener("click", () => publishPost());

  captionText.addEventListener("input", () => syncCaptionCount());
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

function syncCaptionCount() {
  const v = String(mustGet("captionText").value || "");
  mustGet("captionCount").textContent = String(v.length);
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
  originalImageData = null;
  originalDrawn = false;

  mustGet("fileName").textContent = file.name;
  mustGet("imageSize").textContent = `${formatBytes(file.size)}`;
  mustGet("origBadge").textContent = "載入中";
  mustGet("resultBadge").textContent = "處理中";
  mustGet("resultBadge").classList.add("badge--mute");
  updateResultMeta();

  setStatus("正在載入圖片...", "busy");
  setControlsEnabled(false);

  try {
    const img = await loadImageFromFile(file);
    drawOriginal(img);
    originalDrawn = true;
    setControlsEnabled(true);
    updateResultMeta();
    scheduleApply(true);
    setStatus("圖片已載入，調整選項會自動更新上色結果。", "ready");
  } catch (err) {
    console.error(err);
    setControlsEnabled(false);
    mustGet("origBadge").textContent = "載入失敗";
    setStatus("圖片載入失敗。請換一張圖片再試。", "error");
  }
}

function setControlsEnabled(enabled) {
  mustGet("applyBtn").disabled = !enabled;
  mustGet("resetBtn").disabled = !enabled;
  mustGet("downloadBtn").disabled = !enabled;
  mustGet("publishBtn").disabled = !enabled;
}

function drawOriginal(img) {
  const canvas = mustGet("originalCanvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D context not available");

  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const { w, h } = fitWithin(srcW, srcH, MAX_RENDER_WIDTH, MAX_RENDER_HEIGHT);
  canvas.width = w;
  canvas.height = h;

  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  originalImageData = ctx.getImageData(0, 0, w, h);
  mustGet("origBadge").textContent = "已載入";
}

function scheduleApply(immediate) {
  if (!originalDrawn) return;
  if (applyTimer) window.clearTimeout(applyTimer);
  const delay = immediate ? 0 : 140;
  applyTimer = window.setTimeout(() => {
    applyTimer = null;
    applyColorizeNow();
  }, delay);
}

function applyColorizeNow() {
  if (!originalImageData || !currentFile) return;
  setStatus("正在上色...", "busy");

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
  mustGet("resultBadge").textContent = "已更新";
  mustGet("resultBadge").classList.remove("badge--mute");
  updateResultMeta();
  setStatus(`上色完成（${ms}ms）。可下載或 PO 到主網頁。`, "ok");
}

function resetResult() {
  if (!originalImageData) return;
  const canvas = mustGet("resultCanvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  canvas.width = originalImageData.width;
  canvas.height = originalImageData.height;
  ctx.putImageData(originalImageData, 0, 0);
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
      downloadBlob(blob, outName);
      setStatus(`已下載：${outName}`, "ok");
    },
    mimeFromExt(ext),
    0.92
  );
}

async function publishPost() {
  if (!currentFile || !originalImageData) {
    setStatus("請先上傳並上色圖片。", "error");
    return;
  }

  const publishBtn = mustGet("publishBtn");
  publishBtn.disabled = true;
  setStatus("正在發布到主網頁...", "busy");

  const postId = `p_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const schemeId = mustGet("schemeSelect").value;
  const toneId = mustGet("toneSelect").value;
  const intensity = Number(mustGet("intensityRange").value);
  const colorHex = String(mustGet("colorPicker").value || "#2dd4bf").toUpperCase();

  const captionName = String(mustGet("captionName").value || "").trim() || "匿名";
  const captionText = String(mustGet("captionText").value || "").trim();

  try {
    const { fullBlob, fullExt } = await canvasToBlobWithExt(mustGet("resultCanvas"), currentFile.type);
    const thumbBlob = await makeThumbnailBlob(mustGet("resultCanvas"), fullExt);

    const post = {
      id: postId,
      createdAt: Date.now(),
      originalName: currentFile.name,
      originalType: currentFile.type || "",
      width: originalImageData.width,
      height: originalImageData.height,
      schemeId,
      toneId,
      intensity,
      colorHex,
      fullExt,
    };

    const posts = getPosts();
    posts.unshift(post);
    savePosts(posts);

    const db = await dbPromise;
    if (!db) throw new Error("IndexedDB unavailable");
    await idbPut(db, STORE_POST_IMAGES, {
      id: postId,
      fullBlob,
      thumbBlob,
      fullExt,
    });

    if (captionText) {
      const items = getPostComments(postId);
      items.unshift({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, name: captionName, text: captionText, ts: Date.now() });
      savePostComments(postId, items);
      mustGet("captionText").value = "";
      syncCaptionCount();
    }

    renderPosts();
    setStatus("已 PO 到主網頁展示牆。可以繼續調整或上傳新圖片再 PO。", "ok");
  } catch (err) {
    console.error(err);
    setStatus("發布失敗。請再試一次。", "error");
  } finally {
    publishBtn.disabled = false;
  }
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

  const c = styles[kind] || styles.idle;
  dot.style.background = c;
  dot.style.boxShadow = `0 0 0 4px ${alpha(c, 0.18)}`;
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
  const hue = wrapHue(baseH + scheme.hueShift);

  const w = imageData.width;
  const h = imageData.height;
  const src = imageData.data;
  const out = new Uint8ClampedArray(src.length);

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

function safeBaseName(filename) {
  const base = String(filename || "image").replace(/\\/g, "/").split("/").pop() || "image";
  return base
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "") || "image";
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

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function canvasToBlob(canvas, mime) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) reject(new Error("toBlob returned null"));
        else resolve(b);
      },
      mime,
      0.92
    );
  });
}

async function canvasToBlobWithExt(canvas, preferredMime) {
  const ext = guessDownloadExt(preferredMime);
  const mime = mimeFromExt(ext);
  const fullBlob = await canvasToBlob(canvas, mime);
  return { fullBlob, fullExt: ext };
}

async function makeThumbnailBlob(srcCanvas, ext) {
  const w0 = srcCanvas.width;
  const h0 = srcCanvas.height;
  const { w, h } = fitWithin(w0, h0, THUMB_MAX_W, THUMB_MAX_H);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D context not available");
  ctx.drawImage(srcCanvas, 0, 0, w, h);
  return canvasToBlob(c, mimeFromExt(ext));
}

function getPosts() {
  try {
    const raw = localStorage.getItem(POSTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePosts(posts) {
  localStorage.setItem(POSTS_KEY, JSON.stringify(posts));
}

function getPostComments(postId) {
  try {
    const raw = localStorage.getItem(`${POST_COMMENTS_PREFIX}${postId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePostComments(postId, items) {
  localStorage.setItem(`${POST_COMMENTS_PREFIX}${postId}`, JSON.stringify(items));
}

async function renderPosts() {
  const grid = mustGet("postGrid");
  const empty = mustGet("emptyPosts");
  const posts = getPosts();

  revokeAllThumbUrls();

  grid.innerHTML = "";
  if (posts.length === 0) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  const db = await dbPromise;
  if (!db) {
    empty.style.display = "block";
    empty.textContent = "你的瀏覽器無法使用 IndexedDB，目前無法顯示/保存已發布圖片。";
    return;
  }

  for (const post of posts) {
    const el = document.createElement("article");
    el.className = "post";

    const top = document.createElement("div");
    top.className = "post__top";

    const title = document.createElement("h4");
    title.className = "post__title";
    title.textContent = safeTitle(post.originalName);

    const meta = document.createElement("div");
    meta.className = "post__meta";
    meta.textContent = `${formatTime(post.createdAt)} | ${post.width}x${post.height}`;

    top.appendChild(title);
    top.appendChild(meta);

    const body = document.createElement("div");
    body.className = "post__body";

    const img = document.createElement("img");
    img.className = "post__img";
    img.alt = "已發布圖片";
    img.loading = "lazy";
    img.decoding = "async";
    img.src = "";

    const imgRec = await idbGet(db, STORE_POST_IMAGES, post.id);
    if (imgRec && imgRec.thumbBlob) {
      setThumbUrl(post.id, img, imgRec.thumbBlob);
    }

    const actions = document.createElement("div");
    actions.className = "post__actions";

    const dl = document.createElement("button");
    dl.className = "btn btn--primary";
    dl.type = "button";
    dl.textContent = "下載";
    dl.addEventListener("click", () => downloadPost(post.id));

    const edit = document.createElement("button");
    edit.className = "btn";
    edit.type = "button";
    edit.textContent = "載入到編輯器";
    edit.addEventListener("click", () => loadPostIntoEditor(post));

    actions.appendChild(dl);
    actions.appendChild(edit);

    const commentsWrap = document.createElement("div");
    commentsWrap.className = "post__comments";

    const commentsTitle = document.createElement("div");
    commentsTitle.className = "post__commentsTitle";
    commentsTitle.textContent = "留言評論";

    const form = document.createElement("form");
    form.className = "post__commentForm";

    const nameInput = document.createElement("input");
    nameInput.className = "field__control";
    nameInput.type = "text";
    nameInput.maxLength = 24;
    nameInput.placeholder = "暱稱（可留空）";

    const textArea = document.createElement("textarea");
    textArea.className = "field__control";
    textArea.rows = 2;
    textArea.maxLength = 280;
    textArea.placeholder = "留下你的評論...";
    textArea.required = true;

    const row = document.createElement("div");
    row.className = "post__actions";

    const send = document.createElement("button");
    send.className = "btn btn--primary";
    send.type = "submit";
    send.textContent = "送出留言";

    row.appendChild(send);

    form.appendChild(nameInput);
    form.appendChild(textArea);
    form.appendChild(row);

    const list = document.createElement("ol");
    list.className = "post__commentList";

    const emptyNote = document.createElement("div");
    emptyNote.className = "post__empty";
    emptyNote.textContent = "尚未有留言。";

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = String(nameInput.value || "").trim() || "匿名";
      const text = String(textArea.value || "").trim();
      if (!text) return;
      const items = getPostComments(post.id);
      items.unshift({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, name, text, ts: Date.now() });
      savePostComments(post.id, items);
      textArea.value = "";
      renderPostComments(list, emptyNote, items);
      setStatus("留言已送出（保存在本機瀏覽器）。", "ok");
    });

    renderPostComments(list, emptyNote, getPostComments(post.id));

    commentsWrap.appendChild(commentsTitle);
    commentsWrap.appendChild(form);
    commentsWrap.appendChild(list);
    commentsWrap.appendChild(emptyNote);

    body.appendChild(img);
    body.appendChild(actions);
    body.appendChild(commentsWrap);

    el.appendChild(top);
    el.appendChild(body);
    grid.appendChild(el);
  }
}

function renderPostComments(listEl, emptyEl, items) {
  listEl.innerHTML = "";
  if (!items || items.length === 0) {
    emptyEl.style.display = "block";
    return;
  }
  emptyEl.style.display = "none";

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
    listEl.appendChild(li);
  }
}

async function downloadPost(postId) {
  const posts = getPosts();
  const post = posts.find((p) => p.id === postId);
  if (!post) return;

  setStatus("正在準備下載...", "busy");
  try {
    const db = await dbPromise;
    const rec = await idbGet(db, STORE_POST_IMAGES, postId);
    if (!rec || !rec.fullBlob) throw new Error("missing blob");
    const base = safeBaseName(post.originalName);
    const outName = `${base}-posted.${post.fullExt || "jpg"}`;
    downloadBlob(rec.fullBlob, outName);
    setStatus(`已下載：${outName}`, "ok");
  } catch (err) {
    console.error(err);
    setStatus("下載失敗。", "error");
  }
}

async function loadPostIntoEditor(post) {
  setStatus("正在載入已發布圖片到編輯器...", "busy");
  try {
    const db = await dbPromise;
    const rec = await idbGet(db, STORE_POST_IMAGES, post.id);
    if (!rec || !rec.fullBlob) throw new Error("missing blob");

    const mime = mimeFromExt(post.fullExt || "jpg");
    const file = new File([rec.fullBlob], post.originalName || "posted.jpg", { type: mime });

    mustGet("schemeSelect").value = post.schemeId || "single";
    mustGet("toneSelect").value = post.toneId || "normal";
    mustGet("intensityRange").value = String(post.intensity ?? 70);
    syncIntensityLabel();
    mustGet("colorPicker").value = String(post.colorHex || "#2dd4bf");
    mustGet("colorNameSelect").value = "custom";
    updateResultMeta();

    await handleFile(file);
    setStatus("已載入到編輯器，可直接調整並再次 PO。", "ok");
  } catch (err) {
    console.error(err);
    setStatus("載入失敗。", "error");
  }
}

function setThumbUrl(postId, imgEl, blob) {
  const prev = postThumbUrls.get(postId);
  if (prev) URL.revokeObjectURL(prev);
  const url = URL.createObjectURL(blob);
  postThumbUrls.set(postId, url);
  imgEl.src = url;
}

function revokeAllThumbUrls() {
  for (const url of postThumbUrls.values()) URL.revokeObjectURL(url);
  postThumbUrls.clear();
}

function safeTitle(name) {
  const s = String(name || "已發布圖片").trim();
  return s.length > 40 ? `${s.slice(0, 37)}...` : s;
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

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_POST_IMAGES)) {
        db.createObjectStore(STORE_POST_IMAGES, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("indexedDB open failed"));
  });
}

function idbPut(db, storeName, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    store.put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("idbPut failed"));
  });
}

function idbGet(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error || new Error("idbGet failed"));
  });
}

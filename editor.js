/* global APP, APP_CONST, APP_PALETTES */

const { COLOR_LIBRARY, SCHEMES, TONES } = APP_PALETTES;

let currentFile = null;
let originalImageData = null;
let originalDrawn = false;
let applyTimer = null;
let dbPromise = null;
let editingPostId = null;

document.addEventListener("DOMContentLoaded", () => {
  bindUI();
  hydrateColorOptions();
  syncIntensityLabel();
  syncCaptionCount();
  setStatus("等待上傳圖片。", "idle");
  drawPlaceholder();

  dbPromise = APP.openDb().catch((err) => {
    console.error(err);
    setStatus("你的瀏覽器無法使用 IndexedDB（無法保存已發布圖片）。", "error");
    return null;
  });

  bootFromQuery();
});

function bindUI() {
  const fileInput = APP.mustGet("fileInput");
  const dropZone = APP.mustGet("dropZone");
  const pickBtn = APP.mustGet("pickBtn");

  const schemeSelect = APP.mustGet("schemeSelect");
  const toneSelect = APP.mustGet("toneSelect");
  const colorNameSelect = APP.mustGet("colorNameSelect");
  const colorPicker = APP.mustGet("colorPicker");
  const intensityRange = APP.mustGet("intensityRange");

  const applyBtn = APP.mustGet("applyBtn");
  const resetBtn = APP.mustGet("resetBtn");
  const downloadBtn = APP.mustGet("downloadBtn");
  const publishBtn = APP.mustGet("publishBtn");
  const captionText = APP.mustGet("captionText");

  pickBtn.addEventListener("click", (e) => {
    // Prevent bubbling to dropZone click handler (double open in some browsers).
    e.stopPropagation();
    fileInput.click();
  });
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
  publishBtn.addEventListener("click", () => publishToHome());

  captionText.addEventListener("input", () => syncCaptionCount());
}

function hydrateColorOptions() {
  const select = APP.mustGet("colorNameSelect");
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
  const v = Number(APP.mustGet("intensityRange").value);
  APP.mustGet("intensityLabel").textContent = `${v}%`;
}

function syncCaptionCount() {
  const v = String(APP.mustGet("captionText").value || "");
  APP.mustGet("captionCount").textContent = String(v.length);
}

function setControlsEnabled(enabled) {
  APP.mustGet("applyBtn").disabled = !enabled;
  APP.mustGet("resetBtn").disabled = !enabled;
  APP.mustGet("downloadBtn").disabled = !enabled;
  APP.mustGet("publishBtn").disabled = !enabled;
}

function setStatus(text, kind) {
  const el = APP.mustGet("statusText");
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
  const c1 = APP.mustGet("originalCanvas");
  const c2 = APP.mustGet("resultCanvas");
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
    ctx.fillText("選擇一次即可導入，之後直接調整即可", 18, 56);
  }
}

function drawOriginal(img) {
  const canvas = APP.mustGet("originalCanvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D context not available");

  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const { MAX_RENDER_WIDTH, MAX_RENDER_HEIGHT } = APP_CONST;
  const { w, h } = APP.fitWithin(srcW, srcH, MAX_RENDER_WIDTH, MAX_RENDER_HEIGHT);
  canvas.width = w;
  canvas.height = h;

  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  originalImageData = ctx.getImageData(0, 0, w, h);

  APP.mustGet("origBadge").textContent = "已載入";
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

async function handleFile(file) {
  const { MAX_FILE_BYTES } = APP_CONST;
  const isImage = (file.type && file.type.startsWith("image/")) || APP.looksLikeImageName(file.name);
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
  if (!editingPostId) editingPostId = null;

  APP.mustGet("fileName").textContent = file.name;
  APP.mustGet("imageSize").textContent = APP.formatBytes(file.size);
  APP.mustGet("origBadge").textContent = "載入中";
  APP.mustGet("resultBadge").textContent = "處理中";
  APP.mustGet("resultBadge").classList.add("badge--mute");
  updateResultMeta();

  setStatus("正在載入圖片...", "busy");
  setControlsEnabled(false);

  try {
    const img = await APP.loadImageFromFile(file);
    drawOriginal(img);
    originalDrawn = true;
    setControlsEnabled(true);
    updateResultMeta();
    scheduleApply(true);
    setStatus("圖片已導入（只需選擇一次）。調整選項會自動更新結果。", "ready");
  } catch (err) {
    console.error(err);
    setControlsEnabled(false);
    APP.mustGet("origBadge").textContent = "載入失敗";
    setStatus("圖片載入失敗。請換一張圖片再試。", "error");
  }
}

function updateResultMeta() {
  const schemeId = APP.mustGet("schemeSelect").value;
  const toneId = APP.mustGet("toneSelect").value;
  const intensity = Number(APP.mustGet("intensityRange").value);
  const colorHex = String(APP.mustGet("colorPicker").value || "#2dd4bf").toUpperCase();
  const size = originalImageData ? `${originalImageData.width} x ${originalImageData.height}` : "-";
  const schemeLabel = (SCHEMES[schemeId] || SCHEMES.single).label;
  const toneLabel = (TONES[toneId] || TONES.normal).label;
  APP.mustGet("resultMeta").textContent = `尺寸：${size} | 風格：${schemeLabel} | 色調：${toneLabel} | 顏色：${colorHex} | 比例：${intensity}%`;
}

function applyColorizeNow() {
  if (!originalImageData || !currentFile) return;
  setStatus("正在上色...", "busy");

  const schemeId = APP.mustGet("schemeSelect").value;
  const toneId = APP.mustGet("toneSelect").value;
  const scheme = SCHEMES[schemeId] || SCHEMES.single;
  const tone = TONES[toneId] || TONES.normal;
  const colorHex = String(APP.mustGet("colorPicker").value || "#2dd4bf");
  const intensity = APP.clamp01(Number(APP.mustGet("intensityRange").value) / 100);

  const baseRGB = hexToRgb(colorHex);
  if (!baseRGB) {
    setStatus("顏色格式錯誤。", "error");
    return;
  }

  const t0 = performance.now();
  const out = colorizeImageData(originalImageData, { baseRGB, intensity, scheme, tone });

  const canvas = APP.mustGet("resultCanvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    setStatus("無法取得 Canvas 環境。", "error");
    return;
  }

  canvas.width = out.width;
  canvas.height = out.height;
  ctx.putImageData(out, 0, 0);

  const ms = Math.round(performance.now() - t0);
  APP.mustGet("resultBadge").textContent = "已更新";
  APP.mustGet("resultBadge").classList.remove("badge--mute");
  updateResultMeta();
  setStatus(`上色完成（${ms}ms）。可下載或 PO 到主頁。`, "ok");
}

function resetResult() {
  if (!originalImageData) return;
  const canvas = APP.mustGet("resultCanvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  canvas.width = originalImageData.width;
  canvas.height = originalImageData.height;
  ctx.putImageData(originalImageData, 0, 0);
  APP.mustGet("resultBadge").textContent = "已還原";
  APP.mustGet("resultBadge").classList.add("badge--mute");
  setStatus("已還原為原圖。", "ready");
}

function downloadResult() {
  if (!currentFile) {
    setStatus("請先上傳圖片。", "error");
    return;
  }

  const canvas = APP.mustGet("resultCanvas");
  const ext = APP.guessDownloadExt(currentFile.type);
  const base = APP.safeBaseName(currentFile.name);
  const outName = `${base}-colorized.${ext}`;

  setStatus("正在準備下載...", "busy");
  canvas.toBlob(
    (blob) => {
      if (!blob) {
        setStatus("下載失敗（無法產生檔案）。", "error");
        return;
      }
      APP.downloadBlob(blob, outName);
      setStatus(`已下載：${outName}`, "ok");
    },
    APP.mimeFromExt(ext),
    0.92
  );
}

async function publishToHome() {
  if (!currentFile || !originalImageData) {
    setStatus("請先上傳並上色圖片。", "error");
    return;
  }

  const publishBtn = APP.mustGet("publishBtn");
  publishBtn.disabled = true;
  setStatus("正在發布到主頁...", "busy");

  const schemeId = APP.mustGet("schemeSelect").value;
  const toneId = APP.mustGet("toneSelect").value;
  const intensity = Number(APP.mustGet("intensityRange").value);
  const colorHex = String(APP.mustGet("colorPicker").value || "#2dd4bf").toUpperCase();
  const captionName = String(APP.mustGet("captionName").value || "").trim() || "匿名";
  const captionText = String(APP.mustGet("captionText").value || "").trim();

  try {
    const db = await dbPromise;
    if (!db) throw new Error("IndexedDB unavailable");

    const postId = editingPostId || `p_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const { fullBlob, fullExt } = await APP.canvasToBlobWithExt(APP.mustGet("resultCanvas"), currentFile.type);
    const thumbBlob = await APP.makeThumbnailBlob(APP.mustGet("resultCanvas"), fullExt);

    const post = {
      id: postId,
      createdAt: editingPostId ? Date.now() : Date.now(),
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

    const posts = APP.getPosts();
    const idx = posts.findIndex((p) => p.id === postId);
    if (idx >= 0) posts.splice(idx, 1);
    posts.unshift(post);
    APP.savePosts(posts);

    await APP.idbPut(db, APP_CONST.STORE_POST_IMAGES, { id: postId, fullBlob, thumbBlob, fullExt });

    if (captionText) {
      const items = APP.getPostComments(postId);
      items.unshift({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, name: captionName, text: captionText, ts: Date.now() });
      APP.savePostComments(postId, items);
      APP.mustGet("captionText").value = "";
      syncCaptionCount();
    }

    APP.notifyPostsUpdated();
    setStatus("已 PO 到主頁，主頁會自動更新。", "ok");

    try {
      if (window.opener && !window.opener.closed) window.opener.focus();
    } catch {
      // ignore
    }

    setTimeout(() => {
      try {
        window.close();
      } catch {
        // ignore
      }
    }, 250);
  } catch (err) {
    console.error(err);
    setStatus("發布失敗。請再試一次。", "error");
  } finally {
    publishBtn.disabled = false;
  }
}

async function bootFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  if (!id) return;

  editingPostId = id;
  setStatus("正在載入已發布圖片...", "busy");

  try {
    const db = await dbPromise;
    if (!db) throw new Error("IndexedDB unavailable");
    const posts = APP.getPosts();
    const post = posts.find((p) => p.id === id);
    const rec = await APP.idbGet(db, APP_CONST.STORE_POST_IMAGES, id);
    if (!rec || !rec.fullBlob) throw new Error("missing blob");

    if (post) {
      APP.mustGet("schemeSelect").value = post.schemeId || "single";
      APP.mustGet("toneSelect").value = post.toneId || "normal";
      APP.mustGet("intensityRange").value = String(post.intensity ?? 70);
      syncIntensityLabel();
      APP.mustGet("colorPicker").value = String(post.colorHex || "#2dd4bf");
      APP.mustGet("colorNameSelect").value = "custom";
      updateResultMeta();
    }

    const ext = post && post.fullExt ? post.fullExt : "jpg";
    const mime = APP.mimeFromExt(ext);
    const file = new File([rec.fullBlob], (post && post.originalName) || "posted.jpg", { type: mime });
    await handleFile(file);
    setStatus("已載入已發布圖片，可直接修改並 PO 回主頁。", "ready");
  } catch (err) {
    console.error(err);
    setStatus("載入失敗。", "error");
  }
}

// Color math
function colorizeImageData(imageData, opts) {
  const { baseRGB, intensity, scheme, tone } = opts;
  const { h: baseH, s: baseS } = rgbToHsl(baseRGB.r, baseRGB.g, baseRGB.b);

  const sat = APP.clamp01(baseS * scheme.satMult * tone.satExtra);
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
    light = APP.clamp01((light - 0.5) * contrast + 0.5);

    const tinted = hslToRgb(hue, sat, light);
    out[i] = mix8(r, tinted.r, intensity);
    out[i + 1] = mix8(g, tinted.g, intensity);
    out[i + 2] = mix8(b, tinted.b, intensity);
    out[i + 3] = a;
  }

  return new ImageData(out, w, h);
}

function applyCurve(x, gamma, lift) {
  const y = Math.pow(APP.clamp01(x), 1 / Math.max(0.0001, gamma));
  return APP.clamp01(y + lift);
}

function luminance01(r, g, b) {
  return APP.clamp01((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255);
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

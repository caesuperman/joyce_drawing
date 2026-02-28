/* global indexedDB */

// Shared constants
window.APP_CONST = {
  MAX_FILE_BYTES: 15 * 1024 * 1024,
  MAX_RENDER_WIDTH: 1800,
  MAX_RENDER_HEIGHT: 1800,
  THUMB_MAX_W: 840,
  THUMB_MAX_H: 560,
  POSTS_KEY: "img-colorizer-posts-v1",
  POST_COMMENTS_PREFIX: "img-colorizer-post-comments-v1::",
  DB_NAME: "img-colorizer-db",
  DB_VERSION: 1,
  STORE_POST_IMAGES: "postImages",
  CHANNEL_NAME: "img-colorizer",
};

window.APP_PALETTES = {
  COLOR_LIBRARY: [
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
  ],
  SCHEMES: {
    single: { label: "單色上色", hueShift: 0, satMult: 1.0, contrast: 1.0, gamma: 1.0, lift: 0.0 },
    warm: { label: "暖色系", hueShift: 12, satMult: 1.05, contrast: 1.03, gamma: 0.98, lift: 0.02 },
    cool: { label: "冷色系", hueShift: -14, satMult: 1.02, contrast: 1.02, gamma: 1.02, lift: 0.015 },
    vintage: { label: "復古", hueShift: 18, satMult: 0.82, contrast: 0.96, gamma: 0.94, lift: 0.055 },
    morandi: { label: "莫蘭迪", hueShift: 8, satMult: 0.62, contrast: 0.98, gamma: 1.03, lift: 0.045 },
    neon: { label: "霓虹", hueShift: 0, satMult: 1.35, contrast: 1.08, gamma: 1.0, lift: 0.0 },
    ink: { label: "墨水", hueShift: -6, satMult: 0.9, contrast: 1.22, gamma: 1.05, lift: 0.0 },
  },
  TONES: {
    soft: { label: "柔和", satExtra: 0.82, contrastExtra: 0.98 },
    normal: { label: "標準", satExtra: 1.0, contrastExtra: 1.0 },
    bold: { label: "濃烈", satExtra: 1.18, contrastExtra: 1.04 },
  },
};

// Shared helpers
window.APP = {
  mustGet(id) {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element: ${id}`);
    return el;
  },

  clamp01(x) {
    return Math.max(0, Math.min(1, x));
  },

  fitWithin(w, h, maxW, maxH) {
    const scale = Math.min(1, maxW / Math.max(1, w), maxH / Math.max(1, h));
    return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
  },

  formatBytes(bytes) {
    const units = ["B", "KB", "MB", "GB"];
    let v = bytes;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i += 1;
    }
    return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  },

  safeBaseName(filename) {
    const base = String(filename || "image").replace(/\\/g, "/").split("/").pop() || "image";
    return (
      base
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^[-.]+|[-.]+$/g, "") || "image"
    );
  },

  safeTitle(name) {
    const s = String(name || "已發布圖片").trim();
    return s.length > 40 ? `${s.slice(0, 37)}...` : s;
  },

  formatTime(ts) {
    const d = new Date(Number(ts) || Date.now());
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day} ${hh}:${mm}`;
  },

  looksLikeImageName(name) {
    const n = String(name || "").toLowerCase();
    return /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(n);
  },

  guessDownloadExt(mime) {
    const m = String(mime || "").toLowerCase();
    if (m.includes("png")) return "png";
    if (m.includes("webp")) return "webp";
    return "jpg";
  },

  mimeFromExt(ext) {
    if (ext === "png") return "image/png";
    if (ext === "webp") return "image/webp";
    return "image/jpeg";
  },

  loadImageFromFile(file) {
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
  },

  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  canvasToBlob(canvas, mime) {
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
  },

  async canvasToBlobWithExt(canvas, preferredMime) {
    const ext = APP.guessDownloadExt(preferredMime);
    const mime = APP.mimeFromExt(ext);
    const fullBlob = await APP.canvasToBlob(canvas, mime);
    return { fullBlob, fullExt: ext };
  },

  async makeThumbnailBlob(srcCanvas, ext) {
    const { THUMB_MAX_W, THUMB_MAX_H } = APP_CONST;
    const w0 = srcCanvas.width;
    const h0 = srcCanvas.height;
    const { w, h } = APP.fitWithin(w0, h0, THUMB_MAX_W, THUMB_MAX_H);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("2D context not available");
    ctx.drawImage(srcCanvas, 0, 0, w, h);
    return APP.canvasToBlob(c, APP.mimeFromExt(ext));
  },

  getPosts() {
    const { POSTS_KEY } = APP_CONST;
    try {
      const raw = localStorage.getItem(POSTS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  savePosts(posts) {
    const { POSTS_KEY } = APP_CONST;
    localStorage.setItem(POSTS_KEY, JSON.stringify(posts));
  },

  getPostComments(postId) {
    const { POST_COMMENTS_PREFIX } = APP_CONST;
    try {
      const raw = localStorage.getItem(`${POST_COMMENTS_PREFIX}${postId}`);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  savePostComments(postId, items) {
    const { POST_COMMENTS_PREFIX } = APP_CONST;
    localStorage.setItem(`${POST_COMMENTS_PREFIX}${postId}`, JSON.stringify(items));
  },

  openDb() {
    const { DB_NAME, DB_VERSION, STORE_POST_IMAGES } = APP_CONST;
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
  },

  idbPut(db, storeName, value) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      store.put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("idbPut failed"));
    });
  },

  idbGet(db, storeName, key) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error("idbGet failed"));
    });
  },

  idbDelete(db, storeName, key) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("idbDelete failed"));
    });
  },

  notifyPostsUpdated() {
    const { CHANNEL_NAME } = APP_CONST;
    try {
      const bc = new BroadcastChannel(CHANNEL_NAME);
      bc.postMessage({ type: "posts-updated", ts: Date.now() });
      bc.close();
    } catch {
      // ignore
    }
  },
};

/* global APP, APP_CONST */

let dbPromise = null;
const thumbUrls = new Map();

document.addEventListener("DOMContentLoaded", () => {
  const newBtn = APP.mustGet("newPostBtn");
  newBtn.addEventListener("click", () => openEditor());

  dbPromise = APP.openDb().catch((err) => {
    console.error(err);
    showEmpty("你的瀏覽器無法使用 IndexedDB，目前無法顯示/保存已發布圖片。\n建議改用 Chrome/Edge。", true);
    return null;
  });

  listenForUpdates();
  renderPosts();
});

function listenForUpdates() {
  const { CHANNEL_NAME } = APP_CONST;

  try {
    const bc = new BroadcastChannel(CHANNEL_NAME);
    bc.addEventListener("message", (e) => {
      if (e && e.data && e.data.type === "posts-updated") renderPosts();
    });
  } catch {
    // ignore
  }

  window.addEventListener("focus", () => renderPosts());
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) renderPosts();
  });

  window.addEventListener("storage", (e) => {
    if (e && e.key === APP_CONST.POSTS_KEY) renderPosts();
  });
}

function openEditor(postId) {
  const url = postId ? `editor.html?id=${encodeURIComponent(postId)}` : "editor.html";
  const w = window.open(url, "img-colorizer-editor");
  if (!w) {
    // Popup blocked. Fallback: navigate in same tab.
    window.location.href = url;
  }
}

async function renderPosts() {
  const grid = APP.mustGet("postGrid");
  const empty = APP.mustGet("emptyPosts");
  const posts = APP.getPosts();

  revokeAllThumbUrls();
  grid.innerHTML = "";

  const db = await dbPromise;
  if (!db) return;

  if (posts.length === 0) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  for (const post of posts) {
    const el = document.createElement("article");
    el.className = "post";

    const top = document.createElement("div");
    top.className = "post__top";

    const title = document.createElement("h4");
    title.className = "post__title";
    title.textContent = APP.safeTitle(post.originalName);

    const meta = document.createElement("div");
    meta.className = "post__meta";
    meta.textContent = `${APP.formatTime(post.createdAt)} | ${post.width}x${post.height}`;

    top.appendChild(title);
    top.appendChild(meta);

    const body = document.createElement("div");
    body.className = "post__body";

    const img = document.createElement("img");
    img.className = "post__img";
    img.alt = "已發布圖片";
    img.loading = "lazy";
    img.decoding = "async";

    const rec = await APP.idbGet(db, APP_CONST.STORE_POST_IMAGES, post.id);
    if (rec && rec.thumbBlob) {
      setThumbUrl(post.id, img, rec.thumbBlob);
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
    edit.textContent = "在新分頁編輯";
    edit.addEventListener("click", () => openEditor(post.id));

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
      const items = APP.getPostComments(post.id);
      items.unshift({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, name, text, ts: Date.now() });
      APP.savePostComments(post.id, items);
      textArea.value = "";
      renderPostComments(list, emptyNote, items);
    });

    renderPostComments(list, emptyNote, APP.getPostComments(post.id));

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
    time.textContent = APP.formatTime(it.ts);

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
  const posts = APP.getPosts();
  const post = posts.find((p) => p.id === postId);
  if (!post) return;

  try {
    const db = await dbPromise;
    if (!db) return;
    const rec = await APP.idbGet(db, APP_CONST.STORE_POST_IMAGES, postId);
    if (!rec || !rec.fullBlob) throw new Error("missing blob");
    const base = APP.safeBaseName(post.originalName);
    const outName = `${base}-posted.${post.fullExt || "jpg"}`;
    APP.downloadBlob(rec.fullBlob, outName);
  } catch (err) {
    console.error(err);
  }
}

function setThumbUrl(postId, imgEl, blob) {
  const prev = thumbUrls.get(postId);
  if (prev) URL.revokeObjectURL(prev);
  const url = URL.createObjectURL(blob);
  thumbUrls.set(postId, url);
  imgEl.src = url;
}

function revokeAllThumbUrls() {
  for (const url of thumbUrls.values()) URL.revokeObjectURL(url);
  thumbUrls.clear();
}

function showEmpty(text, isError) {
  const empty = APP.mustGet("emptyPosts");
  empty.style.display = "block";
  empty.textContent = text;
  if (isError) empty.style.borderColor = "rgba(251,113,133,0.35)";
}

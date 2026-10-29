/* 轻收藏 · 弹窗逻辑 */
const ICON = {
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M15 5.5V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h.5"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9.5 7V4.8h5V7M6.5 7l.9 13h9.2l.9-13M10.5 11v5.5M13.5 11v5.5"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.2c.5 0 1 .2 1.4.6L11.4 6h7.1A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z"/></svg>',
};

const state = {
  folders: [],
  bookmarks: [],
  folderById: new Map(),
  byId: new Map(),
  clicks: {},
  query: '',
  folderId: null,
};

const view = document.getElementById('view');
const searchInput = document.getElementById('search');
const ctxMenu = document.getElementById('ctx-menu');

let ctxBookmarkId = null;
let ctxX = 0;
let ctxY = 0;

init();

async function init() {
  const [data, clicks] = await Promise.all([BM.loadData(), BM.getClicks()]);
  applyData(data);
  state.clicks = clicks;

  // 打开弹窗时直接进入主收藏夹（书签栏）
  const mainFolder = state.folderById.get(BM.BAR_ID) || BM.topFolders(state.folders)[0];
  if (mainFolder) state.folderId = mainFolder.id;

  bindEvents();
  render();
  searchInput.focus();
}

function applyData(data) {
  state.folders = data.folders;
  state.bookmarks = data.bookmarks;
  state.folderById = data.folderById;
  state.byId = data.byId;
  if (state.folderId && !state.folderById.has(state.folderId)) state.folderId = null;
}

async function reload() {
  const scrollTop = view.scrollTop;
  const [data, clicks] = await Promise.all([BM.loadData(), BM.getClicks()]);
  applyData(data);
  state.clicks = clicks;
  render();
  view.scrollTop = scrollTop;
}

function bindEvents() {
  document.getElementById('btn-manage').addEventListener('click', openManager);

  const syncQuery = () => {
    state.query = searchInput.value;
    render();
  };
  searchInput.addEventListener('input', syncQuery);
  searchInput.addEventListener('search', syncQuery);

  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (state.query) {
        searchInput.value = '';
        state.query = '';
        render();
      } else {
        window.close();
      }
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const target = document.querySelector('.item.active') || document.querySelector('.item');
      if (target) openBookmark(target.dataset.id);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = [...document.querySelectorAll('.view .item')];
    if (!items.length) return;
    event.preventDefault();
    let index = items.findIndex((item) => item.classList.contains('active'));
    if (event.key === 'ArrowDown') index = index < 0 ? 0 : Math.min(index + 1, items.length - 1);
    else index = index <= 0 ? 0 : index - 1;
    items.forEach((item) => item.classList.remove('active'));
    items[index].classList.add('active');
    items[index].scrollIntoView({ block: 'nearest' });
  });

  view.addEventListener('click', (event) => {
    const actionBtn = event.target.closest('[data-act]');
    if (actionBtn) {
      const row = actionBtn.closest('[data-id]');
      if (!row) return;
      if (actionBtn.dataset.act === 'copy') copyBookmark(row.dataset.id);
      if (actionBtn.dataset.act === 'del') removeBookmark(row.dataset.id);
      return;
    }

    const folderRow = event.target.closest('[data-folder]');
    if (folderRow) {
      state.folderId = folderRow.dataset.folder;
      state.query = '';
      searchInput.value = '';
      render();
      view.scrollTop = 0;
      return;
    }

    if (event.target.closest('[data-back]')) {
      goBack();
      return;
    }

    const item = event.target.closest('.item[data-id]');
    if (item) openBookmark(item.dataset.id);
  });

  document.addEventListener('contextmenu', onContextMenu);
  ctxMenu.addEventListener('click', onContextMenuClick);
  document.addEventListener('mousedown', (event) => {
    if (!ctxMenu.hidden && !ctxMenu.contains(event.target)) closeContextMenu();
  });
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && !ctxMenu.hidden) {
        event.preventDefault();
        event.stopPropagation();
        closeContextMenu();
      }
    },
    true
  );
  view.addEventListener('scroll', closeContextMenu);
  window.addEventListener('resize', closeContextMenu);
}

function render() {
  closeContextMenu();
  const query = state.query.trim();
  let html;
  if (query) html = renderSearch(query);
  else if (state.folderId) html = renderFolder(state.folderId);
  else html = renderHome();

  view.innerHTML = html;
}

function renderHome() {
  const tops = BM.topFolders(state.folders);
  const recent = [...state.bookmarks]
    .sort((a, b) => b.dateAdded - a.dateAdded)
    .slice(0, 6);
  const frequent = Object.entries(state.clicks)
    .filter(([id, count]) => count > 0 && state.byId.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ bookmark: state.byId.get(id), count }));

  if (!state.bookmarks.length) {
    return `<div class="empty-state">
      <strong>还没有收藏</strong>
      <span class="hint">使用浏览器收藏（Ctrl+D）添加页面<br>也可以打开管理页批量整理</span>
    </div>`;
  }

  const chips = tops.length
    ? tops
        .map(
          (folder) => `<button class="chip" data-folder="${folder.id}">
            <span class="chip-name">${BM.escapeHtml(folder.title)}</span>
            <span class="chip-count">${folder.count}</span>
          </button>`
        )
        .join('')
    : '<p class="empty-hint">暂无文件夹</p>';

  return `
    <section class="section">
      <div class="section-head"><h2>文件夹</h2></div>
      <div class="chips">${chips}</div>
    </section>
    ${
      recent.length
        ? `<section class="section">
            <div class="section-head"><h2>最近添加</h2></div>
            <ul class="list">${recent.map((bookmark) => itemHtml(bookmark, pathText(bookmark))).join('')}</ul>
          </section>`
        : ''
    }
    ${
      frequent.length
        ? `<section class="section">
            <div class="section-head"><h2>常用</h2></div>
            <ul class="list">${frequent
              .map(({ bookmark, count }) => itemHtml(bookmark, `打开 ${count} 次`))
              .join('')}</ul>
          </section>`
        : ''
    }
  `;
}

function renderFolder(folderId) {
  const folder = state.folderById.get(folderId);
  const kids = BM.childFolders(state.folders, folderId);
  const items = BM.childBookmarks(state.bookmarks, folderId);
  const crumbs = (folder ? folder.path.concat(folder.title) : []).join(' / ');

  const body = [];
  if (items.length) {
    body.push(`<ul class="list">${items.map((bookmark) => itemHtml(bookmark, BM.hostname(bookmark.url))).join('')}</ul>`);
  }
  if (kids.length) {
    body.push(`<div class="split-title">子文件夹 · ${kids.length}</div>`);
    body.push(`<ul class="list">${kids.map(folderRowHtml).join('')}</ul>`);
  }
  if (!kids.length && !items.length) {
    body.push('<p class="empty-hint">这个文件夹还是空的<br>使用浏览器收藏（Ctrl+D）即可添加</p>');
  }

  return `<div class="folder-bar">
      <button class="back" data-back>← 返回</button>
      <span class="crumb" title="${BM.escapeHtml(crumbs)}">${BM.escapeHtml(crumbs)}</span>
    </div>
    ${body.join('')}`;
}

function renderSearch(query) {
  const results = state.bookmarks
    .filter((bookmark) => BM.matches(query, bookmark.title, bookmark.url))
    .sort((a, b) => rank(a, query) - rank(b, query));

  if (!results.length) {
    return `<p class="empty-hint">没有找到与「${BM.escapeHtml(query)}」相关的收藏</p>`;
  }

  return `<div class="split-title">搜索结果 · ${results.length}</div>
    <ul class="list">${results
      .map((bookmark) => itemHtml(bookmark, pathText(bookmark)))
      .join('')}</ul>`;
}

function rank(bookmark, query) {
  const title = bookmark.title.toLowerCase();
  const needle = query.trim().toLowerCase();
  if (title === needle) return 0;
  if (title.startsWith(needle)) return 1;
  if (title.includes(needle)) return 2;
  if (BM.hostname(bookmark.url).includes(needle)) return 3;
  return 4;
}

function pathText(bookmark) {
  return bookmark.path.length ? bookmark.path.join(' / ') : '根目录';
}

function itemHtml(bookmark, sub) {
  return `<li class="item" data-id="${bookmark.id}" title="${BM.escapeHtml(bookmark.title)}">
    ${BM.faviconHtml(bookmark.url, bookmark.title, 28)}
    <span class="meta">
      <span class="title">${BM.highlight(bookmark.title, state.query)}</span>
      <span class="sub">${BM.escapeHtml(sub || BM.hostname(bookmark.url))}</span>
    </span>
    <span class="row-actions">
      <button class="mini" data-act="copy" title="复制链接">${ICON.copy}</button>
      <button class="mini danger" data-act="del" title="删除">${ICON.trash}</button>
    </span>
  </li>`;
}

function folderRowHtml(folder) {
  const kids = BM.childFolders(state.folders, folder.id).length;
  const sub = `${folder.count} 条收藏${kids ? ` · ${kids} 个文件夹` : ''}`;
  return `<li class="folder-row" data-folder="${folder.id}">
    <span class="folder-icon">${ICON.folder}</span>
    <span class="meta">
      <span class="title">${BM.escapeHtml(folder.title)}</span>
      <span class="sub">${sub}</span>
    </span>
  </li>`;
}

function goBack() {
  const folder = state.folderById.get(state.folderId);
  state.folderId = folder && folder.parentId !== '0' ? folder.parentId : null;
  render();
  view.scrollTop = 0;
}

/* ---------- 列表右键菜单 ---------- */

function onContextMenu(event) {
  if (event.target.closest('input, textarea')) return;
  event.preventDefault();
  const item = event.target.closest('.item[data-id]');
  if (!item) {
    closeContextMenu();
    return;
  }
  openContextMenu(item.dataset.id, event.clientX, event.clientY);
}

function openContextMenu(id, x, y) {
  if (!state.byId.has(id)) return;
  ctxBookmarkId = id;
  ctxX = x;
  ctxY = y;
  renderContextMenu();
  ctxMenu.hidden = false;
  placeContextMenu();
}

function renderContextMenu() {
  ctxMenu.innerHTML = `<button data-ctx="open">打开</button>
    <button data-ctx="copy">复制链接</button>
    <button data-ctx="move">移动到文件夹…</button>
    <div class="ctx-sep"></div>
    <button data-ctx="delete" class="danger">删除</button>`;
}

function showMoveMenu() {
  const bookmark = state.byId.get(ctxBookmarkId);
  if (!bookmark) {
    closeContextMenu();
    return;
  }
  const options = state.folders
    .map((folder) => {
      const label = folder.path.concat(folder.title).join(' / ');
      const current = folder.id === bookmark.parentId;
      return `<button data-ctx="move-to" data-folder="${folder.id}"${current ? ' class="current" disabled' : ''}>${BM.escapeHtml(label)}${current ? ' · 当前' : ''}</button>`;
    })
    .join('');

  ctxMenu.innerHTML = `<button data-ctx="back" class="ctx-back">← 返回</button>
    <div class="ctx-title">移动到文件夹</div>
    <div class="ctx-list">${options || '<p class="ctx-empty">没有可用的文件夹</p>'}</div>`;
  placeContextMenu();
}

function placeContextMenu() {
  const rect = ctxMenu.getBoundingClientRect();
  const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
  const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
  ctxMenu.style.left = Math.min(Math.max(8, ctxX), maxLeft) + 'px';
  ctxMenu.style.top = Math.min(Math.max(8, ctxY), maxTop) + 'px';
}

function closeContextMenu() {
  if (ctxMenu.hidden && !ctxMenu.innerHTML) return;
  ctxMenu.hidden = true;
  ctxMenu.innerHTML = '';
  ctxBookmarkId = null;
}

async function onContextMenuClick(event) {
  const button = event.target.closest('[data-ctx]');
  if (!button) return;
  const action = button.dataset.ctx;
  const id = ctxBookmarkId;

  if (action === 'move') {
    showMoveMenu();
    return;
  }
  if (action === 'back') {
    renderContextMenu();
    placeContextMenu();
    return;
  }
  if (action === 'move-to') {
    const folderId = button.dataset.folder;
    closeContextMenu();
    await moveBookmark(id, folderId);
    return;
  }

  closeContextMenu();
  if (action === 'open') openBookmark(id);
  if (action === 'copy') copyBookmark(id);
  if (action === 'delete') removeBookmark(id);
}

async function moveBookmark(id, parentId) {
  const bookmark = state.byId.get(id);
  if (!bookmark || bookmark.parentId === parentId) return;
  const folder = state.folderById.get(parentId);
  try {
    await chrome.bookmarks.move(id, { parentId });
    BM.toast(`已移动到「${folder ? folder.title : '文件夹'}」`);
  } catch (error) {
    BM.toast('移动失败：' + (error.message || error));
    return;
  }
  await reload();
}

async function openBookmark(id) {
  const bookmark = state.byId.get(id);
  if (!bookmark) return;
  await BM.bumpClick(bookmark.id);
  await chrome.tabs.create({ url: bookmark.url });
  window.close();
}

async function copyBookmark(id) {
  const bookmark = state.byId.get(id);
  if (!bookmark) return;
  try {
    await navigator.clipboard.writeText(bookmark.url);
    BM.toast('链接已复制');
  } catch {
    BM.toast('复制失败，请手动复制');
  }
}

async function removeBookmark(id) {
  const bookmark = state.byId.get(id);
  if (!bookmark) return;
  const snapshot = { ...bookmark };
  try {
    await chrome.bookmarks.remove(id);
  } catch (error) {
    BM.toast('删除失败：' + error.message);
    return;
  }
  BM.toast('已删除「' + snapshot.title + '」', '撤销', async () => {
    try {
      await chrome.bookmarks.create({
        parentId: snapshot.parentId,
        title: snapshot.title,
        url: snapshot.url,
      });
      await reload();
    } catch (error) {
      BM.toast('撤销失败：' + (error.message || error));
    }
  });
  await reload();
}

function openManager() {
  chrome.tabs.create({ url: chrome.runtime.getURL('manager.html') });
  window.close();
}

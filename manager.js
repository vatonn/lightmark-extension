/* 轻收藏 · 管理页逻辑 */
const ICONS = {
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.2c.5 0 1 .2 1.4.6L11.4 6h7.1A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z"/></svg>',
  open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-7 7M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M15 5.5V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h.5"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l4.2-1 10.4-10.4a2.1 2.1 0 0 0-3-3L5.2 16z"/><path d="M14.5 6.5l3 3"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9.5 7V4.8h5V7M6.5 7l.9 13h9.2l.9-13M10.5 11v5.5M13.5 11v5.5"/></svg>',
};

const RECENT_LIMIT = 30;

const state = {
  folders: [],
  bookmarks: [],
  folderById: new Map(),
  byId: new Map(),
  clicks: {},
  settings: { defaultFolderId: '1' },
  mode: 'all',
  folderId: null,
  query: '',
  sort: 'default',
  layout: 'grid',
  expanded: new Set(),
  dialogMode: 'new',
  editingId: null,
};

const els = {
  content: document.getElementById('content'),
  tree: document.getElementById('tree'),
  crumbs: document.getElementById('crumbs'),
  search: document.getElementById('search'),
  sort: document.getElementById('sort'),
  layout: document.getElementById('layout'),
  dialog: document.getElementById('edit-dialog'),
  form: document.getElementById('edit-form'),
  dialogTitle: document.getElementById('dialog-title'),
  fTitle: document.getElementById('f-title'),
  fUrl: document.getElementById('f-url'),
  fFolder: document.getElementById('f-folder'),
  defaultFolder: document.getElementById('default-folder'),
};

init();

async function init() {
  const [data, clicks, settings] = await Promise.all([
    BM.loadData(),
    BM.getClicks(),
    BM.getSettings(),
  ]);
  applyData(data);
  state.clicks = clicks;
  state.settings = settings;
  BM.topFolders(state.folders).forEach((folder) => state.expanded.add(folder.id));

  bindEvents();
  renderAll();
}

function applyData(data) {
  state.folders = data.folders;
  state.bookmarks = data.bookmarks;
  state.folderById = data.folderById;
  state.byId = data.byId;
  if (state.folderId && !state.folderById.has(state.folderId)) {
    state.folderId = null;
    state.mode = 'all';
  }
}

function bindEvents() {
  document.querySelectorAll('.nav-item[data-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      state.mode = button.dataset.mode;
      state.folderId = null;
      clearSearch();
      renderAll();
    });
  });

  els.tree.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-toggle]');
    if (toggle) {
      event.stopPropagation();
      const id = toggle.dataset.toggle;
      if (state.expanded.has(id)) state.expanded.delete(id);
      else state.expanded.add(id);
      renderTree();
      return;
    }
    const row = event.target.closest('.tree-row[data-folder]');
    if (row) navigateFolder(row.dataset.folder);
  });

  els.crumbs.addEventListener('click', (event) => {
    const modeButton = event.target.closest('[data-mode]');
    if (modeButton) {
      state.mode = modeButton.dataset.mode;
      state.folderId = null;
      clearSearch();
      renderAll();
      return;
    }
    const folderButton = event.target.closest('[data-folder]');
    if (folderButton) navigateFolder(folderButton.dataset.folder);
  });

  const syncSearch = () => {
    state.query = els.search.value;
    renderNav();
    renderCrumbs();
    renderContent();
  };
  els.search.addEventListener('input', syncSearch);
  els.search.addEventListener('search', syncSearch);

  els.search.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      clearSearch();
      els.search.blur();
      renderNav();
      renderCrumbs();
      renderContent();
    }
  });

  els.sort.addEventListener('change', () => {
    state.sort = els.sort.value;
    renderContent();
  });

  els.layout.addEventListener('click', (event) => {
    const button = event.target.closest('[data-layout]');
    if (!button) return;
    state.layout = button.dataset.layout;
    els.layout.querySelectorAll('[data-layout]').forEach((item) => {
      item.classList.toggle('active', item === button);
    });
    renderContent();
  });

  document.getElementById('btn-new').addEventListener('click', () => openDialog('new', null));
  document.getElementById('dialog-cancel').addEventListener('click', () => els.dialog.close());
  els.form.addEventListener('submit', saveDialog);

  els.defaultFolder.addEventListener('change', async () => {
    state.settings = await BM.saveSettings({ defaultFolderId: els.defaultFolder.value });
    BM.toast('已更新默认收藏位置');
  });

  els.content.addEventListener('click', onContentClick);

  document.addEventListener('keydown', (event) => {
    const typing =
      event.target &&
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName);
    if (event.key === '/' && !typing && !els.dialog.open) {
      event.preventDefault();
      els.search.focus();
      els.search.select();
    }
    if (event.key === 'Escape' && els.dialog.open) return;
    if (event.key === 'Escape' && document.activeElement === els.search) {
      clearSearch();
      renderNav();
      renderCrumbs();
      renderContent();
    }
  });

  const scheduleReload = BM.debounce(reload, 320);
  ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered', 'onImportEnded'].forEach(
    (name) => {
      if (chrome.bookmarks[name]) chrome.bookmarks[name].addListener(scheduleReload);
    }
  );

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.clicks) {
      state.clicks = changes.clicks.newValue || {};
      renderContent();
    }
    if (area === 'sync' && changes.settings) {
      state.settings = Object.assign({ defaultFolderId: '1' }, changes.settings.newValue || {});
      els.defaultFolder.value = state.settings.defaultFolderId;
    }
  });
}

async function reload() {
  const [data, clicks] = await Promise.all([BM.loadData(), BM.getClicks()]);
  applyData(data);
  state.clicks = clicks;
  renderAll();
}

function renderAll() {
  renderNav();
  renderTree();
  renderCrumbs();
  renderContent();
  fillFolderOptions(els.defaultFolder, state.settings.defaultFolderId || BM.BAR_ID);
}

/* ---------- 左侧导航 ---------- */

function renderNav() {
  const recentCount = Math.min(state.bookmarks.length, RECENT_LIMIT);
  document.getElementById('count-all').textContent = state.bookmarks.length;
  document.getElementById('count-recent').textContent = recentCount;
  document.getElementById('count-dupes').textContent = duplicateGroups().length;
  document.getElementById('count-empty').textContent = emptyFolders().length;

  document.querySelectorAll('.nav-item[data-mode]').forEach((button) => {
    button.classList.toggle(
      'active',
      !state.query && button.dataset.mode === state.mode && state.mode !== 'folder'
    );
  });
}

function renderTree() {
  els.tree.innerHTML = treeRows('0', 0) || '<p class="tree-empty">暂无文件夹</p>';
}

function treeRows(parentId, depth) {
  return BM.childFolders(state.folders, parentId)
    .map((folder) => {
      const kids = BM.childFolders(state.folders, folder.id);
      const open = state.expanded.has(folder.id);
      const active = state.mode === 'folder' && state.folderId === folder.id && !state.query;
      return `<div class="tree-node">
        <div class="tree-row${active ? ' active' : ''}" data-folder="${folder.id}" style="padding-left:${8 + depth * 16}px">
          <button class="twist${kids.length ? '' : ' leaf'}${open ? ' open' : ''}" data-toggle="${folder.id}" tabindex="-1">${kids.length ? ICONS.chevron : ''}</button>
          <span class="tree-icon">${ICONS.folder}</span>
          <span class="tree-name" title="${BM.escapeHtml(folder.title)}">${BM.escapeHtml(folder.title)}</span>
          <span class="tree-count">${folder.count}</span>
        </div>
        ${kids.length && open ? `<div class="tree-kids">${treeRows(folder.id, depth + 1)}</div>` : ''}
      </div>`;
    })
    .join('');
}

/* ---------- 顶部面包屑 ---------- */

function renderCrumbs() {
  if (state.query) {
    els.crumbs.innerHTML = `<span class="crumb-current">搜索「${BM.escapeHtml(state.query)}」</span>`;
    return;
  }
  if (state.mode === 'folder' && state.folderId) {
    const folder = state.folderById.get(state.folderId);
    const chain = folder ? BM.ancestors(folder, state.folderById) : [];
    const links = chain
      .map((item) => {
        const current = item.id === state.folderId;
        return `<span class="crumb-sep">/</span><button class="crumb-link${current ? ' current' : ''}" data-folder="${item.id}">${BM.escapeHtml(item.title)}</button>`;
      })
      .join('');
    els.crumbs.innerHTML = `<button class="crumb-link" data-mode="all">全部收藏</button>${links}`;
    return;
  }
  const labels = { all: '全部书签', recent: '最近添加', dupes: '重复项', empty: '空文件夹' };
  els.crumbs.innerHTML = `<span class="crumb-current">${labels[state.mode] || '全部书签'}</span>`;
}

/* ---------- 内容区 ---------- */

function renderContent() {
  els.content.className = 'content layout-' + state.layout;
  const query = state.query.trim();

  if (query) {
    els.content.innerHTML = searchHtml(query);
    return;
  }

  if (state.mode === 'folder' && state.folderId) {
    els.content.innerHTML = folderHtml(state.folderId);
    return;
  }
  if (state.mode === 'recent') {
    els.content.innerHTML = recentHtml();
    return;
  }
  if (state.mode === 'dupes') {
    els.content.innerHTML = dupesHtml();
    return;
  }
  if (state.mode === 'empty') {
    els.content.innerHTML = emptyFoldersHtml();
    return;
  }
  els.content.innerHTML = allHtml();
}

function allHtml() {
  if (!state.bookmarks.length) {
    return emptyState(
      '还没有收藏',
      '点击右上角「新建书签」添加，<br>或使用浏览器自带的收藏功能（Ctrl+D）。'
    );
  }
  return `<div class="result-head"><span>全部收藏</span><span>${state.bookmarks.length} 条</span></div>
    <div class="card-grid">${sortBookmarks(state.bookmarks).map(bookmarkCardHtml).join('')}</div>`;
}

function recentHtml() {
  const recent = [...state.bookmarks]
    .sort((a, b) => b.dateAdded - a.dateAdded)
    .slice(0, RECENT_LIMIT);
  if (!recent.length) {
    return emptyState('还没有收藏', '收藏几个常用页面后，这里会显示最近 30 条。');
  }
  return `<div class="result-head"><span>最近添加</span><span>${recent.length} 条</span></div>
    <div class="card-grid">${recent.map(bookmarkCardHtml).join('')}</div>`;
}

function folderHtml(folderId) {
  const folder = state.folderById.get(folderId);
  const kids = BM.childFolders(state.folders, folderId);
  const items = sortBookmarks(BM.childBookmarks(state.bookmarks, folderId));
  const parts = [
    `<div class="result-head"><span>${BM.escapeHtml(folder ? folder.title : '文件夹')}</span><span>${folder ? folder.count : 0} 条收藏</span></div>`,
  ];
  if (kids.length) {
    parts.push(`<div class="card-grid folders-grid">${kids.map(folderCardHtml).join('')}</div>`);
  }
  if (items.length) {
    parts.push(`<div class="card-grid">${items.map(bookmarkCardHtml).join('')}</div>`);
  }
  if (!kids.length && !items.length) {
    parts.push(emptyState('这个文件夹是空的', '可以在此新建书签，或在浏览器里把页面收藏到此文件夹。'));
  }
  return parts.join('');
}

function searchHtml(query) {
  const results = sortBookmarks(
    state.bookmarks.filter((bookmark) => BM.matches(query, bookmark.title, bookmark.url))
  );
  if (!results.length) {
    return emptyState('没有匹配的收藏', '换个关键词试试，例如「设计」「docs」或站点域名。');
  }
  return `<div class="result-head"><span>搜索结果</span><span>${results.length} 条</span></div>
    <div class="card-grid">${results.map(bookmarkCardHtml).join('')}</div>`;
}

function bookmarkCardHtml(bookmark) {
  const clicks = state.clicks[bookmark.id] || 0;
  return `<article class="card bookmark" data-id="${bookmark.id}" title="${BM.escapeHtml(bookmark.title)}">
    <div class="card-head">
      ${BM.faviconHtml(bookmark.url, bookmark.title, 32)}
      <div class="card-main">
        <div class="card-title">${BM.highlight(bookmark.title, state.query)}</div>
        <div class="card-url">${BM.escapeHtml(BM.hostname(bookmark.url) || bookmark.url)}</div>
      </div>
    </div>
    <div class="card-meta">
      <span class="card-path">${BM.escapeHtml(pathText(bookmark))}</span>
      <span class="card-stat">${clicks ? `打开 ${clicks} 次` : BM.timeAgo(bookmark.dateAdded)}</span>
    </div>
    <div class="card-actions">
      <button data-act="open" title="打开">${ICONS.open}</button>
      <button data-act="copy" title="复制链接">${ICONS.copy}</button>
      <button data-act="edit" title="编辑">${ICONS.edit}</button>
      <button data-act="del" class="danger" title="删除">${ICONS.trash}</button>
    </div>
  </article>`;
}

function folderCardHtml(folder) {
  const kids = BM.childFolders(state.folders, folder.id).length;
  return `<article class="card folder" data-folder="${folder.id}">
    <span class="folder-badge">${ICONS.folder}</span>
    <div class="folder-body">
      <div class="folder-name">${BM.escapeHtml(folder.title)}</div>
      <div class="folder-sub">${folder.count} 条收藏${kids ? ` · ${kids} 个子文件夹` : ''}</div>
    </div>
    <span class="folder-go">${ICONS.chevron}</span>
  </article>`;
}

function duplicateGroups() {
  const map = new Map();
  for (const bookmark of state.bookmarks) {
    const key = BM.normalizeUrl(bookmark.url);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(bookmark);
  }
  return [...map.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([key, items]) => ({ key, items: items.sort((a, b) => a.dateAdded - b.dateAdded) }))
    .sort((a, b) => b.items.length - a.items.length);
}

function dupesHtml() {
  const groups = duplicateGroups();
  if (!groups.length) {
    return emptyState('没有发现重复书签', '同一个网址被多次收藏时会出现在这里，可一键保留最早的一条。');
  }
  const rows = groups
    .map((group) => {
      const items = group.items
        .map(
          (bookmark, index) => `<li class="group-item" data-id="${bookmark.id}">
            ${BM.faviconHtml(bookmark.url, bookmark.title, 24)}
            <span class="group-name" title="${BM.escapeHtml(bookmark.title)}">${BM.escapeHtml(bookmark.title)}${index === 0 ? '<span class="keep-tag">保留</span>' : ''}</span>
            <span class="group-path">${BM.escapeHtml(pathText(bookmark))}</span>
            <span class="group-time">${BM.timeAgo(bookmark.dateAdded)}</span>
            <button class="mini danger" data-act="del" title="删除此条">${ICONS.trash}</button>
          </li>`
        )
        .join('');
      return `<section class="group">
        <header class="group-head">
          <div class="group-title">${BM.escapeHtml(BM.hostname(group.items[0].url) || group.key)}
            <span class="badge">${group.items.length} 条重复</span>
          </div>
          <button class="btn small danger" data-clean="${BM.escapeHtml(group.key)}">保留最早，删除其余</button>
        </header>
        <ul class="group-list">${items}</ul>
      </section>`;
    })
    .join('');

  return `<div class="result-head"><span>重复项</span><span>${groups.length} 组</span></div>
    <div class="dupes-toolbar">
      <span>重复判断已忽略 www、结尾斜杠与 utm 等跟踪参数。</span>
      <button class="btn danger" id="clean-all">全部清理</button>
    </div>
    ${rows}`;
}

function emptyFolders() {
  return state.folders.filter((folder) => {
    if (folder.count !== 0 || BM.UNMODIFIABLE.has(folder.id)) return false;
    const parent = state.folderById.get(folder.parentId);
    if (!parent) return true;
    if (BM.UNMODIFIABLE.has(parent.id)) return true;
    return parent.count > 0;
  });
}

function emptyFoldersHtml() {
  const folders = emptyFolders();
  if (!folders.length) {
    return emptyState('没有空文件夹', '收藏夹很干净，继续保持。');
  }
  const rows = folders
    .map(
      (folder) => `<li class="empty-folder">
        <span class="folder-badge small">${ICONS.folder}</span>
        <div class="empty-info">
          <div class="empty-name">${BM.escapeHtml(folder.title)}</div>
          <div class="empty-path">${BM.escapeHtml(folder.path.length ? folder.path.join(' / ') : '根目录')}</div>
        </div>
        <button class="btn small danger" data-del-folder="${folder.id}">删除</button>
      </li>`
    )
    .join('');
  return `<div class="result-head"><span>空文件夹</span><span>${folders.length} 个</span></div>
    <div class="dupes-toolbar">
      <span>删除空文件夹不会影响任何收藏。</span>
      <button class="btn danger" id="clean-empty">全部删除</button>
    </div>
    <ul class="empty-list">${rows}</ul>`;
}

function emptyState(title, hint) {
  return `<div class="empty-state"><strong>${title}</strong><span class="hint">${hint}</span></div>`;
}

function pathText(bookmark) {
  return bookmark.path.length ? bookmark.path.join(' / ') : '根目录';
}

function sortBookmarks(list) {
  const items = [...list];
  switch (state.sort) {
    case 'name':
      return items.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
    case 'date':
      return items.sort((a, b) => b.dateAdded - a.dateAdded);
    case 'clicks':
      return items.sort((a, b) => (state.clicks[b.id] || 0) - (state.clicks[a.id] || 0));
    default:
      return items;
  }
}

/* ---------- 交互 ---------- */

function onContentClick(event) {
  const cleanAll = event.target.closest('#clean-all');
  if (cleanAll) {
    cleanAllDuplicates();
    return;
  }
  const cleanEmpty = event.target.closest('#clean-empty');
  if (cleanEmpty) {
    cleanEmptyFolders();
    return;
  }
  const cleanButton = event.target.closest('[data-clean]');
  if (cleanButton) {
    cleanGroup(cleanButton.dataset.clean);
    return;
  }
  const deleteFolder = event.target.closest('[data-del-folder]');
  if (deleteFolder) {
    deleteEmptyFolder(deleteFolder.dataset.delFolder);
    return;
  }
  const actionButton = event.target.closest('[data-act]');
  if (actionButton) {
    const holder = actionButton.closest('[data-id]');
    if (!holder) return;
    const id = holder.dataset.id;
    const action = actionButton.dataset.act;
    if (action === 'open') openBookmark(id);
    if (action === 'copy') copyBookmark(id);
    if (action === 'edit') openDialog('edit', state.byId.get(id));
    if (action === 'del') removeBookmark(id);
    return;
  }
  const folderCard = event.target.closest('[data-folder]');
  if (folderCard) {
    navigateFolder(folderCard.dataset.folder);
    return;
  }
  const card = event.target.closest('.card.bookmark[data-id]');
  if (card) openBookmark(card.dataset.id);
}

function navigateFolder(folderId) {
  const folder = state.folderById.get(folderId);
  if (!folder) return;
  BM.ancestors(folder, state.folderById).forEach((item) => state.expanded.add(item.id));
  state.mode = 'folder';
  state.folderId = folderId;
  clearSearch(false);
  renderAll();
  els.content.scrollTop = 0;
}

function clearSearch(render = false) {
  state.query = '';
  els.search.value = '';
  if (render) renderContent();
}

async function openBookmark(id) {
  const bookmark = state.byId.get(id);
  if (!bookmark) return;
  state.clicks[id] = (state.clicks[id] || 0) + 1;
  await BM.bumpClick(id);
  await chrome.tabs.create({ url: bookmark.url });
  renderContent();
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

async function cleanGroup(key) {
  const group = duplicateGroups().find((item) => item.key === key);
  if (!group) return;
  const [keep, ...rest] = group.items;
  if (!confirm(`保留「${keep.title}」，删除其余 ${rest.length} 条重复书签？`)) return;
  for (const bookmark of rest) {
    try {
      await chrome.bookmarks.remove(bookmark.id);
    } catch {
      /* 已不存在时忽略 */
    }
  }
  BM.toast(`已清理 ${rest.length} 条重复书签`);
  await reload();
}

async function cleanAllDuplicates() {
  const groups = duplicateGroups();
  if (!groups.length) return;
  const total = groups.reduce((sum, group) => sum + group.items.length - 1, 0);
  if (!confirm(`将保留每组最早的一条，共删除 ${total} 条重复书签，确定继续？`)) return;
  for (const group of groups) {
    for (const bookmark of group.items.slice(1)) {
      try {
        await chrome.bookmarks.remove(bookmark.id);
      } catch {
        /* 已不存在时忽略 */
      }
    }
  }
  BM.toast(`已清理 ${total} 条重复书签`);
  await reload();
}

async function deleteEmptyFolder(id) {
  const folder = state.folderById.get(id);
  if (!folder) return;
  if (!(await folderIsEmpty(id))) {
    BM.toast('该文件夹已不再是空的');
    await reload();
    return;
  }
  if (!confirm(`删除空文件夹「${folder.title}」？其子文件夹也会一并删除。`)) return;
  try {
    await chrome.bookmarks.removeTree(id);
    BM.toast('已删除空文件夹');
  } catch (error) {
    BM.toast('删除失败：' + error.message);
  }
  await reload();
}

async function cleanEmptyFolders() {
  const folders = emptyFolders();
  if (!folders.length) return;

  const deletable = [];
  for (const folder of folders) {
    if (await folderIsEmpty(folder.id)) deletable.push(folder);
  }
  if (!deletable.length) {
    BM.toast('没有可删除的空文件夹');
    await reload();
    return;
  }
  if (!confirm(`确定删除 ${deletable.length} 个空文件夹？`)) return;

  let deleted = 0;
  for (const folder of deletable) {
    try {
      await chrome.bookmarks.removeTree(folder.id);
      deleted += 1;
    } catch {
      /* 已不存在时忽略 */
    }
  }
  BM.toast(`已删除 ${deleted} 个空文件夹`);
  await reload();
}

async function folderIsEmpty(id) {
  try {
    const [node] = await chrome.bookmarks.getSubTree(id);
    const hasBookmark = (item) =>
      (item.children || []).some((child) => child.url || hasBookmark(child));
    return !hasBookmark(node);
  } catch {
    return false;
  }
}

/* ---------- 新建 / 编辑 ---------- */

function openDialog(mode, bookmark) {
  state.dialogMode = mode;
  state.editingId = bookmark ? bookmark.id : null;
  els.dialogTitle.textContent = mode === 'new' ? '新建书签' : '编辑书签';
  els.fTitle.value = bookmark ? bookmark.title : '';
  els.fUrl.value = bookmark ? bookmark.url : '';

  const fallback =
    (state.mode === 'folder' && state.folderId) ||
    state.settings.defaultFolderId ||
    BM.BAR_ID;
  fillFolderOptions(els.fFolder, bookmark ? bookmark.parentId : fallback);
  els.dialog.showModal();
  if (mode === 'new') els.fUrl.focus();
  else els.fTitle.focus();
}

function fillFolderOptions(select, selectedId) {
  const options = [];
  const walk = (parentId, depth) => {
    for (const folder of BM.childFolders(state.folders, parentId)) {
      options.push(
        `<option value="${folder.id}">${'　'.repeat(depth)}${BM.escapeHtml(folder.title)}（${folder.count}）</option>`
      );
      walk(folder.id, depth + 1);
    }
  };
  walk('0', 0);
  select.innerHTML = options.join('');
  if (selectedId && [...select.options].some((option) => option.value === selectedId)) {
    select.value = selectedId;
  }
}

async function saveDialog(event) {
  event.preventDefault();
  let url = els.fUrl.value.trim();
  const title = els.fTitle.value.trim();
  const parentId = els.fFolder.value;
  if (!url) {
    BM.toast('请填写网址');
    els.fUrl.focus();
    return;
  }
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = 'https://' + url;
  if (!BM.isStorable(url)) {
    BM.toast('该网址格式不支持收藏');
    els.fUrl.focus();
    return;
  }

  try {
    if (state.dialogMode === 'new') {
      await chrome.bookmarks.create({ parentId, title: title || url, url });
      state.mode = 'folder';
      state.folderId = parentId;
      clearSearch();
      BM.toast('已新建书签');
    } else {
      await chrome.bookmarks.update(state.editingId, { title: title || url, url });
      const bookmark = state.byId.get(state.editingId);
      if (bookmark && bookmark.parentId !== parentId) {
        await chrome.bookmarks.move(state.editingId, { parentId });
      }
      BM.toast('已保存修改');
    }
    els.dialog.close();
    await reload();
  } catch (error) {
    BM.toast('保存失败：' + error.message);
  }
}

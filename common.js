/* 轻收藏 · 公共工具（popup / manager 共用） */
const BM = (() => {
  const BAR_ID = '1';
  const UNMODIFIABLE = new Set(['0', '1', '2', '3']);

  const escapeHtml = (value) =>
    String(value == null ? '' : value).replace(
      /[&<>"']/g,
      (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])
    );

  function toUrl(value) {
    try {
      return new URL(value);
    } catch {
      return null;
    }
  }

  function hostname(url) {
    const parsed = toUrl(url);
    return parsed ? parsed.hostname.replace(/^www\./, '') : '';
  }

  function isStorable(url) {
    const parsed = toUrl(url);
    return !!parsed && ['http:', 'https:', 'ftp:', 'file:'].includes(parsed.protocol);
  }

  function favicon(url, size = 32) {
    if (!url) return '';
    return chrome.runtime.getURL(
      `/_favicon/?pageUrl=${encodeURIComponent(url)}&size=${size}`
    );
  }

  function hueOf(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 360;
    return hash;
  }

  function faviconHtml(url, title, size = 28) {
    const label = (title || hostname(url) || '?').trim().charAt(0).toUpperCase() || '?';
    return (
      `<span class="fav-wrap" style="--size:${size}px;--hue:${hueOf(hostname(url) || title || '')}">` +
      `<span class="fav-fb">${escapeHtml(label)}</span>` +
      `<img class="fav" src="${escapeHtml(favicon(url, 32))}" alt="" loading="lazy" referrerpolicy="no-referrer">` +
      `</span>`
    );
  }

  document.addEventListener(
    'error',
    (event) => {
      const target = event.target;
      if (target instanceof HTMLImageElement && target.classList.contains('fav')) {
        target.style.display = 'none';
      }
    },
    true
  );

  function normalizeUrl(raw) {
    const parsed = toUrl(raw);
    if (!parsed) return String(raw || '').trim().toLowerCase();
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const path = parsed.pathname.replace(/\/+$/, '');
    const params = [...parsed.searchParams]
      .filter(([key]) => !/^(utm_|fbclid$|gclid$|spm$|ref$)/i.test(key))
      .sort((a, b) => a[0].localeCompare(b[0]));
    const search = params.length ? '?' + params.map(([k, v]) => `${k}=${v}`).join('&') : '';
    return host + path + search;
  }

  function tokens(query) {
    return String(query || '')
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
  }

  function matches(query, title, url) {
    const list = tokens(query);
    if (!list.length) return true;
    const haystack = `${title || ''} ${url || ''}`.toLowerCase();
    return list.every((token) => haystack.includes(token));
  }

  function highlight(text, query) {
    const source = String(text || '');
    const list = tokens(query);
    if (!list.length) return escapeHtml(source);
    const lower = source.toLowerCase();
    let out = '';
    let cursor = 0;
    while (cursor < source.length) {
      let best = -1;
      let len = 0;
      for (const token of list) {
        const index = lower.indexOf(token, cursor);
        if (index === -1) continue;
        if (best === -1 || index < best || (index === best && token.length > len)) {
          best = index;
          len = token.length;
        }
      }
      if (best === -1) {
        out += escapeHtml(source.slice(cursor));
        break;
      }
      out += escapeHtml(source.slice(cursor, best));
      out += '<mark>' + escapeHtml(source.slice(best, best + len)) + '</mark>';
      cursor = best + len;
    }
    return out;
  }

  function timeAgo(timestamp) {
    if (!timestamp) return '';
    const diff = Date.now() - timestamp;
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diff < minute) return '刚刚';
    if (diff < hour) return Math.floor(diff / minute) + ' 分钟前';
    if (diff < day) return Math.floor(diff / hour) + ' 小时前';
    if (diff < 30 * day) return Math.floor(diff / day) + ' 天前';
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate()
    ).padStart(2, '0')}`;
  }

  function debounce(fn, wait = 200) {
    let timer = 0;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  /** 读取整棵书签树，平铺成 folders / bookmarks 两个列表 */
  async function loadData() {
    const tree = await chrome.bookmarks.getTree();
    const root = tree && tree[0];
    const folders = [];
    const bookmarks = [];

    const walk = (node, depth, path) => {
      let total = 0;
      for (const child of node.children || []) {
        if (child.url) {
          bookmarks.push({
            id: child.id,
            parentId: node.id,
            title: child.title || child.url,
            url: child.url,
            dateAdded: child.dateAdded || 0,
            index: child.index || 0,
            depth,
            path,
          });
          total += 1;
        } else {
          const folder = {
            id: child.id,
            parentId: node.id,
            title: child.title || '未命名文件夹',
            dateAdded: child.dateAdded || 0,
            index: child.index || 0,
            depth,
            path,
            count: 0,
          };
          folders.push(folder);
          folder.count = walk(child, depth + 1, path.concat(folder.title));
          total += folder.count;
        }
      }
      return total;
    };

    walk({ id: '0', children: (root && root.children) || [] }, 0, []);

    return {
      folders,
      bookmarks,
      folderById: new Map(folders.map((folder) => [folder.id, folder])),
      byId: new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark])),
    };
  }

  const childFolders = (folders, parentId) =>
    folders.filter((folder) => folder.parentId === parentId);

  const childBookmarks = (bookmarks, parentId) =>
    bookmarks.filter((bookmark) => bookmark.parentId === parentId);

  const topFolders = (folders) => childFolders(folders, '0');

  function ancestors(folder, folderById) {
    const chain = [];
    let current = folder;
    while (current) {
      chain.unshift(current);
      current = folderById.get(current.parentId);
    }
    return chain;
  }

  async function getClicks() {
    const { clicks } = await chrome.storage.local.get('clicks');
    return clicks || {};
  }

  async function bumpClick(id) {
    const clicks = await getClicks();
    clicks[id] = (clicks[id] || 0) + 1;
    await chrome.storage.local.set({ clicks });
  }

  async function getSettings() {
    const { settings } = await chrome.storage.sync.get('settings');
    return Object.assign({ defaultFolderId: BAR_ID }, settings || {});
  }

  async function saveSettings(patch) {
    const current = await getSettings();
    const next = Object.assign(current, patch);
    await chrome.storage.sync.set({ settings: next });
    return next;
  }

  function toast(message, actionLabel, onAction, duration = 4200) {
    let el = document.querySelector('.bm-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'bm-toast';
      document.body.appendChild(el);
    }
    el.innerHTML = '';

    const msg = document.createElement('span');
    msg.className = 'bm-toast-msg';
    msg.textContent = message;
    el.appendChild(msg);

    if (actionLabel && onAction) {
      const action = document.createElement('button');
      action.className = 'bm-toast-action';
      action.textContent = actionLabel;
      action.addEventListener('click', async () => {
        el.classList.remove('show');
        await onAction();
      });
      el.appendChild(action);
    }

    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => el.classList.remove('show'), duration);
  }

  return {
    BAR_ID,
    UNMODIFIABLE,
    escapeHtml,
    hostname,
    isStorable,
    favicon,
    faviconHtml,
    normalizeUrl,
    matches,
    highlight,
    timeAgo,
    debounce,
    loadData,
    childFolders,
    childBookmarks,
    topFolders,
    ancestors,
    getClicks,
    bumpClick,
    getSettings,
    saveSettings,
    toast,
  };
})();

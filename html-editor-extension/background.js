// 每个 tab 的编辑模式开关状态
const tabState = new Map();

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  const url = tab.url || '';
  if (!/^(https?|file):/.test(url)) {
    await flashBadge(tab.id, '!');
    return;
  }
  try {
    // 确保 content.js 已注入；已注入时会报错但可忽略
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
    } catch (_) {}

    const current = !!tabState.get(tab.id);
    const next = !current;
    tabState.set(tab.id, next);

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (enabled) => { if (typeof window.__ezSet === 'function') window.__ezSet(enabled); },
      args: [next]
    });

    await setStatusBadge(tab.id, next);
  } catch (e) {
    await flashBadge(tab.id, '!');
  }
});

// 页面刷新后清掉状态，避免显示和实际不一致
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading') {
    tabState.delete(tabId);
    chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
  }
});

// content.js 启动时主动同步当前状态（处理刷新后 content 重载、但背景页保留旧态的情况）
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  if (msg.type === 'ez-export' && typeof msg.html === 'string') {
    const url = 'data:text/html;charset=utf-8,' + encodeURIComponent(msg.html);
    chrome.downloads.download(
      { url, filename: msg.filename || 'page-已修改.html', saveAs: false },
      (downloadId) => {
        if (chrome.runtime.lastError || downloadId === undefined) {
          sendResponse({ ok: false, error: chrome.runtime.lastError ? chrome.runtime.lastError.message : 'download failed' });
        } else {
          sendResponse({ ok: true, downloadId });
        }
      }
    );
    return true;
  }

  // 文件夹模式导出：一次下载多个文件到同一子目录（HTML + assets 资源），串行避免浏览器下载秩序混乱
  if (msg.type === 'ez-export-batch' && Array.isArray(msg.files)) {
    (async () => {
      let ok = 0, fail = 0;
      for (const f of msg.files) {
        if (!f || typeof f.url !== 'string' || typeof f.filename !== 'string') { fail++; continue; }
        const good = await new Promise((resolve) => {
          try {
            chrome.downloads.download(
              // filename 支持相对路径含子目录，浏览器会自动创建；同名时自动改名不覆盖
              { url: f.url, filename: f.filename, saveAs: false, conflictAction: 'uniquify' },
              (id) => resolve(!(chrome.runtime.lastError || id === undefined))
            );
          } catch (_) { resolve(false); }
        });
        good ? ok++ : fail++;
      }
      sendResponse({ ok, fail });
    })();
    return true;
  }

  if (msg.type === 'ez-query') {
    const tabId = sender.tab && sender.tab.id;
    sendResponse({ enabled: !!tabState.get(tabId) });
    return true;
  }

  if (msg.type === 'ez-sync' && typeof msg.enabled === 'boolean') {
    const tabId = sender.tab && sender.tab.id;
    if (tabId) {
      tabState.set(tabId, msg.enabled);
      setStatusBadge(tabId, msg.enabled).catch(() => {});
    }
    sendResponse({ ok: true });
    return true;
  }
});

async function setStatusBadge(tabId, enabled) {
  if (enabled) {
    await chrome.action.setBadgeText({ tabId, text: '●' });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#22c55e' }); // 绿色圆点
  } else {
    await chrome.action.setBadgeText({ tabId, text: '' });
  }
}

async function flashBadge(tabId, text) {
  try {
    await chrome.action.setBadgeText({ tabId, text });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#dc2626' });
  } catch (_) {}
}

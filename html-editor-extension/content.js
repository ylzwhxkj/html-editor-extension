(() => {
  if (window.__ezLoaded) return;
  window.__ezLoaded = true;

  const TOOLBAR_ID = 'ez-editor-toolbar';
  const HOVER_ID = 'ez-hover-bar';
  const STYLE_ID = 'ez-editor-style';
  const FILE_ID = 'ez-file-input';
  const IMGBOX_ID = 'ez-img-box';
  const PANEL_ID = 'ez-panel';
  const PLUGIN_SELECTOR = '#' + TOOLBAR_ID + ',#' + HOVER_ID + ',#' + STYLE_ID + ',#' + FILE_ID + ',#' + IMGBOX_ID + ',#' + PANEL_ID + ',#ez-print-style,.ez-toast,.ez-draft-box,.ez-imgbar,.ez-crop-quality,.ez-blkbar';
  // 常见浏览器扩展注入节点的指纹（Dark Reader 暗色样式 / 沉浸式翻译双语节点 / Grammarly 等），
  // 导出时一律剔除，否则会被打包进导出文件，脱离原扩展后变成死样式/重复文本，页面全乱
  const FOREIGN_SELECTOR = [
    '[class*="darkreader"]', '[id*="darkreader"]', '[data-darkreader]',
    '[class*="immersive-translate"]', '[id*="immersive-translate"]', '[data-immersive-translate]',
    'grammarly-desktop-integration', '[class*="grammarly"]', '[id*="grammarly"]'
  ].join(',');
  const DRAFT_PREFIX = 'ezDraft::';
  const FONT = 'system-ui, "Microsoft YaHei", "PingFang SC", sans-serif';
  // 全局换字体可选字体（只写字体名、不嵌入文件，均无版权问题）
  const FONT_OPTIONS = [
    { label: '微软雅黑', value: '"Microsoft YaHei", "微软雅黑"' },
    { label: '黑体', value: '"SimHei", "黑体"' },
    { label: '宋体', value: '"SimSun", "宋体"' },
    { label: '楷体', value: '"KaiTi", "楷体"' },
    { label: '苹方（Mac）', value: '"PingFang SC", "苹方-简"' },
    { label: '思源黑体（开源可商用）', value: '"Noto Sans SC", "思源黑体"' },
    { label: '思源宋体（开源可商用）', value: '"Noto Serif SC", "思源宋体"' },
    { label: '阿里巴巴普惠体（开源可商用）', value: '"Alibaba PuHuiTi", "阿里巴巴普惠体"' },
    { label: 'Arial（西文）', value: 'Arial, Helvetica' },
    { label: 'Georgia（西文）', value: 'Georgia, "Times New Roman"' },
    { label: 'Courier New（等宽）', value: '"Courier New", monospace' }
  ];
  const VERSION = '1.6.3'; // 与 manifest.json 保持一致，开启时提示，便于确认新版已生效

  let enabled = false;
  let dirty = false;
  let autosaveOK = true;
  let saveTimer = null;
  let toolbar = null;
  let hoverBar = null;
  let hoverReplaceBtn = null;
  let styleEl = null;
  let fileInput = null;
  let toastTimer = null;
  let lastEditable = null;
  let hoverHost = null;
  let imgTarget = null;
  let bgTarget = null;
  let pendingFileAction = null;
  let hideTimer = null;
  let switchTimer = null;
  let pendingHover = null;
  let hoverAdjustBtn = null;
  let hoverMoveBtn = null;
  let imgEdit = null; // { img, mode: 'adjust'|'crop', crop: {left,top,width,height}|null, drop: 落点|null }
  let imgBar = null;
  let blkEdit = null; // { el } 模块移动模式
  let blkBar = null;
  let panel = null; // 功能面板（页面管理 / 全局字体）
  let baselineTop = null; // 开启编辑时 html/head/body 的直接子节点基线（WeakSet），用于导出时识别外部中途注入的节点
  const undoStack = [];

  function toast(msg) {
    let t = document.querySelector('.ez-toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'ez-toast';
      Object.assign(t.style, {
        position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)',
        zIndex: '2147483647', background: 'rgba(17,24,39,.92)', color: '#fff',
        padding: '9px 18px', borderRadius: '10px',
        font: '14px/1.4 ' + FONT, boxShadow: '0 4px 16px rgba(0,0,0,.3)',
        pointerEvents: 'none', transition: 'opacity .4s'
      });
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.style.opacity = '0'; }, 2200);
  }

  function markDirty() {
    dirty = true;
    if (enabled) scheduleSave();
  }

  // ---------- 功能面板基础 ----------

  // 打开一个居中浮层面板，title 为标题，content 为内容节点；返回面板容器
  function openPanel(title, content) {
    closePanel();
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    Object.assign(panel.style, {
      position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
      zIndex: '2147483646', minWidth: '300px', maxWidth: '520px', maxHeight: '70vh', overflow: 'auto',
      background: 'rgba(17,24,39,.98)', color: '#e5e7eb', borderRadius: '14px',
      boxShadow: '0 18px 50px rgba(0,0,0,.5)', font: '13px/1.5 ' + FONT, padding: '14px'
    });
    const head = document.createElement('div');
    Object.assign(head.style, {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      fontWeight: '700', fontSize: '14px', marginBottom: '10px'
    });
    const t = document.createElement('span');
    t.textContent = title;
    const close = document.createElement('button');
    close.textContent = '✕';
    close.title = '关闭面板（Esc）';
    Object.assign(close.style, {
      border: 'none', background: 'transparent', color: '#9ca3af', cursor: 'pointer',
      fontSize: '14px', padding: '4px 8px', borderRadius: '6px'
    });
    close.addEventListener('mouseenter', () => (close.style.color = '#fff'));
    close.addEventListener('mouseleave', () => (close.style.color = '#9ca3af'));
    close.addEventListener('click', closePanel);
    head.appendChild(t);
    head.appendChild(close);
    panel.appendChild(head);
    panel.appendChild(content);
    document.body.appendChild(panel);
    return panel;
  }

  function closePanel() {
    if (panel && panel.isConnected) panel.remove();
    panel = null;
  }

  // 按 Esc 关闭面板
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePanel();
  });

  // ---------- 编辑区域标记 ----------

  function makeEditable() {
    const els = document.body.querySelectorAll('*');
    for (const el of els) {
      if (['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TITLE', 'INPUT'].includes(el.tagName)) continue;
      if (el.closest(PLUGIN_SELECTOR)) continue;
      const hasText = Array.from(el.childNodes).some(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim()
      );
      if (hasText) el.setAttribute('contenteditable', 'true');
    }
  }

  function blockOf(start) {
    let el = start;
    while (el && el !== document.body && el.parentElement) {
      const display = getComputedStyle(el).display;
      if (/block|list-item|table-cell|flex|grid|flow-root/.test(display)) return el === document.body ? null : el;
      el = el.parentElement;
    }
    return null;
  }

  function targets() {
    let leaf = null;
    const sel = window.getSelection();
    if (sel && sel.rangeCount && sel.anchorNode) {
      const n = sel.anchorNode.nodeType === Node.TEXT_NODE ? sel.anchorNode.parentElement : sel.anchorNode;
      if (n && n.closest) leaf = n.closest('[contenteditable="true"]');
    }
    if (!leaf && lastEditable && lastEditable.isConnected) leaf = lastEditable;
    if (!leaf) return null;
    return { leaf, block: blockOf(leaf) || leaf };
  }

  // ---------- 撤销 ----------

  function pushUndo(undoFn) {
    undoStack.push(undoFn);
    if (undoStack.length > 200) undoStack.shift();
    markDirty();
  }

  function setStyle(el, prop, value) {
    if (!el) return;
    const prev = el.style.getPropertyValue(prop);
    pushUndo(() => {
      if (!el.isConnected) return;
      if (prev === '') el.style.removeProperty(prop);
      else el.style.setProperty(prop, prev);
    });
    el.style.setProperty(prop, value);
  }

  function undo() {
    const fn = undoStack.pop();
    if (fn) fn();
    else document.execCommand('undo');
    if (imgEdit) { syncImgBox(); updateImgBar(); } // 撤销可能改变图片尺寸/位置，同步框
  }

  // ---------- 文字样式 ----------

  function changeSize(dir) {
    const t = targets();
    if (!t) return toast('请先把光标点在要调整的文字里');
    const cur = parseFloat(getComputedStyle(t.leaf).fontSize) || 16;
    const step = Math.max(2, Math.round(cur * 0.12));
    const next = Math.min(150, Math.max(9, cur + dir * step));
    setStyle(t.leaf, 'font-size', next + 'px');
    if (t.block && t.block !== t.leaf) setStyle(t.block, 'font-size', next + 'px');
  }

  function toggleBold() {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.rangeCount) {
      document.execCommand('styleWithCSS', false, true);
      document.execCommand('bold');
      markDirty();
      return;
    }
    const t = targets();
    if (!t) return toast('请先把光标点在要加粗的文字里，或选中文字');
    const v = parseInt(getComputedStyle(t.leaf).fontWeight) >= 600 ? '400' : '700';
    setStyle(t.leaf, 'font-weight', v);
    if (t.block && t.block !== t.leaf) setStyle(t.block, 'font-weight', v);
  }

  function changeColor(value) {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.rangeCount) {
      document.execCommand('styleWithCSS', false, true);
      document.execCommand('foreColor', false, value);
      markDirty();
      return;
    }
    const t = targets();
    if (!t) return toast('请先把光标点在要改颜色的文字里，或选中文字');
    setStyle(t.leaf, 'color', value);
    if (t.block && t.block !== t.leaf) setStyle(t.block, 'color', value);
  }

  function changeLineHeight(v) {
    const t = targets();
    if (!t) return toast('请先把光标点在要调整行距的段落里');
    setStyle(t.block, 'line-height', v);
    if (t.leaf !== t.block) setStyle(t.leaf, 'line-height', v);
  }

  function changeAlign(mode) {
    const t = targets();
    if (!t) return toast('请先把光标点在要调整对齐的段落里');
    setStyle(t.block, 'text-align', mode);
  }

  // ---------- 图片：更换 / 插入 ----------

  function ensureFileInput() {
    if (fileInput && fileInput.isConnected) return fileInput;
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.id = FILE_ID;
    Object.assign(fileInput.style, { position: 'fixed', left: '-9999px', top: '0', width: '1px', height: '1px', opacity: '0' });
    fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (!f) return;
      let action = pendingFileAction;
      pendingFileAction = null;
      if (action !== 'replace' && action !== 'insert' && action !== 'insertVideo') {
        action = (imgTarget || bgTarget) ? 'replace' : 'insert';
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        if (!dataUrl) return;
        if (action === 'replace') applyReplaceImage(dataUrl);
        else if (action === 'insertVideo') doInsertVideo(dataUrl);
        else doInsertImage(dataUrl);
      };
      reader.readAsDataURL(f);
    });
    document.body.appendChild(fileInput);
    return fileInput;
  }

  function pickFile(action) {
    pendingFileAction = action;
    const input = ensureFileInput();
    // 视频选择时放宽 accept，图片操作保持原样
    input.accept = action === 'insertVideo' ? 'video/*' : 'image/*';
    input.click();
  }

  function applyReplaceImage(dataUrl) {
    if (imgTarget && imgTarget.isConnected) {
      const prev = imgTarget.getAttribute('src');
      pushUndo(() => { if (imgTarget.isConnected) imgTarget.setAttribute('src', prev); });
      imgTarget.setAttribute('src', dataUrl);
      hideHoverBar();
      toast('图片已更换');
    } else if (bgTarget && bgTarget.isConnected) {
      setStyle(bgTarget, 'background-image', 'url("' + dataUrl + '")');
      hideHoverBar();
      toast('背景图已更换');
    }
  }

  function doInsertImage(dataUrl) {
    const anchor = (hoverHost && hoverHost.isConnected) ? hoverHost : (targets() || {}).block;
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = '插入的图片';
    img.style.cssText = 'max-width:100%;height:auto;display:block;margin:12px auto;border-radius:8px;';
    pushUndo(() => img.remove());
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(img, anchor.nextSibling);
    else document.body.appendChild(img);
    hideHoverBar();
    toast('图片已插入（↩ 可撤销）');
  }

  // 插入本地视频：内嵌 dataURL，导出的副本自带视频可直接播放
  function doInsertVideo(dataUrl) {
    const anchor = (hoverHost && hoverHost.isConnected) ? hoverHost : (targets() || {}).block;
    const video = document.createElement('video');
    video.src = dataUrl;
    video.controls = true;
    video.preload = 'metadata';
    video.style.cssText = 'max-width:100%;height:auto;display:block;margin:12px auto;border-radius:8px;background:#000;';
    pushUndo(() => video.remove());
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(video, anchor.nextSibling);
    else document.body.appendChild(video);
    hideHoverBar();
    // 视频内嵌后体积大，提前告知草稿限制
    if (dataUrl.length > 3 * 1024 * 1024) {
      toast('视频已插入（↩ 可撤销）。视频较大，草稿自动保存可能受限，请改完及时导出');
    } else {
      toast('视频已插入（↩ 可撤销），悬停视频点「调整」可改大小和位置');
    }
  }

  // ---------- 元素删除 / 复制 ----------

  function currentHoverTarget() {
    if (imgTarget && imgTarget.isConnected) return imgTarget;
    if (bgTarget && bgTarget.isConnected) return bgTarget;
    if (hoverHost && hoverHost.isConnected) return hoverHost;
    return null;
  }

  function deleteHost(el) {
    if (!el || !el.isConnected || el === document.body || el === document.documentElement) return;
    const childEls = el.querySelectorAll('*').length;
    const textLen = el.textContent.replace(/\s+/g, '').length;
    if (childEls > 6 || textLen > 80) {
      if (!confirm('要删除这一整块吗？（约 ' + textLen + ' 字、' + (childEls + 1) + ' 个元素）\n删错了可以点工具栏的 ↩ 撤销。')) return;
    }
    const parent = el.parentNode;
    const next = el.nextSibling;
    pushUndo(() => { if (parent) parent.insertBefore(el, next); });
    el.remove();
    hideHoverBar();
    toast('已删除（↩ 可撤销）');
  }

  function duplicateHost(el) {
    if (!el || !el.isConnected) return;
    const clone = el.cloneNode(true);
    if (clone.id) clone.id = clone.id + '-copy';
    pushUndo(() => clone.remove());
    el.parentNode.insertBefore(clone, el.nextSibling);
    hideHoverBar();
    toast('已复制一份，点击新块可继续修改');
  }

  // ---------- 图片调整模式（缩放 / 移动 / 裁剪） ----------

  function enterImgEdit(img) {
    if (imgEdit) exitImgEdit();
    const isVideo = img.tagName === 'VIDEO';
    imgEdit = { img, mode: 'adjust', crop: null, drop: null, video: isVideo };
    imgTarget = null;
    bgTarget = null;
    hoverHost = null;
    hideHoverBar();
    img.addEventListener('mousedown', imgDragStart);
    img.style.cursor = 'move';
    buildImgBox();
    syncImgBox();
    updateImgBar();
    toast(isVideo
      ? '拖视频 = 移到任意位置；拖四角 = 改大小；点「完成」后可正常播放'
      : '拖图片 = 拖到任意位置；拖四角 = 改大小；顶部「裁剪」可裁掉边缘');
  }

  function exitImgEdit() {
    if (!imgEdit) return;
    imgEdit.img.removeEventListener('mousedown', imgDragStart);
    imgEdit.img.style.cursor = '';
    imgEdit.img.style.opacity = '';
    imgEdit.img.style.boxShadow = '';
    imgEdit = null;
    const box = document.getElementById(IMGBOX_ID);
    if (box) box.remove();
    if (imgBar) { imgBar.remove(); imgBar = null; }
  }

  // 手柄框：调整模式 = 图片虚线框 + 4 角缩放手柄；裁剪模式 = 裁剪框 + 暗角 + 8 手柄
  function buildImgBox() {
    let box = document.getElementById(IMGBOX_ID);
    if (box) box.remove();
    box = document.createElement('div');
    box.id = IMGBOX_ID;
    Object.assign(box.style, {
      position: 'fixed', zIndex: '2147483645', pointerEvents: 'none',
      border: '1.5px dashed #2563eb'
    });
    const POS = {
      nw: { left: '-6px', top: '-6px', cursor: 'nwse-resize' },
      n:  { left: '50%', top: '-6px', transform: 'translateX(-50%)', cursor: 'ns-resize' },
      ne: { right: '-6px', top: '-6px', cursor: 'nesw-resize' },
      e:  { right: '-6px', top: '50%', transform: 'translateY(-50%)', cursor: 'ew-resize' },
      se: { right: '-6px', bottom: '-6px', cursor: 'nwse-resize' },
      s:  { left: '50%', bottom: '-6px', transform: 'translateX(-50%)', cursor: 'ns-resize' },
      sw: { left: '-6px', bottom: '-6px', cursor: 'nesw-resize' },
      w:  { left: '-6px', top: '50%', transform: 'translateY(-50%)', cursor: 'ew-resize' }
    };
    const crop = imgEdit.mode === 'crop';
    Object.keys(POS).forEach((cls) => {
      // 调整模式只用 4 个角做等比缩放，避免与裁剪语义混淆
      if (!crop && !/^(nw|ne|se|sw)$/.test(cls)) return;
      const h = document.createElement('div');
      Object.assign(h.style, {
        position: 'absolute', width: '11px', height: '11px', background: '#fff',
        border: '1.5px solid #2563eb', borderRadius: '50%', pointerEvents: 'auto',
        boxShadow: '0 1px 4px rgba(0,0,0,.35)'
      }, POS[cls]);
      h.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        if (imgEdit.mode === 'crop') startCropHandle(cls, e);
        else startResize(cls, e);
      });
      box.appendChild(h);
    });
    if (crop) {
      box.style.border = '1.5px solid #fff';
      box.style.boxShadow = '0 0 0 9999px rgba(0,0,0,.55)';
    }
    document.body.appendChild(box);
  }

  // 把手柄框同步到目标矩形（图片 or 裁剪框）
  function syncImgBox() {
    if (!imgEdit) return;
    const box = document.getElementById(IMGBOX_ID);
    if (!box) return;
    const r = (imgEdit.mode === 'crop' && imgEdit.crop)
      ? imgEdit.crop
      : imgEdit.img.getBoundingClientRect();
    Object.assign(box.style, {
      left: r.left + 'px', top: r.top + 'px',
      width: Math.max(0, r.width) + 'px', height: Math.max(0, r.height) + 'px'
    });
  }

  // ---------- 缩放（四角手柄，等比） ----------

  // 纯查找定位基准容器，不改动 DOM
  function positioningContextOf(el) {
    let ctx = el.parentElement;
    while (ctx && ctx !== document.body) {
      if (getComputedStyle(ctx).position !== 'static') return ctx;
      ctx = ctx.parentElement;
    }
    return null;
  }

  function startResize(cls, e) {
    const img = imgEdit.img;
    const isWest = cls.includes('w'); // 西侧角（nw/sw）：向左拖 = 放大
    const startX = e.clientX;
    // 先记录旧值（撤销用），在冻结尺寸之前
    const prevW = img.style.width;
    const prevH = img.style.height;
    const prevLeft = img.style.left;
    const prevTransition = img.style.transition;
    // 冻结：把浏览器当前实际使用的布局宽度原样写入 style.width（浮点不取整），
    // 消除盒模型/宽度约束/transform 与 getBoundingClientRect 的口径差，杜绝第一笔跳变
    const frozenW = parseFloat(getComputedStyle(img).width) || img.getBoundingClientRect().width;
    img.style.width = frozenW + 'px';
    // 拖动期间禁用过渡动画（页面常有 transition:all，会让缩放先缩一下再跟手）
    img.style.transition = 'none';
    const startW = frozenW;
    // 上限不低于当前宽度、下限不高于当前宽度
    const maxW = Math.max(window.innerWidth * 1.5, startW);
    const minW = Math.min(40, startW);
    // 西侧手柄且图片已绝对定位：保持右边缘不动，同步回写 left 百分比
    const ctx = img.style.position === 'absolute' ? positioningContextOf(img) : null;
    const ctxW = ctx ? ctx.getBoundingClientRect().width : 0;
    const startLeftPct = parseFloat(prevLeft) || 0;
    let moved = false;
    const move = (ev) => {
      const delta = isWest ? (startX - ev.clientX) : (ev.clientX - startX);
      let w = startW + delta;
      w = Math.max(minW, Math.min(maxW, w));
      const val = Math.round(w) + 'px';
      if (val === img.style.width) return;
      moved = true;
      img.style.width = val;
      img.style.height = 'auto';
      if (isWest && ctx && ctxW > 0) {
        // 右边缘锚定：left = 初始left + (初始宽 - 新宽)%，随宽度变化反向补偿
        img.style.left = (startLeftPct + (startW - w) / ctxW * 100).toFixed(2) + '%';
      }
      syncImgBox();
      updateImgBar();
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      if (!moved) {
        // 只点了没拖：还原冻结写入的宽度与过渡，不留痕迹
        if (prevW === '') img.style.removeProperty('width');
        else img.style.width = prevW;
        if (prevTransition === '') img.style.removeProperty('transition');
        else img.style.transition = prevTransition;
        return;
      }
      if (prevTransition === '') img.style.removeProperty('transition');
      else img.style.transition = prevTransition;
      pushUndo(() => {
        if (!img.isConnected) return;
        if (prevW === '') img.style.removeProperty('width');
        else img.style.setProperty('width', prevW);
        if (prevH === '') img.style.removeProperty('height');
        else img.style.setProperty('height', prevH);
        if (prevLeft === '') img.style.removeProperty('left');
        else img.style.setProperty('left', prevLeft);
        if (prevTransition === '') img.style.removeProperty('transition');
        else img.style.setProperty('transition', prevTransition);
      });
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  // ---------- 移动（自由拖到任意坐标，absolute + 百分比） ----------

  // 找到图片的绝对定位基准容器；没有就给最近的 static 父级加 position:relative
  function ensurePositioningContext(img) {
    let ctx = img.parentElement;
    while (ctx && ctx !== document.body) {
      const cs = getComputedStyle(ctx);
      if (cs.position !== 'static') return ctx;
      ctx = ctx.parentElement;
    }
    ctx = img.parentElement || document.body;
    if (getComputedStyle(ctx).position === 'static') {
      ctx.style.position = 'relative';
    }
    return ctx;
  }

  function imgDragStart(e) {
    if (!imgEdit || imgEdit.mode !== 'adjust' || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const img = imgEdit.img;
    const ctx = ensurePositioningContext(img);
    const cr = ctx.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    // 如果还没 absolute，先转成 absolute 并保留当前位置
    const prevPosition = img.style.position;
    const prevLeft = img.style.left;
    const prevTop = img.style.top;
    const prevRight = img.style.right;
    const prevBottom = img.style.bottom;
    const prevMargin = img.style.margin;

    if (prevPosition !== 'absolute') {
      img.style.position = 'absolute';
      img.style.left = ((ir.left - cr.left) / cr.width * 100).toFixed(2) + '%';
      img.style.top = ((ir.top - cr.top) / cr.height * 100).toFixed(2) + '%';
      img.style.margin = '0';
      // 宽度用布局真实值冻结（transform 页面下 getBoundingClientRect 是缩后值）
      const w = parseFloat(getComputedStyle(img).width);
      if (w > 0) img.style.width = w.toFixed(2) + 'px';
    }

    const startX = e.clientX;
    const startY = e.clientY;
    const startLeftPct = parseFloat(img.style.left) || 0;
    const startTopPct = parseFloat(img.style.top) || 0;
    const iw = ir.width;
    const ih = ir.height;

    pushUndo(() => {
      if (!img.isConnected) return;
      if (prevPosition === '') img.style.removeProperty('position');
      else img.style.setProperty('position', prevPosition);
      if (prevLeft === '') img.style.removeProperty('left');
      else img.style.setProperty('left', prevLeft);
      if (prevTop === '') img.style.removeProperty('top');
      else img.style.setProperty('top', prevTop);
      if (prevRight === '') img.style.removeProperty('right');
      else img.style.setProperty('right', prevRight);
      if (prevBottom === '') img.style.removeProperty('bottom');
      else img.style.setProperty('bottom', prevBottom);
      if (prevMargin === '') img.style.removeProperty('margin');
      else img.style.setProperty('margin', prevMargin);
    });

    const move = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const nextLeft = startLeftPct + dx / cr.width * 100;
      const nextTop = startTopPct + dy / cr.height * 100;
      img.style.left = Math.max(-50, Math.min(150, nextLeft)).toFixed(2) + '%';
      img.style.top = Math.max(-50, Math.min(150, nextTop)).toFixed(2) + '%';
      // 给图片加轻微拖拽阴影提示
      img.style.boxShadow = '0 8px 30px rgba(0,0,0,.35)';
      syncImgBox();
      updateImgBar();
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      img.style.boxShadow = '';
      toast('图片已移动到 ' + img.style.left + ' / ' + img.style.top + '（↩ 可撤销）');
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  // ---------- 裁剪（canvas 真裁切 + 质量压缩） ----------

  function enterCropMode() {
    const img = imgEdit.img;
    const r = img.getBoundingClientRect();
    // 进入裁剪时默认取图片当前显示尺寸作为裁剪基准
    imgEdit.crop = { left: r.left, top: r.top, width: r.width, height: r.height };
    imgEdit.mode = 'crop';
    imgEdit.quality = 0.85;
    buildImgBox();
    syncImgBox();
    updateImgBar();
  }

  function exitCropMode() {
    imgEdit.mode = 'adjust';
    imgEdit.crop = null;
    buildImgBox();
    syncImgBox();
    updateImgBar();
  }

  function startCropHandle(cls, e) {
    const sx = e.clientX, sy = e.clientY;
    const c0 = Object.assign({}, imgEdit.crop);
    const r = imgEdit.img.getBoundingClientRect();
    const move = (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      let left = c0.left, top = c0.top, width = c0.width, height = c0.height;
      if (cls.includes('e')) width = c0.width + dx;
      if (cls.includes('s')) height = c0.height + dy;
      if (cls.includes('w')) { left = c0.left + dx; width = c0.width - dx; }
      if (cls.includes('n')) { top = c0.top + dy; height = c0.height - dy; }
      left = Math.max(r.left, Math.min(left, r.right - 24));
      top = Math.max(r.top, Math.min(top, r.bottom - 24));
      width = Math.max(24, Math.min(width, r.right - left));
      height = Math.max(24, Math.min(height, r.bottom - top));
      imgEdit.crop = { left, top, width, height };
      syncImgBox();
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  function imageType(img) {
    if (img.src.startsWith('data:image/png')) return 'image/png';
    if (img.src.startsWith('data:image/webp')) return 'image/webp';
    return 'image/jpeg';
  }

  function applyCrop() {
    const img = imgEdit.img;
    const r = img.getBoundingClientRect();
    const c = imgEdit.crop;
    const naturalRatio = img.naturalWidth / r.width;
    const sx = Math.max(0, (c.left - r.left) * naturalRatio);
    const sy = Math.max(0, (c.top - r.top) * naturalRatio);
    const sw = Math.min(img.naturalWidth - sx, c.width * naturalRatio);
    const sh = Math.min(img.naturalHeight - sy, c.height * naturalRatio);
    if (sw < 1 || sh < 1) { exitCropMode(); return; }

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(sw);
    canvas.height = Math.round(sh);
    const ctx = canvas.getContext('2d');
    try {
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    } catch (e) {
      toast('图片裁剪失败，可能受跨域限制');
      exitCropMode();
      return;
    }

    const type = imageType(img);
    let dataUrl;
    try {
      dataUrl = canvas.toDataURL(type, type === 'image/png' ? undefined : imgEdit.quality);
    } catch (e) {
      toast('图片裁剪失败，可能受跨域限制');
      exitCropMode();
      return;
    }
    if (dataUrl.length > 8 * 1024 * 1024) {
      toast('裁剪后图片仍较大，建议用压缩品质滑块调低');
    }

    const prevSrc = img.getAttribute('src');
    const prevWidth = img.style.width;
    const prevHeight = img.style.height;
    const prevClip = img.style.clipPath;

    pushUndo(() => {
      if (!img.isConnected) return;
      img.setAttribute('src', prevSrc);
      if (prevWidth === '') img.style.removeProperty('width');
      else img.style.setProperty('width', prevWidth);
      if (prevHeight === '') img.style.removeProperty('height');
      else img.style.setProperty('height', prevHeight);
      if (prevClip === '') img.style.removeProperty('clip-path');
      else img.style.setProperty('clip-path', prevClip);
    });

    img.setAttribute('src', dataUrl);
    img.style.width = Math.round(c.width) + 'px';
    img.style.height = 'auto';
    img.style.removeProperty('clip-path');

    exitCropMode();
    toast('已裁剪为真实新图（↩ 可撤销）');
  }

  // ---------- 图片编辑顶部按钮条 ----------

  function updateImgBar() {
    if (!imgEdit) return;
    if (!imgBar || !imgBar.isConnected) {
      imgBar = document.createElement('div');
      imgBar.className = 'ez-imgbar';
      Object.assign(imgBar.style, {
        position: 'fixed', zIndex: '2147483647', display: 'flex', gap: '2px',
        background: 'rgba(17,24,39,.95)', padding: '4px 5px', borderRadius: '9px',
        boxShadow: '0 4px 14px rgba(0,0,0,.35)', font: '12px/1 ' + FONT,
        userSelect: 'none', whiteSpace: 'nowrap'
      });
      const mk = (label, title, fn) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.title = title;
        Object.assign(b.style, {
          border: 'none', background: 'transparent', color: '#e5e7eb',
          padding: '5px 9px', borderRadius: '6px', cursor: 'pointer',
          font: '600 12px/1 ' + FONT
        });
        b.addEventListener('mouseenter', () => (b.style.background = 'rgba(255,255,255,.15)'));
        b.addEventListener('mouseleave', () => (b.style.background = 'transparent'));
        b.addEventListener('mousedown', (e) => e.preventDefault());
        b.addEventListener('click', fn);
        imgBar.appendChild(b);
        return b;
      };
      const cropBtn = mk('裁剪', '框选要保留的区域，其余裁掉', enterCropMode);
      cropBtn.dataset.mode = 'adjust';
      cropBtn.dataset.crop = '1'; // 视频不支持裁剪，显示时按 video 标记隐藏
      mk('完成', '结束图片调整', () => exitImgEdit()).dataset.mode = 'adjust';
      mk('✓ 确认裁剪', '应用裁剪（↩ 可撤销）', applyCrop).dataset.mode = 'crop';
      mk('取消', '放弃本次裁剪', () => exitCropMode()).dataset.mode = 'crop';
      // 裁剪模式下的质量选择滑块
      const wrap = document.createElement('div');
      wrap.className = 'ez-crop-quality';
      wrap.dataset.mode = 'crop';
      Object.assign(wrap.style, {
        display: 'flex', alignItems: 'center', gap: '6px', padding: '0 4px'
      });
      const qlbl = document.createElement('span');
      qlbl.textContent = '质量';
      qlbl.style.fontSize = '11px';
      qlbl.style.color = '#9ca3af';
      wrap.appendChild(qlbl);
      const qrange = document.createElement('input');
      qrange.type = 'range';
      qrange.min = '30';
      qrange.max = '100';
      qrange.value = '85';
      qrange.title = '压缩质量：越低文件越小';
      Object.assign(qrange.style, {
        width: '72px', accentColor: '#2563eb', cursor: 'pointer', margin: '0'
      });
      qrange.addEventListener('input', () => {
        if (imgEdit) imgEdit.quality = +qrange.value / 100;
        qval.textContent = qrange.value + '%';
      });
      wrap.appendChild(qrange);
      const qval = document.createElement('span');
      qval.textContent = '85%';
      qval.style.fontSize = '11px';
      qval.style.color = '#e5e7eb';
      qval.style.minWidth = '28px';
      wrap.appendChild(qval);
      imgBar.appendChild(wrap);
      document.body.appendChild(imgBar);
    }
    const crop = imgEdit.mode === 'crop';
    for (const b of imgBar.children) {
      const modeOk = b.dataset.mode === (crop ? 'crop' : 'adjust');
      // 视频调整模式：隐藏裁剪入口
      const cropHidden = !crop && b.dataset.crop === '1' && imgEdit.video;
      b.style.display = (modeOk && !cropHidden) ? '' : 'none';
    }
    // 定位到框上方，贴顶则放下方
    const box = document.getElementById(IMGBOX_ID);
    if (box) {
      const br = box.getBoundingClientRect();
      const w = imgBar.offsetWidth, h = imgBar.offsetHeight;
      let top = br.top - h - 8;
      if (top < 8) top = br.bottom + 8;
      const left = Math.max(8, Math.min(br.left, window.innerWidth - w - 8));
      Object.assign(imgBar.style, { left: left + 'px', top: top + 'px' });
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (imgEdit) {
      e.preventDefault();
      e.stopPropagation();
      if (imgEdit.mode === 'crop') exitCropMode();
      else exitImgEdit();
    } else if (blkEdit) {
      e.preventDefault();
      e.stopPropagation();
      exitBlkEdit();
    }
  }, true);

  // ---------- 模块移动模式（任意内容块拖到任意位置） ----------

  function restoreStyles(el, p) {
    ['position', 'left', 'top', 'right', 'bottom', 'margin', 'transition', 'width'].forEach((k) => {
      if (p[k] === '' || p[k] === undefined) el.style.removeProperty(k);
      else el.style.setProperty(k, p[k]);
    });
  }

  function enterBlkEdit(el) {
    if (blkEdit) exitBlkEdit();
    if (imgEdit) exitImgEdit();
    blkEdit = {
      el,
      prevOutline: el.style.outline,
      prevOutlineOffset: el.style.outlineOffset
    };
    imgTarget = null;
    bgTarget = null;
    hoverHost = null;
    hideHoverBar();
    el.style.outline = '2px dashed #16a34a';
    el.style.outlineOffset = '2px';
    el.style.cursor = 'move';
    el.addEventListener('mousedown', blkDragStart);
    buildBlkBar();
    toast('按住模块拖到任意位置；完成后点「✓ 完成」或按 Esc');
  }

  function exitBlkEdit() {
    if (!blkEdit) return;
    const el = blkEdit.el;
    el.removeEventListener('mousedown', blkDragStart);
    if (blkEdit.prevOutline === '') el.style.removeProperty('outline');
    else el.style.outline = blkEdit.prevOutline;
    if (blkEdit.prevOutlineOffset === '') el.style.removeProperty('outline-offset');
    else el.style.outlineOffset = blkEdit.prevOutlineOffset;
    el.style.cursor = '';
    el.style.boxShadow = '';
    blkEdit = null;
    if (blkBar) { blkBar.remove(); blkBar = null; }
  }

  function blkDragStart(e) {
    if (!blkEdit || e.button !== 0) return;
    // 允许从块内任意位置（含子元素文字）发起拖动，阻止进入文字编辑
    e.preventDefault();
    e.stopPropagation();
    const el = blkEdit.el;
    const sx = e.clientX, sy = e.clientY;
    let started = false;
    let prev = null;
    let crW = 1, crH = 1, originX = 0, originY = 0, startLeftPct = 0, startTopPct = 0;

    const move = (ev) => {
      if (!started) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
        started = true;
        // 首次真正拖动：冻结当前位置并转为绝对定位（百分比），宽度锁定防塌缩
        const ctx = ensurePositioningContext(el);
        const cr = ctx.getBoundingClientRect();
        crW = cr.width || 1; crH = cr.height || 1;
        const ir = el.getBoundingClientRect();
        prev = {
          position: el.style.position, left: el.style.left, top: el.style.top,
          right: el.style.right, bottom: el.style.bottom,
          margin: el.style.margin, transition: el.style.transition, width: el.style.width
        };
        if (prev.position !== 'absolute') {
          el.style.position = 'absolute';
          el.style.left = ((ir.left - cr.left) / crW * 100).toFixed(2) + '%';
          el.style.top = ((ir.top - cr.top) / crH * 100).toFixed(2) + '%';
          el.style.margin = '0';
          // 冻结宽度必须用 computedStyle（布局真实值，不受 transform/取整影响）。
          // 若用 getBoundingClientRect + Math.round：scale 页面会量到缩后宽度、
          // 取整可能少 0.5px，都会让文字被挤成多一行
          el.style.width = parseFloat(getComputedStyle(el).width).toFixed(2) + 'px';
        }
        el.style.transition = 'none';
        el.style.boxShadow = '0 10px 30px rgba(0,0,0,.3)';
        startLeftPct = parseFloat(el.style.left) || 0;
        startTopPct = parseFloat(el.style.top) || 0;
        originX = ev.clientX; originY = ev.clientY;
        const p = prev;
        pushUndo(() => { if (el.isConnected) restoreStyles(el, p); });
      }
      const nextLeft = startLeftPct + (ev.clientX - originX) / crW * 100;
      const nextTop = startTopPct + (ev.clientY - originY) / crH * 100;
      el.style.left = Math.max(-50, Math.min(150, nextLeft)).toFixed(2) + '%';
      el.style.top = Math.max(-50, Math.min(150, nextTop)).toFixed(2) + '%';
      positionBlkBar();
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      if (!started) return;
      el.style.boxShadow = '';
      if (prev) {
        if (prev.transition === '') el.style.removeProperty('transition');
        else el.style.transition = prev.transition;
      }
      positionBlkBar();
      toast('模块已移动（↩ 可撤销）');
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  function buildBlkBar() {
    if (blkBar && blkBar.isConnected) { positionBlkBar(); return; }
    blkBar = document.createElement('div');
    blkBar.className = 'ez-blkbar';
    Object.assign(blkBar.style, {
      position: 'fixed', zIndex: '2147483647', display: 'flex', alignItems: 'center', gap: '8px',
      background: 'rgba(17,24,39,.95)', padding: '5px 8px', borderRadius: '9px',
      boxShadow: '0 4px 14px rgba(0,0,0,.35)', font: '12px/1 ' + FONT,
      userSelect: 'none', whiteSpace: 'nowrap'
    });
    const hint = document.createElement('span');
    hint.textContent = '拖动模块调整位置';
    hint.style.color = '#9ca3af';
    hint.style.fontSize = '11px';
    blkBar.appendChild(hint);
    const done = document.createElement('button');
    done.textContent = '✓ 完成';
    done.title = '结束模块移动';
    Object.assign(done.style, {
      border: 'none', background: '#16a34a', color: '#fff', padding: '5px 11px',
      borderRadius: '6px', cursor: 'pointer', font: '600 12px/1 ' + FONT
    });
    done.addEventListener('mousedown', (e) => e.preventDefault());
    done.addEventListener('click', () => exitBlkEdit());
    blkBar.appendChild(done);
    document.body.appendChild(blkBar);
    positionBlkBar();
  }

  function positionBlkBar() {
    if (!blkBar || !blkEdit) return;
    const r = blkEdit.el.getBoundingClientRect();
    const w = blkBar.offsetWidth, h = blkBar.offsetHeight;
    let top = r.top - h - 8;
    if (top < 8) top = r.bottom + 8;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    Object.assign(blkBar.style, { left: left + 'px', top: top + 'px' });
  }

  // ---------- 悬停小工具条 ----------

  function ensureHoverBar() {
    if (hoverBar && hoverBar.isConnected) return hoverBar;
    hoverBar = document.createElement('div');
    hoverBar.id = HOVER_ID;
    Object.assign(hoverBar.style, {
      position: 'fixed', zIndex: '2147483646', display: 'none', gap: '2px',
      background: 'rgba(17,24,39,.95)', padding: '4px 5px', borderRadius: '9px',
      boxShadow: '0 4px 14px rgba(0,0,0,.35)', font: '12px/1 ' + FONT,
      userSelect: 'none', whiteSpace: 'nowrap'
    });
    const mk = (label, title, fn) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.title = title;
      Object.assign(b.style, {
        border: 'none', background: 'transparent', color: '#e5e7eb',
        padding: '5px 8px', borderRadius: '6px', cursor: 'pointer',
        font: '600 12px/1 ' + FONT
      });
      b.addEventListener('mouseenter', () => (b.style.background = 'rgba(255,255,255,.15)'));
      b.addEventListener('mouseleave', () => (b.style.background = 'transparent'));
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', fn);
      hoverBar.appendChild(b);
      return b;
    };
    hoverReplaceBtn = mk('更换图', '用本地图片替换这张图', () => pickFile('replace'));
    hoverAdjustBtn = mk('调整', '调整这张图片：缩放 / 移动位置 / 裁剪', () => {
      const img = imgTarget && imgTarget.isConnected ? imgTarget : null;
      if (img) enterImgEdit(img);
    });
    hoverMoveBtn = mk('移动', '把这个模块拖到任意位置', () => {
      const el = hoverHost && hoverHost.isConnected ? hoverHost : null;
      if (el) enterBlkEdit(el);
    });
    mk('删除', '删除这个元素（↩ 可撤销）', () => deleteHost(currentHoverTarget()));
    mk('复制', '复制一份，插到它后面', () => duplicateHost(currentHoverTarget()));
    mk('插图', '在这个元素后面插入一张图片', () => pickFile('insert'));
    document.body.appendChild(hoverBar);
    return hoverBar;
  }

  function hasBgImage(el) {
    const bg = getComputedStyle(el).backgroundImage;
    return !!bg && bg.includes('url(');
  }

  function showHoverBar() {
    const bar = ensureHoverBar();
    bar.style.display = 'flex';
    const isVideo = !!(imgTarget && imgTarget.tagName === 'VIDEO');
    if (hoverReplaceBtn) hoverReplaceBtn.style.display = (!isVideo && (imgTarget || bgTarget)) ? '' : 'none';
    if (hoverAdjustBtn) hoverAdjustBtn.style.display = imgTarget ? '' : 'none';
    if (hoverMoveBtn) hoverMoveBtn.style.display = imgTarget ? 'none' : '';
    const host = currentHoverTarget();
    if (!host) return;
    const rect = host.getBoundingClientRect();
    bar.style.visibility = 'hidden';
    bar.style.left = '0px';
    bar.style.top = '0px';
    const w = bar.offsetWidth, h = bar.offsetHeight;
    let top = rect.top - h - 4;
    if (top < 8) top = rect.bottom + 4;
    const left = Math.max(8, Math.min(rect.right - w, window.innerWidth - w - 8));
    Object.assign(bar.style, { left: left + 'px', top: top + 'px', visibility: 'visible' });
  }

  function hideHoverBar() {
    clearHoverTimers();
    if (hoverBar) hoverBar.style.display = 'none';
  }

  // 清理悬停相关的延迟定时器
  function clearHoverTimers() {
    clearTimeout(hideTimer);
    clearTimeout(switchTimer);
    pendingHover = null;
  }

  // 计算鼠标所在位置对应的悬停目标（img/video / 背景图 / 宿主块）
  function detectHoverTarget(t) {
    let img = null, bg = null, host = null;
    if (t.tagName === 'IMG' || t.tagName === 'VIDEO') {
      img = t; // imgTarget 统一承载媒体目标（图片或视频）
      host = t;
    } else {
      host = blockOf(t);
      let n = t;
      while (n && n !== host && n !== document.body) {
        if (hasBgImage(n)) { bg = n; break; }
        n = n.parentElement;
      }
      if (!bg && host && host !== document.body && hasBgImage(host)) bg = host;
    }
    if (!host || host === document.body || host === document.documentElement) return null;
    return { host, img, bg };
  }

  document.addEventListener('mouseover', (e) => {
    if (!enabled) return;
    if (imgEdit || blkEdit) return; // 图片调整 / 模块移动模式中不响应悬停
    const t = e.target;
    if (!t || !t.closest) return;
    // 鼠标进入插件自身 UI（含悬停工具条）：保持现状，取消待定的隐藏/切换
    if (t.closest(PLUGIN_SELECTOR)) {
      clearTimeout(hideTimer);
      clearTimeout(switchTimer);
      pendingHover = null;
      return;
    }
    const found = detectHoverTarget(t);
    const showing = !!(hoverBar && hoverBar.isConnected && hoverBar.style.display !== 'none');

    if (!found) {
      // 空白区域：延迟隐藏，给鼠标移向工具条留出时间
      if (!showing) return;
      clearTimeout(switchTimer);
      pendingHover = null;
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hideHoverBar, 500);
      return;
    }

    clearTimeout(hideTimer); // 回到有效元素，取消待定的隐藏

    if (found.host === hoverHost && showing) {
      // 同一块内移动：立即刷新「更换图」按钮显隐与定位
      imgTarget = found.img;
      bgTarget = found.bg;
      showHoverBar();
      return;
    }

    if (!showing || !hoverHost || !hoverHost.isConnected) {
      // 工具条未显示：立即定位显示，首次悬停响应不受延迟影响
      clearTimeout(switchTimer);
      pendingHover = null;
      imgTarget = found.img;
      bgTarget = found.bg;
      hoverHost = found.host;
      showHoverBar();
      return;
    }

    // 工具条已显示但目标换成了别的块：延迟确认切换，
    // 避免鼠标移向工具条途中穿过其他元素时工具条跳走或消失
    clearTimeout(switchTimer);
    pendingHover = found;
    switchTimer = setTimeout(() => {
      if (!enabled || !pendingHover || !pendingHover.host.isConnected) { pendingHover = null; return; }
      imgTarget = pendingHover.img;
      bgTarget = pendingHover.bg;
      hoverHost = pendingHover.host;
      pendingHover = null;
      showHoverBar();
    }, 300);
  });

  window.addEventListener('scroll', () => {
    if (imgEdit) { syncImgBox(); updateImgBar(); return; }
    if (blkEdit) { positionBlkBar(); return; }
    hideHoverBar();
  }, true);
  window.addEventListener('resize', () => {
    if (imgEdit) { syncImgBox(); updateImgBar(); }
    if (blkEdit) positionBlkBar();
  });

  // ---------- 快照 / 导出 / 草稿 ----------

  // 判断某个「基线之外的顶级节点」是否应从导出中剔除：
  // 只删 head 载荷（style/script/link/meta）和没有任何文字的悬浮/隐藏空壳——
  // 带文字内容的节点即使是中途出现的也保留（可能是页面自己弹出的内容），宁漏勿错
  function isForeignTop(el) {
    if (baselineTop && baselineTop.has(el)) return false;
    if (el.matches && el.matches(PLUGIN_SELECTOR)) return false;
    const tag = el.tagName;
    if (tag === 'STYLE' || tag === 'SCRIPT' || tag === 'LINK' || tag === 'META') return true;
    if (el.textContent && el.textContent.trim()) return false;
    const cs = getComputedStyle(el);
    return cs.position === 'fixed' || cs.position === 'absolute' ||
      cs.display === 'none' || cs.visibility === 'hidden';
  }

  // 基线差分：克隆树与实况树的直接子节点一一同位（cloneNode 保证顺序一致），
  // 实况侧「基线外且像外部注入」的节点，其克隆镜像不写入导出
  function pruneForeignTopLevel(clone) {
    if (!baselineTop) return;
    const pairs = [
      [document.documentElement, clone],
      [document.head, clone.querySelector('head')],
      [document.body, clone.querySelector('body')]
    ];
    for (const [live, cl] of pairs) {
      if (!live || !cl) continue;
      const lc = Array.from(live.children);
      const cc = Array.from(cl.children);
      if (lc.length !== cc.length) continue; // 结构对不上就放弃裁剪，宁可多留不可误删
      for (let i = 0; i < lc.length; i++) {
        if (isForeignTop(lc[i])) cc[i].remove();
      }
    }
  }

  function snapshotHTML() {
    const clone = document.documentElement.cloneNode(true);
    // 1) 基线差分要最先做：此刻克隆树与实况树索引完全对齐，删过东西就对不上了
    pruneForeignTopLevel(clone);
    // 2) 插件自身 UI + 打印流程残留样式
    clone.querySelectorAll(PLUGIN_SELECTOR).forEach((n) => n.remove());
    // 3) 打印流程残留在页面元素上的类名（中断的打印可能没走同步清理）
    clone.querySelectorAll('.ez-print-page,.ez-print-wrap').forEach((n) => {
      n.classList.remove('ez-print-page', 'ez-print-wrap');
    });
    // 4) 其他扩展注入的节点（暗色模式样式、双语翻译节点等）
    try { clone.querySelectorAll(FOREIGN_SELECTOR).forEach((n) => n.remove()); } catch (_) {}
    // 5) 编辑态痕迹
    clone.querySelectorAll('[contenteditable="true"]').forEach((n) => n.removeAttribute('contenteditable'));
    return '<!DOCTYPE html>\n' + clone.outerHTML;
  }

  // 导出成功后的统一收尾：清脏标记 + 清草稿
  function markExported() {
    dirty = false;
    clearTimeout(saveTimer);
    try { localStorage.removeItem(draftKey()); } catch (_) {}
  }

  // 实际执行下载（优先扩展 downloads API，兜底 a[download]）
  function finishExport(html, name) {
    const done = () => {
      markExported();
      toast('已导出：' + name + '（在浏览器默认下载文件夹，原文件不受影响）');
    };
    try {
      chrome.runtime.sendMessage(
        { type: 'ez-export', filename: name, html },
        (res) => {
          if (chrome.runtime.lastError || !res || !res.ok) legacyDownload(html, name) ? done() : null;
          else done();
        }
      );
    } catch (_) {
      legacyDownload(html, name);
      done();
    }
  }

  function exportHTML() {
    closePanel(); // 面板不写入导出文件
    const html = snapshotHTML();
    const name = exportFileName();
    // 检测本地资源引用（assets/ 相对路径等）：导出副本离开原文件夹后这些引用会失效
    let doc = null;
    try { doc = new DOMParser().parseFromString(html, 'text/html'); } catch (_) {}
    const refs = doc ? findLocalRefs(doc) : [];
    if (refs.length) { assetExportPanel(doc, refs.length, name, html); return; }
    finishExport(html, name);
  }

  function exportFileName() {
    return ((document.title || 'page').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 50) || 'page') + '-已修改.html';
  }

  // ---------- 本地资源内嵌导出 ----------
  // 页面引用了 assets/ 等相对路径资源时，导出的单文件副本会丢图丢样式。
  // 方案：让用户选一次原文件夹（input webkitdirectory，无需任何新权限），
  // 把引用到的文件全部转成 data URI 塞进导出 HTML，得到自包含的单文件

  const ASSET_MIME = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    svg: 'image/svg+xml', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon', bmp: 'image/bmp',
    mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4',
    woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
    eot: 'application/vnd.ms-fontobject',
    css: 'text/css' // @import 内嵌时必须给正确 MIME，浏览器才认
  };

  // 是否本地相对引用（排除 http/data/blob/#锚点/协议相对）
  function isLocalRef(v) {
    if (v == null) return false;
    v = String(v).trim();
    if (!v || v.startsWith('#') || v.startsWith('//')) return false;
    return !/^(https?:|data:|blob:|mailto:|tel:|javascript:|about:)/i.test(v);
  }

  // srcset 解析：'a.png 1x, b.png 2x' → [{url, desc}]
  function parseSrcset(v) {
    return String(v || '').split(',').map((s) => s.trim()).filter(Boolean).map((part) => {
      const m = part.match(/^(\S+)(\s+\S.*)?$/);
      return m ? { url: m[1], desc: (m[2] || '').trim() } : null;
    }).filter(Boolean);
  }

  // 提取 CSS 文本里所有 url(...) 引用（去重）
  function extractCssUrls(cssText) {
    const out = [];
    String(cssText || '').replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, u) => {
      if (isLocalRef(u) && out.indexOf(u) < 0) out.push(u);
      return m;
    });
    return out;
  }

  function findLocalRefs(doc) {
    const refs = [];
    doc.querySelectorAll('img[src],source[src],video[src],audio[src],track[src]').forEach((el) => {
      const v = el.getAttribute('src');
      if (isLocalRef(v)) refs.push({ kind: 'attr', el, attr: 'src', path: v.trim() });
    });
    doc.querySelectorAll('video[poster]').forEach((el) => {
      const v = el.getAttribute('poster');
      if (isLocalRef(v)) refs.push({ kind: 'attr', el, attr: 'poster', path: v.trim() });
    });
    doc.querySelectorAll('img[srcset],source[srcset]').forEach((el) => {
      if (parseSrcset(el.getAttribute('srcset')).some((c) => isLocalRef(c.url))) {
        refs.push({ kind: 'srcset', el });
      }
    });
    doc.querySelectorAll('script[src]').forEach((el) => {
      const v = el.getAttribute('src');
      if (isLocalRef(v)) refs.push({ kind: 'script', el, path: v.trim() });
    });
    doc.querySelectorAll('link[href]').forEach((el) => {
      const rel = (el.getAttribute('rel') || '').toLowerCase();
      const v = el.getAttribute('href');
      if (/stylesheet|icon/.test(rel) && isLocalRef(v)) refs.push({ kind: 'link', el, path: v.trim() });
    });
    doc.querySelectorAll('style').forEach((el) => {
      if (/url\(\s*['"]?\S/i.test(el.textContent || '')) refs.push({ kind: 'styletext', el });
    });
    doc.querySelectorAll('[style]').forEach((el) => {
      if (/url\(\s*['"]?\S/i.test(el.getAttribute('style') || '')) refs.push({ kind: 'inlinestyle', el });
    });
    return refs;
  }

  // FileList → 查找表：相对路径(去掉所选根目录前缀) → File；文件名 → File（重名置 null 防歧义）
  function buildFileMap(files) {
    const map = new Map();
    const byName = new Map();
    for (const f of files) {
      let rel = (f.webkitRelativePath || f.name).replace(/\\/g, '/');
      const segs = rel.split('/');
      if (segs.length > 1) rel = segs.slice(1).join('/'); // 去掉所选根文件夹名
      if (!rel) continue;
      if (!map.has(rel)) map.set(rel, f);
      const base = rel.split('/').pop();
      if (byName.has(base)) { if (byName.get(base) !== f) byName.set(base, null); }
      else byName.set(base, f);
    }
    return { map, byName };
  }

  // 拖拽进来的文件/文件夹 → 与 buildFileMap 相同结构的查找表（附带诊断信息）
  // 注意：webkitGetAsEntry / getAsFile 都必须在事件的同步阶段调用（事件结束后 DataTransfer 失效）。
  // 某些环境（扩展的隔离脚本环境）webkitGetAsEntry 对目录返回 null，因此多通道降级：
  // entry 拿不到就试 getAsFile（散文件可用，目录返回 null），最后再扫 dt.files。
  // 目录要递归展开，readEntries 每次最多返回 100 条，必须循环读到空为止
  function fileMapFromDataTransfer(dt) {
    const entries = [];
    const looseFiles = [];
    const diag = { items: 0, fileKinds: 0, entries: 0, loose: 0 };
    if (dt) {
      const items = dt.items ? Array.from(dt.items) : [];
      diag.items = items.length;
      for (const it of items) {
        if (!it || it.kind !== 'file') continue;
        diag.fileKinds++;
        let en = null;
        try { en = it.webkitGetAsEntry ? it.webkitGetAsEntry() : null; } catch (_) {}
        if (en) { entries.push(en); continue; }
        let f = null;
        try { f = it.getAsFile ? it.getAsFile() : null; } catch (_) {}
        if (f) looseFiles.push(f);
      }
      if (!entries.length && !looseFiles.length && dt.files) {
        for (const f of Array.from(dt.files)) if (f) looseFiles.push(f);
      }
    }
    diag.entries = entries.length;
    diag.loose = looseFiles.length;
    const collected = []; // { rel, file }
    const walk = (entry, prefix) => new Promise((resolve) => {
      if (entry.isFile) {
        entry.file(
          (f) => { collected.push({ rel: prefix + entry.name, file: f }); resolve(); },
          () => resolve()
        );
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const readNext = () => reader.readEntries(
          async (batch) => {
            if (!batch.length) { resolve(); return; }
            for (const e of batch) await walk(e, prefix + entry.name + '/');
            readNext();
          },
          () => resolve()
        );
        readNext();
      } else resolve();
    });
    return (async () => {
      for (const en of entries) await walk(en, '');
      for (const f of looseFiles) collected.push({ rel: f.name, file: f });
      if (!collected.length) return { map: new Map(), byName: new Map(), diag };
      // 单一根目录时去掉根文件夹名，与「选择文件夹」行为一致；散拖多个文件/文件夹则保留原名
      const roots = new Set(collected.map((c) => c.rel.split('/')[0]));
      const strip = roots.size === 1 && collected.some((c) => c.rel.includes('/'));
      const map = new Map();
      const byName = new Map();
      for (const { rel, file } of collected) {
        const r = strip ? rel.split('/').slice(1).join('/') : rel;
        if (!r) continue;
        if (!map.has(r)) map.set(r, file);
        const base = r.split('/').pop();
        if (byName.has(base)) { if (byName.get(base) !== file) byName.set(base, null); }
        else byName.set(base, file);
      }
      return { map, byName, diag };
    })();
  }

  function normPath(p) {
    const out = [];
    for (const s of String(p).replace(/\\/g, '/').split('/')) {
      if (!s || s === '.') continue;
      if (s === '..') { out.pop(); continue; }
      out.push(s);
    }
    return out.join('/');
  }

  // 引用路径 → File：先全路径精确匹配，再逐层去前缀后缀匹配，最后按文件名（唯一时）
  function lookupFile(fm, ref) {
    let p = normPath(String(ref).split('?')[0].split('#')[0]);
    if (!p) return null;
    if (fm.map.has(p)) return fm.map.get(p);
    const segs = p.split('/');
    for (let i = 1; i < segs.length; i++) {
      const s = segs.slice(i).join('/');
      if (fm.map.has(s)) return fm.map.get(s);
    }
    const b = fm.byName.get(segs[segs.length - 1]);
    return b || null;
  }

  function readAsDataURL(file) {
    return new Promise((res) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => res(null);
      r.readAsDataURL(file);
    });
  }

  function readAsText(file) {
    return new Promise((res) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => res(null);
      r.readAsText(file);
    });
  }

  async function toGoodDataURL(file) {
    const url = await readAsDataURL(file);
    if (!url) return null;
    if (url.startsWith('data:;') || url.startsWith('data:,') || /^data:application\/octet-stream;/.test(url)) {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      const mime = ASSET_MIME[ext];
      if (mime) return url.replace(/^data:[^;]*;/, 'data:' + mime + ';');
    }
    return url;
  }

  // CSS 里的 url(...) 换成 data URI（baseDir：该 CSS 自身所在目录，用于解析相对引用）
  async function inlineCssUrls(cssText, baseDir, fm, dataCache) {
    const urls = [];
    String(cssText).replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, u) => {
      if (isLocalRef(u) && urls.indexOf(u) < 0) urls.push(u);
      return m;
    });
    const mapping = new Map();
    for (const u of urls) {
      const target = baseDir ? normPath(baseDir + '/' + u) : normPath(u);
      const f = lookupFile(fm, target) || lookupFile(fm, u);
      if (!f) continue;
      if (!dataCache.has(f)) dataCache.set(f, await toGoodDataURL(f));
      if (dataCache.get(f)) mapping.set(u, dataCache.get(f));
    }
    return String(cssText).replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, u) =>
      mapping.has(u) ? 'url("' + mapping.get(u) + '")' : m
    );
  }

  // 把 doc 里所有本地引用替换为内嵌内容；返回 { matched, missed, missedPaths }
  async function inlineAllAssets(doc, fm) {
    const dataCache = new Map();
    let matched = 0, missed = 0;
    const missedPaths = [];
    for (const r of findLocalRefs(doc)) {
      if (r.kind === 'styletext') {
        r.el.textContent = await inlineCssUrls(r.el.textContent || '', '', fm, dataCache);
        continue;
      }
      if (r.kind === 'inlinestyle') {
        r.el.setAttribute('style', await inlineCssUrls(r.el.getAttribute('style') || '', '', fm, dataCache));
        continue;
      }
      if (r.kind === 'srcset') {
        const cands = parseSrcset(r.el.getAttribute('srcset'));
        const parts = [];
        let allHit = true;
        for (const c of cands) {
          const keep = () => c.url + (c.desc ? ' ' + c.desc : '');
          if (!isLocalRef(c.url)) { parts.push(keep()); continue; }
          const f = lookupFile(fm, c.url);
          if (!f) { allHit = false; parts.push(keep()); continue; }
          if (!dataCache.has(f)) dataCache.set(f, await toGoodDataURL(f));
          const du = dataCache.get(f);
          if (!du) { allHit = false; parts.push(keep()); continue; }
          parts.push(du + (c.desc ? ' ' + c.desc : ''));
        }
        r.el.setAttribute('srcset', parts.join(', '));
        if (allHit) matched++; else missed++;
        continue;
      }
      const f = lookupFile(fm, r.path);
      if (!f) { missed++; missedPaths.push(r.path); continue; }
      if (r.kind === 'script') {
        const txt = await readAsText(f);
        if (txt == null) { missed++; missedPaths.push(r.path); continue; }
        r.el.removeAttribute('src');
        r.el.textContent = txt;
      } else if (r.kind === 'link' && /stylesheet/.test((r.el.getAttribute('rel') || '').toLowerCase())) {
        const css = await readAsText(f);
        if (css == null) { missed++; missedPaths.push(r.path); continue; }
        const dir = normPath(r.path).split('/').slice(0, -1).join('/');
        const st = doc.createElement('style');
        if (r.el.getAttribute('media')) st.setAttribute('media', r.el.getAttribute('media'));
        st.textContent = await inlineCssUrls(css, dir, fm, dataCache);
        r.el.replaceWith(st);
      } else {
        if (!dataCache.has(f)) dataCache.set(f, await toGoodDataURL(f));
        if (!dataCache.get(f)) { missed++; missedPaths.push(r.path); continue; }
        r.el.setAttribute(r.kind === 'link' ? 'href' : r.attr, dataCache.get(f));
      }
      matched++;
    }
    return { matched, missed, missedPaths };
  }

  // ---------- 文件夹模式导出：HTML + 资源文件整套复制到下载目录的子文件夹 ----------
  // 与单文件内嵌互补：资源原样复制（不转 base64，视频/大图不会撑爆 HTML），
  // HTML 引用重写为规范相对路径，保证导出文件夹内部自洽、结构与原来一致

  // 制定文件夹导出计划：收集所有用到的文件 + 重写 HTML 引用
  async function buildFolderPlan(doc, fm) {
    const files = new Map(); // 导出相对路径 -> File
    const missedPaths = [];
    const cssPending = []; // 待解析内部引用的 CSS 文件（导出相对路径）
    const attrRewrites = []; // { el, attr, value }
    const styleTextRefs = []; // { el, inline }

    // 解析一个引用，找到文件则登记复制；返回导出相对路径（找不到返回 null）
    const resolveRef = (refPath, baseDir) => {
      const clean = String(refPath).split('?')[0].split('#')[0];
      const rel = baseDir ? normPath(baseDir + '/' + clean) : normPath(clean);
      if (!rel) return null;
      let f = lookupFile(fm, rel);
      if (!f) f = lookupFile(fm, clean);
      if (!f) { missedPaths.push(refPath); return null; }
      if (!files.has(rel)) files.set(rel, f);
      return rel;
    };

    for (const r of findLocalRefs(doc)) {
      if (r.kind === 'styletext' || r.kind === 'inlinestyle') {
        styleTextRefs.push({ el: r.el, inline: r.kind === 'inlinestyle' });
        extractCssUrls(r.kind === 'styletext' ? (r.el.textContent || '') : (r.el.getAttribute('style') || ''))
          .forEach((u) => resolveRef(u, ''));
        continue;
      }
      if (r.kind === 'srcset') {
        const parts = [];
        for (const c of parseSrcset(r.el.getAttribute('srcset'))) {
          if (!isLocalRef(c.url)) { parts.push(c.url + (c.desc ? ' ' + c.desc : '')); continue; }
          const rel = resolveRef(c.url, '');
          parts.push((rel || c.url) + (c.desc ? ' ' + c.desc : ''));
        }
        attrRewrites.push({ el: r.el, attr: 'srcset', value: parts.join(', ') });
        continue;
      }
      const rel = resolveRef(r.path, '');
      if (rel != null) {
        attrRewrites.push({ el: r.el, attr: r.attr || (r.kind === 'link' ? 'href' : 'src'), value: rel });
        // 外链 CSS 要继续解析它内部的字体/图片/@import 引用
        if (r.kind === 'link' && /stylesheet/.test((r.el.getAttribute('rel') || '').toLowerCase())) cssPending.push(rel);
      }
    }

    // 递归展开 CSS 内部引用（@import 链同样覆盖）
    const cssDone = new Set();
    while (cssPending.length) {
      const rel = cssPending.shift();
      if (cssDone.has(rel)) continue;
      cssDone.add(rel);
      const f = files.get(rel);
      if (!f) continue;
      const txt = await readAsText(f);
      if (txt == null) continue;
      const baseDir = rel.split('/').slice(0, -1).join('/');
      for (const u of extractCssUrls(txt)) {
        const sub = resolveRef(u, baseDir);
        if (sub && /\.css$/i.test(sub)) cssPending.push(sub);
      }
    }

    // 统一重写 HTML 引用：./、../ 等前缀折叠成规范相对路径，导出文件夹内部自洽
    attrRewrites.forEach((w) => w.el.setAttribute(w.attr, w.value));
    styleTextRefs.forEach(({ el, inline }) => {
      const rewrite = (css) => String(css || '').replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, u) => {
        if (!isLocalRef(u)) return m;
        const clean = String(u).split('?')[0].split('#')[0];
        const rel = normPath(clean);
        return rel === clean ? m : 'url(' + q + rel + q + ')';
      });
      if (inline) el.setAttribute('style', rewrite(el.getAttribute('style')));
      else el.textContent = rewrite(el.textContent || '');
    });

    return { files, missedPaths };
  }

  // 分批发送到 background 批量下载（单条消息过大会挂，按 ~8MB 切批）
  function sendBatch(files) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'ez-export-batch', files }, (res) => {
          if (chrome.runtime.lastError || !res) { resolve({ ok: 0, fail: files.length }); return; }
          resolve(res);
        });
      } catch (_) { resolve({ ok: 0, fail: files.length }); }
    });
  }

  async function exportFolderMode(doc, fm, htmlName) {
    const plan = await buildFolderPlan(doc, fm);
    const folderName = htmlName.replace(/\.html?$/i, '');
    const items = [];
    const skipped = [];

    const html = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
    items.push({ filename: folderName + '/' + htmlName, url: 'data:text/html;charset=utf-8,' + encodeURIComponent(html) });

    for (const [rel, f] of plan.files) {
      const url = await toGoodDataURL(f);
      if (!url) { skipped.push(rel); continue; }
      if (url.length > 32 * 1024 * 1024) { skipped.push(rel + '（超过 32MB，请手动拷贝）'); continue; }
      items.push({ filename: folderName + '/' + rel, url });
    }

    const BATCH = 8 * 1024 * 1024;
    let batch = [], size = 0, ok = 0, fail = 0;
    const flush = async () => {
      if (!batch.length) return;
      const res = await sendBatch(batch);
      ok += res.ok; fail += res.fail;
      batch = []; size = 0;
    };
    for (const it of items) {
      if (size + it.url.length > BATCH && batch.length) await flush();
      batch.push(it);
      size += it.url.length;
    }
    await flush();

    markExported();
    closePanel();
    let msg = '已导出完整文件夹「' + folderName + '」（' + ok + ' 个文件，含资源子目录，在浏览器默认下载文件夹）';
    if (fail) msg += '，' + fail + ' 个下载失败';
    if (skipped.length) msg += '；跳过：' + skipped.slice(0, 3).join('、') + (skipped.length > 3 ? ' 等' : '');
    if (plan.missedPaths.length) msg += '；' + plan.missedPaths.length + ' 处引用未找到对应文件';
    toast(msg);
  }

  // 快速匹配统计：所选文件夹能覆盖多少处引用（不读文件内容，只查路径命中）
  function quickMatch(doc, fm) {
    let total = 0, hit = 0;
    const test = (p) => {
      total++;
      const clean = String(p).split('?')[0].split('#')[0];
      if (lookupFile(fm, normPath(clean)) || lookupFile(fm, clean)) hit++;
    };
    for (const r of findLocalRefs(doc)) {
      if (r.kind === 'styletext') { extractCssUrls(r.el.textContent || '').forEach(test); continue; }
      if (r.kind === 'inlinestyle') { extractCssUrls(r.el.getAttribute('style') || '').forEach(test); continue; }
      if (r.kind === 'srcset') { parseSrcset(r.el.getAttribute('srcset')).forEach((c) => { if (isLocalRef(c.url)) test(c.url); }); continue; }
      test(r.path);
    }
    return { total, hit };
  }

  // 资源导出面板：两阶段——先选原文件夹，再选导出方式（单文件内嵌 / 完整文件夹）
  function assetExportPanel(doc, refCount, name, origHtml) {
    const descText = '检测到 ' + refCount + ' 处本地文件引用（如 assets/ 图片、样式），' +
      '副本离开原文件夹后这些内容会显示不出来。\n' +
      '先选择原 HTML 所在的文件夹（里面包含 assets），再选择导出方式：\n' +
      '· 单文件：用到的文件全部嵌进 HTML，一个文件发到哪都能开\n' +
      '· 完整文件夹：HTML + 资源整套导出到下载文件夹的子目录，结构与原来一致';

    const renderPick = () => {
      const content = document.createElement('div');
      const desc = document.createElement('div');
      desc.textContent = descText;
      Object.assign(desc.style, { whiteSpace: 'pre-line', color: '#cbd5e1', marginBottom: '12px', fontSize: '12.5px', lineHeight: '1.6' });
      content.appendChild(desc);

      const input = document.createElement('input');
      input.type = 'file';
      input.setAttribute('webkitdirectory', '');
      input.webkitdirectory = true;
      input.style.display = 'none';

      const pick = document.createElement('button');
      pick.textContent = '选择原 HTML 所在的文件夹';
      Object.assign(pick.style, Object.assign({ width: '100%', background: '#2563eb', color: '#fff', marginBottom: '8px' }, panelBtnStyle));
      pick.addEventListener('click', () => input.click());
      input.addEventListener('change', () => {
        if (!input.files || !input.files.length) {
          toast('没有读取到文件，请确认选择的是原 HTML 所在的文件夹（包含 assets）');
          return;
        }
        renderActions(buildFileMap(input.files));
      });

      // 拖拽支持：把原文件夹拖到面板上即可（虚线框是视觉提示，整个面板内容区都可投递）
      // （拖文件夹时 dataTransfer.files 是空的，必须走 webkitGetAsEntry 递归读取）
      const DZ_TEXT = '或把原文件夹直接拖到这里';
      const dropZone = document.createElement('div');
      dropZone.textContent = DZ_TEXT;
      Object.assign(dropZone.style, {
        border: '1.5px dashed rgba(148,163,184,.5)', borderRadius: '8px',
        padding: '16px 10px', textAlign: 'center', color: '#94a3b8',
        fontSize: '12.5px', marginBottom: '8px', transition: 'border-color .15s, color .15s'
      });
      const dzReset = () => {
        dropZone.style.borderColor = 'rgba(148,163,184,.5)';
        dropZone.style.color = '#94a3b8';
      };
      const handleDrop = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        dzReset();
        dropZone.textContent = '正在读取拖入的文件夹…';
        const r = await fileMapFromDataTransfer(e.dataTransfer);
        if (r.map.size) { renderActions(r); return; }
        dropZone.textContent = DZ_TEXT;
        if (r.diag.items > 0) {
          // 检测到拖入了东西但读不出内容（多见于隔离环境对目录条目的限制）。
          // drop 是用户手势，可以直接弹系统文件夹选择框，降级保流程可用
          toast('浏览器限制了拖入文件夹的读取，已为你打开文件夹选择框，请选择原 HTML 所在的文件夹');
          try { input.click(); } catch (_) {}
          return;
        }
        toast('没有读取到文件，请拖入原 HTML 所在的文件夹（包含 assets）');
      };
      content.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        dropZone.style.borderColor = '#38bdf8';
        dropZone.style.color = '#38bdf8';
      });
      content.addEventListener('dragleave', dzReset);
      content.addEventListener('drop', handleDrop);

      const skip = document.createElement('button');
      skip.textContent = '不处理资源，直接导出（资源可能显示不出来）';
      Object.assign(skip.style, panelBtnStyle);
      Object.assign(skip.style, { width: '100%' });
      skip.addEventListener('click', () => {
        closePanel();
        finishExport(origHtml, name);
      });

      content.appendChild(input);
      content.appendChild(pick);
      content.appendChild(dropZone);
      content.appendChild(skip);
      openPanel('导出副本', content);
    };

    const renderActions = (fm) => {
      const content = document.createElement('div');
      const { total, hit } = quickMatch(doc, fm);
      const stat = document.createElement('div');
      stat.textContent = hit === total
        ? '已在所选文件夹中找到全部 ' + total + ' 处引用的文件。'
        : '找到 ' + hit + ' / ' + total + ' 处引用的文件，未找到的将保留原引用。';
      Object.assign(stat.style, { color: hit === total ? '#34d399' : '#fbbf24', marginBottom: '12px', fontSize: '12.5px' });
      content.appendChild(stat);

      const single = document.createElement('button');
      single.textContent = '导出单文件（资源全部嵌入 HTML）';
      Object.assign(single.style, Object.assign({ width: '100%', background: '#2563eb', color: '#fff', marginBottom: '8px' }, panelBtnStyle));
      single.addEventListener('click', async () => {
        single.disabled = true; folderBtn.disabled = true; rePick.disabled = true;
        single.textContent = '正在读取并嵌入文件…';
        try {
          const { matched, missed } = await inlineAllAssets(doc, fm);
          const html = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
          closePanel();
          toast('已嵌入 ' + matched + ' 个文件' + (missed ? '，' + missed + ' 个未找到（保留原引用）' : '') + '，正在导出…');
          finishExport(html, name);
        } catch (err) {
          closePanel();
          toast('嵌入失败（' + (err && err.message ? err.message : '未知错误') + '），已按原样导出');
          finishExport(origHtml, name);
        }
      });

      const folderBtn = document.createElement('button');
      folderBtn.textContent = '导出完整文件夹（HTML + 资源文件）';
      Object.assign(folderBtn.style, Object.assign({ width: '100%', background: '#059669', color: '#fff', marginBottom: '8px' }, panelBtnStyle));
      folderBtn.addEventListener('click', async () => {
        single.disabled = true; folderBtn.disabled = true; rePick.disabled = true;
        folderBtn.textContent = '正在整理并导出文件…';
        try {
          await exportFolderMode(doc, fm, name);
        } catch (err) {
          closePanel();
          toast('文件夹导出失败：' + (err && err.message ? err.message : '未知错误'));
        }
      });

      const rePick = document.createElement('button');
      rePick.textContent = '重新选择文件夹';
      Object.assign(rePick.style, panelBtnStyle);
      Object.assign(rePick.style, { width: '100%' });
      rePick.addEventListener('click', renderPick);

      content.appendChild(single);
      content.appendChild(folderBtn);
      content.appendChild(rePick);
      openPanel('导出副本', content);
    };

    renderPick();
  }

  // 兜底：页面内 a[download] 触发（受页面 CSP 限制时可能被拦）
  function legacyDownload(html, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return true;
  }

  // 识别「幻灯片页容器」分组：同一父级下、高度达到视口 55% 以上的块级兄弟 ≥ 2 个视为多页
  // （AI 生成的演示文稿常见两种隐藏法：opacity:0 叠加 或 display:none 切换，两种都覆盖）
  function collectSlideGroups() {
    const vh = window.innerHeight;
    const byParent = new Map();
    for (const el of document.body.querySelectorAll('*')) {
      const p = el.parentElement;
      if (!p) continue;
      const tag = el.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK' || tag === 'META' || tag === 'NOSCRIPT') continue;
      if (el.id && String(el.id).startsWith('ez-')) continue; // 跳过插件自身 UI
      if (el.closest('[id^="ez-"]')) continue;
      const r = el.getBoundingClientRect();
      if (r.height < vh * 0.55) continue;
      if (!byParent.has(p)) byParent.set(p, []);
      byParent.get(p, []).push(el);
    }
    const groups = [];
    for (const [p, els] of byParent) {
      if (els.length < 2) continue;
      // 把同父级下 display:none / opacity:0 的同标签兄弟拉进组（当前不可见但属于幻灯片页）
      const set = new Set(els);
      for (const s of p.children) {
        if (set.has(s) || s.tagName !== els[0].tagName) continue;
        const cs = getComputedStyle(s);
        if (cs.display === 'none' || parseFloat(cs.opacity) === 0) set.add(s);
      }
      // 按真实 DOM 顺序排序（display:none 的页是后补录进 Set 的，顺序会错位）
      const order = new Map();
      Array.prototype.forEach.call(p.children, (c, i) => order.set(c, i));
      const group = [...set].sort((a, b) => (order.get(a) || 0) - (order.get(b) || 0));
      groups.push(group);
    }
    return groups;
  }

  // ---------- 一键换主题色 ----------

  function parseColor(c) {
    if (!c) return null;
    c = String(c).trim();
    let m = c.match(/^#([0-9a-f]{3})$/i);
    if (m) { const h = m[1]; return [parseInt(h[0]+h[0],16), parseInt(h[1]+h[1],16), parseInt(h[2]+h[2],16)]; }
    m = c.match(/^#([0-9a-f]{6})$/i);
    if (m) { const h = m[1]; return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]; }
    m = c.match(/^rgba?\(([^)]+)\)$/i);
    if (m) {
      const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
      if (parts.length >= 3 && !isNaN(parts[0])) return [parts[0], parts[1], parts[2]];
    }
    return null;
  }

  // 把 background-image 里 url("...") 内部的 rgb( 前缀临时打码：
  // data URI（SVG 图表）里常带 rgb(...) 字样，若被当成渐变色替换成 #hex，
  // # 会被 URL 解析器当成片段分隔符，数据 URI 从此处截断、整张图碎掉
  function maskUrlColors(bg) {
    return bg.replace(/url\((["'])(.*?)\1\)/g, (m) => m.replace(/rgba?\(/g, '__EZU('));
  }

  // 统计页面强调色频次（忽略近黑/灰阶），返回前 n 个：[{rgb:[r,g,b], count}]
  function pickThemeColors(n) {
    const freq = new Map();
    const add = (c) => {
      const rgb = parseColor(c);
      if (!rgb) return;
      if (rgb[0] + rgb[1] + rgb[2] < 60) return; // 近黑忽略
      if (Math.abs(rgb[0]-rgb[1]) < 10 && Math.abs(rgb[1]-rgb[2]) < 10) return; // 灰阶忽略
      const key = rgb.join(',');
      freq.set(key, (freq.get(key) || 0) + 1);
    };
    // html/body 自身也要扫：页面背景常直接设在 body 上，querySelectorAll('*') 只查后代不含它们
    const all = [document.documentElement, document.body, ...document.body.querySelectorAll('*')];
    for (const el of all) {
      if (el.closest && el.closest(PLUGIN_SELECTOR)) continue;
      const cs = getComputedStyle(el);
      add(cs.color);
      add(cs.backgroundColor);
      add(cs.borderTopColor);
      add(cs.webkitTextFillColor);
      const bg = cs.backgroundImage;
      if (bg && bg !== 'none') {
        const found = maskUrlColors(bg).match(/rgba?\([^)]*\)/g);
        if (found) found.forEach(add);
      }
    }
    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k, count]) => ({ rgb: k.split(',').map(Number), count }));
  }

  function toHex(rgb) {
    return '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  }

  // 把页面中接近 source 的颜色全部替换为 target（hex 字符串）
  function applyThemeColor(targetHex, source) {
    const src = source;
    const snapshots = [];
    const near = (c) => {
      const rgb = parseColor(c);
      return !!rgb && Math.abs(rgb[0]-src[0]) <= 20 && Math.abs(rgb[1]-src[1]) <= 20 && Math.abs(rgb[2]-src[2]) <= 20;
    };
    const put = (el, prop, val) => {
      snapshots.push({ el, prop, old: el.style[prop] || '' });
      el.style[prop] = val;
    };
    // 与检测口径一致：html/body 自身也在替换范围内（页面背景设在 body 上时才能被换掉）
    const all = [document.documentElement, document.body, ...document.body.querySelectorAll('*')];
    for (const el of all) {
      if (el.closest && el.closest(PLUGIN_SELECTOR)) continue;
      const cs = getComputedStyle(el);
      if (near(cs.color)) put(el, 'color', targetHex);
      if (near(cs.backgroundColor)) put(el, 'backgroundColor', targetHex);
      ['borderTopColor','borderBottomColor','borderLeftColor','borderRightColor'].forEach((p) => {
        if (near(cs[p])) put(el, p, targetHex);
      });
      const tfc = cs.webkitTextFillColor;
      if (tfc && tfc !== 'transparent' && near(tfc)) put(el, 'webkitTextFillColor', targetHex);
      const bg = cs.backgroundImage;
      if (bg && bg !== 'none' && /rgba?\(/.test(bg)) {
        // 渐变里的颜色才参与替换；url(...) 数据 URI 里的 rgb( 已打码保护，最后再还原
        const masked = maskUrlColors(bg);
        const replaced = masked
          .replace(/rgba?\([^)]*\)/g, (m) => (near(m) ? targetHex : m))
          .replace(/__EZU\(/g, 'rgb(');
        if (replaced !== bg) put(el, 'backgroundImage', replaced);
      }
    }
    markDirty();
    pushUndo(() => { snapshots.forEach((s) => { s.el.style[s.prop] = s.old; }); markDirty(); });
    toast('已替换 ' + toHex(src) + ' → ' + targetHex + '（↩ 可撤销）');
  }

  // 主题色面板：显示频次前几的主题色，每个可单独替换
  function themePanel() {
    const colors = pickThemeColors(3);
    const content = document.createElement('div');
    if (!colors.length) {
      content.textContent = '未检测到明显的主题强调色，无法一键换色。';
      openPanel('一键换主题色', content);
      return;
    }
    const hint = document.createElement('div');
    hint.textContent = '检测到 ' + colors.length + ' 个主题色（按出现次数排序），可分别替换：';
    Object.assign(hint.style, { marginBottom: '10px', color: '#9ca3af' });
    content.appendChild(hint);

    colors.forEach((c, i) => {
      const card = document.createElement('div');
      Object.assign(card.style, {
        padding: '10px', borderRadius: '8px',
        background: 'rgba(255,255,255,.06)',
        border: '1px solid rgba(255,255,255,.1)',
        marginBottom: '10px'
      });

      const head = document.createElement('div');
      Object.assign(head.style, { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' });
      const swatch = document.createElement('span');
      Object.assign(swatch.style, {
        width: '22px', height: '22px', borderRadius: '6px',
        border: '1px solid rgba(255,255,255,.3)', display: 'inline-block', flexShrink: '0'
      });
      const label = document.createElement('span');
      Object.assign(label.style, { flex: '1', font: '600 13px ' + FONT });
      head.appendChild(swatch);
      head.appendChild(label);
      card.appendChild(head);

      // 源色链式更新：替换成功后，页面上该色系已是新颜色，
      // 下次替换（取色器改色后再点）要以新颜色为查找目标，否则找不到任何元素
      let curSrc = c.rgb;
      const syncHead = () => {
        const h = toHex(curSrc);
        swatch.style.background = h;
        label.textContent = '第 ' + (i + 1) + ' 色 ' + h + ' · ' + c.count + ' 处';
      };
      syncHead();

      const row = document.createElement('div');
      Object.assign(row.style, { display: 'flex', gap: '8px', alignItems: 'center' });
      const picker = document.createElement('input');
      picker.type = 'color';
      picker.value = toHex(c.rgb);
      Object.assign(picker.style, { flex: '1', height: '34px', border: 'none', background: 'transparent', cursor: 'pointer' });
      const apply = document.createElement('button');
      apply.textContent = '替换';
      Object.assign(apply.style, Object.assign({ background: '#2563eb', color: '#fff', flexShrink: '0' }, panelBtnStyle));

      const markDone = () => {
        apply.disabled = true;
        apply.textContent = '已替换 ✓';
        apply.style.opacity = '.55';
        apply.style.cursor = 'default';
      };
      const resetBtn = () => {
        apply.disabled = false;
        apply.textContent = '替换';
        apply.style.opacity = '';
        apply.style.cursor = 'pointer';
      };
      // 取色器一动就恢复按钮：说明用户想用新颜色再替换一次
      picker.addEventListener('input', resetBtn);

      apply.addEventListener('click', () => {
        const next = parseColor(picker.value);
        if (!next) return;
        if (toHex(next) === toHex(curSrc)) { toast('颜色没有变化，先在取色器里选个新颜色'); return; }
        applyThemeColor(picker.value, curSrc);
        curSrc = next;
        syncHead();
        markDone();
      });
      row.appendChild(picker);
      row.appendChild(apply);
      card.appendChild(row);
      content.appendChild(card);
    });

    const tip = document.createElement('div');
    tip.textContent = '提示：每个颜色只替换与它相近的深浅变化（±20 内）；↩ 可逐步撤销；替换后重开面板会按新页面重新检测。';
    Object.assign(tip.style, { color: '#6b7280', fontSize: '11px', margin: '6px 0 0' });
    content.appendChild(tip);
    openPanel('一键换主题色', content);
  }

  // ---------- 全局换字体 ----------

  function isHeadingEl(el) {
    return /^H[1-6]$/.test(el.tagName) || /title|heading|head|subtitle/i.test(el.className || '');
  }

  // kind: 'heading' 标题 / 'body' 正文
  function applyGlobalFont(kind, family) {
    const snapshots = [];
    const setF = (el) => { snapshots.push({ el, old: el.style.fontFamily || '' }); el.style.fontFamily = family; };
    for (const el of document.body.querySelectorAll('*')) {
      if (el.closest(PLUGIN_SELECTOR)) continue;
      if (isHeadingEl(el)) {
        if (kind === 'heading') setF(el);
        continue;
      }
      if (kind === 'body') {
        const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
        if (hasText || ['P','LI','TD','TH','BLOCKQUOTE','DD','DT','FIGCAPTION','A'].includes(el.tagName)) setF(el);
      }
    }
    markDirty();
    pushUndo(() => { snapshots.forEach((s) => { s.el.style.fontFamily = s.old; }); markDirty(); });
  }

  function fontSelect() {
    const sel = document.createElement('select');
    Object.assign(sel.style, {
      width: '100%', padding: '7px', borderRadius: '8px', border: '1px solid rgba(255,255,255,.2)',
      background: 'rgba(255,255,255,.08)', color: '#e5e7eb', font: '13px ' + FONT, marginBottom: '10px'
    });
    FONT_OPTIONS.forEach((o, i) => {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      if (i === 0) opt.selected = true;
      sel.appendChild(opt);
    });
    return sel;
  }

  // 全局字体面板
  function fontPanel() {
    const content = document.createElement('div');
    const hLabel = document.createElement('div');
    hLabel.textContent = '标题字体';
    Object.assign(hLabel.style, { marginBottom: '4px', color: '#9ca3af' });
    const hSel = fontSelect();
    const bLabel = document.createElement('div');
    bLabel.textContent = '正文字体';
    Object.assign(bLabel.style, { margin: '4px 0', color: '#9ca3af' });
    const bSel = fontSelect();

    const tip = document.createElement('div');
    tip.textContent = '提示：引用的是系统/开源字体，同事电脑没有时会自动回退，不嵌入字体文件，无版权问题。';
    Object.assign(tip.style, { color: '#6b7280', fontSize: '11px', margin: '6px 0' });

    const apply = document.createElement('button');
    apply.textContent = '应用字体';
    Object.assign(apply.style, Object.assign({ width: '100%', background: '#2563eb', color: '#fff' }, panelBtnStyle));
    apply.addEventListener('click', () => {
      applyGlobalFont('heading', hSel.value);
      applyGlobalFont('body', bSel.value);
      closePanel();
      toast('已应用全局字体（↩ 可撤销）');
    });

    content.appendChild(hLabel);
    content.appendChild(hSel);
    content.appendChild(bLabel);
    content.appendChild(bSel);
    content.appendChild(tip);
    content.appendChild(apply);
    openPanel('全局换字体', content);
  }

  // 面板按钮通用样式
  const panelBtnStyle = {
    border: 'none', padding: '6px 12px', borderRadius: '7px', cursor: 'pointer',
    background: 'rgba(255,255,255,.12)', color: '#e5e7eb', font: '600 13px ' + FONT
  };

  function exportPDF() {
    hideHoverBar();
    toolbar.style.display = 'none';
    if (imgBar) imgBar.style.display = 'none';
    if (blkBar) blkBar.style.display = 'none';
    const box = document.getElementById(IMGBOX_ID);
    if (box) box.style.display = 'none';
    const t = document.querySelector('.ez-toast');
    if (t) t.style.opacity = '0';

    // 多页幻灯片展开：临时标记所有页容器，打印时顺排 + 每页分页
    const PAGE_CLS = 'ez-print-page';
    const WRAP_CLS = 'ez-print-wrap';
    const marked = [];
    const wraps = new Set();
    for (const group of collectSlideGroups()) {
      for (const el of group) {
        el.classList.add(PAGE_CLS);
        marked.push(el);
        if (el.parentElement) wraps.add(el.parentElement);
      }
    }
    const printStyle = document.createElement('style');
    printStyle.id = 'ez-print-style';
    printStyle.textContent = '@media print{' +
      '.' + PAGE_CLS + '{display:block !important;opacity:1 !important;visibility:visible !important;' +
      'position:relative !important;left:auto !important;top:auto !important;' +
      'break-inside:avoid;page-break-inside:avoid;break-after:page;page-break-after:always;}' +
      '.' + PAGE_CLS + ':last-child{break-after:auto;page-break-after:auto;}' +
      '.' + WRAP_CLS + '{overflow:visible !important;height:auto !important;max-height:none !important;}' +
      'html,body{overflow:visible !important;height:auto !important;}}';
    document.head.appendChild(printStyle);
    wraps.forEach((w) => w.classList.add(WRAP_CLS));

    window.print();

    // 打印结束清理（Chrome 中 print() 同步阻塞，走到这里时对话框已关闭）
    printStyle.remove();
    marked.forEach((el) => el.classList.remove(PAGE_CLS));
    wraps.forEach((w) => w.classList.remove(WRAP_CLS));

    toolbar.style.display = 'flex';
    if (imgBar && imgEdit) imgBar.style.display = 'flex';
    if (box && imgEdit) box.style.display = 'block';
  }

  function draftKey() {
    return DRAFT_PREFIX + location.href;
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 1000);
  }

  function saveDraft() {
    try {
      localStorage.setItem(draftKey(), JSON.stringify({ t: Date.now(), html: snapshotHTML() }));
      autosaveOK = true;
    } catch (e) {
      if (autosaveOK) toast('内容较大，草稿自动保存失败，请尽快点「导出副本」');
      autosaveOK = false;
    }
  }

  function checkDraft() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(draftKey()) || 'null'); } catch (_) {}
    if (!d || !d.html) return;
    if (document.querySelector('.ez-draft-box')) return;
    const time = new Date(d.t).toLocaleString('zh-CN', { hour12: false });
    const box = document.createElement('div');
    box.className = 'ez-draft-box';
    Object.assign(box.style, {
      position: 'fixed', bottom: '84px', left: '50%', transform: 'translateX(-50%)',
      zIndex: '2147483647', display: 'flex', alignItems: 'center', gap: '10px',
      background: 'rgba(17,24,39,.96)', color: '#e5e7eb', padding: '10px 14px',
      borderRadius: '12px', boxShadow: '0 6px 24px rgba(0,0,0,.35)',
      font: '13px/1.4 ' + FONT, whiteSpace: 'nowrap'
    });
    const text = document.createElement('span');
    text.textContent = '检测到 ' + time + ' 的未导出草稿';
    const mk = (label, bg, fn) => {
      const b = document.createElement('button');
      b.textContent = label;
      Object.assign(b.style, {
        border: 'none', background: bg, color: '#fff', padding: '7px 14px',
        borderRadius: '8px', cursor: 'pointer', font: '600 13px/1 ' + FONT
      });
      b.addEventListener('click', fn);
      return b;
    };
    box.appendChild(text);
    box.appendChild(mk('恢复草稿', '#2563eb', () => { box.remove(); applyDraft(d.html); }));
    box.appendChild(mk('忽略', 'rgba(255,255,255,.14)', () => box.remove()));
    document.body.appendChild(box);
  }

  function applyDraft(html) {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    exitImgEdit();
    exitBlkEdit();
    // innerHTML 只覆盖子节点，html 根上的属性（如主题换色写上去的背景）要单独同步，否则恢复后丢失
    Array.from(document.documentElement.attributes).forEach((a) => document.documentElement.removeAttribute(a.name));
    Array.from(parsed.documentElement.attributes).forEach((a) => document.documentElement.setAttribute(a.name, a.value));
    document.documentElement.innerHTML = parsed.documentElement.innerHTML;
    toolbar = null;
    hoverBar = null;
    styleEl = null;
    fileInput = null;
    imgTarget = null;
    bgTarget = null;
    hoverHost = null;
    clearHoverTimers();
    enableCore();
    toast('草稿已恢复，可继续编辑');
  }

  // ---------- 主工具栏 ----------

  const TOOLBAR_POS_KEY = 'ezToolbarPos';

  // 恢复/保存工具条位置，跨会话记忆
  function applySavedToolbarPos() {
    try {
      const p = JSON.parse(localStorage.getItem(TOOLBAR_POS_KEY) || 'null');
      if (p && typeof p.left === 'number' && typeof p.top === 'number') {
        Object.assign(toolbar.style, {
          left: Math.max(4, Math.min(p.left, window.innerWidth - 100)) + 'px',
          top: Math.max(4, Math.min(p.top, window.innerHeight - 60)) + 'px',
          bottom: 'auto', transform: 'none'
        });
      }
    } catch (_) {}
  }

  function buildToolbar() {
    if (toolbar && toolbar.isConnected) return toolbar;
    toolbar = document.createElement('div');
    toolbar.id = TOOLBAR_ID;
    Object.assign(toolbar.style, {
      position: 'fixed', left: '50%', bottom: '18px', transform: 'translateX(-50%)',
      zIndex: '2147483647', display: 'flex', alignItems: 'center', gap: '2px',
      background: 'rgba(17,24,39,.96)', color: '#e5e7eb', padding: '7px 10px',
      borderRadius: '14px', boxShadow: '0 8px 30px rgba(0,0,0,.35)',
      font: '13px/1 ' + FONT, userSelect: 'none', whiteSpace: 'nowrap'
    });

    // 拖动手柄：按住可把工具条挪到任意位置
    const handle = document.createElement('span');
    handle.textContent = '⠿';
    handle.title = '按住拖动，移动工具条位置';
    Object.assign(handle.style, {
      cursor: 'move', color: '#9ca3af', padding: '7px 4px', fontSize: '15px',
      lineHeight: '1', userSelect: 'none'
    });
    handle.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const r = toolbar.getBoundingClientRect();
      const ox = e.clientX - r.left;
      const oy = e.clientY - r.top;
      const move = (ev) => {
        const left = Math.max(4, Math.min(ev.clientX - ox, window.innerWidth - r.width - 4));
        const top = Math.max(4, Math.min(ev.clientY - oy, window.innerHeight - r.height - 4));
        Object.assign(toolbar.style, { left: left + 'px', top: top + 'px', bottom: 'auto', transform: 'none' });
      };
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        try {
          localStorage.setItem(TOOLBAR_POS_KEY, JSON.stringify({
            left: parseFloat(toolbar.style.left) || 0,
            top: parseFloat(toolbar.style.top) || 0
          }));
        } catch (_) {}
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
    toolbar.appendChild(handle);

    const mkBtn = (label, title, fn, opts = {}) => {
      const b = document.createElement('button');
      b.innerHTML = label;
      b.title = title;
      Object.assign(b.style, {
        border: 'none', background: opts.bg || 'transparent', color: opts.color || '#e5e7eb',
        padding: '7px 9px', borderRadius: '8px', cursor: 'pointer',
        font: (opts.bold ? '700 ' : '600 ') + (opts.size || '13') + 'px/1 ' + FONT,
        minWidth: '30px', textAlign: 'center'
      });
      if (!opts.bg) {
        b.addEventListener('mouseenter', () => (b.style.background = 'rgba(255,255,255,.15)'));
        b.addEventListener('mouseleave', () => (b.style.background = 'transparent'));
      }
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', fn);
      return b;
    };
    const sep = () => {
      const s = document.createElement('span');
      Object.assign(s.style, { width: '1px', height: '18px', background: 'rgba(255,255,255,.18)', margin: '0 4px' });
      return s;
    };
    const lbl = (text) => {
      const s = document.createElement('span');
      s.textContent = text;
      Object.assign(s.style, { color: '#9ca3af', fontSize: '11px', margin: '0 3px' });
      return s;
    };

    toolbar.appendChild(mkBtn('↩', '撤销上一步', undo, { size: '15' }));
    toolbar.appendChild(mkBtn('B', '加粗 / 取消加粗（选中文字只改选中部分）', toggleBold, { bold: true, size: '14' }));
    toolbar.appendChild(sep());
    toolbar.appendChild(lbl('字号'));
    toolbar.appendChild(mkBtn('A－', '减小字号', () => changeSize(-1)));
    toolbar.appendChild(mkBtn('A＋', '增大字号', () => changeSize(1)));
    toolbar.appendChild(sep());

    const ci = document.createElement('input');
    ci.type = 'color';
    ci.value = '#e11d48';
    ci.title = '文字颜色（选中文字只改选中部分）';
    Object.assign(ci.style, {
      width: '28px', height: '28px', padding: '0', border: 'none',
      background: 'transparent', cursor: 'pointer', borderRadius: '6px'
    });
    ci.addEventListener('input', () => changeColor(ci.value));
    toolbar.appendChild(ci);
    toolbar.appendChild(sep());

    toolbar.appendChild(lbl('行距'));
    const lh = document.createElement('select');
    lh.title = '调整段落行距（先把光标点在段落里）';
    ['1.0', '1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.8', '2.0', '2.5', '3.0'].forEach((v, i) => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = v;
      if (v === '1.5') o.selected = true;
      lh.appendChild(o);
    });
    Object.assign(lh.style, {
      background: 'rgba(255,255,255,.12)', color: '#e5e7eb', border: 'none',
      padding: '5px 6px', borderRadius: '6px', cursor: 'pointer',
      font: '600 12px/1 ' + FONT, outline: 'none'
    });
    lh.addEventListener('change', () => {
      changeLineHeight(lh.value);
      // 恢复默认选中项，方便下次直接选其他值
      lh.value = '1.5';
    });
    lh.addEventListener('mousedown', (e) => e.stopPropagation());
    toolbar.appendChild(lh);
    toolbar.appendChild(sep());
    toolbar.appendChild(lbl('对齐'));
    toolbar.appendChild(mkBtn('⯇', '左对齐', () => changeAlign('left'), { size: '12' }));
    toolbar.appendChild(mkBtn('≡', '居中', () => changeAlign('center'), { size: '12' }));
    toolbar.appendChild(mkBtn('⯈', '右对齐', () => changeAlign('right'), { size: '12' }));
    toolbar.appendChild(sep());

    toolbar.appendChild(mkBtn('插图', '在光标所在段落后面插入一张图片', () => {
      imgTarget = null;
      bgTarget = null;
      hoverHost = (targets() || {}).block || null;
      pickFile('insert');
    }));
    toolbar.appendChild(mkBtn('视频', '在光标所在段落后面插入一段本地视频', () => {
      imgTarget = null;
      bgTarget = null;
      hoverHost = (targets() || {}).block || null;
      pickFile('insertVideo');
    }));
    toolbar.appendChild(mkBtn('PDF', '打印 / 保存为 PDF', exportPDF));
    toolbar.appendChild(sep());
    toolbar.appendChild(mkBtn('主题', '一键换整页主题色', themePanel, { size: '13' }));
    toolbar.appendChild(mkBtn('字体', '全局换标题/正文字体', fontPanel, { size: '13' }));

    const exp = mkBtn('⬇ 导出副本', '下载修改后的 HTML 副本，原文件保持不变', exportHTML, { bg: '#2563eb', color: '#fff', bold: true });
    exp.style.padding = '7px 14px';
    toolbar.appendChild(exp);
    toolbar.appendChild(mkBtn('退出', '退出编辑模式', disable, { color: '#f87171' }));
    applySavedToolbarPos();
    return toolbar;
  }

  // ---------- 开关 ----------

  function ensureStyle() {
    if (styleEl && styleEl.isConnected) return;
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = [
      '[contenteditable="true"]{outline:none}',
      '[contenteditable="true"]:hover{outline:2px dashed rgba(59,130,246,.85)!important;outline-offset:2px;cursor:text}',
      '[contenteditable="true"]:focus{outline:2px solid rgba(59,130,246,.95)!important;outline-offset:2px}',
      '@media print{' + PLUGIN_SELECTOR + '{display:none!important}}'
    ].join('');
    document.documentElement.appendChild(styleEl);
  }

  function enableCore() {
    // 先采集基线再注入插件 UI：html/head/body 当前的直接子节点（排除插件自身）视为「页面原有」，
    // 导出时基线之外新冒出来的顶级节点会被当作外部注入剔除
    baselineTop = new WeakSet();
    [document.documentElement, document.head, document.body].forEach((p) => {
      if (!p) return;
      Array.from(p.children).forEach((c) => {
        if (c.matches && c.matches(PLUGIN_SELECTOR)) return;
        baselineTop.add(c);
      });
    });
    ensureStyle();
    makeEditable();
    document.body.appendChild(buildToolbar());
    toolbar.style.display = 'flex';
  }

  function enable() {
    enabled = true;
    lastEditable = null;
    undoStack.length = 0;
    dirty = false;
    enableCore();
    toast('编辑模式已开启 v' + VERSION + '：点文字直接改；悬停元素可换图/删除/复制/插图；改完点「导出副本」');
    checkDraft();
  }

  function disable() {
    enabled = false;
    exitImgEdit();
    exitBlkEdit();
    closePanel();
    if (dirty) saveDraft();
    clearTimeout(saveTimer);
    document.querySelectorAll('[contenteditable="true"]').forEach((n) => n.removeAttribute('contenteditable'));
    hideHoverBar();
    if (toolbar) toolbar.style.display = 'none';
    if (styleEl) styleEl.remove();
    // 通知后台已关闭，保证图标徽标状态一致
    try { chrome.runtime.sendMessage({ type: 'ez-sync', enabled: false }); } catch (_) {}
    toast(dirty ? '已退出编辑模式（草稿已自动保存，重新开启可恢复）' : '已退出编辑模式');
  }

  // ---------- 全局事件 ----------

  document.addEventListener('click', (e) => {
    if (!enabled) return;
    const a = e.target && e.target.closest && e.target.closest('a');
    if (a) e.preventDefault();
  }, true);

  ['keydown', 'keyup', 'keypress'].forEach((type) => {
    document.addEventListener(type, (e) => {
      if (!enabled) return;
      const t = e.target;
      if (t && t.closest && t.closest('[contenteditable="true"]')) e.stopPropagation();
    }, true);
  });

  document.addEventListener('selectionchange', () => {
    if (!enabled) return;
    const sel = window.getSelection();
    if (sel && sel.anchorNode) {
      const n = sel.anchorNode.nodeType === Node.TEXT_NODE ? sel.anchorNode.parentElement : sel.anchorNode;
      if (n && n.closest) {
        const ed = n.closest('[contenteditable="true"]');
        if (ed) lastEditable = ed;
      }
    }
  });

  document.addEventListener('input', () => {
    if (enabled) markDirty();
  });

  window.addEventListener('beforeunload', (e) => {
    if (dirty && !autosaveOK) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // 由背景页调用的开关接口（1.3.0 起，图标点击走持久化状态）
  window.__ezSet = function (nextEnabled) {
    if (enabled === nextEnabled) return enabled;
    if (nextEnabled) enable();
    else disable();
    return enabled;
  };

  // 兼容旧入口（不再由背景页直接调用，但保留以防旧标签）
  window.__ezToggle = function () {
    return window.__ezSet(!enabled);
  };

  // content.js 注入/重载时：询问后台当前标签是否应处于开启状态
  try {
    chrome.runtime.sendMessage({ type: 'ez-query' }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res && res.enabled) window.__ezSet(true);
    });
  } catch (_) {}
})();

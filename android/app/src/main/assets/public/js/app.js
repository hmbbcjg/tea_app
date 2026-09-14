/* 茶记 —— 茶叶消耗记录（纯前端，本地存储） */
(function () {
  'use strict';

  const STORAGE_KEY = 'tea_tracker_v1';
  const DEFAULT_TYPES = ['绿茶', '红茶', '乌龙茶', '白茶', '黑茶', '普洱茶', '花茶', '其他'];

  /* ---------------- 工具 ---------------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function pad(n) { return String(n).padStart(2, '0'); }

  function dateStr(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function todayStr() { return dateStr(new Date()); }
  function parseDate(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function nowTime() {
    const d = new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  function humanDate(s) {
    const d = parseDate(s);
    return d.getMonth() + 1 + '月' + d.getDate() + '日 星期' + WEEK[d.getDay()];
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  /* ---------------- 数据 ---------------- */
  const store = {
    data: null,
    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        this.data = raw ? JSON.parse(raw) : null;
      } catch (e) { this.data = null; }
      if (!this.data || typeof this.data !== 'object') {
        this.data = { teaTypes: DEFAULT_TYPES.slice(), records: {} };
      }
      if (!Array.isArray(this.data.teaTypes) || !this.data.teaTypes.length) {
        this.data.teaTypes = DEFAULT_TYPES.slice();
      }
      if (!this.data.records || typeof this.data.records !== 'object') {
        this.data.records = {};
      }
      this.save();
    },
    save() {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ }
    },
    day(date) {
      if (!this.data.records[date]) {
        this.data.records[date] = { tea: [], water: [] };
      }
      const rec = this.data.records[date];
      if (!rec.tea) rec.tea = [];
      if (!rec.water) rec.water = [];
      return rec;
    },
    teaTotal(date) {
      const r = this.data.records[date];
      if (!r) return 0;
      return r.tea.reduce((s, e) => s + (Number(e.grams) || 0), 0);
    },
    waterTotal(date) {
      const r = this.data.records[date];
      if (!r) return 0;
      return r.water.reduce((s, e) => s + (Number(e.ml) || 0), 0);
    },
    typeUsage() {
      const count = {};
      this.data.teaTypes.forEach((t) => (count[t] = 0));
      Object.values(this.data.records).forEach((r) =>
        (r.tea || []).forEach((e) => { count[e.type] = (count[e.type] || 0) + 1; })
      );
      return count;
    },
    sortedDates(desc) {
      return Object.keys(this.data.records)
        .filter((d) => this.teaTotal(d) > 0 || this.waterTotal(d) > 0)
        .sort((a, b) => (desc ? (a < b ? 1 : -1) : (a > b ? 1 : -1)));
    },
    export() {
      return JSON.stringify(this.data, null, 2);
    },
    import(text) {
      const obj = JSON.parse(text);
      if (!obj || !Array.isArray(obj.teaTypes) || typeof obj.records !== 'object') {
        throw new Error('数据格式不正确');
      }
      this.data = obj;
      if (!this.data.teaTypes.length) this.data.teaTypes = DEFAULT_TYPES.slice();
      this.save();
    },
    reset() {
      this.data = { teaTypes: DEFAULT_TYPES.slice(), records: {} };
      this.save();
    }
  };

  /* ---------------- 状态 ---------------- */
  const state = {
    tab: 'today',
    selectedDate: todayStr(),
    editId: null,    // 编辑中的记录 id
    confirmOk: null, // 确认框回调
    promptOk: null   // 输入框回调
  };

  /* ---------------- Toast ---------------- */
  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 1800);
  }

  /* ---------------- 模态框 ---------------- */
  function openModal(title, bodyHtml) {
    $('#modal-title').textContent = title;
    $('#modal-body').innerHTML = bodyHtml;
    $('#modal').classList.remove('hidden');
  }
  function closeModal() {
    $('#modal').classList.add('hidden');
    state.editId = null;
    state.confirmOk = null;
    state.promptOk = null;
  }

  function openConfirm({ title, message, okText = '确定', danger = false, onOk }) {
    state.confirmOk = onOk;
    openModal(title, `
      <div class="confirm-message">${esc(message)}</div>
      <div class="modal-actions">
        <button class="btn-cancel" data-act="confirm-cancel">取消</button>
        <button class="btn-confirm ${danger ? 'danger' : 'green'}" data-act="confirm-ok">${esc(okText)}</button>
      </div>
    `);
  }

  function openPrompt({ title, label, value = '', placeholder = '', okText = '确定', onOk }) {
    state.promptOk = onOk;
    openModal(title, `
      <div class="field">
        <label>${esc(label)}</label>
        <input id="f-prompt-value" type="text" value="${esc(value)}" placeholder="${esc(placeholder)}">
      </div>
      <div class="modal-actions">
        <button class="btn-cancel" data-act="prompt-cancel">取消</button>
        <button class="btn-confirm green" data-act="prompt-ok">${esc(okText)}</button>
      </div>
    `);
    const inp = $('#f-prompt-value');
    inp.focus();
    inp.select();
  }

  /* ---------------- 标签页 ---------------- */
  function switchTab(tab) {
    state.tab = tab;
    $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    ['today', 'stats', 'types', 'settings'].forEach((t) =>
      $('#view-' + t).classList.toggle('hidden', t !== tab)
    );
    render();
    window.scrollTo(0, 0);
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    if (state.tab === 'today') renderToday();
    else if (state.tab === 'stats') renderStats();
    else if (state.tab === 'types') renderTypes();
    else if (state.tab === 'settings') renderSettings();
  }

  /* ----- 今日 ----- */
  function renderToday() {
    const d = state.selectedDate;
    const isToday = d === todayStr();
    const rec = store.day(d);
    const teaTotal = store.teaTotal(d);
    const waterTotal = store.waterTotal(d);

    const teaEntries = (rec.tea || []).slice().sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const waterEntries = (rec.water || []).slice().sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    const teaHtml = teaEntries.map((e) => entryHtml(e, 'tea')).join('') ||
      '<div class="empty-tip">今天还没有记录茶叶，点击上方「记录茶叶」添加。如果今天没喝茶，请记录饮水～</div>';
    const waterHtml = waterEntries.map((e) => entryHtml(e, 'water')).join('') ||
      '<div class="empty-tip">暂无饮水记录</div>';

    $('#view-today').innerHTML = `
      <div class="date-nav">
        <button class="nav-btn" data-act="prev-day">‹</button>
        <div class="date-title">
          <div class="day">${esc(humanDate(d))}</div>
          <div class="sub">${isToday ? '今天' : d}</div>
        </div>
        <button class="nav-btn" data-act="next-day">›</button>
      </div>
      ${isToday ? '' : '<button class="today-jump" data-act="jump-today">回到今天</button>'}

      <div class="summary-grid">
        <div class="summary-card tea">
          <div class="label">今日茶叶</div>
          <div class="value">${teaTotal.toFixed(1)}<span class="unit"> 克</span></div>
          <div class="hint">共 ${teaEntries.length} 次</div>
        </div>
        <div class="summary-card water">
          <div class="label">今日饮水</div>
          <div class="value">${waterTotal}<span class="unit"> 毫升</span></div>
          <div class="hint">共 ${waterEntries.length} 次</div>
        </div>
      </div>

      <div class="action-row">
        <button class="btn btn-tea" data-act="add-tea">＋ 记录茶叶</button>
        <button class="btn btn-water" data-act="add-water">＋ 记录饮水</button>
      </div>

      <div class="card">
        <div class="section-title">🍃 茶叶记录</div>
        ${teaHtml}
      </div>
      <div class="card">
        <div class="section-title">💧 饮水记录</div>
        ${waterHtml}
      </div>
    `;
  }

  function entryHtml(e, kind) {
    const isTea = kind === 'tea';
    const label = isTea ? esc(e.type) : '饮水';
    const amount = isTea ? (Number(e.grams) || 0).toFixed(1) + '<small> 克</small>'
                          : (Number(e.ml) || 0) + '<small> 毫升</small>';
    const meta = (e.time ? '时间 ' + esc(e.time) + ' · ' : '') + (isTea ? '茶叶' : '饮水');
    return `
      <div class="entry">
        <span class="dot ${isTea ? 'tea-dot' : 'water-dot'}"></span>
        <div class="main">
          <div class="name">${label}</div>
          <div class="meta">${meta}</div>
        </div>
        <div class="amount">${amount}</div>
        <button class="del" data-act="del-entry" data-kind="${kind}" data-id="${e.id}">🗑</button>
      </div>
    `;
  }

  /* ----- 添加茶叶 ----- */
  function openAddTea() {
    const types = store.data.teaTypes;
    const defaultType = types[0] || '';
    state.editId = null;
    openModal('记录茶叶', `
      <div class="field">
        <label>茶叶种类</label>
        <select id="f-type">
          ${types.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>克数（克）</label>
        <input id="f-grams" type="number" inputmode="decimal" min="0" step="0.1" placeholder="例如 5">
        <div class="chips">
          ${[3, 5, 8, 10].map((g) => `<button class="chip" data-val="${g}">${g} 克</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <label>时间（可选）</label>
        <input id="f-time" type="time" value="${nowTime()}">
      </div>
      <div class="modal-actions">
        <button class="btn-cancel" data-act="cancel">取消</button>
        <button class="btn-confirm green" data-act="save-tea">保存</button>
      </div>
    `);

    $('#f-grams').focus();
    $$('#modal-body .chip').forEach((c) => c.addEventListener('click', () => {
      $('#f-grams').value = c.dataset.val;
      $$('#modal-body .chip').forEach((x) => x.classList.remove('active'));
      c.classList.add('active');
    }));
    $('#f-grams').addEventListener('input', () => {
      $$('#modal-body .chip').forEach((x) =>
        x.classList.toggle('active', x.dataset.val === $('#f-grams').value));
    });
  }

  /* ----- 添加饮水 ----- */
  function openAddWater() {
    state.editId = null;
    openModal('记录饮水', `
      <div class="field">
        <label>水量（毫升）</label>
        <input id="f-ml" type="number" inputmode="numeric" min="0" step="10" placeholder="例如 250">
        <div class="chips">
          ${[200, 250, 300, 500].map((m) => `<button class="chip water" data-val="${m}">${m} ml</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <label>时间（可选）</label>
        <input id="f-wtime" type="time" value="${nowTime()}">
      </div>
      <div class="modal-actions">
        <button class="btn-cancel" data-act="cancel">取消</button>
        <button class="btn-confirm blue" data-act="save-water">保存</button>
      </div>
    `);

    $('#f-ml').focus();
    $$('#modal-body .chip').forEach((c) => c.addEventListener('click', () => {
      $('#f-ml').value = c.dataset.val;
      $$('#modal-body .chip').forEach((x) => x.classList.remove('active'));
      c.classList.add('active');
    }));
    $('#f-ml').addEventListener('input', () => {
      $$('#modal-body .chip').forEach((x) =>
        x.classList.toggle('active', x.dataset.val === $('#f-ml').value));
    });
  }

  function saveTea() {
    const type = $('#f-type').value;
    const grams = parseFloat($('#f-grams').value);
    if (!type) return toast('请选择茶叶种类');
    if (!Number.isFinite(grams) || grams <= 0) return toast('请输入有效的克数');
    store.day(state.selectedDate).tea.push({
      id: uid(), type, grams, time: $('#f-time').value || null
    });
    store.save();
    closeModal();
    renderToday();
    toast('已记录茶叶');
  }

  function saveWater() {
    const ml = parseInt($('#f-ml').value, 10);
    if (!Number.isFinite(ml) || ml <= 0) return toast('请输入有效的水量');
    store.day(state.selectedDate).water.push({
      id: uid(), ml, time: $('#f-wtime').value || null
    });
    store.save();
    closeModal();
    renderToday();
    toast('已记录饮水');
  }

  function deleteEntry(kind, id) {
    const rec = store.day(state.selectedDate);
    const arr = kind === 'tea' ? rec.tea : rec.water;
    const idx = arr.findIndex((e) => e.id === id);
    if (idx > -1) {
      arr.splice(idx, 1);
      store.save();
      renderToday();
      toast('已删除');
    }
  }

  /* ----- 统计 ----- */
  function renderStats() {
    const days = store.sortedDates(true);
    const today = todayStr();
    const hasToday = store.teaTotal(today) > 0 || store.waterTotal(today) > 0;

    // 最近 14 天柱状图
    const chartDays = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      chartDays.push(dateStr(d));
    }
    const maxTea = Math.max(1, ...chartDays.map((d) => store.teaTotal(d)));
    const bars = chartDays.map((d) => {
      const v = store.teaTotal(d);
      const h = Math.round((v / maxTea) * 100);
      const label = d.slice(5).replace('-', '/');
      const isT = d === today;
      return `
        <div class="bar-col ${isT ? 'today' : ''}">
          <div class="bar-val">${v > 0 ? v.toFixed(0) : ''}</div>
          <div class="bar ${v > 0 ? '' : 'zero'}" style="height:${Math.max(h, v > 0 ? 6 : 3)}px"></div>
          <div class="bar-label">${label}</div>
        </div>
      `;
    }).join('');

    // 本周合计
    const weekStart = new Date();
    const dow = weekStart.getDay() || 7;
    weekStart.setDate(weekStart.getDate() - (dow - 1));
    let weekTea = 0, weekWater = 0, weekDays = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const s = dateStr(d);
      weekTea += store.teaTotal(s);
      weekWater += store.waterTotal(s);
      if (store.teaTotal(s) > 0 || store.waterTotal(s) > 0) weekDays++;
    }

    const history = days.slice(0, 30).map((d) => {
      const t = store.teaTotal(d);
      const w = store.waterTotal(d);
      const dd = parseDate(d);
      return `
        <div class="history-item" data-act="open-day" data-date="${d}">
          <div class="date">${esc(dd.getMonth() + 1 + '月' + dd.getDate() + '日')}
            <small>星期${WEEK[dd.getDay()]}${d === today ? ' · 今天' : ''}</small>
          </div>
          <div class="totals">
            ${t > 0 ? `<span class="tea">🍃 ${t.toFixed(1)}g</span>` : ''}
            ${w > 0 ? `<span class="water">💧 ${w}ml</span>` : ''}
            ${t === 0 && w === 0 ? '<span>—</span>' : ''}
          </div>
        </div>
      `;
    }).join('');

    $('#view-stats').innerHTML = `
      <div class="card stat-card">
        <div class="section-title">本周（周一至今）</div>
        <div style="display:flex;gap:16px;">
          <div class="big">🍃 ${weekTea.toFixed(1)} <small>克</small></div>
          <div class="big">💧 ${weekWater} <small>毫升</small></div>
          <div class="big">📅 ${weekDays} <small>天有记录</small></div>
        </div>
      </div>
      <div class="card">
        <div class="section-title">近 14 天茶叶消耗（克）</div>
        <div class="bar-chart">${bars}</div>
      </div>
      <div class="card">
        <div class="section-title">历史记录（近 ${Math.min(days.length, 30)} 天）</div>
        ${history || '<div class="empty-tip">还没有任何记录，快去记录第一杯茶吧～</div>'}
        <div class="empty-tip" style="font-size:12px;">点击某天可查看/编辑当天记录</div>
      </div>
    `;
  }

  /* ----- 茶类 ----- */
  function renderTypes() {
    const usage = store.typeUsage();
    const list = store.data.teaTypes.map((t) => `
      <div class="type-item">
        <span class="leaf">🍃</span>
        <div class="info">
          <div class="n">${esc(t)}</div>
          <div class="c">已记录 ${usage[t] || 0} 次</div>
        </div>
        <button class="icon-btn" data-act="rename-type" data-type="${esc(t)}">✎</button>
        <button class="icon-btn danger" data-act="del-type" data-type="${esc(t)}">🗑</button>
      </div>
    `).join('');

    $('#view-types').innerHTML = `
      <div class="card">
        <div class="section-title">我的茶叶种类（${store.data.teaTypes.length}）</div>
        ${list}
      </div>
      <div class="card">
        <div class="section-title">添加新茶类</div>
        <div class="add-type-row">
          <input id="new-type" placeholder="例如：铁观音">
          <button data-act="add-type">添加</button>
        </div>
      </div>
    `;
  }

  function addType() {
    const input = $('#new-type');
    const name = input.value.trim();
    if (!name) return toast('请输入茶类名称');
    if (store.data.teaTypes.includes(name)) return toast('该茶类已存在');
    store.data.teaTypes.push(name);
    store.save();
    renderTypes();
    toast('已添加「' + name + '」');
  }

  function renameType(oldName) {
    openPrompt({
      title: '修改茶类名称',
      label: '名称',
      value: oldName,
      okText: '保存',
      onOk: (name) => {
        const trimmed = String(name).trim();
        if (!trimmed) return toast('名称不能为空');
        if (trimmed !== oldName && store.data.teaTypes.includes(trimmed)) return toast('该茶类已存在');
        const idx = store.data.teaTypes.indexOf(oldName);
        if (idx > -1) store.data.teaTypes[idx] = trimmed;
        // 同步历史记录中的名称
        Object.values(store.data.records).forEach((r) =>
          (r.tea || []).forEach((e) => { if (e.type === oldName) e.type = trimmed; }));
        store.save();
        renderTypes();
        toast('已重命名');
      }
    });
  }

  function deleteType(name) {
    const used = Object.values(store.data.records).some((r) =>
      (r.tea || []).some((e) => e.type === name));
    openConfirm({
      title: '删除茶类',
      message: used
        ? `「${name}」已有 ${store.typeUsage()[name]} 条记录，删除后这些记录的类型仍会保留，但无法再新增该茶类。确定删除吗？`
        : `确定删除「${name}」吗？`,
      okText: '删除',
      danger: true,
      onOk: () => {
        store.data.teaTypes = store.data.teaTypes.filter((t) => t !== name);
        store.save();
        renderTypes();
        toast('已删除');
      }
    });
  }

  /* ----- 设置 ----- */
  function renderSettings() {
    $('#view-settings').innerHTML = `
      <div class="card">
        <div class="section-title">数据</div>
        <div class="setting-row" data-act="export">
          <div><div class="s-label">导出数据</div><div class="s-desc">下载 JSON 备份文件</div></div>
          <span class="chevron">›</span>
        </div>
        <div class="setting-row" data-act="import">
          <div><div class="s-label">导入数据</div><div class="s-desc">从 JSON 备份恢复</div></div>
          <span class="chevron">›</span>
        </div>
        <div class="setting-row danger" data-act="reset">
          <div><div class="s-label">清空所有数据</div><div class="s-desc">不可恢复，请先导出备份</div></div>
          <span class="chevron">›</span>
        </div>
      </div>
      <div class="card">
        <div class="section-title">关于</div>
        <div class="setting-row" style="cursor:default;">
          <div><div class="s-label">茶记 🍵</div>
          <div class="s-desc">记录每天消耗的茶叶克数与饮水毫升数。数据仅保存在本机浏览器，离线可用。</div></div>
        </div>
      </div>
    `;
  }

  function exportData() {
    const json = store.export();
    openModal('导出数据', `
      <div class="field">
        <label>备份内容（JSON）</label>
        <textarea id="f-export" class="export-area" readonly rows="9">${esc(json)}</textarea>
      </div>
      <div class="modal-actions">
        <button class="btn-cancel" data-act="export-copy">复制</button>
        <button class="btn-confirm green" data-act="export-download">下载文件</button>
      </div>
    `);
  }

  function copyExport() {
    const ta = $('#f-export');
    const text = ta.value;
    const done = () => toast('已复制到剪贴板');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => {
        ta.select(); try { document.execCommand('copy'); } catch (e) {}
        done();
      });
    } else {
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      done();
    }
  }

  function downloadExport() {
    const blob = new Blob([store.export()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '茶记备份-' + todayStr() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('已触发下载');
  }

  function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          store.import(reader.result);
          state.selectedDate = todayStr();
          render();
          toast('导入成功');
        } catch (e) {
          toast('导入失败：' + e.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function resetData() {
    openConfirm({
      title: '清空所有数据',
      message: '确定清空所有数据吗？此操作不可恢复。建议先导出备份。',
      okText: '清空',
      danger: true,
      onOk: () => {
        store.reset();
        render();
        toast('已清空');
      }
    });
  }

  /* ---------------- 事件委托 ---------------- */
  document.addEventListener('click', (e) => {
    const actEl = e.target.closest('[data-act]');
    if (actEl) {
      const act = actEl.dataset.act;
      switch (act) {
        case 'prev-day': {
          const d = parseDate(state.selectedDate);
          d.setDate(d.getDate() - 1);
          state.selectedDate = dateStr(d);
          renderToday(); break;
        }
        case 'next-day': {
          const d = parseDate(state.selectedDate);
          d.setDate(d.getDate() + 1);
          state.selectedDate = dateStr(d);
          renderToday(); break;
        }
        case 'jump-today':
          state.selectedDate = todayStr(); renderToday(); break;
        case 'add-tea': openAddTea(); break;
        case 'add-water': openAddWater(); break;
        case 'del-entry': deleteEntry(actEl.dataset.kind, actEl.dataset.id); break;
        case 'cancel': closeModal(); break;
        case 'confirm-cancel': closeModal(); break;
        case 'confirm-ok': {
          const cb = state.confirmOk;
          closeModal();
          if (cb) cb();
          break;
        }
        case 'prompt-cancel': closeModal(); break;
        case 'prompt-ok': {
          const cb = state.promptOk;
          const val = $('#f-prompt-value') ? $('#f-prompt-value').value : '';
          closeModal();
          if (cb) cb(val);
          break;
        }
        case 'export-copy': copyExport(); break;
        case 'export-download': downloadExport(); break;
        case 'save-tea': saveTea(); break;
        case 'save-water': saveWater(); break;
        case 'open-day':
          state.selectedDate = actEl.dataset.date;
          switchTab('today'); break;
        case 'add-type': addType(); break;
        case 'rename-type': renameType(actEl.dataset.type); break;
        case 'del-type': deleteType(actEl.dataset.type); break;
        case 'export': exportData(); break;
        case 'import': importData(); break;
        case 'reset': resetData(); break;
      }
      return;
    }

    if (e.target.closest('#modal-close')) closeModal();
    if (e.target.closest('.modal-backdrop') && e.target.classList.contains('modal-backdrop')) closeModal();
  });

  // 标签页切换
  $$('.tab').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

  // 键盘：回车快捷保存
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const modal = $('#modal');
      if (modal.classList.contains('hidden')) return;
      if (e.target.id === 'f-grams') saveTea();
      else if (e.target.id === 'f-ml') saveWater();
      else if (e.target.id === 'f-prompt-value') {
        const cb = state.promptOk;
        const val = e.target.value;
        closeModal();
        if (cb) cb(val);
      }
    }
    if (e.key === 'Escape') closeModal();
  });

  // 新茶类回车
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target && e.target.id === 'new-type') addType();
  });

  /* ---------------- PWA 安装 ---------------- */
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    $('#installBtn').classList.remove('hidden');
  });
  $('#installBtn').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $('#installBtn').classList.add('hidden');
  });

  const IS_NATIVE = typeof window.Capacitor !== 'undefined';
  if ('serviceWorker' in navigator && !IS_NATIVE) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => { /* 本地打开 file:// 时忽略 */ });
    });
  }

  /* ---------------- 启动 ---------------- */
  store.load();
  render();
})();

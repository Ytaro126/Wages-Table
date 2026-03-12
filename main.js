/**
 * ============================================================
 * main.js — 配達記録アプリ v2
 *
 * 改善一覧:
 *  ① 計算モードを日ごとにラジオ選択（グローバル排他廃止）
 *  ② リアルタイム金額プレビュー
 *  ③ カレンダーセルは税抜1行 + ドット（③⑦統合）
 *  ④ 月合計に前月比表示
 *  ⑤ 前回値クイック入力ボタン
 *  ⑥ 削除ボタン2段階確認（誤削除防止）
 *  ⑦ カレンダードットインジケーター（③に統合）
 *  ⑧ CSVエクスポート
 *  ⑨ ±ステッパーボタン
 * ============================================================ */

'use strict';

/* ────────────────────────────────────────────────────────────
   1. 定数・状態管理
──────────────────────────────────────────────────────────── */

const STORAGE_KEY = "delivery-wage-app-v1";

/**
 * アプリの状態
 *
 * currentMode : 入力フォームで現在選択中のモード（'feature1'|'feature2'|null）
 *               ① 旧: feature1Enabled/feature2Enabled（グローバル）→ 廃止
 *               各レコードに mode を持つため、この値はフォームのUI状態のみ担う
 */
let state = {
  records:           [],
  currentMode:       null,       // ① フォームで選択中のモード
  monthlyDeductions: {},
  selectedDate:      null,
  viewYear:          new Date().getFullYear(),
  viewMonth:         new Date().getMonth(),
};

/* ────────────────────────────────────────────────────────────
   2. 計算系関数
──────────────────────────────────────────────────────────── */

/** 機能1 金額（税抜） */
function calcFeature1(count) {
  if (count <= 80) return 14000;
  return 14000 + (count - 80) * 110;
}

/** 税込計算（10%加算、端数は四捨五入） */
function addTax(value) {
  return Math.round(value * 1.1);
}

/** レコードの税抜合計 */
function calcRecordTaxEx(rec) {
  let base = 0;
  if (rec.mode === 'feature1') base = calcFeature1(rec.count);
  else if (rec.mode === 'feature2') base = rec.count * 150;

  return base + rec.count170 * 170 + rec.pickupCount * 90 + rec.otherIncome;
}

/** レコードの税込合計 */
function calcRecordTaxIn(rec) {
  let base = 0;
  if (rec.mode === 'feature1') base = addTax(calcFeature1(rec.count));
  else if (rec.mode === 'feature2') base = rec.count * 165;

  return base + rec.count170 * 187 + rec.pickupCount * 90 + rec.otherIncome;
}

/** 指定年月のレコード配列を返す */
function getMonthRecords(year, month) {
  const prefix = toMonthKey(year, month);
  return state.records.filter(r => r.date.startsWith(prefix));
}

/**
 * 指定年月の合計を計算して返す
 * ④ 前月比の計算でも使うため、前月も同じ関数で計算する
 */
function calcMonthlyTotals(year, month) {
  const recs = getMonthRecords(year, month);
  let totalCount = 0, total170 = 0, totalPickup = 0, totalOther = 0;
  let totalF1 = 0, totalF2Ex = 0, totalF2In = 0;
  let totalEx = 0, totalIn = 0;

  recs.forEach(r => {
    totalCount  += r.count;
    total170    += r.count170;
    totalPickup += r.pickupCount;
    totalOther  += r.otherIncome;
    if (r.mode === 'feature1') { const f = calcFeature1(r.count); totalF1 += f; }
    else if (r.mode === 'feature2') { totalF2Ex += r.count * 150; totalF2In += r.count * 165; }
    totalEx += calcRecordTaxEx(r);
    totalIn += calcRecordTaxIn(r);
  });

  const deduction = state.monthlyDeductions[toMonthKey(year, month)] || 0;
  return {
    totalCount, total170, totalPickup, totalOther,
    totalF1, totalF2Ex, totalF2In,
    totalEx, totalIn,
    deduction,
    finalEx: totalEx - deduction,
    finalIn: totalIn - deduction,
  };
}

/* ────────────────────────────────────────────────────────────
   3. 保存・読み込み系
──────────────────────────────────────────────────────────── */

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { console.warn('保存失敗:', e); }
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    state = { ...state, ...saved };

    // ① 旧バージョンとの互換性: feature1Enabled/feature2Enabled → currentMode に移行
    if (saved.feature1Enabled === true && !saved.currentMode) state.currentMode = 'feature1';
    else if (saved.feature2Enabled === true && !saved.currentMode) state.currentMode = 'feature2';
    // 旧キーは使わない（saveState で上書きされる）
  } catch (e) {
    console.error('データ読み込み失敗:', e);
  }
}

/* ────────────────────────────────────────────────────────────
   4. 描画系関数
──────────────────────────────────────────────────────────── */

/**
 * カレンダーを描画する
 * ③ セルは「税抜金額のみ1行」に整理
 * ⑦ 記録ありの日にドットインジケーターを表示
 */
function renderCalendar() {
  const { viewYear, viewMonth, selectedDate } = state;
  document.getElementById('monthTitle').textContent = `${viewYear}年${viewMonth + 1}月`;

  const grid = document.getElementById('calendarGrid');
  grid.innerHTML = '';

  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const lastDate        = new Date(viewYear, viewMonth + 1, 0).getDate();

  // 空白セル
  for (let i = 0; i < firstDayOfWeek; i++) {
    const blank = document.createElement('div');
    blank.className = 'cal-cell cal-blank';
    grid.appendChild(blank);
  }

  // 日付セル
  for (let d = 1; d <= lastDate; d++) {
    const dateStr = toDateStr(viewYear, viewMonth, d);
    const rec     = state.records.find(r => r.date === dateStr);

    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    if (dateStr === selectedDate) cell.classList.add('selected');

    // 日付番号
    const dayNum = document.createElement('span');
    dayNum.className   = 'cal-day-num';
    dayNum.textContent = d;
    cell.appendChild(dayNum);

    if (rec) {
      // ⑦ ドットインジケーター
      const dot = document.createElement('span');
      dot.className = 'cal-dot';
      cell.appendChild(dot);

      // ③ 税抜金額のみ1行表示（税込はモーダルへ）
      const ex         = calcRecordTaxEx(rec);
      const amountDiv  = document.createElement('div');
      amountDiv.className = 'cal-amount';

      const exSpan = document.createElement('span');
      exSpan.className   = 'cal-tax-ex';
      exSpan.textContent = yen(ex);
      amountDiv.appendChild(exSpan);

      cell.appendChild(amountDiv);
    }

    // セルタップ → 日付選択
    cell.addEventListener('click', () => {
      // 既に選択中の日付をタップしたら詳細を開く
      if (state.selectedDate === dateStr) {
        if (rec) showMemoModal(rec);
        return;
      }
      state.selectedDate = dateStr;
      saveState();
      renderCalendar();
      syncFormFromSelectedDate();
    });

    grid.appendChild(cell);
  }
}

/**
 * 選択日のレコードをフォームに反映する
 * ① レコードのモードをラジオボタンに反映
 * ② プレビューも更新する
 */
function syncFormFromSelectedDate() {
  const { selectedDate } = state;
  document.getElementById('selectedDateDisplay').value = selectedDate || '';

  const rec = selectedDate ? state.records.find(r => r.date === selectedDate) : null;

  document.getElementById('inputCount').value    = rec ? rec.count       : '';
  document.getElementById('inputCount170').value = rec ? rec.count170    : '';
  document.getElementById('inputPickup').value   = rec ? rec.pickupCount : '';
  document.getElementById('inputOther').value    = rec ? rec.otherIncome : '';

  // ① レコードのモードがあればラジオに反映、なければ currentMode を保持
  if (rec) {
    state.currentMode = rec.mode;
    saveState();
  }
  renderModeRadio();
  updatePreview(); // ② プレビュー更新
}

/**
 * ① ラジオボタンを state.currentMode に合わせて更新する
 */
function renderModeRadio() {
  const r1 = document.getElementById('modeFeature1');
  const r2 = document.getElementById('modeFeature2');
  if (r1) r1.checked = state.currentMode === 'feature1';
  if (r2) r2.checked = state.currentMode === 'feature2';
}

/**
 * ② リアルタイムプレビューを更新する
 * モードと入力値から予想金額を計算して表示
 */
function updatePreview() {
  const previewEl = document.getElementById('calcPreview');
  const mode = getSelectedMode();

  if (!mode) {
    previewEl.innerHTML = '';
    return;
  }

  const mockRec = {
    count:       parseInputInt('inputCount'),
    count170:    parseInputInt('inputCount170'),
    pickupCount: parseInputInt('inputPickup'),
    otherIncome: parseInputInt('inputOther'),
    mode,
  };

  const ex  = calcRecordTaxEx(mockRec);
  const inc = calcRecordTaxIn(mockRec);

  previewEl.innerHTML =
    `<span class="preview-label">本日の予想合計</span>` +
    `<span class="preview-ex">${yen(ex)}</span>` +
    `<span class="preview-sep">/</span>` +
    `<span class="preview-in">(${yen(inc)})</span>`;
}

/**
 * 月合計を描画する
 * ④ 前月比を追加表示
 */
function renderMonthlyTotals() {
  const { viewYear, viewMonth } = state;
  const t = calcMonthlyTotals(viewYear, viewMonth);

  // ④ 前月を計算
  const prevMonth = viewMonth === 0 ? 11 : viewMonth - 1;
  const prevYear  = viewMonth === 0 ? viewYear - 1 : viewYear;
  const pt = calcMonthlyTotals(prevYear, prevMonth);
  const diffEx = t.finalEx - pt.finalEx;
  const diffIn = t.finalIn - pt.finalIn;

  // 前月比の表示用ヘルパー
  const compareClass = (diff) => diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  const compareSign  = (diff) => diff > 0 ? '+' : '';
  const compareArrow = (diff) => diff > 0 ? '↑' : diff < 0 ? '↓' : '→';

  // 行ヘルパー
  const row = (label, value, mod = '') => {
    const cls = mod ? `total-row total-row--${mod}` : 'total-row';
    return `<div class="${cls}">
      <span class="total-label">${label}</span>
      <span class="total-value">${value}</span>
    </div>`;
  };

  const container = document.getElementById('monthlyTotals');
  container.innerHTML =
    row('配達完了数',         `${t.totalCount} 件`) +
    row('夜間配達',          `${t.total170} 件`) +
    row('集荷枠',             `${t.totalPickup} 件`) +
    row('その他収入',         yen(t.totalOther)) +
    `<div class="total-divider"></div>` +
    row('機能1 合計',         yen(t.totalF1)) +
    row('機能2 合計',         `${yen(t.totalF2Ex)} / (${yen(t.totalF2In)})`) +
    `<div class="total-divider"></div>` +
    row('小計（税抜 / 税込）',`${yen(t.totalEx)} / (${yen(t.totalIn)})`) +
    row('固定控除',           `－${yen(t.deduction)}`) +
    `<div class="total-divider"></div>` +
    row('最終合計（税抜）',   yen(t.finalEx), 'final') +
    row('最終合計（税込）',   yen(t.finalIn), 'final') +
    // ④ 前月比
    `<div class="total-row total-row--compare">
      <span class="total-label">前月比（税抜 / 税込）</span>
      <span class="compare-value ${compareClass(diffEx)}">
        ${compareSign(diffEx)}${yen(diffEx)} ${compareArrow(diffEx)}
        &nbsp;/&nbsp;
        ${compareSign(diffIn)}${yen(diffIn)} ${compareArrow(diffIn)}
      </span>
    </div>`;
}

/**
 * 記録一覧テーブルを描画する
 * ⑥ 削除ボタンは2段階確認（1回目→確認状態、2回目→実行）
 */
function renderTable() {
  const recs = getMonthRecords(state.viewYear, state.viewMonth);
  const tbody = document.getElementById('recordsBody');
  tbody.innerHTML = '';

  if (recs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="table-empty">記録がありません</td></tr>';
    return;
  }

  recs.sort((a, b) => a.date.localeCompare(b.date));

  recs.forEach(rec => {
    const ex  = calcRecordTaxEx(rec);
    const inc = calcRecordTaxIn(rec);
    const f1  = rec.mode === 'feature1' ? yen(calcFeature1(rec.count)) : '—';
    const f2  = rec.mode === 'feature2' ? yen(rec.count * 150)         : '—';

    const tr = document.createElement('tr');

    // データセル
    const dataCells = [
      rec.date.slice(5).replace('-', '/'),
      rec.count,
      rec.count170,
      rec.pickupCount,
      yen(rec.otherIncome),
      f1, f2,
      yen(ex),
      yen(inc),
    ];
    dataCells.forEach(val => {
      const td = document.createElement('td');
      td.textContent = val;
      tr.appendChild(td);
    });

    // ⑥ 削除ボタン（2段階確認）
    const deleteTd  = document.createElement('td');
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete';
    deleteBtn.textContent = '✕';
    deleteBtn.setAttribute('aria-label', `${rec.date}を削除`);

    let armed    = false;
    let armTimer = null;

    deleteBtn.addEventListener('click', () => {
      if (armed) {
        // 2回目タップ: 削除実行
        clearTimeout(armTimer);
        state.records = state.records.filter(r => r.date !== rec.date);
        if (state.selectedDate === rec.date) state.selectedDate = null;
        saveState();
        renderAll();
      } else {
        // 1回目タップ: 確認状態へ
        armed = true;
        deleteBtn.textContent = '確認';
        deleteBtn.classList.add('btn-delete--armed');
        // 3秒後に自動リセット
        armTimer = setTimeout(() => {
          armed = false;
          deleteBtn.textContent = '✕';
          deleteBtn.classList.remove('btn-delete--armed');
        }, 3000);
      }
    });

    deleteTd.appendChild(deleteBtn);
    tr.appendChild(deleteTd);
    tbody.appendChild(tr);
  });
}

/** 控除額入力欄を表示月のデータで更新 */
function renderDeductionInput() {
  const val = state.monthlyDeductions[toMonthKey(state.viewYear, state.viewMonth)];
  document.getElementById('inputDeduction').value = val !== undefined ? val : '';
}

/** 全体を再描画する */
function renderAll() {
  renderCalendar();
  renderMonthlyTotals();
  renderTable();
  renderModeRadio();
  renderDeductionInput();
  syncFormFromSelectedDate(); // ← 内部で updatePreview も呼ばれる
}

/* ────────────────────────────────────────────────────────────
   5. モーダル制御
──────────────────────────────────────────────────────────── */

/** 日別詳細モーダルを表示する（税込も含む全情報） */
function showMemoModal(rec) {
  const ex  = calcRecordTaxEx(rec);
  const inc = calcRecordTaxIn(rec);

  document.getElementById('memoTitle').textContent = `${rec.date} の記録`;

  const memoRow = (label, value, mod = '') => {
    const cls = mod ? `memo-row memo-row--${mod}` : 'memo-row';
    return `<div class="${cls}">
      <span class="memo-label">${label}</span>
      <span class="memo-value">${value}</span>
    </div>`;
  };

  document.getElementById('memoBody').innerHTML =
    memoRow('配達完了数',   `${rec.count} 件`) +
    memoRow('夜間配達枠', `${rec.count170} 件`) +
    memoRow('集荷枠',       `${rec.pickupCount} 件`) +
    memoRow('その他収入',   yen(rec.otherIncome)) +
    memoRow('計算モード',   rec.mode === 'feature1' ? '機能1' : '機能2') +
    memoRow('合計（税抜）', yen(ex),  'total') +
    memoRow('合計（税込）', yen(inc), 'total');

  document.getElementById('memoModal').classList.remove('hidden');
}

/** 年月ピッカーを表示する */
function showPickerModal() {
  const yearSel  = document.getElementById('pickerYear');
  const monthSel = document.getElementById('pickerMonth');

  yearSel.innerHTML = '';
  for (let y = 2025; y <= 2030; y++) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = `${y}年`;
    if (y === state.viewYear) opt.selected = true;
    yearSel.appendChild(opt);
  }

  monthSel.innerHTML = '';
  for (let m = 0; m < 12; m++) {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = `${m + 1}月`;
    if (m === state.viewMonth) opt.selected = true;
    monthSel.appendChild(opt);
  }

  document.getElementById('pickerModal').classList.remove('hidden');
}

/* ────────────────────────────────────────────────────────────
   6. イベント登録
──────────────────────────────────────────────────────────── */

function setupEvents() {

  // ── 月切り替え ──
  document.getElementById('prevMonth').addEventListener('click', () => goMonth(-1));
  document.getElementById('nextMonth').addEventListener('click', () => goMonth(1));
  document.getElementById('monthTitle').addEventListener('click', showPickerModal);

  // ── ピッカー ──
  document.getElementById('pickerConfirm').addEventListener('click', () => {
    state.viewYear  = parseInt(document.getElementById('pickerYear').value,  10);
    state.viewMonth = parseInt(document.getElementById('pickerMonth').value, 10);
    saveState();
    renderAll();
    document.getElementById('pickerModal').classList.add('hidden');
  });
  ['pickerCancel', 'pickerOverlay'].forEach(id => {
    document.getElementById(id).addEventListener('click', () => {
      document.getElementById('pickerModal').classList.add('hidden');
    });
  });

  // ── メモモーダル閉じる ──
  ['memoClose', 'memoOverlay'].forEach(id => {
    document.getElementById(id).addEventListener('click', () => {
      document.getElementById('memoModal').classList.add('hidden');
    });
  });

  // ── ① モードラジオボタン ──
  document.querySelectorAll('input[name="mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      state.currentMode = e.target.value;
      saveState();
      updatePreview(); // ② プレビュー即時更新
    });
  });

  // ── ② プレビュー: テキスト入力のたびに更新 ──
  ['inputCount', 'inputCount170', 'inputPickup', 'inputOther'].forEach(id => {
    document.getElementById(id).addEventListener('input', updatePreview);
  });

  // ── ⑨ ステッパーボタン（formSection 内の全ボタンにまとめて対応）──
  document.getElementById('formSection').addEventListener('click', handleStepperClick);
  // 控除額のステッパーは formSection の外なので別途登録
  document.querySelector('#formSection ~ .section .stepper-wrap') &&
    document.querySelectorAll('.stepper-btn').forEach(btn => {
      if (!btn.closest('#formSection')) {
        btn.addEventListener('click', handleStepperClick);
      }
    });

  // ── ⑨ 控除額セクションのステッパーもまとめて処理 ──
  document.querySelectorAll('.stepper-btn').forEach(btn => {
    if (!btn.closest('#formSection')) {
      btn.addEventListener('click', handleStepperClick);
    }
  });

  // ── 「この日に記録」ボタン ──
  document.getElementById('saveRecord').addEventListener('click', saveRecord);

  // ── ⑤ 前回値を使う ──
  document.getElementById('fillPrev').addEventListener('click', fillPrevRecord);

  // ── 控除額保存 ──
  document.getElementById('saveDeduction').addEventListener('click', () => {
    const monthKey = toMonthKey(state.viewYear, state.viewMonth);
    state.monthlyDeductions[monthKey] = parseInputInt('inputDeduction');
    saveState();
    renderMonthlyTotals();
    showMessage('控除額を保存しました', 'success', 'formMessage');
  });

  // ── ⑧ CSVエクスポート ──
  document.getElementById('exportCsv').addEventListener('click', exportCSV);

  // ── カレンダースワイプ ──
  setupSwipe();
}

/**
 * ⑨ ステッパーボタンのクリック処理（共通ハンドラ）
 * data-target に input の id、data-delta に変化量を指定
 */
function handleStepperClick(e) {
  const btn = e.target.closest('.stepper-btn');
  if (!btn) return;

  const targetId = btn.dataset.target;
  const delta    = parseInt(btn.dataset.delta, 10);
  if (!targetId || isNaN(delta)) return;

  const input   = document.getElementById(targetId);
  if (!input)   return;

  const current = parseInt(input.value, 10) || 0;
  const newVal  = Math.max(0, current + delta);
  input.value   = newVal;

  // 配達関連の入力なら即プレビュー更新
  if (['inputCount', 'inputCount170', 'inputPickup', 'inputOther'].includes(targetId)) {
    updatePreview();
  }
}

/**
 * 「この日に記録」保存処理
 * ① モードをラジオボタンから取得（日ごとに異なってよい）
 */
function saveRecord() {
  clearMessage('formMessage');

  // バリデーション
  if (!state.selectedDate) {
    showMessage('日付を選択してください', 'error', 'formMessage');
    return;
  }
  const mode = getSelectedMode();
  if (!mode) {
    showMessage('計算モード（機能1 または 機能2）を選択してください', 'error', 'formMessage');
    return;
  }

  const newRecord = {
    date:        state.selectedDate,
    count:       parseInputInt('inputCount'),
    count170:    parseInputInt('inputCount170'),
    pickupCount: parseInputInt('inputPickup'),
    otherIncome: parseInputInt('inputOther'),
    mode,
  };

  const idx = state.records.findIndex(r => r.date === state.selectedDate);
  if (idx >= 0) state.records[idx] = newRecord;
  else          state.records.push(newRecord);

  saveState();
  renderAll();
  showMessage('保存しました', 'success', 'formMessage');
}

/**
 * ⑤ 直前の記録値をフォームに展開する
 * selectedDate より前で最も新しいレコードを探す
 */
function fillPrevRecord() {
  if (!state.selectedDate) {
    showMessage('先に日付を選択してください', 'error', 'formMessage');
    return;
  }

  // selectedDate より前のレコードを日付降順で並べ、最初の1件を取る
  const prev = state.records
    .filter(r => r.date < state.selectedDate)
    .sort((a, b) => b.date.localeCompare(a.date))[0];

  if (!prev) {
    showMessage('前の記録が見つかりません', 'error', 'formMessage');
    return;
  }

  document.getElementById('inputCount').value    = prev.count;
  document.getElementById('inputCount170').value = prev.count170;
  document.getElementById('inputPickup').value   = prev.pickupCount;
  document.getElementById('inputOther').value    = prev.otherIncome;

  // ① モードも前回に合わせる
  state.currentMode = prev.mode;
  renderModeRadio();

  updatePreview(); // ② プレビュー更新
  showMessage(`${prev.date} の値を適用しました`, 'success', 'formMessage');
}

/**
 * ⑧ 表示中の月のレコードをCSVとしてダウンロードする
 * BOM付きUTF-8でExcelでも文字化けしない
 */
function exportCSV() {
  const { viewYear, viewMonth } = state;
  const recs = getMonthRecords(viewYear, viewMonth).sort((a, b) => a.date.localeCompare(b.date));

  if (recs.length === 0) {
    showMessage('この月の記録がありません', 'error', 'formMessage');
    return;
  }

  const headers = ['日付', '配達数', '夜間', '集荷', 'その他収入', 'モード', '合算(税抜)', '合算(税込)'];
  const rows = recs.map(r => [
    r.date,
    r.count,
    r.count170,
    r.pickupCount,
    r.otherIncome,
    r.mode === 'feature1' ? '機能1' : '機能2',
    calcRecordTaxEx(r),
    calcRecordTaxIn(r),
  ]);

  const csv  = [headers, ...rows].map(row => row.join(',')).join('\n');
  const bom  = '\uFEFF'; // BOM: ExcelでのUTF-8文字化け防止
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);

  const a       = document.createElement('a');
  a.href        = url;
  a.download    = `delivery-${toMonthKey(viewYear, viewMonth)}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  showMessage('CSVをダウンロードしました', 'success', 'formMessage');
}

/**
 * 月を n ヶ月移動してアニメーション付きで再描画する
 * @param {number} delta - 移動量（-1 = 前月, +1 = 翌月）
 */
function goMonth(delta) {
  let m = state.viewMonth + delta;
  let y = state.viewYear;
  if (m > 11) { m = 0;  y++; }
  if (m < 0)  { m = 11; y--; }
  state.viewMonth = m;
  state.viewYear  = y;
  saveState();
  renderAll();

  // スワイプアニメーションを付与
  const wrapper   = document.getElementById('calendarSwipe');
  const animClass = delta > 0 ? 'swipe-next' : 'swipe-prev';
  wrapper.classList.remove('swipe-next', 'swipe-prev');
  requestAnimationFrame(() => {
    wrapper.classList.add(animClass);
    wrapper.addEventListener('animationend', () => {
      wrapper.classList.remove(animClass);
    }, { once: true });
  });
}

/**
 * カレンダー領域のタッチスワイプで月切り替え
 * 水平移動が垂直移動より大きく、かつ50px以上でスワイプと判定
 */
function setupSwipe() {
  const wrapper = document.getElementById('calendarSwipe');
  let startX = 0, startY = 0;

  wrapper.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  wrapper.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      goMonth(dx < 0 ? 1 : -1);
    }
  }, { passive: true });
}

/* ────────────────────────────────────────────────────────────
   7. ユーティリティ
──────────────────────────────────────────────────────────── */

/** 数値を円表記に変換: 13200 → '¥13,200' */
function yen(n) {
  return '¥' + Math.round(n).toLocaleString('ja-JP');
}

/** 年月日 → 'YYYY-MM-DD' */
function toDateStr(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** 年月 → 'YYYY-MM'（localStorage キー用） */
function toMonthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

/** input 要素の値を 0以上の整数で返す（空欄・不正値は 0） */
function parseInputInt(id) {
  const v = parseInt(document.getElementById(id).value, 10);
  return (isNaN(v) || v < 0) ? 0 : v;
}

/** ① ラジオボタンから現在選択中のモードを返す */
function getSelectedMode() {
  const r1 = document.getElementById('modeFeature1');
  const r2 = document.getElementById('modeFeature2');
  if (r1 && r1.checked) return 'feature1';
  if (r2 && r2.checked) return 'feature2';
  return null;
}

/**
 * メッセージを表示して 2秒後に消す
 * @param {string} text     - 表示テキスト
 * @param {'error'|'success'} type - 表示種別
 * @param {string} targetId - 表示先要素の id
 */
function showMessage(text, type, targetId) {
  const el = document.getElementById(targetId);
  el.textContent = text;
  el.className   = `form-message ${type}`;
  setTimeout(() => {
    if (el.textContent === text) clearMessage(targetId);
  }, 2000);
}

/** メッセージをクリアする */
function clearMessage(targetId) {
  const el = document.getElementById(targetId);
  el.textContent = '';
  el.className   = 'form-message';
}

/* ────────────────────────────────────────────────────────────
   8. 初期化
──────────────────────────────────────────────────────────── */

function init() {
  loadState();
  setupEvents();
  renderAll();
}

document.addEventListener('DOMContentLoaded', init);

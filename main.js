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
// strictモード: うっかりミス（未宣言変数など）を防ぐための安全装置

/* ────────────────────────────────────────────────────────────
   1. 定数・状態管理
──────────────────────────────────────────────────────────── */

const STORAGE_KEY = "delivery-wage-app-v1";
// localStorageに保存するときの「箱の名前」。変えると別データ扱いになる。

/**
 * アプリの状態
 *
 * records: 日別データの配列
 * 例:
 * { date: '2026-03-12', count: 80, count170: 2, pickupCount: 1, otherIncome: 0, mode: 'feature1' }
 *
 * currentMode : 設定画面で選ぶ「新規記録のモード」（'feature1'|'feature2'|'feature3'|null）
 *               既存レコードの mode は変更しない（過去記録は固定）
 */
let state = {
  records:           [],
  currentMode:       null,       // ① フォームで選択中のモード
  monthlyDeductions: {},
  selectedDate:      null,
  viewYear:          new Date().getFullYear(),
  viewMonth:         new Date().getMonth(),
  theme:             'dark',
  chartYear:         new Date().getFullYear(),
};

/* ────────────────────────────────────────────────────────────
   2. 計算系関数
──────────────────────────────────────────────────────────── */

/** 機能1 金額（税抜） */
function calcFeature1(count) {
  // 80以下は一律14,000円。81以上は超過分×110円を加算。
  if (count <= 80) return 14000;
  return 14000 + (count - 80) * 110;
}

/** 税込計算（10%加算、端数は四捨五入） */
function addTax(value) {
  // 税込は税抜×1.1。Math.roundで四捨五入。
  return Math.round(value * 1.1);
}

/** レコードの税抜合計 */
function calcRecordTaxEx(rec) {
  // 計算モードで配達単価が変わる
  let base = 0;
  if (rec.mode === 'feature1') base = calcFeature1(rec.count);
  else if (rec.mode === 'feature2') base = rec.count * 150;
  else if (rec.mode === 'feature3') base = rec.count * 160;

  // 夜間配達(170円)・集荷(90円)・その他収入は税抜に加算
  return base + rec.count170 * 170 + rec.pickupCount * 90 + rec.otherIncome;
}

/** レコードの税込合計 */
function calcRecordTaxIn(rec) {
  // 税込側は機能1のみ10%加算が必要
  let base = 0;
  if (rec.mode === 'feature1') base = addTax(calcFeature1(rec.count));
  else if (rec.mode === 'feature2') base = rec.count * 165;
  else if (rec.mode === 'feature3') base = rec.count * 176;

  // 夜間配達は税込187円、集荷とその他は税込同額で加算
  return base + rec.count170 * 187 + rec.pickupCount * 90 + rec.otherIncome;
}

/** 指定年月のレコード配列を返す */
function getMonthRecords(year, month) {
  // YYYY-MM の接頭辞でフィルタする
  const prefix = toMonthKey(year, month);
  return state.records.filter(r => r.date.startsWith(prefix));
}

/**
 * 指定年月の合計を計算して返す
 * ④ 前月比の計算でも使うため、前月も同じ関数で計算する
 */
function calcMonthlyTotals(year, month) {
  // 月内レコードを集めて合計値を作る
  const recs = getMonthRecords(year, month);
  let totalCount = 0, total170 = 0, totalPickup = 0, totalOther = 0;
  let totalF1 = 0, totalF2Ex = 0, totalF2In = 0, totalF3Ex = 0, totalF3In = 0;
  let totalEx = 0, totalIn = 0;

  recs.forEach(r => {
    // 数量合計
    totalCount  += r.count;
    total170    += r.count170;
    totalPickup += r.pickupCount;
    totalOther  += r.otherIncome;
    // モード別合計
    if (r.mode === 'feature1') { const f = calcFeature1(r.count); totalF1 += f; }
    else if (r.mode === 'feature2') { totalF2Ex += r.count * 150; totalF2In += r.count * 165; }
    else if (r.mode === 'feature3') { totalF3Ex += r.count * 160; totalF3In += r.count * 176; }
    // 税抜/税込合計
    totalEx += calcRecordTaxEx(r);
    totalIn += calcRecordTaxIn(r);
  });

  // 月固定控除（YYYY-MMキーで保持）
  const deduction = state.monthlyDeductions[toMonthKey(year, month)] || 0;
  return {
    totalCount, total170, totalPickup, totalOther,
    totalF1, totalF2Ex, totalF2In, totalF3Ex, totalF3In,
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
  // JSON文字列にしてlocalStorageへ保存
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { console.warn('保存失敗:', e); }
}

function loadState() {
  // 保存がなければ何もしない
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    // 文字列 → オブジェクト
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
  const monthTitleEl = document.getElementById('monthTitle');
  const grid = document.getElementById('calendarGrid');
  if (!monthTitleEl || !grid) return;

  // カレンダーのヘッダー（年月）を更新
  const { viewYear, viewMonth, selectedDate } = state;
  monthTitleEl.textContent = `${viewYear}年${viewMonth + 1}月`;

  // いったん空にしてから作り直す（表示のズレ防止）
  grid.innerHTML = '';

  // その月の「1日」が何曜日か
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  // その月の最終日
  const lastDate        = new Date(viewYear, viewMonth + 1, 0).getDate();

  // 空白セル
  for (let i = 0; i < firstDayOfWeek; i++) {
    const blank = document.createElement('div');
    blank.className = 'cal-cell cal-blank';
    grid.appendChild(blank);
  }

  // 日付セル
  for (let d = 1; d <= lastDate; d++) {
    // dateStr はデータ検索用のキー
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

    // セルタップ時の動作
    cell.addEventListener('click', () => {
      // 既に選択中の日付をタップしたら詳細を開く
      if (state.selectedDate === dateStr) {
        if (rec) showMemoModal(rec);
        return;
      }
      // 未選択なら選択し、フォームへ反映
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
  // 選択日の値をフォームに反映（未記録なら空欄）
  const { selectedDate } = state;
  document.getElementById('selectedDateDisplay').value = selectedDate || '';

  const rec = selectedDate ? state.records.find(r => r.date === selectedDate) : null;

  document.getElementById('inputCount').value    = rec ? rec.count       : '';
  document.getElementById('inputCount170').value = rec ? rec.count170    : '';
  document.getElementById('inputPickup').value   = rec ? rec.pickupCount : '';
  document.getElementById('inputOther').value    = rec ? rec.otherIncome : '';

  // 既存レコードのモードは「その記録だけ」のもの。
  // 設定で選んだ currentMode は変更しない（過去記録が勝手に変わらないようにする）。
  renderModeRadio();
  updateCurrentModeDisplay();
  updateTotalCountDisplay(
    rec ? rec.count : 0,
    rec ? rec.count170 : 0
  );
  updatePreview(); // ② プレビュー更新
}

/**
 * ① ラジオボタンを state.currentMode に合わせて更新する
 */
function renderModeRadio() {
  // ラジオボタンは state.currentMode を見てON/OFFを決める
  const r1 = document.getElementById('modeFeature1');
  const r2 = document.getElementById('modeFeature2');
  const r3 = document.getElementById('modeFeature3');
  if (r1) r1.checked = state.currentMode === 'feature1';
  if (r2) r2.checked = state.currentMode === 'feature2';
  if (r3) r3.checked = state.currentMode === 'feature3';
  updateCurrentModeDisplay();
}

function updateCurrentModeDisplay() {
  const el = document.getElementById('currentModeDisplay');
  if (!el) return;
  if (state.currentMode === 'feature1') el.textContent = '日給保証';
  else if (state.currentMode === 'feature2') el.textContent = '単価150';
  else if (state.currentMode === 'feature3') el.textContent = '単価160';
  else el.textContent = '未設定';
}

/**
 * ② リアルタイムプレビューを更新する
 * モードと入力値から予想金額を計算して表示
 */
function updatePreview() {
  // 入力値だけで仮計算（保存はしない）
  const previewEl = document.getElementById('calcPreview');
  const mode = getSelectedMode();

  const count = parseInputInt('inputCount');
  const count170 = parseInputInt('inputCount170');
  updateTotalCountDisplay(count, count170);

  if (!mode) {
    // モード未選択なら表示しない
    previewEl.innerHTML = '';
    return;
  }

  // 入力値を読み取って、仮レコードを作る
  const mockRec = {
    count,
    count170,
    pickupCount: parseInputInt('inputPickup'),
    otherIncome: parseInputInt('inputOther'),
    mode,
  };

  const ex  = calcRecordTaxEx(mockRec);
  const inc = calcRecordTaxIn(mockRec);
  // 税抜 / 税込 を1行で表示
  previewEl.innerHTML =
    `<span class="preview-label">本日の予想合計</span>` +
    `<span class="preview-ex">${yen(ex)}</span>` +
    `<span class="preview-sep">/</span>` +
    `<span class="preview-in">(${yen(inc)})</span>`;
}

function updateTotalCountDisplay(count, count170) {
  const el = document.getElementById('totalCountDisplay');
  if (!el) return;
  const total = count + count170;
  if (total === 0) {
    el.textContent = '';
    return;
  }
  el.textContent = `配達合計: ${total} 件（通常 ${count} / 夜間 ${count170}）`;
}

/**
 * 月合計を描画する
 * ④ 前月比を追加表示
 */
function renderMonthlyTotals() {
  // 表示中の月の合計を再計算して表示する
  const { viewYear, viewMonth } = state;
  const t = calcMonthlyTotals(viewYear, viewMonth);

  // ④ 前月の合計も計算して比較に使う
  const prevMonth = viewMonth === 0 ? 11 : viewMonth - 1;
  const prevYear  = viewMonth === 0 ? viewYear - 1 : viewYear;
  const pt = calcMonthlyTotals(prevYear, prevMonth);
  const diffEx = t.finalEx - pt.finalEx;
  const diffIn = t.finalIn - pt.finalIn;

  // 前月比の表示用ヘルパー（色や記号を決める）
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
    row('日給保証 合計',       yen(t.totalF1)) +
    row('単価150 合計',        `${yen(t.totalF2Ex)} / (${yen(t.totalF2In)})`) +
    row('単価160 合計',        `${yen(t.totalF3Ex)} / (${yen(t.totalF3In)})`) +
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
  // 表示中の月のレコードだけを一覧に出す
  const recs = getMonthRecords(state.viewYear, state.viewMonth);
  const tbody = document.getElementById('recordsBody');
  tbody.innerHTML = '';

  if (recs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="table-empty">記録がありません</td></tr>';
    return;
  }

  recs.sort((a, b) => a.date.localeCompare(b.date));

  recs.forEach(rec => {
    // 1行分の税抜/税込を先に計算
    const ex  = calcRecordTaxEx(rec);
    const inc = calcRecordTaxIn(rec);
    const f1  = rec.mode === 'feature1' ? yen(calcFeature1(rec.count)) : '—';
    const f2  = rec.mode === 'feature2' ? yen(rec.count * 150)         : '—';
    const f3  = rec.mode === 'feature3' ? yen(rec.count * 160)         : '—';

    const tr = document.createElement('tr');

    // データセル（文字列化して順番に入れる）
    const dataCells = [
      rec.date.slice(5).replace('-', '/'),
      rec.count,
      rec.count170,
      rec.count + rec.count170,
      rec.pickupCount,
      yen(rec.otherIncome),
      f1, f2, f3,
      yen(ex),
      yen(inc),
    ];
    dataCells.forEach(val => {
      const td = document.createElement('td');
      td.textContent = val;
      tr.appendChild(td);
    });

    // 削除ボタン（2段階確認）
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
  // 表示中の月に対応する控除額を入力欄へ
  const val = state.monthlyDeductions[toMonthKey(state.viewYear, state.viewMonth)];
  document.getElementById('inputDeduction').value = val !== undefined ? val : '';
}

/** 全体を再描画する */
function renderAll() {
  // 画面全体の表示をまとめて更新
  renderCalendar();
  renderMonthlyTotals();
  renderTable();
  renderModeRadio();
  renderDeductionInput();
  syncFormFromSelectedDate(); // ← 内部で updatePreview も呼ばれる
}

// 画面切り替え（ホーム/設定/年間グラフ）
function showView(name) {
  ['viewHome', 'viewSettings', 'viewAnnual'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('active', id === `view${name}`);
  });

  // 保存バーはホームだけ表示
  const saveBar = document.querySelector('.save-bar');
  if (saveBar) saveBar.style.display = name === 'Home' ? 'block' : 'none';

  if (name === 'Annual') renderAnnualChart(state.chartYear);
}

function openMenu() {
  document.getElementById('menuModal').classList.remove('hidden');
}

function closeMenu() {
  document.getElementById('menuModal').classList.add('hidden');
}

function applyTheme(theme) {
  state.theme = theme;
  document.body.classList.toggle('theme-light', theme === 'light');
  saveState();
}

/* ────────────────────────────────────────────────────────────
   5. モーダル制御
──────────────────────────────────────────────────────────── */

/** 日別詳細モーダルを表示する（税込も含む全情報） */
function showMemoModal(rec) {
  // その日の内訳をモーダルに表示する
  const ex  = calcRecordTaxEx(rec);
  const inc = calcRecordTaxIn(rec);
  const totalCount = rec.count + rec.count170;

  document.getElementById('memoTitle').textContent = `${rec.date} の記録`;

  // 1行分のHTMLを作る小さな関数
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
    memoRow('配達合計',     `${totalCount} 件`) +
    memoRow('集荷枠',       `${rec.pickupCount} 件`) +
    memoRow('その他収入',   yen(rec.otherIncome)) +
    memoRow('計算モード',   rec.mode === 'feature1' ? '日給保証' : rec.mode === 'feature2' ? '単価150' : '単価160') +
    memoRow('合計（税抜）', yen(ex),  'total') +
    memoRow('合計（税込）', yen(inc), 'total');

  document.getElementById('memoModal').classList.remove('hidden');
}

/** 年月ピッカーを表示する */
function showPickerModal() {
  // 年/月のセレクトを現在の表示月で初期化する
  const yearSel  = document.getElementById('pickerYear');
  const monthSel = document.getElementById('pickerMonth');

  yearSel.innerHTML = '';
  // 年は2025〜2030の範囲で固定
  for (let y = 2025; y <= 2030; y++) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = `${y}年`;
    if (y === state.viewYear) opt.selected = true;
    yearSel.appendChild(opt);
  }

  monthSel.innerHTML = '';
  // 月は0〜11（表示は1〜12）
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
  const bind = (id, event, handler) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener(event, handler);
  };

  // ── 月切り替え ──
  // ボタン押下で表示月を移動
  bind('prevMonth', 'click', () => goMonth(-1));
  bind('nextMonth', 'click', () => goMonth(1));
  bind('monthTitle', 'click', showPickerModal);

  // ── ピッカー ──
  bind('pickerConfirm', 'click', () => {
    // セレクトの値を数値に変換して反映
    state.viewYear  = parseInt(document.getElementById('pickerYear').value,  10);
    state.viewMonth = parseInt(document.getElementById('pickerMonth').value, 10);
    saveState();
    renderAll();
    document.getElementById('pickerModal').classList.add('hidden');
  });
  ['pickerCancel', 'pickerOverlay'].forEach(id => {
    bind(id, 'click', () => {
      document.getElementById('pickerModal').classList.add('hidden');
    });
  });

  // ── メモモーダル閉じる ──
  ['memoClose', 'memoOverlay'].forEach(id => {
    bind(id, 'click', () => {
      document.getElementById('memoModal').classList.add('hidden');
    });
  });

  // ── メニュー ──
  bind('menuButton', 'click', openMenu);
  bind('menuOverlay', 'click', closeMenu);
  bind('menuHome', 'click', () => {
    closeMenu();
    showView('Home');
  });
  bind('menuSettings', 'click', () => {
    closeMenu();
    showView('Settings');
  });
  bind('menuAnnual', 'click', () => {
    closeMenu();
    showView('Annual');
  });

  // ── テーマ切替 ──
  bind('themeDark', 'click', () => applyTheme('dark'));
  bind('themeLight', 'click', () => applyTheme('light'));

  // ── 年間グラフ 年選択 ──
  bind('annualYear', 'change', (e) => {
    state.chartYear = parseInt(e.target.value, 10);
    saveState();
    renderAnnualChart(state.chartYear);
  });

  // ── 保存確認モーダル ──
  ['saveConfirmCancel', 'saveConfirmOverlay'].forEach(id => {
    bind(id, 'click', closeSaveConfirm);
  });
  bind('saveConfirmOk', 'click', () => {
    closeSaveConfirm();
    saveRecord();
  });

  // ── ① モードラジオボタン ──
  document.querySelectorAll('input[name="mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      // ラジオ選択はフォームの状態にだけ影響
      state.currentMode = e.target.value;
      saveState();
      updatePreview(); // ② プレビュー即時更新
      updateCurrentModeDisplay();
    });
  });

  // ── ② プレビュー: テキスト入力のたびに更新 ──
  ['inputCount', 'inputCount170', 'inputPickup', 'inputOther'].forEach(id => {
    bind(id, 'input', updatePreview);
  });

  // ── ⑨ ステッパーボタン（formSection 内の全ボタンにまとめて対応）──
  bind('formSection', 'click', handleStepperClick);
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
  bind('saveRecord', 'click', openSaveConfirm);

  // ── ⑤ 前回値を使う ──
  bind('fillPrev', 'click', fillPrevRecord);

  // ── 控除額保存 ──
  bind('saveDeduction', 'click', () => {
    // 月キーで控除額を保存
    const monthKey = toMonthKey(state.viewYear, state.viewMonth);
    state.monthlyDeductions[monthKey] = parseInputInt('inputDeduction');
    saveState();
    renderMonthlyTotals();
    showMessage('控除額を保存しました', 'success', 'formMessage');
  });

  // ── ⑧ CSVエクスポート ──
  bind('exportCsv', 'click', exportCSV);

  // ── カレンダースワイプ ──
  setupSwipe();
}

/**
 * ⑨ ステッパーボタンのクリック処理（共通ハンドラ）
 * data-target に input の id、data-delta に変化量を指定
 */
function handleStepperClick(e) {
  // ステッパーの + / - ボタンの共通処理
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
  // 入力内容を保存する処理
  clearMessage('formMessage');

  // バリデーション
  if (!state.selectedDate) {
    // 日付未選択は保存できない
    showMessage('日付を選択してください', 'error', 'formMessage');
    return;
  }
  const mode = getSelectedMode();
  if (!mode) {
    // モード未選択は保存できない
    showMessage('計算モード（日給保証 / 単価150 / 単価160）を選択してください', 'error', 'formMessage');
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

  // 既存レコードがあれば上書き、なければ追加
  const idx = state.records.findIndex(r => r.date === state.selectedDate);
  if (idx >= 0) state.records[idx] = newRecord;
  else          state.records.push(newRecord);

  saveState();
  renderAll();
  showMessage('保存しました', 'success', 'formMessage');
}

/**
 * 保存確認モーダルを開く
 * 入力内容を見せて「保存」か「キャンセル」を選ばせる
 */
function openSaveConfirm() {
  clearMessage('formMessage');

  if (!state.selectedDate) {
    showMessage('日付を選択してください', 'error', 'formMessage');
    return;
  }
  const mode = getSelectedMode();
  if (!mode) {
    showMessage('計算モード（日給保証 / 単価150 / 単価160）を選択してください', 'error', 'formMessage');
    return;
  }

  const preview = {
    date: state.selectedDate,
    count: parseInputInt('inputCount'),
    count170: parseInputInt('inputCount170'),
    pickupCount: parseInputInt('inputPickup'),
    otherIncome: parseInputInt('inputOther'),
    mode,
  };

  const ex  = calcRecordTaxEx(preview);
  const inc = calcRecordTaxIn(preview);

  const row = (label, value) => `<div class="confirm-row">
    <span class="confirm-label">${label}</span>
    <span class="confirm-value">${value}</span>
  </div>`;

  document.getElementById('saveConfirmBody').innerHTML =
    row('日付', preview.date) +
    row('配達完了数', `${preview.count} 件`) +
    row('夜間配達枠', `${preview.count170} 件`) +
    row('配達合計', `${preview.count + preview.count170} 件`) +
    row('集荷枠', `${preview.pickupCount} 件`) +
    row('その他収入', yen(preview.otherIncome)) +
    row('計算モード', mode === 'feature1' ? '日給保証' : mode === 'feature2' ? '単価150' : '単価160') +
    row('合計（税抜）', yen(ex)) +
    row('合計（税込）', yen(inc));

  document.getElementById('saveConfirmModal').classList.remove('hidden');
}

function closeSaveConfirm() {
  document.getElementById('saveConfirmModal').classList.add('hidden');
}

/**
 * ⑤ 直前の記録値をフォームに展開する
 * selectedDate より前で最も新しいレコードを探す
 */
function fillPrevRecord() {
  // 直前の記録をフォームにコピーする
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

  // モードは「設定画面の選択」を優先するため変更しない

  updatePreview(); // ② プレビュー更新
  showMessage(`${prev.date} の値を適用しました`, 'success', 'formMessage');
}

/**
 * ⑧ 表示中の月のレコードをCSVとしてダウンロードする
 * BOM付きUTF-8でExcelでも文字化けしない
 */
function exportCSV() {
  // 表示中の月だけをCSVにしてダウンロード
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
    r.mode === 'feature1' ? '日給保証' : r.mode === 'feature2' ? '単価150' : '単価160',
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
  // 月をまたぐ時に年も調整する
  let m = state.viewMonth + delta;
  let y = state.viewYear;
  if (m > 11) { m = 0;  y++; }
  if (m < 0)  { m = 11; y--; }
  state.viewMonth = m;
  state.viewYear  = y;
  saveState();
  renderAll();

  // スワイプアニメーションを付与（視覚的に月が動いた感）
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
 * 年間グラフを描画する（税抜/税込の2本バー）
 */
function renderAnnualChart(year) {
  const container = document.getElementById('annualChart');
  if (!container) return;

  const data = [];
  let max = 0;
  for (let m = 0; m < 12; m++) {
    const t = calcMonthlyTotals(year, m);
    const ex = t.finalEx;
    const inc = t.finalIn;
    data.push({ month: m + 1, ex, inc });
    max = Math.max(max, ex, inc);
  }
  if (max === 0) max = 1;

  container.innerHTML = '';
  data.forEach(item => {
    const group = document.createElement('div');
    group.className = 'bar-group';

    const stack = document.createElement('div');
    stack.className = 'bar-stack';

    const barEx = document.createElement('div');
    barEx.className = 'bar ex';
    barEx.style.height = `${Math.round((item.ex / max) * 100)}%`;
    barEx.title = `税抜: ${yen(item.ex)}`;

    const barInc = document.createElement('div');
    barInc.className = 'bar inc';
    barInc.style.height = `${Math.round((item.inc / max) * 100)}%`;
    barInc.title = `税込: ${yen(item.inc)}`;

    stack.appendChild(barEx);
    stack.appendChild(barInc);

    const label = document.createElement('div');
    label.className = 'bar-label';
    label.textContent = `${item.month}月`;

    group.appendChild(stack);
    group.appendChild(label);
    container.appendChild(group);
  });
}

/**
 * カレンダー領域のタッチスワイプで月切り替え
 * 水平移動が垂直移動より大きく、かつ50px以上でスワイプと判定
 */
function setupSwipe() {
  // 指の移動量から左右スワイプを判定する
  const wrapper = document.getElementById('calendarSwipe');
  let startX = 0, startY = 0;

  wrapper.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  wrapper.addEventListener('touchend', (e) => {
    // 横移動が縦移動より大きい場合だけ月移動
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
  // toLocaleString で3桁カンマを付ける
  return '¥' + Math.round(n).toLocaleString('ja-JP');
}

/** 年月日 → 'YYYY-MM-DD' */
function toDateStr(year, month, day) {
  // monthは0始まりなので +1 して2桁化
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** 年月 → 'YYYY-MM'（localStorage キー用） */
function toMonthKey(year, month) {
  // 月単位で保存するキー
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

/** input 要素の値を 0以上の整数で返す（空欄・不正値は 0） */
function parseInputInt(id) {
  // 空欄や負数は0にする
  const v = parseInt(document.getElementById(id).value, 10);
  return (isNaN(v) || v < 0) ? 0 : v;
}

/** ① ラジオボタンから現在選択中のモードを返す */
function getSelectedMode() {
  // ラジオの状態から現在のモードを返す
  const r1 = document.getElementById('modeFeature1');
  const r2 = document.getElementById('modeFeature2');
  const r3 = document.getElementById('modeFeature3');
  if (r1 && r1.checked) return 'feature1';
  if (r2 && r2.checked) return 'feature2';
  if (r3 && r3.checked) return 'feature3';
  return null;
}

/**
 * メッセージを表示して 2秒後に消す
 * @param {string} text     - 表示テキスト
 * @param {'error'|'success'} type - 表示種別
 * @param {string} targetId - 表示先要素の id
 */
function showMessage(text, type, targetId) {
  // 画面に一時メッセージを出す
  const el = document.getElementById(targetId);
  el.textContent = text;
  el.className   = `form-message ${type}`;
  setTimeout(() => {
    if (el.textContent === text) clearMessage(targetId);
  }, 2000);
}

/** メッセージをクリアする */
function clearMessage(targetId) {
  // メッセージ表示を消す
  const el = document.getElementById(targetId);
  el.textContent = '';
  el.className   = 'form-message';
}

function setupAnnualYearOptions() {
  const select = document.getElementById('annualYear');
  if (!select) return;
  select.innerHTML = '';
  for (let y = 2025; y <= 2030; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = `${y}年`;
    if (y === state.chartYear) opt.selected = true;
    select.appendChild(opt);
  }
}

/* ────────────────────────────────────────────────────────────
   8. 初期化
──────────────────────────────────────────────────────────── */

function init() {
  // 起動時に「保存読込 → テーマ反映 → イベント登録 → 描画」の順で実行
  loadState();
  applyTheme(state.theme || 'dark');
  setupAnnualYearOptions();
  setupEvents();
  renderAll();
  showView('Home');
}

document.addEventListener('DOMContentLoaded', init);

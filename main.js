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

/*
  ─────────────────────────────────────────────
  初心者向け: このファイルで使っているJS基礎
  ─────────────────────────────────────────────
  1. 変数・定数: const / let
  2. 配列: records は「データの一覧」を配列で持つ
  3. オブジェクト: record は { key: value } の形
  4. 関数: function foo() {...}
  5. 条件分岐: if / else if / else
  6. ループ: for / forEach
  7. 文字列結合: テンプレート文字列 `${}`
  8. DOM操作: document.getElementById / createElement
  9. イベント: addEventListener (クリックや入力)
 10. 保存: localStorage でブラウザ内に保存
*/

/* ────────────────────────────────────────────────────────────
   1. 定数・状態管理
──────────────────────────────────────────────────────────── */

const STORAGE_KEY = "delivery-wage-app-v1";
// localStorageに保存するときの「箱の名前」。変えると別データ扱いになる。

const USERS_KEY = "delivery-users";
// ログイン用ユーザー情報の保存キー（ローカル）
const CURRENT_USER_KEY = "delivery-current-user";
// 現在ログイン中のユーザーを保存するキー

const defaultState = () => ({
  // records は「日別データの一覧」。配列で持つ。
  records:           [],
  // currentMode は「新しく記録するときのモード」
  currentMode:       null,       // ① フォームで選択中のモード
  // monthlyDeductions は「月ごとの控除額」
  monthlyDeductions: {},
  // holidays は「休日に設定した日」。{ 'YYYY-MM-DD': true }
  holidays:          {},
  // lastMorningGreeting は「朝の挨拶を出した日」
  lastMorningGreeting: null,
  // selectedDate は「今選択している日」
  selectedDate:      null,
  // viewYear / viewMonth は「カレンダーに表示中の年月」
  viewYear:          new Date().getFullYear(),
  viewMonth:         new Date().getMonth(),
  // theme は「ダーク/ライト」
  theme:             'dark',
  // chartYear は「年間グラフの対象年」
  chartYear:         new Date().getFullYear(),
});

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
let state = defaultState();

/* ────────────────────────────────────────────────────────────
   2. 計算系関数
──────────────────────────────────────────────────────────── */

/** 機能1 金額（税抜） */
function calcFeature1(count) {
  // 80以下は一律14,000円。81以上は超過分×110円を加算。
  // count は「配達数」
  if (count <= 80) return 14000;
  return 14000 + (count - 80) * 110;
}

/** 税込計算（10%加算、端数は四捨五入） */
function addTax(value) {
  // 税込は税抜×1.1。Math.roundで四捨五入。
  // 例: 1000 → 1100
  return Math.round(value * 1.1);
}

/** レコードの税抜合計 */
function calcRecordTaxEx(rec) {
  // 計算モードで配達単価が変わる
  // rec は「1日の記録オブジェクト」
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
  // feature2/3 は単価が税込として固定されている
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
  // 例: 2026-03 のデータだけ取り出す
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
  // let は「後で値を変える予定の変数」
  let totalCount = 0, total170 = 0, totalPickup = 0, totalOther = 0;
  let totalF1 = 0, totalF2Ex = 0, totalF2In = 0, totalF3Ex = 0, totalF3In = 0;
  let totalEx = 0, totalIn = 0;

  // forEach は「配列の要素を順番に処理」するループ
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

function loadUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function getCurrentUser() {
  return localStorage.getItem(CURRENT_USER_KEY);
}

function setCurrentUser(email) {
  if (email) localStorage.setItem(CURRENT_USER_KEY, email);
  else localStorage.removeItem(CURRENT_USER_KEY);
}

function getUserStateKey() {
  const email = getCurrentUser();
  return email ? `${STORAGE_KEY}:${email}` : STORAGE_KEY;
}

function saveState() {
  // ローカルに保存（ログイン中ユーザーごとに分ける）
  try {
    localStorage.setItem(getUserStateKey(), JSON.stringify(state));
  } catch (e) {
    console.warn('保存失敗:', e);
  }
}

function loadState() {
  try {
    const userKey = getUserStateKey();
    let raw = localStorage.getItem(userKey);

    // 自動移行: 旧キーのデータがあり、ユーザー別キーが空ならコピーする
    if (!raw) {
      const legacyRaw = localStorage.getItem(STORAGE_KEY);
      if (legacyRaw) {
        localStorage.setItem(userKey, legacyRaw);
        raw = legacyRaw;
      }
    }
    if (!raw) return;
    const saved = JSON.parse(raw);
    const base = defaultState();
    state = {
      ...base,
      ...saved,
      monthlyDeductions: saved.monthlyDeductions || base.monthlyDeductions,
      holidays: saved.holidays || base.holidays,
    };
    if (saved.feature1Enabled === true && !saved.currentMode) state.currentMode = 'feature1';
    else if (saved.feature2Enabled === true && !saved.currentMode) state.currentMode = 'feature2';
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
  // テンプレート文字列で「年」と「月」を合成
  monthTitleEl.textContent = `${viewYear}年${viewMonth + 1}月`;

  // いったん空にしてから作り直す（表示のズレ防止）
  grid.innerHTML = '';

  // その月の「1日」が何曜日か
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  // その月の最終日
  const lastDate        = new Date(viewYear, viewMonth + 1, 0).getDate();

  // 空白セル
  for (let i = 0; i < firstDayOfWeek; i++) {
    // createElement でHTML要素をJSから作れる
    const blank = document.createElement('div');
    blank.className = 'cal-cell cal-blank';
    grid.appendChild(blank);
  }

  // 日付セル
  for (let d = 1; d <= lastDate; d++) {
    // dateStr はデータ検索用のキー
    const dateStr = toDateStr(viewYear, viewMonth, d);
    const rec     = state.records.find(r => r.date === dateStr);
    const isHoliday = !!state.holidays[dateStr];

    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    if (dateStr === selectedDate) cell.classList.add('selected');
    if (isHoliday) cell.classList.add('holiday');

    // 日付番号
    const dayNum = document.createElement('span');
    dayNum.className   = 'cal-day-num';
    dayNum.textContent = d;
    cell.appendChild(dayNum);

    if (rec) {
      // if (rec) は「その日が記録済みなら」という条件分岐
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

    if (isHoliday) {
      const holidayBadge = document.createElement('span');
      holidayBadge.className = 'cal-holiday-badge';
      holidayBadge.textContent = '休日';
      cell.appendChild(holidayBadge);
    }

    // セルタップ時の動作
    cell.addEventListener('click', () => {
      // addEventListener で「クリック時の処理」を登録できる
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
  const isHoliday = selectedDate ? isHolidayDate(selectedDate) : false;

  document.getElementById('inputCount').value    = rec ? rec.count       : '';
  document.getElementById('inputCount170').value = rec ? rec.count170    : '';
  document.getElementById('inputPickup').value   = rec ? rec.pickupCount : '';
  document.getElementById('inputOther').value    = rec ? rec.otherIncome : '';

  // 勤務日/休日の表示を更新
  const workdaySelect = document.getElementById('workdaySelect');
  if (workdaySelect) {
    workdaySelect.value = isHoliday ? 'holiday' : 'work';
  }

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

  const isHolidaySelected = document.getElementById('workdaySelect')?.value === 'holiday';
  if (isHolidaySelected) {
    // 休日を選んでいるときは金額計算をしない
    previewEl.innerHTML = `<div class="preview-line">本日の予想合計: ----</div>`;
    return;
  }

  const count = parseInputInt('inputCount');
  const count170 = parseInputInt('inputCount170');
  updateTotalCountDisplay(count, count170);

  if (!mode) {
    // モード未選択なら表示しない
    previewEl.innerHTML = '';
    return;
  }

  // 入力値を読み取って、仮レコードを作る
  // まだ保存していないので、画面表示用の一時データ
  const mockRec = {
    count,
    count170,
    pickupCount: parseInputInt('inputPickup'),
    otherIncome: parseInputInt('inputOther'),
    mode,
  };

  // 税抜・税込の合計金額を計算
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
  // 「1つずつ更新」を全部ここで呼ぶと管理しやすい
  renderCalendar();
  renderMonthlyTotals();
  renderTable();
  renderModeRadio();
  renderDeductionInput();
  syncFormFromSelectedDate(); // ← 内部で updatePreview も呼ばれる
}

// 画面切り替え（ホーム/設定/年間グラフ）
function showView(name) {
  // name は 'Home' / 'Settings' / 'Annual'
  ['viewHome', 'viewSettings', 'viewAnnual'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    // active クラスが付いている画面だけ表示される
    el.classList.toggle('active', id === `view${name}`);
  });

  // 保存バーはホームだけ表示
  const saveBar = document.querySelector('.save-bar');
  if (saveBar) saveBar.style.display = name === 'Home' ? 'block' : 'none';

  if (name === 'Annual') renderAnnualChart(state.chartYear);
}

function showAuthScreen() {
  const authEl = document.getElementById('authScreen');
  const appEl = document.getElementById('app');
  if (authEl) authEl.classList.remove('hidden');
  if (appEl) appEl.classList.add('hidden');
}

function showAppScreen() {
  const authEl = document.getElementById('authScreen');
  const appEl = document.getElementById('app');
  if (authEl) authEl.classList.add('hidden');
  if (appEl) appEl.classList.remove('hidden');
}

function openMenu() {
  document.getElementById('menuModal').classList.remove('hidden');
}

function closeMenu() {
  document.getElementById('menuModal').classList.add('hidden');
}

function applyTheme(theme) {
  // body にクラスを付け替えて見た目を切り替える
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
  // 関数の中に関数を作ることもできる（ヘルパー関数）
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
  // 配列を forEach で回して、同じ処理をまとめて書く
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
  // ハンバーガーを開く / 閉じる
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

  // ── 休日セレクトの即時反映 ──
  // 休日を選んだ瞬間に「休日として登録」する
  bind('workdaySelect', 'change', (e) => {
    if (!state.selectedDate) {
      showAlert('日付を選択してください');
      e.target.value = 'work';
      return;
    }
    if (e.target.value === 'holiday') {
      const exists = state.records.some(r => r.date === state.selectedDate);
      if (exists) {
        showAlert('この日は記録されています。休日に修正したい場合はお手数おかけしますが一度削除して下さい。');
        e.target.value = 'work';
        return;
      }
      state.holidays[state.selectedDate] = true;
      saveState();
      renderCalendar();
    } else {
      delete state.holidays[state.selectedDate];
      saveState();
      renderCalendar();
    }
    // 休日選択が変わったらプレビューも即更新
    updatePreview();
  });

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

  // ── 汎用ポップアップ ──
  ['alertOverlay', 'alertCancel'].forEach(id => {
    bind(id, 'click', () => {
      const handler = alertCancelHandler;
      closeAlert();
      if (handler) handler();
    });
  });
  bind('alertOk', 'click', () => {
    const handler = alertOkHandler;
    closeAlert();
    if (handler) handler();
  });

  // ── 認証（ログイン/新規登録/ログアウト） ──
  bind('authSignIn', 'click', async () => {
    const email = document.getElementById('authEmail').value.trim();
    const pass  = document.getElementById('authPassword').value.trim();
    if (!email || !pass) {
      document.getElementById('authMessage').textContent = 'メールとパスワードを入力してください。';
      return;
    }
    const users = loadUsers();
    const user = users.find(u => u.email === email && u.password === pass);
    if (!user) {
      document.getElementById('authMessage').textContent = 'ログインに失敗しました。';
      return;
    }
    setCurrentUser(email);
    document.getElementById('authMessage').textContent = '';
    showAppScreen();
    state = defaultState();
    loadState();
    renderAll();
    showView('Home');
    showMorningGreetingOnce();
  });

  bind('authSignUp', 'click', async () => {
    const email = document.getElementById('authEmail').value.trim();
    const pass  = document.getElementById('authPassword').value.trim();
    if (!email || !pass) {
      document.getElementById('authMessage').textContent = 'メールとパスワードを入力してください。';
      return;
    }
    if (pass.length < 8) {
      document.getElementById('authMessage').textContent = 'パスワードは8文字以上にしてください。';
      return;
    }
    const users = loadUsers();
    if (users.some(u => u.email === email)) {
      document.getElementById('authMessage').textContent = 'そのメールは既に登録されています。';
      return;
    }
    users.push({ email, password: pass });
    saveUsers(users);
    document.getElementById('authMessage').textContent = '新規登録しました。続けてログインしてください。';
  });

  bind('authSignOut', 'click', async () => {
    setCurrentUser(null);
    state = defaultState();
    showAuthScreen();
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
  // 勤務日/休日の取得
  const isHoliday = document.getElementById('workdaySelect')?.value === 'holiday';

  // 休日なら「記録しない」で保存（休日登録だけ行う）
  if (isHoliday) {
    // 休日の日に「保存」を押したら案内ポップアップだけ出す
    showAlert('この日は休日で登録済です。');
    if (state.selectedDate) {
      const exists = state.records.some(r => r.date === state.selectedDate);
      if (exists) {
        showAlert('この日は記録されています。休日に修正したい場合はお手数おかけしますが一度削除して下さい。');
        return;
      }
      state.holidays[state.selectedDate] = true;
      saveState();
      renderAll();
      showMessage('休日として保存しました', 'success', 'formMessage');
    }
    return;
  } else {
    // 出勤日に戻す場合は休日解除
    if (state.selectedDate) {
      delete state.holidays[state.selectedDate];
    }
  }

  // 個数が全部0ならエラー
  const count = parseInputInt('inputCount');
  const count170 = parseInputInt('inputCount170');
  const pickup = parseInputInt('inputPickup');
  if (count === 0 && count170 === 0 && pickup === 0) {
    // 実質「何も入力されていない」ので保存させない
    showAlert('配達個数を記録して下さい。');
    return;
  }

  const mode = getSelectedMode();
  if (!mode) {
    // モード未選択は保存できない
    showMessage('計算モード（日給保証 / 単価150 / 単価160）を選択してください', 'error', 'formMessage');
    return;
  }

  // 入力欄から値を集めて「1日分のデータ」を作る
  const newRecord = {
    date:        state.selectedDate,
    count:       parseInputInt('inputCount'),
    count170:    parseInputInt('inputCount170'),
    pickupCount: parseInputInt('inputPickup'),
    otherIncome: parseInputInt('inputOther'),
    mode,
  };

  // 既存レコードがあれば上書き、なければ追加
  // findIndex は「条件に合う最初の場所（番号）」を探す
  const idx = state.records.findIndex(r => r.date === state.selectedDate);
  if (idx >= 0) state.records[idx] = newRecord;
  else          state.records.push(newRecord);

  // 保存 → 再描画 → 完了メッセージ
  saveState();
  renderAll();
  showMessage('保存しました', 'success', 'formMessage');

  // 19時以降の労いメッセージ
  const now = new Date();
  const totalCount = newRecord.count + newRecord.count170;
  if (now.getHours() >= 19 && totalCount > 0) {
    const nextDate = new Date(state.selectedDate);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextKey = toDateStr(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate());
    if (!isHolidayDate(nextKey)) {
      showAlert('本日もお疲れ様でした！明日も無理なく安全運転で頑張って下さい！');
    } else {
      const nextWork = getNextWorkDate(nextKey);
      const n = parseInt(nextWork.split('-')[2], 10);
      showAlert(`本日もお疲れ様でした！次は${n}日（休日を除く直近の出勤日をnとします）ですね！明日はゆっくり休んで${n}日は寝坊せずにお気をつけ下さい！`);
    }
  }
}

/**
 * 保存確認モーダルを開く
 * 入力内容を見せて「保存」か「キャンセル」を選ばせる
 */
function openSaveConfirm(skipExistingCheck = false) {
  clearMessage('formMessage');

  if (!state.selectedDate) {
    showMessage('日付を選択してください', 'error', 'formMessage');
    return;
  }
  // 勤務日/休日の判定（休日なら保存確認をスキップ）
  const isHoliday = document.getElementById('workdaySelect')?.value === 'holiday';
  if (isHoliday) {
    // 休日のときは「保存確認」は出さずに終了
    showAlert('この日は休日で登録済です。');
    const exists = state.records.some(r => r.date === state.selectedDate);
    if (exists) {
      showAlert('この日は記録されています。休日に修正したい場合はお手数おかけしますが一度削除して下さい。');
      return;
    }
    state.holidays[state.selectedDate] = true;
    saveState();
    renderAll();
    showMessage('休日として保存しました', 'success', 'formMessage');
    return;
  }

  // 個数が0なら保存確認を出さない
  const count = parseInputInt('inputCount');
  const count170 = parseInputInt('inputCount170');
  const pickup = parseInputInt('inputPickup');
  if (count === 0 && count170 === 0 && pickup === 0) {
    showAlert('配達個数を記録して下さい。');
    return;
  }

  // 計算モードが未選択なら保存できない
  const mode = getSelectedMode();
  if (!mode) {
    showMessage('計算モード（日給保証 / 単価150 / 単価160）を選択してください', 'error', 'formMessage');
    return;
  }

  // 既に記録がある日なら、上書き確認を出す
  if (!skipExistingCheck) {
    const exists = state.records.some(r => r.date === state.selectedDate);
    if (exists) {
      showAlert('すでに記録されています。修正しますか？', {
        showCancel: true,
        okText: '修正する',
        cancelText: 'キャンセル',
        onOk: () => openSaveConfirm(true),
      });
      return;
    }
  }

  // ここから下は「保存確認の内容」を作る処理
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
  // 指の動きに追従し、40%超えでスライド
  // ここは「スワイプ操作」を一箇所にまとめた関数
  const wrapper = document.getElementById('calendarSwipe');
  if (!wrapper) return;
  // 開始位置・移動量・状態を保存する変数たち
  let startX = 0, startY = 0;
  let dx = 0;
  let dragging = false;
  let width = 1;
  let activePointerId = null;
  let rafId = null;
  let pendingX = 0;
  let isAnimating = false;

  const setTranslate = (x) => {
    // translate3d は「要素を横に動かす」ための指定
    wrapper.style.transform = `translate3d(${x}px, 0, 0)`;
  };
  const requestMove = (x) => {
    // requestAnimationFrame を使うと「描画タイミング」で動かせる
    // 連続で呼ばれても、1フレームに1回だけ動かす
    pendingX = x;
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      setTranslate(pendingX);
      rafId = null;
    });
  };

  const onStart = (clientX, clientY, pointerId) => {
    // スワイプ開始時の処理
    if (isAnimating) return;
    startX = clientX;
    startY = clientY;
    dx = 0;
    dragging = false;
    // 画面幅を取って「40%判定」に使う
    width = wrapper.getBoundingClientRect().width || 1;
    activePointerId = pointerId;
    // ドラッグ中はアニメーションを切る
    wrapper.style.transition = 'none';
  };

  const onMove = (clientX, clientY) => {
    // スワイプ中の処理
    dx = clientX - startX;
    const dy = clientY - startY;
    if (!dragging) {
      // 小さい動きは無視（誤操作防止）
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return false;
      // 縦スクロール優先にしたいので、横より縦が大きければ無視
      if (Math.abs(dx) <= Math.abs(dy)) return false;
      dragging = true;
    }
    // 指の動きに合わせて横へ移動
    requestMove(dx);
    return true;
  };

  const onEnd = () => {
    // 指を離した時の処理
    if (activePointerId === null) return;
    // どれだけ動いたかを割合で計算
    const ratio = Math.abs(dx) / width;
    // 左にスワイプなら翌月（+1）、右なら前月（-1）
    const dir = dx < 0 ? 1 : -1;
    // 40%を超えたら「月を切り替える」
    const shouldSlide = dragging && ratio >= 0.4;

    // 指を離したあとはアニメーションでスライド
    wrapper.style.transition = 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)';
    if (shouldSlide) {
      // 既にrequestAnimationFrameが残っていれば止める
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      // 画面幅ぶんだけ一気に動かして「スライド完了」させる
      setTranslate(dx < 0 ? -width : width);
      isAnimating = true;
      // transitionend が来ない時の保険（安全に戻す）
      const fallback = setTimeout(() => {
        wrapper.style.transition = '';
        wrapper.style.transform = '';
        isAnimating = false;
      }, 500);
      wrapper.addEventListener('transitionend', () => {
        clearTimeout(fallback);
        wrapper.style.transition = '';
        wrapper.style.transform = '';
        isAnimating = false;
        // アニメーションが終わったら月を切り替えて描画し直す
        goMonth(dir, false);
      }, { once: true });
    } else {
      // 40%未満なら元の位置に戻す
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      setTranslate(0);
      wrapper.addEventListener('transitionend', () => {
        wrapper.style.transition = '';
        wrapper.style.transform = '';
      }, { once: true });
    }
    // 次のスワイプに備えて状態をリセット
    activePointerId = null;
    dragging = false;
  };

  // Pointer Events が使えるかどうか判定
  const hasPointer = !!window.PointerEvent;

  if (hasPointer) {
    // Pointer Events（iOS 13+）
    wrapper.addEventListener('pointerdown', (e) => {
      // マウス右クリックは無視
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // この指（ポインタ）を追跡する宣言
      wrapper.setPointerCapture?.(e.pointerId);
      onStart(e.clientX, e.clientY, e.pointerId);
    }, { passive: true });

    wrapper.addEventListener('pointermove', (e) => {
      // 今追跡している指以外は無視
      if (activePointerId !== e.pointerId) return;
      const moved = onMove(e.clientX, e.clientY);
      // 画面スクロールを止めて横スワイプを優先
      if (moved) e.preventDefault();
    }, { passive: false });

    wrapper.addEventListener('pointerup', (e) => {
      if (activePointerId !== e.pointerId) return;
      onEnd();
    }, { passive: true });

    wrapper.addEventListener('pointercancel', () => {
      onEnd();
    }, { passive: true });

    window.addEventListener('pointerup', (e) => {
      // 指が要素の外で離れても拾えるようにする
      if (activePointerId !== null && activePointerId === e.pointerId) onEnd();
    }, { passive: true });
    window.addEventListener('pointercancel', () => {
      if (activePointerId !== null) onEnd();
    }, { passive: true });
  } else {
    // フォールバック（古い環境）
    wrapper.addEventListener('touchstart', (e) => {
      if (!e.touches[0]) return;
      onStart(e.touches[0].clientX, e.touches[0].clientY, 'touch');
    }, { passive: true });

    wrapper.addEventListener('touchmove', (e) => {
      if (!e.touches[0]) return;
      const moved = onMove(e.touches[0].clientX, e.touches[0].clientY);
      if (moved) e.preventDefault();
    }, { passive: false });

    wrapper.addEventListener('touchend', () => {
      onEnd();
    }, { passive: true });
  }
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

/* ────────────────────────────────────────────────────────────
   8. 休日・ポップアップ関連
──────────────────────────────────────────────────────────── */

function toggleHoliday(dateStr) {
  // 休日のON/OFFを切り替える
  if (state.holidays[dateStr]) delete state.holidays[dateStr];
  else state.holidays[dateStr] = true;
  saveState();
  renderCalendar();
}

function isHolidayDate(dateStr) {
  return !!state.holidays[dateStr];
}

function getNextWorkDate(fromDateStr) {
  // 翌日から「休日ではない日」を探す
  const base = new Date(fromDateStr);
  for (let i = 1; i <= 366; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const key = toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
    if (!isHolidayDate(key)) return key;
  }
  return fromDateStr;
}

let alertOkHandler = null;
let alertCancelHandler = null;

function showAlert(message, options = {}) {
  const modal = document.getElementById('alertModal');
  const msgEl = document.getElementById('alertMessage');
  const okBtn = document.getElementById('alertOk');
  const cancelBtn = document.getElementById('alertCancel');
  if (!modal || !msgEl || !okBtn || !cancelBtn) return;

  msgEl.textContent = message;
  okBtn.textContent = options.okText || 'OK';
  cancelBtn.textContent = options.cancelText || 'キャンセル';
  cancelBtn.style.display = options.showCancel ? 'inline-flex' : 'none';

  alertOkHandler = options.onOk || null;
  alertCancelHandler = options.onCancel || null;

  modal.classList.remove('hidden');
}

function closeAlert() {
  const modal = document.getElementById('alertModal');
  if (!modal) return;
  modal.classList.add('hidden');
  alertOkHandler = null;
  alertCancelHandler = null;
}

function showMorningGreetingOnce() {
  const now = new Date();
  if (now.getHours() < 6) return;
  const todayKey = toDateStr(now.getFullYear(), now.getMonth(), now.getDate());
  if (state.lastMorningGreeting === todayKey) return;

  if (isHolidayDate(todayKey)) {
    showAlert('おはようございます！本日はお休みです、間違えて出勤しないようお気をつけ下さい！');
  } else {
    showAlert('おはようございます！本日も安全運転でお気をつけて！');
  }
  state.lastMorningGreeting = todayKey;
  saveState();
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
  // 起動時に「テーマ反映 → イベント登録」
  applyTheme(state.theme || 'dark');
  setupAnnualYearOptions();
  setupEvents();

  // ログイン済みならアプリを開く
  const user = getCurrentUser();
  if (user) {
    showAppScreen();
    loadState();
    renderAll();
    showView('Home');
    showMorningGreetingOnce();
  } else {
    showAuthScreen();
  }
}

document.addEventListener('DOMContentLoaded', init);

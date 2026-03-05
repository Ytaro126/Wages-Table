const STORAGE_KEY = "delivery-wage-app-v1";

/*
  =======================================
  初心者向け: JavaScriptの読み方(このファイル)
  =======================================
  1) state:
     アプリの現在状態を入れるオブジェクト。
     画面表示はこのstateを元に作られる。
  2) render系関数:
     stateを見てHTML表示を作る。
  3) イベント系関数:
     ボタンやタップの操作を受け取り、stateを更新する。
  4) 計算系関数:
     金額計算を1箇所に集約し、表示ブレを防ぐ。
  5) 保存系関数:
     localStorageに保存/復元して再起動後も維持する。
*/

// 画面全体で共有する状態。ここを更新して再描画する作り。
const state = {
  records: {},
  feature1Enabled: true,
  feature2Enabled: false,
  monthlyDeductions: {},
  selectedDate: "",
  viewYear: 0,
  viewMonth: 0
};

const dom = {};
let swipeStartX = null;
// スワイプ方向(前月/翌月)に応じてアニメーション方向を切り替えるためのフラグ
let calendarAnimationDirection = 0;

document.addEventListener("DOMContentLoaded", () => {
  // 初回読み込み時の実行順:
  // 1) 要素参照取得 2) 保存データ復元 3) イベント登録 4) 画面描画
  cacheDom();
  initState();
  bindEvents();
  renderAll();
});

function cacheDom() {
  // 毎回getElementByIdしないように、最初に参照をまとめて保持する
  dom.prevMonthBtn = document.getElementById("prevMonthBtn");
  dom.nextMonthBtn = document.getElementById("nextMonthBtn");
  dom.monthLabelBtn = document.getElementById("monthLabelBtn");
  dom.weekHeader = document.getElementById("weekHeader");
  dom.calendarGrid = document.getElementById("calendarGrid");
  dom.calendarSwipeArea = document.getElementById("calendarSwipeArea");

  dom.selectedDateText = document.getElementById("selectedDateText");
  dom.countInput = document.getElementById("countInput");
  dom.count170Input = document.getElementById("count170Input");
  dom.pickupInput = document.getElementById("pickupInput");
  dom.otherIncomeInput = document.getElementById("otherIncomeInput");
  dom.feature1Check = document.getElementById("feature1Check");
  dom.feature2Check = document.getElementById("feature2Check");
  dom.recordBtn = document.getElementById("recordBtn");
  dom.errorText = document.getElementById("errorText");

  dom.deductionInput = document.getElementById("deductionInput");
  dom.summaryGrid = document.getElementById("summaryGrid");
  dom.recordsTbody = document.getElementById("recordsTbody");

  dom.pickerModal = document.getElementById("pickerModal");
  dom.pickerCloseBtn = document.getElementById("pickerCloseBtn");
  dom.pickerApplyBtn = document.getElementById("pickerApplyBtn");
  dom.pickerYear = document.getElementById("pickerYear");
  dom.pickerMonth = document.getElementById("pickerMonth");
  dom.pickerDay = document.getElementById("pickerDay");

  dom.memoModal = document.getElementById("memoModal");
  dom.memoCloseBtn = document.getElementById("memoCloseBtn");
  dom.memoTitle = document.getElementById("memoTitle");
  dom.memoBody = document.getElementById("memoBody");

  dom.saveBtn = document.getElementById("saveBtn");
}

function initState() {
  // デフォルトは今日。あとでlocalStorageの値で上書きされる。
  const today = new Date();
  state.selectedDate = toISODate(today.getFullYear(), today.getMonth(), today.getDate());
  state.viewYear = today.getFullYear();
  state.viewMonth = today.getMonth();

  loadState();
  ensureSelectedDateValid();
  // 初回の入力欄に、選択日データ（なければ空欄）を反映
  fillInputsFromRecord(state.selectedDate);
}

function bindEvents() {
  // UI操作と関数を紐付ける
  dom.prevMonthBtn.addEventListener("click", () => moveMonth(-1, true));
  dom.nextMonthBtn.addEventListener("click", () => moveMonth(1, true));
  dom.monthLabelBtn.addEventListener("click", openPickerModal);

  dom.calendarSwipeArea.addEventListener("touchstart", onCalendarTouchStart, { passive: true });
  dom.calendarSwipeArea.addEventListener("touchend", onCalendarTouchEnd, { passive: true });

  dom.feature1Check.addEventListener("change", () => setFeatureSelection("feature1"));
  dom.feature2Check.addEventListener("change", () => setFeatureSelection("feature2"));

  dom.recordBtn.addEventListener("click", saveRecordForSelectedDate);
  dom.deductionInput.addEventListener("change", updateMonthlyDeduction);
  dom.saveBtn.addEventListener("click", onSaveButtonClick);

  dom.recordsTbody.addEventListener("click", onTableClick);

  dom.pickerCloseBtn.addEventListener("click", closePickerModal);
  dom.pickerApplyBtn.addEventListener("click", applyPickerDate);
  dom.pickerYear.addEventListener("change", updatePickerDayOptions);
  dom.pickerMonth.addEventListener("change", updatePickerDayOptions);
  // モーダル外側の暗い背景を押したら閉じる(初心者向けのよくあるUI)
  dom.pickerModal.addEventListener("click", (event) => {
    if (event.target === dom.pickerModal) closePickerModal();
  });

  dom.memoCloseBtn.addEventListener("click", closeMemoModal);
  dom.memoModal.addEventListener("click", (event) => {
    if (event.target === dom.memoModal) closeMemoModal();
  });
}

function renderAll() {
  // 複数箇所の表示をまとめて更新
  renderWeekHeader();
  renderMonthLabel();
  renderSelectedDate();
  renderFeatureChecks();
  renderDeductionInput();
  renderCalendar();
  renderMonthlySummary();
  renderTable();
}

function renderWeekHeader() {
  // 曜日見出しは固定配列から生成
  const labels = ["日", "月", "火", "水", "木", "金", "土"];
  dom.weekHeader.innerHTML = labels.map((day) => `<div class="week-cell">${day}</div>`).join("");
}

function renderMonthLabel() {
  // viewYear/viewMonth(0始まり)を見やすい文字に変換
  dom.monthLabelBtn.textContent = `${state.viewYear}年 ${state.viewMonth + 1}月`;
}

function renderSelectedDate() {
  // YYYY-MM-DDを「YYYY年M月D日」に変換して表示
  dom.selectedDateText.textContent = formatDateJP(state.selectedDate);
}

function renderFeatureChecks() {
  // stateとチェックボックスの見た目を同期
  dom.feature1Check.checked = state.feature1Enabled;
  dom.feature2Check.checked = state.feature2Enabled;
}

function renderDeductionInput() {
  // 月キー(YYYY-MM)ごとに保持した控除額を入力欄に表示
  const key = getMonthKey(state.viewYear, state.viewMonth);
  dom.deductionInput.value = String(state.monthlyDeductions[key] || 0);
}

function renderCalendar() {
  // カレンダー本体は毎回作り直して、状態と表示のズレを防ぐ
  dom.calendarGrid.innerHTML = "";

  // getDay(): 0=日 ... 6=土
  const firstDay = new Date(state.viewYear, state.viewMonth, 1).getDay();
  const daysInMonth = getDaysInMonth(state.viewYear, state.viewMonth);
  // 週の途中で終わる月でも、最終行を7列で埋めるために切り上げ
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  for (let i = 0; i < totalCells; i += 1) {
    // iが0開始なので、月初の曜日(firstDay)を差し引いて実日付へ変換
    const day = i - firstDay + 1;
    const isCurrentMonth = day >= 1 && day <= daysInMonth;

    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "day-cell";

    if (!isCurrentMonth) {
      // 月外セルは空表示
      cell.classList.add("empty");
      cell.disabled = true;
      dom.calendarGrid.appendChild(cell);
      continue;
    }

    // データキーは日付文字列(例: 2026-03-05)で統一
    const iso = toISODate(state.viewYear, state.viewMonth, day);
    const record = state.records[iso];

    if (iso === state.selectedDate) {
      cell.classList.add("selected");
    }

    const dayNum = document.createElement("div");
    dayNum.className = "day-number";
    dayNum.textContent = String(day);
    cell.appendChild(dayNum);

    if (record) {
      // 金額タップでメモモーダルを開けるようボタン化
      const amounts = calcRecordAmounts(record);
      const amountBtn = document.createElement("button");
      amountBtn.type = "button";
      amountBtn.className = "amount-btn";
      // innerHTMLを使う理由:
      // 税抜/税込を改行して2段表示するため <br> が必要
      amountBtn.innerHTML = `${formatYen(amounts.totalEx)}<br>(${formatYen(amounts.totalIn)})`;
      amountBtn.addEventListener("click", (event) => {
        // 親(day-cell)のクリックイベントへ伝播させない
        // これがないと「メモを開く」と同時に「日付選択」も走ってしまう
        event.stopPropagation();
        openMemoModal(iso, record, amounts);
      });
      cell.appendChild(amountBtn);
    }

    cell.addEventListener("click", () => {
      // 日付タップで選択日変更 + その日の入力値をフォームへ反映
      state.selectedDate = iso;
      fillInputsFromRecord(iso);
      renderSelectedDate();
      // selected枠の見た目を更新するため再描画
      renderCalendar();
      clearError();
      saveState();
    });

    dom.calendarGrid.appendChild(cell);
  }

  runCalendarAnimation();
}

function renderMonthlySummary() {
  // 表示中の月データだけ集計
  const monthRecords = getRecordsForCurrentMonth();
  const monthKey = getMonthKey(state.viewYear, state.viewMonth);
  // Number()で数値化して計算時の型ブレを防止
  const deduction = Number(state.monthlyDeductions[monthKey] || 0);

  const totals = {
    count: 0,
    count170: 0,
    pickup: 0,
    otherIncome: 0,
    feature1Ex: 0,
    feature1In: 0,
    feature2Ex: 0,
    feature2In: 0,
    totalEx: 0,
    totalIn: 0
  };

  monthRecords.forEach((record) => {
    // 1日単位計算を積み上げる
    const amounts = calcRecordAmounts(record);
    totals.count += record.count;
    totals.count170 += record.count170;
    totals.pickup += record.pickupCount;
    totals.otherIncome += record.otherIncome || 0;
    totals.feature1Ex += amounts.feature1Ex;
    totals.feature1In += amounts.feature1In;
    totals.feature2Ex += amounts.feature2Ex;
    totals.feature2In += amounts.feature2In;
    totals.totalEx += amounts.totalEx;
    totals.totalIn += amounts.totalIn;
  });

  totals.totalEx -= deduction;
  totals.totalIn -= deduction;
  // 固定控除は税抜/税込の両方から同額で差し引く

  dom.summaryGrid.innerHTML = "";

  const rows = [
    ["配達完了数合計", String(totals.count)],
    ["170円枠合計", String(totals.count170)],
    ["集荷枠合計", String(totals.pickup)],
    ["その他収入合計", formatYen(totals.otherIncome)],
    ["機能1合計", `${formatYen(totals.feature1Ex)} / ${formatYen(totals.feature1In)}`],
    ["機能2合計", `${formatYen(totals.feature2Ex)} / ${formatYen(totals.feature2In)}`],
    ["最終合計", `${formatYen(totals.totalEx)} / ${formatYen(totals.totalIn)}`],
    ["月固定控除", formatYen(deduction)]
  ];

  rows.forEach(([label, value]) => {
    const item = document.createElement("div");
    item.className = "summary-item";
    item.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    dom.summaryGrid.appendChild(item);
  });
}

function renderTable() {
  // 月内レコード一覧を表形式で表示
  const monthRecords = getRecordsForCurrentMonth();
  dom.recordsTbody.innerHTML = "";

  if (monthRecords.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="9">記録がありません</td>';
    dom.recordsTbody.appendChild(tr);
    return;
  }

  monthRecords.forEach((record) => {
    const amounts = calcRecordAmounts(record);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${record.date}</td>
      <td>${record.count}</td>
      <td>${record.count170}</td>
      <td>${record.pickupCount}</td>
      <td>${formatYen(record.otherIncome || 0)}</td>
      <td>${record.mode === "feature1" ? `${formatYen(amounts.feature1Ex)}<br>(${formatYen(amounts.feature1In)})` : "-"}</td>
      <td>${record.mode === "feature2" ? `${formatYen(amounts.feature2Ex)}<br>(${formatYen(amounts.feature2In)})` : "-"}</td>
      <td>${formatYen(amounts.totalEx)}<br>(${formatYen(amounts.totalIn)})</td>
      <!-- data-date:
           削除ボタンが「どの日付を消すか」を持つための属性 -->
      <td><button type="button" class="delete-btn" data-date="${record.date}">削除</button></td>
    `;
    dom.recordsTbody.appendChild(tr);
  });
}

function setFeatureSelection(featureName) {
  // 機能1/機能2は排他制御（同時ON不可）
  if (featureName === "feature1") {
    state.feature1Enabled = dom.feature1Check.checked;
    if (state.feature1Enabled) state.feature2Enabled = false;
  }

  if (featureName === "feature2") {
    state.feature2Enabled = dom.feature2Check.checked;
    if (state.feature2Enabled) state.feature1Enabled = false;
  }

  renderFeatureChecks();
  // トグル変更は即保存して、再読込でも同じ状態にする
  saveState();
}

function saveRecordForSelectedDate() {
  clearError();

  // 両方OFFでは計算方法が決まらないため保存禁止
  if (!state.feature1Enabled && !state.feature2Enabled) {
    showError("機能1か機能2を選択してください。両方OFFでは記録できません。");
    return;
  }

  // 空欄・負数・小数などを共通関数で安全な整数に丸める
  const count = toNonNegativeInt(dom.countInput.value);
  const count170 = toNonNegativeInt(dom.count170Input.value);
  const pickupCount = toNonNegativeInt(dom.pickupInput.value);
  const otherIncome = toNonNegativeInt(dom.otherIncomeInput.value);

  // 排他制御済みなので、ON側をモードとして保存
  const mode = state.feature1Enabled ? "feature1" : "feature2";

  // 同じ日付は上書き保存
  state.records[state.selectedDate] = {
    date: state.selectedDate,
    count,
    count170,
    pickupCount,
    otherIncome,
    mode
  };

  saveState();
  renderCalendar();
  renderMonthlySummary();
  renderTable();
}

function fillInputsFromRecord(isoDate) {
  // レコード未登録日は空欄表示（入力開始しやすくする）
  const record = state.records[isoDate];
  if (!record) {
    dom.countInput.value = "";
    dom.count170Input.value = "";
    dom.pickupInput.value = "";
    dom.otherIncomeInput.value = "";
    return;
  }

  // String()で必ずinputに表示できる文字列へ変換
  dom.countInput.value = String(record.count);
  dom.count170Input.value = String(record.count170);
  dom.pickupInput.value = String(record.pickupCount);
  dom.otherIncomeInput.value = String(record.otherIncome || 0);
}

function onTableClick(event) {
  // tbodyに1つだけclickを置く「イベント委譲」。
  // 行が増減しても個別にaddEventListenerしなくて済む。
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  if (!target.classList.contains("delete-btn")) return;
  const date = target.getAttribute("data-date");
  if (!date) return;

  // オブジェクトの該当キーを削除
  delete state.records[date];
  saveState();
  renderCalendar();
  renderMonthlySummary();
  renderTable();
}

function updateMonthlyDeduction() {
  // 「YYYY-MM」をキーにして月ごとに控除額を保持
  const value = toNonNegativeInt(dom.deductionInput.value);
  const key = getMonthKey(state.viewYear, state.viewMonth);
  // 例: monthlyDeductions["2026-03"] = 5000
  state.monthlyDeductions[key] = value;
  dom.deductionInput.value = String(value);

  saveState();
  renderCalendar();
  renderMonthlySummary();
  renderTable();
}

function onSaveButtonClick() {
  // 明示保存ボタン。入力中でなくても現在状態を確実に保存できる。
  saveState();
  dom.errorText.style.color = "#11602d";
  dom.errorText.textContent = "保存しました。";
  // 一定時間後にメッセージを消して見た目を戻す
  window.setTimeout(() => {
    clearError();
  }, 1500);
}

function moveMonth(delta, animate = false) {
  // delta: -1=前月, +1=翌月
  if (animate) {
    calendarAnimationDirection = delta;
  }

  // Dateの月は範囲外を自動補正する。
  // 例: month=12なら翌年1月になる。
  const next = new Date(state.viewYear, state.viewMonth + delta, 1);
  state.viewYear = next.getFullYear();
  state.viewMonth = next.getMonth();

  const daysInMonth = getDaysInMonth(state.viewYear, state.viewMonth);
  const selected = parseISODate(state.selectedDate);
  // 31日->30日など月日数差で日付が壊れないよう補正
  const newDay = Math.min(selected.day, daysInMonth);
  state.selectedDate = toISODate(state.viewYear, state.viewMonth, newDay);

  fillInputsFromRecord(state.selectedDate);
  saveState();
  renderAll();
}

function onCalendarTouchStart(event) {
  // スワイプ開始位置を保持
  if (event.changedTouches.length === 0) return;
  // changedTouches[0].clientX = 指のX座標
  swipeStartX = event.changedTouches[0].clientX;
}

function onCalendarTouchEnd(event) {
  // 終了位置との差分で左右スワイプ判定
  if (swipeStartX === null || event.changedTouches.length === 0) return;
  const endX = event.changedTouches[0].clientX;
  // diff < 0 なら左方向スワイプ、diff > 0 なら右方向
  const diff = endX - swipeStartX;
  swipeStartX = null;

  if (Math.abs(diff) < 2.5 * 16) return;
  // 意図しない小さな指移動は無視

  if (diff < 0) {
    moveMonth(1, true);
  } else {
    moveMonth(-1, true);
  }
}

function openPickerModal() {
  // 開く直前に選択肢を作ることで最新状態と同期
  populatePickerOptions();
  dom.pickerModal.classList.add("show");
  dom.pickerModal.setAttribute("aria-hidden", "false");
}

function closePickerModal() {
  dom.pickerModal.classList.remove("show");
  dom.pickerModal.setAttribute("aria-hidden", "true");
}

function populatePickerOptions() {
  // 年は要件どおり2025〜2030固定
  const selected = parseISODate(state.selectedDate);

  dom.pickerYear.innerHTML = "";
  // 年の選択肢を動的生成(要件固定)
  for (let year = 2025; year <= 2030; year += 1) {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = `${year}年`;
    if (year === selected.year) option.selected = true;
    dom.pickerYear.appendChild(option);
  }

  dom.pickerMonth.innerHTML = "";
  // 月の選択肢を1〜12で生成
  for (let month = 1; month <= 12; month += 1) {
    const option = document.createElement("option");
    option.value = String(month);
    option.textContent = `${month}月`;
    if (month === selected.month + 1) option.selected = true;
    dom.pickerMonth.appendChild(option);
  }

  updatePickerDayOptions(selected.day);
}

function updatePickerDayOptions(preferredDay) {
  // 月変更時、存在しない日付（例: 31日）を自動補正
  const year = Number(dom.pickerYear.value);
  const monthIndex = Number(dom.pickerMonth.value) - 1;
  const days = getDaysInMonth(year, monthIndex);

  const current = preferredDay || Number(dom.pickerDay.value) || 1;
  // 2月など日数が少ない月に切り替えた時の補正
  const safeDay = Math.min(current, days);

  dom.pickerDay.innerHTML = "";
  for (let day = 1; day <= days; day += 1) {
    const option = document.createElement("option");
    option.value = String(day);
    option.textContent = `${day}日`;
    if (day === safeDay) option.selected = true;
    dom.pickerDay.appendChild(option);
  }
}

function applyPickerDate() {
  // ピッカーで選んだ年月日を、表示月と選択日に反映
  const year = Number(dom.pickerYear.value);
  const monthIndex = Number(dom.pickerMonth.value) - 1;
  const day = Number(dom.pickerDay.value);

  state.viewYear = year;
  // 表示月と選択日を同時に更新する
  state.viewMonth = monthIndex;
  state.selectedDate = toISODate(year, monthIndex, day);

  fillInputsFromRecord(state.selectedDate);
  closePickerModal();
  saveState();
  renderAll();
}

function openMemoModal(isoDate, record, amounts) {
  // 日別詳細（入力値と計算結果）を確認する読み取り用モーダル
  dom.memoTitle.textContent = `${formatDateJP(isoDate)} のメモ`;
  // 内訳を一覧表示。編集ではなく確認用途のモーダル。
  dom.memoBody.innerHTML = `
    <div>配達完了数: ${record.count}</div>
    <div>170円配達枠: ${record.count170}</div>
    <div>集荷枠: ${record.pickupCount}</div>
    <div>その他収入: ${formatYen(record.otherIncome || 0)}</div>
    <div>計算モード: ${record.mode === "feature1" ? "機能1" : "機能2"}</div>
    <div>税抜: ${formatYen(amounts.totalEx)}</div>
    <div>税込: ${formatYen(amounts.totalIn)}</div>
  `;
  dom.memoModal.classList.add("show");
  dom.memoModal.setAttribute("aria-hidden", "false");
}

function closeMemoModal() {
  dom.memoModal.classList.remove("show");
  dom.memoModal.setAttribute("aria-hidden", "true");
}

function calcRecordAmounts(record) {
  // 1日分の金額計算を一箇所に集約（表示と集計で共通利用）
  // modeによって機能1/機能2のどちらを採用するか切り替える。
  const feature1Ex = record.mode === "feature1" ? calcFeature1Ex(record.count) : 0;
  const feature1In = record.mode === "feature1" ? addTax(feature1Ex) : 0;

  const feature2Ex = record.mode === "feature2" ? record.count * 150 : 0;
  const feature2In = record.mode === "feature2" ? record.count * 165 : 0;

  const amount170Ex = record.count170 * 170;
  const amount170In = record.count170 * 187;

  // 集荷は税抜/税込共通で1件90円
  const pickup = record.pickupCount * 90;
  const otherIncome = toNonNegativeInt(record.otherIncome);
  // その他収入は税抜/税込とも同額として加算

  const totalEx = feature1Ex + feature2Ex + amount170Ex + pickup + otherIncome;
  const totalIn = feature1In + feature2In + amount170In + pickup + otherIncome;

  return {
    feature1Ex,
    feature1In,
    feature2Ex,
    feature2In,
    totalEx,
    totalIn
  };
}

function calcFeature1Ex(count) {
  // 機能1ルール: 80以下=14000, 81以上は超過1件ごと+110
  if (count <= 80) return 14000;
  return 14000 + (count - 80) * 110;
}

function addTax(value) {
  // 税込は10%加算（端数は四捨五入）
  return Math.round(value * 1.1);
}

function getRecordsForCurrentMonth() {
  // 表示中月のデータだけ抽出
  const prefix = `${state.viewYear}-${pad2(state.viewMonth + 1)}`;
  return Object.values(state.records)
    // 先頭一致で月を絞る(例: "2026-03")
    .filter((record) => record.date.startsWith(prefix))
    // 日付昇順に並べる
    .sort((a, b) => a.date.localeCompare(b.date));
}

function ensureSelectedDateValid() {
  // 破損データ対策。読み込み値が不正なら「今日」に戻す。
  const parsed = parseISODate(state.selectedDate);
  if (Number.isNaN(parsed.year) || Number.isNaN(parsed.month) || Number.isNaN(parsed.day)) {
    const now = new Date();
    state.selectedDate = toISODate(now.getFullYear(), now.getMonth(), now.getDate());
  }

  if (typeof state.viewYear !== "number" || typeof state.viewMonth !== "number") {
    const now = new Date();
    state.viewYear = now.getFullYear();
    state.viewMonth = now.getMonth();
  }
}

function loadState() {
  // localStorage -> stateへ復元
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    // JSON文字列をオブジェクトへ戻す
    const data = JSON.parse(raw);
    state.records = sanitizeRecords(data.records);
    state.feature1Enabled = Boolean(data.feature1Enabled);
    state.feature2Enabled = Boolean(data.feature2Enabled);
    state.monthlyDeductions = sanitizeDeductions(data.monthlyDeductions);

    if (typeof data.selectedDate === "string") state.selectedDate = data.selectedDate;
    if (typeof data.viewYear === "number") state.viewYear = data.viewYear;
    if (typeof data.viewMonth === "number") state.viewMonth = data.viewMonth;
  } catch (error) {
    console.error("Failed to parse saved data", error);
  }
}

function saveState() {
  // state -> localStorageへ保存
  const payload = {
    records: Object.values(state.records).map((record) => ({
      date: record.date,
      count: record.count,
      count170: record.count170,
      pickupCount: record.pickupCount,
      otherIncome: record.otherIncome || 0,
      mode: record.mode
    })),
    feature1Enabled: state.feature1Enabled,
    feature2Enabled: state.feature2Enabled,
    monthlyDeductions: state.monthlyDeductions,
    selectedDate: state.selectedDate,
    viewYear: state.viewYear,
    viewMonth: state.viewMonth
  };

  // localStorageは文字列しか保存できないためJSON文字列化して保存
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function sanitizeRecords(records) {
  // 壊れたデータが混じっても、最低限使える形に正規化
  const map = {};
  if (!Array.isArray(records)) return map;

  records.forEach((item) => {
    if (!item || typeof item.date !== "string") return;
    // 古い保存データに項目不足があっても0補完で読めるようにする
    map[item.date] = {
      date: item.date,
      count: toNonNegativeInt(item.count),
      count170: toNonNegativeInt(item.count170),
      pickupCount: toNonNegativeInt(item.pickupCount),
      otherIncome: toNonNegativeInt(item.otherIncome),
      mode: item.mode === "feature2" ? "feature2" : "feature1"
    };
  });

  return map;
}

function sanitizeDeductions(deductions) {
  // 控除額を数値化し、負数や不正値を防ぐ
  const safe = {};
  if (!deductions || typeof deductions !== "object") return safe;

  Object.keys(deductions).forEach((key) => {
    safe[key] = toNonNegativeInt(deductions[key]);
  });

  return safe;
}

function showError(message) {
  // エラーは赤で表示
  dom.errorText.style.color = "#b00020";
  dom.errorText.textContent = message;
}

function clearError() {
  dom.errorText.textContent = "";
}

function toNonNegativeInt(value) {
  // 未入力や負数を0へ丸める共通関数
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) return 0;
  return Math.floor(n);
}

function pad2(num) {
  // 1桁を2桁へ(例: 3 => "03")
  return String(num).padStart(2, "0");
}

function toISODate(year, monthIndex, day) {
  // monthIndexは0始まりなので +1 して文字列化
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

function parseISODate(isoDate) {
  // "YYYY-MM-DD" を { year, month, day }へ分解
  const [yearText, monthText, dayText] = String(isoDate).split("-");
  return {
    year: Number(yearText),
    month: Number(monthText) - 1,
    day: Number(dayText)
  };
}

function formatDateJP(isoDate) {
  const p = parseISODate(isoDate);
  return `${p.year}年${p.month + 1}月${p.day}日`;
}

function getMonthKey(year, monthIndex) {
  // 月単位保存キー: YYYY-MM
  return `${year}-${pad2(monthIndex + 1)}`;
}

function getDaysInMonth(year, monthIndex) {
  // 翌月0日=今月末日 を使う定番テクニック
  return new Date(year, monthIndex + 1, 0).getDate();
}

function formatYen(value) {
  // 3桁区切り付きの円表記に統一
  return `¥${Number(value).toLocaleString("ja-JP")}`;
}

function runCalendarAnimation() {
  // 月移動時のみ、方向に応じた短いアニメーションを実行
  if (!calendarAnimationDirection) return;

  const className = calendarAnimationDirection > 0 ? "slide-next" : "slide-prev";
  dom.calendarGrid.classList.remove("slide-next", "slide-prev");
  // 再描画を強制してアニメーションを再実行可能にする
  void dom.calendarGrid.offsetWidth;
  dom.calendarGrid.classList.add(className);
  dom.calendarGrid.addEventListener("animationend", () => {
    dom.calendarGrid.classList.remove("slide-next", "slide-prev");
  }, { once: true });
  calendarAnimationDirection = 0;
}

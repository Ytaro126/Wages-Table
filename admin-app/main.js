const managedUsers = [
    {
        id: 'Ytaro',
        updatedAt: '2026-04-12 01:12',
        monthTotal: 184300,
        yearTotal: 618900,
        lockedDays: 4,
        records: [
            { date: '2026-04-01', deliveries: 73, pickups: 1, taxExcluded: 14000, taxIncluded: 15400, locked: true },
            { date: '2026-04-02', deliveries: 81, pickups: 0, taxExcluded: 14110, taxIncluded: 15521, locked: true },
            { date: '2026-04-03', deliveries: 88, pickups: 2, taxExcluded: 15050, taxIncluded: 16517, locked: false },
            { date: '2026-04-04', deliveries: 77, pickups: 1, taxExcluded: 14090, taxIncluded: 15499, locked: false }
        ]
    },
    {
        id: 'taro',
        updatedAt: '2026-04-11 23:44',
        monthTotal: 153200,
        yearTotal: 491100,
        lockedDays: 2,
        records: [
            { date: '2026-04-01', deliveries: 69, pickups: 0, taxExcluded: 14000, taxIncluded: 15400, locked: true },
            { date: '2026-04-02', deliveries: 72, pickups: 1, taxExcluded: 14090, taxIncluded: 15499, locked: true },
            { date: '2026-04-03', deliveries: 79, pickups: 0, taxExcluded: 14000, taxIncluded: 15400, locked: false }
        ]
    },
    {
        id: 'ops-demo',
        updatedAt: '2026-04-10 18:05',
        monthTotal: 98700,
        yearTotal: 302400,
        lockedDays: 1,
        records: [
            { date: '2026-04-01', deliveries: 55, pickups: 0, taxExcluded: 14000, taxIncluded: 15400, locked: true },
            { date: '2026-04-02', deliveries: 61, pickups: 0, taxExcluded: 14000, taxIncluded: 15400, locked: false }
        ]
    }
];
const loginHistory = [
    { actor: 'ytaro-admin', action: 'login', at: '2026-04-12 03:05', source: 'MacBook / home-wifi' },
    { actor: 'ytaro-admin', action: 'logout', at: '2026-04-11 23:48', source: 'MacBook / home-wifi' },
    { actor: 'unknown', action: 'failed', at: '2026-04-11 22:17', source: 'outside ip blocked' }
];
const alerts = [
    {
        title: 'DNS clientHold 障害',
        severity: 'high',
        createdAt: '2026-04-05 00:18',
        body: 'ドメイン認証切れで名前解決が停止。復旧済みだが運用メモ要更新。'
    },
    {
        title: '誤DB参照検知',
        severity: 'medium',
        createdAt: '2026-04-11 18:40',
        body: 'user-app/data/app.db が新規作成された。DB_PATH 固定が再発防止ポイント。'
    }
];
let currentView = 'users';
let selectedUserId = managedUsers[0]?.id ?? '';
function getById(id) {
    return document.getElementById(id);
}
function yen(value) {
    return `¥${value.toLocaleString('ja-JP')}`;
}
function selectedUser() {
    return managedUsers.find(user => user.id === selectedUserId);
}
function renderUsers(filter = '') {
    const list = getById('userList');
    const counter = getById('userCount');
    if (!list || !counter)
        return;
    const normalized = filter.trim().toLowerCase();
    const users = managedUsers.filter(user => user.id.toLowerCase().includes(normalized));
    counter.textContent = `${users.length} users`;
    list.innerHTML = users.map(user => `
    <button class="user-card ${user.id === selectedUserId ? 'active' : ''}" data-user-id="${user.id}" type="button">
      <h3>${user.id}</h3>
      <p class="user-meta">最終更新: ${user.updatedAt}</p>
      <p class="user-meta">月計 ${yen(user.monthTotal)} / 確定 ${user.lockedDays} 日</p>
    </button>
  `).join('');
    list.querySelectorAll('[data-user-id]').forEach(button => {
        button.addEventListener('click', () => {
            selectedUserId = button.dataset.userId || selectedUserId;
            renderUsers(filter);
            renderUserDetail();
        });
    });
}
function renderUserDetail() {
    const summary = getById('summaryCard');
    const tbody = getById('recordTableBody');
    const user = selectedUser();
    if (!summary || !tbody || !user)
        return;
    summary.innerHTML = `
    <h2 class="summary-title">${user.id}</h2>
    <p class="summary-note">最終更新 ${user.updatedAt}</p>
    <div class="summary-grid">
      <div class="summary-box"><span>月合計</span><strong>${yen(user.monthTotal)}</strong></div>
      <div class="summary-box"><span>年合計</span><strong>${yen(user.yearTotal)}</strong></div>
      <div class="summary-box"><span>確定日数</span><strong>${user.lockedDays}日</strong></div>
      <div class="summary-box"><span>登録件数</span><strong>${user.records.length}件</strong></div>
    </div>
  `;
    tbody.innerHTML = user.records.map(record => `
    <tr>
      <td>${record.date}</td>
      <td>${record.deliveries}</td>
      <td>${record.pickups}</td>
      <td>${yen(record.taxExcluded)}</td>
      <td>${yen(record.taxIncluded)}</td>
      <td><span class="status-tag ${record.locked ? 'locked' : 'open'}">${record.locked ? '確定済み' : '未確定'}</span></td>
    </tr>
  `).join('');
}
function renderHistory() {
    const container = getById('historyList');
    if (!container)
        return;
    container.innerHTML = loginHistory.map(item => `
    <article class="timeline-item">
      <div class="timeline-meta">${item.at} / ${item.source}</div>
      <strong>${item.actor}</strong>
      <p>${item.action === 'login' ? 'ログイン成功' : item.action === 'logout' ? 'ログアウト' : 'ログイン失敗'}</p>
    </article>
  `).join('');
}
function renderAlerts() {
    const container = getById('alertList');
    const counter = getById('alertCount');
    if (!container || !counter)
        return;
    counter.textContent = `${alerts.length} alerts`;
    container.innerHTML = alerts.map(alert => `
    <article class="alert-card ${alert.severity}">
      <div class="alert-meta">${alert.createdAt} / ${alert.severity === 'high' ? '高優先度' : '中優先度'}</div>
      <h3 class="alert-title">${alert.title}</h3>
      <p>${alert.body}</p>
    </article>
  `).join('');
}
function updateHeader() {
    const title = getById('pageTitle');
    const subtitle = getById('pageSubtitle');
    if (!title || !subtitle)
        return;
    const textMap = {
        users: { title: 'ユーザー', subtitle: '登録ユーザーの売上と確定状況を確認します。' },
        history: { title: 'ログイン履歴', subtitle: '31日保持予定のアクセス記録を確認します。' },
        alerts: { title: 'アラート', subtitle: '運用上の異常や確認事項を一覧表示します。' },
        logout: { title: 'ログアウト', subtitle: '管理画面から安全にログアウトします。' }
    };
    title.textContent = textMap[currentView].title;
    subtitle.textContent = textMap[currentView].subtitle;
}
function renderViews() {
    document.querySelectorAll('.view').forEach(view => {
        view.classList.toggle('active', view.id === `view-${currentView}`);
    });
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.view === currentView);
    });
    updateHeader();
}
function openView(nextView) {
    currentView = nextView;
    renderViews();
}
function setupEvents() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const nextView = item.dataset.view;
            if (nextView)
                openView(nextView);
        });
    });
    getById('brandHome')?.addEventListener('click', () => openView('users'));
    getById('userSearch')?.addEventListener('input', event => {
        renderUsers(event.target.value);
    });
    getById('cancelLogout')?.addEventListener('click', () => {
        openView('users');
    });
    getById('confirmLogout')?.addEventListener('click', () => {
        const message = getById('logoutMessage');
        if (message)
            message.textContent = 'モック画面のため、実際のログアウトAPIは未接続です。';
    });
    getById('menuButton')?.addEventListener('click', () => {
        getById('sidebar')?.classList.toggle('open');
    });
}
function init() {
    renderUsers();
    renderUserDetail();
    renderHistory();
    renderAlerts();
    renderViews();
    setupEvents();
}
document.addEventListener('DOMContentLoaded', init);
//# sourceMappingURL=main.js.map
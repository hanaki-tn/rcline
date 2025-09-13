// グローバル変数
let currentUser = null;
let currentSection = 'event-list';
let currentAudienceId = null;
let currentAudienceName = null;
let currentEventId = null;
let allMembers = [];
let audiencesData = [];
let eventsData = [];
let sortStates = {};
let modalCallback = null;

// ========== 認証関連 ==========
async function login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const messageDiv = document.getElementById('login-message');

    try {
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            currentUser = data.user;
            messageDiv.innerHTML = '<span class="success">ログイン成功</span>';
            document.getElementById('login-section').classList.add('hidden');
            document.getElementById('main-section').classList.remove('hidden');
            showToast('ログインしました', 'success');
            showSection('event-list');
        } else {
            messageDiv.innerHTML = `<span class="error">${data.message}</span>`;
            showToast('ログインに失敗しました', 'error');
        }
    } catch (error) {
        messageDiv.innerHTML = `<span class="error">エラー: ${error.message}</span>`;
        showToast('エラーが発生しました', 'error');
    }
}

async function logout() {
    try {
        await fetch('/api/admin/logout', {
            method: 'POST',
            credentials: 'include'
        });
        showToast('ログアウトしました', 'info');
    } catch (error) {
        console.error('ログアウトエラー:', error);
    }

    currentUser = null;
    document.getElementById('login-section').classList.remove('hidden');
    document.getElementById('main-section').classList.add('hidden');
}

// ========== ナビゲーション ==========
function showSection(section) {
    currentSection = section;
    
    // 全セクションを非表示
    document.querySelectorAll('[id$="-section"]').forEach(el => {
        if (el.id !== 'login-section' && el.id !== 'main-section') {
            el.classList.add('hidden');
        }
    });
    
    // 指定セクションを表示
    const sectionElement = document.getElementById(`${section}-section`);
    if (sectionElement) {
        sectionElement.classList.remove('hidden');
    }
    
    // モバイルメニューを閉じる
    document.getElementById('nav-menu').classList.remove('active');
    
    // データ読み込み
    switch(section) {
        case 'members':
            loadMembers();
            break;
        case 'event-list':
            loadEvents();
            break;
        case 'event-new':
            loadEventForm();
            break;
        case 'audience-list':
            loadAudiences();
            break;
        case 'audience-members':
            loadAudienceMembers();
            break;
        case 'event-detail':
            loadEventDetail();
            break;
    }
}

function toggleNav() {
    const nav = document.getElementById('nav-menu');
    nav.classList.toggle('active');
}

// ========== トースト通知 ==========
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = {
        success: '✓',
        error: '✕',
        info: 'ℹ',
        warning: '⚠'
    }[type] || 'ℹ';
    
    toast.innerHTML = `<span style="font-size: 20px;">${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ========== 確認ダイアログ ==========
function confirmAction(message, callback, options = {}) {
    const modal = document.getElementById('confirm-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const confirmBtn = document.getElementById('modal-confirm-btn');
    
    modalTitle.textContent = options.title || '確認';
    modalMessage.textContent = message;
    confirmBtn.textContent = options.confirmText || '実行';
    confirmBtn.className = options.dangerous ? 'danger' : '';
    
    modalCallback = callback;
    modal.classList.add('active');
}

function closeModal(confirmed) {
    const modal = document.getElementById('confirm-modal');
    modal.classList.remove('active');
    
    if (confirmed && modalCallback) {
        modalCallback();
    }
    modalCallback = null;
}

// ========== テーブルソート ==========
function sortTable(tableId, column, type = 'text') {
    const table = document.getElementById(tableId);
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const th = table.querySelectorAll('th')[column];
    
    // ソート状態を取得
    const stateKey = `${tableId}-${column}`;
    const currentState = sortStates[stateKey] || 'none';
    const newState = currentState === 'asc' ? 'desc' : 'asc';
    
    // 全ヘッダーのクラスをリセット
    table.querySelectorAll('th').forEach(h => {
        h.classList.remove('sort-asc', 'sort-desc');
    });
    
    // 新しいソート状態を設定
    sortStates[stateKey] = newState;
    th.classList.add(`sort-${newState}`);
    
    // ソート実行
    rows.sort((a, b) => {
        const aValue = a.cells[column].textContent.trim();
        const bValue = b.cells[column].textContent.trim();
        
        let comparison = 0;
        
        switch(type) {
            case 'number':
                comparison = parseFloat(aValue || 0) - parseFloat(bValue || 0);
                break;
            case 'date':
                comparison = new Date(aValue || 0) - new Date(bValue || 0);
                break;
            default:
                comparison = aValue.localeCompare(bValue, 'ja');
        }
        
        return newState === 'asc' ? comparison : -comparison;
    });
    
    // テーブルを再構築
    rows.forEach(row => tbody.appendChild(row));
}

// ========== 会員管理 ==========
async function loadMembers() {
    const role = document.getElementById('role-filter')?.value || 'member';
    const params = role ? `?role=${role}` : '';

    try {
        const response = await fetch(`/api/admin/members${params}`, {
            credentials: 'include'
        });

        if (!response.ok) throw new Error('認証が必要です');

        const data = await response.json();
        allMembers = data.items;
        displayMembers(data.items);
    } catch (error) {
        console.error('会員一覧取得エラー:', error);
        showToast('会員一覧の取得に失敗しました', 'error');
    }
}

function displayMembers(members) {
    const tbody = document.getElementById('members-tbody');
    
    tbody.innerHTML = members.map(member => `
        <tr>
            <td>${member.id}</td>
            <td>${member.name}</td>
            <td><span class="badge badge-${member.role}">${member.role}</span></td>
            <td><span class="badge badge-${member.line_user_id_present ? 'linked' : 'unlinked'}">${member.line_user_id_present ? '紐付け済み' : '未紐付け'}</span></td>
            <td>${member.is_target ? '○' : '×'}</td>
            <td>${member.display_order || '-'}</td>
        </tr>
    `).join('');
}

function filterMembers() {
    const searchText = document.getElementById('member-search').value.toLowerCase();
    const roleFilter = document.getElementById('role-filter').value;
    const lineFilter = document.getElementById('line-filter').value;
    
    const filtered = allMembers.filter(member => {
        const matchesSearch = !searchText || member.name.toLowerCase().includes(searchText);
        const matchesRole = !roleFilter || member.role === roleFilter;
        const matchesLine = !lineFilter || 
            (lineFilter === 'linked' && member.line_user_id_present) ||
            (lineFilter === 'unlinked' && !member.line_user_id_present);
        
        return matchesSearch && matchesRole && matchesLine;
    });
    
    displayMembers(filtered);
}

// ========== イベント管理 ==========
async function loadEvents() {
    try {
        const response = await fetch('/api/admin/events', {
            credentials: 'include'
        });
        
        if (!response.ok) throw new Error('認証が必要です');
        
        const data = await response.json();
        eventsData = data.items;
        displayEvents(data.items);
    } catch (error) {
        console.error('イベント一覧取得エラー:', error);
        showToast('イベント一覧の取得に失敗しました', 'error');
    }
}

function displayEvents(events) {
    const tbody = document.getElementById('events-tbody');
    
    if (events.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">イベントがありません</td></tr>';
    } else {
        tbody.innerHTML = events.map(event => {
            const heldAt = new Date(event.held_at).toLocaleString('ja-JP');
            const createdAt = new Date(event.created_at).toLocaleString('ja-JP');
            return `
                <tr>
                    <td>${event.id}</td>
                    <td>${event.title}</td>
                    <td>${heldAt}</td>
                    <td>${event.target_count || 0}名</td>
                    <td>${createdAt}</td>
                    <td>
                        <button onclick="showEventDetail(${event.id})">詳細</button>
                    </td>
                </tr>
            `;
        }).join('');
    }
}

function filterEvents() {
    const searchText = document.getElementById('event-search').value.toLowerCase();
    const fromDate = document.getElementById('event-from').value;
    const toDate = document.getElementById('event-to').value;
    
    const filtered = eventsData.filter(event => {
        const matchesSearch = !searchText || event.title.toLowerCase().includes(searchText);
        const eventDate = new Date(event.held_at);
        const matchesFrom = !fromDate || eventDate >= new Date(fromDate);
        const matchesTo = !toDate || eventDate <= new Date(toDate + 'T23:59:59');
        
        return matchesSearch && matchesFrom && matchesTo;
    });
    
    displayEvents(filtered);
}

// イベント作成フォーム初期化
async function loadEventForm() {
    await loadAudiencesForEvents();
    await loadMembersForEvents();
    initializeEventForm();
}

async function loadAudiencesForEvents() {
    try {
        const response = await fetch('/api/admin/audiences', {
            credentials: 'include'
        });
        
        if (!response.ok) return;
        
        const data = await response.json();
        audiencesData = data.items;
        
        const checkboxDiv = document.getElementById('audience-checkboxes');
        checkboxDiv.innerHTML = audiencesData.map(audience => `
            <div style="margin: 5px 0;">
                <label>
                    <input type="checkbox" name="audience-checkbox" value="${audience.id}" onchange="updateTargetPreview()">
                    ${audience.name}
                </label>
            </div>
        `).join('');
    } catch (error) {
        console.error('Audiences読み込みエラー:', error);
    }
}

async function loadMembersForEvents() {
    try {
        const response = await fetch('/api/admin/members?role=member', {
            credentials: 'include'
        });
        
        if (!response.ok) return;
        
        const data = await response.json();
        allMembers = data.items;
    } catch (error) {
        console.error('Members読み込みエラー:', error);
    }
}

function initializeEventForm() {
    // 追加メモ欄の表示/非表示
    document.getElementById('extra-text-enabled').addEventListener('change', function() {
        const options = document.getElementById('extra-text-options');
        options.classList.toggle('hidden', !this.checked);
    });
    
    // フォーム送信
    const form = document.getElementById('event-form');
    form.onsubmit = async function(e) {
        e.preventDefault();
        
        confirmAction('イベントを作成して送信しますか？', async () => {
            await createEvent();
        });
    };
}

async function createEvent() {
    const messageDiv = document.getElementById('event-create-message');
    const form = document.getElementById('event-form');
    const formData = new FormData();
    
    // 基本項目
    formData.append('title', document.getElementById('event-title').value);
    formData.append('body', document.getElementById('event-body').value);
    
    const imageFile = document.getElementById('event-image').files[0];
    if (imageFile) {
        formData.append('image', imageFile);
    }
    
    formData.append('extra_text_label', document.getElementById('extra-text-label').value);
    
    // 対象メンバー取得
    const selectAll = document.getElementById('select-all-members');
    let targetMemberIds = [];
    
    if (selectAll.checked) {
        targetMemberIds = allMembers.map(m => m.id);
    } else {
        const checkedAudiences = document.querySelectorAll('input[name="audience-checkbox"]:checked');
        const selectedAudienceIds = Array.from(checkedAudiences).map(cb => parseInt(cb.value));
        
        if (selectedAudienceIds.length === 0) {
            showToast('配信対象を選択してください', 'error');
            return;
        }
        
        // audienceメンバー取得
        const targetMemberIdsSet = new Set();
        for (const audienceId of selectedAudienceIds) {
            try {
                const response = await fetch(`/api/admin/audiences/${audienceId}/members`, {
                    credentials: 'include'
                });
                
                if (response.ok) {
                    const data = await response.json();
                    data.items.forEach(member => targetMemberIdsSet.add(member.member_id));
                }
            } catch (error) {
                console.error('Audience members取得エラー:', error);
            }
        }
        
        targetMemberIds = Array.from(targetMemberIdsSet);
    }
    
    if (targetMemberIds.length === 0) {
        showToast('対象メンバーが見つかりません', 'error');
        return;
    }
    
    formData.append('target_member_ids', JSON.stringify(targetMemberIds));
    
    // 日時処理
    const heldAtInput = document.getElementById('event-held-at');
    if (heldAtInput.value) {
        const localDateTime = new Date(heldAtInput.value);
        const jstDateTime = new Date(localDateTime.getTime() - localDateTime.getTimezoneOffset() * 60000);
        const iso8601 = jstDateTime.toISOString().slice(0, 19) + '+09:00';
        formData.append('held_at', iso8601);
    }
    
    const deadlineAtInput = document.getElementById('event-deadline-at');
    if (deadlineAtInput.value) {
        const deadlineDate = deadlineAtInput.value + 'T23:59:59+09:00';
        formData.append('deadline_at', deadlineDate);
    }
    
    const extraTextEnabled = document.getElementById('extra-text-enabled').checked;
    formData.append('extra_text_enabled', extraTextEnabled ? 'true' : 'false');
    
    messageDiv.innerHTML = '<div class="info">作成中...</div>';
    
    try {
        const response = await fetch('/api/admin/events', {
            method: 'POST',
            credentials: 'include',
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast('イベントを作成しました', 'success');
            form.reset();
            document.getElementById('extra-text-options').classList.add('hidden');
            document.getElementById('target-preview').innerHTML = '配信対象を選択してください';
            messageDiv.innerHTML = `<div class="success">
                イベントID: ${data.event_id}<br>
                対象者: ${data.targets}名<br>
                送信成功: ${data.push.success}件、失敗: ${data.push.fail}件
            </div>`;
        } else {
            let errorMsg = data.message;
            if (data.details) {
                errorMsg += '<br>' + data.details.map(d => d.msg).join('<br>');
            }
            messageDiv.innerHTML = `<div class="error">${errorMsg}</div>`;
            showToast('イベント作成に失敗しました', 'error');
        }
    } catch (error) {
        messageDiv.innerHTML = `<div class="error">エラー: ${error.message}</div>`;
        showToast('エラーが発生しました', 'error');
    }
}

function toggleAllMembers() {
    const selectAll = document.getElementById('select-all-members');
    const audienceCheckboxes = document.querySelectorAll('input[name="audience-checkbox"]');
    
    audienceCheckboxes.forEach(checkbox => {
        checkbox.checked = selectAll.checked;
    });
    
    updateTargetPreview();
}

async function updateTargetPreview() {
    const previewDiv = document.getElementById('target-preview');
    const selectAll = document.getElementById('select-all-members');
    const checkedAudiences = document.querySelectorAll('input[name="audience-checkbox"]:checked');
    
    if (selectAll.checked) {
        previewDiv.innerHTML = `<p><strong>全員: ${allMembers.length}名</strong></p>`;
        return;
    }
    
    if (checkedAudiences.length === 0) {
        previewDiv.innerHTML = '<p>配信対象を選択してください</p>';
        return;
    }
    
    try {
        const selectedAudienceIds = Array.from(checkedAudiences).map(cb => parseInt(cb.value));
        let targetMemberIds = new Set();
        
        for (const audienceId of selectedAudienceIds) {
            const response = await fetch(`/api/admin/audiences/${audienceId}/members`, {
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                data.items.forEach(member => targetMemberIds.add(member.member_id));
            }
        }
        
        const targetMembers = allMembers.filter(member => targetMemberIds.has(member.id));
        targetMembers.sort((a, b) => (a.display_order || 999) - (b.display_order || 999));
        
        let html = `<p><strong>対象: ${targetMembers.length}名</strong></p>`;
        html += '<div style="max-height: 150px; overflow-y: auto; border: 1px solid #ddd; padding: 5px; border-radius: 6px;">';
        targetMembers.forEach(member => {
            html += `<div>${member.name} (${member.role})</div>`;
        });
        html += '</div>';
        
        previewDiv.innerHTML = html;
    } catch (error) {
        previewDiv.innerHTML = `<div class="error">プレビュー取得エラー: ${error.message}</div>`;
    }
}

// イベント詳細
function showEventDetail(eventId) {
    currentEventId = eventId;
    showSection('event-detail');
}

async function loadEventDetail() {
    if (!currentEventId) return;
    
    const contentDiv = document.getElementById('event-detail-content');
    contentDiv.innerHTML = '読み込み中...';
    
    try {
        const response = await fetch(`/api/admin/events/${currentEventId}`, {
            credentials: 'include'
        });
        
        if (!response.ok) throw new Error('認証が必要です');
        
        const event = await response.json();
        
        // 基本情報
        const basicInfoDiv = document.getElementById('event-basic-info');
        const heldAt = new Date(event.held_at).toLocaleString('ja-JP');
        const deadlineAt = event.deadline_at ? new Date(event.deadline_at).toLocaleString('ja-JP') : '未設定';
        basicInfoDiv.innerHTML = `
            <p><strong>タイトル:</strong> ${event.title}</p>
            <p><strong>開催日時:</strong> ${heldAt}</p>
            <p><strong>回答期限:</strong> ${deadlineAt}</p>
            <p><strong>本文:</strong></p>
            <div style="white-space: pre-wrap; background: #f8f9fa; padding: 10px; border-radius: 6px;">${event.body || '-'}</div>
            <p><strong>追加メモ欄:</strong> ${event.extra_text?.enabled ? `有効（${event.extra_text.label}）` : '無効'}</p>
        `;
        
        // 送信要約
        const pushSummaryDiv = document.getElementById('event-push-summary');
        const lastSent = event.push_stats?.last_sent_at ? new Date(event.push_stats.last_sent_at).toLocaleString('ja-JP') : '未送信';
        pushSummaryDiv.innerHTML = `
            <p><strong>送信結果:</strong> 成功 ${event.push_stats?.success_count || 0}件 / 失敗 ${event.push_stats?.fail_count || 0}件</p>
            <p><strong>最終送信日時:</strong> ${lastSent}</p>
        `;
        
        // 画像
        const imageDisplayDiv = document.getElementById('event-image-display');
        if (event.image_preview_url) {
            imageDisplayDiv.innerHTML = `
                <img src="${event.image_preview_url}" style="max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 6px;">
                ${event.image_url ? `<p><a href="${event.image_url}" target="_blank">全画面で開く</a></p>` : ''}
            `;
        } else {
            imageDisplayDiv.innerHTML = '<p>画像なし</p>';
        }
        
        // 出欠状況
        displayAttendanceStatus(event.current_status || [], event.can_proxy_respond);
        
        contentDiv.innerHTML = '';
        
    } catch (error) {
        contentDiv.innerHTML = `<div class="error">エラー: ${error.message}</div>`;
        showToast('イベント詳細の取得に失敗しました', 'error');
    }
}

function displayAttendanceStatus(statusData, canProxyRespond = false) {
    const summaryDiv = document.getElementById('event-attendance-summary');
    const listDiv = document.getElementById('event-attendance-list');
    
    // 集計
    const attendCount = statusData.filter(s => s.status === 'attend').length;
    const absentCount = statusData.filter(s => s.status === 'absent').length;
    const pendingCount = statusData.filter(s => s.status === 'pending').length;
    
    summaryDiv.innerHTML = `
        <p>
            <span class="status-attend">出席: ${attendCount}名</span> / 
            <span class="status-absent">欠席: ${absentCount}名</span> / 
            <span class="status-pending">未回答: ${pendingCount}名</span> / 
            合計: ${statusData.length}名
        </p>
    `;
    
    // 一覧（LIFFと同じ表示形式）
    if (statusData.length === 0) {
        listDiv.innerHTML = '<p>対象者がいません</p>';
    } else {
        let html = '<table style="width: 100%;"><thead><tr>';
        html += '<th>名前</th><th>出欠</th><th>メモ</th><th>回答日時</th>';
        if (canProxyRespond) html += '<th>代理回答</th>';
        html += '</tr></thead><tbody>';
        
        statusData.forEach(member => {
            const statusText = getStatusText(member.status);
            const statusClass = `status-${member.status || 'pending'}`;
            const respondedAt = member.responded_at ? new Date(member.responded_at).toLocaleString('ja-JP') : '-';
            const lineStatusEmoji = member.is_target ? '🟢' : '⚪';
            const proxyMarker = member.via === 'admin' ? ' ✏️' : '';
            
            html += `<tr>
                <td>${lineStatusEmoji} ${member.name}</td>
                <td><span class="${statusClass}">${statusText}</span>${proxyMarker}</td>
                <td>${member.extra_text || '-'}</td>
                <td>${respondedAt}</td>`;
            
            if (canProxyRespond) {
                html += `<td>
                    <button onclick="proxyRespond(${member.member_id}, '${member.name}', 'attend')" class="success" style="padding: 4px 8px; font-size: 12px;">出席代理</button>
                    <button onclick="proxyRespond(${member.member_id}, '${member.name}', 'absent')" class="danger" style="padding: 4px 8px; font-size: 12px;">欠席代理</button>
                </td>`;
            }
            
            html += '</tr>';
        });
        
        html += '</tbody></table>';
        
        // 凡例
        html += `
            <div style="margin-top: 15px; padding: 10px; background: #f8f9fa; border-radius: 6px; font-size: 12px; color: #6c757d;">
                <strong>凡例:</strong> 🟢：公式LINE登録済み　⚪：公式LINE未登録　✏️：代理回答
            </div>
        `;
        
        listDiv.innerHTML = html;
    }
}

// ステータステキスト（LIFFと同じ）
function getStatusText(status) {
    switch (status) {
        case 'attend': return '出席';
        case 'absent': return '欠席';
        default: return '未回答';
    }
}

// 代理回答
async function proxyRespond(memberId, memberName, status) {
    const statusText = getStatusText(status);
    
    confirmAction(
        `${memberName}さんの代理で「${statusText}」を登録しますか？`,
        async () => {
            try {
                const response = await fetch(`/api/admin/events/${currentEventId}/proxy-response`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        member_id: memberId,
                        status: status,
                        extra_text: ''
                    })
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || '代理回答に失敗しました');
                }
                
                await loadEventDetail();
                showToast(`${memberName}さんの代理回答を登録しました`, 'success');
                
            } catch (error) {
                showToast(`代理回答エラー: ${error.message}`, 'error');
            }
        },
        { confirmText: '登録' }
    );
}

// CSV ダウンロード
function downloadCSV(type) {
    if (!currentEventId) return;
    
    const url = type === 'latest' 
        ? `/api/admin/events/${currentEventId}/export/latest.csv`
        : `/api/admin/events/${currentEventId}/export/history.csv`;
    
    fetch(url, { credentials: 'include' })
        .then(response => {
            if (!response.ok) throw new Error('ダウンロードに失敗しました');
            return response.blob();
        })
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = type === 'latest' 
                ? `event_${currentEventId}_latest.csv`
                : `event_${currentEventId}_history.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            showToast('CSVをダウンロードしました', 'success');
        })
        .catch(error => {
            showToast(`ダウンロードエラー: ${error.message}`, 'error');
        });
}

// ========== Audience管理 ==========
async function loadAudiences() {
    try {
        const response = await fetch('/api/admin/audiences', {
            credentials: 'include'
        });

        if (!response.ok) throw new Error('認証が必要です');

        const data = await response.json();
        const tbody = document.getElementById('audiences-tbody');
        
        tbody.innerHTML = data.items.map(audience => `
            <tr>
                <td>${audience.id}</td>
                <td>${audience.name}</td>
                <td>${audience.sort_order || '-'}</td>
                <td>${new Date(audience.created_at).toLocaleString('ja-JP')}</td>
                <td>
                    <button onclick="manageAudienceMembers(${audience.id}, '${audience.name}')">メンバー管理</button>
                    <button onclick="confirmAction('削除しますか？', () => deleteAudience(${audience.id}), {dangerous: true})" class="danger">削除</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('audiences一覧取得エラー:', error);
        showToast('グループ一覧の取得に失敗しました', 'error');
    }
}

async function createAudience() {
    const name = document.getElementById('audience-name').value;
    const sort_order = document.getElementById('audience-sort').value;
    const messageDiv = document.getElementById('audience-message');

    if (!name) {
        showToast('グループ名は必須です', 'error');
        return;
    }

    try {
        const response = await fetch('/api/admin/audiences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ 
                name, 
                sort_order: sort_order ? parseInt(sort_order) : undefined 
            })
        });

        const data = await response.json();

        if (response.ok) {
            messageDiv.innerHTML = '<span class="success">作成完了</span>';
            document.getElementById('audience-name').value = '';
            document.getElementById('audience-sort').value = '';
            showToast('グループを作成しました', 'success');
            loadAudiences();
        } else {
            messageDiv.innerHTML = `<span class="error">${data.message}</span>`;
            showToast('グループ作成に失敗しました', 'error');
        }
    } catch (error) {
        messageDiv.innerHTML = `<span class="error">エラー: ${error.message}</span>`;
        showToast('エラーが発生しました', 'error');
    }
}

async function deleteAudience(id) {
    try {
        const response = await fetch(`/api/admin/audiences/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (response.ok) {
            showToast('グループを削除しました', 'success');
            loadAudiences();
        } else {
            showToast('削除に失敗しました', 'error');
        }
    } catch (error) {
        showToast('エラーが発生しました', 'error');
    }
}

function manageAudienceMembers(audienceId, audienceName) {
    currentAudienceId = audienceId;
    currentAudienceName = audienceName;
    document.getElementById('current-audience-name').textContent = `${audienceName} (ID: ${audienceId})`;
    showSection('audience-members');
}

async function loadAudienceMembers() {
    if (!currentAudienceId) return;
    
    try {
        // 現在の所属メンバー取得
        const currentResponse = await fetch(`/api/admin/audiences/${currentAudienceId}/members`, {
            credentials: 'include'
        });
        
        if (!currentResponse.ok) throw new Error('認証が必要です');
        
        const currentData = await currentResponse.json();
        
        // 現在の所属メンバー表示
        const currentDiv = document.getElementById('current-members');
        if (currentData.items.length === 0) {
            currentDiv.innerHTML = '<p>所属メンバーはいません</p>';
        } else {
            let html = '<table><thead><tr><th>名前</th><th>役割</th><th>LINE紐付け</th></tr></thead><tbody>';
            currentData.items.forEach(member => {
                html += `<tr>
                    <td>${member.name}</td>
                    <td><span class="badge badge-${member.role}">${member.role}</span></td>
                    <td><span class="badge badge-${member.line_user_id_present ? 'linked' : 'unlinked'}">${member.line_user_id_present ? '紐付け済み' : '未紐付け'}</span></td>
                </tr>`;
            });
            html += '</tbody></table>';
            currentDiv.innerHTML = html;
        }
        
        // 全メンバー取得
        const allResponse = await fetch('/api/admin/members?role=member', {
            credentials: 'include'
        });
        
        if (!allResponse.ok) throw new Error('認証が必要です');
        
        const allData = await allResponse.json();
        const currentMemberIds = new Set(currentData.items.map(m => m.member_id));
        
        const selectionDiv = document.getElementById('member-selection');
        window.audienceMembersList = allData.items; // フィルター用に保存
        
        let selectionHtml = '';
        allData.items.forEach(member => {
            const isSelected = currentMemberIds.has(member.id);
            selectionHtml += `
                <div class="member-checkbox-item" style="margin: 5px 0;">
                    <label>
                        <input type="checkbox" name="member-checkbox" value="${member.id}" ${isSelected ? 'checked' : ''}>
                        ${member.name} (${member.role}) ${member.line_user_id_present ? '✓' : '✗'}
                    </label>
                </div>
            `;
        });
        selectionDiv.innerHTML = selectionHtml;
        
    } catch (error) {
        document.getElementById('current-members').innerHTML = `<div class="error">エラー: ${error.message}</div>`;
        document.getElementById('member-selection').innerHTML = `<div class="error">エラー: ${error.message}</div>`;
    }
}

function filterMemberSelection() {
    const searchText = document.getElementById('member-select-search').value.toLowerCase();
    const items = document.querySelectorAll('.member-checkbox-item');
    
    items.forEach(item => {
        const label = item.querySelector('label').textContent.toLowerCase();
        item.style.display = label.includes(searchText) ? 'block' : 'none';
    });
}

async function saveAudienceMembers() {
    if (!currentAudienceId) return;
    
    const checkboxes = document.querySelectorAll('input[name="member-checkbox"]:checked');
    const memberIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
    const messageDiv = document.getElementById('member-save-message');
    
    try {
        const response = await fetch(`/api/admin/audiences/${currentAudienceId}/members`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ member_ids: memberIds })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            messageDiv.innerHTML = `<div class="success">保存完了: ${data.count}名を割り当てました</div>`;
            showToast('メンバーを保存しました', 'success');
            loadAudienceMembers();
        } else {
            messageDiv.innerHTML = `<div class="error">保存失敗: ${data.message}</div>`;
            showToast('保存に失敗しました', 'error');
        }
    } catch (error) {
        messageDiv.innerHTML = `<div class="error">エラー: ${error.message}</div>`;
        showToast('エラーが発生しました', 'error');
    }
}

// ========== 初期化 ==========
document.addEventListener('DOMContentLoaded', function() {
    // エンターキーでログイン
    document.getElementById('password').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            login();
        }
    });
    
    // モーダル外クリックで閉じる
    document.getElementById('confirm-modal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeModal(false);
        }
    });
});
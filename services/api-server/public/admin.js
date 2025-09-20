// グローバル変数
let currentUser = null;
let currentSection = 'message-send';
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
            messageDiv.innerHTML = '';
            
            
            document.getElementById('login-section').classList.add('hidden');
            document.getElementById('main-section').classList.remove('hidden');
            showToast('ログインしました', 'success');
            showSection('message-send');
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
    
    // 全てのメッセージをクリア
    document.querySelectorAll('[id$="-message"]').forEach(el => {
        el.innerHTML = '';
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
        case 'message-send':
            loadMessageSendSection();
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
    
    toast.innerHTML = `
        <div class="toast-content">
            <div class="toast-message">
                <span style="font-size: 16px; margin-right: 8px;">${icon}</span>
                ${message}
            </div>
            <button class="toast-close" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
    `;
    
    container.appendChild(toast);
    
    // アニメーション開始
    setTimeout(() => toast.classList.add('show'), 10);
    
    // 自動削除
    setTimeout(() => {
        toast.classList.remove('show');
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
    try {
        const response = await fetch('/api/admin/members', {
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
        const response = await fetch('/api/admin/events?sort=id_desc', {
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
        
        const select = document.getElementById('event-audience');
        // 既存のオプションをクリア
        select.innerHTML = '';
        
        // audienceを追加
        audiencesData.forEach(audience => {
            const option = document.createElement('option');
            option.value = audience.id;
            
            // メンバー数を取得して表示
            fetch(`/api/admin/audiences/${audience.id}/members`, {
                credentials: 'include'
            }).then(response => response.json())
              .then(memberData => {
                  const memberCount = memberData.items.length;
                  option.textContent = `${audience.name}（${memberCount}名）`;
              }).catch(() => {
                  option.textContent = audience.name;
              });
            
            select.appendChild(option);
        });
        
        // 最初のオプションをデフォルトで選択
        if (audiencesData.length > 0) {
            select.value = audiencesData[0].id;
            updateTargetPreview();
        }
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
        
        confirmAction('公式LINEへ送信しますか？', async () => {
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
    const eventAudienceSelect = document.getElementById('event-audience');

    if (!eventAudienceSelect.value) {
        showToast('配信対象を選択してください', 'error');
        return;
    }

    // audienceメンバー取得
    let targetMemberIds = [];
    const selectedAudienceId = parseInt(eventAudienceSelect.value);
    try {
        const response = await fetch(`/api/admin/audiences/${selectedAudienceId}/members`, {
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();
            targetMemberIds = data.items.map(member => member.member_id);
        } else {
            showToast('配信対象メンバーの取得に失敗しました', 'error');
            return;
        }
    } catch (error) {
        console.error('Audience members取得エラー:', error);
        showToast('配信対象メンバーの取得に失敗しました', 'error');
        return;
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


async function updateTargetPreview() {
    const previewDiv = document.getElementById('target-preview');
    const eventAudienceSelect = document.getElementById('event-audience');

    if (!eventAudienceSelect || !eventAudienceSelect.value) {
        previewDiv.innerHTML = '<p>配信対象を選択してください</p>';
        return;
    }
    
    try {
        const selectedAudienceId = parseInt(eventAudienceSelect.value);
        const response = await fetch(`/api/admin/audiences/${selectedAudienceId}/members`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            const targetMemberIds = new Set(data.items.map(member => member.member_id));
            const targetMembers = allMembers.filter(member => targetMemberIds.has(member.id));
            targetMembers.sort((a, b) => (a.display_order || 999) - (b.display_order || 999));
            
            let html = `<p><strong>対象: ${targetMembers.length}名</strong></p>`;
            html += '<div style="max-height: 150px; overflow-y: auto; border: 1px solid #ddd; padding: 5px; border-radius: 6px;">';
            targetMembers.forEach(member => {
                html += `<div>${member.name}</div>`;
            });
            html += '</div>';
            
            previewDiv.innerHTML = html;
        } else {
            previewDiv.innerHTML = '<div class="error">メンバー情報の取得に失敗しました</div>';
        }
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
        
        // グローバルに保存（代理回答用）
        window.currentEventData = event;
        
        // 基本情報
        const basicInfoDiv = document.getElementById('event-basic-info');
        const heldAt = new Date(event.held_at).toLocaleString('ja-JP');
        const deadlineAt = event.deadline_at ? new Date(event.deadline_at).toLocaleDateString('ja-JP') : '未設定';
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
                const extraTextEnabled = window.currentEventData?.extra_text?.enabled || false;
                const extraTextLabel = window.currentEventData?.extra_text?.label || '備考';
                
                html += `<td>`;
                
                // 追加メモ欄が有効な場合はテキスト入力欄を表示
                if (extraTextEnabled) {
                    html += `
                        <input type="text" id="proxy-text-${member.member_id}" 
                               placeholder="${extraTextLabel}" 
                               style="width: 120px; margin-right: 5px; padding: 4px; font-size: 12px;"
                               value="${member.extra_text || ''}">
                    `;
                }
                
                html += `
                    <button onclick="proxyRespond(${member.member_id}, '${member.name}', 'attend')" class="success" style="padding: 4px 8px; font-size: 12px; color: white;">出席代理</button>
                    <button onclick="proxyRespond(${member.member_id}, '${member.name}', 'absent')" class="danger" style="padding: 4px 8px; font-size: 12px; color: white;">欠席代理</button>
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
    
    // 追加メモ欄が有効な場合はテキストを取得
    let extraText = '';
    const extraTextEnabled = window.currentEventData?.extra_text?.enabled || false;
    if (extraTextEnabled) {
        const textInput = document.getElementById(`proxy-text-${memberId}`);
        if (textInput) {
            extraText = textInput.value.trim();
        }
    }
    
    let confirmMsg = `${memberName}さんの代理で「${statusText}」を登録しますか？`;
    if (extraText) {
        confirmMsg += `\n${window.currentEventData?.extra_text?.label || '備考'}: ${extraText}`;
    }
    
    confirmAction(
        confirmMsg,
        async () => {
            try {
                const response = await fetch(`/api/admin/events/${currentEventId}/proxy-response`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        member_id: memberId,
                        status: status,
                        extra_text: extraText
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
                <td>
                    <input type="number" 
                           value="${audience.sort_order || ''}" 
                           style="width: 60px; text-align: center;"
                           onchange="updateAudienceSortOrder(${audience.id}, this.value)"
                           placeholder="順番">
                </td>
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
            messageDiv.innerHTML = '';
            showToast('送信グループを作成しました', 'success');
            document.getElementById('audience-name').value = '';
            document.getElementById('audience-sort').value = '';
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
            // サーバーからの詳細エラー情報を表示
            let errorMessage = '削除に失敗しました';
            try {
                const errorData = await response.json();
                if (errorData.message) {
                    errorMessage = errorData.message;
                }
                if (errorData.details) {
                    console.error('削除エラー詳細:', errorData.details);
                }
            } catch (jsonError) {
                console.error('エラーレスポンス解析失敗:', jsonError);
            }
            showToast(errorMessage, 'error');
        }
    } catch (error) {
        console.error('削除リクエストエラー:', error);
        showToast('エラーが発生しました', 'error');
    }
}

async function updateAudienceSortOrder(audienceId, sortOrder) {
    try {
        const response = await fetch(`/api/admin/audiences/${audienceId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ sort_order: parseInt(sortOrder) || null })
        });

        if (response.ok) {
            showToast('表示順を更新しました', 'success');
        } else {
            const data = await response.json();
            showToast(`更新に失敗しました: ${data.message}`, 'error');
            // エラー時は元の値に戻すため再読み込み
            loadAudiences();
        }
    } catch (error) {
        showToast('エラーが発生しました', 'error');
        loadAudiences();
    }
}

function manageAudienceMembers(audienceId, audienceName) {
    currentAudienceId = audienceId;
    currentAudienceName = audienceName;
    document.getElementById('current-audience-name').textContent = audienceName;
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
        
        // 全メンバー取得（role=memberのみ）
        const allResponse = await fetch('/api/admin/members?role=member', {
            credentials: 'include'
        });
        
        if (!allResponse.ok) throw new Error('認証が必要です');
        
        const allData = await allResponse.json();
        const currentMemberIds = new Set(currentData.items.map(m => m.member_id));
        
        const selectionDiv = document.getElementById('member-selection');
        window.audienceMembersList = allData.items; // フィルター用に保存
        
        // 統合リスト（チェックボックス + LINE状態 + 名前）
        let selectionHtml = '<table style="width: 100%;"><thead><tr>';
        selectionHtml += '<th style="width: 30px;"><input type="checkbox" id="select-all-members" onchange="toggleAllMemberSelection()"></th>'; // 全選択チェックボックス列
        selectionHtml += '<th style="width: 30px;">LINE</th>';  // LINE紐付け状態
        selectionHtml += '<th>名前</th>';
        selectionHtml += '</tr></thead><tbody>';
        
        allData.items.forEach(member => {
            const isSelected = currentMemberIds.has(member.id);
            const lineStatus = member.line_user_id_present ? '🟢' : '⚪';
            
            selectionHtml += `
                <tr class="member-checkbox-item">
                    <td style="text-align: center;">
                        <input type="checkbox" name="member-checkbox" value="${member.id}" ${isSelected ? 'checked' : ''}>
                    </td>
                    <td style="text-align: center;">${lineStatus}</td>
                    <td>${member.name}</td>
                </tr>
            `;
        });
        
        selectionHtml += '</tbody></table>';
        selectionDiv.innerHTML = selectionHtml;
        
    } catch (error) {
        document.getElementById('member-selection').innerHTML = `<div class="error">エラー: ${error.message}</div>`;
    }
}

// 全選択/全解除の制御関数
function toggleAllMemberSelection() {
    const selectAll = document.getElementById('select-all-members');
    const checkboxes = document.querySelectorAll('input[name="member-checkbox"]');

    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAll.checked;
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
            messageDiv.innerHTML = '';
            showToast(`保存完了: ${data.count}名を割り当てました`, 'success');
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

// ================== メッセージ送信機能 ==================

// メッセージ送信セクション初期化
async function loadMessageSendSection() {
    await loadMessageAudiences();
    initMessageForm();
}

// audience一覧読み込み
async function loadMessageAudiences() {
    try {
        const response = await fetch('/api/admin/messages/audiences', {
            credentials: 'include'
        });
        
        if (!response.ok) throw new Error('audience取得に失敗しました');
        
        const data = await response.json();
        const select = document.getElementById('message-audience');
        
        // 既存のオプションをクリア
        select.innerHTML = '';
        
        // audienceを追加
        data.audiences.forEach(audience => {
            const option = document.createElement('option');
            option.value = audience.id;
            option.textContent = `${audience.name}（${audience.member_count}名）`;
            select.appendChild(option);
        });
        
        // デフォルト選択（sort_orderが最小のもの）
        if (data.audiences.length > 0) {
            select.value = data.audiences[0].id;
        }
        
    } catch (error) {
        console.error('audience読み込みエラー:', error);
        showToast('audience一覧の取得に失敗しました', 'error');
    }
}

// メッセージフォーム初期化
function initMessageForm() {
    const form = document.getElementById('message-form');
    const textTab = document.getElementById('text-tab');
    const imageTab = document.getElementById('image-tab');
    const messageText = document.getElementById('message-text');
    const messageImage = document.getElementById('message-image');
    const uploadArea = document.querySelector('.file-upload-area');
    const charRemaining = document.getElementById('char-remaining');
    
    // タブ切り替え
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            switchMessageTab(tabName);
        });
    });
    
    // 文字数カウント
    messageText.addEventListener('input', () => {
        const remaining = 500 - messageText.value.length;
        charRemaining.textContent = remaining;
        
        const charCount = document.querySelector('.char-count');
        charCount.className = 'char-count';
        if (remaining < 50) charCount.classList.add('warning');
        if (remaining < 0) charCount.classList.add('danger');
    });
    
    // 画像アップロード
    messageImage.addEventListener('change', handleImageUpload);
    
    // ドラッグ&ドロップ
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            messageImage.files = files;
            handleImageUpload();
        }
    });
    
    // フォーム送信
    form.onsubmit = async function(e) {
        e.preventDefault();
        await sendMessage();
    };
}

// タブ切り替え
function switchMessageTab(tabName) {
    // タブボタンの状態更新
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // タブコンテンツの表示切り替え
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');
}

// 画像アップロード処理
function handleImageUpload() {
    const fileInput = document.getElementById('message-image');
    const preview = document.getElementById('image-preview');
    const previewImg = document.getElementById('preview-img');
    const imageInfo = document.getElementById('image-info');
    
    const file = fileInput.files[0];
    if (!file) {
        preview.classList.add('hidden');
        return;
    }
    
    // ファイルサイズチェック（5MB）
    if (file.size > 5 * 1024 * 1024) {
        showToast('ファイルサイズが5MBを超えています', 'error');
        fileInput.value = '';
        preview.classList.add('hidden');
        return;
    }
    
    // プレビュー表示
    const reader = new FileReader();
    reader.onload = (e) => {
        previewImg.src = e.target.result;
        imageInfo.textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
        preview.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

// メッセージ送信
async function sendMessage() {
    const form = document.getElementById('message-form');
    const audienceSelect = document.getElementById('message-audience');
    const includeSender = true; // 常に送信者にも送信
    const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
    const messageText = document.getElementById('message-text');
    const messageImage = document.getElementById('message-image');
    
    // バリデーション
    if (!audienceSelect.value) {
        showToast('送信先を選択してください', 'error');
        return;
    }
    
    if (activeTab === 'text' && !messageText.value.trim()) {
        showToast('メッセージを入力してください', 'error');
        return;
    }
    
    if (activeTab === 'image' && !messageImage.files[0]) {
        showToast('画像を選択してください', 'error');
        return;
    }
    
    // 送信確認
    const audienceName = audienceSelect.selectedOptions[0].textContent;
    const confirmMessage = `${audienceName}に送信します。よろしいですか？`;
    
    confirmAction(confirmMessage, async () => {
        const formData = new FormData();
        formData.append('type', activeTab);
        formData.append('audience_id', audienceSelect.value);
        formData.append('include_sender', includeSender);
        
        if (activeTab === 'text') {
            formData.append('message_text', messageText.value.trim());
        } else {
            formData.append('image', messageImage.files[0]);
        }
        
        try {
            const submitBtn = document.getElementById('send-message-btn');
            submitBtn.disabled = true;
            submitBtn.textContent = '送信中...';
            
            const response = await fetch('/api/admin/messages/send', {
                method: 'POST',
                credentials: 'include',
                body: formData
            });
            
            const result = await response.json();
            
            if (result.success) {
                const successMsg = result.fail_count > 0 
                    ? `送信完了（成功: ${result.success_count}名、失敗: ${result.fail_count}名）`
                    : `送信完了（${result.success_count}名）`;
                showToast(successMsg, 'success');
                
                // フォームリセット
                form.reset();
                document.getElementById('image-preview').classList.add('hidden');
                document.getElementById('char-remaining').textContent = '500';
                switchMessageTab('image');
            } else {
                showToast(result.error || '送信に失敗しました', 'error');
            }
            
        } catch (error) {
            console.error('送信エラー:', error);
            showToast('通信エラーが発生しました', 'error');
        } finally {
            const submitBtn = document.getElementById('send-message-btn');
            submitBtn.disabled = false;
            submitBtn.innerHTML = `送信 <span id="test-mode-badge" style="background: orange; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; margin-left: 5px; display: none;">🧪テストモード</span>`;
        }
    });
}

// ページ読み込み完了時にフォームのイベントリスナーを設定
document.addEventListener('DOMContentLoaded', function() {
    // ログインフォームの送信をハンドリング
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault(); // デフォルトのフォーム送信を阻止
            
            // 既存のlogin()関数を呼び出し
            await login();
        });
    }
});
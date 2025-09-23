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

// ========== イベント作成リファクタリング: Step 1 基盤整備 ==========
// DOM要素ID定数
const EL = {
  form: 'event-form',
  chkExtra: 'extra-text-enabled',
  extraOpts: 'extra-text-options',
  extraLabel: 'extra-text-label',
  audience: 'event-audience',
  heldAt: 'event-held-at',         // <input type="datetime-local">
  deadlineAt: 'event-deadline-at', // <input type="date">
  body: 'event-body',
  title: 'event-title',
  image: 'event-image',
  preview: 'target-preview',
  msg: 'event-create-message',
  submitBtn: 'event-create-button',
};

// DOMヘルパー
const $ = (id) => document.getElementById(id);

// 日付ユーティリティ（JST固定）
const toJstIsoFromDatetimeLocal = (value) => {
  if (!value) return null;
  // value例: "2025-09-21T18:30"
  const [d, t] = value.split('T');
  return `${d}T${t}:00+09:00`;
};

const endOfDayJstIsoFromDate = (value) => {
  if (!value) return null;
  return `${value}T23:59:59+09:00`;
};

// 日付フォーマット関数の共通化
const fmtDateTimeJp = (dateStr) => {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString('ja-JP');
  } catch {
    return '—';
  }
};

const fmtDateJp = (dateStr) => {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('ja-JP');
  } catch {
    return '—';
  }
};

// イベントフォーム状態オブジェクト
let eventFormState = {
  title: '',
  body: '',
  imageFile: null,
  held_at: null,            // ISO8601 JST
  deadline_at: null,        // ISO8601 JST(23:59:59)
  audience_id: null,
  extra_text_enabled: false,
  extra_text_label: '備考',
  target_member_ids: [],    // 送信対象の最終配列
};

// イベント一覧状態管理
let eventsListState = {
  isLoading: false,
  hasError: false,
  errorMessage: ''
};

// メッセージ送信状態管理
let messageState = {
  isLoading: false,
  isSubmitting: false,
  selectedAudienceId: null,
  audienceLoaded: false
};

// ブラッシュアップ: 送信制御フラグ
let isSubmitting = false;
let isAudienceLoaded = false;
let isMembersResolved = false;
let eventFormBound = false; // リスナー多重登録防止

// ブラウザ戻る/進むボタン対応
window.addEventListener('popstate', (e) => {
    if (e.state?.section) {
        showSection(e.state.section, true);
    }
});

// ページ表示時の初期化（BFCache対応）
window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        // BFCacheから復帰時の処理
        if (currentSection === 'audience-manage') {
            showAudienceList();
        }
    }
});

// ブラッシュアップ: DOM→状態の同期関数（初期化時＆送信直前に実行）
function hydrateFromDOM() {
  // DOM要素が存在しない場合のガード（他のセクション表示時）
  if (!$(EL.title) || !$(EL.body)) return;

  eventFormState.title = $(EL.title).value?.trim() || '';
  eventFormState.body = $(EL.body).value?.trim() || '';
  eventFormState.imageFile = $(EL.image).files?.[0] ?? null;
  eventFormState.held_at = toJstIsoFromDatetimeLocal($(EL.heldAt).value || '');
  eventFormState.deadline_at = endOfDayJstIsoFromDate($(EL.deadlineAt).value || '');
  eventFormState.audience_id = $(EL.audience).value || null;
  eventFormState.extra_text_enabled = $(EL.chkExtra).checked;
  eventFormState.extra_text_label = $(EL.extraLabel).value?.trim() || '備考';

  // UI同期
  $(EL.extraOpts).classList.toggle('hidden', !eventFormState.extra_text_enabled);
}

// ブラッシュアップ: 送信ボタンの有効/無効制御
function setSubmitButtonEnabled() {
  const btn = $(EL.submitBtn);
  if (!btn) return;

  const ready = isAudienceLoaded && isMembersResolved && !isSubmitting;
  btn.disabled = !ready;

  // ブラッシュアップ: ボタンラベルで状態を可視化
  if (isSubmitting) {
    btn.textContent = '送信中...';
  } else if (!isAudienceLoaded || !isMembersResolved) {
    btn.textContent = '読み込み中...';
  } else {
    btn.textContent = 'イベント作成＆送信';
  }
}

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
function showSection(section, skipHistory = false) {
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

    // History API対応（ブラウザ戻る/進む）
    if (!skipHistory && window.history) {
        history.pushState({section}, '', `#${section}`);
    }

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
        case 'message-history':
            messageHistoryOffset = 0;
            loadMessageHistory();
            break;
        case 'audience-manage':
            showAudienceList();
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

// DOM Ready イベントで初期化
document.addEventListener('DOMContentLoaded', function() {
    // フォーム初期化
    initAudienceForm();

    // URL のハッシュから初期セクションを復元
    const hash = window.location.hash.substring(1);
    if (hash && hash !== 'login') {
        currentSection = hash;
    }
});

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
// APIクライアント層
const api = {
    async getEvents() {
        const response = await fetch('/api/admin/events', {
            credentials: 'include'
        });
        if (!response.ok) {
            if (response.status === 401) throw new Error('認証が必要です');
            throw new Error('イベント一覧の取得に失敗しました');
        }
        return response.json();
    },

    async getEventDetail(eventId) {
        const response = await fetch(`/api/admin/events/${eventId}`, {
            credentials: 'include'
        });
        if (!response.ok) {
            if (response.status === 401) throw new Error('認証が必要です');
            throw new Error('イベント詳細の取得に失敗しました');
        }
        return response.json();
    },

    async postProxyResponse(eventId, memberId, status, extraText) {
        const response = await fetch('/api/admin/proxy-response', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                event_id: eventId,
                member_id: memberId,
                status: status,
                extra_text: extraText || ''
            })
        });
        if (!response.ok) {
            throw new Error('代理回答の送信に失敗しました');
        }
        return response.json();
    },

    async getMessageAudiences() {
        const response = await fetch('/api/admin/messages/audiences', {
            credentials: 'include'
        });
        if (!response.ok) {
            if (response.status === 401) throw new Error('認証が必要です');
            throw new Error('送信先一覧の取得に失敗しました');
        }
        return response.json();
    },

    async sendMessage(formData) {
        const response = await fetch('/api/admin/messages/send', {
            method: 'POST',
            credentials: 'include',
            body: formData
        });
        if (!response.ok) {
            if (response.status === 401) throw new Error('認証が必要です');
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'メッセージ送信に失敗しました');
        }
        return response.json();
    }
};

async function loadEvents() {
    eventsListState.isLoading = true;
    eventsListState.hasError = false;

    try {
        const data = await api.getEvents();
        eventsData = data.items;
        displayEvents(data.items);
    } catch (error) {
        console.error('イベント一覧取得エラー:', error);
        eventsListState.hasError = true;
        eventsListState.errorMessage = error.message;
        showToast(error.message, 'error');
    } finally {
        eventsListState.isLoading = false;
    }
}

function displayEvents(events) {
    const tbody = document.getElementById('events-tbody');

    if (events.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">イベントがありません</td></tr>';
    } else {
        tbody.innerHTML = events.map(event => {
            const heldAt = fmtDateTimeJp(event.held_at);
            const deadlineAt = fmtDateTimeJp(event.deadline_at);
            return `
                <tr>
                    <td>${event.id}</td>
                    <td>${event.title}</td>
                    <td>${heldAt}</td>
                    <td>${deadlineAt}</td>
                    <td>${event.target_count || 0}名</td>
                    <td>
                        <button onclick="showEventDetail(${event.id})">詳細</button>
                    </td>
                </tr>
            `;
        }).join('');
    }
}

// filterEvents関数は検索機能削除に伴い廃止

// イベント作成フォーム初期化
async function loadEventForm() {
    // ブラッシュアップ: membersを先に読み込み（renderTargetPreviewで必要）
    await loadMembersForEvents();
    await loadAudiencesForEvents();
    initializeEventForm();
}

async function loadAudiencesForEvents() {
    isAudienceLoaded = false;
    setSubmitButtonEnabled();

    try {
        const response = await fetch('/api/admin/audiences', {
            credentials: 'include'
        });

        if (!response.ok) {
            // ブラッシュアップ: 非200レスポンスの適切な処理
            showToast('配信グループの取得に失敗しました（認証が必要かも）', 'error');
            isAudienceLoaded = false;
            setSubmitButtonEnabled();
            return;
        }
        
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
            // 状態管理版: audience_idを設定してプレビュー更新
            eventFormState.audience_id = audiencesData[0].id;
            const memberIds = await resolveTargetMemberIds(eventFormState.audience_id);
            eventFormState.target_member_ids = memberIds;
            renderTargetPreview(memberIds);
        } else {
            // ブラッシュアップ: デフォルト選択を行わない場合も対象未解決扱い
            isMembersResolved = false;
        }

        // 読み込み完了
        isAudienceLoaded = true;
        // ブラッシュアップ: audience未選択時は対象未解決扱い
        if (audiencesData.length === 0) {
            isMembersResolved = false; // audience未選択＝対象未解決扱い
        }
        setSubmitButtonEnabled();
    } catch (error) {
        console.error('Audiences読み込みエラー:', error);
        // ブラッシュアップ: 非同期エラーの見える化
        showToast('配信グループの取得に失敗しました', 'error');
        isAudienceLoaded = false;
        setSubmitButtonEnabled();
    }
}

async function loadMembersForEvents() {
    try {
        const response = await fetch('/api/admin/members?role=member', {
            credentials: 'include'
        });

        if (!response.ok) {
            // ブラッシュアップ: 非200レスポンスの適切な処理
            showToast('メンバー情報の取得に失敗しました（認証が必要かも）', 'error');
            return;
        }
        
        const data = await response.json();
        allMembers = data.items;
    } catch (error) {
        console.error('Members読み込みエラー:', error);
        // ブラッシュアップ: 非同期エラーの見える化
        showToast('メンバー情報の取得に失敗しました', 'error');
    }
}

// バックアップ: 旧版initializeEventForm
function initializeEventFormOld() {
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

// Step 3: ブラッシュアップ版initializeEventForm
function initializeEventForm() {
    // ブラッシュアップ: 初回のDOM→状態取り込み
    hydrateFromDOM();

    // ブラッシュアップ: リスナー多重登録防止
    if (!eventFormBound) {
        // 入力ハンドラ（全inputでhydrateFromDOMを呼ぶ）
        $(EL.title).addEventListener('input', hydrateFromDOM);
        $(EL.body).addEventListener('input', hydrateFromDOM);
        $(EL.image).addEventListener('change', hydrateFromDOM);
        $(EL.heldAt).addEventListener('change', hydrateFromDOM);
        $(EL.deadlineAt).addEventListener('change', hydrateFromDOM);
        $(EL.chkExtra).addEventListener('change', hydrateFromDOM);
        $(EL.extraLabel).addEventListener('input', hydrateFromDOM);

        // audience変更時は特別処理
        $(EL.audience).addEventListener('change', onAudienceChange);

        // 送信ハンドラ
        $(EL.form).onsubmit = async (ev) => {
            ev.preventDefault();
            // confirmActionを使う場合
            confirmAction('公式LINEへ送信しますか？', () => createEvent());
        };

        eventFormBound = true;
    }

    // 初期状態でボタンを無効化
    setSubmitButtonEnabled();
}

// Step 3: 受信者プレビュー・対象更新（ブラッシュアップ版）
async function onAudienceChange(e) {
    hydrateFromDOM(); // 状態を同期
    eventFormState.audience_id = e.target.value || null;
    // audience_idに応じて対象メンバーIDsを取得する既存処理を呼ぶ
    const memberIds = await resolveTargetMemberIds(eventFormState.audience_id);
    eventFormState.target_member_ids = memberIds;
    renderTargetPreview(memberIds);
}

async function resolveTargetMemberIds(audienceId) {
    if (!audienceId) {
        isMembersResolved = false;
        setSubmitButtonEnabled();
        return [];
    }

    isMembersResolved = false;
    setSubmitButtonEnabled();

    try {
        const response = await fetch(`/api/admin/audiences/${audienceId}/members`, {
            credentials: 'include'
        });
        if (response.ok) {
            const data = await response.json();
            const memberIds = data.items.map(member => member.member_id);
            isMembersResolved = true;
            setSubmitButtonEnabled();
            return memberIds;
        } else {
            // ブラッシュアップ: 非200レスポンスの適切な処理
            showToast('配信対象メンバーの取得に失敗しました（認証が必要かも）', 'error');
        }
    } catch (error) {
        console.error('Audience members取得エラー:', error);
        // ブラッシュアップ: 非同期エラーの見える化
        showToast('配信対象メンバーの取得に失敗しました', 'error');
    }

    isMembersResolved = false;
    setSubmitButtonEnabled();
    return [];
}

function renderTargetPreview(memberIds) {
    const previewDiv = $(EL.preview);
    if (!memberIds?.length) {
        previewDiv.innerHTML = '<p>配信対象を選択してください</p>';
        return;
    }

    // ブラッシュアップ: 型ゆらぎガード（文字列/数値の安全な比較）
    const idSet = new Set(memberIds.map(v => Number(v)));
    const targetMembers = allMembers.filter(member => idSet.has(Number(member.id)));
    targetMembers.sort((a, b) => (a.display_order || 999) - (b.display_order || 999));

    let html = `<p><strong>対象: ${targetMembers.length}名</strong></p>`;
    html += '<div style="max-height: 150px; overflow-y: auto; border: 1px solid #ddd; padding: 5px; border-radius: 6px;">';
    targetMembers.forEach(member => {
        html += `<div>${member.name}</div>`;
    });
    html += '</div>';

    previewDiv.innerHTML = html;
}

// バックアップ: 旧版createEvent
async function createEventOld() {
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

// Step 4: ブラッシュアップ版createEvent
async function createEvent() {
    // 二重送信防止
    if (isSubmitting) return;

    // 送信直前の最終DOM→状態同期
    hydrateFromDOM();

    // audience選択時のメンバー再解決（レース条件対策）
    if (eventFormState.audience_id && !eventFormState.target_member_ids?.length) {
        eventFormState.target_member_ids = await resolveTargetMemberIds(eventFormState.audience_id);
    }

    const btn = $(EL.submitBtn);

    try {
        isSubmitting = true;
        btn.disabled = true;
        // ブラッシュアップ: 送信中ラベルの即時反映
        setSubmitButtonEnabled();

        const errors = validateEvent(eventFormState);
        if (errors.length) {
            showToast(errors[0], 'error');
            $(EL.msg).innerHTML = `<div class="error">${errors.join('<br>')}</div>`;
            return;
        }

        const formData = new FormData();
        formData.append('title', eventFormState.title);
        formData.append('body', eventFormState.body);
        if (eventFormState.imageFile) {
            formData.append('image', eventFormState.imageFile);
        }
        formData.append('held_at', eventFormState.held_at);
        formData.append('deadline_at', eventFormState.deadline_at);
        // ブラッシュアップ: booleanを明示的な文字列に
        formData.append('extra_text_enabled', eventFormState.extra_text_enabled ? 'true' : 'false');
        formData.append('extra_text_label', eventFormState.extra_text_label);
        formData.append('target_member_ids', JSON.stringify(eventFormState.target_member_ids));

        $(EL.msg).innerHTML = '<div class="info">作成中...</div>';

        const response = await fetch('/api/admin/events', {
            method: 'POST',
            credentials: 'include',
            body: formData
        });

        // ブラッシュアップ: エラーレスポンスのパース耐性向上
        let data = null;
        let responseText = '';
        try {
            data = await response.json();
        } catch (jsonError) {
            // JSONパースに失敗した場合はテキストとして取得
            try {
                responseText = await response.text();
            } catch {
                responseText = '';
            }
        }

        if (response.ok) {
            showToast('イベントを作成しました', 'success');

            // ブラッシュアップ: dataが無い/型が違うケースを吸収
            const eventId = data && data.event_id;
            const targets = data && typeof data.targets === 'number' ? data.targets : null;
            const pushSuccess = data && data.push ? data.push.success : null;
            const pushFail = data && data.push ? data.push.fail : null;

            const summaryHtml = (eventId || targets != null || pushSuccess != null)
                ? `<div class="success">
                     ${eventId ? `イベントID: ${eventId}<br>` : ''}
                     ${targets != null ? `対象者: ${targets}名<br>` : ''}
                     ${(pushSuccess != null && pushFail != null) ? `送信成功: ${pushSuccess}件、失敗: ${pushFail}件` : ''}
                   </div>`
                : `<div class="success">イベントを作成しました</div>`;

            $(EL.msg).innerHTML = summaryHtml;
            resetEventForm();
        } else {
            // エラーメッセージの優先順位: data.message > responseText > デフォルト
            const errorMsg = (data && data.message) || responseText || 'イベント作成に失敗しました';
            throw new Error(errorMsg);
        }

    } catch (error) {
        console.error('イベント作成エラー:', error);
        showToast('イベント作成に失敗しました', 'error');
        $(EL.msg).innerHTML = `<div class="error">${error.message}</div>`;
    } finally {
        isSubmitting = false;
        setSubmitButtonEnabled();
    }
}

function validateEvent(state) {
    const errors = [];
    if (!state.title?.trim()) errors.push('タイトルは必須です');
    if (!state.body?.trim()) errors.push('本文は必須です');

    // ブラッシュアップ: 画像必須チェック＆サイズ・形式チェック
    if (!state.imageFile) {
        errors.push('画像は必須です（JPG/PNG、5MB以下）');
    } else {
        // ファイルサイズチェック（5MB）
        if (state.imageFile.size > 5 * 1024 * 1024) {
            errors.push('画像サイズが5MBを超えています');
        }
        // ファイル形式チェック（JPG/PNG）
        if (!/^image\/(jpe?g|png)$/i.test(state.imageFile.type)) {
            errors.push('画像はJPG/PNGのみ対応です');
        }
    }

    if (!state.held_at) errors.push('開催日時を入力してください');
    if (!state.deadline_at) errors.push('回答期限日を入力してください');
    if (!state.audience_id) errors.push('配信対象を選択してください');
    if (!state.target_member_ids?.length) errors.push('配信対象メンバーが空です');
    return errors;
}

function resetEventForm() {
    // 状態リセット
    eventFormState = {
        title: '',
        body: '',
        imageFile: null,
        held_at: null,
        deadline_at: null,
        audience_id: null,
        extra_text_enabled: false,
        extra_text_label: '備考',
        target_member_ids: [],
    };
    // UIリセット
    $(EL.form).reset();
    $(EL.extraOpts).classList.add('hidden');

    // ブラッシュアップ: リセット後の状態同期
    hydrateFromDOM();

    // audience選択状態を確認し、必要に応じてプレビューを更新
    if (eventFormState.audience_id) {
        resolveTargetMemberIds(eventFormState.audience_id).then(ids => {
            eventFormState.target_member_ids = ids;
            renderTargetPreview(ids);
        });
    } else {
        $(EL.preview).innerHTML = '<p>配信対象を選択してください</p>';
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
        const event = await api.getEventDetail(currentEventId);
        
        // グローバルに保存（代理回答用）
        window.currentEventData = event;
        
        // 基本情報
        const basicInfoDiv = document.getElementById('event-basic-info');
        const heldAt = fmtDateTimeJp(event.held_at);
        const deadlineAt = fmtDateTimeJp(event.deadline_at);
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
// downloadCSV関数はCSV機能削除に伴い廃止

// ========== Audience管理 ==========

// Audience管理の状態
const audienceState = {
    isLoading: false,
    isEditing: false,
    currentAudienceId: null,
    audiences: [],
    allMembers: [],
    selectedMemberIds: new Set()
};

// API層の分離
const audienceApi = {
    async getAll() {
        const response = await fetch('/api/admin/audiences', {
            credentials: 'include'
        });
        if (!response.ok) throw new Error('一覧取得失敗');
        return response.json();
    },

    async getMembers(audienceId) {
        const response = await fetch(`/api/admin/audiences/${audienceId}/members`, {
            credentials: 'include'
        });
        if (!response.ok) throw new Error('メンバー取得失敗');
        return response.json();
    },

    async getAllMembers() {
        const response = await fetch('/api/admin/members', {
            credentials: 'include'
        });
        if (!response.ok) throw new Error('全メンバー取得失敗');
        return response.json();
    },

    async create(data) {
        const response = await fetch('/api/admin/audiences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error('作成失敗');
        return response.json();
    },

    async update(audienceId, data) {
        const response = await fetch(`/api/admin/audiences/${audienceId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error('更新失敗');
        return response.json();
    },

    async updateMembers(audienceId, memberIds) {
        const response = await fetch(`/api/admin/audiences/${audienceId}/members`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ member_ids: memberIds })
        });
        if (!response.ok) throw new Error('メンバー更新失敗');
        return response.json();
    },

    async delete(audienceId) {
        const response = await fetch(`/api/admin/audiences/${audienceId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        if (!response.ok) throw new Error('削除失敗');
        // 204 No Contentの場合はJSONパースしない
        return response.status === 204 ? {} : response.json();
    }
};

// 一覧画面表示
async function showAudienceList() {
    document.getElementById('audience-list-view').classList.remove('hidden');
    document.getElementById('audience-form-view').classList.add('hidden');

    await loadAudiences();
}

// フォーム表示（新規/編集）
async function showAudienceForm(audienceId = null) {
    audienceState.isEditing = !!audienceId;
    audienceState.currentAudienceId = audienceId;

    // UI切り替え
    document.getElementById('audience-list-view').classList.add('hidden');
    document.getElementById('audience-form-view').classList.remove('hidden');

    // タイトル設定
    document.getElementById('audience-form-title').textContent =
        audienceId ? 'グループ編集' : '新規グループ作成';
    document.getElementById('submit-btn-text').textContent =
        audienceId ? '更新' : '作成';

    // フォームリセット
    document.getElementById('audience-form').reset();
    document.getElementById('audience-id').value = audienceId || '';
    audienceState.selectedMemberIds.clear();

    // メンバー一覧読み込み
    await loadAllMembers();

    // 編集時は既存データ読み込み
    if (audienceId) {
        await loadAudienceData(audienceId);
    } else {
        // 新規作成時は表示順のデフォルト値を設定
        await setDefaultSortOrder();
    }
}

// 一覧に戻る
function backToAudienceList() {
    showAudienceList();
}

// 表示順のデフォルト値設定（最大値+10）
async function setDefaultSortOrder() {
    try {
        if (audienceState.audiences.length === 0) {
            // まだ一覧を読み込んでいない場合は読み込み
            const data = await audienceApi.getAll();
            audienceState.audiences = data.audiences || [];
        }

        const maxSortOrder = audienceState.audiences.reduce((max, audience) => {
            return Math.max(max, audience.sort_order || 0);
        }, 0);

        document.getElementById('audience-sort').value = maxSortOrder + 10;
    } catch (error) {
        console.error('デフォルト表示順設定エラー:', error);
        document.getElementById('audience-sort').value = 1;
    }
}
// Audience一覧読み込み
async function loadAudiences() {
    try {
        audienceState.isLoading = true;
        const data = await audienceApi.getAll();
        audienceState.audiences = data.audiences || [];
        displayAudiences(audienceState.audiences);
    } catch (error) {
        console.error('audiences一覧取得エラー:', error);
        showToast('グループ一覧の取得に失敗しました', 'error');
    } finally {
        audienceState.isLoading = false;
    }
}

// 一覧表示
function displayAudiences(audiences) {
    const tbody = document.getElementById('audiences-tbody');

    if (audiences.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">グループがありません</td></tr>';
        return;
    }

    tbody.innerHTML = audiences.map(audience => `
        <tr>
            <td>${audience.sort_order}</td>
            <td>${audience.name}</td>
            <td>${audience.member_count || 0}名</td>
            <td>
                <button onclick="showAudienceForm(${audience.id})" class="btn-sm" style="padding: 4px 8px; margin-right: 4px; border: 1px solid #007bff; background: #007bff; color: white; border-radius: 4px; cursor: pointer;">編集</button>
                <button onclick="deleteAudience(${audience.id})" class="btn-sm btn-danger" style="padding: 4px 8px; border: 1px solid #dc3545; background: #dc3545; color: white; border-radius: 4px; cursor: pointer;">削除</button>
            </td>
        </tr>
    `).join('');
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

// 既存Audienceデータ読み込み（編集時）
async function loadAudienceData(audienceId) {
    try {
        // 基本情報取得
        const audience = audienceState.audiences.find(a => a.id == audienceId);
        if (audience) {
            document.getElementById('audience-name').value = audience.name;
            document.getElementById('audience-sort').value = audience.sort_order;
        }

        // メンバー情報取得
        const data = await audienceApi.getMembers(audienceId);
        const memberIds = data.items ? data.items.map(item => item.member_id) : [];
        audienceState.selectedMemberIds = new Set(memberIds);
        updateMemberCheckboxes();

    } catch (error) {
        console.error('データ読み込みエラー:', error);
        showToast('データの読み込みに失敗しました', 'error');
        showSection('audience-manage');
    }
}

// 全メンバー読み込み
async function loadAllMembers() {
    try {
        const data = await audienceApi.getAllMembers();
        audienceState.allMembers = data.items || [];
        renderMemberCheckboxes();
    } catch (error) {
        console.error('メンバー一覧取得エラー:', error);
        showToast('メンバー一覧の取得に失敗しました', 'error');
    }
}

// メンバーチェックボックス描画
function renderMemberCheckboxes() {
    const container = document.getElementById('member-checkboxes');

    if (audienceState.allMembers.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #6c757d;">メンバーがありません</p>';
        return;
    }

    container.innerHTML = audienceState.allMembers.map(member => `
        <label class="checkbox-item" style="display: block; margin-bottom: 4px; cursor: pointer;">
            <input type="checkbox"
                   name="member_ids"
                   value="${member.id}"
                   onchange="toggleMember(${member.id})"
                   ${audienceState.selectedMemberIds.has(member.id) ? 'checked' : ''}
                   style="margin-right: 6px;">
            <span>${member.name}</span>
        </label>
    `).join('');
}

// フォーム初期化
function initAudienceForm() {
    const form = document.getElementById('audience-form');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveAudience();
    });
}

// 保存処理（作成/更新）
async function saveAudience() {
    const submitBtn = document.querySelector('#audience-form button[type="submit"]');

    if (submitBtn.disabled) return;

    try {
        // ボタン無効化
        submitBtn.disabled = true;
        submitBtn.querySelector('#submit-btn-text').textContent =
            audienceState.isEditing ? '更新中...' : '作成中...';

        // バリデーション
        const name = document.getElementById('audience-name').value.trim();
        const sortOrder = parseInt(document.getElementById('audience-sort').value);

        if (!name) {
            showToast('グループ名を入力してください', 'error');
            return;
        }

        if (isNaN(sortOrder) || sortOrder < 0) {
            showToast('表示順は0以上の数値を入力してください', 'error');
            return;
        }

        // APIリクエスト
        const audienceData = { name, sort_order: sortOrder };

        let result;
        if (audienceState.isEditing) {
            // 更新処理
            result = await audienceApi.update(audienceState.currentAudienceId, audienceData);

            // メンバー更新
            await audienceApi.updateMembers(
                audienceState.currentAudienceId,
                Array.from(audienceState.selectedMemberIds)
            );
        } else {
            // 新規作成
            result = await audienceApi.create(audienceData);

            // メンバー登録
            if (result.audience_id && audienceState.selectedMemberIds.size > 0) {
                await audienceApi.updateMembers(
                    result.audience_id,
                    Array.from(audienceState.selectedMemberIds)
                );
            }
        }

        showToast(
            audienceState.isEditing ? 'グループを更新しました' : 'グループを作成しました',
            'success'
        );

        // 一覧に戻る
        showSection('audience-manage');

    } catch (error) {
        console.error('保存エラー:', error);
        showToast('保存に失敗しました', 'error');
    } finally {
        // ボタン状態を復元
        submitBtn.disabled = false;
        submitBtn.querySelector('#submit-btn-text').textContent =
            audienceState.isEditing ? '更新' : '作成';
    }
}

// 削除処理
async function deleteAudience(id) {
    if (!confirm('このグループを削除してもよろしいですか？')) {
        return;
    }

    try {
        await audienceApi.delete(id);
        showToast('グループを削除しました', 'success');
        await loadAudiences();
    } catch (error) {
        console.error('削除エラー:', error);
        showToast('削除に失敗しました', 'error');
    }
}

// ユーティリティ関数

// メンバー選択切り替え
function toggleMember(memberId) {
    if (audienceState.selectedMemberIds.has(memberId)) {
        audienceState.selectedMemberIds.delete(memberId);
    } else {
        audienceState.selectedMemberIds.add(memberId);
    }
}

// 全選択/全解除
function selectAllMembers(selectAll) {
    const checkboxes = document.querySelectorAll('input[name="member_ids"]');

    checkboxes.forEach(cb => {
        cb.checked = selectAll;
        const memberId = parseInt(cb.value);
        if (selectAll) {
            audienceState.selectedMemberIds.add(memberId);
        } else {
            audienceState.selectedMemberIds.delete(memberId);
        }
    });
}

// チェックボックス状態更新（編集時）
function updateMemberCheckboxes() {
    const checkboxes = document.querySelectorAll('input[name="member_ids"]');
    checkboxes.forEach(cb => {
        const memberId = parseInt(cb.value);
        cb.checked = audienceState.selectedMemberIds.has(memberId);
    });
}

// 旧関数との互換性のため残しておく（段階的移行）
async function deleteAudience_old(id) {
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

// メッセージ送信ボタンの状態更新
function updateMessageSendButton() {
    const btn = document.getElementById('send-message-btn');
    if (!btn) return;

    const canSend = messageState.audienceLoaded && !messageState.isSubmitting;
    btn.disabled = !canSend;

    if (messageState.isSubmitting) {
        btn.innerHTML = '送信中...';
    } else if (messageState.isLoading) {
        btn.innerHTML = '読み込み中...';
    } else {
        btn.innerHTML = '送信 <span id="test-mode-badge" style="background:#e9ecef;color:#495057;padding:2px 6px;border-radius:999px;font-size:10px;margin-left:5px;display:none;">🧪テストモード</span>';
    }
}

// audience一覧読み込み
async function loadMessageAudiences() {
    messageState.isLoading = true;
    messageState.audienceLoaded = false;
    updateMessageSendButton();

    try {
        const data = await api.getMessageAudiences();
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
            messageState.selectedAudienceId = data.audiences[0].id;
        }

        messageState.audienceLoaded = true;
    } catch (error) {
        console.error('audience読み込みエラー:', error);
        showToast(error.message, 'error');
    } finally {
        messageState.isLoading = false;
        updateMessageSendButton();
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

    // 送信ボタンの初期状態設定
    updateMessageSendButton();
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
// ファイル名を適切な長さに切り詰める関数
function truncateFileName(fileName, maxLength) {
    if (fileName.length <= maxLength) return fileName;

    const extension = fileName.lastIndexOf('.') !== -1
        ? fileName.substring(fileName.lastIndexOf('.'))
        : '';
    const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.') !== -1
        ? fileName.lastIndexOf('.')
        : fileName.length);
    const truncatedName = nameWithoutExt.substring(0, maxLength - extension.length - 3) + '...';

    return truncatedName + extension;
}

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
        imageInfo.textContent = `${truncateFileName(file.name, 50)} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
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
            messageState.isSubmitting = true;
            updateMessageSendButton();

            const result = await api.sendMessage(formData);

            if (result.success) {
                const successMsg = result.fail_count > 0
                    ? `送信完了（成功: ${result.success_count}名、失敗: ${result.fail_count}名）`
                    : `送信完了（${result.success_count}名）`;
                showToast(successMsg, 'success');

                // dry-runバッジ表示制御
                const badge = document.getElementById('test-mode-badge');
                if (badge) {
                    badge.style.display = result.dry_run ? 'inline-block' : 'none';
                }

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
            showToast(error.message || '通信エラーが発生しました', 'error');
        } finally {
            messageState.isSubmitting = false;
            updateMessageSendButton();
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

    // ブラッシュアップ: イベントフォームが存在する場合、初回同期
    if ($(EL.form)) {
        hydrateFromDOM();
    }
});

// ブラッシュアップ: ブラウザ履歴戻り(BFCache)対策
window.addEventListener('pageshow', function(event) {
    // Back-Forward Cache から復帰した場合もDOM→状態を同期
    if (event.persisted || performance.navigation.type === 2) {
        if ($(EL.form)) {
            hydrateFromDOM();
            setSubmitButtonEnabled();
        }
    }
});

// ===== メッセージ履歴機能 =====

let messageHistoryOffset = 0;
const messageHistoryLimit = 20;

// メッセージ履歴の読み込み
async function loadMessageHistory() {
    try {
        const response = await fetch(`/api/admin/messages?limit=${messageHistoryLimit}&offset=${messageHistoryOffset}`, {
            credentials: 'include'
        });

        if (!response.ok) throw new Error('履歴取得失敗');

        const data = await response.json();
        displayMessageHistory(data.items);
        displayMessagePagination(data.total);
    } catch (error) {
        console.error('メッセージ履歴取得エラー:', error);
        showToast('履歴の取得に失敗しました', 'error');
    }
}

// メッセージ履歴の表示
function displayMessageHistory(messages) {
    const tbody = document.getElementById('message-history-body');
    tbody.innerHTML = '';

    if (messages.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #666;">送信履歴がありません</td></tr>';
        return;
    }

    messages.forEach(msg => {
        const row = tbody.insertRow();

        // 送信日時
        const sentAt = new Date(msg.sent_at);
        const sentAtStr = sentAt.toLocaleString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        row.insertCell().textContent = sentAtStr;

        // 種別
        const typeCell = row.insertCell();
        if (msg.type === 'text') {
            typeCell.innerHTML = '<span style="color: #28a745;">📝 テキスト</span>';
        } else if (msg.type === 'image') {
            typeCell.innerHTML = '<span style="color: #17a2b8;">🖼️ 画像</span>';
        } else {
            typeCell.textContent = msg.type;
        }

        // 送信先
        row.insertCell().textContent = msg.audience_name || 'グループ削除済み';

        // 送信人数
        const countCell = row.insertCell();
        const actualCount = msg.actual_recipient_count || 0;
        const recordedCount = msg.recipient_count || 0;

        if (actualCount > 0) {
            countCell.textContent = `${actualCount}名`;
        } else if (recordedCount > 0) {
            countCell.innerHTML = `<span style="color: #999;">${recordedCount}名（詳細なし）</span>`;
        } else {
            countCell.textContent = '0名';
        }

        // 成功/失敗
        const statusCell = row.insertCell();
        const successCount = msg.success_count || 0;
        const failCount = msg.fail_count || 0;

        if (failCount === 0) {
            statusCell.innerHTML = `<span style="color: green;">✓ ${successCount}</span>`;
        } else if (successCount === 0) {
            statusCell.innerHTML = `<span style="color: red;">✗ ${failCount}</span>`;
        } else {
            statusCell.innerHTML = `<span style="color: green;">✓ ${successCount}</span> / <span style="color: red;">✗ ${failCount}</span>`;
        }

        // 送信者
        row.insertCell().textContent = msg.sent_by_name || msg.sent_by_username || '不明';

        // 操作
        const actionCell = row.insertCell();
        if (actualCount > 0) {
            actionCell.innerHTML = `<button onclick="showRecipientDetails(${msg.id})" class="btn-small">詳細</button>`;
        } else {
            actionCell.innerHTML = '<span style="color: #999;">-</span>';
        }
    });
}

// ページネーション表示
function displayMessagePagination(total) {
    const paginationDiv = document.getElementById('message-pagination');
    paginationDiv.innerHTML = '';

    const totalPages = Math.ceil(total / messageHistoryLimit);
    const currentPage = Math.floor(messageHistoryOffset / messageHistoryLimit) + 1;

    if (totalPages <= 1) return;

    // 前へボタン
    if (currentPage > 1) {
        const prevBtn = document.createElement('button');
        prevBtn.textContent = '< 前へ';
        prevBtn.onclick = () => {
            messageHistoryOffset -= messageHistoryLimit;
            loadMessageHistory();
        };
        paginationDiv.appendChild(prevBtn);
    }

    // ページ番号
    const pageInfo = document.createElement('span');
    pageInfo.style.margin = '0 15px';
    pageInfo.textContent = `${currentPage} / ${totalPages}`;
    paginationDiv.appendChild(pageInfo);

    // 次へボタン
    if (currentPage < totalPages) {
        const nextBtn = document.createElement('button');
        nextBtn.textContent = '次へ >';
        nextBtn.onclick = () => {
            messageHistoryOffset += messageHistoryLimit;
            loadMessageHistory();
        };
        paginationDiv.appendChild(nextBtn);
    }
}

// 受信者詳細表示
async function showRecipientDetails(messageLogId) {
    try {
        const response = await fetch(`/api/admin/messages/${messageLogId}/recipients`, {
            credentials: 'include'
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API Error Response:', response.status, errorText);
            throw new Error(`受信者情報取得失敗 (${response.status})`);
        }

        const data = await response.json();

        // モーダルに情報を設定
        const log = data.message_log;
        const recipients = data.recipients;

        // 送信情報
        const sentAt = new Date(log.sent_at);
        document.getElementById('modal-sent-at').textContent = sentAt.toLocaleString('ja-JP');
        document.getElementById('modal-audience').textContent = log.audience_name || 'グループ削除済み';
        document.getElementById('modal-sender').textContent = log.sent_by_name || log.sent_by_username || '不明';
        document.getElementById('modal-type').textContent = log.type === 'text' ? 'テキスト' : '画像';

        // メッセージ内容
        const contentDiv = document.getElementById('modal-message-content');
        if (log.type === 'text') {
            contentDiv.innerHTML = `<pre style="margin: 0; white-space: pre-wrap; word-wrap: break-word;">${escapeHtml(log.message_text)}</pre>`;
        } else if (log.type === 'image') {
            contentDiv.innerHTML = `<img src="${log.image_preview_url || log.image_url}" style="max-width: 100%; max-height: 200px;">`;
        }

        // 受信者一覧
        document.getElementById('recipients-count').textContent = recipients.length;
        const tbody = document.getElementById('recipients-body');
        tbody.innerHTML = '';

        recipients.forEach(recipient => {
            const row = tbody.insertRow();
            row.insertCell().textContent = recipient.name;
        });

        // モーダル表示
        document.getElementById('recipients-modal').classList.remove('hidden');
        document.getElementById('recipients-modal').classList.add('active');

    } catch (error) {
        console.error('受信者詳細取得エラー:', error);
        showToast('受信者情報の取得に失敗しました', 'error');
    }
}

// 受信者詳細モーダルを閉じる
function closeRecipientsModal() {
    document.getElementById('recipients-modal').classList.remove('active');
    document.getElementById('recipients-modal').classList.add('hidden');
}

// HTMLエスケープ関数
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
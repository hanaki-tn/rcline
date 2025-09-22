// RC公式LINE LIFF イベント管理
// events.html のスクリプト部分を分離

console.log('[DEBUG] events.js が正常に読み込まれました');

// アプリケーションの状態管理
const EventApp = {
    currentUser: null,
    currentView: 'list', // 'list' または 'detail'
    eventId: null,
    events: [],
    eventData: null,
    fromSource: null // 遷移元判定用
};

// 二重送信防止フラグ
let __isSubmitting = false;

// URL操作の共通化
function updateUrl(view, params = {}) {
    const url = new URL(window.location);

    if (view === 'list') {
        url.searchParams.delete('view');
        url.searchParams.delete('id');
        url.searchParams.delete('from');
        window.history.replaceState({view: 'list'}, '', url);
    } else if (view === 'detail') {
        url.searchParams.set('view', 'detail');
        if (params.id) url.searchParams.set('id', params.id);
        if (params.from) url.searchParams.set('from', params.from);
        window.history.replaceState({view: 'detail', eventId: params.id}, '', url);
    }
}

// ページ初期化
async function initEventApp() {
    try {
        // URLパラメータ解析
        const params = new URLSearchParams(window.location.search);
        const view = params.get('view') || 'list';
        const eventId = params.get('id');
        EventApp.fromSource = params.get('from');

        // 認証モジュールで認証実行
        EventApp.currentUser = await liffAuth.initialize({
            redirectToRegister: true,
            fromPage: 'events'
        });

        if (!EventApp.currentUser) {
            // 認証失敗またはリダイレクト中
            return;
        }

        // URLパラメータからビュー判定
        if (eventId) {
            // イベントIDがある場合は詳細表示
            await navigateToDetail(eventId);
        } else {
            // それ以外は一覧表示
            await navigateToList();
        }

    } catch (error) {
        console.error('アプリ初期化エラー:', error);
        showError('main-content', 'ページの読み込みに失敗しました。');
    }
}

// イベント一覧表示
async function navigateToList() {
    EventApp.currentView = 'list';
    EventApp.eventId = null;

    document.getElementById('page-title').textContent = 'イベント';
    updateNavigation('list');

    // URLを更新
    updateUrl('list');

    try {
        showLoading('main-content');

        const response = await apiRequest('/api/liff/events');
        EventApp.events = await response.json();

        displayEventList();

    } catch (error) {
        console.error('イベント読み込みエラー:', error);
        showError('main-content', 'イベント一覧の読み込みに失敗しました。');
    }
}

// イベント詳細表示
async function navigateToDetail(eventId) {
    if (!eventId) {
        showError('main-content', 'イベントIDが指定されていません。');
        return;
    }

    EventApp.currentView = 'detail';
    EventApp.eventId = eventId;

    document.getElementById('page-title').textContent = 'イベント詳細';
    updateNavigation('detail');

    // URLを更新
    updateUrl('detail', {
        id: eventId,
        from: EventApp.fromSource
    });

    try {
        showLoading('main-content');

        const response = await apiRequest(`/api/liff/events/${eventId}`);
        EventApp.eventData = await response.json();

        displayEventDetail();

    } catch (error) {
        console.error('イベント詳細読み込みエラー:', error);

        if (error.message.includes('403')) {
            showError('main-content', 'このイベントにアクセスする権限がありません。');
        } else {
            showError('main-content', 'イベント詳細の読み込みに失敗しました。');
        }
    }
}

// イベント一覧UI生成
function displayEventList() {
    const container = document.getElementById('main-content');

    if (!EventApp.events || EventApp.events.length === 0) {
        showEmptyState('main-content', '現在、表示できるイベントはありません。', '📅');
        return;
    }

    let html = '<div class="event-list">';

    EventApp.events.forEach(event => {
        const status = event.my_response?.status || 'pending';
        const statusText = getStatusText(status);
        const eventDate = formatDate(event.held_at);
        const eventTime = formatTime(event.held_at);
        const deadlineDate = event.deadline_at ? formatDate(event.deadline_at) : null;

        html += `
            <div class="event-card" onclick="navigateToDetail('${event.id}')">
                <div class="event-card-title">${escapeHtml(event.title)}</div>
                <div class="event-card-datetime">🗓️ ${eventDate} ${eventTime}</div>
                <div class="event-card-footer">
                    <span class="status-badge status-${status}">${statusText}</span>
                    ${status === 'pending' && deadlineDate ? `<span class="event-deadline">回答期限: ${deadlineDate}</span>` : ''}
                </div>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
}

// ボタン状態クラス制御（インラインスタイルからクラスベースに変更）
function getButtonStateClass(buttonType, isTarget, isPastEvent, isAttend, isAbsent) {
    if (!isTarget || isPastEvent) {
        return 'is-disabled';
    }

    if ((buttonType === 'attend' && isAttend) || (buttonType === 'absent' && isAbsent)) {
        return 'is-disabled';
    }

    return '';
}

// イベント詳細UI生成
function displayEventDetail() {
    const event = EventApp.eventData;
    const container = document.getElementById('main-content');

    // 現在時刻と開催日時の比較
    const now = new Date();
    const heldAt = new Date(event.held_at);
    const isPastEvent = now > heldAt;

    // 現在の回答状況
    const currentResponse = event.my_response || {};
    const hasResponse = currentResponse.status;
    const isAttend = currentResponse.status === 'attend';
    const isAbsent = currentResponse.status === 'absent';

    // アクセス権・対象者確認
    const isTarget = event.can_respond;

    // ヘッダーのタイトルを更新
    document.getElementById('page-title').textContent = event.title;

    let html = `
        <div class="card">
            <div class="card-body">

                <!-- 日時 -->
                <div class="event-date mb-2">
                    🗓️ ${formatDate(event.held_at)} ${formatTime(event.held_at)}
                </div>

                <!-- 回答期限 -->
                ${event.deadline_at ? `
                    <div class="event-date mb-2" style="color: #dc3545;">
                        ⏰ 回答期限: ${formatDate(event.deadline_at)} ${formatTime(event.deadline_at)}
                    </div>
                ` : ''}

                <!-- 画像表示 -->
                ${event.image_preview_url ? `
                    <div class="mb-3">
                        <div class="image-placeholder" id="image-container-${event.id}">
                            <div class="image-placeholder__loading">
                                <div>📄</div>
                                <div>画像を読み込み中...</div>
                            </div>
                            <img class="image-placeholder__image"
                                 src="${escapeHtml(event.image_preview_url)}"
                                 alt="イベント画像"
                                 onclick="showFullImage('${escapeHtml(event.image_url)}')"
                                 onload="handleImageLoad(this)"
                                 onerror="handleImageError(this)">
                        </div>
                        ${event.image_url ? '<p class="text-center mt-2"><small>🔍 タップで全画面表示</small></p>' : ''}
                    </div>
                ` : ''}

                <!-- コメント -->
                ${event.body ? `<div class="event-description mb-3">${escapeHtml(event.body)}</div>` : ''}

                <!-- 現在の回答状況 -->
                ${hasResponse ? `
                    <div class="mb-3 message message-info">
                        現在の回答: <strong>${getStatusText(currentResponse.status)}</strong>
                        ${currentResponse.responded_at ? `<br><small>回答日時: ${formatDateTime(currentResponse.responded_at)}</small>` : ''}
                    </div>
                ` : ''}

                <!-- 出欠回答セクション -->
                <h3>🗳️ 出欠回答</h3>

                <!-- 追加テキスト入力 -->
                ${event.extra_text_enabled ? `
                    <div class="mt-3" id="extra-text-section">
                        <label for="extra-text">
                            ${escapeHtml(event.extra_text_label || '追加メモ')}
                            ${event.extra_text_attend_only ? '<small style="color: #dc3545;">※出席の場合は入力必須</small>' : ''}
                        </label>
                        <textarea id="extra-text" rows="3" placeholder="${event.extra_text_attend_only ? '出席の場合は必ずご記入ください' : ''}">${escapeHtml(currentResponse.extra_text || '')}</textarea>
                    </div>
                ` : ''}

                <!-- ボタン（横並び） -->
                <div class="mt-3 d-flex" style="gap: 10px;">
                    <button onclick="submitResponse('attend')"
                            id="attend-button"
                            class="button button-primary event-card__btn ${getButtonStateClass('attend', isTarget, isPastEvent, isAttend, isAbsent)}"
                            style="flex: 1;">
                        出席
                    </button>
                    <button onclick="submitResponse('absent')"
                            id="absent-button"
                            class="button button-secondary event-card__btn ${getButtonStateClass('absent', isTarget, isPastEvent, isAttend, isAbsent)}"
                            style="flex: 1;">
                        欠席
                    </button>
                </div>

                <!-- ボタン無効化の理由表示 -->
                ${getButtonDisabledMessage(isTarget, isPastEvent)}

            </div>
        </div>
    `;

    // 出欠状況一覧（折りたたみ）
    if (event.attendance_status && event.attendance_status.length > 0) {
        html += `
            <div class="collapsible">
                <div class="collapsible-header">
                    <span>👥 出欠状況 (${event.attendance_status.length}名)</span>
                    <span class="collapse-icon">▼</span>
                </div>
                <div class="collapsible-content">
                    <div class="status-list">
                        ${event.attendance_status.map(member => {
                            const lineStatusEmoji = member.is_target ? '🟢' : '⚪';
                            const statusText = getStatusText(member.status);
                            const proxyMarker = member.via === 'admin' ? ' ✏️' : '';

                            return `
                                <div class="member-row" style="display: flex; align-items: flex-start; gap: 15px; padding: 8px 0;">
                                    <div class="member-name" style="flex: 0 0 auto; font-weight: 500;">${lineStatusEmoji} ${escapeHtml(member.name)}</div>
                                    <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                                        <div>
                                            <span class="status-badge status-${member.status}">${statusText}</span>${proxyMarker}
                                        </div>
                                        ${member.extra_text ? `<div style="font-size: 14px; color: #6c757d; word-wrap: break-word; word-break: break-all;">${escapeHtml(member.extra_text)}</div>` : ''}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    // 回答履歴（折りたたみ）
    if (event.response_history && event.response_history.length > 0) {
        html += `
            <div class="collapsible">
                <div class="collapsible-header">
                    <span>📝 回答履歴 (${event.response_history.length}件)</span>
                    <span class="collapse-icon">▼</span>
                </div>
                <div class="collapsible-content">
                    <div class="history-list">
                        ${event.response_history.map(history => {
                            const statusText = getStatusText(history.status);
                            const proxyMarker = history.via === 'admin' ? ' ✏️' : '';

                            return `
                                <div class="member-row" style="display: flex; align-items: center; gap: 15px; padding: 12px 0;">
                                    <div style="flex: 0 0 auto; font-size: 14px; color: #6c757d;">
                                        ${formatDateShort(history.responded_at)}
                                    </div>
                                    <div style="flex: 0 0 auto; font-weight: 500;">
                                        ${escapeHtml(history.name)}
                                    </div>
                                    <div style="flex: 0 0 auto;">
                                        <span class="status-badge status-${history.status}">${statusText}</span>${proxyMarker}
                                    </div>
                                    <div style="flex: 1; font-size: 14px; color: #6c757d; white-space: nowrap; overflow: hidden;">
                                        ${history.extra_text ? escapeHtml(history.extra_text) : ''}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    // 凡例
    html += `
        <div class="legend">
            <div class="legend-title">凡例</div>
            <div>🟢：公式LINE登録済み　⚪：公式LINE未登録　✏️：代理回答</div>
        </div>
    `;

    container.innerHTML = html;

    // 折りたたみ機能を再初期化
    initCollapsible();
}

// ボタン無効化メッセージ
function getButtonDisabledMessage(isTarget, isPastEvent) {
    if (!isTarget) {
        return `<div class="mt-2 message message-info"><small>このイベントの管理者のため、回答は不要です。</small></div>`;
    }

    if (isPastEvent) {
        return `<div class="mt-2 message message-error"><small>開催日時が過ぎているため、回答できません。</small></div>`;
    }

    return '';
}

// 出欠回答送信（二重送信防止統一）
async function submitResponse(status) {
    const eventId = EventApp.eventId;
    if (!eventId) return;

    // 二重送信防止
    if (__isSubmitting) return;

    // ボタン状態確認（クラスベース）
    const button = document.getElementById(status === 'attend' ? 'attend-button' : 'absent-button');
    if (button && button.classList.contains('is-disabled')) {
        return;
    }

    // 追加コメントの取得とバリデーション
    let extraText = '';
    if (EventApp.eventData?.extra_text_enabled) {
        extraText = document.getElementById('extra-text')?.value || '';

        // 出席時は必須チェック
        if (status === 'attend' && EventApp.eventData.extra_text_attend_only && !extraText.trim()) {
            showError('response-message', `${EventApp.eventData.extra_text_label || '追加メモ'}を入力してください。`);
            document.getElementById('extra-text').focus();
            return;
        }
    }

    try {
        __isSubmitting = true;

        // ボタンを無効化
        if (button) button.classList.add('is-disabled');

        const response = await apiRequest(`/api/liff/events/${eventId}/response`, {
            method: 'POST',
            body: JSON.stringify({
                status: status,
                extra_text: extraText
            })
        });

        // 回答成功時の処理
        if (EventApp.fromSource === 'list') {
            // イベント一覧から来た場合：一覧に戻る
            await navigateToList();
        } else {
            // LINEメッセージから来た場合：画面を閉じる
            if (typeof liff !== 'undefined' && liff.isInClient()) {
                liff.closeWindow();
            } else {
                // 詳細を再読み込み
                await navigateToDetail(eventId);
            }
        }

    } catch (error) {
        console.error('回答送信エラー:', error);
        showError('response-message', '回答の送信に失敗しました。');
    } finally {
        __isSubmitting = false;
        // ボタンの無効化を解除（状態に応じて再設定される）
        if (button) {
            button.classList.remove('is-disabled');
        }
    }
}

// 全画面画像表示
function showFullImage(imageUrl) {
    if (!imageUrl) return;

    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        cursor: zoom-out;
        overflow: auto;
    `;

    const img = document.createElement('img');
    img.src = imageUrl;
    img.style.cssText = `
        display: block;
        margin: auto;
        max-width: none;
        max-height: none;
        width: auto;
        height: auto;
        cursor: zoom-out;
    `;

    // 画像の初期表示サイズを画面に収める
    img.onload = function() {
        const windowWidth = window.innerWidth * 0.95;
        const windowHeight = window.innerHeight * 0.95;
        const imgWidth = this.naturalWidth;
        const imgHeight = this.naturalHeight;

        const widthRatio = windowWidth / imgWidth;
        const heightRatio = windowHeight / imgHeight;
        const scale = Math.min(widthRatio, heightRatio, 1);

        if (scale < 1) {
            this.style.width = (imgWidth * scale) + 'px';
            this.style.height = (imgHeight * scale) + 'px';
        }
    };

    overlay.appendChild(img);
    overlay.onclick = () => document.body.removeChild(overlay);

    document.body.appendChild(overlay);
}

// ナビゲーション更新
function updateNavigation(currentView) {
    const nav = document.getElementById('navigation');

    switch (currentView) {
        case 'detail':
            nav.innerHTML = `
                <button onclick="navigateToList()" class="nav-button" style="width: 33%;">← イベント</button>
                <div style="width: 33%;"></div>
                <button onclick="closeLiff()" class="nav-button" style="width: 33%;">× 閉じる</button>
            `;
            break;
        default:
            nav.innerHTML = `
                <div style="width: 33%;"></div>
                <div style="width: 33%;"></div>
                <button onclick="closeLiff()" class="nav-button" style="width: 33%;">× 閉じる</button>
            `;
    }
}

// LIFF画面を閉じる
function closeLiff() {
    if (typeof liff !== 'undefined' && liff.isInClient()) {
        liff.closeWindow();
    } else {
        window.close();
        setTimeout(() => {
            window.location.href = 'about:blank';
        }, 100);
    }
}

// 画像読み込み完了時の処理
function handleImageLoad(img) {
    img.classList.add('loaded');
    // ローディング表示を非表示にする
    const loadingElement = img.parentElement.querySelector('.image-placeholder__loading');
    if (loadingElement) {
        loadingElement.style.display = 'none';
    }
}

// 画像読み込みエラー時の処理
function handleImageError(img) {
    const loadingElement = img.parentElement.querySelector('.image-placeholder__loading');
    if (loadingElement) {
        loadingElement.innerHTML = `
            <div>⚠️</div>
            <div>画像の読み込みに失敗しました</div>
        `;
    }
}

// HTMLエスケープ
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ページ読み込み時実行
document.addEventListener('DOMContentLoaded', initEventApp);
// RC公式LINE LIFF 共通JavaScript（VPS本番用）

// 共通設定
const CONFIG = {
    API_BASE: '/rcline',  // VPS用パス
    DEV_USER_ID: 'U45bc8ea2cb931b9ff43aa41559dbc7fc',
    isDev: false,  // 本番環境
    LIFF_ID: '2007866921-LkR3yg4k'  // 出欠状況確認LIFF ID
};

// LIFF初期化
let liffInitialized = false;
async function initLiff() {
    if (liffInitialized) return true;
    
    try {
        console.log(`[${new Date().toISOString()}] INFO: LIFF初期化開始 - ID: ${CONFIG.LIFF_ID}`);
        
        await liff.init({ liffId: CONFIG.LIFF_ID });
        await liff.ready; // ★ 初期化完了を待つ
        liffInitialized = true;
        
        if (!liff.isLoggedIn()) {
            console.log(`[${new Date().toISOString()}] INFO: LINEログイン未完了 - ログイン画面へ遷移`);
            liff.login();
            return false;
        }
        
        console.log(`[${new Date().toISOString()}] INFO: LIFF初期化完了 - ログイン済み`);
        return true;
        
    } catch (error) {
        console.error(`[${new Date().toISOString()}] ERROR: LIFF初期化失敗:`, error);
        throw error;
    }
}

// ★ プロフィールを1度だけ取得して userId をキャッシュ
let cachedUserId = null;
async function ensureLineUserId() {
    if (!liffInitialized) {
        const ok = await initLiff();
        if (!ok) return null; // ログイン遷移
    }
    if (!liff.isLoggedIn()) return null;
    if (cachedUserId) return cachedUserId;
    const profile = await liff.getProfile();
    cachedUserId = profile?.userId || null;
    return cachedUserId;
}

// API リクエストヘルパー
async function apiRequest(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    // VPS環境では LIFF からトークン取得（任意）＋ ユーザーIDを必ず送る
    try {
        if (liffInitialized && liff.isLoggedIn()) {
            const accessToken = liff.getAccessToken();
            if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`; // あってもよい
        }
        // ★ サーバ認証の本命：x-line-user-id を必ず付与
        const uid = await ensureLineUserId();
        if (!uid) throw new Error('LINE user id not available');
        headers['x-line-user-id'] = uid;
    } catch (error) {
        console.warn(`[${new Date().toISOString()}] WARN: 認証ヘッダ設定で警告:`, error);
    }
    
    try {
        const response = await fetch(CONFIG.API_BASE + endpoint, {
            ...options,
            headers
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `HTTP ${response.status}`);
        }
        
        return response;
    } catch (error) {
        console.error(`API Error [${endpoint}]:`, error);
        throw error;
    }
}

// 現在のユーザー情報を取得
async function getCurrentUser() {
    try {
        console.log(`[${new Date().toISOString()}] INFO: ユーザー情報取得開始`);
        
        const uid = await ensureLineUserId();
        if (!uid) {
            console.log(`[${new Date().toISOString()}] INFO: LINE認証が必要です`);
            return null; // ログイン遷移中
        }
        
        const profile = await liff.getProfile();
        console.log(`[${new Date().toISOString()}] INFO: LIFFプロフィール取得成功 - userId: ${profile.userId}`);
        
        // APIサーバーからメンバー情報を取得
        const response = await apiRequest('/api/liff/me');
        const userData = await response.json();
        
        console.log(`[${new Date().toISOString()}] INFO: ユーザー情報取得完了 - member_id: ${userData.member_id || 'N/A'}`);
        
        return {
            ...userData,
            lineProfile: profile
        };
        
    } catch (error) {
        console.error(`[${new Date().toISOString()}] ERROR: ユーザー情報取得エラー:`, error);
        return null;
    }
}

// 日時フォーマット
function formatDateTime(isoString) {
    if (!isoString) return '';
    
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}/${month}/${day} ${hour}:${minute}`;
}

// 日付フォーマット（日付のみ）
function formatDate(isoString) {
    if (!isoString) return '';
    
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}年${month}月${day}日`;
}

// 時刻フォーマット（時刻のみ）
function formatTime(isoString) {
    if (!isoString) return '';
    
    const date = new Date(isoString);
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    
    return `${hour}:${minute}`;
}

// 出欠ステータステキスト変換
function getStatusText(status) {
    switch (status) {
        case 'attend':
            return '出席';
        case 'absent':
            return '欠席';
        case 'pending':
        default:
            return '未回答';
    }
}

// 出欠ステータスCSSクラス
function getStatusClass(status) {
    switch (status) {
        case 'attend':
            return 'attend';
        case 'absent':
            return 'absent';
        case 'pending':
        default:
            return 'pending';
    }
}

// ローディング表示制御
function showLoading(containerId) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <div>読み込み中...</div>
            </div>
        `;
    }
}

function hideLoading(containerId) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = '';
    }
}

// エラーメッセージ表示
function showError(containerId, message) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `
            <div class="message message-error">
                <strong>エラー:</strong> ${message}
            </div>
        `;
    }
}

// 成功メッセージ表示
function showSuccess(containerId, message) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `
            <div class="message message-success">
                ${message}
            </div>
        `;
    }
}

// 空状態表示
function showEmptyState(containerId, message, icon = '📝') {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">${icon}</div>
                <div>${message}</div>
            </div>
        `;
    }
}

// 折りたたみ機能
function initCollapsible() {
    document.querySelectorAll('.collapsible-header').forEach(header => {
        header.addEventListener('click', function() {
            const content = this.nextElementSibling;
            const isActive = this.classList.contains('active');
            
            if (isActive) {
                this.classList.remove('active');
                content.classList.remove('show');
            } else {
                this.classList.add('active');
                content.classList.add('show');
            }
        });
    });
}

// URLパラメータ取得
function getUrlParameter(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

// ページ共通初期化
document.addEventListener('DOMContentLoaded', function() {
    // 折りたたみ機能初期化
    initCollapsible();
});

// エクスポート（モジュールとして使う場合）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        apiRequest,
        getCurrentUser,
        formatDateTime,
        formatDate,
        formatTime,
        getStatusText,
        getStatusClass,
        showLoading,
        hideLoading,
        showError,
        showSuccess,
        showEmptyState
    };
}
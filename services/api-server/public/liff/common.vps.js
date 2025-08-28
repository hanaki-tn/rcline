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

// API リクエストヘルパー
async function apiRequest(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    // VPS環境では実際のLIFF SDKからLINE user IDを取得
    try {
        if (liffInitialized && liff.isLoggedIn()) {
            // LIFFからアクセストークンを取得してヘッダーに設定
            const accessToken = liff.getAccessToken();
            if (accessToken) {
                headers['Authorization'] = `Bearer ${accessToken}`;
                console.log(`[${new Date().toISOString()}] INFO: LIFF access token取得成功`);
            }
        }
    } catch (error) {
        console.warn(`[${new Date().toISOString()}] WARN: LIFF access token取得失敗:`, error);
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
        
        // LIFF初期化確認
        if (!liffInitialized) {
            const initialized = await initLiff();
            if (!initialized) {
                console.log(`[${new Date().toISOString()}] INFO: LIFF未初期化のため処理中断`);
                return null;
            }
        }
        
        // LIFFプロフィール情報を取得
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
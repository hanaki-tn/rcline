// RC公式LINE LIFF 共通JavaScript

// 共通設定
const CONFIG = {
    API_BASE: '',  // 相対パス使用
    DEV_USER_ID: 'U45bc8ea2cb931b9ff43aa41559dbc7fc', // 開発用テストユーザーID（花木さん）
    isDev: window.location.hostname === 'localhost'
};

// セッションキャッシュ設定
const SESSION_STORAGE = {
    USER_INFO: 'liff_user_info',
    LIFF_PROFILE: 'liff_profile',
    USER_EXPIRES: 'liff_user_expires',
    PROFILE_EXPIRES: 'liff_profile_expires'
};

// API リクエストヘルパー
async function apiRequest(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    // 開発環境では擬似LINE user IDを使用
    if (CONFIG.isDev) {
        // localStorageから開発用userIdを取得、なければデフォルト値を使用
        const devUserId = localStorage.getItem('dev-line-user-id') || CONFIG.DEV_USER_ID;
        headers['x-dev-line-user-id'] = devUserId;
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
        
        // 認証エラー時はキャッシュクリア
        if (error.message.includes('401') || error.message.includes('UNAUTHENTICATED')) {
            clearAuthCache();
        }
        
        throw error;
    }
}

// キャッシュクリア関数
function clearAuthCache() {
    sessionStorage.removeItem(SESSION_STORAGE.USER_INFO);
    sessionStorage.removeItem(SESSION_STORAGE.LIFF_PROFILE);
    sessionStorage.removeItem(SESSION_STORAGE.USER_EXPIRES);
    sessionStorage.removeItem(SESSION_STORAGE.PROFILE_EXPIRES);
    console.log('[CACHE] 認証キャッシュをクリアしました');
}

// セッションキャッシュから取得（期限チェック付き）
function getFromSessionCache(key, expiresKey) {
    try {
        const cached = sessionStorage.getItem(key);
        const expires = sessionStorage.getItem(expiresKey);
        
        if (cached && expires && Date.now() < parseInt(expires)) {
            console.log(`[CACHE] ${key} をキャッシュから取得`);
            return JSON.parse(cached);
        }
        
        // 期限切れの場合はクリア
        if (cached) {
            sessionStorage.removeItem(key);
            sessionStorage.removeItem(expiresKey);
            console.log(`[CACHE] ${key} の期限切れキャッシュをクリア`);
        }
        
        return null;
    } catch (error) {
        console.error(`[CACHE] ${key} 読み込みエラー:`, error);
        return null;
    }
}

// セッションキャッシュに保存（1時間有効）
function saveToSessionCache(key, expiresKey, data) {
    try {
        const expires = Date.now() + (60 * 60 * 1000); // 1時間
        sessionStorage.setItem(key, JSON.stringify(data));
        sessionStorage.setItem(expiresKey, expires.toString());
        console.log(`[CACHE] ${key} をキャッシュに保存（期限: ${new Date(expires).toLocaleString()}）`);
    } catch (error) {
        console.error(`[CACHE] ${key} 保存エラー:`, error);
    }
}

// LIFF プロフィール取得（キャッシュ付き）
async function getCachedLiffProfile() {
    // キャッシュ確認
    let profile = getFromSessionCache(SESSION_STORAGE.LIFF_PROFILE, SESSION_STORAGE.PROFILE_EXPIRES);
    if (profile) {
        return profile;
    }
    
    // キャッシュなし：LIFF SDKから取得
    try {
        if (typeof liff !== 'undefined' && liff.isLoggedIn && liff.isLoggedIn()) {
            profile = await liff.getProfile();
            saveToSessionCache(SESSION_STORAGE.LIFF_PROFILE, SESSION_STORAGE.PROFILE_EXPIRES, profile);
            return profile;
        }
        return null;
    } catch (error) {
        console.error('LIFF プロフィール取得エラー:', error);
        return null;
    }
}

// 現在のユーザー情報を取得（キャッシュ付き）
async function getCurrentUser() {
    // キャッシュ確認
    let userInfo = getFromSessionCache(SESSION_STORAGE.USER_INFO, SESSION_STORAGE.USER_EXPIRES);
    if (userInfo) {
        return userInfo;
    }
    
    // キャッシュなし：APIから取得
    try {
        const response = await apiRequest('/api/liff/me');
        userInfo = await response.json();
        
        if (userInfo) {
            saveToSessionCache(SESSION_STORAGE.USER_INFO, SESSION_STORAGE.USER_EXPIRES, userInfo);
        }
        
        return userInfo;
    } catch (error) {
        console.error('ユーザー情報取得エラー:', error);
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
            
            // 他の折りたたみを閉じる（必要に応じて）
            // document.querySelectorAll('.collapsible-header.active').forEach(h => {
            //     if (h !== this) {
            //         h.classList.remove('active');
            //         h.nextElementSibling.classList.remove('show');
            //     }
            // });
            
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

// デバッグ用ユーティリティ
if (CONFIG.isDev) {
    window.debugLiff = {
        // 現在のユーザー情報確認
        async getCurrentUser() {
            try {
                const user = await getCurrentUser();
                console.log('Current User:', user);
                return user;
            } catch (error) {
                console.error('Error:', error);
            }
        },
        
        // イベント情報確認
        async getEvent(eventId) {
            try {
                const response = await apiRequest(`/api/liff/events/${eventId}`);
                const event = await response.json();
                console.log('Event:', event);
                return event;
            } catch (error) {
                console.error('Error:', error);
            }
        },
        
        // 設定確認
        getConfig() {
            console.log('Config:', CONFIG);
            return CONFIG;
        },
        
        // キャッシュ関連デバッグ
        clearCache() {
            clearAuthCache();
            console.log('🗑️ キャッシュをクリアしました');
        },
        
        showCache() {
            console.log('💾 現在のキャッシュ状況:');
            console.log('USER_INFO:', getFromSessionCache(SESSION_STORAGE.USER_INFO, SESSION_STORAGE.USER_EXPIRES));
            console.log('LIFF_PROFILE:', getFromSessionCache(SESSION_STORAGE.LIFF_PROFILE, SESSION_STORAGE.PROFILE_EXPIRES));
        }
    };
    
    console.log('🔧 LIFF Debug mode enabled. Use window.debugLiff for debugging.');
}

// ページ共通初期化
document.addEventListener('DOMContentLoaded', function() {
    // 折りたたみ機能初期化
    initCollapsible();
    
    // 開発環境でのデバッグ情報表示
    if (CONFIG.isDev) {
        console.log('🚀 LIFF App loaded in development mode');
        console.log('📱 Test User ID:', CONFIG.DEV_USER_ID);
    }
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
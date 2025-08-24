// RC公式LINE LIFF 共通JavaScript

// 共通設定
const CONFIG = {
    API_BASE: '',  // 相対パス使用
    DEV_USER_ID: 'U45bc8ea2cb931b9ff43aa41559dbc7fc', // 開発用テストユーザーID（花木さん）
    isDev: window.location.hostname === 'localhost'
};

// API リクエストヘルパー
async function apiRequest(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    // 開発環境では擬似LINE user IDを使用
    if (CONFIG.isDev) {
        headers['x-dev-line-user-id'] = CONFIG.DEV_USER_ID;
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
        const response = await apiRequest('/api/liff/me');
        return await response.json();
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
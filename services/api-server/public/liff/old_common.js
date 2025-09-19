// RC公式LINE LIFF 共通JavaScript（VPS本番用）

// 二重実行防止
if (window.__RCL_INIT_LOCK__) { console.warn('INIT locked'); } else { window.__RCL_INIT_LOCK__ = true; }

// 共通設定
const CONFIG = {
    API_BASE: window.location.hostname === 'localhost' ? '' : '/rcline',  // ローカルは相対パス、VPSは/rcline
    DEV_USER_ID: 'U45bc8ea2cb931b9ff43aa41559dbc7fc',
    isDev: window.location.hostname === 'localhost',  // 環境判定
    LIFF_ID: '2007866921-LkR3yg4k',  // 旧バージョン用LIFF ID
    showDebugUI: false  // 画面デバッグを出すか（?debug=1で上書き可能）
};

// ★ デバッグログ表示機能（画面上）
function showDebugLog(message, type = 'info') {
    // 画面UIは条件付き。コンソールは常に維持。
    const allowUI = CONFIG.showDebugUI || /(^|[?&])debug=1(&|$)/.test(location.search);
    console.log(`[DEBUG] ${message}`);

    if (!allowUI) return; // 本番ではUIを出さない

    const debugArea = document.getElementById('debug-log') || createDebugArea();
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = `debug-entry debug-${type}`;
    logEntry.innerHTML = `[${timestamp}] ${type.toUpperCase()}: ${message}`;
    debugArea.appendChild(logEntry);
    debugArea.scrollTop = debugArea.scrollHeight;
}

function createDebugArea() {
    const debugArea = document.createElement('div');
    debugArea.id = 'debug-log';
    debugArea.style.cssText = `
        position: fixed; bottom: 0; left: 0; right: 0; height: 200px;
        background: #000; color: #0f0; font-family: monospace; font-size: 10px;
        overflow-y: scroll; z-index: 9999; border-top: 2px solid #0f0;
        padding: 5px; box-sizing: border-box;
    `;
    
    // 閉じるボタン追加
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = `
        position: absolute; top: 2px; right: 5px; background: #f00; color: #fff;
        border: none; width: 20px; height: 16px; cursor: pointer; font-size: 12px;
    `;
    closeBtn.onclick = () => debugArea.style.display = 'none';
    debugArea.appendChild(closeBtn);
    
    document.body.appendChild(debugArea);
    showDebugLog('デバッグログ開始', 'system');
    return debugArea;
}

// LIFF初期化
let liffInitialized = false;
async function initLiff() {
    if (liffInitialized) return true;
    
    // 開発環境ではLIFF初期化をスキップ
    if (CONFIG.isDev) {
        showDebugLog('開発環境 - LIFF初期化をスキップ', 'info');
        liffInitialized = true;
        return true;
    }
    
    try {
        showDebugLog(`LIFF初期化開始 - ID: ${CONFIG.LIFF_ID}`, 'info');
        
        // LIFF SDKの読み込み診断
        showDebugLog(`window.liffSdkLoaded: ${window.liffSdkLoaded}`, 'info');
        showDebugLog(`window.liffSdkLoadError: ${window.liffSdkLoadError}`, 'info');
        showDebugLog(`typeof liff: ${typeof liff}`, 'info');
        
        // スクリプトタグの存在確認
        const liffScripts = document.querySelectorAll('script[src*="liff"]');
        showDebugLog(`LIFF関連script要素数: ${liffScripts.length}`, 'info');
        liffScripts.forEach((script, index) => {
            showDebugLog(`Script ${index + 1}: ${script.src} (loaded: ${script.readyState})`, 'info');
        });
        
        // LIFF SDKの存在確認
        if (typeof liff === 'undefined') {
            showDebugLog('LIFF SDK未読み込み', 'error');
            if (window.liffSdkLoadError) {
                showDebugLog('SDK読み込みでonerrorが発生', 'error');
            } else if (!window.liffSdkLoaded) {
                showDebugLog('SDKのonloadイベント未発火', 'error');
            }
            throw new Error('LIFF SDK not loaded');
        }
        
        showDebugLog('LIFF SDK読み込み確認OK', 'success');
        
        await liff.init({ liffId: CONFIG.LIFF_ID });
        showDebugLog('liff.init()完了', 'success');
        
        await liff.ready; // ★ 初期化完了を待つ
        showDebugLog('liff.ready完了', 'success');
        
        // --- ログイン分岐ロジック ---
        const inClient  = typeof liff.isInClient  === 'function' ? liff.isInClient()  : false;
        const loggedIn  = typeof liff.isLoggedIn  === 'function' ? liff.isLoggedIn()  : false;
        showDebugLog(`inClient: ${inClient}, loggedIn: ${loggedIn}`, 'info');

        // LINEアプリ内ならログイン不要（ここで login() しない）
        if (inClient) {
            showDebugLog('Running in LINE client. Skip liff.login().', 'success');
        } else {
            // 外部ブラウザなら未ログイン時のみ login。戻り先を明示
            if (!loggedIn) {
                const redirect = location.href;
                showDebugLog(`Not in client & not logged in → liff.login({redirectUri:${redirect}})`, 'warn');
                liff.login({ redirectUri: redirect });
                return false; // ここで一旦終了（遷移）
            }
        }

        showDebugLog('LIFF 初期化完了', 'success');
        liffInitialized = true;
        return true;
        
    } catch (error) {
        showDebugLog(`LIFF初期化失敗: ${error.message}`, 'error');
        showDebugLog(`エラー詳細: ${error.stack}`, 'error');
        throw error;
    }
}

// ★ プロフィールを1度だけ取得して userId をキャッシュ
let cachedUserId = null;
async function ensureLineUserId() {
    // 開発環境では固定IDを返す
    if (CONFIG.isDev) {
        const devUserId = localStorage.getItem('dev-line-user-id') || CONFIG.DEV_USER_ID;
        showDebugLog(`開発環境userId: ${devUserId}`, 'info');
        return devUserId;
    }
    
    try {
        showDebugLog('ensureLineUserId開始', 'info');

        // デバッグ用: inClientとisLoggedInの状態を記録
        showDebugLog(`ensureLineUserId: inClient=${typeof liff?.isInClient==='function' ? liff.isInClient() : 'NA'}`, 'info');
        showDebugLog(`ensureLineUserId: isLoggedIn=${typeof liff?.isLoggedIn==='function' ? liff.isLoggedIn() : 'NA'}`, 'info');

        if (!liffInitialized) {
            showDebugLog('LIFF未初期化 - initLiff実行', 'info');
            const ok = await initLiff();
            if (!ok) {
                showDebugLog('initLiff失敗 - ログイン遷移中', 'warn');
                return null; // ログイン遷移
            }
        }

        // LINEアプリ内かどうかを判定
        const inClient = typeof liff.isInClient === 'function' ? liff.isInClient() : false;

        // 外部ブラウザで未ログインの場合のみnullを返す
        // LINEアプリ内ではisLoggedIn()がfalseでもgetProfile()が可能
        if (!inClient && !liff.isLoggedIn()) {
            showDebugLog('外部ブラウザ未ログイン: login遷移を待機', 'warn');
            return null;
        }

        // LINEアプリ内でisLoggedIn()がfalseの場合のログ
        if (inClient && !liff.isLoggedIn()) {
            showDebugLog('LINEアプリ内: isLoggedIn=falseだがgetProfile()を続行', 'info');
        }
        
        if (cachedUserId) {
            showDebugLog(`キャッシュからuserId取得: ${cachedUserId}`, 'info');
            return cachedUserId;
        }
        
        showDebugLog('liff.getProfile()実行中', 'info');
        const profile = await liff.getProfile();
        cachedUserId = profile?.userId || null;
        showDebugLog(`プロフィール取得完了: ${cachedUserId}`, 'success');
        
        return cachedUserId;
        
    } catch (error) {
        showDebugLog(`ensureLineUserId失敗: ${error.message}`, 'error');
        return null;
    }
}

// API リクエストヘルパー
async function apiRequest(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    // 環境別認証ヘッダー設定
    if (CONFIG.isDev) {
        // ローカル開発環境：固定のdev user idを使用
        const devUserId = localStorage.getItem('dev-line-user-id') || CONFIG.DEV_USER_ID;
        headers['x-dev-line-user-id'] = devUserId;
        showDebugLog(`開発環境認証: ${devUserId}`, 'info');
    } else {
        // VPS本番環境：LIFF からトークン取得＋ユーザーIDを送る
        try {
            showDebugLog(`APIリクエスト認証ヘッダ設定開始: ${endpoint}`, 'info');
            
            if (liffInitialized && liff.isLoggedIn()) {
                const accessToken = liff.getAccessToken();
                if (accessToken) {
                    headers['Authorization'] = `Bearer ${accessToken}`;
                    showDebugLog(`アクセストークン設定完了: ${accessToken ? accessToken.substring(0, 10) + '...' : 'N/A'}`, 'info');
                }
            }
            
            // ★ サーバ認証の本命：x-line-user-id を必ず付与
            showDebugLog('LINE userId取得開始', 'info');
            const uid = await ensureLineUserId();
            if (!uid) {
                showDebugLog('LINE user id取得失敗', 'error');
                throw new Error('LINE user id not available');
            }
            headers['x-line-user-id'] = uid;
            showDebugLog(`x-line-user-id設定完了: ${uid}`, 'success');
            
        } catch (error) {
            showDebugLog(`認証ヘッダ設定エラー: ${error.message}`, 'error');
            throw error; // エラーを再スローしてAPIリクエスト停止
        }
    }
    
    try {
        showDebugLog(`fetch実行: ${CONFIG.API_BASE}${endpoint}`, 'info');
        const response = await fetch(CONFIG.API_BASE + endpoint, {
            ...options,
            headers
        });
        
        showDebugLog(`fetch応答: ${response.status} ${response.statusText}`, response.ok ? 'success' : 'error');
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            showDebugLog(`APIエラー詳細: ${JSON.stringify(errorData)}`, 'error');
            throw new Error(errorData.message || `HTTP ${response.status}`);
        }
        
        showDebugLog(`APIリクエスト成功: ${endpoint}`, 'success');
        return response;
        
    } catch (error) {
        showDebugLog(`fetch失敗: ${error.message}`, 'error');
        throw error;
    }
}

// セッションキャッシュの設定
const SESSION_CACHE = {
    USER_KEY: 'liff_user_info',
    EXPIRE_KEY: 'liff_user_expire',
    CACHE_DURATION: 60 * 60 * 1000 // 1時間
};

// キャッシュされたユーザー情報を取得
function getCachedUser() {
    try {
        const cached = sessionStorage.getItem(SESSION_CACHE.USER_KEY);
        const expire = sessionStorage.getItem(SESSION_CACHE.EXPIRE_KEY);

        if (cached && expire) {
            const expireTime = parseInt(expire);
            if (Date.now() < expireTime) {
                showDebugLog('セッションキャッシュからユーザー情報取得', 'success');
                return JSON.parse(cached);
            } else {
                showDebugLog('セッションキャッシュ期限切れ', 'info');
                sessionStorage.removeItem(SESSION_CACHE.USER_KEY);
                sessionStorage.removeItem(SESSION_CACHE.EXPIRE_KEY);
            }
        }
    } catch (error) {
        showDebugLog(`キャッシュ読み込みエラー: ${error.message}`, 'error');
    }
    return null;
}

// ユーザー情報をキャッシュに保存
function setCachedUser(userData) {
    try {
        sessionStorage.setItem(SESSION_CACHE.USER_KEY, JSON.stringify(userData));
        sessionStorage.setItem(SESSION_CACHE.EXPIRE_KEY, (Date.now() + SESSION_CACHE.CACHE_DURATION).toString());
        showDebugLog('ユーザー情報をセッションキャッシュに保存', 'success');
    } catch (error) {
        showDebugLog(`キャッシュ保存エラー: ${error.message}`, 'error');
    }
}

// 現在のユーザー情報を取得
async function getCurrentUser(forceRefresh = false) {
    try {
        showDebugLog('getCurrentUser開始', 'info');

        // キャッシュチェック（強制更新でない場合）
        if (!forceRefresh) {
            const cached = getCachedUser();
            if (cached) {
                return cached;
            }
        }
        
        const uid = await ensureLineUserId();
        if (!uid) {
            showDebugLog('LINE認証が必要です', 'warn');
            return null; // ログイン遷移中
        }
        
        // 環境別プロフィール取得
        let profile = null;
        if (CONFIG.isDev) {
            // 開発環境：疑似プロフィール
            profile = {
                userId: uid,
                displayName: '開発用ユーザー',
                pictureUrl: null
            };
            showDebugLog(`開発環境プロフィール: ${profile.displayName}`, 'info');
        } else {
            // VPS環境：LIFF SDKから取得
            showDebugLog('LIFFプロフィール再取得開始', 'info');
            profile = await liff.getProfile();
            showDebugLog(`LIFFプロフィール取得成功 - userId: ${profile.userId}, name: ${profile.displayName}`, 'success');
        }
        
        // APIサーバーからメンバー情報を取得
        showDebugLog('APIサーバーからメンバー情報取得開始', 'info');
        const response = await apiRequest('/api/liff/me');
        const userData = await response.json();
        
        showDebugLog(`メンバー情報取得完了 - member_id: ${userData.member_id || 'N/A'}`, 'success');

        const userInfo = {
            ...userData,
            lineProfile: profile
        };

        // キャッシュに保存
        setCachedUser(userInfo);

        return userInfo;
        
    } catch (error) {
        showDebugLog(`getCurrentUser失敗: ${error.message}`, 'error');
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

// 日付フォーマット（MM/DD）
function formatDateShort(isoString) {
    if (!isoString) return '';
    
    const date = new Date(isoString);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${month}/${day}`;
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

// 開発環境用デバッグユーティリティ
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
        
        // 設定確認
        getConfig() {
            console.log('Config:', CONFIG);
            return CONFIG;
        },
        
        // 開発用ユーザーID変更
        setDevUserId(userId) {
            localStorage.setItem('dev-line-user-id', userId);
            console.log(`🔧 開発用UserIDを変更: ${userId}`);
        },
        
        // 現在の開発用ユーザーID確認
        getDevUserId() {
            const userId = localStorage.getItem('dev-line-user-id') || CONFIG.DEV_USER_ID;
            console.log(`📱 現在の開発用UserID: ${userId}`);
            return userId;
        }
    };
    
    console.log('🔧 LIFF Debug mode enabled. Use window.debugLiff for debugging.');
}

// ページ共通初期化
document.addEventListener('DOMContentLoaded', function() {
    // 折りたたみ機能初期化
    initCollapsible();
    
    // 環境情報表示
    if (CONFIG.isDev) {
        console.log('🚀 LIFF App loaded in development mode');
        console.log('📱 Test User ID:', CONFIG.DEV_USER_ID);
        console.log('🌐 API Base:', CONFIG.API_BASE);
    }
});

// エクスポート（モジュールとして使う場合）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        apiRequest,
        getCurrentUser,
        formatDateTime,
        formatDateShort,
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
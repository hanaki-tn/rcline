// LIFF認証モジュール
// 全LIFF画面で共通利用する認証処理

class LIFFAuth {
    constructor() {
        this.currentUser = null;
        this.initialized = false;
    }

    /**
     * LIFF認証の初期化と実行
     * @param {Object} options - オプション設定
     * @param {boolean} options.redirectToRegister - 未紐付けユーザーを登録画面へリダイレクト（デフォルト: true）
     * @param {string} options.fromPage - 遷移元ページ名（register.htmlへのパラメータ用）
     * @returns {Promise<Object|null>} ユーザー情報または null
     */
    async initialize(options = {}) {
        const defaultOptions = {
            redirectToRegister: true,
            fromPage: 'events'
        };
        const settings = { ...defaultOptions, ...options };

        try {
            showDebugLog('LIFFAuth初期化開始', 'info');

            // 既に初期化済みの場合はキャッシュから返す
            if (this.initialized && this.currentUser) {
                showDebugLog('既に初期化済み - キャッシュから返却', 'success');
                return this.currentUser;
            }

            // LIFF SDK初期化
            await this.initializeLIFF();

            // ユーザー情報取得（セッションキャッシュ対応）
            this.currentUser = await getCurrentUser();

            if (!this.currentUser) {
                showDebugLog('認証失敗 - ユーザー情報取得できず', 'error');
                this.showAuthError();
                return null;
            }

            // 紐付け状態確認
            if (!this.currentUser.is_target || this.currentUser.is_target === 0) {
                showDebugLog('未紐付けユーザー検出', 'warn');

                if (settings.redirectToRegister) {
                    this.redirectToRegister(settings.fromPage);
                    return null;
                }
            }

            // 初期化成功
            this.initialized = true;
            showDebugLog(`認証成功 - ${this.currentUser.name} (ID: ${this.currentUser.member_id})`, 'success');

            // 開発環境での情報表示
            this.showDevInfo();

            return this.currentUser;

        } catch (error) {
            showDebugLog(`LIFFAuth初期化エラー: ${error.message}`, 'error');
            console.error('LIFFAuth初期化エラー:', error);
            this.showAuthError();
            return null;
        }
    }

    /**
     * LIFF SDKの初期化
     */
    async initializeLIFF() {
        // 開発環境ではスキップ
        if (CONFIG.isDev) {
            showDebugLog('開発環境 - LIFF初期化スキップ', 'info');
            return;
        }

        // LIFF SDKの存在確認
        if (typeof liff === 'undefined') {
            throw new Error('LIFF SDK not loaded');
        }

        // 既に初期化済みかチェック
        if (!liffInitialized) {
            await initLiff();
        }
    }

    /**
     * 会員登録画面へリダイレクト
     */
    redirectToRegister(fromPage) {
        const urlParams = new URLSearchParams(window.location.search);
        const eventId = urlParams.get('id');

        let registerUrl = `register.html?from=${fromPage}`;
        if (eventId) {
            registerUrl += `&id=${eventId}`;
        }

        console.log(`未紐付けユーザーのため、会員登録画面へ遷移: ${registerUrl}`);
        window.location.href = registerUrl;
    }

    /**
     * 認証エラー表示
     */
    showAuthError() {
        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            showError('main-content', '認証に失敗しました。LINEから再度アクセスしてください。');
        }
    }

    /**
     * 開発環境情報表示
     */
    showDevInfo() {
        if (!CONFIG.isDev) return;

        const devInfo = document.getElementById('dev-info');
        if (devInfo) {
            devInfo.classList.remove('d-none');
            devInfo.innerHTML = `
                <div class="message message-info">
                    <strong>開発モード:</strong> ${this.currentUser.name || 'テストユーザー'}
                    (ID: ${this.currentUser.member_id || 'N/A'})
                </div>
            `;
        }
    }

    /**
     * ユーザー情報取得
     */
    getUser() {
        return this.currentUser;
    }

    /**
     * 認証状態確認
     */
    isAuthenticated() {
        return this.initialized && this.currentUser !== null;
    }

    /**
     * 認証情報リフレッシュ
     */
    async refresh() {
        showDebugLog('認証情報リフレッシュ開始', 'info');
        this.currentUser = await getCurrentUser(true); // 強制リフレッシュ
        return this.currentUser;
    }

    /**
     * ログアウト処理
     */
    logout() {
        // セッションキャッシュクリア
        sessionStorage.removeItem(SESSION_CACHE.USER_KEY);
        sessionStorage.removeItem(SESSION_CACHE.EXPIRE_KEY);

        // 内部状態リセット
        this.currentUser = null;
        this.initialized = false;

        showDebugLog('ログアウト完了', 'info');

        // LIFF環境でのログアウト
        if (typeof liff !== 'undefined' && liff.isLoggedIn()) {
            liff.logout();
        }
    }
}

// グローバルインスタンス作成
const liffAuth = new LIFFAuth();

// エクスポート（モジュールとして使う場合）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LIFFAuth;
}
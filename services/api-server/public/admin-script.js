// RC公式LINE 管理画面 JavaScript

let currentUser = null;

// 認証状況確認
async function checkAuth() {
    const statusDiv = document.getElementById('auth-status');
    
    try {
        const response = await fetch('/api/admin/me', {
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            statusDiv.innerHTML = `<span class="success">認証済み: ${data.username}</span>`;
            currentUser = data;
        } else {
            statusDiv.innerHTML = '<span class="error">未認証</span>';
            currentUser = null;
        }
    } catch (error) {
        statusDiv.innerHTML = `<span class="error">エラー: ${error.message}</span>`;
        currentUser = null;
    }
}

// ログイン
async function doLogin() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const resultDiv = document.getElementById('login-result');
    
    if (!username || !password) {
        resultDiv.innerHTML = '<div class="status error">ユーザー名とパスワードを入力してください</div>';
        return;
    }
    
    try {
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            resultDiv.innerHTML = '<div class="status success">ログイン成功</div>';
            currentUser = data.user;
            setTimeout(checkAuth, 500);
        } else {
            resultDiv.innerHTML = `<div class="status error">ログイン失敗: ${data.message}</div>`;
        }
    } catch (error) {
        resultDiv.innerHTML = `<div class="status error">エラー: ${error.message}</div>`;
    }
}

// ログアウト
async function doLogout() {
    try {
        await fetch('/api/admin/logout', {
            method: 'POST',
            credentials: 'include'
        });
        
        currentUser = null;
        document.getElementById('login-result').innerHTML = '<div class="status success">ログアウトしました</div>';
        checkAuth();
    } catch (error) {
        document.getElementById('login-result').innerHTML = `<div class="status error">ログアウトエラー: ${error.message}</div>`;
    }
}

// 会員一覧読み込み
async function loadMembers() {
    const roleFilter = document.getElementById('role-filter').value;
    const params = roleFilter ? `?role=${roleFilter}` : '';
    const resultDiv = document.getElementById('members-result');
    
    try {
        const response = await fetch(`/api/admin/members${params}`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('認証が必要です');
        }
        
        const data = await response.json();
        
        let html = `<h3>会員一覧 (${data.items.length}件)</h3>`;
        html += '<table>';
        html += '<thead><tr><th>ID</th><th>名前</th><th>Role</th><th>LINE紐づけ</th><th>送信対象</th><th>表示順</th></tr></thead>';
        html += '<tbody>';
        
        data.items.forEach(member => {
            html += `<tr>
                <td>${member.id}</td>
                <td>${member.name}</td>
                <td><span style="background: ${member.role === 'member' ? '#e3f2fd' : '#fff3e0'}; color: ${member.role === 'member' ? '#1976d2' : '#f57c00'}; padding: 2px 8px; border-radius: 12px; font-size: 12px;">${member.role}</span></td>
                <td><span style="background: ${member.line_user_id_present ? '#e8f5e8' : '#ffebee'}; color: ${member.line_user_id_present ? '#2e7d32' : '#d32f2f'}; padding: 2px 8px; border-radius: 12px; font-size: 12px;">${member.line_user_id_present ? '紐づけ済み' : '未紐づけ'}</span></td>
                <td>${member.is_target ? '○' : '×'}</td>
                <td>${member.display_order || '-'}</td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        resultDiv.innerHTML = html;
        
    } catch (error) {
        resultDiv.innerHTML = `<div class="status error">エラー: ${error.message}</div>`;
    }
}

// Audiences一覧読み込み
async function loadAudiences() {
    const resultDiv = document.getElementById('audiences-result');
    
    try {
        const response = await fetch('/api/admin/audiences', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('認証が必要です');
        }
        
        const data = await response.json();
        
        let html = `<h3>Audiences一覧 (${data.items.length}件)</h3>`;
        html += '<table>';
        html += '<thead><tr><th>ID</th><th>名前</th><th>ソート順</th><th>作成日時</th><th>操作</th></tr></thead>';
        html += '<tbody>';
        
        data.items.forEach(audience => {
            const createdAt = new Date(audience.created_at).toLocaleString('ja-JP');
            html += `<tr>
                <td>${audience.id}</td>
                <td>${audience.name}</td>
                <td>${audience.sort_order || '-'}</td>
                <td>${createdAt}</td>
                <td>
                    <button onclick="deleteAudience(${audience.id})" class="danger">削除</button>
                </td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        resultDiv.innerHTML = html;
        
    } catch (error) {
        resultDiv.innerHTML = `<div class="status error">エラー: ${error.message}</div>`;
    }
}

// Audience作成
async function createAudience() {
    const name = document.getElementById('audience-name').value;
    const sortOrder = document.getElementById('audience-sort').value;
    const resultDiv = document.getElementById('create-result');
    
    if (!name) {
        resultDiv.innerHTML = '<div class="status error">名前は必須です</div>';
        return;
    }
    
    try {
        const response = await fetch('/api/admin/audiences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ 
                name, 
                sort_order: sortOrder ? parseInt(sortOrder) : undefined 
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            resultDiv.innerHTML = '<div class="status success">作成完了</div>';
            document.getElementById('audience-name').value = '';
            document.getElementById('audience-sort').value = '';
            loadAudiences();
        } else {
            resultDiv.innerHTML = `<div class="status error">作成失敗: ${data.message}</div>`;
        }
    } catch (error) {
        resultDiv.innerHTML = `<div class="status error">エラー: ${error.message}</div>`;
    }
}

// Audience削除
async function deleteAudience(id) {
    if (!confirm('本当に削除しますか？')) return;
    
    try {
        const response = await fetch(`/api/admin/audiences/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (response.ok) {
            loadAudiences();
        } else {
            alert('削除に失敗しました');
        }
    } catch (error) {
        alert('エラーが発生しました');
    }
}

// ヘルスチェック
async function testHealthCheck() {
    const resultDiv = document.getElementById('test-result');
    
    try {
        const response = await fetch('/health');
        const data = await response.json();
        
        resultDiv.innerHTML = `<pre>ヘルスチェック結果:\n${JSON.stringify(data, null, 2)}</pre>`;
    } catch (error) {
        resultDiv.innerHTML = `<div class="status error">エラー: ${error.message}</div>`;
    }
}

// Audience削除
async function deleteAudience(id) {
    if (!confirm('本当に削除しますか？')) return;
    
    try {
        const response = await fetch(`/api/admin/audiences/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (response.ok) {
            loadAudiences();
        } else {
            alert('削除に失敗しました');
        }
    } catch (error) {
        alert('エラーが発生しました');
    }
}

// 簡易版用: Audience選択プルダウンを更新
async function updateAudienceSelect() {
    const select = document.getElementById('audience-select');
    if (!select) return;
    
    try {
        const response = await fetch('/api/admin/audiences', {
            credentials: 'include'
        });
        
        if (!response.ok) return;
        
        const data = await response.json();
        select.innerHTML = '<option value="">-- Audienceを選択 --</option>';
        data.items.forEach(audience => {
            select.innerHTML += `<option value="${audience.id}">${audience.name}</option>`;
        });
    } catch (error) {
        console.error('Audience一覧取得エラー:', error);
    }
}

// 簡易版用: 選択されたAudienceのメンバー管理を開始
async function loadAudienceForMembers() {
    const select = document.getElementById('audience-select');
    const selectedId = select.value;
    
    if (!selectedId) {
        alert('Audienceを選択してください');
        return;
    }
    
    const selectedName = select.options[select.selectedIndex].text;
    document.getElementById('selected-audience-name').textContent = selectedName;
    document.getElementById('member-management').classList.remove('hidden');
    
    await loadCurrentAudienceMembers(selectedId);
    await loadAllMembersForSelection(selectedId);
}

// 簡易版用: 現在の所属メンバー取得
async function loadCurrentAudienceMembers(audienceId) {
    const resultDiv = document.getElementById('current-audience-members');
    
    try {
        const response = await fetch(`/api/admin/audiences/${audienceId}/members`, {
            credentials: 'include'
        });
        
        if (!response.ok) throw new Error('認証が必要です');
        
        const data = await response.json();
        
        if (data.items.length === 0) {
            resultDiv.innerHTML = '<p>所属メンバーはいません</p>';
        } else {
            let html = '<ul>';
            data.items.forEach(member => {
                html += `<li>${member.name} (${member.role}) ${member.line_user_id_present ? '✓' : '✗'}</li>`;
            });
            html += '</ul>';
            resultDiv.innerHTML = html;
        }
    } catch (error) {
        resultDiv.innerHTML = `<div class="status error">エラー: ${error.message}</div>`;
    }
}

// 簡易版用: 全メンバー一覧をチェックボックスで表示
async function loadAllMembersForSelection(audienceId) {
    const checkboxDiv = document.getElementById('member-checkboxes');
    
    try {
        // 現在の所属メンバーを取得
        const currentResponse = await fetch(`/api/admin/audiences/${audienceId}/members`, {
            credentials: 'include'
        });
        
        if (!currentResponse.ok) throw new Error('認証が必要です');
        
        const currentData = await currentResponse.json();
        const currentMemberIds = new Set(currentData.items.map(m => m.member_id));
        
        // 全メンバー一覧を取得
        const allResponse = await fetch('/api/admin/members?role=member', {
            credentials: 'include'
        });
        
        if (!allResponse.ok) throw new Error('認証が必要です');
        
        const allData = await allResponse.json();
        
        let html = '';
        allData.items.forEach(member => {
            const isSelected = currentMemberIds.has(member.id);
            html += `
                <div style="margin: 3px 0;">
                    <label>
                        <input type="checkbox" name="simple-member-checkbox" value="${member.id}" ${isSelected ? 'checked' : ''}>
                        ${member.name} (${member.role}) ${member.line_user_id_present ? '✓' : '✗'}
                    </label>
                </div>
            `;
        });
        
        checkboxDiv.innerHTML = html;
    } catch (error) {
        checkboxDiv.innerHTML = `<div class="status error">エラー: ${error.message}</div>`;
    }
}

// 簡易版用: 選択したメンバーを保存
async function saveSelectedMembers() {
    const select = document.getElementById('audience-select');
    const audienceId = select.value;
    
    if (!audienceId) return;
    
    const checkboxes = document.querySelectorAll('input[name="simple-member-checkbox"]:checked');
    const memberIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
    const resultDiv = document.getElementById('member-save-result');
    
    try {
        const response = await fetch(`/api/admin/audiences/${audienceId}/members`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ member_ids: memberIds })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            resultDiv.innerHTML = `<div class="status success">保存完了: ${data.count}名を割り当てました</div>`;
            await loadCurrentAudienceMembers(audienceId);
        } else {
            resultDiv.innerHTML = `<div class="status error">保存失敗: ${data.message}</div>`;
        }
    } catch (error) {
        resultDiv.innerHTML = `<div class="status error">エラー: ${error.message}</div>`;
    }
}

// ページ読み込み時の初期化
document.addEventListener('DOMContentLoaded', function() {
    // 初期状況確認
    checkAuth();
    
    // 簡易版のaudienceプルダウンを初期化
    setTimeout(() => {
        updateAudienceSelect();
    }, 1000);
});
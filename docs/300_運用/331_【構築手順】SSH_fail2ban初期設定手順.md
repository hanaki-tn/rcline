# fail2ban 環境構築手順（構築済み）

> **注意**: この文書は初期環境構築時の作業記録です。現在のシステムには既に適用済みです。  
> 現在のセキュリティ構成全体については → [211_VPS_セキュリティ構成.md](../100_設計/211_VPS_セキュリティ構成.md) を参照

---

## 1. 実施済み設定内容（2025-09時点）

### 1.1 インストール（実施済み）
```bash
apt update
apt install -y fail2ban
```

### 1.2 設定ファイル（実施済み）
`/etc/fail2ban/jail.local`  

```ini
[sshd]
enabled  = true
port     = 10022    # ※現在は10022番に変更済み
backend  = systemd

maxretry = 1       # 1回失敗で即BAN（変更済み）
findtime = 600     # 10分以内
bantime  = 36000   # 10時間ブロック（変更済み）
ignoreip = 127.0.0.1/8
```

### 1.3 サービス起動（実施済み）
```bash
systemctl enable --now fail2ban
```

---

## 2. 運用時の確認コマンド

### 状態確認
```bash
# 現在のjailの状態確認
fail2ban-client status

# 特定のjail（SSH）の詳細確認
fail2ban-client status sshd
```

### ログ確認
```bash
tail -n 50 /var/log/fail2ban.log
```

### BAN解除（必要なとき）
```bash
fail2ban-client set sshd unbanip <IPアドレス>
```

---

---

## 3. 緊急時の対応手順

### もし自分が fail2ban に BAN されたら（復旧手順）

#### 症状

* SSH で接続しようとしても

  ```
  Connection refused
  ```

  または

  ```
  ssh_exchange_identification: read: Connection reset by peer
  ```

  と表示され、ログインできない。
* `fail2ban-client status sshd` を見られないので確認不可。

---

#### 復旧の基本方針

* **VPS提供会社のコンソール（Web管理画面にある「緊急ログイン端末」や「シリアルコンソール」）からアクセスする。**
  → これは fail2ban の BAN の影響を受けない。
* そこからサーバに直接コマンドを入力できるので、BAN解除が可能。

---

#### BAN解除のコマンド

コンソールでログインできたら、まず自分のグローバルIPを調べる（自宅や会社からのアクセス元IP）。
※事前にスマホやPCで `https://ifconfig.me/` を開けば確認可能。

#### A. fail2ban での BAN解除

```bash
# SSH jail の状態確認
fail2ban-client status sshd

# BANを解除（<あなたのIP> を実際のIPで置き換える）
fail2ban-client set sshd unbanip <あなたのIP>
```

#### B. 応急処置で fail2ban を止める（最悪の時）

```bash
systemctl stop fail2ban
```

※ この場合、攻撃も通るようになるので、修正後は必ず再起動する：

```bash
systemctl start fail2ban

systemctl restart fail2ban
```

---

---

## 重要ポイント

* **秘密鍵ログイン** なので、基本的に自分が BAN されることはほぼない
* もしもの場合は **Xserver VPSの管理画面コンソールから復旧できる**
* 最重要コマンド：
  ```bash
  fail2ban-client set sshd unbanip <自分のIP>
  ```

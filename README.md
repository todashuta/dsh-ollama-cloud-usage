# dsh-ollama-cloud-usage

Ollama Cloud の使用量（usage）と残高（balance）を表示する DSH バンドルです。
コマンド名は `/ocusage` です。DSH のバンドル形式なので、プロファイルにインストールして Plugins ページからも管理できます。

## 使用例

DSH の入力欄に次のように入力します。

```text
> /ocusage 7d
Ollama Cloud (self)  2026-10-30 23:25
残高  included $4.80 / $60.00   2026-10-18 20:46 → 2026-11-18 20:46
      purchased $120.00
7d  5,399 req  $47.29  入力 971.7M (cache 942.8M)  出力 4.9M
      範囲 2026-10-23 09:00 → 2026-10-30 23:25
日別  10/23 $0.223  10/24 $39.06  10/25 $2.65  10/26 $0.133  10/27 $1.20  10/28 $1.70  10/29 $0.444  10/30 $1.89*
```

```text
> /ocusage 24h
Ollama Cloud (self)  2026-10-31 00:24
残高  included $4.68 / $60.00   2026-10-18 20:46 → 2026-11-18 20:46
      purchased $120.00
24h  649 req  $2.16  入力 140.6M (cache 135.6M)  出力 735.3K
      範囲 2026-10-30 00:00 → 2026-10-31 00:24
```

## 使い方

| 入力 | 表示範囲 |
|---|---|
| `/ocusage` | 7d（既定） |
| `/ocusage 24h` | 直近24時間（1時間ごと） |
| `/ocusage 7d` | 直近7日（1日ごと） |
| `/ocusage 30d` | 直近30日（1日ごと） |

`24h / 7d / 30d` 以外を渡すとエラーを返します。

## 構成

```
dsh-ollama-cloud-usage/
├── package.json       # dsh.bundle.patch を宣言
├── cordis.patch.yml   # /ocusage コマンドの行を insert
├── index.js           # プラグイン本体
├── test-local.mjs     # 実 API での確認用（バンドルには含めない）
└── README.md
```

## インストール

### GUI から

1. このディレクトリを好きな場所へ移動する（例: `c:/users/foo/.dsh/plugins/dsh-ollama-cloud-usage`）
2. Web の **Plugins** ページから、そのパスを指定してインストールする
3. 再起動する（HMR が有効なら即時反映）

### CLI から

```sh
dsh plugin --profile web add c:/users/foo/.dsh/plugins/dsh-ollama-cloud-usage
```

`dsh` が PATH に無い環境では、CLI が入っている場所から実行してください。
インストールするとプロファイルの `package.json` に `link:` 依存が追加され、
`dsh.profile.bundles` に載り、Plugins ページで有効・無効を切り替えられるようになります。

## 前提と注意

- キーは保存層の `OLLAMA_CLOUD_API_KEY` を `ctx.credentials.resolve` で解決します（値は画面・ログに出しません）
- Ollama の API は **10 リクエスト/分**。`/ocusage` 1 回で 2 リクエスト（balance + usage）消費します
- 表示は日本時間（UTC+9）固定です。`partial` のバケットには `*` を付けています
- `included` が旧プラン形式（session / weekly）の場合は、そちらの残量率を表示します
- `engines.dsh` は宣言していません。実行中の DSH のバージョンが分からず、範囲を誤るとインストールが拒否されるためです

## うまくいかないとき

- **コマンドがメニューに出ない** — 再起動したか、Plugins ページでバンドルが有効かを確認してください
- **`OLLAMA_CLOUD_API_KEY が未設定です`** — 設定 → モデル からキーを保存するか、`c:/users/foo/.dsh/.credentials.yaml` の `refs:` に追加してください

## アンインストール

```sh
dsh plugin --profile web remove dsh-ollama-cloud-usage
```

または Plugins ページから削除します。

## 動作確認（任意）

`test-local.mjs` は実 API を叩いて整形結果だけを表示します（キーは表示しません）。

```
node test-local.mjs
```

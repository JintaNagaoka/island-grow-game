# Island Grow Game

TypeScript + Phaser + Vite + Vitest の最小セットアップです。現時点では Phaser のプレースホルダー画面が表示されるだけで、ゲーム進行・入力・ルールは含みません。

## 前提ランタイム

- Node.js 22.12 以上の 22.x（推奨: `.nvmrc` の `22.23.1`）
- npm 10（Node 22 同梱。`package.json` の `packageManager` を参照）
- 依存関係は `package-lock.json` で固定されています。`yarn` / `pnpm` は使いません。

nvm を使う場合は、リポジトリのルートで `nvm install` と `nvm use` を実行します。

## コマンド

| 目的 | コマンド |
| --- | --- |
| 依存関係のインストール（lockfile 通り） | `npm ci` |
| 開発サーバー起動 | `npm run dev` |
| production build（型チェック + `dist/` 生成） | `npm run build` |
| build 成果物のローカル確認 | `npm run preview` |
| 型チェックのみ | `npm run typecheck` |
| テスト実行 | `npm test` |

`npm run build` と `npm test` はブラウザ操作なしで実行できます。

## 表示確認

1. `npm run dev` を実行し、表示された URL（既定は <http://localhost:5173/>）をブラウザで開きます。
2. 縦長の背景に "Island Grow Game (placeholder)" と表示され、ブラウザのコンソールにエラーが出ないことを確認します。
3. ウィンドウの縦横比を変えても、9:16 の画面が中央にフィットして表示されることを確認します。

## ディレクトリ構成

- `src/main.ts`: Phaser の起動設定
- `src/presentation/`: Phaser に依存するコード（Scene など）。画面比率・サイズ依存の値は `display.ts` に集約しています。
- 将来の WorldState / Game Logic は Phaser に依存しない純粋な TypeScript として `src/` 配下に分けて置き、`phaser` を import するのは `src/main.ts` と `src/presentation/` に限ります。現時点ではそのためのコードは作成していません。

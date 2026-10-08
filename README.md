# Island Grow Game

TypeScript + Phaser + Vite + Vitest のプロジェクトです。現在は Vertical Slice 01「🔥で小人が暖まる」のみ遊べます（仮アセット）。🌱 / 🪨 / 💧 の進行、24 順列、END 判定などは未実装です。

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

## Vertical Slice 01 のプレイ確認

1. `npm run dev` を実行し、表示された URL（既定は <http://localhost:5173/>）をブラウザで開きます。スマホ相当の縦長ウィンドウ（例: 390x844）にすると確認しやすいです。
2. 初期画面で、高低差のあるミニチュア島全体（奥の洞窟、中央の木と動物、手前の雨よけ・小人・発展用の空き地）と、最下部の 🔥 / 🌱 / 🪨 / 💧 が同時に見えることを確認します。クリーム色の顔なし小人は地面で膝を抱え、頭上部の薄い青色と身体左右の震え線で寒さを示します。
3. 🌱 / 🪨 / 💧（「準備中」表示）をタップしても何も起きないことを確認します。
4. 🔥 をタップします。約 6.8 秒（初期目安 5〜8 秒）で次の順に進みます。
   - Wave 1: 空き地に火が短い演出つきで現れる
   - Wave 2: 小人が火に気づき（notice）、立ち上がり（rise）、承認済み4方向歩行素材（右向き）で火へ近づく。歩行中は `WorldState.isCold` が true の間だけ既存の寒さ表現（青い頭部と震え線）を重ねる
   - Wave 3: 火のそばで承認済みの warm 姿勢になり、ロジックが `isCold=false` にした後は通常の idle 姿勢になる

上下左右の歩行確認用に、開発サーバーでのみ `/?humanWalkPreview` を開くと、小人が右→下→左→上へ歩き続けるレビュー用ループを表示します（🔥 を押すと `isCold` が false になった後の見た目も確認できます）。本番ビルドでは無効です。
5. 再生中に 🔥 や他のボタンを連打しても、進行が重複したり変わったりしないことを確認します。
6. 完了後、🔥 が「✓ 選択済み」になり再選択できないこと、火・小人・木・動物の小さなアイドル動作が続き、箱庭が完全停止しないことを確認します。やり直す場合はページを再読み込みします。
7. ブラウザのコンソールに未処理エラーが出ていないことを確認します（開発サーバーでは `favicon.ico` の 404 のみ出ます）。
8. ウィンドウの縦横比を変えても、9:16 の画面が中央にフィットして表示されることを確認します。

間・歩行の可愛さ・演出の長さ・画面余白などの体感は自動テストでは判定できません。人間によるプレイレビューで確認してください。

## ディレクトリ構成

- `src/main.ts`: Phaser の起動設定
- `src/game/`: Phaser に依存しない純粋な TypeScript の WorldState と Game Logic。
  - `worldState.ts`: `WorldState` と初期状態
  - `waves.ts`: Wave の定義（順序と、各 Wave 完了時の WorldState 変更）
  - `timing.ts`: 再生時間と再生速度の唯一の境界。Wave の長さは再生速度 1x の論理ミリ秒で、将来の一括再生速度変更はここを通ります。
  - `sliceGame.ts`: 入力ガード、Wave 再生中の入力ロック、論理クロックによる Wave の順次再生
- `src/presentation/`: Phaser に依存するコード（Scene など）。画面比率・サイズ依存の値は `display.ts` と `layout.ts` に集約しています。
  - `IslandScene.ts`: 入力を `SliceGame` に渡し、`SliceGame.snapshot()` から毎フレーム描画するだけの Scene
  - `animation.ts`: スナップショットから小人・火・環境idleの見た目を計算する純粋関数（Phaser 非依存）

依存方向は `src/game/`（WorldState / Game Logic / Wave）→ `src/presentation/`（Phaser）です。`phaser` を import するのは `src/main.ts` と `src/presentation/` の Scene に限り、`src/game/` からは `src/presentation/` を import しません。Phaser のアニメーション完了は状態の成立条件にしておらず、tween やタイマーも使っていません。

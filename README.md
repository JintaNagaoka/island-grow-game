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
2. 初期画面で、明るい青の海に浮かぶ高低差のあるミニチュア島全体（奥の洞窟、画像に描き込み済みの木 1 本、白い架空生物 1 匹、手前の雨よけと小人、中央・手前の空き地）と、最下部の 🔥 / 🌱 / 🪨 / 💧 が同時に見えることを確認します。市松模様・矩形の切り抜き跡・縁のにじみ・穴がなく、旧仕様の羊・鹿が出ていないことも見ます（木は非インタラクティブな背景で、`plantStage` は 0 のままです）。クリーム色の顔なし小人は地面で膝を抱え、頭上部の薄い青色と身体左右の震え線で寒さを示します。
3. 🌱 / 🪨 / 💧（「準備中」表示）をタップしても何も起きないことを確認します。
4. 🔥 をタップします。約 6.8 秒（初期目安 5〜8 秒）で次の順に進みます。
   - Wave 1: 空き地に火（PNG）が短い演出つきで現れる（開始前は非表示）
   - Wave 2: 小人が火に気づき（notice。この素材で既に立っており、歩き出すまで同じ姿勢を保つ。rise の独立区間はない）、承認済み4方向歩行素材（右向き）で火へ近づく。歩行中は `WorldState.isCold` が true の間だけ既存の寒さ表現（青い頭部と震え線）を重ねる
   - Wave 3: 火のそばで承認済みの warm 姿勢になり、ロジックが `isCold=false` にした後は通常の idle 姿勢になる

上下左右の歩行確認用に、開発サーバーでのみ `/?humanWalkPreview` を開くと、小人が右→下→左→上へ歩き続けるレビュー用ループを表示します（🔥 を押すと `isCold` が false になった後の見た目も確認できます）。本番ビルドでは無効です。
5. 再生中に 🔥 や他のボタンを連打しても、進行が重複したり変わったりしないことを確認します。
6. 完了後、🔥 が「✓ 選択済み」になり再選択できないこと、火・小人・動物の小さなアイドル動作が続き、箱庭が完全停止しないことを確認します。やり直す場合はページを再読み込みします。
7. ブラウザのコンソールに未処理エラーが出ていないことを確認します（開発サーバーでは `favicon.ico` の 404 のみ出ます）。
8. ウィンドウの縦横比を変えても、9:16 の画面が中央にフィットして表示されることを確認します。

間・歩行の可愛さ・演出の長さ・画面余白などの体感は自動テストでは判定できません。人間によるプレイレビューで確認してください。

## World asset derivation（初期状態 / Turn 1 の世界素材）

`public/assets/world/initial-turn1/` の 4 枚は、供給された仮素材 ZIP から機械的に生成した 8-bit RGBA PNG です。RGB の市松模様つき原本はランタイムで読み込みません（リポジトリにも含めません）。

| 出力 | 元ファイル | 処理 | サイズ |
| --- | --- | --- | --- |
| `island-base.png` | `island_base_with_cave_tree.png` | 外周につながる市松模様を除去、可視範囲へトリミング | 941x1543 |
| `shelter-stage1.png` | `shelter_512_transparent.png` | 可視範囲へトリミングのみ | 423x306 |
| `animal-stage1.png` | `fantasy_creature_provisional.png` | 外周につながる市松模様を除去、トリミング、幅 512 へ縮小 | 512x306 |
| `fire-stage1.png` | `campfire_provisional.png` | 可視範囲へトリミング、幅 256 へ縮小 | 256x262 |

`cave_reference_approved_design.png` は島に洞窟が含まれるため使いません。

再生成手順（Node.js 22 以上。追加依存なし）:

1. ZIP（SHA-256 `c819df53c7d92f810b6801de2354fab15a1eabb39dbceda4eed029b14326185d`）を Git 管理外の `asset-source/` に展開します（`.gitignore` 済み）。
   ```sh
   shasum -a 256 <path>/1-game_assets_initial_turn1_provisional.zip
   mkdir -p asset-source/initial-turn1
   unzip <path>/1-game_assets_initial_turn1_provisional.zip -d asset-source/initial-turn1
   ```
2. `node scripts/deriveWorldAssets.mjs asset-source/initial-turn1`
   （出力先を変える場合は第 2 引数）。同じ入力から常に同じバイト列が出ます。

背景除去は生成 AI を使わない決定的な処理です（`scripts/worldAssetPixels.mjs` の `removeExteriorBackground`）。

1. 無彩色に近く（最大 − 最小 ≤ 14）中明度（輝度 100〜215）の画素を「市松模様らしい」と判定します。水際に焼き込まれた淡い青灰色のもや（彩度 ≤ 62、青が赤より 6 以上強い、輝度 120〜225）も同様に判定します。飽和した水色・赤みのある岩・白い波しぶきは条件外です。
2. 画像の縁から 4 近傍で連結する市松模様らしい画素だけを透明にします。黒い輪郭線・クリーム色の体・白い波しぶきは条件外なので、そこで止まります。輪郭の内側にある灰色（岩など）は外周につながらないため残ります。
3. 透明領域に接する 2 画素幅の縁は、最寄りの市松色と内側の前景色から混色率を逆算し、部分的なアルファに戻します（灰色のフリンジを残さず、アンチエイリアスを保つ）。ブレンド線から外れる画素（黒い輪郭など）は不透明のままです。
4. 透明領域に面した外縁から、市松模様の明るい灰色が水色に混ざった縁の画素（低彩度・輝度 150〜222、8 近傍の 3 つ以上が透明）を `peelGrayRim` で 2 画素分だけ剥がします。内部の灰色や白い波しぶきは対象外です。
5. 外周から切り離された 200 画素未満の孤立片（市松模様の明るめの残り）を `removeSpeckles` で除去します。

島の左上、洞窟の下の水際には、原本に淡い青灰色のもやが市松模様と混ざって描かれており、機械的には完全に分離できません。除去後も小さな淡青の残りが数箇所あります。`review-artifacts/issue-9-turn1-world-assets/` の比較画像で人間レビューしてください。

矩形で隠したり、描き直したりはしていません。ランタイム PNG は `src/presentation/worldAssets.ts` に、テクスチャキー・ファイル名・サイズ・接地点（ground anchor）・基準スケール・配置を集約しています。島の見た目の拡縮・位置は `layout.ts` の島 → デザイン座標変換だけで決まり、小道具は島画像のピクセル座標で置いています。

## ディレクトリ構成

- `src/main.ts`: Phaser の起動設定
- `src/game/`: Phaser に依存しない純粋な TypeScript の WorldState と Game Logic。
  - `worldState.ts`: `WorldState` と初期状態
  - `waves.ts`: Wave の定義（順序と、各 Wave 完了時の WorldState 変更）
  - `timing.ts`: 再生時間と再生速度の唯一の境界。Wave の長さは再生速度 1x の論理ミリ秒で、将来の一括再生速度変更はここを通ります。
  - `sliceGame.ts`: 入力ガード、Wave 再生中の入力ロック、論理クロックによる Wave の順次再生
- `src/presentation/`: Phaser に依存するコード（Scene など）。画面比率・サイズ依存の値は `display.ts` と `layout.ts` に集約しています。
  - `IslandScene.ts`: 入力を `SliceGame` に渡し、`SliceGame.snapshot()` から毎フレーム描画するだけの Scene
  - `animation.ts`: スナップショットから小人・火・動物のidleの見た目を計算する純粋関数（Phaser 非依存）
  - `worldAssets.ts`: 島・雨よけ・動物・火 PNG のメタデータ（キー、ファイル名、サイズ、接地点、スケール、配置）
- `scripts/`: ランタイム世界 PNG を元素材から再生成する Node スクリプト（`deriveWorldAssets.mjs`）

依存方向は `src/game/`（WorldState / Game Logic / Wave）→ `src/presentation/`（Phaser）です。`phaser` を import するのは `src/main.ts` と `src/presentation/` の Scene に限り、`src/game/` からは `src/presentation/` を import しません。Phaser のアニメーション完了は状態の成立条件にしておらず、tween やタイマーも使っていません。

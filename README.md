# Island Grow Game

TypeScript + Phaser + Vite + Vitest のプロジェクトです。現在は Vertical Slice 01「🔥で小人が暖まる」（Turn 1）と、その後の 🌱「畑・雨よけの小屋化・生活の始まり」（Turn 2）が遊べます（仮アセット）。🪨 / 💧 の進行、2 人目の小人、24 順列、END 判定などは未実装です。

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

### Turn 2（🌱）のプレイ確認

Turn 1 が完了すると 🌱 だけが選べるようになります（Turn 1 の完了前、再生中、Turn 2 の完了後は選べません）。🌱 をタップすると入力がロックされ、約 11.0 秒（97 BPM の 13 拍 + 農作業の 3 秒）で次の Wave が一度だけ進みます。

1. `human-walks-to-plot`: 小人が火のそばから左中段の草地の畑予定地へ歩く（承認済み4方向歩行。雨よけの右脚と火の間のすき間を通って上へ、雨よけの屋根の右上の空き地を上へ進み、島の岩を避けて、畑の左下から着く）
2. `human-waters-plot`: 小人が畑に着いたら、`human_farm_water1` を**ちょうど 1.5 秒（論理時間）連続して**表示する（畑が小さくポップインする。`plantStage` は 0 のまま）
3. `human-harvests-plot`: `human_farm_harvest2` をちょうど 1.5 秒連続して表示する
4. `farm-expands`: `human_farm_harvest1` に落ち着き、単独の四株の畑 `farm-plot-four-plants.png` が 1 枚ずつ育つように増えて、リファレンスに近い大きさの畑になる（この Wave の完了時に `plantStage` が 1 になり（1 回だけ。2 は使いません）、拡張した畑は以後ずっと残る）
5. `shelter-levels-up`: 雨よけが膨らみながら薄れ、同じ接地点から小屋が現れる（淡い光と小さなきらめき。新規画像は生成していません。`shelterStage` が 2 になる）
6. `cooking-starts`: 既存の焚き火が膨らみながら薄れ、同じ接地点で調理の火（`cook_pot_steam1` ↔ `steam2`）へレベルアップする（鍋を隣に置くのではなく、焚き火の置き換え。完了時に `fireStage` が 1 → 2 になり、以後は調理の火だけが表示される）
7. `animal-eats`: 既存の動物 1 頭が、同じ接地点で餌を食べる姿（`animal_eat1` ↔ `eat2`）へレベルアップする（動物は 1 頭のまま。完了時に `animalStage` が 1 → 2 になる）

どのレベルアップ（小屋・調理の火・動物）も、論理クロックから導く短い「入れ替え」演出（旧い絵が少し膨らんで薄れ、新しい絵が同じ接地点から現れる。淡い光と小さなきらめき）で、Wave の完了条件はアニメーションの完了ではありません。完了後、🌱 が「✓ 選択済み」になり、畑の収穫アニメーション・調理の火の湯気・動物の食事が控えめに続きます。人口は 1 人のまま、動物も 1 頭のままで、柵・繁殖・池・水路・祠は出ません。2 人目の小人は別 Issue です。

上下左右の歩行確認用に、開発サーバーでのみ `/?humanWalkPreview` を開くと、小人が右→下→左→上へ歩き続けるレビュー用ループを表示します（🔥 を押すと `isCold` が false になった後の見た目も確認できます）。本番ビルドでは無効です。
5. 再生中に 🔥 や他のボタンを連打しても、進行が重複したり変わったりしないことを確認します。
6. 完了後、🔥 が「✓ 選択済み」になり再選択できないこと、火（2 枚の焚き火画像が約 220 ms ごとに切り替わる。拡大縮小・回転・透明度の揺れはない）・小人・動物の小さなアイドル動作が続き、箱庭が完全停止しないことを確認します。やり直す場合はページを再読み込みします。
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
| `fire-stage1-a.png` | `campfire_frame_b_1254.png`（供給 JPEG 2 枚目 1254x1254 の PNG 変換） | 外周につながる白背景を除去、石の輪が幅 256 になるよう縮小、下端中央で整列 | 256x263 |
| `fire-stage1-b.png` | `campfire_frame_a_512.png`（供給 JPEG 1 枚目 512x512 の PNG 変換） | 同上（炎だけが異なる） | 256x263 |

`cave_reference_approved_design.png` は島に洞窟が含まれるため使いません。

焚き火の 2 枚は供給された JPEG（`campfire_frame_a_512.jpg` / `campfire_frame_b_1254.jpg`、SHA-256 `a6425f31…` / `9905c2ad…`）を、元ファイルのまま `asset-source/initial-turn1/` に置いたものです。スクリプトは PNG を読むため、JPEG を可逆な PNG へ変換してから使います（macOS の例）。

```sh
sips -s format png asset-source/initial-turn1/campfire_frame_a_512.jpg --out asset-source/initial-turn1/campfire_frame_a_512.png
sips -s format png asset-source/initial-turn1/campfire_frame_b_1254.jpg --out asset-source/initial-turn1/campfire_frame_b_1254.png
```

白背景の除去は市松模様と同じ外周連結フラッドで、近白（彩度 ≤ 24、輝度 ≥ 232）の画素だけを対象にします（`WHITE_BACKGROUND_RULE`）。黒い輪郭の内側にある近白の炎の芯や石のハイライトは外周につながらないので残ります。縁は混色率の逆算と `peelGrayRim` で処理します。2 枚は同じ縮小率の規則（石の輪の幅 = 256）で拡縮し、`placeBottomCenter` で同じ 256x263 の透明キャンバスの下端中央に置くため、フレームを切り替えても石や接地点は動きません（接地点は両方 (128, 247)）。再生成の確認は `node scripts/deriveWorldAssets.mjs asset-source/initial-turn1 <別ディレクトリ>` を 2 回実行し、出力がバイト単位で一致することで行えます。

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

## Turn 2 asset derivation（🌱の世界素材）

### 供給 ZIP の 7 枚（無加工）

`turn2_assets_review_v2.zip`（SHA-256 `056d8edc78d40a1a8f73ca2b555f4fbf73dc611e13962a08c0d89877d8b90e6e`）の PNG を、再描画・再生成・修正なしでバイト単位のまま追加しています（テストが SHA-256 を照合します）。いずれも 512x512 の 8-bit RGBA で、ZIP の `README.md` / `animation.json` は `review_pending`（最終承認前の選定版）です。`review_pending`、動物画像内の文字（`animal_eat1.png` など）、既知のフリンジ・混入片・鍋の湯気以外の微細差分は、今回の使用について承認済みで修正していません。

| 配置先 | ファイル | texture key | SHA-256 |
| --- | --- | --- | --- |
| `public/assets/human/farm/` | `human_farm_harvest1.png` | `farm-harvest-1` | `1d45937f…` |
| 同上 | `human_farm_harvest2.png` | `farm-harvest-2` | `8a8c9516…` |
| 同上 | `human_farm_water1.png` | `farm-water-1` | `ded68b9d…` |
| `public/assets/world/turn2/` | `animal_eat1.png` | `animal-eat-1` | `ba16ff45…` |
| 同上 | `animal_eat2.png` | `animal-eat-2` | `4d1b12e2…` |
| 同上 | `cook_pot_steam1.png` | `cook-steam-1` | `d0c0a50e…` |
| 同上 | `cook_pot_steam2.png` | `cook-steam-2` | `7dfa98bf…` |

農作業の順序（`FARM_WORK_SEQUENCE`。論理クロックと Wave だけで決まり、1 回だけ実行）: `farm-water-1` を 1500 ms → `farm-harvest-2` を 1500 ms → `farm-harvest-1` に落ち着いて単独タイルを追加。各ポーズは交互再生せず 1 枚を連続表示します（旧仕様の 300 ms 交互再生は置き換えました）。到着後の立ち絵は既存の承認済み idle（texture key `idle`）で、水やり姿勢の小人の足元（`human_farm_water1.png` の (182, 404)）に立たせ、water1 に切り替わっても小人が動かないようにしています。ZIP の `animation.json` にある外部プレースホルダー名（`EXTERNAL_APPROVED_HUMAN_IDLE.png`）はランタイムで読み込みません。

ループするアニメーション（`TURN2_ANIMATIONS`。300 ms/フレーム、repeat）:
- `animal_eat`: `animal-eat-1` → `animal-eat-2`
- `cook_steam`: `cook-steam-1` → `cook-steam-2`

接地点（ground anchor）は各 PNG のピクセル座標で、接地する絵（8 近傍連結で最大のアルファ 128 以上の塊。動物画像の文字や水しぶきは除外）の可視範囲の水平中心と下端です。アニメーションの全フレームが同じ画面上の接地点・同じスケールを共有するので、フレーム切替で跳ねません（テストが PNG から再計算して照合します）。

| texture key | ground anchor (px) | baseScale | 配置（島画像のピクセル座標） |
| --- | --- | --- | --- |
| `farm-harvest-1` / `-2` | (289, 479) / (309, 479) | 0.22 | (334, 674) |
| `farm-water-1` | (280, 479) | 0.22 | (334, 674) |
| `farm-plot-four-plants` | (224, 294) | 0.08 | 複合画像の畑を囲む等角格子（下記） |
| `cook-steam-1` / `-2` | (254, 479) / (278, 479) | 0.22 | (432, 971)（焚き火の既存の接地点。焚き火を置き換える） |
| `animal-eat-1` / `-2` | (239, 450) / (311, 450) | 0.27 | (640, 690)（動物の既存の接地点） |
| `world-hut` | (256, 428) | 0.3 | (282, 960)（雨よけの既存の接地点） |

農作業 3 枚のスケールは 0.22 です。この PNG の小人は 512px キャンバス上で承認済みの idle / 歩行の小人よりも小さく描かれており（頭の幅が約 97 px に対し約 200〜220 px）、0.1 のままだと画面上で約半分の大きさになります。0.22 で頭が約 22 デザイン px となり、承認済みの小人（`HUMAN_SPRITE_SCALE` 0.1。変更していません）と同じ見かけになります（頭の幅を輪郭の弦から推定するテストで 10% 以内を確認）。畑そのものは複合画像の一部なので、リファレンスほど大きくは描けません。

### 単独の四株の畑（`public/assets/world/turn2/farm-plot-four-plants.png`）

承認済みの四株の畑 JPEG（SHA-256 `0e070b2341d1406e35cdfa2e07d4f3c9137be0a08ec5a3059ec2573af60cbd02`、1254x1254、RGB baseline、不透明な白背景）を `art-source/turn2/farm-plot-four-plants-source.jpg` に無加工で保持しています。ランタイムでは、小屋と同じ決定的な方法で、外周につながる近白の背景だけを透明化した 8-bit RGBA PNG（448x295）を使います。畑の絵は描き直し・再生成・色の変更をしていません。旧 `farm_plot_single.png`（一株の部品）は削除しました。

1. JPEG を可逆な PNG に変換します（macOS: `sips -s format png art-source/turn2/farm-plot-four-plants-source.jpg --out art-source/turn2/farm-plot-four-plants-source-decoded.png`）。この PNG（SHA-256 `466d01a472ebf998fe7e270bddc217fba376e6bbda2717294316587e5ab1f464`）もリポジトリに置き、テストで照合します。
2. `node scripts/deriveFarmPlotAsset.mjs art-source/turn2/farm-plot-four-plants-source-decoded.png public/assets/world/turn2/farm-plot-four-plants.png`
   - `removeExteriorBackground(image, WHITE_BACKGROUND_RULE)`（外周から 4 近傍で連結する近白画素だけを透明にする。不透明な画素の色は原本のまま。縁は部分アルファ）、可視範囲へトリミング、幅 448 まで面積平均で縮小。

出力はピクセル単位で決定的です（ランタイム PNG のデコード後ピクセルの SHA-256 `4dbf044d775f9d2b55e5217c63e3aeb73c5dc4180cd1afc24a353e5524d0dcc9` をテストで固定し、スクリプトで再導出して一致を確認します。穴・白いにじみがないことも検査します）。

植物の大きさは、人間の農作業フレームに描かれている植物と見かけが同じになるようにしています。株ごとの葉＋濃緑の輪郭の面積は、この絵で約 10,200 px²、`human_farm_harvest1/2` の畑の植物（4 株で約 5,800 px²）で約 1,450 px² です（0.22 で描画）。画面上で同じ大きさにするには 0.22 x sqrt(1450 / 10200) = 0.083 で、0.08 を使います（人間・複合画像の 0.22 は変更していません。テストで画面上の株の面積が 25% 以内で一致することを確認）。

並べ方: 複合画像の畑（4 株）を最初のマスとする 2 x 2 の等角格子で、残りの 3 マスに四株の畑を 1 枚ずつ置きます（`FARM_GRID`: 下右方向 2 x 上右方向 2。複合画像を除く**ちょうど 3 枚**。合計 16 株で、リファレンスの約 12 株に近い）。隣り合う畑の間隔は接する距離（`FARM_TILE_STEP_PX` = (226, 124) px）の 1.05 倍（`FARM_GRID.spacing`）で、土の縁がほぼ接し、4 つの畑が 1 つの農地に見えます（以前の 2 倍では 4 つの孤立した畑に見えました）。株の大きさ（0.08）は変えていません。位置は `layout.ts` の `farmPlotTiles`（複合画像の畑の中心から計算。追加順は複合画像に近い順）。

農地全体（小人・複合画像・3 枚）の基準点は島画像のピクセルで (334, 674)（デザイン座標で約 (270, 474)）です。以前の (225, 724)（約 (193, 508)）より約 34 デザイン px 上、約 77 デザイン px 内側（右）で、外側の左崖から離れ、リファレンスの位置に近づきました。島の下地に描き込まれた小さな岩（約 (200〜231, 443〜461)）は、隠さず・動かさず・覆わずに、そのすぐ右下に農地を置いて避けています（小人と農地は岩から数 px 以上離れ、歩行経路も岩に触れません）。農地は中央の将来用スペースの上側（y < 492）にあり、右端は砂の道の縁に近くなります。

### Visual Reference（Turn 2 完了状態の参照画像）

`art-source/turn2/visual-reference-turn2-end.jpg`（SHA-256 `eb27ba21e6b70a6df91830a9562f78ce956a9152af29c714d74a244b2223c455`、720x1280、RGB、baseline JPEG）を無加工で保持しています。ランタイムでは読み込まず、テストがハッシュと JPEG の寸法を照合します。この参照に基づく変更は、畑の位置（左中段）、農作業の小人の見かけの大きさ、調理（焚き火のレベルアップ）と動物（レベルアップ）の表現だけです。参照に写っている 2 人目の小人は Issue #12、洞窟内の物・水平線と雲・カメラの切り取り・UI の有無は範囲外です。

### 小屋（`public/assets/world/turn2/hut-stage2.png`）

承認済みの小屋 JPEG（SHA-256 `74bac0548d21c4d4cf35881cfe5419f8874ea9632082b390659b397031636397`、1280x1155、RGB、アルファなし）を `art-source/turn2/hut-approved-source.jpg` に正本として無加工で保持しています。ランタイムでは、外周につながる白背景だけを透明化した 8-bit RGBA PNG（512x435）を使います。再描画・再生成・意匠変更はしていません。

1. JPEG を可逆な PNG に変換します（macOS: `sips -s format png art-source/turn2/hut-approved-source.jpg --out art-source/turn2/hut-approved-source-decoded.png`）。この PNG（SHA-256 `c4e34db4bc1e399067536a72eca623ed000e4cc4a423fe3942e808db434ca2ae`）もリポジトリに置き、テストで照合します。
2. `node scripts/deriveHutAsset.mjs art-source/turn2/hut-approved-source-decoded.png public/assets/world/turn2/hut-stage2.png`
   - `removeExteriorBackground(image, WHITE_BACKGROUND_RULE)`: 画像の縁から 4 近傍で連結する近白画素だけを透明にします（Turn 1 の焚き火と同じ規則）。輪郭の内側は外周につながらないので残り、縁は混色率の逆算で部分アルファに戻します。完全に不透明な画素の色は原本のままです。
   - 可視範囲へトリミングし、幅 512 まで面積平均で縮小します（拡大はしません）。

出力は同じ入力から常に同じピクセルになります（テストが再導出して照合します。現環境での出力 SHA-256 は `f3ba4fba5dbccfc15850f902be66889a059409b1bdcf6c61eedc332815f4ee20` ですが、zlib の版が違えばバイト列は変わりうるため、ピクセル単位で照合しています）。抽出品質（縁・白抜け・矩形背景）は人間レビューの対象です。`review-artifacts/issue-11-turn2-plant-hut/hut-runtime-on-water-blue.png` は水色の上に置いた確認用です。

## ディレクトリ構成

- `src/main.ts`: Phaser の起動設定
- `src/game/`: Phaser に依存しない純粋な TypeScript の WorldState と Game Logic。
  - `worldState.ts`: `WorldState`（`plantStage`・`shelterStage`・`animalStage`、`fireStage` の 2 を含む）と初期状態、意味判定 `hasSproutPlot`（Turn 2 の芽の畑。拡張した畑を含む）/ `hasUpgradedHut` / `hasCookingFire` / `hasCaredForAnimal`
  - `waves.ts`: Wave の定義（Turn 1 の `FIRE_WARMING_WAVES`、Turn 2 の `PLANT_LIFE_WAVES`。順序と、各 Wave 完了時の WorldState 変更）
  - `timing.ts`: 再生時間と再生速度の唯一の境界。Wave の長さは再生速度 1x の論理ミリ秒で、将来の一括再生速度変更はここを通ります。
  - `sliceGame.ts`: 入力ガード（🌱 は Turn 1 完了後に一度だけ）、Wave 再生中の入力ロック、論理クロックによる Wave の順次再生、選択可能な要素 `selectableElements`
- `src/presentation/`: Phaser に依存するコード（Scene など）。画面比率・サイズ依存の値は `display.ts` と `layout.ts` に集約しています。
  - `IslandScene.ts`: 入力を `SliceGame` に渡し、`SliceGame.snapshot()` から毎フレーム描画するだけの Scene
  - `animation.ts`: スナップショットから小人・火・動物のidleの見た目を計算する純粋関数（Phaser 非依存）
  - `worldAssets.ts`: 島・雨よけ・動物・焚き火 2 フレームの PNG のメタデータ（キー、ファイル名、サイズ、接地点、スケール、配置）
  - `turn2Assets.ts`: Turn 2 の PNG（畑 3 フレーム・動物 2 フレーム・鍋 2 フレーム・小屋）のメタデータとアニメーション契約
  - `lifeAnimation.ts`: スナップショットから Turn 2 の畑・小屋／調理の火／動物のレベルアップの見た目を計算する純粋関数（Phaser 非依存。共通のレベルアップ演出 `levelUpBlend` は `animation.ts`）
- `scripts/`: ランタイム世界 PNG を元素材から再生成する Node スクリプト（`deriveWorldAssets.mjs`、小屋用の `deriveHutAsset.mjs`、畑用の `deriveFarmPlotAsset.mjs`）
- `art-source/turn2/`: 承認済み小屋 JPEG の正本とその可逆 PNG 変換、Turn 2 の Visual Reference

依存方向は `src/game/`（WorldState / Game Logic / Wave）→ `src/presentation/`（Phaser）です。`phaser` を import するのは `src/main.ts` と `src/presentation/` の Scene に限り、`src/game/` からは `src/presentation/` を import しません。Phaser のアニメーション完了は状態の成立条件にしておらず、tween やタイマーも使っていません。

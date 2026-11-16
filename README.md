# Island Grow Game

TypeScript + Phaser + Vite + Vitest のプロジェクトです。現在は Vertical Slice 01「🔥で小人が暖まる」（Turn 1）と、その後の 🌱「畑・雨よけの小屋化・生活の始まり」（Turn 2）が遊べます（仮アセット）。Turn 2 の開始時に小人が 2 人に分裂します（Issue #12。見た目・体感は 2026-10-12 に Cloudflare Pages のプレビューで Human Review 承認済みです）。🪨 / 💧 の進行、Turn 3 以降の人口増加、24 順列、END 判定などは未実装です。

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

Turn 1 が完了すると 🌱 だけが選べるようになります（Turn 1 の完了前、再生中、Turn 2 の完了後は選べません）。🌱 をタップすると入力がロックされ、約 11.6 秒（従来の約 11.0 秒 = 97 BPM の 13 拍 + 農作業の 3 秒 に、分裂の 0.6 秒を加えたもの）で次の Wave が一度だけ進みます。

1. `human-splits`: 🌱 が受理された瞬間に人口が**ちょうど 2 人**になります（`splitResident`。以後ずっと 2 人で、再選択や再評価で増えません）。2 人とも Turn 1 完了時の火の前の同じ位置に留まり、ぷるぷる→ポンッ（600 論理ミリ秒）で分裂するレベルアップを見せます。前半は小人 1 が横に震え（振幅 2.5 px、9 Hz）、小人 2 は非表示、後半に小人 2 がポンッと現れます（0.6 倍から拡大するポップ）。この間は小人 2 の `motion` は `idle`、`target` は `null` で、Wave の完了時にロジックが歩き出し（`target: 'plot'`、`motion: 'walking'`）にします。小人 1 は Turn 2 の間ずっと火の前で待ちます
2. `human-walks-to-plot`: 分裂後に小人 2 だけが（既存の Issue #11 の経路・素材のまま）火のそばから左中段の草地の畑予定地へ歩く（承認済み4方向歩行。雨よけの右脚と火の間のすき間を通って上へ、雨よけの屋根の右上の空き地を上へ進み、島の岩を避けて、畑の左下から着く）
3. `human-waters-plot`: 小人 2 が畑に着いたら、`human_farm_water1` を**ちょうど 1.5 秒（論理時間）連続して**表示する（畑が小さくポップインする。`plantStage` は 0 のまま）
4. `human-harvests-plot`: `human_farm_harvest2` をちょうど 1.5 秒連続して表示する
5. `farm-expands`: `human_farm_harvest1` に落ち着き、単独の四株の畑 `farm-plot-four-plants.png` が 1 枚ずつ育つように増えて、リファレンスに近い大きさの畑になる（この Wave の完了時に `plantStage` が 1 になり（1 回だけ。2 は使いません）、拡張した畑は以後ずっと残る）
6. `shelter-levels-up`: 雨よけが膨らみながら薄れ、同じ接地点から小屋が現れる（淡い光と小さなきらめき。新規画像は生成していません。`shelterStage` が 2 になる）
7. `cooking-starts`: 既存の焚き火が膨らみながら薄れ、同じ接地点で調理の火（`cook_pot_steam1` ↔ `steam2`）へレベルアップする（鍋を隣に置くのではなく、焚き火の置き換え。完了時に `fireStage` が 1 → 2 になり、以後は調理の火だけが表示される）
8. `animal-eats`: 既存の動物 1 頭が、同じ接地点で餌を食べる姿（`animal_eat1` ↔ `eat2`）へレベルアップする（動物は 1 頭のまま。完了時に `animalStage` が 1 → 2 になる）

どのレベルアップ（小屋・調理の火・動物）も、論理クロックから導く短い「入れ替え」演出（旧い絵が少し膨らんで薄れ、新しい絵が同じ接地点から現れる。淡い光と小さなきらめき）で、Wave の完了条件はアニメーションの完了ではありません。完了後、🌱 が「✓ 選択済み」になり、畑の収穫アニメーション・調理の火の湯気・動物の食事が控えめに続きます。完了時の人口は 2 人です。`WorldState.residents` に安定した ID を持つ 2 つの状態（`resident-1`: 火の前で待機、`resident-2`: 畑の位置）が残り、`humanStage` は 2 です（将来の Turn 3 がこの状態を引き継ぎます。Turn 3 の人口増加は未実装です）。画面上は、小人 1 が火の前で idle のまま、小人 2 は既存の農作業・複合画像（畑の位置）で表現されます。動物は 1 頭のままで、柵・繁殖・池・水路・祠は出ません。

分裂の長さ 600 ms、震えの振幅 2.5 px、9 Hz、ポップの拡大率 0.6 倍は、Notion に数値の定義がないため Human Review 対象とし、2026-10-12 に Cloudflare Pages の実機確認で承認されました（`SPLIT_WAVE_MS` は `src/game/timing.ts`、震え・ポップは `src/presentation/residents.ts`）。これらの値を変更する場合は、再度 Human Review が必要です。

上下左右の歩行確認用に、開発サーバーでのみ `/?humanWalkPreview` を開くと、小人が右→下→左→上へ歩き続けるレビュー用ループを表示します（🔥 を押すと `isCold` が false になった後の見た目も確認できます）。本番ビルドでは無効です。
5. 再生中に 🔥 や他のボタンを連打しても、進行が重複したり変わったりしないことを確認します。
6. 完了後、🔥 が「✓ 選択済み」になり再選択できないこと、火（2 枚の焚き火画像が約 220 ms ごとに切り替わる。拡大縮小・回転・透明度の揺れはない）・小人・動物の小さなアイドル動作が続き、箱庭が完全停止しないことを確認します。やり直す場合はページを再読み込みします。
7. ブラウザのコンソールに未処理エラーが出ていないことを確認します（開発サーバーでは `favicon.ico` の 404 のみ出ます）。
8. ウィンドウの縦横比を変えても、9:16 の画面が中央にフィットして表示されることを確認します。

間・歩行の可愛さ・演出の長さ・画面余白などの体感は自動テストでは判定できません。人間によるプレイレビューで確認してください。

### Turn 3（🪨）・Turn 4（💧）・Epilogue・END・Retry のプレイ確認（TRUE 代表ルート）

Turn 2 が完了すると 🪨、続いて 💧 だけが選べます（レビュー用ビルドで遊べるのは 🔥 → 🌱 → 🪨 → 💧 の 1 ルートだけです。順序違いの選択は `prerequisite-not-met` で拒否されます）。全 24 順列の**ルール評価**は `src/game/rules/engine.test.ts` が検証します（画面で遊べるのは TRUE ルートだけです）。

**権威状態と演出の分離。** 要素を受理した瞬間に Rule Engine（`src/game/rules/`）がそのターンを同期的に確定します（Direct Effect → Time Progression / Interaction を不動点まで。同じ Rule ID は 1 ターン 1 回。最終ターンだけ Epilogue Growth を 1 回、続けて SECRET → TRUE → 通常 END の順に判定）。確定した `RuleState`（`SliceSnapshot.resolved`）は Wave の再生中も、アニメーションの完了にも、再生速度にも影響されません。Wave は確定済みの結果を画面（`SliceSnapshot.world`、見える世界）へ一つずつ見せるだけで、`RuleState` を読み書きできません。各 Wave（Turn 3 以降）は、提示する Rule Event の ID（`Wave.event`）を持ち、Rule Engine がそのイベントを出したときだけ、確定した順序で再生されます。

| ターン | Stage（火/植物/石/水/人/住居/動物/洞窟） | 主な見え方 |
| --- | --- | --- |
| 初期 | `0/0/0/0/1/1/1/1` | |
| Turn 1 🔥 | `2/0/0/0/1/1/1/1` | 既存どおり |
| Turn 2 🌱 | `3/2/0/0/2/2/2/1` | 既存どおり |
| Turn 3 🪨 | `5/4/4/0/3/3/3/3` | 成熟した畑、石の作業台、3 人目、2 棟目の家、実用的な洞窟、柵・飼料・**空の**水桶・乾いた川床、家畜の親子。水・流れなし |
| Turn 4 💧 | `5/5/4/3/4/4/3/4` | 高台の泉と池、同じ川床が南西の海へ流れる、運ばれた**水入り**の桶、4 軒の家と 6 人、祠。動物の囲いへ直接つながる水路なし |
| Epilogue（TRUE） | `5/5/4/3/4/4/4/4` | 成長 1 回 → TRUE 判定 → 家畜の親子が守り神の親子へ変身 → END |

TRUE の条件は、厳密な順序 🔥→🌱→🪨→💧、SECRET 不成立、動物 Stage 3、他の 7 カテゴリが最大、動物が絶滅していないことです。動物が Stage 4 になるのは TRUE が成立した**後**だけです。END（`TRUE END`）では選択パネルが Retry ボタンに置き換わり、押すと権威状態・見える世界・論理クロック・入力履歴・Scene のオブジェクトがすべて初期状態に戻ります（Scene を再起動します。再生速度の設定は保たれます）。

**SECRET の因果連鎖（Notion §14.7〜14.9）。** 順序そのものではなく状態で判定します。洞窟の入口は最初から開いていて、岩が覆うのは脇の細い裂け目（`crackState = covered`）です。寒いうえに植物がまだ無い状態で 🪨 を選ぶと、探索で裂け目が `exposed` になります（植物があれば洞窟は貯蔵などに使われ、岩は動きません。🔥 が先なら寒くないので動きません）。植物を選んだ時点の裂け目の状態から、根の向き（`rootDirection`）が一度だけ `lateral` か `intoRuins` に決まり、以後は変わりません。裂け目が露出したまま、植物が選ばれたターンのうちに作業場が立つと `blockedByWorkshop` になり、根は `lateral` になります（🪨→🔥→🌱 の経路）。遺跡の露出（`ruinsExposed`）には `intoRuins` の根が育つこと、古代装置（`ancientDeviceActivated`）には露出した遺跡と灯った火が要ります（🪨→🌱→🔥。💧 が間に入っても連鎖は崩れません）。🔥→🌱→🪨 の TRUE の前半では岩は動かず、洞窟は貯蔵・共同体・祠に使われます。END 軸の分類だけが相対順序を使い、Rule は使いません。

**動物の絶滅は未実装です。** Notion が絶滅の閾値を「未確定」としているため、`animalExtinct` を立てる Rule はありません（Flag と、それを読む TRUE 判定のガードだけがあります）。テストも絶滅への遷移を検証しているとは主張せず、「どの順列でも立たない」現状を記録するだけです。確定したら Rule と遷移テストを一緒に追加します。

レビュー用の補助（開発サーバーでのみ有効。本番ビルドでは無効）: `/?playbackSpeed=4` で全体を 4 倍速（将来のグローバル再生速度と同じ論理時間の拡縮）で再生、`/?paused` でフレームループによる時間の進行を止め、`window.__islandSlice.advance(ms)` / `.selectElement('rock')` で論理時間を厳密に進めて確認できます。

**素材はすべて「候補（provisional）」で、人間の視覚承認を受けていません。** 供給パッケージ `true-route-materials-v3` から、実際に使う 16 枚だけを byte 単位でそのまま取り込みました（のち 2 枚は下記のとおり差し替え）（`public/assets/world/turn3/`・`turn4/`。SHA-256 は `src/presentation/trueRouteAssets.test.ts` で固定し、供給元のマニフェストは `art-source/true-route/TRUE_ASSET_MANIFEST.md`）。その後の TRUE ルート修正（Issue #26、供給パッケージ `true-route-review-fix-v2`）で次を**候補のまま**加えました: 植物の成長 5 段階（`public/assets/world/plants/`）と祭壇化した洞窟の外観（`public/assets/world/turn4/cave-shrine-exterior.png`）は、供給 PNG を byte 単位でそのまま取り込み、SHA-256 を `plantGrowth.test.ts` / `trueRouteAssets.test.ts` で固定しています。旧 `mature-farm.png` と `cave-shrine-candidate.png` は実行時から外し、`art-source/true-route/superseded/` に移しました（二重表示・古い荷物だけの表示を防ぐため）。人の作業フレーム（gather / build / carry / dig / water-carry の 10 枚。`art-source/true-route/human-action-candidates/` の原本を `public/assets/human/actions/` に**無加工で複製**）は、人と道具・運ぶ物が 1 枚の PNG に焼き込まれた「合成作業スプライト」として、実行時に使います（`src/presentation/humanActions.ts`）。待機ポーズに道具だけを動かす表現ではなく、腕・体の姿勢が変わる既存フレームをそのまま使うためです。影響範囲: 3 人目以降と、Turn 3 以降の 1・2 人目の作業・運搬・水運びだけで、承認済みの歩行と待機・Turn 1/2 の演出は変えません。建物・世界の状態・エフェクト（砂ぼこり・破片・土・水しぶき）は別レコードのままで、エフェクトだけ Graphics で重ねます（`crew.ts` のレイヤー記録と `crewDraw.ts`）。1 枚ごとに足元の接地点（両足の中点と最下段）と頭の大きさを測って登録し、コマが切り替わっても足元と大きさが跳ねないようにしています。石組みの炉の完成形は、リポジトリにも供給パッケージにも素材が無いため、**仮のコード描画**（`furnaceDraw.ts`）です。これらはいずれも最終アートではありません。プロトタイプの `trueRoute.ts` と `trueRoute.test.ts` も取り込んでいません（参考資料であり、実行時の権威にはしません）。

- 住居: 承認済みの小屋 + 候補の `hut-second.png` の 3 インスタンス（3・4 軒目は 0.8 倍）。
- 守り神: `guardian-parent` / `guardian-child` は家畜の親子と同じスケール・同じ接地点で入れ替わります（淡い光の縁が見えるため、実機での縁の色を要確認）。
- 川と泉: 乾いた川床と流れる川床は同一の位置・形で重なり（テストで中心線の一致を確認）、泉の出口は川の源流へ導出した座標で接続します。池画像は左下の端まで描かれているため、トリミングせずスケールで収めています。
- 歩行・作業: 作業は 3 人目の小人が行います（石を集める → 運ぶ → 家を建てる → 柵を作る → 川床を掘る → 泉から水を運ぶ）。before（立つ）→ work（2 フレームのループ、論理クロック）→ after（立つ）の順で、移動は承認済みの歩行速度の約 0.5〜0.9 倍です。

## Cloudflare Pages でのスマホ Human Review

主な Human Review 環境はスマートフォンです。標準手順、Cloudflare Git連携、実機チェックリスト、証跡とフィードバックの書式は [`HUMAN_REVIEW.md`](HUMAN_REVIEW.md) を参照してください。PC のブラウザや自動テストの結果は、実機での視覚・動作・ゲームフィール判断の代用にはなりません。

標準フローは、Codexの独立diffレビューと全検証を終えたcommitをpushし、PRのCloudflare Pages checkが成功してから、deployment固有URLと安定したBranch Preview URLを記録して実機確認する形です。Direct Upload / WranglerはGit連携が利用できない場合だけのフォールバックです。

公式ドキュメント:
- Direct Upload: <https://developers.cloudflare.com/pages/get-started/direct-upload/>
- Preview Deployments: <https://developers.cloudflare.com/pages/configuration/preview-deployments/>

### Direct Upload fallback: 事前確認（クリーンな Node 22 環境）

```sh
nvm use
npm ci
npm test
npm run typecheck
npm run build
```

すべて成功したことを確認してから、生成された `dist/` をアップロードします。`dist/` に秘密情報やローカル設定（`.env` など）を置いてはいけません。

### Direct Upload fallback: ダッシュボードからのアップロード

1. Cloudflare ダッシュボードで Workers & Pages → Create application → Get started → Drag and drop your files を選びます。
2. プロジェクト名を決め（任意の名前。ここでは `<PROJECT_NAME>` と書きます）、`dist/` フォルダ（または zip）をアップロードして Deploy します。
3. 既存の Direct Upload プロジェクトに追加する場合は、Create a new deployment を選び、環境に **Preview** を選んで、ブランチ名に `ai-issue-12-human-split` などのラベルを指定します。

### Wrangler fallback（`package.json` には追加しません）

```sh
npx wrangler login
npx wrangler pages deploy dist --project-name=<PROJECT_NAME> --branch=ai-issue-12-human-split
```

本番ブランチ以外の名前を `--branch` に指定すると、そのブランチ用のプレビューのエイリアスが作成／更新されるだけで、本番（production）は置き換わりません。`<PROJECT_NAME>` は自分の Pages プロジェクト名に読み替えます。API トークンやアカウント ID は README・Issue・PR・コミットに書かないでください。

### 注意

- 最初に Direct Upload で作ったプロジェクトは、後から Git 連携に切り替えられません。ブランチ／PR ごとの自動プレビューを長期的に使いたい場合は、Git 連携の別プロジェクトを新しく作ります。
- プレビュー URL は、Cloudflare Access を有効にしない限り、既定で公開です。URL の取り扱いに注意してください。
- レビューの証跡として、プレビュー URL と、確認したコミット／worktree の識別情報を Issue / PR のレビュー記録に残します。

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

### 単独の四株の畑（`public/assets/world/turn2/farm-plot-four-plants.png`、履歴素材）

承認済みの四株の畑 JPEG（SHA-256 `0e070b2341d1406e35cdfa2e07d4f3c9137be0a08ec5a3059ec2573af60cbd02`、1254x1254、RGB baseline、不透明な白背景）を `art-source/turn2/farm-plot-four-plants-source.jpg` に無加工で保持しています。小屋と同じ決定的な方法で、外周につながる近白の背景だけを透明化した 8-bit RGBA PNG（448x295）も保持します。Issue #26 以降、永続植物表示は供給された 5 段階 PNG に置き換わったため、この四株 PNG と下記の旧グリッドはランタイムでは描画しません。Turn 2 の農作業中だけは既存の人＋畑の複合画像を使い、`farm-expands` 中に独立した小人と新植物へ引き継ぎます。

1. JPEG を可逆な PNG に変換します（macOS: `sips -s format png art-source/turn2/farm-plot-four-plants-source.jpg --out art-source/turn2/farm-plot-four-plants-source-decoded.png`）。この PNG（SHA-256 `466d01a472ebf998fe7e270bddc217fba376e6bbda2717294316587e5ab1f464`）もリポジトリに置き、テストで照合します。
2. `node scripts/deriveFarmPlotAsset.mjs art-source/turn2/farm-plot-four-plants-source-decoded.png public/assets/world/turn2/farm-plot-four-plants.png`
   - `removeExteriorBackground(image, WHITE_BACKGROUND_RULE)`（外周から 4 近傍で連結する近白画素だけを透明にする。不透明な画素の色は原本のまま。縁は部分アルファ）、可視範囲へトリミング、幅 448 まで面積平均で縮小。

出力はピクセル単位で決定的です（ランタイム PNG のデコード後ピクセルの SHA-256 `4dbf044d775f9d2b55e5217c63e3aeb73c5dc4180cd1afc24a353e5524d0dcc9` をテストで固定し、スクリプトで再導出して一致を確認します。穴・白いにじみがないことも検査します）。

旧配置では、植物の大きさを人間の農作業フレームに描かれている植物へ合わせ、単独 PNG を 0.08 倍で描画していました。この値は履歴・再導出用メタデータに残りますが、Issue #26 の 5 段階植物の表示スケールには使いません。

旧配置は、複合画像の畑を最初のマスとする 2 x 2 の等角格子でした。現在は廃止され、植物は `LAYOUT.true.plantPlot` の単一接地点で Stage 1→5 を切り替えます。第二の植物区画や旧タイルを同時表示しません。

Turn 2 の農作業複合画像の基準点は島画像のピクセルで (334, 674)（デザイン座標で約 (270, 474)）のままです。永続植物は、その旧畑と重ならない近接した単一接地点 `LAYOUT.true.plantPlot` へ切り替わり、独立した resident-2 が作業を継続します。

### Visual Reference（Turn 2 完了状態の参照画像）

`art-source/turn2/visual-reference-turn2-end.jpg`（SHA-256 `eb27ba21e6b70a6df91830a9562f78ce956a9152af29c714d74a244b2223c455`、720x1280、RGB、baseline JPEG）を無加工で保持しています。ランタイムでは読み込まず、テストがハッシュと JPEG の寸法を照合します。この参照に基づく変更は、畑の位置（左中段）、農作業の小人の見かけの大きさ、調理（焚き火のレベルアップ）と動物（レベルアップ）の表現だけです。参照に写っている 2 人目の小人は Issue #12 で別途実装しました（分裂の見た目を参照画像と照合してはいません）。洞窟内の物・水平線と雲・カメラの切り取り・UI の有無は範囲外です。

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
  - `waves.ts`: Wave の定義（Turn 1 の `FIRE_WARMING_WAVES`、Turn 2 の `PLANT_LIFE_WAVES`、Turn 3 の `ROCK_WAVES`、Turn 4 + Epilogue の `WATER_WAVES`。順序と、各 Wave 完了時の「見える世界」の更新。ゲームの結果は変えません）
  - `rules/`: 権威状態と因果ルール。`state.ts`（8 カテゴリの Stage・上限・Flag・`RuleState`・不変条件の検証。SECRET の連鎖は多値の `crackState`（`covered` / `exposed` / `blockedByWorkshop`）と不可逆の `rootDirection`（`undecided` / `lateral` / `intoRuins`）、Flag の `ruinsExposed` / `ancientDeviceActivated`）、`catalog.ts`（共通の Rule 一覧。Direct Effect と Time Progression / Interaction。順列ごとの分岐や END 名、選択順を読む Rule はありません）、`engine.ts`（`runTurn`、Epilogue Growth、SECRET → TRUE → 通常 END の判定、END 軸の分類、24 順列のテスト用 `playRoute`）
  - `timing.ts`: 再生時間と再生速度の唯一の境界。Wave の長さは再生速度 1x の論理ミリ秒で、将来の一括再生速度変更はここを通ります。
  - `sliceGame.ts`: 入力ガード（🔥 → 🌱 → 🪨 → 💧 の順に一度ずつ）、選択時の `runTurn` による同期確定、Wave 再生中の入力ロック、論理クロックによる Wave の順次再生、選択可能な要素 `selectableElements`、END 後の `retry()`
- `src/presentation/`: Phaser に依存するコード（Scene など）。画面比率・サイズ依存の値は `display.ts` と `layout.ts` に集約しています。
  - `IslandScene.ts`: 入力を `SliceGame` に渡し、`SliceGame.snapshot()` から毎フレーム描画するだけの Scene
  - `animation.ts`: スナップショットから小人・火・動物のidleの見た目を計算する純粋関数（Phaser 非依存）
  - `worldAssets.ts`: 島・雨よけ・動物・焚き火 2 フレームの PNG のメタデータ（キー、ファイル名、サイズ、接地点、スケール、配置）
  - `turn2Assets.ts`: Turn 2 の PNG（畑 3 フレーム・動物 2 フレーム・鍋 2 フレーム・小屋）のメタデータとアニメーション契約
  - `residents.ts`: `WorldState.residents` と論理クロックから、各小人（Turn 2 の分裂演出を含む）の見た目を計算する純粋関数（Phaser 非依存）
  - `trueRouteAssets.ts`: Turn 3 / Turn 4 / Epilogue の候補 PNG（小道具 16 点と、2 フレームずつの作業 5 種）のメタデータ（すべて provisional）
  - `settlement.ts`: スナップショットから Turn 3 以降の小道具（川床・泉・柵・家・祠・守り神など）と光の見た目を計算する純粋関数（Phaser 非依存）。作業場は 1 人目が歩いて行き、既存の build 2 フレームで叩き終えると完成し、1 人目は火のそばへ戻ります。島の中央線より右の家（2 棟目と追加の 2 軒）は建物そのものを左右反転して描き（承認済みの左側の小屋は反転しません）、作業者は集落側から壁を叩きます。守り神・家畜まわりの祝福の光は、動物の背後（柵の上・動物の下）に描きます
  - `crew.ts`: 3〜6 人目と、Turn 3 以降の 1・2 人目の自律的な作業（Wave ごとのルーティン、洞窟への入退場。作業は「作るもの」が完成した時点で終わり、完成した対象や植物の成長のために作業をやり直しません。6 人が揃ったあとは各自の持ち場に静止して立ちます）を、移動距離と承認済み歩行速度から論理時間で計算する純粋関数（Phaser 非依存）。`humanActions.ts`: 既存の作業フレーム（合成作業スプライト）の接地点・頭の大きさ・接触点。`plantGrowth.ts`: 植物 5 段階の表示。`furnaceDraw.ts`: 炉の仮のコード描画。`crewDraw.ts`: エフェクトの仮のコード描画
  - `lifeAnimation.ts`: スナップショットから Turn 2 の畑・小屋／調理の火／動物のレベルアップの見た目を計算する純粋関数（Phaser 非依存。共通のレベルアップ演出 `levelUpBlend` は `animation.ts`）
- `scripts/`: ランタイム世界 PNG を元素材から再生成する Node スクリプト（`deriveWorldAssets.mjs`、小屋用の `deriveHutAsset.mjs`、畑用の `deriveFarmPlotAsset.mjs`）
- `art-source/true-route/`: 供給された TRUE ルート候補素材のマニフェスト（出典の記録。素材は未承認）
- `art-source/turn2/`: 承認済み小屋 JPEG の正本とその可逆 PNG 変換、Turn 2 の Visual Reference

依存方向は `src/game/`（WorldState / Game Logic / Wave）→ `src/presentation/`（Phaser）です。`phaser` を import するのは `src/main.ts` と `src/presentation/` の Scene に限り、`src/game/` からは `src/presentation/` を import しません。Phaser のアニメーション完了は状態の成立条件にしておらず、tween やタイマーも使っていません。

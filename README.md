# Nect-Cloud

個人用の静的レイアウトエディタ。HTML / CSS / JavaScript / SVG、ビルド不要。

- 単一アートボード（mm）、独立した4辺マージン、カラム・ガター
- 文字・矩形の追加、選択、マウス／タッチ移動、数値編集、前後関係、複製・削除
- 水平／垂直ガイドの追加、位置編集、削除、ドラッグ編集、スナップ
- 同一端末の自動保存、JSON読込／書出、簡単なUndo／Redo
- PCの右パネル、スマートフォンの折りたたみパネル

[Working Brief](https://app.notion.com/p/3f8fd279a6f3816abf99e8081e0429bc)

## 開く

GitHub Pages URL: https://46slv.github.io/Nect-Cloud/

初回はリポジトリの **Settings → Pages → Source → GitHub Actions** を選択する。
`Verify and publish Nect Cloud` をActionsから実行。以後はmainのアプリ変更で検証・公開する。
公開対象はアプリ4ファイルだけ。JSONと個人素材はGitHubに保存しない。

ローカルでは `python3 -m http.server 8000` で起動し http://localhost:8000 を開く。

## 操作

文字／矩形を追加してドラッグ。設定パネルから位置・寸法・色・文字を編集。
文字サイズはmm（1 mm ≈ 2.835 pt）、幅と高さは選択枠。改行は表示するが自動折り返しはしない。
ガイドを動かすときは「ガイドをドラッグ編集」を有効にする。
Altを押しながらドラッグするとスナップを一時解除。
Undo: Ctrl/⌘ Z、Redo: Ctrl/⌘ Shift Z。Deleteで削除。文字入力中は入力欄の標準操作が優先。
JSON保存にはガイド設定も含める。ガイドは編集用オーバーレイで作品オブジェクトに含まない。

## 保存と制限

自動保存はこのブラウザ・このURLのlocalStorage。端末間同期は未提供。
ブラウザデータ削除・プライベート閲覧の終了等で消えるので、重要な編集はJSONで残す。
不正／未対応のJSONを読み込んでも現在の編集は維持する。保存済みデータを読めない起動では自動上書きを止める。
Google Drive、複数ページ、画像、印刷品質のPDF/SVG出力は次の段階。

## 検証

```sh
node --test tests/model.test.cjs
npm install --no-save --package-lock=false playwright@1.62.1
npx playwright install chromium
node tests/browser.cjs
```

ブラウザ検証はPCマウス／390pxタッチで日本語、文字・矩形移動、ガイド編集、リロード保存、JSON往復、不正読み込み保護を確認。
`NECT_URL=https://46slv.github.io/Nect-Cloud/ node tests/browser.cjs` で公開版を検証可能。

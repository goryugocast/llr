# Obsidian Sidebar CSS 実装ガイド & ベストプラクティス

Obsidian のサイドバー（`tree-item` 周り）のスタイルをカスタマイズする際に、コアの `app.css` や他プラグインと競合しないための知見をまとめます。

## 1. 遭遇した主な干渉問題と解決策

### ❌ アイコンの垂直ズレ (`position: absolute`)
- **問題**: `.tree-item-icon` に `position: absolute` が適用されており、`flex` による中央揃えが効かない。
- **解決**: `.project-tc-collapse-icon` に対して `position: static !important` を適用し、通常の flex フローに戻す。

### ❌ 謎の左余白 (`padding-left: 10px`)
- **問題**: `span.project-tc-time` などの要素に、コアスタイルまたは他プラグインから勝手に `padding` が注入される。
- **解決**: 低レイヤーの要素に対して `padding: 0 !important` を明示し、詳細度（Specificity）で打ち勝つ。

### ❌ 垂直方向の過剰な余白 (`::before` 疑似要素)
- **問題**: `.tree-item-self` に `::before` が存在し、それがブロック要素として高さを取ってしまうことがある。
- **解決**: `::before`, `::after` を `display: none !important` で明示的に消去、または `position: absolute` でフローから外す。

### ❌ 強制的な塗りつぶし (Checkbox)
- **問題**: `--checkbox-marker` や背景画像が強制的に適用され、チェックボックスが「紫の塗りつぶし」に見えてしまう。
- **解決**: `background-color: transparent !important`, `background-image: none !important`, `mask-image: none !important` をセットで適用し、背景を完全にクリアする。

## 2. 開発の鉄則

1. **実機デバッグを優先する**:
   - ブラウザ上のプロトタイプ (`html`) はあくまで設計用。
   - Obsidianの実機では `Cmd + Option + I` で開発ツールを開き、[Styles] と [Computed] の両方を確認すること。
2. **詳細度を「親」から固める**:
   - `.project-tc-summary-view .tree-item-self` のように、独自のビュークラスを起点にセレクタを構成する。
3. **OS標準・コア変数の尊重**:
   - `var(--text-normal)` などを使い、テーマ切り替えに耐えうる設計にする。
4. **!important の適切な使用**:
   - コアの `app.css` は非常に詳細度が高いため、レイアウトの根幹に関わる部分（padding, display, height等）には `!important` を厭わない。

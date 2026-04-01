const fs = require('fs');
const path = require('path');

const ROUTINE_DIR = "/Users/goryugo/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian_local/routine";
const ROUTINE_CASE_DIR = "/Users/goryugo/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian_local/TC";
const DAILY_NOTE = "/Users/goryugo/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian_local/notes/daily/2026-02-22.md";

if (!fs.existsSync(ROUTINE_DIR)) fs.mkdirSync(ROUTINE_DIR, { recursive: true });
if (!fs.existsSync(ROUTINE_CASE_DIR)) fs.mkdirSync(ROUTINE_CASE_DIR, { recursive: true });

const files = {
    [path.join(ROUTINE_CASE_DIR, "CaseTest.md")]: "---\nschedule: every day\nnext_due: 2026-02-22\n---\n# 大文字小文字テスト",
    [path.join(ROUTINE_DIR, "Test & Space.md")]: "---\nschedule: every day\nnext_due: 2026-02-22\n---\n# スペース・特殊文字テスト",
    [path.join(ROUTINE_DIR, "broken_yaml_start.md")]: "---\nschedule: every day\n# 壊れたYAMLテスト (自動修復対象)",
    [path.join(ROUTINE_DIR, "dup_test_a.md")]: "---\nschedule: every day\nnext_due: 2026-02-22\n---\n# 重複テストA",
    [path.join(ROUTINE_DIR, "empty_file_test.md")]: "",
    [path.join(ROUTINE_DIR, "invalid_rule_real.md")]: "---\nschedule: invalid_dummy_rule\nnext_due: 2026-02-22\n---\n# 不正な規則テスト",
    [path.join(ROUTINE_DIR, "leading_space_yaml.md")]: "  ---\nschedule: every day\n---\n# 先頭空白YAMLテスト (自動修復対象)",
    [path.join(ROUTINE_DIR, "metadata_preserve.md")]: "---\nschedule: every day\nnext_due: 2026-02-22\nestimate: 45\nsection: 15\n---\n# メタデータ保持テスト",
    [path.join(ROUTINE_DIR, "missing_rule_real.md")]: "---\nnext_due: 2026-02-22\n---\n# 規則不在テスト",
    [path.join(ROUTINE_DIR, "normal_but_check.md")]: "---\nschedule: every day\nnext_due: 2026-02-22\n---\n# 正常系",
    [path.join(ROUTINE_DIR, "too_many_dashes.md")]: "----------\nschedule: every day\n# ハイフン過多テスト"
};

for (const [filePath, content] of Object.entries(files)) {
    fs.writeFileSync(filePath, content);
    console.log(`Created/Reset: ${filePath}`);
}

const dailyLinkSection = `

# Routine Engine Test Tasks (Regenerated)
- [ ] [[CaseTest]] (大文字小文字テスト)
- [ ] [[Test & Space]] (スペース・特殊文字テスト)
- [ ] [[broken_yaml_start]] (YAML未完了)
- [ ] [[dup_test_a]] [[dup_test_a]] (重複リンクテスト)
- [ ] [[empty_file_test]] (空ファイル)
- [ ] [[invalid_rule_real]] (不正な規則)
- [ ] [[leading_space_yaml]] (先頭空白YAML)
- [ ] [[metadata_preserve]] (既存データ保持)
- [ ] [[missing_rule_real]] (規則不在)
- [ ] [[normal_but_check]] (正常系)
- [ ] [[too_many_dashes]] (ハイフン過多)
`;

if (fs.existsSync(DAILY_NOTE)) {
    fs.appendFileSync(DAILY_NOTE, dailyLinkSection);
    console.log(`Updated Daily Note: ${DAILY_NOTE}`);
} else {
    console.log(`Daily Note NOT found: ${DAILY_NOTE}`);
}

/**
 * UI 文言の辞書と言語解決。
 *
 * 文言を足すときは en / ja の両方に同じキーで追加する（TranslationKey は en 側から生成される）。
 * 実際の t() は LlrPlugin 側にあり、ここは辞書と言語判定の純ロジックだけを持つ。
 */

export type UILanguage = 'auto' | 'ja' | 'en';
export type ResolvedLanguage = 'ja' | 'en';

export const TRANSLATIONS = {
    en: {
        'ribbon.openSummary': 'Open LLR summary',
        'ribbon.adjustTime1m': 'Adjust time (1m)',
        'command.openSummaryView': 'Open summary view',
        'command.toggleTask': 'Toggle task',
        'command.adjustTime1m': 'Adjust time (1m)',
        'command.startTask': 'Start task',
        'command.stopTask': 'Complete task',
        'command.startTaskFromPrev': 'Start task at previous time',
        'command.duplicateTask': 'Duplicate task',
        'command.skipTaskLogOnly': 'Skip task',
        'command.rescheduleRoutine': 'Reschedule routine',
        'command.insertRoutine': 'Insert routine',
        'command.replenishSrs': 'Replenish SRS batch',
        'command.startAndOpenNote': 'Start and open note',
        'settings.language.name': 'UI language',
        'settings.language.desc': 'Choose language for settings and command labels.',
        'settings.language.option.auto': 'Auto (follow system locale)',
        'settings.language.option.ja': 'Japanese',
        'settings.language.option.en': 'English',
        'settings.language.notice': 'LLR: Language updated. Reload plugin to refresh command names.',
        'settings.debugMode.name': 'Debug mode',
        'settings.debugMode.desc': 'Show command/internal delay timestamps in Notice and log them to llrlog/debug.jsonl. Intended for debugging and troubleshooting.',
        'settings.estimateWarning.name': 'Estimate warning',
        'settings.estimateWarning.desc': 'Show schedule warning cues based on estimated remaining time.',
        'settings.checkboxOverride.name': 'Editor checkbox override',
        'settings.checkboxOverride.desc': 'Use LLR short-press/long-press behavior for checkboxes in the editor. When off, checkbox clicks use Obsidian default behavior while commands and hotkeys stay available.',
        'settings.startAndOpen.name': 'Start and open note',
        'settings.startAndOpen.desc': 'When enabled, starting a task (unchecked to running) also opens the linked note on that line. In the SRS batch the cursor moves into the opened note; elsewhere it stays on the daily note. A note frontmatter open_focus true/false overrides the cursor behavior. Off by default.',
        'settings.routineFolder.name': 'Routine folder',
        'settings.routineFolder.desc': 'Folder for repeat-task routine notes. You can pick from suggestions. Only direct child .md files are targeted.',
        'settings.routineSections.heading': 'Routine sections',
        'settings.routineSections.desc': 'Configure heading boundaries for Insert Routine / template auto-insert. A task goes into the latest section whose HHmm boundary is <= task time. Tasks without section stay at the top (no heading).',
        'settings.routineSections.empty': 'No section definitions. All routines are inserted without headings.',
        'settings.routineSections.itemName': 'Section {index}',
        'settings.routineSections.itemDesc': 'Boundary time (HHmm) and heading label',
        'settings.routineSections.newName': 'New section',
        'settings.routineSections.newDesc': 'Enter HHmm and heading label. When both are set, it is committed and sorted by time.',
        'settings.routineSections.deleteTooltip': 'Delete section',
        'settings.routineSections.addTooltip': 'Add section (when both fields are filled)',
        'settings.routineSections.labelPlaceholder': 'Morning',
        'settings.routineSections.timePlaceholder': '0700',
        'settings.srsGrowth.name': 'SRS growth (experimental)',
        'settings.srsGrowth.desc': 'When enabled, completing a note with repeat > 0 outside the routine folder grows the repeat interval by 2-3x. The note can live anywhere in the vault.',
        'settings.srsMaxDaily.name': 'SRS daily limit',
        'settings.srsMaxDaily.desc': 'Maximum number of SRS notes shown per day in daily note insertion. Due notes beyond this limit carry over to the next day. 0 = no limit.',
        'settings.advanced.heading': 'Advanced / compatibility',
        'settings.advanced.desc': 'Settings for exceptional cases. Most users can leave these as-is.',
        'settings.dailyNoteFolder.name': 'Daily note folder (fallback)',
        'settings.dailyNoteFolder.desc': 'Normally LLR follows the core Daily Notes plugin. Set a folder here only as a safety net: it is used solely when the Daily Notes plugin’s own folder is blank (e.g. its settings got reset by cloud sync). While the plugin reports a folder, that always wins and this value is ignored. Leave empty if your daily notes live in the vault root.',
        'notice.invalidTime': 'LLR: Please enter time in HHmm format (example: 0700).',
        'notice.emptySectionLabel': 'LLR: Please enter a section label.',
    },
    ja: {
        'ribbon.openSummary': 'LLR サマリーを開く',
        'ribbon.adjustTime1m': '時間調整（1分）',
        'command.openSummaryView': 'サマリービューを開く',
        'command.toggleTask': 'タスクをトグル',
        'command.adjustTime1m': '時間調整（1分）',
        'command.startTask': 'タスク開始',
        'command.stopTask': 'タスク完了',
        'command.startTaskFromPrev': '前の時刻で開始',
        'command.duplicateTask': 'タスク複製',
        'command.skipTaskLogOnly': 'タスクをスキップ',
        'command.rescheduleRoutine': 'ルーチンを先送り',
        'command.insertRoutine': 'ルーチンを挿入',
        'command.replenishSrs': 'SRSバッチを補充',
        'command.startAndOpenNote': 'タスク開始してノートを開く',
        'settings.language.name': 'UI言語',
        'settings.language.desc': '設定画面とコマンド名の表示言語を選びます。',
        'settings.language.option.auto': '自動（システム言語）',
        'settings.language.option.ja': '日本語',
        'settings.language.option.en': '英語',
        'settings.language.notice': 'LLR: 言語を更新しました。コマンド名反映のためプラグインを再読み込みしてください。',
        'settings.debugMode.name': 'デバッグモード',
        'settings.debugMode.desc': 'コマンド実行・内部遅延処理の時刻を Notice 表示し、llrlog/debug.jsonl に記録します。デバッグや不具合調査向けです。',
        'settings.estimateWarning.name': '見積警告',
        'settings.estimateWarning.desc': '残り見積り時間に基づく予定警告の表示を切り替えます。',
        'settings.checkboxOverride.name': 'エディタのチェック上書き',
        'settings.checkboxOverride.desc': '編集画面のチェックボックスに LLR の短押し・長押し挙動を使います。OFF にするとクリックは Obsidian 標準に戻り、コマンドとショートカットはそのまま使えます。',
        'settings.startAndOpen.name': 'タスク開始でノートを開く',
        'settings.startAndOpen.desc': 'ON にすると、タスクを開始（未着手→実行中）したとき、その行のリンク先ノートも開きます。SRSバッチの中ではカーソルが開いたノートに移り、それ以外ではデイリーノートに残ります。ノートの frontmatter に open_focus: true / false があればカーソル挙動を上書きします。既定は OFF。',
        'settings.routineFolder.name': 'ルーチンフォルダ',
        'settings.routineFolder.desc': 'リピートタスク（ルーチンノート）を置くフォルダ。候補から選択できます。対象はこのフォルダ直下の .md のみです。',
        'settings.routineSections.heading': 'ルーチンセクション',
        'settings.routineSections.desc': 'Insert Routine / テンプレート自動挿入の見出し区切りを設定します。section（HHmm）が各時刻以上になったらその見出しに入ります。未設定のタスクは先頭（見出しなし）です。',
        'settings.routineSections.empty': 'セクション設定がありません。すべて見出しなしで書き出されます。',
        'settings.routineSections.itemName': 'セクション {index}',
        'settings.routineSections.itemDesc': '境界時刻（HHmm）と見出しラベル',
        'settings.routineSections.newName': '新しいセクション',
        'settings.routineSections.newDesc': '時刻（HHmm）と見出しラベルを入力。両方そろうと確定し、時刻順に並び替えます。',
        'settings.routineSections.deleteTooltip': 'セクションを削除',
        'settings.routineSections.addTooltip': 'セクションを追加（両方入力時）',
        'settings.routineSections.labelPlaceholder': '午前',
        'settings.routineSections.timePlaceholder': '0700',
        'settings.srsGrowth.name': 'SRS 成長（実験的）',
        'settings.srsGrowth.desc': 'ON にすると、routine フォルダ以外にある repeat > 0 のノートを完了したとき、repeat が 2〜3 倍に成長します。ノートは vault のどこにあっても対象になります。',
        'settings.srsMaxDaily.name': 'SRS 1日の上限',
        'settings.srsMaxDaily.desc': 'デイリーノートに出す SRS ノートの1日あたり上限。超えた分は翌日以降に繰り越されます。0 で無制限。',
        'settings.advanced.heading': '詳細設定 / 互換性',
        'settings.advanced.desc': '例外的な運用向けの設定です。通常はこのままで構いません。',
        'settings.dailyNoteFolder.name': 'デイリーノートのフォルダ（予備）',
        'settings.dailyNoteFolder.desc': '通常 LLR はコアの Daily Notes プラグインに従います。ここは保険用です。Daily Notes プラグイン側のフォルダが空のとき（例: クラウド同期で設定が巻き戻ったとき）だけこの値を使います。プラグインがフォルダを返している間は常にそちらが優先され、この値は無視されます。デイリーをボールト直下に置いている場合は空のままにしてください。',
        'notice.invalidTime': 'LLR: 時刻は HHmm（例: 0700）で入力してください。',
        'notice.emptySectionLabel': 'LLR: 見出しラベルを入力してください。',
    },
} as const;

export type TranslationKey = keyof typeof TRANSLATIONS.en;

export function resolveLanguage(uiLanguage: UILanguage): ResolvedLanguage {
    if (uiLanguage === 'ja' || uiLanguage === 'en') {
        return uiLanguage;
    }
    const locale = String(globalThis.navigator?.language ?? '').toLowerCase();
    return locale.startsWith('ja') ? 'ja' : 'en';
}

export function translate(
    lang: ResolvedLanguage,
    key: TranslationKey,
    vars?: Record<string, string | number>
): string {
    const template = TRANSLATIONS[lang][key] ?? TRANSLATIONS.en[key];
    if (!vars) return template;
    return Object.entries(vars).reduce(
        (acc, [name, value]) => acc.replaceAll(`{${name}}`, String(value)),
        template
    );
}

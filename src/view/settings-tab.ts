import { App, AbstractInputSuggest, PluginSettingTab, Setting, TFolder } from 'obsidian';
import type LlrPlugin from '../main';
import { DEFAULT_ROUTINE_FOLDER, normalizeRoutineFolder, parseSectionTimeToInt } from '../service/settings';

export class FolderPathSuggest extends AbstractInputSuggest<TFolder> {
    constructor(app: App, inputEl: HTMLInputElement) {
        super(app, inputEl);
    }

    protected getSuggestions(query: string): TFolder[] {
        const normalizedQuery = query.trim().toLowerCase();
        const folders = this.app.vault.getAllLoadedFiles()
            .filter((file): file is TFolder => file instanceof TFolder)
            .filter((folder) => folder.path.length > 0)
            .sort((a, b) => a.path.localeCompare(b.path, 'ja'));

        if (!normalizedQuery) return folders.slice(0, 100);
        return folders
            .filter((folder) => folder.path.toLowerCase().includes(normalizedQuery))
            .slice(0, 100);
    }

    renderSuggestion(folder: TFolder, el: HTMLElement): void {
        el.setText(folder.path);
    }

    selectSuggestion(folder: TFolder, _evt: MouseEvent | KeyboardEvent): void {
        this.setValue(folder.path);
    }

    getFirstSuggestion(query: string): TFolder | null {
        const suggestions = this.getSuggestions(query);
        if (!Array.isArray(suggestions) || suggestions.length === 0) return null;
        return suggestions[0];
    }
}

export class LlrSettingTab extends PluginSettingTab {
    plugin: LlrPlugin;
    private routineFolderDraft = '';
    private newSectionDraftTime = '';
    private newSectionDraftLabel = '';

    constructor(app: App, plugin: LlrPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        this.routineFolderDraft = this.plugin.getRoutineFolder();

        new Setting(containerEl)
            .setName(this.plugin.t('settings.language.name'))
            .setDesc(this.plugin.t('settings.language.desc'))
            .addDropdown((dropdown) => {
                dropdown
                    .addOption('auto', this.plugin.t('settings.language.option.auto'))
                    .addOption('ja', this.plugin.t('settings.language.option.ja'))
                    .addOption('en', this.plugin.t('settings.language.option.en'))
                    .setValue(this.plugin.getUiLanguage())
                    .onChange(async (value) => {
                        if (value !== 'auto' && value !== 'ja' && value !== 'en') return;
                        await this.plugin.setUiLanguage(value);
                        this.display();
                        this.plugin.showLlrNotice(this.plugin.t('settings.language.notice'));
                    });
            });

        new Setting(containerEl)
            .setName(this.plugin.t('settings.estimateWarning.name'))
            .setDesc(this.plugin.t('settings.estimateWarning.desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.isEstimateWarningEnabled())
                .onChange(async (value) => {
                    await this.plugin.setEstimateWarningEnabled(value);
                }));

        const commitRoutineFolder = async (nextFolder?: string) => {
            if (typeof nextFolder === 'string') {
                this.routineFolderDraft = nextFolder;
            }
            const before = this.plugin.getRoutineFolder();
            await this.plugin.setRoutineFolder(this.routineFolderDraft);
            const after = this.plugin.getRoutineFolder();
            this.routineFolderDraft = after;
            if (after !== before) {
                this.display();
            }
        };

        new Setting(containerEl)
            .setName(this.plugin.t('settings.routineFolder.name'))
            .setDesc(this.plugin.t('settings.routineFolder.desc'))
            .addSearch((search) => {
                search.setPlaceholder(DEFAULT_ROUTINE_FOLDER).setValue(this.routineFolderDraft);
                const folderSuggest = new FolderPathSuggest(this.app, search.inputEl);
                const resolveCommittedFolderPath = (): string | null => {
                    const query = search.getValue().trim();
                    const normalized = normalizeRoutineFolder(query);
                    const exact = this.app.vault.getFolderByPath(normalized);
                    if (exact) return exact.path;
                    if (!query) return this.plugin.getRoutineFolder();
                    const first = folderSuggest.getFirstSuggestion(query);
                    if (!first) return null;
                    const q = query.toLowerCase();
                    if (!first.path.toLowerCase().startsWith(q)) return null;
                    return first.path;
                };
                folderSuggest.onSelect((folder) => {
                    this.routineFolderDraft = folder.path;
                    search.setValue(folder.path);
                    void commitRoutineFolder();
                });
                search.onChange((value) => {
                    this.routineFolderDraft = value;
                });
                search.inputEl.addEventListener('keydown', (ev) => {
                    if (ev.isComposing || ev.key !== 'Enter') return;
                    ev.preventDefault();
                    const resolved = resolveCommittedFolderPath();
                    if (!resolved) return;
                    this.routineFolderDraft = resolved;
                    search.setValue(resolved);
                    folderSuggest.close();
                    void commitRoutineFolder();
                });
                search.inputEl.addEventListener('blur', () => {
                    const resolved = resolveCommittedFolderPath();
                    if (!resolved) {
                        search.setValue(this.plugin.getRoutineFolder());
                        this.routineFolderDraft = this.plugin.getRoutineFolder();
                        return;
                    }
                    this.routineFolderDraft = resolved;
                    search.setValue(resolved);
                    void commitRoutineFolder();
                });
            });

        new Setting(containerEl)
            .setName(this.plugin.t('settings.routineSections.heading'))
            .setHeading();
        containerEl.createEl('p', {
            text: this.plugin.t('settings.routineSections.desc'),
            cls: 'setting-item-description',
        });

        const listContainer = containerEl.createDiv('llr-section-settings-list');
        this.renderSectionDefinitionSettings(listContainer);

        this.renderNewSectionDraftSetting(containerEl);
        this.renderAdvancedSettings(containerEl);
    }

    private renderSectionDefinitionSettings(containerEl: HTMLElement): void {
        containerEl.empty();
        const defs = this.plugin.getSectionDefinitions();

        if (defs.length === 0) {
            containerEl.createEl('p', {
                text: this.plugin.t('settings.routineSections.empty'),
                cls: 'setting-item-description',
            });
            return;
        }

        defs.forEach((def, index) => {
            const saveTimeField = async () => {
                if (defs[index].time.length !== 4 || parseSectionTimeToInt(defs[index].time) === null) {
                    this.plugin.showLlrNotice(this.plugin.t('notice.invalidTime'));
                    this.display();
                    return;
                }
                await this.plugin.setSectionDefinitions(defs);
                this.display();
            };

            const saveLabelField = async () => {
                defs[index].label = defs[index].label.trim();
                if (!defs[index].label) {
                    this.plugin.showLlrNotice(this.plugin.t('notice.emptySectionLabel'));
                    this.display();
                    return;
                }
                await this.plugin.setSectionDefinitions(defs);
                this.display();
            };

            new Setting(containerEl)
                .setName(this.plugin.t('settings.routineSections.itemName', { index: index + 1 }))
                .setDesc(this.plugin.t('settings.routineSections.itemDesc'))
                .addText((text) => {
                    text.setPlaceholder(this.plugin.t('settings.routineSections.labelPlaceholder')).setValue(def.label);
                    text.onChange((value) => {
                        defs[index].label = value;
                    });
                    text.inputEl.addEventListener('blur', () => { void saveLabelField(); });
                    text.inputEl.addEventListener('keydown', (ev) => {
                        if (ev.key !== 'Enter') return;
                        ev.preventDefault();
                        void saveLabelField();
                    });
                })
                .addText((text) => {
                    text.setPlaceholder(this.plugin.t('settings.routineSections.timePlaceholder')).setValue(def.time);
                    text.inputEl.inputMode = 'numeric';
                    text.inputEl.maxLength = 4;
                    text.onChange((value) => {
                        defs[index].time = value.replace(/[^\d]/g, '').slice(0, 4);
                    });
                    text.inputEl.addEventListener('blur', () => { void saveTimeField(); });
                    text.inputEl.addEventListener('keydown', (ev) => {
                        if (ev.key !== 'Enter') return;
                        ev.preventDefault();
                        void saveTimeField();
                    });
                })
                .addExtraButton((btn) => btn
                    .setIcon('trash')
                    .setTooltip(this.plugin.t('settings.routineSections.deleteTooltip'))
                    .onClick(() => {
                        defs.splice(index, 1);
                        void this.plugin.setSectionDefinitions(defs).then(() => { this.display(); });
                    }));
        });
    }

    private renderNewSectionDraftSetting(containerEl: HTMLElement): void {
        const maybeCommitDraft = async () => {
            const time = this.newSectionDraftTime.trim();
            const label = this.newSectionDraftLabel.trim();
            if (!time && !label) return;
            if (!time || !label) return;
            if (time.length !== 4 || parseSectionTimeToInt(time) === null) {
                this.plugin.showLlrNotice(this.plugin.t('notice.invalidTime'));
                return;
            }

            const defs = this.plugin.getSectionDefinitions();
            defs.push({ time, label });
            await this.plugin.setSectionDefinitions(defs);
            this.newSectionDraftTime = '';
            this.newSectionDraftLabel = '';
            this.display();
        };

        new Setting(containerEl)
            .setName(this.plugin.t('settings.routineSections.newName'))
            .setDesc(this.plugin.t('settings.routineSections.newDesc'))
            .addText((text) => {
                text.setPlaceholder(this.plugin.t('settings.routineSections.labelPlaceholder')).setValue(this.newSectionDraftLabel);
                text.onChange((value) => {
                    this.newSectionDraftLabel = value;
                });
                text.inputEl.addEventListener('blur', () => { void maybeCommitDraft(); });
                text.inputEl.addEventListener('keydown', (ev) => {
                    if (ev.key !== 'Enter') return;
                    ev.preventDefault();
                    void maybeCommitDraft();
                });
            })
            .addText((text) => {
                text.setPlaceholder(this.plugin.t('settings.routineSections.timePlaceholder')).setValue(this.newSectionDraftTime);
                text.inputEl.inputMode = 'numeric';
                text.inputEl.maxLength = 4;
                text.onChange((value) => {
                    this.newSectionDraftTime = value.replace(/[^\d]/g, '').slice(0, 4);
                });
                text.inputEl.addEventListener('blur', () => { void maybeCommitDraft(); });
                text.inputEl.addEventListener('keydown', (ev) => {
                    if (ev.key !== 'Enter') return;
                    ev.preventDefault();
                    void maybeCommitDraft();
                });
            })
            .addExtraButton((btn) => btn
                .setIcon('plus')
                .setTooltip(this.plugin.t('settings.routineSections.addTooltip'))
                .onClick(() => { void maybeCommitDraft(); }));
    }

    private renderAdvancedSettings(containerEl: HTMLElement): void {
        new Setting(containerEl)
            .setName(this.plugin.t('settings.advanced.heading'))
            .setHeading();
        containerEl.createEl('p', {
            text: this.plugin.t('settings.advanced.desc'),
            cls: 'setting-item-description',
        });

        new Setting(containerEl)
            .setName(this.plugin.t('settings.debugMode.name'))
            .setDesc(this.plugin.t('settings.debugMode.desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.isDebugModeEnabled())
                .onChange(async (value) => {
                    await this.plugin.setDebugModeEnabled(value);
                }));

        new Setting(containerEl)
            .setName(this.plugin.t('settings.checkboxOverride.name'))
            .setDesc(this.plugin.t('settings.checkboxOverride.desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.isCheckboxOverrideEnabled())
                .onChange(async (value) => {
                    await this.plugin.setCheckboxOverrideEnabled(value);
                }));

        new Setting(containerEl)
            .setName(this.plugin.t('settings.dailyNoteFolder.name'))
            .setDesc(this.plugin.t('settings.dailyNoteFolder.desc'))
            .addSearch((search) => {
                search.setValue(this.plugin.getDailyNoteFolder());
                const folderSuggest = new FolderPathSuggest(this.app, search.inputEl);
                const commit = async () => {
                    await this.plugin.setDailyNoteFolder(search.getValue());
                    search.setValue(this.plugin.getDailyNoteFolder());
                };
                folderSuggest.onSelect((folder) => {
                    search.setValue(folder.path);
                    folderSuggest.close();
                    void commit();
                });
                search.inputEl.addEventListener('keydown', (ev) => {
                    if (ev.isComposing || ev.key !== 'Enter') return;
                    ev.preventDefault();
                    folderSuggest.close();
                    void commit();
                });
                search.inputEl.addEventListener('blur', () => { void commit(); });
            });
    }
}

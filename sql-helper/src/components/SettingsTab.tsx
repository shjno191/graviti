import React, { useState, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore, DbConfig } from '../store/useAppStore';
import { invoke } from '@tauri-apps/api/tauri';
import { open as openDialog } from '@tauri-apps/api/dialog';

// ... (ShortcutRecorder remains same)
const ShortcutRecorder: React.FC<{ onRecord: (s: string) => void, current: string, onSave: () => void }> = ({ onRecord, onSave }) => {
    const [isRecording, setIsRecording] = useState(false);

    useEffect(() => {
        if (!isRecording) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();

            let combo = '';
            if (e.ctrlKey) combo += 'CTRL+';
            if (e.shiftKey) combo += 'SHIFT+';
            if (e.altKey) combo += 'ALT+';

            if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
                combo += e.key.toUpperCase();
                onRecord(combo);
                setIsRecording(false);
                setTimeout(onSave, 100);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isRecording, onRecord, onSave]);

    return (
        <button
            onClick={() => setIsRecording(true)}
            className={`px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-sm active:scale-95 whitespace-nowrap ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-black text-white hover:bg-gray-800'}`}
        >
            {isRecording ? 'RECORDING...' : 'CHANGE'}
        </button>
    );
};

const SettingsTab: React.FC = React.memo(() => {
    const {
        connections, setConnections,
        translateFilePath, setTranslateFilePath,
        excelHeaderColor, setExcelHeaderColor,
        runShortcut, setRunShortcut,
        columnSplitEnabled, setColumnSplitEnabled,
        columnSplitKeywords, setColumnSplitKeywords,
        activeTab, updateConnectionSessionStatus,
        activeSection, setActiveSection,
        textCompareDeleteChars, setTextCompareDeleteChars,
        textCompareRemoveAppend, setTextCompareRemoveAppend,
        textCompareTruncateDuplicate, setTextCompareTruncateDuplicate,
        textCompareRemoveEmptyLines, setTextCompareRemoveEmptyLines,
        textCompareSort, setTextCompareSort,
        textCompareOrdered, setTextCompareOrdered,
        textCompareIgnoreCase, setTextCompareIgnoreCase,
        textCompareTrimWhitespace, setTextCompareTrimWhitespace,
        textCompareAutoCompare, setTextCompareAutoCompare,
        formatRemoveSpaces, setFormatRemoveSpaces,
        formatSqlAppend, setFormatSqlAppend,
        searchStrict, setSearchStrict,
        javaParserAutoAnalyze, setJavaParserAutoAnalyze,
        translateDeleteChars, setTranslateDeleteChars,
        translateTruncateDuplicate, setTranslateTruncateDuplicate,
        translateStrict, setTranslateStrict,
        translateLineHeight, setTranslateLineHeight,
        revertTKDeleteChars, setRevertTKDeleteChars,
        columnSplitApplyToText, setColumnSplitApplyToText,
        columnSplitApplyToTable, setColumnSplitApplyToTable,
        uiHighlightCopied, setUiHighlightCopied,
        geminiApiKey, setGeminiApiKey,
        translateIgnoreWords, setTranslateIgnoreWords,
        revertRules, addRevertRule, updateRevertRule, removeRevertRule, resetRevertRule,
        focusSearchShortcut, setFocusSearchShortcut,
        globalSearchShortcut, setGlobalSearchShortcut,
        quickSettingsShortcut, setQuickSettingsShortcut,
        navPrevShortcut, setNavPrevShortcut,
        navNextShortcut, setNavNextShortcut,
        textCompareSideAName, setTextCompareSideAName,
        textCompareSideBName, setTextCompareSideBName
    } = useAppStore(useShallow(state => ({
        connections: state.connections,
        setConnections: state.setConnections,
        translateFilePath: state.translateFilePath,
        setTranslateFilePath: state.setTranslateFilePath,
        excelHeaderColor: state.excelHeaderColor,
        setExcelHeaderColor: state.setExcelHeaderColor,
        runShortcut: state.runShortcut,
        setRunShortcut: state.setRunShortcut,
        columnSplitEnabled: state.columnSplitEnabled,
        setColumnSplitEnabled: state.setColumnSplitEnabled,
        columnSplitKeywords: state.columnSplitKeywords,
        setColumnSplitKeywords: state.setColumnSplitKeywords,
        activeTab: state.activeTab,
        updateConnectionSessionStatus: state.updateConnectionSessionStatus,
        activeSection: state.settingsSection,
        setActiveSection: state.setSettingsSection,
        textCompareDeleteChars: state.textCompareDeleteChars,
        setTextCompareDeleteChars: state.setTextCompareDeleteChars,
        textCompareRemoveAppend: state.textCompareRemoveAppend,
        setTextCompareRemoveAppend: state.setTextCompareRemoveAppend,
        textCompareTruncateDuplicate: state.textCompareTruncateDuplicate,
        setTextCompareTruncateDuplicate: state.setTextCompareTruncateDuplicate,
        textCompareRemoveEmptyLines: state.textCompareRemoveEmptyLines,
        setTextCompareRemoveEmptyLines: state.setTextCompareRemoveEmptyLines,
        textCompareSort: state.textCompareSort,
        setTextCompareSort: state.setTextCompareSort,
        textCompareOrdered: state.textCompareOrdered,
        setTextCompareOrdered: state.setTextCompareOrdered,
        textCompareIgnoreCase: state.textCompareIgnoreCase,
        setTextCompareIgnoreCase: state.setTextCompareIgnoreCase,
        textCompareTrimWhitespace: state.textCompareTrimWhitespace,
        setTextCompareTrimWhitespace: state.setTextCompareTrimWhitespace,
        textCompareAutoCompare: state.textCompareAutoCompare,
        setTextCompareAutoCompare: state.setTextCompareAutoCompare,
        textCompareSideAName: state.textCompareSideAName,
        setTextCompareSideAName: state.setTextCompareSideAName,
        textCompareSideBName: state.textCompareSideBName,
        setTextCompareSideBName: state.setTextCompareSideBName,
        formatRemoveSpaces: state.formatRemoveSpaces,
        setFormatRemoveSpaces: state.setFormatRemoveSpaces,
        formatSqlAppend: state.formatSqlAppend,
        setFormatSqlAppend: state.setFormatSqlAppend,
        searchStrict: state.searchStrict,
        setSearchStrict: state.setSearchStrict,
        javaParserAutoAnalyze: state.javaParserAutoAnalyze,
        setJavaParserAutoAnalyze: state.setJavaParserAutoAnalyze,
        translateDeleteChars: state.translateDeleteChars,
        setTranslateDeleteChars: state.setTranslateDeleteChars,
        translateTruncateDuplicate: state.translateTruncateDuplicate,
        setTranslateTruncateDuplicate: state.setTranslateTruncateDuplicate,
        translateStrict: state.translateStrict,
        setTranslateStrict: state.setTranslateStrict,
        translateLineHeight: state.translateLineHeight,
        setTranslateLineHeight: state.setTranslateLineHeight,
        revertTKDeleteChars: state.revertTKDeleteChars,
        setRevertTKDeleteChars: state.setRevertTKDeleteChars,
        columnSplitApplyToText: state.columnSplitApplyToText,
        setColumnSplitApplyToText: state.setColumnSplitApplyToText,
        columnSplitApplyToTable: state.columnSplitApplyToTable,
        setColumnSplitApplyToTable: state.setColumnSplitApplyToTable,
        uiHighlightCopied: state.uiHighlightCopied,
        setUiHighlightCopied: state.setUiHighlightCopied,
        geminiApiKey: state.geminiApiKey,
        setGeminiApiKey: state.setGeminiApiKey,
        translateIgnoreWords: state.translateIgnoreWords,
        setTranslateIgnoreWords: state.setTranslateIgnoreWords,
        focusSearchShortcut: state.focusSearchShortcut,
        setFocusSearchShortcut: state.setFocusSearchShortcut,
        globalSearchShortcut: state.globalSearchShortcut,
        setGlobalSearchShortcut: state.setGlobalSearchShortcut,
        quickSettingsShortcut: state.quickSettingsShortcut,
        setQuickSettingsShortcut: state.setQuickSettingsShortcut,
        navPrevShortcut: state.navPrevShortcut,
        setNavPrevShortcut: state.setNavPrevShortcut,
        navNextShortcut: state.navNextShortcut,
        setNavNextShortcut: state.setNavNextShortcut,
        revertRules: state.revertRules,
        setRevertRules: state.setRevertRules,
        addRevertRule: state.addRevertRule,
        updateRevertRule: state.updateRevertRule,
        removeRevertRule: state.removeRevertRule,
        resetRevertRule: state.resetRevertRule
    })));


    const [editingConfig, setEditingConfig] = useState<DbConfig | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean, message: string } | null>(null);

    const loadSettings = async () => {
        setIsLoading(true);
        try {
            const settings = await invoke<any>('load_db_settings');
            if (settings) {
                const store = useAppStore.getState();
                if (settings.connections) store.setConnections(settings.connections);
                if (settings.translate_file_path) store.setTranslateFilePath(settings.translate_file_path);
                if (settings.column_split_enabled !== undefined) store.setColumnSplitEnabled(settings.column_split_enabled);
                if (settings.column_split_keywords) store.setColumnSplitKeywords(settings.column_split_keywords);
                if (settings.revert_tk_col_config) store.setRevertTKColConfig(settings.revert_tk_col_config);
                if (settings.column_split_apply_to_text !== undefined) store.setColumnSplitApplyToText(settings.column_split_apply_to_text);
                if (settings.column_split_apply_to_table !== undefined) store.setColumnSplitApplyToTable(settings.column_split_apply_to_table);
                if (settings.revert_tk_delete_chars) store.setRevertTKDeleteChars(settings.revert_tk_delete_chars);
                if (settings.revert_tk_mapping) store.setRevertTKMapping(settings.revert_tk_mapping);
                if (settings.revert_rules) store.setRevertRules(settings.revert_rules);
                if (settings.text_compare_delete_chars) store.setTextCompareDeleteChars(settings.text_compare_delete_chars);
                if (settings.text_compare_remove_append !== undefined) store.setTextCompareRemoveAppend(settings.text_compare_remove_append);
                if (settings.text_compare_truncate_duplicate !== undefined) store.setTextCompareTruncateDuplicate(settings.text_compare_truncate_duplicate);
                if (settings.text_compare_remove_empty_lines !== undefined) store.setTextCompareRemoveEmptyLines(settings.text_compare_remove_empty_lines);
                if (settings.text_compare_sort !== undefined) store.setTextCompareSort(settings.text_compare_sort);
                if (settings.text_compare_ordered !== undefined) store.setTextCompareOrdered(settings.text_compare_ordered);
                if (settings.text_compare_ignore_case !== undefined) store.setTextCompareIgnoreCase(settings.text_compare_ignore_case);
                if (settings.text_compare_trim_whitespace !== undefined) store.setTextCompareTrimWhitespace(settings.text_compare_trim_whitespace);
                if (settings.text_compare_auto_compare !== undefined) store.setTextCompareAutoCompare(settings.text_compare_auto_compare);

                if (settings.translate_delete_chars) store.setTranslateDeleteChars(settings.translate_delete_chars);
                if (settings.translate_truncate_duplicate !== undefined) store.setTranslateTruncateDuplicate(settings.translate_truncate_duplicate);
                if (settings.translate_strict !== undefined) store.setTranslateStrict(settings.translate_strict);
                if (settings.translate_ignore_words) store.setTranslateIgnoreWords(settings.translate_ignore_words);
                if (settings.java_parser_auto_analyze !== undefined) store.setJavaParserAutoAnalyze(settings.java_parser_auto_analyze);

                if (settings.excel_header_color) store.setExcelHeaderColor(settings.excel_header_color);
                if (settings.run_shortcut) store.setRunShortcut(settings.run_shortcut);
                if (settings.focus_search_shortcut) store.setFocusSearchShortcut(settings.focus_search_shortcut);

                // Add missing global settings
                if (settings.format_remove_spaces !== undefined) store.setFormatRemoveSpaces(settings.format_remove_spaces);
                if (settings.format_sql_append !== undefined) store.setFormatSqlAppend(settings.format_sql_append);
                if (settings.search_strict !== undefined) store.setSearchStrict(settings.search_strict);
                if (settings.ui_highlight_copied !== undefined) store.setUiHighlightCopied(settings.ui_highlight_copied);
                if (settings.gemini_api_key !== undefined) store.setGeminiApiKey(settings.gemini_api_key);

                // Load cached inputs
                if (settings.translate_input) store.setTranslateInputStore(settings.translate_input);
                if (settings.revert_tk_input) store.setRevertTKInputStore(settings.revert_tk_input);
            }
        } catch (err) {
            console.error('Failed to load DB settings:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'settings') {
            loadSettings();
        }
    }, [activeTab]);

    const handleAddConnection = () => {
        const newConn: DbConfig = {
            id: Math.random().toString(36).substr(2, 9),
            name: `New Connection ${connections.length + 1}`,
            db_type: 'mssql',
            host: 'localhost',
            port: 1433,
            user: 'sa',
            password: '',
            database: '',
            trust_server_certificate: true,
            encrypt: false
        };
        setConnections([...connections, newConn]);
        setEditingConfig(newConn);
    };

    const handleSaveSettings = async (currentConnections?: DbConfig[]) => {
        const connsToSave = currentConnections || connections;
        const state = useAppStore.getState();

        await invoke('save_db_settings', {
            settings: {
                connections: connsToSave,
                translate_file_path: translateFilePath,
                column_split_enabled: columnSplitEnabled,
                column_split_keywords: columnSplitKeywords,
                revert_tk_col_config: state.revertTKColConfig,
                column_split_apply_to_text: state.columnSplitApplyToText,
                column_split_apply_to_table: state.columnSplitApplyToTable,
                revert_tk_delete_chars: state.revertTKDeleteChars,
                revert_tk_mapping: state.revertTKMapping,
                revert_rules: state.revertRules,
                text_compare_delete_chars: state.textCompareDeleteChars,
                text_compare_remove_append: state.textCompareRemoveAppend,
                text_compare_truncate_duplicate: state.textCompareTruncateDuplicate,
                text_compare_remove_empty_lines: state.textCompareRemoveEmptyLines,
                text_compare_sort: state.textCompareSort,
                text_compare_ordered: state.textCompareOrdered,
                text_compare_ignore_case: state.textCompareIgnoreCase,
                text_compare_trim_whitespace: state.textCompareTrimWhitespace,
                text_compare_auto_compare: state.textCompareAutoCompare,
                translate_delete_chars: state.translateDeleteChars,
                translate_truncate_duplicate: state.translateTruncateDuplicate,
                translate_strict: state.translateStrict,
                excel_header_color: excelHeaderColor,
                run_shortcut: runShortcut,
                focus_search_shortcut: state.focusSearchShortcut,
                global_search_shortcut: state.globalSearchShortcut,
                quick_settings_shortcut: state.quickSettingsShortcut,
                nav_prev_shortcut: state.navPrevShortcut,
                nav_next_shortcut: state.navNextShortcut,
                format_remove_spaces: state.formatRemoveSpaces,
                format_sql_append: state.formatSqlAppend,
                search_strict: state.searchStrict,
                java_parser_auto_analyze: state.javaParserAutoAnalyze,
                ui_highlight_copied: state.uiHighlightCopied,
                gemini_api_key: geminiApiKey,
                translate_input: state.translateInputStore,
                revert_tk_input: state.revertTKInputStore,
                translate_ignore_words: state.translateIgnoreWords,
                text_compare_side_a_name: state.textCompareSideAName,
                text_compare_side_b_name: state.textCompareSideBName
            }
        });
    };

    const handleGlobalSave = async () => {
        setIsSaving(true);
        try {
            await handleSaveSettings(connections);
        } catch (e) {
            console.error(e);
            alert('Failed to save settings');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSave = async (configToSave: DbConfig) => {
        setIsSaving(true);
        try {
            const updatedConnections = connections.map(c => c.id === configToSave.id ? configToSave : c);
            if (!updatedConnections.find(c => c.id === configToSave.id)) {
                updatedConnections.push(configToSave);
            }
            await handleSaveSettings(updatedConnections);
            setConnections(updatedConnections);
        } catch (error) {
            console.error('Failed to save settings:', error);
        } finally {
            setIsSaving(false);
        }
    };

    useEffect(() => {
        setTestResult(null);
    }, [editingConfig?.id]);

    const handleTest = async (configToTest: DbConfig) => {
        setIsTesting(true);
        setTestResult(null);
        try {
            const result = await invoke<string>('test_connection', { config: configToTest });
            setTestResult({ success: true, message: result || 'SUCCESS' });
            const updatedConfig = { ...configToTest, verified: true };
            if (editingConfig?.id === configToTest.id) setEditingConfig(updatedConfig);
            const updatedConnections = connections.map(c => c.id === updatedConfig.id ? updatedConfig : c);
            await handleSaveSettings(updatedConnections);
            setConnections(updatedConnections);
            updateConnectionSessionStatus(configToTest.id, 'success');

            // Auto hide success message after 3 seconds
            setTimeout(() => {
                setTestResult(prev => prev?.success ? null : prev);
            }, 3000);
        } catch (error: any) {
            setTestResult({ success: false, message: error?.toString() || 'FAILED' });
            const updatedConfig = { ...configToTest, verified: false };
            if (editingConfig?.id === configToTest.id) setEditingConfig(updatedConfig);
            updateConnectionSessionStatus(configToTest.id, 'error');
        } finally {
            setIsTesting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure?')) return;
        const updatedConnections = connections.filter(c => c.id !== id);
        await handleSaveSettings(updatedConnections);
        setConnections(updatedConnections);
        if (editingConfig?.id === id) setEditingConfig(null);
    };

    const SidebarItem: React.FC<{ id: typeof activeSection, label: string, icon: string }> = ({ id, label, icon }) => (
        <button
            onClick={() => setActiveSection(id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all shrink-0 ${activeSection === id
                ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-[1.02]'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                }`}
        >
            <span className="text-base shrink-0">{icon}</span>
            <span className="font-black text-[10px] uppercase tracking-widest leading-none mt-0.5 truncate">{label}</span>
        </button>
    );

    const SidebarGroup: React.FC<{ label: string, children: React.ReactNode }> = ({ label, children }) => (
        <div className="flex flex-col gap-1 mb-4 overflow-hidden">
            <h4 className="px-3 mb-1 text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] truncate">{label}</h4>
            {children}
        </div>
    );

    const SectionHeader: React.FC<{ title: string, subtitle: string, icon?: string }> = ({ title, subtitle, icon }) => (
        <div className="flex flex-col gap-0.5 mb-8">
            <div className="flex items-center gap-3">
                {icon && <span className="text-2xl">{icon}</span>}
                <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight leading-none">{title}</h3>
            </div>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest ml-1">{subtitle}</p>
        </div>
    );

    const SettingToggle: React.FC<{ label: string, desc: string, tooltip?: string, checked: boolean, onChange: (val: boolean) => void }> = ({ label, desc, tooltip, checked, onChange }) => (
        <label
            data-tooltip={tooltip}
            className="flex items-center gap-4 cursor-pointer group p-4 bg-white rounded-2xl border border-gray-100 hover:border-primary transition-all shadow-sm"
        >
            <div className="relative inline-flex items-center cursor-pointer">
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={e => { onChange(e.target.checked); setTimeout(handleGlobalSave, 100); }}
                    className="sr-only peer"
                />
                <div className="w-10 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </div>
            <div className="flex flex-col">
                <span className="text-[11px] font-black text-gray-800 uppercase tracking-tight leading-none">{label}</span>
                <span className="text-[8px] text-gray-400 font-bold uppercase mt-1 leading-tight">{desc}</span>
            </div>
        </label>
    );

    return (
        <div className="flex h-[calc(100vh-80px)] gap-6 p-6 overflow-hidden animate-in fade-in duration-500">
            {/* Sidebar */}
            <div className="w-52 flex flex-col bg-white rounded-3xl p-4 shadow-sm border border-gray-100 shrink-0">
                <div className="px-2 py-3 mb-6 border-b border-gray-50">
                    <h2 className="text-xl font-black text-gray-900 uppercase tracking-tighter">SETTINGS</h2>
                </div>

                <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar flex flex-col gap-2">
                    <SidebarGroup label="Global / General">
                        <SidebarItem id="database" label="Database" icon="🛡️" />
                        <SidebarItem id="shortcuts" label="Shortcuts" icon="⚡" />
                        <SidebarItem id="appearance" label="Aesthetics" icon="🎨" />
                    </SidebarGroup>

                    <SidebarGroup label="Feature Config">
                        <SidebarItem id="translate" label="Translate Tab" icon="🇯🇵" />
                        <SidebarItem id="revertTK" label="Revert TK" icon="🧩" />
                        <SidebarItem id="compare" label="Text Compare" icon="🔍" />
                        <SidebarItem id="javaParser" label="Java Parser" icon="☕" />
                    </SidebarGroup>
                </div>

                <div className="mt-auto pt-4 border-t border-gray-100 flex flex-col gap-2">
                    <button
                        onClick={handleGlobalSave}
                        disabled={isSaving}
                        className={`w-full py-3 rounded-xl font-black uppercase tracking-widest text-[9px] transition-all shadow-md active:scale-95 ${isSaving ? 'bg-gray-200 text-gray-400' : 'bg-black text-white hover:bg-gray-800 shadow-black/10'}`}
                    >
                        {isSaving ? 'SAVING...' : 'SAVE ALL'}
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={loadSettings}
                            disabled={isLoading || isSaving}
                            className="py-2 bg-gray-50 text-gray-600 border border-gray-100 rounded-lg font-black text-[8px] uppercase hover:bg-gray-100 transition-all"
                        >
                            REFRESH
                        </button>
                        <button
                            onClick={async () => {
                                const path = await invoke<string>('get_setting_path');
                                await invoke('open_file', { path });
                            }}
                            className="py-2 bg-gray-50 text-gray-600 border border-gray-100 rounded-lg font-black text-[8px] uppercase hover:bg-gray-100 transition-all"
                        >
                            JSON
                        </button>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-auto pr-2 custom-scrollbar">
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 min-h-full p-8 transition-all duration-300">

                    {/* DATABASE */}
                    {activeSection === 'database' && (
                        <div className="flex flex-col animate-in fade-in slide-in-from-bottom-2">
                            <div className="flex justify-between items-end mb-8">
                                <SectionHeader title="Connection Profiles" subtitle="Application-wide DB Settings" icon="🛡️" />
                                <button
                                    onClick={handleAddConnection}
                                    className="px-5 py-2 bg-primary text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-secondary transition-all shadow-md active:scale-95 mb-4"
                                >
                                    + ADD PROFILE
                                </button>
                            </div>

                            <div className="grid grid-cols-[260px_1fr] gap-8">
                                <div className="flex flex-col gap-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                                    {connections.map(conn => (
                                        <div
                                            key={conn.id}
                                            onClick={() => setEditingConfig(conn)}
                                            className={`p-3 rounded-2xl cursor-pointer transition-all border-2 flex items-center justify-between group ${editingConfig?.id === conn.id ? 'bg-primary/5 border-primary shadow-sm' : 'bg-white border-transparent hover:border-gray-50'}`}
                                        >
                                            <div className="flex flex-col gap-0.5">
                                                <div className="flex items-center gap-2">
                                                    <span className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${conn.sessionStatus === 'success' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' :
                                                        conn.sessionStatus === 'error' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]' :
                                                            'bg-gray-300'
                                                        }`}></span>
                                                    <span className="text-[12px] font-bold text-gray-800 truncate max-w-[160px]">{conn.name}</span>
                                                </div>
                                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-3.5">{conn.db_type}</span>
                                            </div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDelete(conn.id); }}
                                                className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-300 hover:text-red-500 transition-all"
                                            >
                                                🗑
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                {editingConfig ? (
                                    <div className="bg-gray-50/50 p-6 rounded-3xl border border-gray-100 flex flex-col gap-5">
                                        <div className="grid grid-cols-2 gap-5">
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Profile Name</label>
                                                <input
                                                    type="text"
                                                    value={editingConfig.name}
                                                    onChange={e => setEditingConfig({ ...editingConfig, name: e.target.value })}
                                                    className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold shadow-sm outline-none focus:ring-1 focus:ring-primary"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">DB Type</label>
                                                <select
                                                    value={editingConfig.db_type}
                                                    onChange={e => setEditingConfig({ ...editingConfig, db_type: (e.target.value as any) })}
                                                    className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold shadow-sm outline-none focus:ring-1 focus:ring-primary h-[38px] cursor-pointer"
                                                >
                                                    <option value="mssql">SQL Server (MSSQL)</option>
                                                    <option value="mysql">MySQL / MariaDB</option>
                                                    <option value="postgresql">PostgreSQL</option>
                                                </select>
                                            </div>
                                            {/* ... rest of db fields ... */}
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Host</label>
                                                <input type="text" value={editingConfig.host} onChange={e => setEditingConfig({ ...editingConfig, host: e.target.value })} className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm font-mono shadow-sm outline-none" />
                                            </div>
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Port</label>
                                                <input type="number" value={editingConfig.port} onChange={e => setEditingConfig({ ...editingConfig, port: parseInt(e.target.value) })} className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm font-mono shadow-sm outline-none" />
                                            </div>
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">User</label>
                                                <input type="text" value={editingConfig.user} onChange={e => setEditingConfig({ ...editingConfig, user: e.target.value })} className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold shadow-sm outline-none" />
                                            </div>
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Password</label>
                                                <input type="password" value={editingConfig.password} onChange={e => setEditingConfig({ ...editingConfig, password: e.target.value })} className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm shadow-sm outline-none" />
                                            </div>
                                            <div className="flex flex-col gap-1.5 col-span-2">
                                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Initial Catalog</label>
                                                <input type="text" value={editingConfig.database} onChange={e => setEditingConfig({ ...editingConfig, database: e.target.value })} className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold shadow-sm outline-none" />
                                            </div>
                                        </div>

                                        <div className="flex gap-3 pt-2">
                                            <button onClick={() => handleSave(editingConfig)} disabled={isSaving || isTesting} className="flex-1 py-3 bg-black text-white rounded-xl font-black uppercase text-[10px] tracking-widest transition-all active:scale-95">{isSaving ? 'SAVING...' : 'SAVE CHANGES'}</button>
                                            <button onClick={() => handleTest(editingConfig)} disabled={isSaving || isTesting} className="flex-1 py-3 bg-white text-gray-900 border border-gray-200 rounded-xl font-black uppercase text-[10px] tracking-widest hover:border-primary transition-all active:scale-95">{isTesting ? 'TESTING...' : 'TEST'}</button>
                                        </div>

                                        {testResult && (
                                            <div className={`mt-2 p-3 rounded-xl text-[10px] font-bold border ${testResult.success ? 'bg-green-50 border-green-100 text-green-600' : 'bg-red-50 border-red-100 text-red-600'}`}>
                                                <div className="flex items-center gap-2">
                                                    <span>{testResult.success ? '✅' : '❌'}</span>
                                                    <span className="uppercase tracking-widest">{testResult.success ? 'Connection Successful' : 'Connection Failed'}</span>
                                                </div>
                                                <div className="mt-1 font-mono text-[9px] opacity-70 break-all">{testResult.message}</div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center bg-gray-50/30 rounded-3xl border-2 border-dashed border-gray-50 min-h-[400px] text-gray-300">
                                        <span className="text-[10px] font-black uppercase tracking-[0.2em]">Select Profile</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* SHORTCUTS */}
                    {/* SHORTCUTS */}
                    {activeSection === 'shortcuts' && (
                        <div className="flex flex-col animate-in fade-in slide-in-from-bottom-2 max-w-4xl">
                            <SectionHeader title="Phím tắt Hệ thống" subtitle="Cài đặt tổ hợp phím truy cập nhanh" icon="⚡" />
                            <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
                                <div className="grid grid-cols-[1fr_1fr] bg-gray-50 border-b border-gray-100 px-6 py-3">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Hành động / Phím tắt</span>
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-4 border-l border-gray-200">Mô tả chức năng</span>
                                </div>

                                <div className="divide-y divide-gray-50">
                                    {/* Action 1 */}
                                    <div className="grid grid-cols-[1fr_1fr] items-center px-6 py-4 hover:bg-gray-50/50 transition-colors">
                                        <div className="flex items-center justify-between pr-8">
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-black text-gray-800 uppercase leading-none">Execute Script</span>
                                                <span className="text-[8px] text-gray-400 font-bold uppercase mt-1">Chạy câu lệnh SQL</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="min-w-[80px] bg-white border border-gray-200 rounded-lg px-3 py-1.5 font-mono text-sm font-black text-primary shadow-inner text-center">{runShortcut}</div>
                                                <ShortcutRecorder onRecord={setRunShortcut} current={runShortcut} onSave={handleGlobalSave} />
                                            </div>
                                        </div>
                                        <div className="pl-8 text-[11px] font-bold text-gray-500 leading-relaxed border-l border-gray-100 h-full flex items-center">
                                            Thực thi SQL nhanh tại tab Params hoặc Lab.
                                        </div>
                                    </div>

                                    {/* Action 2: Tab Search Focus */}
                                    <div className="grid grid-cols-[1fr_1fr] items-center px-6 py-4 hover:bg-gray-50/50 transition-colors">
                                        <div className="flex items-center justify-between pr-8">
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-black text-gray-800 uppercase leading-none">Tab Search Focus</span>
                                                <span className="text-[8px] text-gray-400 font-bold uppercase mt-1">Tìm kiếm nội bộ</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="min-w-[80px] bg-white border border-gray-200 rounded-lg px-3 py-1.5 font-mono text-sm font-black text-primary shadow-inner text-center">{focusSearchShortcut}</div>
                                                <ShortcutRecorder onRecord={setFocusSearchShortcut} current={focusSearchShortcut} onSave={handleGlobalSave} />
                                            </div>
                                        </div>
                                        <div className="pl-8 text-[11px] font-bold text-gray-500 leading-relaxed border-l border-gray-100 h-full flex items-center">
                                            Ưu tiên nhảy vào thanh tìm kiếm của Tab hiện tại (nếu có).
                                        </div>
                                    </div>

                                    {/* Action 3: Global Search Focus */}
                                    <div className="grid grid-cols-[1fr_1fr] items-center px-6 py-4 hover:bg-gray-50/50 transition-colors">
                                        <div className="flex items-center justify-between pr-8">
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-black text-gray-800 uppercase leading-none">Global Search Focus</span>
                                                <span className="text-[8px] text-gray-400 font-bold uppercase mt-1">Tìm kiếm tổng thể</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="min-w-[80px] bg-white border border-gray-200 rounded-lg px-3 py-1.5 font-mono text-sm font-black text-primary shadow-inner text-center">{globalSearchShortcut}</div>
                                                <ShortcutRecorder onRecord={setGlobalSearchShortcut} current={globalSearchShortcut} onSave={handleGlobalSave} />
                                            </div>
                                        </div>
                                        <div className="pl-8 text-[11px] font-bold text-gray-500 leading-relaxed border-l border-gray-100 h-full flex items-center">
                                            Nhấn phím tắt liên tiếp nhảy thẳng lên thanh Global Search.
                                        </div>
                                    </div>

                                    {/* Action 4: Quick Settings */}
                                    <div className="grid grid-cols-[1fr_1fr] items-center px-6 py-4 hover:bg-gray-50/50 transition-colors">
                                        <div className="flex items-center justify-between pr-8">
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-black text-gray-800 uppercase leading-none">Quick Settings</span>
                                                <span className="text-[8px] text-gray-400 font-bold uppercase mt-1">Cài đặt nhanh</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="min-w-[80px] bg-white border border-gray-200 rounded-lg px-3 py-1.5 font-mono text-sm font-black text-primary shadow-inner text-center">{quickSettingsShortcut}</div>
                                                <ShortcutRecorder onRecord={setQuickSettingsShortcut} current={quickSettingsShortcut} onSave={handleGlobalSave} />
                                            </div>
                                        </div>
                                        <div className="pl-8 text-[11px] font-bold text-gray-500 leading-relaxed border-l border-gray-100 h-full flex items-center">
                                            Nhảy tới mục cài đặt tương ứng với Tab hiện tại.
                                        </div>
                                    </div>

                                    {/* Action 5: Tab Navigation (Prev) */}
                                    <div className="grid grid-cols-[1fr_1fr] items-center px-6 py-4 hover:bg-gray-50/50 transition-colors">
                                        <div className="flex items-center justify-between pr-8">
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-black text-gray-800 uppercase leading-none">Tab Prev</span>
                                                <span className="text-[8px] text-gray-400 font-bold uppercase mt-1">Quay lại Tab trước</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="min-w-[80px] bg-white border border-gray-200 rounded-lg px-3 py-1.5 font-mono text-sm font-black text-primary shadow-inner text-center">{navPrevShortcut}</div>
                                                <ShortcutRecorder onRecord={setNavPrevShortcut} current={navPrevShortcut} onSave={handleGlobalSave} />
                                            </div>
                                        </div>
                                        <div className="pl-8 text-[11px] font-bold text-gray-500 leading-relaxed border-l border-gray-100 h-full flex items-center">
                                            Chuyển sang Tab bên trái.
                                        </div>
                                    </div>

                                    {/* Action 6: Tab Navigation (Next) */}
                                    <div className="grid grid-cols-[1fr_1fr] items-center px-6 py-4 hover:bg-gray-50/50 transition-colors">
                                        <div className="flex items-center justify-between pr-8">
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-black text-gray-800 uppercase leading-none">Tab Next</span>
                                                <span className="text-[8px] text-gray-400 font-bold uppercase mt-1">Tới Tab tiếp theo</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="min-w-[80px] bg-white border border-gray-200 rounded-lg px-3 py-1.5 font-mono text-sm font-black text-primary shadow-inner text-center">{navNextShortcut}</div>
                                                <ShortcutRecorder onRecord={setNavNextShortcut} current={navNextShortcut} onSave={handleGlobalSave} />
                                            </div>
                                        </div>
                                        <div className="pl-8 text-[11px] font-bold text-gray-500 leading-relaxed border-l border-gray-100 h-full flex items-center">
                                            Chuyển sang Tab bên phải.
                                        </div>
                                    </div>

                                    {/* Action 5: Mouse Navigation */}
                                    <div className="grid grid-cols-[1fr_1fr] items-center px-6 py-4 hover:bg-gray-50/50 transition-colors">
                                        <div className="flex items-center justify-between pr-8">
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-black text-gray-800 uppercase leading-none">History Nav (Mouse)</span>
                                                <span className="text-[8px] text-gray-400 font-bold uppercase mt-1">Lịch sử điều hướng</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 font-mono text-[10px] font-black text-gray-400 opacity-60">MOUSE BTN 3/4</div>
                                            </div>
                                        </div>
                                        <div className="pl-8 text-[11px] font-bold text-gray-500 leading-relaxed border-l border-gray-100 h-full flex items-center">
                                            Dùng nút Back/Forward trên chuột để quay lại Tab trước đó.
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* APPEARANCE */}
                    {activeSection === 'appearance' && (
                        <div className="flex flex-col animate-in fade-in slide-in-from-bottom-2">
                            <SectionHeader title="Aesthetics & UI" subtitle="Global Visual Theme" icon="🎨" />
                            <div className="grid grid-cols-[1fr_320px] gap-8">
                                <div className="bg-gray-50/50 p-8 rounded-3xl border border-gray-100 h-fit flex flex-col gap-6">
                                    <div className="flex flex-col gap-4">
                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Excel Header Theme</label>
                                        <div className="flex gap-4 items-center bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                                            <input type="color" value={excelHeaderColor} onChange={e => setExcelHeaderColor(e.target.value)} onBlur={handleGlobalSave} className="w-16 h-16 rounded-xl cursor-pointer border-none p-0.5 bg-gray-100" />
                                            <div className="flex-1">
                                                <input type="text" value={excelHeaderColor} onChange={e => setExcelHeaderColor(e.target.value)} onBlur={handleGlobalSave} className="w-full bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 font-mono text-base font-black uppercase tracking-widest outline-none focus:ring-1 focus:ring-primary" />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="border-t border-gray-100 pt-6">
                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-4 block">Interactive Behavior</label>
                                        <SettingToggle
                                            label="Highlight On Copy"
                                            desc="Nháy sáng nội dung vừa copy"
                                            tooltip="Khi bạn click copy một dòng, phần text đó sẽ tự động nháy sáng trong 5s để bạn dễ nhận biết vị trí."
                                            checked={uiHighlightCopied}
                                            onChange={(val) => { setUiHighlightCopied(val); handleGlobalSave(); }}
                                        />
                                    </div>
                                </div>
                                <div className="p-8 bg-gray-900 rounded-[2.5rem] flex items-center justify-center">
                                    <div className="w-full border border-white/10 rounded-sm overflow-hidden scale-110">
                                        <div className="px-3 py-1.5 text-[8px] font-black text-white text-center border-b border-white/10 uppercase tracking-widest" style={{ backgroundColor: excelHeaderColor }}>TABLE_HEADER</div>
                                        <div className="px-3 py-3 text-[8px] bg-white text-center font-black text-gray-900 border-b border-gray-50">RECORD</div>
                                        <div className="px-3 py-3 text-[8px] bg-gray-50 text-center font-bold text-gray-200">...</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* JAVA PARSER */}
                    {activeSection === 'javaParser' && (
                        <div className="flex flex-col animate-in fade-in slide-in-from-bottom-2">
                            <SectionHeader title="Java Parser Config" subtitle="Cài đặt cho tính năng phân tích và vẽ sơ đồ Java" icon="☕" />

                            <div className="flex flex-col gap-8 max-w-4xl">
                                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col gap-4">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Generative AI Configuration</label>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-[10px] font-bold text-gray-700">Gemini API Key</label>
                                        <input
                                            type="password"
                                            value={geminiApiKey}
                                            onChange={e => setGeminiApiKey(e.target.value)}
                                            onBlur={handleGlobalSave}
                                            placeholder="Enter your Google Gemini API Key"
                                            className="w-full bg-gray-50 border border-gray-100 rounded-lg px-4 py-3 font-mono text-sm font-black tracking-widest outline-none focus:ring-2 focus:ring-primary transition-all"
                                        />
                                        <span className="text-[10px] text-gray-400 font-bold mt-1">Sử dụng để tự động vẽ sơ đồ Mermaid từ source code Java thông qua AI.</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TRANSLATE FEATURE CONFIG */}
                    {activeSection === 'translate' && (
                        <div className="flex flex-col animate-in fade-in slide-in-from-bottom-2 max-w-5xl">
                            <SectionHeader title="Cấu hình Dịch thuật" subtitle="Cài đặt chi tiết cho tab Quick Translate & Dictionary" icon="🇯🇵" />

                            <div className="flex flex-col gap-8">
                                {/* Dictionary Path Section */}
                                <div className="bg-indigo-50/30 p-6 rounded-3xl border border-indigo-100 shadow-inner">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-8 h-8 bg-indigo-600 text-white rounded-xl flex items-center justify-center text-sm shadow-lg">📂</div>
                                        <div>
                                            <h4 className="text-xs font-black text-indigo-900 uppercase tracking-wider">Nguồn dữ liệu Từ điển</h4>
                                            <p className="text-[9px] text-indigo-400 font-bold uppercase">Excel Database (.xlsx)</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-3">
                                        <input
                                            type="text"
                                            value={translateFilePath}
                                            onChange={e => setTranslateFilePath(e.target.value)}
                                            onBlur={handleGlobalSave}
                                            className="flex-1 bg-white border border-indigo-200 rounded-2xl px-5 py-3 text-xs font-mono shadow-sm outline-none focus:ring-2 focus:ring-indigo-500"
                                            placeholder="Đường dẫn đến file excel..."
                                        />
                                        <button
                                            onClick={async () => {
                                                const selected = await openDialog({ filters: [{ name: 'Excel', extensions: ['xlsx'] }] });
                                                if (selected && typeof selected === 'string') { setTranslateFilePath(selected); setTimeout(handleGlobalSave, 100); }
                                            }}
                                            className="px-8 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all active:scale-95"
                                        >
                                            BROWSE
                                        </button>
                                    </div>
                                </div>

                                {/* Detailed Settings Grid */}
                                <div className="grid grid-cols-1 gap-4">
                                    <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
                                        <div className="grid grid-cols-[1fr_1fr] bg-gray-50 border-b border-gray-100 px-6 py-3">
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tính năng / Tùy chọn</span>
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-4 border-l border-gray-200">Giải thích chức năng</span>
                                        </div>

                                        <div className="divide-y divide-gray-50">
                                            {/* Item 1 */}
                                            <div className="grid grid-cols-[1fr_1fr] items-center px-6 py-4 hover:bg-gray-50/50 transition-colors">
                                                <SettingToggle
                                                    label="Remove Spaces"
                                                    desc="Normalize whitespace"
                                                    tooltip="Xóa bỏ toàn bộ khoảng trắng thừa và các dòng trống trong nội dung đầu vào."
                                                    checked={formatRemoveSpaces}
                                                    onChange={setFormatRemoveSpaces}
                                                />
                                                <div className="pl-8 text-[11px] font-bold text-gray-500 leading-relaxed border-l border-gray-100 h-full flex items-center">
                                                    Xóa khoảng trắng thừa và dòng trống.
                                                </div>
                                            </div>

                                            {/* Item 2 */}
                                            <div className="grid grid-cols-[1fr_1fr] items-center px-6 py-4 hover:bg-gray-50/50 transition-colors">
                                                <SettingToggle
                                                    label="SQL.append format"
                                                    desc="Java/C# Code Extraction"
                                                    tooltip="Tự động bóc tách nội dung bên trong các hàm sql.append(...) của Java hoặc C#."
                                                    checked={formatSqlAppend}
                                                    onChange={setFormatSqlAppend}
                                                />
                                                <div className="pl-8 text-[11px] font-bold text-gray-500 leading-relaxed border-l border-gray-100 h-full flex items-center">
                                                    Loại bỏ `sql.append("...")` để lấy ruột SQL.
                                                </div>
                                            </div>

                                            {/* Item 3 */}
                                            <div className="grid grid-cols-[1fr_1fr] items-center px-6 py-4 hover:bg-gray-50/50 transition-colors">
                                                <SettingToggle
                                                    label="Strict Search"
                                                    desc="Exact phrase matching"
                                                    tooltip="Khi bật, hệ thống chỉ trả về các kết quả khớp hoàn toàn 100% với từ khóa tìm kiếm."
                                                    checked={searchStrict}
                                                    onChange={setSearchStrict}
                                                />
                                                <div className="pl-8 text-[11px] font-bold text-gray-500 leading-relaxed border-l border-gray-100 h-full flex items-center">
                                                    Tìm chính xác 100% (không tìm mờ).
                                                </div>
                                            </div>

                                            {/* Item 4 */}
                                            <div className="grid grid-cols-[1fr_1fr] items-center px-6 py-4 hover:bg-gray-50/50 transition-colors border-b border-gray-50/50">
                                                <SettingToggle
                                                    label="Remove Duplicate"
                                                    desc="Xóa dòng trùng lặp"
                                                    tooltip="Tự động loại bỏ các dòng kết quả giống hệt nhau để danh sách gọn gàng hơn."
                                                    checked={translateTruncateDuplicate}
                                                    onChange={setTranslateTruncateDuplicate}
                                                />
                                                <div className="pl-8 text-[11px] font-bold text-gray-500 leading-relaxed border-l border-gray-100 h-full flex items-center">
                                                    Xóa các dòng kết quả bị trùng lặp.
                                                </div>
                                            </div>

                                            {/* Item 4b */}
                                            <div className="grid grid-cols-[1fr_1fr] items-center px-6 py-4 hover:bg-gray-50/50 transition-colors">
                                                <SettingToggle
                                                    label="Strict Translate"
                                                    desc="Exact phrase matching only"
                                                    tooltip="Khi bật, hệ thống chỉ dịch những cụm từ khớp chính xác hoàn toàn, không gợi ý cắt từ nhỏ hơn."
                                                    checked={translateStrict}
                                                    onChange={setTranslateStrict}
                                                />
                                                <div className="pl-8 text-[11px] font-bold text-gray-500 leading-relaxed border-l border-gray-100 h-full flex items-center">
                                                    Chỉ dịch nếu tìm thấy chính xác 100%, không break từ.
                                                </div>
                                            </div>

                                            {/* Item 5: Line Height */}
                                            <div className="grid grid-cols-[1fr_1fr] items-center px-6 py-4 hover:bg-gray-50/50 transition-colors border-b border-gray-50/50">
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-[11px] font-black text-gray-800 uppercase tracking-tight leading-none">Line Height</span>
                                                    <span className="text-[8px] text-gray-400 font-bold uppercase mt-1 leading-tight">Khoảng cách dòng (Quick Translate)</span>
                                                    <div className="flex items-center mt-2 bg-gray-50 rounded-lg border border-gray-200 overflow-hidden w-fit">
                                                        <button
                                                            onClick={() => { const val = Math.max(1, translateLineHeight - 0.2); setTranslateLineHeight(val); handleGlobalSave(); }}
                                                            className="px-3 py-1 hover:bg-white text-primary font-bold border-r border-gray-200 transition-colors"
                                                        >
                                                            −
                                                        </button>
                                                        <span className="px-4 py-1 text-[11px] font-black text-gray-900 min-w-[3.5rem] text-center bg-white">
                                                            {translateLineHeight.toFixed(1)}
                                                        </span>
                                                        <button
                                                            onClick={() => { const val = Math.min(4, translateLineHeight + 0.2); setTranslateLineHeight(val); handleGlobalSave(); }}
                                                            className="px-3 py-1 hover:bg-white text-primary font-bold border-l border-gray-200 transition-colors"
                                                        >
                                                            +
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="pl-8 text-[11px] font-bold text-gray-500 leading-relaxed border-l border-gray-100 h-full flex items-center">
                                                    Điều chỉnh độ giãn dòng để dễ quan sát văn bản hơn.
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Sanitize Box */}
                                    <div className="bg-amber-50/50 p-6 rounded-3xl border border-amber-100 mb-6">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="w-8 h-8 bg-amber-500 text-white rounded-xl flex items-center justify-center text-sm shadow-lg">✂️</div>
                                            <div>
                                                <h4 className="text-xs font-black text-amber-900 uppercase tracking-wider">Ký tự cần loại bỏ (Sanitize)</h4>
                                                <p className="text-[9px] text-amber-500 font-bold uppercase">Xóa ký tự thừa khi nhấn FORMAT</p>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-[1fr_1fr] gap-8">
                                            <input
                                                type="text"
                                                value={translateDeleteChars}
                                                onChange={e => setTranslateDeleteChars(e.target.value)}
                                                onBlur={handleGlobalSave}
                                                className="w-full bg-white border border-amber-200 rounded-2xl px-5 py-3 text-xs font-mono shadow-sm outline-none focus:ring-2 focus:ring-amber-500"
                                                placeholder="vd: ' | , | ; ..."
                                            />
                                            <div className="text-[11px] font-bold text-amber-700/60 leading-relaxed flex items-center italic">
                                                Xóa các ký tự thừa trong input khi bấm Format (Dùng dấu | để ngăn cách).
                                            </div>
                                        </div>
                                    </div>

                                    {/* Ignore Words Box */}
                                    <div className="bg-rose-50/50 p-6 rounded-3xl border border-rose-100">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="w-8 h-8 bg-rose-500 text-white rounded-xl flex items-center justify-center text-sm shadow-lg">🚫</div>
                                            <div>
                                                <h4 className="text-xs font-black text-rose-900 uppercase tracking-wider">Bỏ qua từ không dịch (Ignore)</h4>
                                                <p className="text-[9px] text-rose-500 font-bold uppercase">Giữ nguyên các từ này khi dịch nhanh</p>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-[1fr_1fr] gap-8">
                                            <textarea
                                                value={translateIgnoreWords}
                                                onChange={e => setTranslateIgnoreWords(e.target.value)}
                                                onBlur={handleGlobalSave}
                                                rows={3}
                                                className="w-full bg-white border border-rose-200 rounded-2xl px-5 py-3 font-mono text-[10px] shadow-sm outline-none resize-none focus:ring-2 focus:ring-rose-500"
                                                placeholder="vd: USER_ID, ORDER_DATE hoặc viết mỗi dòng một từ..."
                                            />
                                            <div className="text-[11px] font-bold text-rose-700/60 leading-relaxed flex items-center italic">
                                                Các từ trong danh sách này sẽ không được highlight và dịch (Phân cách bằng dấu phẩy hoặc xuống dòng).
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* REVERTTK FEATURE CONFIG */}
                    {activeSection === 'revertTK' && (
                        <div className="flex flex-col animate-in fade-in slide-in-from-bottom-2 max-w-5xl">
                            <SectionHeader title="Cấu hình Revert TK" subtitle="Bộ máy phân tách nội dung đặc thù cho tab Revert TK" icon="🧩" />
                            <div className="flex flex-col gap-6">
                                <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
                                    <div className="grid grid-cols-[1fr_1fr] bg-gray-50 border-b border-gray-100 px-6 py-3">
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tính năng / Tùy chọn</span>
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-4 border-l border-gray-200">Giải thích chức năng</span>
                                    </div>

                                    <div className="divide-y divide-gray-50">
                                        <div className="grid grid-cols-[1fr_1fr] items-center px-6 py-4 hover:bg-gray-50/50 transition-colors">
                                            <SettingToggle label="Active Segments" desc="Boundary detection" checked={columnSplitEnabled} onChange={setColumnSplitEnabled} />
                                            <div className="pl-8 text-[11px] font-bold text-gray-500 leading-relaxed border-l border-gray-100 h-full flex items-center">
                                                Tự động tìm và tách ranh giới các cột dữ liệu.
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-[1fr_1fr] items-center px-6 py-4 hover:bg-gray-50/50 transition-colors">
                                            <SettingToggle label="Apply to Text" desc="Text output split" checked={columnSplitApplyToText} onChange={setColumnSplitApplyToText} />
                                            <div className="pl-8 text-[11px] font-bold text-gray-500 leading-relaxed border-l border-gray-100 h-full flex items-center">
                                                Tự động tách cột khi xem kết quả dạng Text.
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-[1fr_1fr] items-center px-6 py-4 hover:bg-gray-50/50 transition-colors">
                                            <SettingToggle label="Apply to Table" desc="Table output split" checked={columnSplitApplyToTable} onChange={setColumnSplitApplyToTable} />
                                            <div className="pl-8 text-[11px] font-bold text-gray-500 leading-relaxed border-l border-gray-100 h-full flex items-center">
                                                Tự động tách cột khi xem kết quả dạng Table.
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div className="bg-amber-50/50 p-6 rounded-3xl border border-amber-100">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="w-8 h-8 bg-amber-500 text-white rounded-xl flex items-center justify-center text-sm shadow-lg">✂️</div>
                                            <h4 className="text-xs font-black text-amber-900 uppercase tracking-wider">Loại bỏ ký tự thừa</h4>
                                        </div>
                                        <div className="flex flex-col gap-4">
                                            <input type="text" value={revertTKDeleteChars} onChange={e => setRevertTKDeleteChars(e.target.value)} onBlur={handleGlobalSave} className="w-full bg-white border border-amber-200 rounded-2xl px-5 py-3 text-xs font-mono shadow-sm outline-none" placeholder="vd: ' | , | ; ..." />
                                            <div className="text-[10px] font-bold text-amber-700/60 leading-relaxed italic">
                                                Xóa ký tự thừa khi xử lý dữ liệu Revert TK (Dùng dấu | để ngăn cách).
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-indigo-50/50 p-6 rounded-3xl border border-indigo-100">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="w-8 h-8 bg-indigo-500 text-white rounded-xl flex items-center justify-center text-sm shadow-lg">🔗</div>
                                            <h4 className="text-xs font-black text-indigo-900 uppercase tracking-wider">Từ khóa chia tách (Tokens)</h4>
                                        </div>
                                        <div className="flex flex-col gap-4">
                                            <textarea value={columnSplitKeywords} onChange={e => setColumnSplitKeywords(e.target.value)} onBlur={handleGlobalSave} rows={4} className="w-full bg-white border border-indigo-200 rounded-2xl px-5 py-3 font-mono text-[10px] shadow-sm outline-none resize-none" placeholder="AS | . | WHERE..." />
                                            <div className="text-[10px] font-bold text-indigo-700/60 leading-relaxed italic">
                                                Dùng để xác định vị trí cắt và chia cột (Dùng dấu | để ngăn cách).
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Header Mapping Settings */}
                            <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
                                <div className="flex items-center gap-3 bg-gray-50 border-b border-gray-100 px-6 py-4">
                                    <div className="w-8 h-8 bg-emerald-500 text-white rounded-xl flex items-center justify-center text-sm shadow-lg">🏷️</div>
                                    <div>
                                        <h4 className="text-xs font-black text-emerald-900 uppercase tracking-wider">Từ khóa hiển thị / Xuống dòng</h4>
                                        <p className="text-[9px] text-emerald-600 font-bold uppercase">Ánh xạ từ khóa SQL sang tiêu đề hiển thị</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-6">
                                    <button
                                        onClick={() => { addRevertRule(); setTimeout(handleGlobalSave, 100); }}
                                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black uppercase rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-2"
                                    >
                                        <span>+ Add Rule</span>
                                    </button>
                                </div>

                                <div className="p-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                        {revertRules.map((rule) => (
                                            <div key={rule.id} className="flex flex-col gap-3 p-4 bg-white border border-emerald-50 rounded-2xl shadow-sm hover:shadow-md transition-all group/item relative">
                                                <div className="flex justify-between items-center">
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="text"
                                                            value={rule.keyword}
                                                            onChange={e => updateRevertRule(rule.id, { keyword: e.target.value })}
                                                            onBlur={handleGlobalSave}
                                                            className="text-[10px] font-black text-emerald-800 uppercase tracking-widest bg-transparent border-b border-emerald-100 focus:border-emerald-500 outline-none w-full"
                                                            placeholder="KEYWORD"
                                                        />
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <label className="flex items-center gap-1.5 cursor-pointer group/br" title="Insert line break before this keyword">
                                                            <span className="text-[8px] font-black text-gray-300 group-hover/br:text-emerald-500 transition-colors uppercase tracking-tighter">BR</span>
                                                            <div className="relative inline-flex items-center">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={rule.lineBreak}
                                                                    onChange={e => { updateRevertRule(rule.id, { lineBreak: e.target.checked }); setTimeout(handleGlobalSave, 100); }}
                                                                    className="sr-only peer"
                                                                />
                                                                <div className="w-7 h-4 bg-gray-100 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500 shadow-inner"></div>
                                                            </div>
                                                        </label>

                                                        {rule.isDefault ? (
                                                            <button
                                                                onClick={() => { resetRevertRule(rule.id); setTimeout(handleGlobalSave, 100); }}
                                                                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-emerald-50 text-emerald-300 hover:text-emerald-600 transition-colors"
                                                                title="Reset to default"
                                                            >
                                                                🔄
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => { removeRevertRule(rule.id); setTimeout(handleGlobalSave, 100); }}
                                                                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-50 text-red-300 hover:text-red-600 transition-colors"
                                                                title="Delete rule"
                                                            >
                                                                🗑️
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <input
                                                    type="text"
                                                    value={rule.header}
                                                    onChange={e => updateRevertRule(rule.id, { header: e.target.value })}
                                                    onBlur={handleGlobalSave}
                                                    className="bg-gray-50/50 border border-emerald-100 rounded-xl px-4 py-2 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-mono placeholder:text-gray-300"
                                                    placeholder={`Display header...`}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 text-[10px] font-semibold text-gray-500 italic">
                                    Lưu ý: Bạn có thể nhập bất kỳ chuỗi nào (như "LỰA CHỌN CỘT", "■ 抽出項目") hoặc để trống nếu bạn muốn bỏ qua. Hệ thống sẽ tự động ghép với nội dung SQL parse được.
                                </div>
                            </div>
                        </div>
                    )}
                    {/* COMPARE FEATURE CONFIG */}
                    {activeSection === 'compare' && (
                        <div className="flex flex-col animate-in fade-in slide-in-from-bottom-2 max-w-5xl">
                            <SectionHeader title="Text Compare" subtitle="Cài đặt cho tính năng So sánh văn bản" icon="🔍" />

                            <div className="flex flex-col gap-10">
                                {/* SECTION 1: DATABASE / LAB */}
                                <div className="flex flex-col gap-4">
                                    <div className="flex items-center gap-3 ml-2">
                                        <span className="w-6 h-6 bg-orange-500 text-white rounded-lg flex items-center justify-center text-[10px] shadow-sm">📊</span>
                                        <h3 className="text-xs font-black text-gray-800 uppercase tracking-widest">So sánh Database (Lab Tab)</h3>
                                    </div>

                                    <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
                                        <div className="divide-y divide-gray-50 text-[11px] font-bold">
                                            <div className="grid grid-cols-[1fr_1fr] items-center px-6 py-4 hover:bg-gray-50/50 transition-colors">
                                                <div className="flex flex-col gap-2">
                                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Màu tiêu đề bảng</label>
                                                    <div className="flex gap-3 items-center">
                                                        <input type="color" value={excelHeaderColor} onChange={e => setExcelHeaderColor(e.target.value)} onBlur={handleGlobalSave} className="w-8 h-8 rounded-lg cursor-pointer border-none p-0.5 bg-gray-100" />
                                                        <input type="text" value={excelHeaderColor} onChange={e => setExcelHeaderColor(e.target.value)} onBlur={handleGlobalSave} className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-mono outline-none" />
                                                    </div>
                                                </div>
                                                <div className="pl-8 text-gray-500 leading-relaxed border-l border-gray-100 h-full flex items-center italic">
                                                    Tùy chỉnh màu sắc nổi bật cho thanh Header của bảng dữ liệu.
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* SECTION 2: TEXT COMPARE */}
                                <div className="flex flex-col gap-4">
                                    <div className="flex items-center gap-3 ml-2">
                                        <span className="w-6 h-6 bg-rose-600 text-white rounded-lg flex items-center justify-center text-[10px] shadow-sm">📝</span>
                                        <h3 className="text-xs font-black text-gray-800 uppercase tracking-widest">So sánh văn bản (Text Compare)</h3>
                                    </div>

                                    <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
                                        <div className="grid grid-cols-[1fr_1fr] bg-gray-50 border-b border-gray-100 px-6 py-3">
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Cài đặt chính</span>
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-4 border-l border-gray-200">Xử lý (Pre-processing)</span>
                                        </div>

                                        <div className="grid grid-cols-2 divide-x divide-gray-100">
                                            {/* Main Settings */}
                                            <div className="p-4 flex flex-col gap-2">
                                                <SettingToggle label="Ordered Comparison" desc="So sánh theo thứ tự dòng" tooltip="So sánh từng dòng tương ứng giữa hai bên A và B theo số thứ tự." checked={textCompareOrdered} onChange={setTextCompareOrdered} />
                                                <SettingToggle label="Ignore Case" desc="Không phân biệt hoa thường" tooltip="Bỏ qua sự khác biệt giữa chữ hoa và chữ thường khi so sánh." checked={textCompareIgnoreCase} onChange={setTextCompareIgnoreCase} />
                                                <SettingToggle label="Trim Whitespace" desc="Xóa khoảng trắng đầu cuối" tooltip="Tự động cắt bỏ các ký tự khoảng trắng ở đầu và cuối mỗi dòng trước khi so sánh." checked={textCompareTrimWhitespace} onChange={setTextCompareTrimWhitespace} />
                                                <SettingToggle label="Auto-Compare" desc="Tự động so sánh khi nhập" tooltip="Tự động thực hiện so sánh ngay khi bạn đang nhập hoặc dán văn bản vào." checked={textCompareAutoCompare} onChange={setTextCompareAutoCompare} />
                                                <SettingToggle label="Sort Text" desc="Ưu tiên sắp xếp dòng giống nhau" tooltip="Sắp xếp lại văn bản ở cả hai bên để các dòng giống nhau nằm cạnh nhau, giúp dễ so sánh hơn." checked={textCompareSort} onChange={setTextCompareSort} />
                                                <div className="flex flex-col gap-2 pt-2 border-t border-gray-100 italic">
                                                    <div className="flex flex-col gap-1">
                                                        <label className="text-[9px] font-black text-rose-900 uppercase tracking-widest">Tên đại diện Side A</label>
                                                        <input
                                                            type="text"
                                                            value={textCompareSideAName}
                                                            onChange={e => setTextCompareSideAName(e.target.value)}
                                                            onBlur={handleGlobalSave}
                                                            className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-mono outline-none focus:ring-2 focus:ring-rose-500"
                                                            placeholder="Mặc định: Side A"
                                                        />
                                                    </div>
                                                    <div className="flex flex-col gap-1">
                                                        <label className="text-[9px] font-black text-rose-900 uppercase tracking-widest">Tên đại diện Side B</label>
                                                        <input
                                                            type="text"
                                                            value={textCompareSideBName}
                                                            onChange={e => setTextCompareSideBName(e.target.value)}
                                                            onBlur={handleGlobalSave}
                                                            className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-mono outline-none focus:ring-2 focus:ring-rose-500"
                                                            placeholder="Mặc định: Side B"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Pre-processing Settings */}
                                            <div className="p-4 flex flex-col gap-4 bg-gray-50/30">
                                                <SettingToggle label="SQL.append format" desc="Loại bỏ sql.append" tooltip="Tương tự Translate tab, bóc tách SQL từ code Java/C#." checked={textCompareRemoveAppend} onChange={setTextCompareRemoveAppend} />
                                                <SettingToggle label="Remove Duplicate" desc="Gộp dòng trùng lặp" tooltip="Loại bỏ các dòng bị lặp lại trong cùng một bên dữ liệu." checked={textCompareTruncateDuplicate} onChange={setTextCompareTruncateDuplicate} />
                                                <SettingToggle label="Remove Empty Lines" desc="Xóa các dòng trống" tooltip="Tự động xóa bỏ các dòng không có nội dung hoặc chỉ chứa bộ khoảng trắng." checked={textCompareRemoveEmptyLines} onChange={setTextCompareRemoveEmptyLines} />

                                                <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
                                                    <label className="text-[9px] font-black text-rose-900 uppercase tracking-widest">Xóa ký tự nhiễu (Regex)</label>
                                                    <input
                                                        type="text"
                                                        value={textCompareDeleteChars}
                                                        onChange={e => setTextCompareDeleteChars(e.target.value)}
                                                        onBlur={handleGlobalSave}
                                                        className="w-full bg-white border border-rose-200 rounded-xl px-4 py-2 text-xs font-mono shadow-sm outline-none focus:ring-1 focus:ring-rose-500"
                                                        placeholder="vd: , ; ) ..."
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* JAVA PARSER FEATURE CONFIG */}
                    {activeSection === 'javaParser' && (
                        <div className="flex flex-col animate-in fade-in slide-in-from-bottom-2 max-w-5xl">
                            <SectionHeader title="Java Parser" subtitle="Cài đặt tự động phân tích mã nguồn" icon="☕" />

                            <div className="flex flex-col gap-10">
                                <div className="flex flex-col gap-4">
                                    <div className="flex items-center gap-3 ml-2">
                                        <span className="w-6 h-6 bg-emerald-500 text-white rounded-lg flex items-center justify-center text-[10px] shadow-sm">⚡</span>
                                        <h3 className="text-xs font-black text-gray-800 uppercase tracking-widest">Tùy chọn trích xuất (Extraction)</h3>
                                    </div>

                                    <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm p-5">
                                        <SettingToggle
                                            label="Auto Analyze"
                                            desc="Ngay lập tức hiển thị Extracted Properties mỗi khi nội dung mã nguồn được cập nhật."
                                            checked={javaParserAutoAnalyze}
                                            onChange={setJavaParserAutoAnalyze}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

export default SettingsTab;

import { useEffect } from 'react';
import { useAppStore } from './store/useAppStore';
import { ParamsTab } from './components/ParamsTab';
import { JavaParserTab } from './components/JavaParserTab';
import { SettingsTab } from './components/SettingsTab';
import { CompareSuiteTab } from './components/CompareSuiteTab';
import { clsx } from 'clsx';
import { invoke } from '@tauri-apps/api/tauri';

import { TranslateTab } from './components/TranslateTab';

function App() {
    const { activeTab, setActiveTab } = useAppStore();

    useEffect(() => {
        const init = async () => {
            try {
                // Set title based on environment
                if (import.meta.env.DEV) {
                    document.title = "DEV MODE - SQL Helper";
                } else {
                    document.title = "SQL Helper";
                }

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
                    if (settings.excel_header_color) store.setExcelHeaderColor(settings.excel_header_color);
                    if (settings.run_shortcut) store.setRunShortcut(settings.run_shortcut);
                }
            } catch (err) {
                console.error('Failed to load DB settings:', err);
            }
        };
        init();
    }, []);

    return (
        <div className="flex flex-col min-h-screen bg-bg font-sans">
            <header className="bg-gradient-to-br from-primary to-secondary text-white p-5 text-center shadow-md">
                <h1 className="text-2xl font-bold">
                    {import.meta.env.DEV ? "DEV MODE - SQL Helper" : "SQL Helper"}
                </h1>
            </header>

            <div className="flex justify-center border-b border-gray-200 bg-white sticky top-0 z-[100] shadow-sm">
                {(['params', 'compare-suite', 'translate', 'java-parser', 'settings'] as const).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={clsx(
                            'px-6 py-4 font-bold text-sm transition-all border-b-4 outline-none capitalize flex items-center gap-2',
                            activeTab === tab
                                ? 'text-primary border-primary bg-primary/5'
                                : 'text-gray-400 border-transparent hover:text-gray-600 hover:bg-gray-50'
                        )}
                    >
                        {tab === 'params' && <><span>📝</span> Parameter Replacement</>}
                        {tab === 'compare-suite' && <><span>📊</span> Compare</>}
                        {tab === 'translate' && <><span>🇯🇵</span> Translate</>}
                        {tab === 'java-parser' && <><span>☕</span> Java Parser</>}
                        {tab === 'settings' && <><span>⚙️</span> Settings</>}
                    </button>
                ))}
            </div>

            <main className="flex-1 container mx-auto max-w-full px-5">
                <div className={clsx(activeTab !== 'params' && 'hidden')}>
                    <ParamsTab />
                </div>
                <div className={clsx(activeTab !== 'lab' && activeTab !== 'compare' && activeTab !== 'text-compare' && activeTab !== 'generate' && activeTab !== 'compare-suite' && 'hidden')}>
                    <CompareSuiteTab />
                </div>
                <div className={clsx(activeTab !== 'translate' && 'hidden')}>
                    <TranslateTab />
                </div>
                <div className={clsx(activeTab !== 'java-parser' && 'hidden')}>
                    <JavaParserTab />
                </div>
                <div className={clsx(activeTab !== 'settings' && 'hidden')}>
                    <SettingsTab />
                </div>
            </main>
        </div>
    );
}

export default App;

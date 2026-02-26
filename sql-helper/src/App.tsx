import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from './store/useAppStore';
import { clsx } from 'clsx';
import { invoke } from '@tauri-apps/api/tauri';
import { useRef, Suspense, lazy, useDeferredValue } from 'react';
import { HighlightText } from './utils/uiHelpers';

// Lazy load heavy components for faster initial load
const ParamsTab = lazy(() => import('./components/ParamsTab'));
const JavaParserTab = lazy(() => import('./components/JavaParserTab'));
const SettingsTab = lazy(() => import('./components/SettingsTab'));
const CompareSuiteTab = lazy(() => import('./components/CompareSuiteTab'));
const TranslateTab = lazy(() => import('./components/TranslateTab'));

const TABS_CONFIG = [
    // Main Tabs
    { id: 'params', label: '📝 Parameter Replacement', keywords: ['param', 'replacement', 'query', 'sql', '📝'], type: 'main' },
    { id: 'compare-suite', label: '📊 Compare Suite', keywords: ['compare', 'database', 'suite', '📊'], type: 'main' },
    { id: 'translate', label: '🇯🇵 Translate', keywords: ['translate', 'jap', 'jp', '🇯🇵'], type: 'main' },
    { id: 'revert-tk', label: '🔄 Revert TK', keywords: ['revert', 'tk', 'code', 'converter', '🔄'], type: 'main' },
    { id: 'java-parser', label: '☕ Java Parser', keywords: ['java', 'parser', 'class', 'dto', '☕'], type: 'main' },
    { id: 'settings', label: '⚙️ Settings', keywords: ['settings', 'config', 'setup', 'database connection', '⚙️'], type: 'main' },

    // Sub Tabs for Compare
    { id: 'compare-data', label: '📊 Compare Data (Lab)', keywords: ['compare', 'data', 'lab', 'database', 'sql', '📊'], type: 'sub', parent: 'compare-suite', subId: 'data' },
    { id: 'compare-schema', label: '🔍 Schema Comparator', keywords: ['compare', 'schema', 'table', 'structure', 'database', '🔍'], type: 'sub', parent: 'compare-suite', subId: 'schema' },
    { id: 'compare-text', label: '📝 Text Compare', keywords: ['compare', 'text', 'diff', 'string', '📝'], type: 'sub', parent: 'compare-suite', subId: 'text' },
    { id: 'compare-generate', label: '⚡ Generate SELECT', keywords: ['compare', 'generate', 'select', 'sql', '⚡'], type: 'sub', parent: 'compare-suite', subId: 'generate' },

    // Sub Tabs for Translate
    { id: 'translate-dictionary', label: '📖 Dictionary', keywords: ['translate', 'dictionary', 'search', 'words', '📖'], type: 'sub', parent: 'translate', subId: 'dictionary' },
    { id: 'translate-quick', label: '⚡ Quick Translate', keywords: ['translate', 'quick', 'fast', 'bulk', '⚡'], type: 'sub', parent: 'translate', subId: 'quick' },
];

function App() {
    const {
        activeTab, setActiveTab,
        globalSearchTerm, setGlobalSearchTerm,
        translateSubTab, setTranslateSubTab,
        compareSubTab, setCompareSubTab
    } = useAppStore(useShallow(state => ({
        activeTab: state.activeTab,
        setActiveTab: state.setActiveTab,
        globalSearchTerm: state.globalSearchTerm,
        setGlobalSearchTerm: state.setGlobalSearchTerm,
        translateSubTab: state.translateSubTab,
        setTranslateSubTab: state.setTranslateSubTab,
        compareSubTab: state.compareSubTab,
        setCompareSubTab: state.setCompareSubTab
    })));

    const searchInputRef = useRef<HTMLInputElement>(null);
    const navHistory = useRef<{ tab: string, tSub?: string, cSub?: string }[]>([]);
    const hIdx = useRef(-1);
    const isInternalNav = useRef(false);
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [selectedSugIdx, setSelectedSugIdx] = useState(-1);
    const lastSearchKeyTime = useRef(0);
    const deferredGlobalSearchTerm = useDeferredValue(globalSearchTerm);

    const handleTabJump = (sug: any) => {
        setActiveTab(sug.jumpTab || sug.parent || sug.id);
        if (sug.tSub) setTranslateSubTab(sug.tSub);
        if (sug.cSub) setCompareSubTab(sug.cSub);
        if (sug.settingsSection) useAppStore.getState().setSettingsSection(sug.settingsSection);

        if (sug.type?.startsWith('tab')) {
            setGlobalSearchTerm('');
        }
        setSuggestions([]);
        setSelectedSugIdx(-1);
    };

    // Track state changes and push to history
    useEffect(() => {
        if (isInternalNav.current) {
            isInternalNav.current = false;
            return;
        }

        const currentState = { tab: activeTab, tSub: translateSubTab, cSub: compareSubTab };
        const last = navHistory.current[hIdx.current];

        // Only push if something actually changed
        if (!last || last.tab !== activeTab || last.tSub !== translateSubTab || last.cSub !== compareSubTab) {
            // Truncate forward history and push new state
            navHistory.current = navHistory.current.slice(0, hIdx.current + 1);
            navHistory.current.push(currentState);
            hIdx.current = navHistory.current.length - 1;
        }
    }, [activeTab, translateSubTab, compareSubTab]);

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
                    if (settings.focus_search_shortcut) store.setFocusSearchShortcut(settings.focus_search_shortcut);

                    if (settings.text_compare_delete_chars) store.setTextCompareDeleteChars(settings.text_compare_delete_chars);
                    if (settings.text_compare_remove_append !== undefined) store.setTextCompareRemoveAppend(settings.text_compare_remove_append);
                    if (settings.text_compare_truncate_duplicate !== undefined) store.setTextCompareTruncateDuplicate(settings.text_compare_truncate_duplicate);
                    if (settings.text_compare_sort !== undefined) store.setTextCompareSort(settings.text_compare_sort);
                    if (settings.text_compare_ordered !== undefined) store.setTextCompareOrdered(settings.text_compare_ordered);
                    if (settings.text_compare_ignore_case !== undefined) store.setTextCompareIgnoreCase(settings.text_compare_ignore_case);
                    if (settings.text_compare_trim_whitespace !== undefined) store.setTextCompareTrimWhitespace(settings.text_compare_trim_whitespace);
                    if (settings.text_compare_auto_compare !== undefined) store.setTextCompareAutoCompare(settings.text_compare_auto_compare);

                    if (settings.translate_strict !== undefined) store.setTranslateStrict(settings.translate_strict);
                    if (settings.translate_input) store.setTranslateInputStore(settings.translate_input);
                    if (settings.revert_tk_input) store.setRevertTKInputStore(settings.revert_tk_input);
                }
            } catch (err) {
                console.error('Failed to load DB settings:', err);
            }
        };
        init();
    }, []);

    useEffect(() => {
        const navigateHistory = (direction: 1 | -1) => {
            const nextIdx = hIdx.current + direction;
            if (nextIdx >= 0 && nextIdx < navHistory.current.length) {
                isInternalNav.current = true;
                const target = navHistory.current[nextIdx];
                hIdx.current = nextIdx;

                setActiveTab(target.tab as any);
                if (target.tSub) useAppStore.getState().setTranslateSubTab(target.tSub as any);
                if (target.cSub) useAppStore.getState().setCompareSubTab(target.cSub as any);
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            let combo = '';
            if (e.ctrlKey) combo += 'CTRL+';
            if (e.shiftKey) combo += 'SHIFT+';
            if (e.altKey) combo += 'ALT+';
            if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
                combo += e.key.toUpperCase();
            }

            if (combo === 'CTRL+F') {
                e.preventDefault();
                const now = Date.now();
                const isDoubleTap = now - lastSearchKeyTime.current < 500;
                lastSearchKeyTime.current = now;

                const localSearches = document.querySelectorAll<HTMLInputElement>('input.app-local-search');

                if (isDoubleTap || localSearches.length === 0) {
                    setTimeout(() => {
                        searchInputRef.current?.focus();
                        searchInputRef.current?.select();
                    }, 50);
                } else {
                    localSearches[0].focus();
                    localSearches[0].select();
                }
            }

            // Tab Navigation: Ctrl + Left/Right (Back/Forward)
            if (e.ctrlKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
                e.preventDefault();
                const tabs = ['params', 'compare-suite', 'translate', 'revert-tk', 'java-parser', 'settings'] as const;
                const currentIndex = tabs.indexOf(activeTab as any);
                if (currentIndex !== -1) {
                    const direction = e.key === 'ArrowRight' ? 1 : -1;
                    const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
                    setActiveTab(tabs[nextIndex]);
                }
            }

            // Quick Settings Shortcut: Ctrl + Shift + S
            if (combo === 'CTRL+SHIFT+S') {
                e.preventDefault();
                let section: any = 'database';
                if (activeTab === 'translate') section = 'translate';
                else if (activeTab === 'revert-tk') section = 'revertTK';
                else if (activeTab === 'compare-suite' || activeTab === 'lab' || activeTab === 'compare' || activeTab === 'text-compare' || activeTab === 'generate') section = 'compare';

                useAppStore.getState().setSettingsSection(section);
                setActiveTab('settings');
            }
        };

        const handleMouseDown = (e: MouseEvent) => {
            // Mouse button 3 is Back, 4 is Forward
            if (e.button === 3) {
                e.preventDefault();
                navigateHistory(-1);
            } else if (e.button === 4) {
                e.preventDefault();
                navigateHistory(1);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('mousedown', handleMouseDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('mousedown', handleMouseDown);
        };
    }, [activeTab, compareSubTab, translateSubTab]);

    // Search logic: Suggestions & Navigation
    useEffect(() => {
        if (!deferredGlobalSearchTerm.trim() || deferredGlobalSearchTerm.length < 1) {
            setSuggestions([]);
            setSelectedSugIdx(-1);
            return;
        }

        const term = deferredGlobalSearchTerm.toLowerCase();

        // Tab Matches
        const tabMatches = TABS_CONFIG.filter(t =>
            t.id.toLowerCase().includes(term) ||
            t.label.toLowerCase().includes(term) ||
            t.keywords.some(k => k.toLowerCase().includes(term))
        ).map(t => ({
            id: t.id,
            label: t.label,
            type: t.type === 'main' ? 'tab-main' : 'tab-sub',
            jumpTab: t.parent || t.id,
            tSub: t.parent === 'translate' ? t.subId : undefined,
            cSub: t.parent === 'compare-suite' ? t.subId : undefined,
            desc: t.type === 'sub' ? `Part of ${t.parent?.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}` : 'Main Navigation'
        }));

        const store = useAppStore.getState();

        // Query Groups (Params)
        const paramMatches = store.queryGroups.filter(q =>
            q.statementId?.toLowerCase().includes(term) || q.sql?.toLowerCase().includes(term)
        ).map(q => ({
            id: `param-${q.id}`,
            label: `📝 ${q.statementId || 'SQL Fragment'}`,
            type: 'param',
            jumpTab: 'params',
            desc: `Found in Parameter Replacement`
        }));

        // Database Connections (Settings)
        const connMatches = store.connections.filter(c =>
            c.name.toLowerCase().includes(term) || c.host.toLowerCase().includes(term) || c.database.toLowerCase().includes(term)
        ).map(c => ({
            id: `conn-${c.id}`,
            label: `⚙️ ${c.name}`,
            type: 'conn',
            jumpTab: 'settings',
            settingsSection: 'database' as const,
            desc: `Found in Database Settings: ${c.host}`
        }));

        // Schema Tables (Compare Suite -> Schema)
        const schemaMatches = store.compareTables.filter(t =>
            t.tableName?.toLowerCase().includes(term) || t.content?.toLowerCase().includes(term)
        ).map(t => ({
            id: `schema-${t.id}`,
            label: `🔍 Table: ${t.tableName || 'Unnamed'}`,
            type: 'schema',
            jumpTab: 'compare-suite',
            cSub: 'schema' as const,
            desc: `Found in Schema Comparator`
        }));

        const combined = [...tabMatches, ...paramMatches, ...connMatches, ...schemaMatches].slice(0, 8);

        setSuggestions(combined);
        setSelectedSugIdx(combined.length > 0 ? 0 : -1);
    }, [deferredGlobalSearchTerm]);

    const handleSearchKeyDown = (e: React.KeyboardEvent) => {
        if (suggestions.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedSugIdx(prev => (prev + 1) % suggestions.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedSugIdx(prev => (prev - 1 + suggestions.length) % suggestions.length);
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            if (selectedSugIdx >= 0) {
                e.preventDefault();
                handleTabJump(suggestions[selectedSugIdx]);
            }
        } else if (e.key === 'Escape') {
            setSuggestions([]);
            setSelectedSugIdx(-1);
        }
    };

    return (
        <div className="flex flex-col h-screen overflow-hidden bg-bg font-sans">

            <div className="flex items-center border-b border-gray-200 bg-white sticky top-0 z-[100] shadow-sm px-5 mt-3 mx-5 rounded-xl border">
                <div className="flex flex-1 overflow-x-auto custom-scrollbar-hidden scroll-smooth">
                    {(['params', 'compare-suite', 'translate', 'revert-tk', 'java-parser', 'settings'] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={clsx(
                                'px-6 py-4 font-bold text-sm transition-all border-b-4 outline-none capitalize flex items-center gap-2 shrink-0',
                                activeTab === tab
                                    ? 'text-primary border-primary bg-primary/5'
                                    : 'text-gray-400 border-transparent hover:text-gray-600 hover:bg-gray-50'
                            )}
                        >
                            {tab === 'params' && <><span>📝</span> Params</>}
                            {tab === 'compare-suite' && <><span>📊</span> Compare</>}
                            {tab === 'translate' && <><span>🇯🇵</span> Translate</>}
                            {tab === 'revert-tk' && <><span>🔄</span> Revert</>}
                            {tab === 'java-parser' && <><span>☕</span> Java</>}
                            {tab === 'settings' && <><span>⚙️</span> Settings</>}
                        </button>
                    ))}
                    {import.meta.env.DEV && (
                        <div className="flex items-center px-4 pointer-events-none select-none">
                            <div className="bg-red-50 border border-red-100 text-red-500 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-sm flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></div>
                                DEV MODE
                            </div>
                        </div>
                    )}
                </div>

                {/* Global Search UI */}
                <div className="global-search-container relative transition-all duration-300 w-auto opacity-100 overflow-visible ml-4 mr-4">
                    <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Search or Jump (e.g. 'settings')..."
                        className="pl-8 pr-8 py-2 bg-gray-100 border border-transparent rounded-2xl text-xs focus:ring-2 focus:ring-primary w-36 sm:w-48 md:w-64 focus:w-56 sm:focus:w-64 md:focus:w-80 transition-all font-bold focus:bg-white focus:border-gray-200 shadow-inner"
                        value={globalSearchTerm}
                        onChange={(e) => setGlobalSearchTerm(e.target.value)}
                        onKeyDown={handleSearchKeyDown}
                        onFocus={(e) => { e.target.select(); }}
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-[10px]">🔍</span>

                    {suggestions.length > 0 && (
                        <div className="absolute top-[calc(100%+8px)] right-0 w-[calc(100vw-40px)] max-w-[320px] sm:w-80 bg-white border border-gray-200 rounded-2xl shadow-2xl z-[1000] overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col p-1.5 backdrop-blur-xl bg-white/95">
                            <div className="px-3 py-2 text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 mb-1 flex justify-between items-center">
                                <span>Quick Jump to Tab</span>
                                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-[8px]">TAB ↵</span>
                            </div>
                            {suggestions.map((sug: any, idx) => (
                                <div
                                    key={sug.id}
                                    onClick={() => handleTabJump(sug)}
                                    className={clsx(
                                        "px-4 py-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-between group",
                                        selectedSugIdx === idx ? "bg-primary text-white shadow-lg shadow-primary/20 scale-[1.02]" : "hover:bg-gray-50 text-gray-700"
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-base">{sug.label.split(' ')[0]}</span>
                                        <div className="flex flex-col">
                                            <span className="font-black text-[10px] uppercase tracking-wider">
                                                <HighlightText text={sug.label.split(' ').slice(1).join(' ')} term={globalSearchTerm} />
                                            </span>
                                            <span className={clsx("text-[8px] font-bold opacity-60 uppercase", selectedSugIdx === idx ? "text-white" : "text-primary")}>
                                                {sug.desc}
                                            </span>
                                        </div>
                                    </div>
                                    <div className={clsx("text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-lg", selectedSugIdx === idx ? "bg-white/20" : "bg-gray-100 text-gray-400")}>
                                        Jump
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {globalSearchTerm && (
                        <button
                            onClick={() => setGlobalSearchTerm('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200"
                        >
                            <span className="text-[10px] font-bold">✕</span>
                        </button>
                    )}
                </div>
            </div>

            <main className="flex-1 container mx-auto max-w-full px-5 overflow-hidden flex flex-col">
                <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-200 border-b-indigo-600"></div></div>}>
                    <div className={`flex-1 flex flex-col h-full ${activeTab === 'params' ? '' : 'hidden'}`}>
                        <ParamsTab />
                    </div>
                    <div className={`flex-1 flex flex-col h-full ${(activeTab === 'compare-suite' || activeTab === 'lab' || activeTab === 'compare' || activeTab === 'text-compare' || activeTab === 'generate') ? '' : 'hidden'}`}>
                        <CompareSuiteTab />
                    </div>
                    <div className={`flex-1 flex flex-col h-full ${(activeTab === 'translate' || activeTab === 'revert-tk') ? '' : 'hidden'}`}>
                        <TranslateTab />
                    </div>
                    <div className={`flex-1 flex flex-col h-full ${activeTab === 'java-parser' ? '' : 'hidden'}`}>
                        <JavaParserTab />
                    </div>
                    <div className={`flex-1 flex flex-col h-full ${activeTab === 'settings' ? '' : 'hidden'}`}>
                        <SettingsTab />
                    </div>
                </Suspense>
            </main>
        </div>
    );
}

export default App;

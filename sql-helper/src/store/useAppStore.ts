import { create } from 'zustand';

export interface RevertRule {
    id: string;
    keyword: string;
    header: string;
    lineBreak: boolean;
    isDefault?: boolean;
}

export const REVERT_DEFAULT_RULES: RevertRule[] = [
    { id: 'select', keyword: 'SELECT', header: '■ 抽出項目', lineBreak: true, isDefault: true },
    { id: 'from', keyword: 'FROM', header: '■ 対象テーブル', lineBreak: true, isDefault: true },
    { id: 'where', keyword: 'WHERE', header: '■ 抽出条件', lineBreak: true, isDefault: true },
    { id: 'and', keyword: 'AND', header: 'AND', lineBreak: true, isDefault: true },
    { id: 'orderby', keyword: 'ORDER BY', header: '■ ソート条件', lineBreak: true, isDefault: true },
    { id: 'groupby', keyword: 'GROUP BY', header: '■ グループ条件', lineBreak: true, isDefault: true },
    { id: 'having', keyword: 'HAVING', header: '■ HAVING条件', lineBreak: true, isDefault: true },
    { id: 'insert', keyword: 'INSERT INTO', header: '■ 挿入項目', lineBreak: true, isDefault: true },
    { id: 'update', keyword: 'UPDATE', header: '■ 更新テーブル', lineBreak: true, isDefault: true },
    { id: 'set', keyword: 'SET', header: '■ 更新内容', lineBreak: true, isDefault: true },
    { id: 'deletefrom', keyword: 'DELETE FROM', header: '■ 削除テーブル', lineBreak: true, isDefault: true },
    { id: 'values', keyword: 'VALUES', header: '■ 登録値', lineBreak: true, isDefault: true },
    { id: 'delete', keyword: 'DELETE', header: '■ 削除項目', lineBreak: true, isDefault: true },
];

export interface DbConfig {
    id: string;
    name: string;
    db_type: string;
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    trust_server_certificate?: boolean;
    encrypt?: boolean;
    verified?: boolean;
    sessionStatus?: 'untested' | 'success' | 'error';
}

export interface QueryResult {
    columns: string[];
    rows: string[][];
}

export interface SqlQueryGroup {
    id: string;
    sql: string;
    params: string;
    statementId: string;
    status: 'idle' | 'loading' | 'success' | 'error' | 'running';
    errorMessage?: string;
    result?: QueryResult;
    isCollapsed?: boolean;
}

export interface TableScript {
    id: string;
    content: string;
    columns?: string[];
    tableName?: string;
}

export interface LabStatement {
    sql: string;
    result?: QueryResult;
    loading: boolean;
    error?: string;
    connectionId: string | null;
}

export interface AppState {
    activeTab: 'params' | 'lab' | 'compare' | 'generate' | 'settings' | 'translate' | 'revert-tk' | 'text-compare' | 'java-parser' | 'compare-suite';
    setActiveTab: (tab: 'params' | 'lab' | 'compare' | 'generate' | 'settings' | 'translate' | 'revert-tk' | 'text-compare' | 'java-parser' | 'compare-suite') => void;

    logFileContent: string;
    setLogFileContent: (content: string) => void;

    autoClipboard: boolean;
    setAutoClipboard: (val: boolean) => void;

    queryGroups: SqlQueryGroup[];
    addQueryGroup: () => void;
    updateQueryGroup: (id: string, updates: Partial<SqlQueryGroup>) => void;
    removeQueryGroup: (id: string) => void;

    compareTables: TableScript[];
    addCompareTable: () => void;
    updateCompareTable: (id: string, content: string) => void;
    removeCompareTable: (id: string) => void;

    priorityColumns: string;
    setPriorityColumns: (cols: string) => void;

    schemaScript: string;
    setSchemaScript: (script: string) => void;

    genPriorityColumns: string;
    setGenPriorityColumns: (cols: string) => void;


    translateFilePath: string;
    setTranslateFilePath: (path: string) => void;

    excelHeaderColor: string;
    setExcelHeaderColor: (color: string) => void;

    runShortcut: string;
    setRunShortcut: (shortcut: string) => void;
    focusSearchShortcut: string;
    setFocusSearchShortcut: (shortcut: string) => void;

    formatRemoveSpaces: boolean;
    setFormatRemoveSpaces: (val: boolean) => void;
    formatSqlAppend: boolean;
    setFormatSqlAppend: (val: boolean) => void;

    searchStrict: boolean;
    setSearchStrict: (val: boolean) => void;

    connections: DbConfig[];
    setConnections: (conns: DbConfig[]) => void;

    // RevertTK Sync Fields
    columnSplitEnabled: boolean;
    setColumnSplitEnabled: (val: boolean) => void;
    columnSplitKeywords: string;
    setColumnSplitKeywords: (val: string) => void;
    revertTKColConfig: string;
    setRevertTKColConfig: (val: string) => void;
    columnSplitApplyToText: boolean;
    setColumnSplitApplyToText: (val: boolean) => void;
    columnSplitApplyToTable: boolean;
    setColumnSplitApplyToTable: (val: boolean) => void;
    revertTKDeleteChars: string;
    setRevertTKDeleteChars: (val: string) => void;
    revertTKMapping: Array<{ id: string, label: string, offsets: number[], type: 'text' | 'table' }>;
    setRevertTKMapping: (val: Array<{ id: string, label: string, offsets: number[], type: 'text' | 'table' }>) => void;

    revertRules: RevertRule[];
    setRevertRules: (val: RevertRule[]) => void;
    addRevertRule: () => void;
    updateRevertRule: (id: string, updates: Partial<RevertRule>) => void;
    removeRevertRule: (id: string) => void;
    resetRevertRule: (id: string) => void;

    textCompareDeleteChars: string;
    setTextCompareDeleteChars: (val: string) => void;
    textCompareRemoveAppend: boolean;
    setTextCompareRemoveAppend: (val: boolean) => void;
    textCompareTruncateDuplicate: boolean;
    setTextCompareTruncateDuplicate: (val: boolean) => void;
    textCompareRemoveEmptyLines: boolean;
    setTextCompareRemoveEmptyLines: (val: boolean) => void;
    textCompareOrdered: boolean;
    setTextCompareOrdered: (val: boolean) => void;
    textCompareIgnoreCase: boolean;
    setTextCompareIgnoreCase: (val: boolean) => void;
    textCompareTrimWhitespace: boolean;
    setTextCompareTrimWhitespace: (val: boolean) => void;
    textCompareAutoCompare: boolean;
    setTextCompareAutoCompare: (val: boolean) => void;
    textCompareSort: boolean;
    setTextCompareSort: (val: boolean) => void;

    translateDeleteChars: string;
    setTranslateDeleteChars: (val: string) => void;
    translateTruncateDuplicate: boolean;
    setTranslateTruncateDuplicate: (val: boolean) => void;

    globalSearchTerm: string;
    setGlobalSearchTerm: (term: string) => void;

    geminiApiKey: string;
    setGeminiApiKey: (val: string) => void;

    // LabTab Global Scope
    labStmt1: LabStatement;
    setLabStmt1: (val: LabStatement | ((prev: LabStatement) => LabStatement)) => void;
    labStmt2: LabStatement;
    setLabStmt2: (val: LabStatement | ((prev: LabStatement) => LabStatement)) => void;
    labSearchTerm: string;
    setLabSearchTerm: (val: string) => void;
    labColSearch: string;
    setLabColSearch: (val: string) => void;
    labPriorityCols: string;
    setLabPriorityCols: (val: string) => void;

    // Shared Text Compare Inputs
    textCompareExpectedInput: string;
    setTextCompareExpectedInput: (val: string) => void;
    textCompareCurrentInput: string;
    setTextCompareCurrentInput: (val: string) => void;

    // Shared RevertTK Inputs/State
    revertTKInputStore: string;
    setRevertTKInputStore: (val: string) => void;
    revertTKResultStore: string;
    setRevertTKResultStore: (val: string) => void;
    revertTKModeStore: 'TKtoCode' | 'CodetoTK';
    setRevertTKModeStore: (val: 'TKtoCode' | 'CodetoTK') => void;
    revertTKResultFormatStore: 'text' | 'table';
    setRevertTKResultFormatStore: (val: 'text' | 'table') => void;

    translateInputStore: string;
    setTranslateInputStore: (val: string) => void;
    translateTargetLangStore: 'jp' | 'en' | 'vi';
    setTranslateTargetLangStore: (val: 'jp' | 'en' | 'vi') => void;
    translateSearchStore: string;
    setTranslateSearchStore: (val: string) => void;
    translateSelectionsStore: Record<string, string>;
    setTranslateSelectionsStore: (val: Record<string, string>) => void;
    translateDataStore: any[];
    setTranslateDataStore: (val: any[]) => void;

    uiHighlightCopied: boolean;
    setUiHighlightCopied: (val: boolean) => void;

    translateSubTab: 'dictionary' | 'quick';
    setTranslateSubTab: (tab: 'dictionary' | 'quick') => void;
    translateLineHeight: number;
    setTranslateLineHeight: (val: number) => void;
    translateDictionaryLimit: number;
    setTranslateDictionaryLimit: (val: number | ((prev: number) => number)) => void;

    compareSubTab: 'data' | 'schema' | 'text' | 'generate';
    setCompareSubTab: (tab: 'data' | 'schema' | 'text' | 'generate') => void;

    javaParserSource: string;
    setJavaParserSource: (val: string) => void;
    javaParserSearch: string;
    setJavaParserSearch: (val: string) => void;
    javaParserMermaid: string;
    setJavaParserMermaid: (val: string) => void;
    javaParserIsLoadingAI: boolean;
    setJavaParserIsLoadingAI: (val: boolean) => void;

    paramsLogPath: string;
    setParamsLogPath: (val: string) => void;
    paramsSelectedConnId: string | null;
    setParamsSelectedConnId: (val: string | null) => void;

    updateConnectionSessionStatus: (id: string, status: 'success' | 'error') => void;

    settingsSection: 'database' | 'shortcuts' | 'appearance' | 'translate' | 'revertTK' | 'compare' | 'javaParser';
    setSettingsSection: (section: 'database' | 'shortcuts' | 'appearance' | 'translate' | 'revertTK' | 'compare' | 'javaParser') => void;
}

export const useAppStore = create<AppState>((set) => ({
    activeTab: 'params',
    setActiveTab: (tab) => set({ activeTab: tab }),

    translateSubTab: 'dictionary',
    setTranslateSubTab: (tab) => set({ translateSubTab: tab }),
    translateLineHeight: 1.6,
    setTranslateLineHeight: (val) => set({ translateLineHeight: val }),
    translateDictionaryLimit: 200,
    setTranslateDictionaryLimit: (val) => set((state) => ({
        translateDictionaryLimit: typeof val === 'function' ? val(state.translateDictionaryLimit) : val
    })),

    compareSubTab: 'data',
    setCompareSubTab: (tab) => set({ compareSubTab: tab }),

    javaParserSource: '',
    setJavaParserSource: (val) => set({ javaParserSource: val }),
    javaParserSearch: '',
    setJavaParserSearch: (val) => set({ javaParserSearch: val }),
    javaParserMermaid: '',
    setJavaParserMermaid: (val) => set({ javaParserMermaid: val }),
    javaParserIsLoadingAI: false,
    setJavaParserIsLoadingAI: (val) => set({ javaParserIsLoadingAI: val }),

    paramsLogPath: '',
    setParamsLogPath: (val) => set({ paramsLogPath: val }),
    paramsSelectedConnId: null,
    setParamsSelectedConnId: (val) => set({ paramsSelectedConnId: val }),

    logFileContent: '',
    setLogFileContent: (content) => set({ logFileContent: content }),

    autoClipboard: false,
    setAutoClipboard: (val) => set({ autoClipboard: val }),

    queryGroups: [{ id: '1', sql: '', params: '', statementId: '', status: 'idle', isCollapsed: false }],
    addQueryGroup: () => set((state) => ({
        queryGroups: [...state.queryGroups, {
            id: Math.random().toString(36).substr(2, 9),
            sql: '',
            params: '',
            statementId: '',
            status: 'idle',
            isCollapsed: false
        }]
    })),
    updateQueryGroup: (id, updates) => set((state) => ({
        queryGroups: state.queryGroups.map(g => g.id === id ? { ...g, ...updates } : g)
    })),
    removeQueryGroup: (id) => set((state) => ({
        queryGroups: state.queryGroups.filter(g => g.id !== id)
    })),

    compareTables: [
        { id: '1', content: '' },
        { id: '2', content: '' }
    ],
    addCompareTable: () => set((state) => ({
        compareTables: [...state.compareTables, { id: Math.random().toString(36).substr(2, 9), content: '' }]
    })),
    updateCompareTable: (id, content) => set((state) => ({
        compareTables: state.compareTables.map(t => t.id === id ? { ...t, content } : t)
    })),
    removeCompareTable: (id) => set((state) => ({
        compareTables: state.compareTables.filter(t => t.id !== id)
    })),

    priorityColumns: '',
    setPriorityColumns: (val) => set({ priorityColumns: val }),

    schemaScript: '',
    setSchemaScript: (val) => set({ schemaScript: val }),

    genPriorityColumns: '',
    setGenPriorityColumns: (cols: string) => set({ genPriorityColumns: cols }),


    translateFilePath: '',
    setTranslateFilePath: (val) => set({ translateFilePath: val }),

    excelHeaderColor: '#4F46E5',
    setExcelHeaderColor: (val) => set({ excelHeaderColor: val }),

    runShortcut: 'F5',
    setRunShortcut: (val) => set({ runShortcut: val }),
    focusSearchShortcut: 'CTRL+F',
    setFocusSearchShortcut: (val) => set({ focusSearchShortcut: val }),

    formatRemoveSpaces: true,
    setFormatRemoveSpaces: (val) => set({ formatRemoveSpaces: val }),
    formatSqlAppend: false,
    setFormatSqlAppend: (val: boolean) => set({ formatSqlAppend: val }),

    searchStrict: false,
    setSearchStrict: (val: boolean) => set({ searchStrict: val }),

    connections: [],
    setConnections: (connections) => set((state) => ({
        connections: connections.map(c => ({
            ...c,
            sessionStatus: (state.connections.find(ex => ex.id === c.id)?.sessionStatus) || 'untested'
        }))
    })),

    updateConnectionSessionStatus: (id, status) => set((state) => ({
        connections: state.connections.map(c => c.id === id ? { ...c, sessionStatus: status } : c)
    })),

    columnSplitEnabled: true,
    setColumnSplitEnabled: (val) => set({ columnSplitEnabled: val }),
    columnSplitKeywords: ' AS | .',
    setColumnSplitKeywords: (val) => set({ columnSplitKeywords: val }),
    revertTKColConfig: 'A:150, B:250',
    setRevertTKColConfig: (val) => set({ revertTKColConfig: val }),
    columnSplitApplyToText: true,
    setColumnSplitApplyToText: (val) => set({ columnSplitApplyToText: val }),
    columnSplitApplyToTable: true,
    setColumnSplitApplyToTable: (val) => set({ columnSplitApplyToTable: val }),
    revertTKDeleteChars: "' | ,",
    setRevertTKDeleteChars: (val) => set({ revertTKDeleteChars: val }),
    revertTKMapping: [
        { id: 'ext-items', label: '抽出項目', offsets: [1, 1], type: 'table' },
        { id: 'target-tables', label: '対象テーブル', offsets: [1, 1], type: 'table' },
        { id: 'ext-conditions', label: '抽出条件', offsets: [1, 1], type: 'table' },
        { id: 'sort', label: 'ソート', offsets: [1, 1], type: 'table' },
    ],
    setRevertTKMapping: (val) => set({ revertTKMapping: val }),

    revertRules: REVERT_DEFAULT_RULES,
    setRevertRules: (val) => set({ revertRules: val }),
    addRevertRule: () => set((state) => ({
        revertRules: [...state.revertRules, {
            id: Math.random().toString(36).substr(2, 9),
            keyword: 'NEW KEYWORD',
            header: 'New Header',
            lineBreak: true,
            isDefault: false
        }]
    })),
    updateRevertRule: (id, updates) => set((state) => ({
        revertRules: state.revertRules.map(r => r.id === id ? { ...r, ...updates } : r)
    })),
    removeRevertRule: (id) => set((state) => ({
        revertRules: state.revertRules.filter(r => r.id !== id)
    })),
    resetRevertRule: (id) => set((state) => ({
        revertRules: state.revertRules.map(r => {
            if (r.id === id) {
                const def = REVERT_DEFAULT_RULES.find(d => d.id === id);
                return def ? { ...def } : r;
            }
            return r;
        })
    })),

    textCompareDeleteChars: ',);\t"',
    setTextCompareDeleteChars: (val) => set({ textCompareDeleteChars: val }),
    textCompareRemoveAppend: false,
    setTextCompareRemoveAppend: (val) => set({ textCompareRemoveAppend: val }),
    textCompareTruncateDuplicate: false,
    setTextCompareTruncateDuplicate: (val) => set({ textCompareTruncateDuplicate: val }),
    textCompareRemoveEmptyLines: false,
    setTextCompareRemoveEmptyLines: (val) => set({ textCompareRemoveEmptyLines: val }),
    textCompareOrdered: false,
    setTextCompareOrdered: (val) => set({ textCompareOrdered: val }),
    textCompareIgnoreCase: false,
    setTextCompareIgnoreCase: (val) => set({ textCompareIgnoreCase: val }),
    textCompareTrimWhitespace: false,
    setTextCompareTrimWhitespace: (val) => set({ textCompareTrimWhitespace: val }),
    textCompareAutoCompare: false,
    setTextCompareAutoCompare: (val) => set({ textCompareAutoCompare: val }),
    textCompareSort: false,
    setTextCompareSort: (val) => set({ textCompareSort: val }),

    translateDeleteChars: '',
    setTranslateDeleteChars: (val) => set({ translateDeleteChars: val }),
    translateTruncateDuplicate: false,
    setTranslateTruncateDuplicate: (val) => set({ translateTruncateDuplicate: val }),

    globalSearchTerm: '',
    setGlobalSearchTerm: (term) => set({ globalSearchTerm: term }),

    geminiApiKey: '',
    setGeminiApiKey: (val) => set({ geminiApiKey: val }),

    labStmt1: { sql: '', loading: false, connectionId: null },
    setLabStmt1: (val) => set((state) => ({ labStmt1: typeof val === 'function' ? val(state.labStmt1) : val })),
    labStmt2: { sql: '', loading: false, connectionId: null },
    setLabStmt2: (val) => set((state) => ({ labStmt2: typeof val === 'function' ? val(state.labStmt2) : val })),
    labSearchTerm: '',
    setLabSearchTerm: (val) => set({ labSearchTerm: val }),
    labColSearch: '',
    setLabColSearch: (val) => set({ labColSearch: val }),
    labPriorityCols: '',
    setLabPriorityCols: (val) => set({ labPriorityCols: val }),

    textCompareExpectedInput: '',
    setTextCompareExpectedInput: (val) => set({ textCompareExpectedInput: val }),
    textCompareCurrentInput: '',
    setTextCompareCurrentInput: (val) => set({ textCompareCurrentInput: val }),

    revertTKInputStore: '',
    setRevertTKInputStore: (val) => set({ revertTKInputStore: val }),
    revertTKResultStore: '',
    setRevertTKResultStore: (val) => set({ revertTKResultStore: val }),
    revertTKModeStore: 'CodetoTK',
    setRevertTKModeStore: (val) => set({ revertTKModeStore: val }),
    revertTKResultFormatStore: 'text',
    setRevertTKResultFormatStore: (val) => set({ revertTKResultFormatStore: val }),

    translateInputStore: '',
    setTranslateInputStore: (val) => set({ translateInputStore: val }),
    translateTargetLangStore: 'en',
    setTranslateTargetLangStore: (val) => set({ translateTargetLangStore: val }),
    translateSearchStore: '',
    setTranslateSearchStore: (val) => set({ translateSearchStore: val }),
    translateSelectionsStore: {},
    setTranslateSelectionsStore: (val) => set({ translateSelectionsStore: val }),
    translateDataStore: [],
    setTranslateDataStore: (val) => set({ translateDataStore: val }),

    uiHighlightCopied: false,
    setUiHighlightCopied: (val) => set({ uiHighlightCopied: val }),

    settingsSection: 'database',
    setSettingsSection: (section) => set({ settingsSection: section }),
}));

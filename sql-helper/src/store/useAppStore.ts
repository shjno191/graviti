import { create } from 'zustand';

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

export interface AppState {
    activeTab: 'params' | 'lab' | 'compare' | 'generate' | 'settings' | 'translate' | 'text-compare' | 'java-parser' | 'compare-suite';
    setActiveTab: (tab: 'params' | 'lab' | 'compare' | 'generate' | 'settings' | 'translate' | 'text-compare' | 'java-parser' | 'compare-suite') => void;

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

    textCompareDeleteChars: string;
    setTextCompareDeleteChars: (val: string) => void;
    textCompareRemoveAppend: boolean;
    setTextCompareRemoveAppend: (val: boolean) => void;
    textCompareTruncateDuplicate: boolean;
    setTextCompareTruncateDuplicate: (val: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
    activeTab: 'params',
    setActiveTab: (tab) => set({ activeTab: tab }),

    // ... (existing initializers) ...

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

    formatRemoveSpaces: true,
    setFormatRemoveSpaces: (val) => set({ formatRemoveSpaces: val }),
    formatSqlAppend: false,
    setFormatSqlAppend: (val: boolean) => set({ formatSqlAppend: val }),

    searchStrict: false,
    setSearchStrict: (val: boolean) => set({ searchStrict: val }),

    connections: [],
    setConnections: (connections) => set({ connections }),

    columnSplitEnabled: true,
    setColumnSplitEnabled: (val) => set({ columnSplitEnabled: val }),
    columnSplitKeywords: ' AS , .',
    setColumnSplitKeywords: (val) => set({ columnSplitKeywords: val }),
    revertTKColConfig: 'A:150, B:250',
    setRevertTKColConfig: (val) => set({ revertTKColConfig: val }),
    columnSplitApplyToText: true,
    setColumnSplitApplyToText: (val) => set({ columnSplitApplyToText: val }),
    columnSplitApplyToTable: true,
    setColumnSplitApplyToTable: (val) => set({ columnSplitApplyToTable: val }),
    revertTKDeleteChars: "',",
    setRevertTKDeleteChars: (val) => set({ revertTKDeleteChars: val }),
    revertTKMapping: [
        { id: 'logic-name', label: '【SQL論理名】', offsets: [1, 1], type: 'text' },
        { id: 'def-name', label: '【SQL定義名】', offsets: [1, 1], type: 'text' },
        { id: 'target-table', label: '■ 対象テーブル', offsets: [1, 1], type: 'text' },
        { id: 'extraction-cond', label: '■ 抽出条件', offsets: [1, 1], type: 'text' },
        { id: 'ext-items', label: '■ 抽出項目', offsets: [1, 1], type: 'table' },
        { id: 'ins-items', label: '■ 挿入項目', offsets: [1, 1], type: 'table' },
        { id: 'sort-order', label: '■ 並び順', offsets: [1, 1], type: 'text' },
        { id: 'join-cond', label: '■ 結合条件', offsets: [1, 1], type: 'text' },
        { id: 'log-output', label: '・ログを出力する。', offsets: [1, 1], type: 'table' },
    ],
    setRevertTKMapping: (val) => set({ revertTKMapping: val }),

    textCompareDeleteChars: ',);\t"',
    setTextCompareDeleteChars: (val) => set({ textCompareDeleteChars: val }),
    textCompareRemoveAppend: false,
    setTextCompareRemoveAppend: (val) => set({ textCompareRemoveAppend: val }),
    textCompareTruncateDuplicate: false,
    setTextCompareTruncateDuplicate: (val) => set({ textCompareTruncateDuplicate: val }),
}));

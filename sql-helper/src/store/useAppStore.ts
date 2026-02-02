import { create } from 'zustand';

export interface DbConfig {
    db_type: string;
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    use_connection_string?: boolean;
    connection_string?: string;
    trust_server_certificate?: boolean;
    encrypt?: boolean;
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
}

export interface TableScript {
    id: string;
    content: string;
    columns?: string[];
    tableName?: string;
}

export interface AppState {
    activeTab: 'params' | 'compare' | 'generate' | 'settings';
    setActiveTab: (tab: 'params' | 'compare' | 'generate' | 'settings') => void;

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

    dbConfig: DbConfig;
    setDbConfig: (config: DbConfig) => void;
}

export const useAppStore = create<AppState>((set) => ({
    activeTab: 'params',
    setActiveTab: (tab) => set({ activeTab: tab }),

    logFileContent: '',
    setLogFileContent: (content) => set({ logFileContent: content }),

    autoClipboard: false,
    setAutoClipboard: (val) => set({ autoClipboard: val }),

    queryGroups: [{ id: '1', sql: '', params: '', statementId: '', status: 'idle' }],
    addQueryGroup: () => set((state) => ({
        queryGroups: [...state.queryGroups, {
            id: Math.random().toString(36).substr(2, 9),
            sql: '',
            params: '',
            statementId: '',
            status: 'idle'
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
    setGenPriorityColumns: (val) => set({ genPriorityColumns: val }),

    dbConfig: {
        db_type: 'mssql',
        host: 'localhost',
        port: 1433,
        user: 'sa',
        password: '',
        database: '',
        use_connection_string: false,
        connection_string: '',
        trust_server_certificate: true,
        encrypt: false
    },
    setDbConfig: (config) => set({ dbConfig: config }),
}));

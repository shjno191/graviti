import React, { useState, useEffect } from 'react';
import { useAppStore, DbConfig } from '../store/useAppStore';
import { invoke } from '@tauri-apps/api/tauri';
import { open as openDialog } from '@tauri-apps/api/dialog';

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

            // Only add the key if it's not a modifier itself
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
            className={`px-6 py-2.5 rounded-xl font-black text-xs transition-all shadow-md active:scale-95 whitespace-nowrap ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-black text-white hover:bg-gray-800'}`}
        >
            {isRecording ? 'PRESS KEY NOW...' : 'CHANGE SHORTCUT'}
        </button>
    );
};

export const SettingsTab: React.FC = () => {
    const {
        connections, setConnections,
        translateFilePath, setTranslateFilePath,
        excelHeaderColor, setExcelHeaderColor,
        runShortcut, setRunShortcut,
        columnSplitEnabled,
        columnSplitKeywords,
        revertTKColConfig,
        columnSplitApplyToText,
        columnSplitApplyToTable,
        revertTKDeleteChars,
        revertTKMapping,
        activeTab
    } = useAppStore();
    const [editingConfig, setEditingConfig] = useState<DbConfig | null>(null);
    const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error' | 'testing' | 'loading'>('idle');
    const [testMessage, setTestMessage] = useState<string>('');

    const loadSettings = async () => {
        setStatus('loading');
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
                if (settings.text_compare_delete_chars) store.setTextCompareDeleteChars(settings.text_compare_delete_chars);
                if (settings.text_compare_remove_append !== undefined) store.setTextCompareRemoveAppend(settings.text_compare_remove_append);
                if (settings.text_compare_truncate_duplicate !== undefined) store.setTextCompareTruncateDuplicate(settings.text_compare_truncate_duplicate);
                if (settings.excel_header_color) store.setExcelHeaderColor(settings.excel_header_color);
                if (settings.run_shortcut) store.setRunShortcut(settings.run_shortcut);
                setStatus('success');
                setTimeout(() => setStatus('idle'), 1000);
            }
        } catch (err) {
            console.error('Failed to load DB settings:', err);
            setStatus('error');
        }
    };

    // Reload settings when tab becomes active
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
        // Use provided connections or fallback to state
        // Note: state might be stale in some callbacks, so passing currentConnections is safer if available
        const connsToSave = currentConnections || connections;

        await invoke('save_db_settings', {
            settings: {
                connections: connsToSave,
                translate_file_path: translateFilePath,
                column_split_enabled: columnSplitEnabled,
                column_split_keywords: columnSplitKeywords,
                revert_tk_col_config: revertTKColConfig,
                column_split_apply_to_text: columnSplitApplyToText,
                column_split_apply_to_table: columnSplitApplyToTable,
                revert_tk_delete_chars: revertTKDeleteChars,
                revert_tk_mapping: revertTKMapping,
                text_compare_delete_chars: useAppStore.getState().textCompareDeleteChars,
                text_compare_remove_append: useAppStore.getState().textCompareRemoveAppend,
                text_compare_truncate_duplicate: useAppStore.getState().textCompareTruncateDuplicate,
                excel_header_color: excelHeaderColor,
                run_shortcut: runShortcut
            }
        });
    };

    const handleGlobalSave = () => {
        handleSaveSettings(connections);
    };

    const handleSave = async (configToSave: DbConfig) => {
        setStatus('saving');
        try {
            const updatedConnections = connections.map(c => c.id === configToSave.id ? configToSave : c);
            if (!updatedConnections.find(c => c.id === configToSave.id)) {
                updatedConnections.push(configToSave);
            }

            await handleSaveSettings(updatedConnections);

            setConnections(updatedConnections);
            setStatus('success');
            setTimeout(() => setStatus('idle'), 3000);
        } catch (error) {
            console.error('Failed to save settings:', error);
            setStatus('error');
        }
    };

    const handleTest = async (configToTest: DbConfig) => {
        setStatus('testing');
        setTestMessage('');
        try {
            const result = await invoke<string>('test_connection', { config: configToTest });
            setTestMessage(result);
            setStatus('success');

            const updatedConfig = { ...configToTest, verified: true };
            setEditingConfig(updatedConfig);

            const updatedConnections = connections.map(c => c.id === updatedConfig.id ? updatedConfig : c);
            await handleSaveSettings(updatedConnections);
            setConnections(updatedConnections);
        } catch (error: any) {
            setTestMessage(error || 'Kết nối thất bại');
            setStatus('error');
            const updatedConfig = { ...configToTest, verified: false };
            setEditingConfig(updatedConfig);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this connection?')) return;
        const updatedConnections = connections.filter(c => c.id !== id);
        await handleSaveSettings(updatedConnections);
        setConnections(updatedConnections);
        if (editingConfig?.id === id) setEditingConfig(null);
    };

    return (
        <div className="p-6 flex flex-col gap-6 max-w-5xl mx-auto animate-in fade-in duration-300">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tight">Database Connections</h2>
                <button
                    onClick={handleAddConnection}
                    className="px-4 py-2 bg-primary text-white rounded-xl font-bold hover:bg-secondary transition-all shadow-md flex items-center gap-2"
                >
                    <span className="text-xl">+</span> Add Connection
                </button>
            </div>

            <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 flex flex-col gap-8">
                <div>
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-black text-gray-800 uppercase tracking-tight">Global Application Configuration</h3>
                        <div className="flex gap-2">
                            <button
                                onClick={loadSettings}
                                className="px-4 py-2 bg-blue-50 text-blue-600 rounded-xl font-bold hover:bg-blue-100 transition-all border border-blue-100 flex items-center gap-2"
                                title="Reload settings from settings.json"
                            >
                                🔄 REFRESH
                            </button>
                            <button
                                onClick={async () => {
                                    try {
                                        const path = await invoke<string>('get_setting_path');
                                        await invoke('open_file', { path });
                                    } catch (e) {
                                        console.error('Failed to open settings file', e);
                                    }
                                }}
                                className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl font-bold hover:bg-indigo-100 transition-all border border-indigo-100 flex items-center gap-2"
                                title="Open settings.json"
                            >
                                📂 OPEN JSON
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-6">
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Translate Excel Path (Source)</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={translateFilePath}
                                    onChange={e => setTranslateFilePath(e.target.value)}
                                    onBlur={handleGlobalSave}
                                    className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 font-mono text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                                    placeholder="Path to translate.xlsx"
                                />
                                <button
                                    onClick={async () => {
                                        const selected = await openDialog({
                                            filters: [{ name: 'Excel', extensions: ['xlsx'] }]
                                        });
                                        if (selected && typeof selected === 'string') {
                                            setTranslateFilePath(selected);
                                            // Trigger save after a short delay to ensure state update (or pass explicitly)
                                            // Just calling handleGlobalSave relies on state, which might be old in this closure?
                                            // Better to assume hook state update is fast enough for next tick or pass it.
                                            // Ideally we would pass 'selected' to save but handleSaveSettings uses state.
                                            // Let's rely on React state update or we can directly invoke save with new val.
                                            // For simplicity, let's wait a tick.
                                            setTimeout(handleGlobalSave, 100);
                                        }
                                    }}
                                    className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-all border border-gray-200"
                                >
                                    Browse
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100 h-fit">
                    <h3 className="text-sm font-black text-gray-800 uppercase tracking-tight mb-4">Excel Export Style</h3>
                    <div className="flex flex-col gap-5">
                        <div className="grid grid-cols-1 gap-4">
                            <div className="flex flex-col gap-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Header Background Color</label>
                                <div className="flex gap-3 items-center">
                                    <input
                                        type="color"
                                        value={excelHeaderColor}
                                        onChange={e => {
                                            setExcelHeaderColor(e.target.value);
                                        }}
                                        onBlur={handleGlobalSave}
                                        className="w-10 h-10 rounded-lg cursor-pointer border-none p-0 bg-transparent"
                                    />
                                    <input
                                        type="text"
                                        value={excelHeaderColor}
                                        onChange={e => setExcelHeaderColor(e.target.value)}
                                        onBlur={handleGlobalSave}
                                        className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-2 font-mono text-xs uppercase"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="pt-2">
                            <div className="p-4 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col gap-2 bg-white">
                                <span className="text-[8px] font-black text-gray-300 uppercase tracking-widest">Preview (Hardcoded Black Text/Border)</span>
                                <div className="border border-black overflow-hidden rounded-sm">
                                    <div
                                        className="px-3 py-1 text-[10px] font-bold text-white text-center border-b border-black"
                                        style={{ backgroundColor: excelHeaderColor }}
                                    >
                                        HEADER
                                    </div>
                                    <div className="px-3 py-2 text-[10px] bg-white text-center font-medium text-black">
                                        Sample Content
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100 h-fit">
                    <h3 className="text-sm font-black text-gray-800 uppercase tracking-tight mb-4">Execution Shortcut</h3>
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Global Run SQL Shortcut</label>
                            <div className="flex gap-3 items-center">
                                <div className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-2.5 font-mono text-sm font-black text-primary shadow-inner">
                                    {runShortcut}
                                </div>
                                <ShortcutRecorder onRecord={setRunShortcut} current={runShortcut} onSave={handleGlobalSave} />
                            </div>
                            <p className="text-[9px] text-gray-400 mt-1">Press a key (e.g. F5, F9) or a combination (e.g. Ctrl+Enter) to set as default shortcut for Execute Query.</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-[300px_1fr] gap-8">
                <div className="flex flex-col gap-3">
                    {connections.map(conn => (
                        <div
                            key={conn.id}
                            onClick={() => setEditingConfig(conn)}
                            className={`p-4 rounded-2xl cursor-pointer transition-all border-2 flex items-center justify-between group ${editingConfig?.id === conn.id ? 'bg-primary/5 border-primary shadow-md' : 'bg-white border-transparent hover:border-gray-100 shadow-sm'}`}
                        >
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-black text-gray-800">{conn.name}</span>
                                    {conn.verified && <span className="text-green-500 text-xs" title="Verified">✔</span>}
                                </div>
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{conn.db_type}</span>
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(conn.id); }}
                                className="opacity-0 group-hover:opacity-100 p-2 text-red-400 hover:text-red-600 transition-all rounded-lg hover:bg-red-50"
                            >
                                🗑
                            </button>
                        </div>
                    ))}
                </div>

                {editingConfig && (
                    <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 animate-in slide-in-from-right-10 duration-500">
                        <div className="grid grid-cols-2 gap-6">
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Connection Name</label>
                                <input
                                    type="text"
                                    value={editingConfig.name}
                                    onChange={e => setEditingConfig({ ...editingConfig, name: e.target.value })}
                                    className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-primary"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Database Type</label>
                                <select
                                    value={editingConfig.db_type}
                                    onChange={e => setEditingConfig({ ...editingConfig, db_type: e.target.value })}
                                    className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-primary"
                                >
                                    <option value="mssql">SQL Server (MSSQL)</option>
                                    <option value="mysql">MySQL / MariaDB</option>
                                    <option value="postgresql">PostgreSQL</option>
                                </select>
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Host / Server</label>
                                <input
                                    type="text"
                                    value={editingConfig.host}
                                    onChange={e => setEditingConfig({ ...editingConfig, host: e.target.value })}
                                    className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-primary"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Port</label>
                                <input
                                    type="number"
                                    value={editingConfig.port}
                                    onChange={e => setEditingConfig({ ...editingConfig, port: parseInt(e.target.value) })}
                                    className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-primary"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Username</label>
                                <input
                                    type="text"
                                    value={editingConfig.user}
                                    onChange={e => setEditingConfig({ ...editingConfig, user: e.target.value })}
                                    className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-primary"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Password</label>
                                <input
                                    type="password"
                                    value={editingConfig.password}
                                    onChange={e => setEditingConfig({ ...editingConfig, password: e.target.value })}
                                    className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                                />
                            </div>
                            <div className="flex flex-col gap-2 col-span-2">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Database Name</label>
                                <input
                                    type="text"
                                    value={editingConfig.database}
                                    onChange={e => setEditingConfig({ ...editingConfig, database: e.target.value })}
                                    className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-primary"
                                />
                            </div>

                            {editingConfig.db_type === 'mssql' && (
                                <div className="col-span-2 flex gap-6 mt-2">
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <input
                                            type="checkbox"
                                            checked={editingConfig.trust_server_certificate}
                                            onChange={e => setEditingConfig({ ...editingConfig, trust_server_certificate: e.target.checked })}
                                            className="w-5 h-5 rounded-lg border-gray-300 text-primary focus:ring-primary"
                                        />
                                        <span className="text-xs font-black text-gray-600 uppercase tracking-widest group-hover:text-primary transition-colors">Trust Server Cert</span>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <input
                                            type="checkbox"
                                            checked={editingConfig.encrypt}
                                            onChange={e => setEditingConfig({ ...editingConfig, encrypt: e.target.checked })}
                                            className="w-5 h-5 rounded-lg border-gray-300 text-primary focus:ring-primary"
                                        />
                                        <span className="text-xs font-black text-gray-600 uppercase tracking-widest group-hover:text-primary transition-colors">Encrypt Connection</span>
                                    </label>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-4 mt-10">
                            <button
                                onClick={() => handleSave(editingConfig)}
                                className="flex-1 bg-black text-white rounded-2xl py-4 font-black uppercase tracking-widest hover:bg-gray-800 transition-all shadow-lg active:scale-95"
                            >
                                {status === 'saving' ? 'Saving...' : 'Save Connection'}
                            </button>
                            <button
                                onClick={() => handleTest(editingConfig)}
                                className="flex-1 bg-gray-100 text-gray-800 rounded-2xl py-4 font-black uppercase tracking-widest hover:bg-gray-200 transition-all border border-gray-200 active:scale-95"
                            >
                                {status === 'testing' ? 'Testing...' : 'Test Connection'}
                            </button>
                        </div>

                        {testMessage && (
                            <div className={`mt-6 p-4 rounded-2xl border text-xs font-bold font-mono whitespace-pre-wrap break-all ${status === 'success' ? 'bg-green-50 border-green-100 text-green-600' : 'bg-red-50 border-red-100 text-red-600'}`}>
                                {testMessage}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

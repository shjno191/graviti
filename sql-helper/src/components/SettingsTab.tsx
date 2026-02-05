import React, { useState } from 'react';
import { useAppStore, DbConfig } from '../store/useAppStore';
import { invoke } from '@tauri-apps/api/tauri';
import { open as openDialog } from '@tauri-apps/api/dialog';

export const SettingsTab: React.FC = () => {
    const {
        connections,
        setConnections,
        globalLogPath,
        setTranslateFilePath,
        translateFilePath,
        excelHeaderColor,
        setExcelHeaderColor
    } = useAppStore();
    const [editingConfig, setEditingConfig] = useState<DbConfig | null>(null);
    const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error' | 'testing'>('idle');
    const [testMessage, setTestMessage] = useState<string>('');

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

    const handleSave = async (configToSave: DbConfig) => {
        setStatus('saving');
        try {
            const updatedConnections = connections.map(c => c.id === configToSave.id ? configToSave : c);
            if (!updatedConnections.find(c => c.id === configToSave.id)) {
                updatedConnections.push(configToSave);
            }

            await invoke('save_db_settings', {
                settings: {
                    connections: updatedConnections,
                    global_log_path: globalLogPath,
                    translate_file_path: translateFilePath
                }
            });

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
            await invoke('save_db_settings', {
                settings: {
                    connections: updatedConnections,
                    global_log_path: globalLogPath,
                    translate_file_path: translateFilePath
                }
            });
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
        await invoke('save_db_settings', {
            settings: {
                connections: updatedConnections,
                global_log_path: globalLogPath,
                translate_file_path: translateFilePath
            }
        });
        setConnections(updatedConnections);
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

            <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 flex flex-col gap-6">
                <div>
                    <h3 className="text-xl font-black text-gray-800 uppercase tracking-tight mb-4">General Settings</h3>
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Translate Excel Path (Source)</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={translateFilePath}
                                    onChange={e => setTranslateFilePath(e.target.value)}
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
                                        }
                                    }}
                                    className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-all border border-gray-200"
                                >
                                    Browse
                                </button>
                                <button
                                    onClick={async () => {
                                        setStatus('saving');
                                        try {
                                            await invoke('save_db_settings', {
                                                settings: {
                                                    connections: connections,
                                                    global_log_path: globalLogPath,
                                                    translate_file_path: translateFilePath
                                                }
                                            });
                                            setStatus('success');
                                            setTimeout(() => setStatus('idle'), 2000);
                                        } catch (e) {
                                            setStatus('error');
                                        }
                                    }}
                                    className="px-6 py-2 bg-black text-white rounded-xl font-bold hover:bg-gray-800 transition-all shadow-md"
                                >
                                    {status === 'saving' ? 'SETTING...' : 'SAVE CONFIG'}
                                </button>
                            </div>
                            <p className="text-[10px] text-gray-400 italic font-medium">Default path is in 'data' folder relative to the executable.</p>
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
                                        onChange={e => setExcelHeaderColor(e.target.value)}
                                        className="w-10 h-10 rounded-lg cursor-pointer border-none p-0 bg-transparent"
                                    />
                                    <input
                                        type="text"
                                        value={excelHeaderColor}
                                        onChange={e => setExcelHeaderColor(e.target.value)}
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

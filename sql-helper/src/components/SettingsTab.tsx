import React, { useState } from 'react';
import { useAppStore, DbConfig } from '../store/useAppStore';
import { invoke } from '@tauri-apps/api/tauri';
import { open as openDialog } from '@tauri-apps/api/dialog';

export const SettingsTab: React.FC = () => {
    const { connections, setConnections, globalLogPath, translateFilePath, setTranslateFilePath } = useAppStore();
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

            // Auto save verified status to list
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

            {/* General Settings Section */}
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
            </div>

            <div className="grid grid-cols-[300px_1fr] gap-8">
                {/* List of Connections */}
                <div className="flex flex-col gap-3">
                    {connections.map(conn => (
                        <div
                            key={conn.id}
                            onClick={() => setEditingConfig(conn)}
                            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${editingConfig?.id === conn.id
                                ? 'border-primary bg-primary/5 shadow-md'
                                : 'border-gray-100 bg-white hover:border-gray-200 shadow-sm'
                                } relative group`}
                        >
                            <div className="flex justify-between items-start mb-1">
                                <div className="flex gap-1 items-center">
                                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${conn.db_type === 'mssql' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'
                                        }`}>
                                        {conn.db_type}
                                    </span>
                                    {conn.verified ? (
                                        <span className="text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded shadow-sm" title="Verified">🛡️</span>
                                    ) : (
                                        <span className="text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded" title="Not Verified">⚠️</span>
                                    )}
                                </div>
                            </div>
                            <h3 className="font-bold text-gray-800 truncate">{conn.name}</h3>
                            <p className="text-[11px] text-gray-400 font-mono truncate">{conn.host}:{conn.port}</p>

                            <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(conn.id); }}
                                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-600 shadow-lg"
                            >
                                ×
                            </button>
                        </div>
                    ))}
                    {connections.length === 0 && (
                        <div className="p-10 text-center text-gray-300 border-2 border-dashed border-gray-200 rounded-3xl font-bold uppercase italic">
                            No connections yet
                        </div>
                    )}
                </div>

                {/* Edit Form */}
                <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100">
                    {editingConfig ? (
                        <div className="flex flex-col gap-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Display Name</label>
                                    <input
                                        type="text"
                                        value={editingConfig.name}
                                        onChange={e => setEditingConfig({ ...editingConfig, name: e.target.value })}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 font-bold text-gray-700 focus:ring-2 focus:ring-primary outline-none transition-all"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Database Type</label>
                                    <select
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 font-bold text-gray-700 focus:ring-2 focus:ring-primary outline-none transition-all"
                                        value={editingConfig.db_type}
                                        onChange={e => setEditingConfig({ ...editingConfig, db_type: e.target.value, verified: false })}
                                    >
                                        <option value="mssql">Microsoft SQL Server</option>
                                        <option value="mysql">MySQL</option>
                                        <option value="postgres">PostgreSQL</option>
                                    </select>
                                </div>
                                <div className="col-span-2 grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Host</label>
                                        <input
                                            type="text"
                                            value={editingConfig.host}
                                            onChange={e => setEditingConfig({ ...editingConfig, host: e.target.value, verified: false })}
                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 font-mono text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Port</label>
                                        <input
                                            type="number"
                                            value={editingConfig.port}
                                            onChange={e => setEditingConfig({ ...editingConfig, port: parseInt(e.target.value) || 0, verified: false })}
                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 font-mono text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Username</label>
                                        <input
                                            type="text"
                                            value={editingConfig.user}
                                            onChange={e => setEditingConfig({ ...editingConfig, user: e.target.value, verified: false })}
                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 font-bold text-gray-700 focus:ring-2 focus:ring-primary outline-none transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Password</label>
                                        <input
                                            type="password"
                                            value={editingConfig.password}
                                            onChange={e => setEditingConfig({ ...editingConfig, password: e.target.value, verified: false })}
                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 font-bold text-gray-700 focus:ring-2 focus:ring-primary outline-none transition-all"
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Database Name</label>
                                        <input
                                            type="text"
                                            value={editingConfig.database}
                                            onChange={e => setEditingConfig({ ...editingConfig, database: e.target.value, verified: false })}
                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 font-bold text-gray-700 focus:ring-2 focus:ring-primary outline-none transition-all"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3">
                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={editingConfig.trust_server_certificate}
                                        onChange={e => setEditingConfig({ ...editingConfig, trust_server_certificate: e.target.checked, verified: false })}
                                        className="w-5 h-5 rounded-lg text-primary focus:ring-primary border-gray-200"
                                    />
                                    <span className="text-sm font-bold text-gray-600 group-hover:text-primary transition-colors">Trust Server Certificate</span>
                                </label>
                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={editingConfig.encrypt}
                                        onChange={e => setEditingConfig({ ...editingConfig, encrypt: e.target.checked, verified: false })}
                                        className="w-5 h-5 rounded-lg text-primary focus:ring-primary border-gray-200"
                                    />
                                    <span className="text-sm font-bold text-gray-600 group-hover:text-primary transition-colors">Encrypt Connection</span>
                                </label>
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button
                                    onClick={() => handleSave(editingConfig)}
                                    disabled={status === 'saving'}
                                    className="flex-1 px-6 py-3 bg-primary text-white rounded-2xl font-black shadow-lg hover:shadow-primary/30 transition-all disabled:opacity-50"
                                >
                                    {status === 'saving' ? 'SAVING...' : 'SAVE SETTINGS'}
                                </button>
                                <button
                                    onClick={() => handleTest(editingConfig)}
                                    disabled={status === 'testing'}
                                    className={`px-6 py-3 rounded-2xl font-black shadow-lg transition-all disabled:opacity-50 ${editingConfig.verified ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-900 hover:bg-black text-white'}`}
                                >
                                    {status === 'testing' ? 'TESTING...' : editingConfig.verified ? 'VERIFIED ✓' : 'TEST CONNECT'}
                                </button>
                            </div>

                            {testMessage && (
                                <div className={`p-4 rounded-2xl text-sm font-bold animate-in slide-in-from-top-2 ${status === 'error' ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-green-50 text-green-600 border border-green-100'
                                    }`}>
                                    {status === 'error' ? '❌' : '✅'} {testMessage}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full py-20 text-gray-300 gap-4">
                            <span className="text-6xl">🔙</span>
                            <p className="font-bold uppercase tracking-widest">Select a connection to edit</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

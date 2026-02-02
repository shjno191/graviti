import React, { useState } from 'react';
import { useAppStore, DbConfig } from '../store/useAppStore';
import { invoke } from '@tauri-apps/api/tauri';

export const SettingsTab: React.FC = () => {
    const { dbConfig, setDbConfig } = useAppStore();
    const [config, setConfig] = useState<DbConfig>(dbConfig);
    const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error' | 'testing'>('idle');
    const [testMessage, setTestMessage] = useState<string>('');

    const handleSave = async () => {
        setStatus('saving');
        try {
            await invoke('save_db_settings', { config });
            setDbConfig(config);
            setStatus('success');
            setTimeout(() => setStatus('idle'), 3000);
        } catch (error) {
            console.error('Failed to save settings:', error);
            setStatus('error');
        }
    };

    const handleTestConnection = async () => {
        setStatus('testing');
        setTestMessage('');
        try {
            const result = await invoke<string>('test_connection', { config });
            setTestMessage(result);
            setStatus('success');
            setTimeout(() => setStatus('idle'), 5000);
        } catch (error: any) {
            setTestMessage(typeof error === 'string' ? error : JSON.stringify(error));
            setStatus('error');
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target as any;
        const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : (name === 'port' ? parseInt(value) || 0 : value);
        setConfig(prev => ({
            ...prev,
            [name]: val
        }));
    };

    return (
        <div className="p-10 max-w-2xl mx-auto pb-20">
            <div className="bg-white rounded-xl shadow-xl p-8 border border-gray-100">
                <h2 className="text-2xl font-bold mb-8 text-gray-800 flex items-center gap-3">
                    <span className="p-2 bg-primary/10 rounded-lg text-primary">⚙️</span>
                    Database Configuration
                </h2>

                <div className="flex flex-col gap-6">
                    <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
                        <input
                            type="checkbox"
                            name="use_connection_string"
                            id="use_conn"
                            checked={config.use_connection_string}
                            onChange={handleChange}
                            className="w-5 h-5 text-primary rounded"
                        />
                        <label htmlFor="use_conn" className="font-semibold text-blue-800 cursor-pointer">
                            Use custom connection string (JDBC / URL)
                        </label>
                    </div>

                    {config.use_connection_string ? (
                        <div className="animate-in fade-in slide-in-from-top-2 duration-300 flex flex-col gap-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Connection String</label>
                                <textarea
                                    name="connection_string"
                                    value={config.connection_string || ''}
                                    onChange={handleChange}
                                    placeholder="jdbc:sqlserver://172.16.0.196:1435;database=DEVTANAWARI002;..."
                                    className="w-full p-4 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all h-32 font-mono text-sm"
                                />
                                <p className="mt-2 text-xs text-gray-500">
                                    Tip: You can paste a full JDBC string here.
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Override Username (Optional)</label>
                                    <input
                                        type="text"
                                        name="user"
                                        value={config.user}
                                        onChange={handleChange}
                                        placeholder="Username"
                                        className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Override Password (Optional)</label>
                                    <input
                                        type="password"
                                        name="password"
                                        value={config.password}
                                        onChange={handleChange}
                                        placeholder="Password"
                                        className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                                    />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="col-span-2">
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Database Type</label>
                                <select
                                    name="db_type"
                                    value={config.db_type}
                                    onChange={handleChange}
                                    className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all bg-gray-50"
                                >
                                    <option value="mssql">SQL Server (MSSQL)</option>
                                    <option value="mysql">MySQL</option>
                                    <option value="postgres">PostgreSQL</option>
                                </select>
                            </div>

                            <div className="col-span-2 md:col-span-1">
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Host</label>
                                <input
                                    type="text"
                                    name="host"
                                    value={config.host}
                                    onChange={handleChange}
                                    placeholder="localhost or 127.0.0.1"
                                    className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                                />
                            </div>

                            <div className="col-span-2 md:col-span-1">
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Port</label>
                                <input
                                    type="number"
                                    name="port"
                                    value={config.port}
                                    onChange={handleChange}
                                    className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                                />
                            </div>

                            <div className="col-span-2 md:col-span-1">
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Username</label>
                                <input
                                    type="text"
                                    name="user"
                                    value={config.user}
                                    onChange={handleChange}
                                    className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                                />
                            </div>

                            <div className="col-span-2 md:col-span-1">
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Password</label>
                                <input
                                    type="password"
                                    name="password"
                                    value={config.password}
                                    onChange={handleChange}
                                    className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                                />
                            </div>

                            <div className="col-span-2">
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Database Name</label>
                                <input
                                    type="text"
                                    name="database"
                                    value={config.database}
                                    onChange={handleChange}
                                    className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                                />
                            </div>
                        </div>
                    )}

                    {config.db_type === 'mssql' && (
                        <div className="p-4 bg-orange-50 rounded-lg border border-orange-100 flex flex-col gap-3">
                            <h3 className="text-sm font-bold text-orange-800 uppercase tracking-wider">SQL Server Advanced Options</h3>
                            <div className="flex flex-wrap gap-6">
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        name="trust_server_certificate"
                                        checked={config.trust_server_certificate}
                                        onChange={handleChange}
                                        className="w-4 h-4 text-primary rounded"
                                    />
                                    <span className="text-sm font-medium text-orange-900">Trust Server Certificate</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        name="encrypt"
                                        checked={config.encrypt}
                                        onChange={handleChange}
                                        className="w-4 h-4 text-primary rounded"
                                    />
                                    <span className="text-sm font-medium text-orange-900">Encrypt Connection</span>
                                </label>
                            </div>
                            <p className="text-[10px] text-orange-700 mt-1 italic">
                                * Try checking "Trust Server Certificate" if you get login or certificate errors.
                            </p>
                        </div>
                    )}
                </div>

                <div className="mt-10 flex flex-col gap-4">
                    {testMessage && (
                        <div className={`p-4 rounded-lg text-sm border ${status === 'error' ? 'bg-red-50 border-red-100 text-red-700' : 'bg-green-50 border-green-100 text-green-700'}`}>
                            {status === 'error' ? '❌ ' : '✅ '} {testMessage}
                        </div>
                    )}

                    <div className="flex items-center justify-between">
                        <div className="text-sm">
                            {status === 'saving' && <span className="text-gray-500 animate-pulse">Saving settings...</span>}
                            {status === 'testing' && <span className="text-primary animate-pulse">Testing connection...</span>}
                            {status === 'success' && !testMessage && <span className="text-green-600 font-medium">✨ Settings saved!</span>}
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={handleTestConnection}
                                disabled={status === 'testing' || status === 'saving'}
                                className="px-6 py-3 bg-gray-100 text-gray-700 font-bold rounded-lg hover:bg-gray-200 transition-all disabled:opacity-50"
                            >
                                {status === 'testing' ? 'Testing...' : 'Test Connection'}
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={status === 'saving' || status === 'testing'}
                                className="px-8 py-3 bg-primary text-white font-bold rounded-lg hover:bg-secondary transition-all shadow-lg hover:shadow-primary/30 disabled:opacity-50"
                            >
                                Save Configuration
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

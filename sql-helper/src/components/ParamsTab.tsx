import React, { useEffect } from 'react';
import { useAppStore, QueryResult } from '../store/useAppStore';
import { findLogEntriesOptimized, findLastId, replaceParamsInSql } from '../utils/sqlParser';
import { open } from '@tauri-apps/api/dialog';
import { invoke } from '@tauri-apps/api/tauri';
import { ResultSetTable } from './ResultSetTable';

export const ParamsTab: React.FC = () => {
    const {
        queryGroups, addQueryGroup, updateQueryGroup, removeQueryGroup,
        autoClipboard, setAutoClipboard, dbConfig, setDbConfig
    } = useAppStore();

    useEffect(() => {
        const loadInitialLog = async () => {
            if (dbConfig.log_file_path) {
                try {
                    // Just testing if we can read it, or we could pre-fetch it.
                    // For now, the processQuery reads it on demand using readFileContent.
                    await invoke<string>('read_log_file', { path: dbConfig.log_file_path });
                } catch (e) {
                    console.error('Failed to auto-load log:', e);
                }
            }
        };
        loadInitialLog();
    }, [dbConfig.log_file_path]);

    const handleSelectFile = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{
                    name: 'Log Files',
                    extensions: ['log', 'txt']
                }]
            });

            if (selected && typeof selected === 'string') {
                const newConfig = { ...dbConfig, log_file_path: selected };
                setDbConfig(newConfig);
                await invoke('save_db_settings', { config: newConfig });
            }
        } catch (error) {
            console.error('Error selecting file:', error);
        }
    };

    const clearLogFile = () => {
        const newConfig = { ...dbConfig, log_file_path: '' };
        setDbConfig(newConfig);
        invoke('save_db_settings', { config: newConfig });
    };

    const readFileContent = async (path: string): Promise<string> => {
        try {
            const content = await invoke<string>('read_log_file', { path });
            return content;
        } catch (error: any) {
            throw new Error(error || 'Không thể đọc file');
        }
    };

    const processQuery = async (groupId: string, statementId: string) => {
        if (!dbConfig.log_file_path) {
            alert('Vui lòng chọn file log trước');
            return;
        }
        if (!statementId) {
            alert('Vui lòng nhập Statement ID');
            return;
        }

        updateQueryGroup(groupId, { status: 'loading', statementId, errorMessage: undefined });

        try {
            const content = await readFileContent(dbConfig.log_file_path);
            const { sql, params } = findLogEntriesOptimized(content, statementId);

            if (!sql) {
                updateQueryGroup(groupId, { status: 'error', errorMessage: `Không tìm thấy ID: ${statementId}` });
                return;
            }

            const result = replaceParamsInSql(sql, params);
            updateQueryGroup(groupId, {
                status: 'success',
                sql: result,
                params: JSON.stringify(params)
            });

            if (autoClipboard) {
                navigator.clipboard.writeText(result);
            }

        } catch (err: any) {
            const errorMessage = err.message || 'Lỗi không xác định';
            updateQueryGroup(groupId, { status: 'error', errorMessage });
        }
    };

    const runSql = async (groupId: string, sql: string) => {
        if (!sql) return;

        updateQueryGroup(groupId, { status: 'running', errorMessage: undefined });
        try {
            const result = await invoke<QueryResult>('execute_query', {
                config: dbConfig,
                query: sql
            });
            updateQueryGroup(groupId, { status: 'success', result });
        } catch (err: any) {
            const errorMessage = typeof err === 'string' ? err : JSON.stringify(err);
            updateQueryGroup(groupId, { status: 'error', errorMessage });
        }
    };

    const handleGetLastId = async (groupId: string) => {
        if (!dbConfig.log_file_path) {
            alert('Vui lòng chọn file log trước');
            return;
        }

        updateQueryGroup(groupId, { status: 'loading' });
        try {
            const content = await readFileContent(dbConfig.log_file_path);
            const lastId = findLastId(content);
            if (lastId) {
                updateQueryGroup(groupId, { statementId: lastId, status: 'idle' });
                processQuery(groupId, lastId);
            } else {
                updateQueryGroup(groupId, { status: 'error', errorMessage: 'Không tìm thấy statement ID trong file' });
            }
        } catch (err: any) {
            const errorMessage = err.message || 'Lỗi không xác định';
            updateQueryGroup(groupId, { status: 'error', errorMessage });
        }
    };

    const copyResult = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    return (
        <div className="flex flex-col gap-5 p-5">
            <div className="flex flex-wrap gap-4 items-center justify-center p-5 bg-white rounded-lg shadow-sm">
                <div className="flex-1 min-w-[300px]">
                    <label className="block mb-1 text-sm text-gray-700 font-medium">Log File:</label>
                    <div className="flex gap-2 items-center">
                        <div className="flex-1 flex gap-2">
                            <button
                                onClick={handleSelectFile}
                                className="px-4 py-2 bg-primary text-white text-sm rounded hover:bg-secondary transition-colors font-semibold shadow-sm"
                            >
                                📁 Choose File
                            </button>
                            {dbConfig.log_file_path && (
                                <div className="flex-1 p-2 border border-gray-300 rounded text-sm bg-gray-50 overflow-hidden text-ellipsis whitespace-nowrap" title={dbConfig.log_file_path}>
                                    {dbConfig.log_file_path}
                                </div>
                            )}
                        </div>
                        <button
                            onClick={clearLogFile}
                            className="px-3 py-2 bg-red-500 text-white text-xs rounded hover:bg-red-600 transition-colors"
                        >
                            Clear
                        </button>
                    </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-gray-700 mt-6 select-none">
                    <input
                        type="checkbox"
                        checked={autoClipboard}
                        onChange={(e) => setAutoClipboard(e.target.checked)}
                        className="w-4 h-4 text-primary rounded focus:ring-primary"
                    />
                    <span>Auto Copy</span>
                </label>
                <div className="flex gap-2 mt-6">
                    <button
                        onClick={addQueryGroup}
                        className="px-4 py-2 bg-primary text-white rounded-xl font-bold hover:bg-secondary transition-colors shadow-md flex items-center gap-2"
                    >
                        <span className="text-xl">+</span> Add Fragment
                    </button>
                </div>
            </div>

            <div className="flex flex-col gap-5 pb-20">
                {queryGroups.map((group, index) => (
                    <div key={group.id} className="grid grid-cols-[300px_1fr] gap-5 p-5 border border-gray-200 rounded-lg bg-gray-50 relative shadow-sm hover:shadow-md transition-all">
                        <div className="col-span-full font-bold text-gray-700 border-b border-primary pb-2 flex justify-between items-center">
                            <span>Query Fragment {index + 1}</span>
                            {group.status === 'running' && (
                                <span className="text-xs text-primary animate-pulse font-normal">Executing SQL...</span>
                            )}
                        </div>

                        <div className="flex flex-col gap-4 border-r border-gray-200 pr-5">
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-gray-600">Statement ID:</label>
                                <input
                                    type="text"
                                    value={group.statementId}
                                    onChange={(e) => updateQueryGroup(group.id, { statementId: e.target.value })}
                                    placeholder="e.g., 58cf74ef"
                                    className="p-2 border border-gray-300 rounded font-mono text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                />
                            </div>
                            <div className="grid grid-cols-1 gap-2">
                                <button
                                    onClick={() => processQuery(group.id, group.statementId)}
                                    disabled={group.status === 'loading'}
                                    className="p-2 bg-primary text-white rounded hover:bg-secondary disabled:opacity-50 transition-colors"
                                >
                                    {group.status === 'loading' ? 'Processing...' : 'Get SQL'}
                                </button>
                                <button
                                    onClick={() => handleGetLastId(group.id)}
                                    className="p-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex items-center justify-center gap-1"
                                >
                                    Last ID
                                </button>
                                <button
                                    onClick={() => removeQueryGroup(group.id)}
                                    className="p-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                                >
                                    Remove
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 h-full">
                            {group.errorMessage && (
                                <div className="bg-red-100 text-red-800 p-3 rounded border border-red-200 text-sm">
                                    <div className="font-medium mb-2">❌ Lỗi:</div>
                                    <div className="whitespace-pre-wrap">{group.errorMessage}</div>
                                </div>
                            )}

                            <textarea
                                value={group.sql}
                                onChange={(e) => updateQueryGroup(group.id, { sql: e.target.value })}
                                placeholder="SQL query will appear here..."
                                className="w-full min-h-[150px] p-3 border border-gray-300 rounded font-mono text-sm bg-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-inner"
                            />

                            <div className="flex gap-2">
                                {group.sql && (
                                    <>
                                        <button
                                            onClick={() => copyResult(group.sql)}
                                            className="flex-1 py-2 px-4 bg-gray-600 text-white rounded hover:bg-gray-700 font-bold transition-colors"
                                        >
                                            Copy SQL
                                        </button>
                                        <button
                                            onClick={() => runSql(group.id, group.sql)}
                                            disabled={group.status === 'running'}
                                            className="flex-1 py-2 px-4 bg-primary text-white rounded hover:bg-secondary font-bold transition-colors shadow-lg disabled:opacity-50"
                                        >
                                            {group.status === 'running' ? 'Running...' : '▶ Run SQL'}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {group.result && (
                            <div className="col-span-full mt-4 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
                                <div className="p-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                                    <span className="text-sm font-bold text-gray-700">Query Results</span>
                                    <span className="text-xs text-gray-500">{group.result.rows.length} rows found</span>
                                </div>
                                <div className="p-1">
                                    <ResultSetTable result={group.result} />
                                </div>
                            </div>
                        )}

                        {group.status === 'loading' && (
                            <div className="absolute inset-0 bg-white/90 flex items-center justify-center z-10 rounded-lg backdrop-blur-sm">
                                <div className="bg-white p-6 rounded-lg shadow-xl border border-gray-100 flex flex-col items-center">
                                    <div className="w-10 h-10 border-4 border-gray-200 border-t-primary rounded-full animate-spin mb-3"></div>
                                    <span className="text-gray-700 font-medium">Processing...</span>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

        </div>
    );
};

import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { findLogEntriesOptimized, findLastId, replaceParamsInSql } from '../utils/sqlParser';
import { open } from '@tauri-apps/api/dialog';
import { invoke } from '@tauri-apps/api/tauri';

export const ParamsTab: React.FC = () => {
    const {
        queryGroups, addQueryGroup, updateQueryGroup, removeQueryGroup,
        autoClipboard, setAutoClipboard
    } = useAppStore();

    const [filePath, setFilePath] = useState<string>('');

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
                setFilePath(selected);
            }
        } catch (error) {
            console.error('Error selecting file:', error);
        }
    };

    const clearLogFile = () => {
        setFilePath('');
    };


    const readFileContent = async (path: string): Promise<string> => {
        try {
            // Use Tauri command to read file directly from filesystem
            // This can read files even when they're being used by other applications
            const content = await invoke<string>('read_log_file', { path });
            return content;
        } catch (error: any) {
            throw new Error(error || 'Không thể đọc file');
        }
    };

    const processQuery = async (groupId: string, statementId: string) => {
        if (!filePath) {
            alert('Vui lòng chọn file log trước');
            return;
        }
        if (!statementId) {
            alert('Vui lòng nhập Statement ID');
            return;
        }

        updateQueryGroup(groupId, { status: 'loading', statementId, errorMessage: undefined });

        try {
            // Read file content using Tauri backend
            const content = await readFileContent(filePath);

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

    const handleGetLastId = async (groupId: string) => {
        if (!filePath) {
            alert('Vui lòng chọn file log trước');
            return;
        }

        updateQueryGroup(groupId, { status: 'loading' });
        try {
            // Read file content using Tauri backend
            const content = await readFileContent(filePath);

            const lastId = findLastId(content);
            if (lastId) {
                updateQueryGroup(groupId, { statementId: lastId, status: 'idle' });
                // Auto-process with the last ID
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
                                className="px-4 py-2 bg-primary text-white text-sm rounded hover:bg-secondary transition-colors font-semibold"
                            >
                                📁 Choose File
                            </button>
                            {filePath && (
                                <div className="flex-1 p-2 border border-gray-300 rounded text-sm bg-gray-50 overflow-hidden text-ellipsis whitespace-nowrap" title={filePath}>
                                    {filePath}
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
                <button
                    onClick={addQueryGroup}
                    className="mt-6 px-4 py-2 bg-primary text-white rounded font-bold hover:bg-secondary transition-colors shadow-md"
                >
                    + Add
                </button>
            </div>

            <div className="flex flex-col gap-5">
                {queryGroups.map((group, index) => (
                    <div key={group.id} className="grid grid-cols-[300px_1fr] gap-5 p-5 border border-gray-200 rounded-lg bg-gray-50 relative shadow-sm hover:shadow-md transition-shadow">
                        <div className="col-span-full font-bold text-gray-700 border-b border-primary pb-2">
                            Query {index + 1}
                        </div>

                        <div className="flex flex-col gap-4">
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
                                    {group.status === 'loading' ? 'Processing...' : 'Get Data'}
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
                                    <button
                                        onClick={() => processQuery(group.id, group.statementId)}
                                        className="mt-2 px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 transition-colors"
                                    >
                                        🔄 Thử lại
                                    </button>
                                </div>
                            )}
                            {group.status === 'success' && (
                                <div className="bg-green-100 text-green-800 p-2 rounded border border-green-200 text-sm mb-2">
                                    Done
                                </div>
                            )}
                            <textarea
                                readOnly
                                value={group.sql}
                                placeholder="Result will appear here..."
                                className="flex-1 min-h-[200px] p-3 border border-gray-300 rounded font-mono text-sm bg-white focus:outline-none focus:border-primary"
                            />
                            {group.sql && (
                                <button
                                    onClick={() => copyResult(group.sql)}
                                    className="py-2 px-4 bg-green-600 text-white rounded hover:bg-green-700 font-bold transition-colors"
                                >
                                    Copy Result
                                </button>
                            )}
                        </div>

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

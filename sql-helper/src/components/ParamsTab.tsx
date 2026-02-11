import React, { useEffect } from 'react';
import { useAppStore, QueryResult, DbConfig } from '../store/useAppStore';
import { findLogEntriesOptimized, findLastId, replaceParamsInSql } from '../utils/sqlParser';
import { open } from '@tauri-apps/api/dialog';
import { invoke } from '@tauri-apps/api/tauri';
import { ResultSetTable } from './ResultSetTable';
import { checkDangerousSql } from '../utils/sqlGuard';

export const ParamsTab: React.FC = () => {
    const {
        queryGroups, addQueryGroup, updateQueryGroup, removeQueryGroup,
        autoClipboard, setAutoClipboard, connections,
        runShortcut
    } = useAppStore();

    const [globalLogPath, setGlobalLogPath] = React.useState<string>('');

    const [selectedConnId, setSelectedConnId] = React.useState<string | null>(null);
    const [showExecPicker, setShowExecPicker] = React.useState(false);

    const activeConn = connections.find(c => c.id === (selectedConnId || connections[0]?.id)) || connections[0];

    // Latest state ref to avoid stale closures and re-registrations
    const stateRef = React.useRef({ queryGroups, activeConn });
    useEffect(() => {
        stateRef.current = { queryGroups, activeConn };
    }, [queryGroups, activeConn]);

    useEffect(() => {
        const loadInitialLog = async () => {
            if (globalLogPath) {
                try {
                    await invoke<string>('read_log_file', { path: globalLogPath });
                } catch (e) {
                    console.error('Failed to auto-load log:', e);
                }
            }
        };
        loadInitialLog();
    }, [globalLogPath]);

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
                setGlobalLogPath(selected);
            }
        } catch (error) {
            console.error('Error selecting file:', error);
        }
    };

    const clearLogFile = () => {
        setGlobalLogPath('');
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
        if (!globalLogPath) {
            alert('Vui lòng chọn file log trước');
            return;
        }
        if (!statementId) {
            alert('Vui lòng nhập Statement ID');
            return;
        }

        updateQueryGroup(groupId, { status: 'loading', statementId, errorMessage: undefined });

        try {
            const content = await readFileContent(globalLogPath);
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

    const runSql = async (groupId: string, sql: string, conn: DbConfig) => {
        if (!sql) return;
        if (!conn) {
            alert('No database connection selected.');
            return;
        }

        if (!conn.verified) {
            alert('Kết nối này chưa được xác thực (Verified). Vui lòng vào Cài đặt và TEST CONNECT thành công trước khi sử dụng.');
            return;
        }

        const guard = checkDangerousSql(sql);
        if (guard.isDangerous) {
            alert(`⚠️ CẢNH BÁO NGUY HIỂM!\n\nPhát hiện câu lệnh "${guard.command}" trong truy vấn của bạn. Để đảm bảo an toàn, hệ thống không cho phép chạy các câu lệnh làm thay đổi dữ liệu (UPDATE, INSERT, DELETE, TRUNCATE, etc.) tại đây.`);
            updateQueryGroup(groupId, { status: 'error', errorMessage: `Security Block: ${guard.command} command detected.` });
            return;
        }

        updateQueryGroup(groupId, { status: 'running', errorMessage: undefined });
        try {
            const result = await invoke<QueryResult>('execute_query', {
                config: conn,
                query: sql
            });
            updateQueryGroup(groupId, { status: 'success', result });
        } catch (err: any) {
            const errorMessage = typeof err === 'string' ? err : JSON.stringify(err);
            updateQueryGroup(groupId, { status: 'error', errorMessage });
        }
    };

    const handleGetLastId = async (groupId: string) => {
        if (!globalLogPath) {
            alert('Vui lòng chọn file log trước');
            return;
        }

        updateQueryGroup(groupId, { status: 'loading' });
        try {
            const content = await readFileContent(globalLogPath);
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

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            let combo = '';
            if (e.ctrlKey) combo += 'CTRL+';
            if (e.shiftKey) combo += 'SHIFT+';
            if (e.altKey) combo += 'ALT+';
            if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
                combo += e.key.toUpperCase();
            }

            if (combo === runShortcut.toUpperCase()) {
                e.preventDefault();

                // Check if focused on a specific SQL textarea
                const activeEl = document.activeElement;
                if (activeEl?.id?.startsWith('sql-param-')) {
                    const targetId = activeEl.id.replace('sql-param-', '');
                    const group = stateRef.current.queryGroups.find(g => g.id === targetId);
                    if (group && group.sql && group.status !== 'running') {
                        runSql(group.id, group.sql, stateRef.current.activeConn);
                        return;
                    }
                }

                // If there's only 1 fragment with SQL, auto-run it without asking
                const groupsWithSql = stateRef.current.queryGroups.filter(g => g.sql && g.status !== 'running');
                if (groupsWithSql.length === 1) {
                    runSql(groupsWithSql[0].id, groupsWithSql[0].sql, stateRef.current.activeConn);
                    return;
                }

                // Otherwise, show picker if there are multiple fragments
                if (groupsWithSql.length > 1) {
                    setShowExecPicker(true);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [runShortcut]); // Only depend on shortcut, data comes from ref

    return (
        <div className="flex flex-col gap-5 p-5">
            <div className="flex flex-wrap gap-4 items-center justify-between p-5 bg-white rounded-2xl shadow-sm border border-gray-100">
                <div className="flex gap-6 items-center flex-1">

                    <div className="flex-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Log File Path</label>
                        <div className="flex gap-2 items-center">
                            <button
                                onClick={handleSelectFile}
                                className="px-4 py-2 bg-gray-900 text-white text-xs rounded-xl hover:bg-black transition-colors font-black uppercase tracking-tight shadow-md"
                            >
                                📁 Select
                            </button>
                            {globalLogPath ? (
                                <div className="flex-1 p-2 border border-gray-200 rounded-xl text-xs bg-gray-50 font-mono truncate" title={globalLogPath}>
                                    {globalLogPath}
                                </div>
                            ) : (
                                <div className="flex-1 p-2 border border-dashed border-gray-200 rounded-xl text-xs text-gray-300 italic">No log file selected</div>
                            )}
                            {globalLogPath && (
                                <button
                                    onClick={clearLogFile}
                                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Clear path"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 cursor-pointer group">
                        <input
                            type="checkbox"
                            checked={autoClipboard}
                            onChange={(e) => setAutoClipboard(e.target.checked)}
                            className="w-5 h-5 rounded-lg text-primary focus:ring-primary border-gray-200"
                        />
                        <span className="text-sm font-bold text-gray-600 group-hover:text-primary transition-colors">Auto Copy</span>
                    </label>
                    <button
                        onClick={addQueryGroup}
                        className="px-6 py-3 bg-primary text-white rounded-2xl font-black shadow-lg hover:shadow-primary/30 transition-all flex items-center gap-2"
                    >
                        <span className="text-xl">+</span> ADD FRAGMENT
                    </button>
                </div>
            </div>

            <div className="flex flex-col gap-6 pb-20">
                {queryGroups.map((group, index) => (
                    <div key={group.id} className="grid grid-cols-[300px_1fr] gap-6 p-6 border border-gray-100 rounded-3xl bg-white relative shadow-sm hover:shadow-md transition-all group/card">
                        <div className="col-span-full border-b border-gray-100 pb-3 flex justify-between items-center px-2">
                            <div className="flex items-center gap-4">
                                <span className="w-8 h-8 bg-gray-900 text-white rounded-xl flex items-center justify-center font-black text-xs shadow-lg">#{index + 1}</span>
                                <span className="font-black text-gray-800 uppercase tracking-tight">Query Fragment</span>
                            </div>
                            <div className="flex items-center gap-2">
                                {group.status === 'running' && (
                                    <span className="px-3 py-1 bg-primary/10 text-primary text-[10px] font-black uppercase rounded-lg animate-pulse">Executing...</span>
                                )}
                                <button
                                    onClick={() => updateQueryGroup(group.id, { isCollapsed: !group.isCollapsed })}
                                    className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-all"
                                    title={group.isCollapsed ? "Expand" : "Collapse"}
                                >
                                    {group.isCollapsed ? '➕' : '➖'}
                                </button>
                                <button
                                    onClick={() => removeQueryGroup(group.id)}
                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                >
                                    🗑️
                                </button>
                            </div>
                        </div>

                        {!group.isCollapsed ? (
                            <>
                                <div className="flex flex-col gap-5 pr-6 border-r border-gray-100">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Statement ID</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={group.statementId}
                                                onChange={(e) => updateQueryGroup(group.id, { statementId: e.target.value })}
                                                placeholder="e.g. 58cf74ef"
                                                className="flex-1 p-3 bg-gray-50 border border-gray-200 rounded-2xl font-mono text-sm outline-none focus:ring-2 focus:ring-primary transition-all shadow-inner"
                                            />
                                            <button
                                                onClick={() => handleGetLastId(group.id)}
                                                className="px-4 bg-gray-900 text-white rounded-2xl hover:bg-black transition-all shadow-md group/last font-black text-[10px] whitespace-nowrap"
                                                title="Get Last ID"
                                            >
                                                GET LAST ID
                                            </button>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => processQuery(group.id, group.statementId)}
                                        disabled={group.status === 'loading'}
                                        className="w-full py-3 bg-primary text-white rounded-2xl font-black shadow-lg hover:shadow-primary/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {group.status === 'loading' ? 'PROCESSING...' : <span>🔍 UPDATE SQL</span>}
                                    </button>
                                </div>

                                <div className="flex flex-col gap-4">
                                    <div className="relative">
                                        <textarea
                                            id={`sql-param-${group.id}`}
                                            value={group.sql}
                                            onChange={(e) => updateQueryGroup(group.id, { sql: e.target.value })}
                                            placeholder="SQL query with parameters replaced will appear here..."
                                            className="w-full min-h-[150px] p-5 bg-gray-50 border border-gray-200 rounded-3xl font-mono text-xs outline-none focus:ring-2 focus:ring-primary transition-all shadow-inner resize-y"
                                        />
                                        {group.sql && (
                                            <button
                                                onClick={() => copyResult(group.sql)}
                                                className="absolute top-4 right-4 p-2 bg-white border border-gray-200 rounded-xl shadow-sm hover:bg-gray-50 transition-all opacity-0 group-hover/card:opacity-100"
                                                title="Copy SQL"
                                            >
                                                📋
                                            </button>
                                        )}
                                    </div>

                                    {group.errorMessage && (
                                        <div className="p-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl text-[11px] font-bold animate-in shake duration-300">
                                            <div className="uppercase mb-1 flex items-center gap-2"><span>⚠️ ERROR:</span></div>
                                            <div className="font-mono">{group.errorMessage}</div>
                                        </div>
                                    )}

                                    <div className="flex gap-4">
                                        <div className="flex-1 flex gap-2 p-1 bg-gray-100 rounded-2xl border border-gray-200 shadow-inner">
                                            <select
                                                className={`flex-1 bg-transparent px-4 py-2 text-xs font-bold outline-none border-0 ${activeConn?.verified ? 'text-gray-600' : 'text-red-500'}`}
                                                value={selectedConnId || activeConn?.id || ''}
                                                onChange={(e) => setSelectedConnId(e.target.value)}
                                            >
                                                {connections.map(c => (
                                                    <option key={c.id} value={c.id} className="text-gray-800">
                                                        {c.verified ? '🛡️' : '⚠️'} Database: {c.name}
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                onClick={() => runSql(group.id, group.sql, activeConn)}
                                                disabled={group.status === 'running' || !group.sql || !activeConn?.verified}
                                                className={`px-8 py-2 rounded-xl font-black text-xs shadow-lg transition-all disabled:opacity-50 uppercase ${activeConn?.verified ? 'bg-gray-900 text-white hover:shadow-gray-400' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                                                title={!activeConn?.verified ? 'Vui lòng xác thực kết nối trong Settings' : ''}
                                            >
                                                {group.status === 'running' ? 'RUNNING...' : '▶ EXECUTE'}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {group.result && (
                                    <div className="col-span-full mt-4 animate-in slide-in-from-top-4 duration-500">
                                        <div className="bg-white border border-gray-200 rounded-3xl shadow-xl overflow-hidden">
                                            <div className="p-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center px-6">
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Query Result Set</span>
                                                <span className="text-[10px] font-black text-primary bg-primary/10 px-3 py-1 rounded-full uppercase italic">{group.result.rows.length} ROWS FOUND</span>
                                            </div>
                                            <div className="p-2">
                                                <ResultSetTable result={group.result} />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="col-span-full pt-2 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest border-r border-gray-200 pr-4">ID: <span className="font-mono text-primary">{group.statementId || '(None)'}</span></span>
                                    {group.sql && (
                                        <span className="text-xs text-gray-400 font-mono truncate max-w-[500px] italic">{group.sql.substring(0, 150)}...</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => processQuery(group.id, group.statementId)}
                                        disabled={group.status === 'loading'}
                                        className="px-4 py-1.5 bg-gray-900/5 text-gray-600 rounded-xl font-black text-[10px] uppercase hover:bg-primary hover:text-white transition-all whitespace-nowrap"
                                    >
                                        Update SQL
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}

                {queryGroups.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 bg-white border-2 border-dashed border-gray-200 rounded-[40px] text-gray-300 gap-4">
                        <span className="text-6xl">📄</span>
                        <p className="font-bold uppercase tracking-widest">Add a fragment to start processing</p>
                    </div>
                )}
            </div>

            {/* Params Execution Picker */}
            {showExecPicker && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowExecPicker(false)}>
                    <div className="bg-white rounded-[2.5rem] p-8 shadow-2xl border border-gray-100 flex flex-col gap-6 max-w-2xl w-full mx-4 max-h-[80vh] animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                        <div className="text-center">
                            <h3 className="text-xl font-black text-gray-800 uppercase tracking-tight mb-1">Select Fragment to Run</h3>
                            <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest font-mono">Choose from your active fragments</p>
                        </div>

                        <div className="overflow-y-auto flex flex-col gap-3 pr-2 custom-scrollbar">
                            {queryGroups.filter(g => g.sql).map((group, idx) => (
                                <button
                                    key={group.id}
                                    onClick={() => {
                                        setShowExecPicker(false);
                                        document.getElementById(`sql-param-${group.id}`)?.focus();
                                        runSql(group.id, group.sql, activeConn);
                                    }}
                                    className="flex items-center gap-4 p-4 rounded-2xl bg-gray-50 border border-gray-200 hover:border-primary hover:bg-primary/5 transition-all text-left group"
                                >
                                    <span className="w-10 h-10 bg-gray-900 text-white rounded-xl flex items-center justify-center font-black text-xs shrink-0 group-hover:bg-primary transition-colors">#{idx + 1}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-black text-gray-800 uppercase truncate">ID: {group.statementId || 'No ID'}</div>
                                        <div className="text-[10px] text-gray-400 font-mono truncate italic">{group.sql.substring(0, 100)}</div>
                                    </div>
                                    <span className="text-primary opacity-0 group-hover:opacity-100 transition-all font-black text-xs">RUN ▶</span>
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={() => setShowExecPicker(false)}
                            className="text-xs font-black text-gray-400 hover:text-gray-800 transition-all uppercase tracking-widest text-center"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

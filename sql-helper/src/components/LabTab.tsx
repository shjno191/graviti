import React, { useState, useEffect, useRef } from 'react';
import { useAppStore, QueryResult } from '../store/useAppStore';
import { invoke } from '@tauri-apps/api/tauri';

interface LabStatement {
    sql: string;
    result?: QueryResult;
    loading: boolean;
    error?: string;
    connectionId: string | null;
}

export const LabTab: React.FC = () => {
    const { connections } = useAppStore();
    const [stmt1, setStmt1] = useState<LabStatement>({ sql: '', loading: false, connectionId: connections[0]?.id || null });
    const [stmt2, setStmt2] = useState<LabStatement>({ sql: '', loading: false, connectionId: connections[0]?.id || null });
    const [searchTerm, setSearchTerm] = useState('');
    const [priorityCols, setPriorityCols] = useState('');
    const [menuPos, setMenuPos] = useState<{ x: number, y: number, type: 'col' | 'row', content?: string, rowIndex?: number, idx?: 1 | 2 } | null>(null);
    const [copyStatus, setCopyStatus] = useState<{ [key: string]: boolean }>({});

    const scrollRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});


    useEffect(() => {
        const handleClick = () => setMenuPos(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    // Sync connection IDs when connections load
    useEffect(() => {
        if (connections.length > 0) {
            setStmt1(prev => ({ ...prev, connectionId: prev.connectionId || connections[0].id }));
            setStmt2(prev => ({ ...prev, connectionId: prev.connectionId || connections[0].id }));
        }
    }, [connections]);

    const runQuery = async (idx: 1 | 2) => {
        const stmt = idx === 1 ? stmt1 : stmt2;
        const setStmt = idx === 1 ? setStmt1 : setStmt2;

        if (!stmt.sql.trim()) return;
        const conn = connections.find(c => c.id === stmt.connectionId) || connections[0];
        if (!conn) {
            alert('No database connection selected.');
            return;
        }

        if (!conn.verified) {
            alert('Kết nối này chưa được xác thực (Verified). Vui lòng vào Cài đặt và TEST CONNECT thành công trước khi sử dụng.');
            return;
        }

        setStmt(prev => ({ ...prev, loading: true, error: undefined }));
        try {
            const res = await invoke<QueryResult>('execute_query', {
                config: conn,
                query: stmt.sql
            });
            setStmt(prev => ({ ...prev, loading: false, result: res }));
        } catch (err: any) {
            setStmt(prev => ({ ...prev, loading: false, error: err }));
        }
    };

    const handleAddPriority = (col: string) => {
        const parts = priorityCols.split(',').map(p => p.trim().toUpperCase()).filter(Boolean);
        if (!parts.includes(col.toUpperCase())) {
            setPriorityCols(prev => prev ? `${prev}, ${col}` : col);
        }
        setMenuPos(null);
    };

    const copyToExcel = (idx: 1 | 2) => {
        const state = idx === 1 ? stmt1 : stmt2;
        if (!state.result) return;
        const header = state.result.columns.join('\t');
        const rows = state.result.rows.map(row => row.join('\t')).join('\n');
        const text = `${header}\n${rows}`;
        navigator.clipboard.writeText(text);
        setCopyStatus(prev => ({ ...prev, [idx]: true }));
        setTimeout(() => setCopyStatus(prev => ({ ...prev, [idx]: false })), 2000);
    };

    const handleCopyRow = (idx: 1 | 2, rowIndex: number) => {
        const state = idx === 1 ? stmt1 : stmt2;
        if (!state.result) return;
        const row = state.result.rows[rowIndex];
        const text = state.result.columns.map((col, i) => `${col}: ${row[i]}`).join('\n');
        navigator.clipboard.writeText(text);
        setMenuPos(null);
    };

    const handleGenerateInsert = (idx: 1 | 2, rowIndex: number) => {
        const state = idx === 1 ? stmt1 : stmt2;
        if (!state.result) return;
        const row = state.result.rows[rowIndex];
        const tableName = "TABLE_NAME";
        const cols = state.result.columns.join(', ');
        const values = row.map(v => {
            if (v === null || v === 'NULL') return 'NULL';
            return `'${String(v).replace(/'/g, "''")}'`;
        }).join(', ');
        const sql = `INSERT INTO ${tableName} (${cols})\nVALUES (${values});`;
        navigator.clipboard.writeText(sql);
        setMenuPos(null);
    };

    const getOrderedColumns = (originalCols: string[]) => {
        const priorityArray = priorityCols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
        let cols = [...originalCols];

        if (priorityArray.length > 0) {
            const inPriority = cols.filter(c => priorityArray.includes(c.toUpperCase()));
            inPriority.sort((a, b) => priorityArray.indexOf(a.toUpperCase()) - priorityArray.indexOf(b.toUpperCase()));
            const notInPriority = cols.filter(c => !priorityArray.includes(c.toUpperCase()));
            cols = [...inPriority, ...notInPriority];
        }
        return cols;
    };

    const handleScroll = (id: string, e: React.UIEvent<HTMLDivElement>) => {
        const target = e.currentTarget;
        Object.keys(scrollRefs.current).forEach(key => {
            if (scrollRefs.current[key] && key !== id) {
                scrollRefs.current[key]!.scrollLeft = target.scrollLeft;
                scrollRefs.current[key]!.scrollTop = target.scrollTop;
            }
        });
    };

    // Comparison Logic
    const isDifferent = (rowIdx: number, colName: string, val: string, otherResult?: QueryResult) => {
        if (!otherResult) return false;
        const otherColIdx = otherResult.columns.indexOf(colName);
        if (otherColIdx === -1) return false;
        const otherRow = otherResult.rows[rowIdx];
        if (!otherRow) return true; // Row exists in A but not in B
        return val !== otherRow[otherColIdx];
    };

    const renderTable = (idx: 1 | 2, state: LabStatement, otherState: LabStatement) => {
        if (state.loading) return <div className="p-10 text-center animate-pulse text-orange-500 font-bold">EXECUTING SQL...</div>;
        if (state.error) return <div className="p-6 bg-red-50 text-red-600 rounded-xl text-sm font-mono border border-red-100">{state.error}</div>;
        if (!state.result) return <div className="p-10 text-center text-gray-300 font-bold italic">No results yet. Run SQL to see data.</div>;

        const activeCols = getOrderedColumns(state.result.columns);
        const filteredRows = state.result.rows.filter(row =>
            !searchTerm || row.some(cell => String(cell).toLowerCase().includes(searchTerm.toLowerCase()))
        );

        return (
            <div
                ref={el => scrollRefs.current[`s${idx}`] = el}
                onScroll={(e) => handleScroll(`s${idx}`, e)}
                className="overflow-auto max-h-[500px] border border-gray-100 rounded-xl custom-scrollbar"
            >
                <table className="w-full text-left border-collapse min-w-max table-fixed">
                    <thead className="sticky top-0 z-20 bg-gray-50 border-b-2 border-gray-200">
                        <tr>
                            {activeCols.map(col => (
                                <th
                                    key={col}
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        setMenuPos({ x: e.clientX, y: e.clientY, type: 'col', content: col });
                                        e.stopPropagation();
                                    }}
                                    className="px-4 py-3 font-black text-gray-600 text-[10px] border-r border-gray-100 uppercase"
                                    style={{ width: 160 }}
                                >
                                    {col}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="bg-white">
                        {filteredRows.slice(0, 1000).map((row, rIdx) => (
                            <tr key={rIdx} className="border-b border-gray-50 hover:bg-orange-50/20 group">
                                {activeCols.map(col => {
                                    const cIdx = state.result!.columns.indexOf(col);
                                    const val = row[cIdx];
                                    const diff = isDifferent(state.result!.rows.indexOf(row), col, val, otherState.result);

                                    return (
                                        <td
                                            key={col}
                                            onContextMenu={(e) => {
                                                e.preventDefault();
                                                setMenuPos({ x: e.clientX, y: e.clientY, type: 'row', rowIndex: state.result!.rows.indexOf(row), idx });
                                                e.stopPropagation();
                                            }}
                                            className={`px-4 py-2 border-r border-gray-50 last:border-0 truncate font-mono text-[11px] ${diff ? 'bg-red-50 text-red-600 font-bold' : 'text-gray-700'
                                                }`}
                                            style={{ width: 160 }}
                                            title={String(val)}
                                        >
                                            {val}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    // Simplified connection resolution to match runQuery logic
    const activeConn1 = connections.find(c => c.id === stmt1.connectionId) || connections[0];
    const activeConn2 = connections.find(c => c.id === stmt2.connectionId) || connections[0];

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] gap-6 p-6 animate-in fade-in duration-300 overflow-hidden">
            {/* Toolbar */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap items-center gap-6 z-40">
                <h2 className="text-xl font-black bg-gradient-to-br from-orange-500 to-red-600 bg-clip-text text-transparent uppercase tracking-tight">Compare Lab</h2>

                <div className="flex-1 flex gap-4 min-w-[400px]">
                    <div className="relative flex-1 group">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                        <input
                            type="text"
                            placeholder="Global Search..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500 shadow-inner"
                        />
                    </div>
                    <div className="relative flex-1 group">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-500">⚡</span>
                        <input
                            type="text"
                            placeholder="Priority Columns..."
                            value={priorityCols}
                            onChange={e => setPriorityCols(e.target.value)}
                            className="w-full bg-orange-50 border border-orange-200 rounded-xl pl-10 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500 font-bold text-orange-900 shadow-inner"
                        />
                    </div>
                </div>

                <div className="px-4 py-2 bg-gray-100 rounded-xl flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{connections.length} Connections Loaded</span>
                </div>
            </div>

            {/* SQL Inputs */}
            <div className="grid grid-cols-2 gap-6 h-[250px] shrink-0">
                <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center px-4 bg-gray-900 py-2 rounded-t-2xl">
                        <div className="flex items-center gap-3">
                            <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Statement A</span>
                            <select
                                value={activeConn1?.id || ''}
                                onChange={e => setStmt1(prev => ({ ...prev, connectionId: e.target.value }))}
                                className={`bg-white/10 text-[10px] font-bold border-0 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-orange-500 transition-colors ${activeConn1?.verified ? 'text-white' : 'text-red-400'}`}
                            >
                                {connections.map(c => <option key={c.id} value={c.id} className="text-black">{c.verified ? '🛡️' : '⚠️'} {c.name}</option>)}
                            </select>
                        </div>
                        <button
                            onClick={() => runQuery(1)}
                            disabled={stmt1.loading || !activeConn1?.verified}
                            className={`px-4 py-1 text-[10px] font-black rounded transition-all shadow-lg disabled:opacity-50 ${activeConn1?.verified ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-gray-700 text-gray-400'}`}
                        >
                            RUN A
                        </button>
                    </div>
                    <textarea
                        value={stmt1.sql}
                        onChange={e => setStmt1(prev => ({ ...prev, sql: e.target.value }))}
                        placeholder="Paste SQL for Statement A..."
                        className="flex-1 bg-white border border-gray-200 rounded-b-2xl p-4 font-mono text-xs outline-none focus:ring-2 focus:ring-primary shadow-inner resize-none border-t-0"
                    />
                </div>
                <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center px-4 bg-gray-900 py-2 rounded-t-2xl">
                        <div className="flex items-center gap-3">
                            <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Statement B</span>
                            <select
                                value={activeConn2?.id || ''}
                                onChange={e => setStmt2(prev => ({ ...prev, connectionId: e.target.value }))}
                                className={`bg-white/10 text-[10px] font-bold border-0 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-orange-500 transition-colors ${activeConn2?.verified ? 'text-white' : 'text-red-400'}`}
                            >
                                {connections.map(c => <option key={c.id} value={c.id} className="text-black">{c.verified ? '🛡️' : '⚠️'} {c.name}</option>)}
                            </select>
                        </div>
                        <button
                            onClick={() => runQuery(2)}
                            disabled={stmt2.loading || !activeConn2?.verified}
                            className={`px-4 py-1 text-[10px] font-black rounded transition-all shadow-lg disabled:opacity-50 ${activeConn2?.verified ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-gray-700 text-gray-400'}`}
                        >
                            RUN B
                        </button>
                    </div>
                    <textarea
                        value={stmt2.sql}
                        onChange={e => setStmt2(prev => ({ ...prev, sql: e.target.value }))}
                        placeholder="Paste SQL for Statement B..."
                        className="flex-1 bg-white border border-gray-200 rounded-b-2xl p-4 font-mono text-xs outline-none focus:ring-2 focus:ring-primary shadow-inner resize-none border-t-0"
                    />
                </div>
            </div>

            {/* Data Comparison Area */}
            <div className="flex-1 grid grid-cols-2 gap-6 overflow-hidden bg-gray-50/50 p-2 rounded-3xl border border-gray-100 shadow-inner">
                <div className="flex flex-col overflow-hidden bg-white rounded-2xl shadow-sm border border-gray-100">
                    <div className="p-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center px-5">
                        <div className="flex items-center gap-3">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Results A</span>
                            <span className="text-[9px] bg-gray-200 px-2 py-0.5 rounded font-bold text-gray-600">
                                {connections.find(c => c.id === stmt1.connectionId)?.name || 'Unknown'}
                            </span>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => copyToExcel(1)}
                                className={`text-[9px] px-3 py-1 rounded font-black transition-all flex items-center gap-2 ${copyStatus[1] ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
                            >
                                {copyStatus[1] ? '✅ COPIED' : '📊 CLICK TO EXCEL'}
                            </button>
                            <span className="text-[10px] font-black text-orange-600">{stmt1.result?.rows.length || 0} ROWS</span>
                        </div>
                    </div>
                    <div className="flex-1 overflow-hidden p-2">
                        {renderTable(1, stmt1, stmt2)}
                    </div>
                </div>
                <div className="flex flex-col overflow-hidden bg-white rounded-2xl shadow-sm border border-gray-100">
                    <div className="p-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center px-5">
                        <div className="flex items-center gap-3">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Results B</span>
                            <span className="text-[9px] bg-gray-200 px-2 py-0.5 rounded font-bold text-gray-600">
                                {connections.find(c => c.id === stmt2.connectionId)?.name || 'Unknown'}
                            </span>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => copyToExcel(2)}
                                className={`text-[9px] px-3 py-1 rounded font-black transition-all flex items-center gap-2 ${copyStatus[2] ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
                            >
                                {copyStatus[2] ? '✅ COPIED' : '📊 CLICK TO EXCEL'}
                            </button>
                            <span className="text-[10px] font-black text-orange-600">{stmt2.result?.rows.length || 0} ROWS</span>
                        </div>
                    </div>
                    <div className="flex-1 overflow-hidden p-2">
                        {renderTable(2, stmt2, stmt1)}
                    </div>
                </div>
            </div>

            {/* Context Menu */}
            {menuPos && (
                <div
                    className="fixed z-[100] bg-white border border-gray-200 rounded-2xl shadow-2xl py-2 min-w-[200px] animate-in slide-in-from-top-1 duration-150"
                    style={{ left: menuPos.x, top: menuPos.y }}
                >
                    {menuPos.type === 'col' ? (
                        <>
                            <div className="px-4 py-1 mb-1 border-b border-gray-50">
                                <span className="text-[9px] font-black text-gray-400 font-mono italic uppercase">Column: {menuPos.content}</span>
                            </div>
                            <button onClick={() => { navigator.clipboard.writeText(menuPos.content!); setMenuPos(null); }} className="w-full px-4 py-2.5 text-left text-sm font-bold text-gray-700 hover:bg-orange-50 hover:text-orange-600 flex items-center gap-3">
                                <span className="text-lg">📋</span> Copy Column Name
                            </button>
                            <button onClick={() => handleAddPriority(menuPos.content!)} className="w-full px-4 py-2.5 text-left text-sm font-bold text-gray-700 hover:bg-orange-50 hover:text-orange-600 flex items-center gap-3">
                                <span className="text-lg text-orange-500">⚡</span> Set as Priority
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="px-4 py-1 mb-1 border-b border-gray-50">
                                <span className="text-[9px] font-black text-gray-400 font-mono italic uppercase">Record Options (Row {menuPos.rowIndex! + 1})</span>
                            </div>
                            <button onClick={() => handleCopyRow(menuPos.idx!, menuPos.rowIndex!)} className="w-full px-4 py-2.5 text-left text-sm font-bold text-gray-700 hover:bg-orange-50 hover:text-orange-600 flex items-center gap-3">
                                <span className="text-lg">📋</span> Copy Record
                            </button>
                            <button onClick={() => handleGenerateInsert(menuPos.idx!, menuPos.rowIndex!)} className="w-full px-4 py-2.5 text-left text-sm font-bold text-gray-700 hover:bg-orange-50 hover:text-orange-600 flex items-center gap-3 font-mono">
                                <span className="text-lg">📝</span> Generate INSERT
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

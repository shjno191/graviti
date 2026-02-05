import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAppStore, QueryResult } from '../store/useAppStore';
import { invoke } from '@tauri-apps/api/tauri';
import { checkDangerousSql } from '../utils/sqlGuard';

interface LabStatement {
    sql: string;
    result?: QueryResult;
    loading: boolean;
    error?: string;
    connectionId: string | null;
}

interface LabTableProps {
    idx: 1 | 2;
    state: LabStatement;
    otherState: LabStatement;
    excelHeaderColor: string;
    priorityCols: string;
    debouncedSearch: string;
    onContextMenuCol: (e: React.MouseEvent, col: string) => void;
    onContextMenuRow: (e: React.MouseEvent, rowIndex: number, idx: 1 | 2) => void;
    scrollRef: (el: HTMLDivElement | null) => void;
    onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
    getOrderedColumns: (cols: string[]) => string[];
    isDifferent: (rowIdx: number, colName: string, val: string, otherResult?: QueryResult) => boolean;
    colSearch: string;
}

const LabTable: React.FC<LabTableProps> = React.memo(({
    idx, state, otherState, excelHeaderColor, priorityCols, debouncedSearch,
    onContextMenuCol, onContextMenuRow, scrollRef, onScroll, getOrderedColumns, isDifferent, colSearch
}) => {
    if (state.loading) return <div className="p-10 text-center animate-pulse text-orange-500 font-bold">EXECUTING SQL...</div>;
    if (state.error) return <div className="p-6 bg-red-50 text-red-600 rounded-xl text-sm font-mono border border-red-100">{state.error}</div>;
    if (!state.result) return <div className="p-10 text-center text-gray-300 font-bold italic">No results yet. Run SQL to see data.</div>;

    const activeCols = useMemo(() => {
        let cols = getOrderedColumns(state.result?.columns || []);
        if (colSearch) {
            const terms = colSearch.toLowerCase().split(/[,/\-\s~]+/).filter(t => t.length > 0);
            if (terms.length > 0) {
                cols = cols.filter(c => {
                    const colNameLower = c.toLowerCase();
                    return terms.some(term => colNameLower.includes(term));
                });
            }
        }
        return cols;
    }, [state.result?.columns, priorityCols, getOrderedColumns, colSearch]);

    const filteredRows = useMemo(() => {
        if (!state.result) return [];
        if (!debouncedSearch) return state.result.rows;
        const lower = debouncedSearch.toLowerCase();
        return state.result.rows.filter(row =>
            row.some(cell => String(cell || "").toLowerCase().includes(lower))
        );
    }, [state.result, debouncedSearch]);

    const colIndices = useMemo(() => {
        if (!state.result) return {} as Record<string, number>;
        return activeCols.reduce((acc, col) => {
            acc[col] = state.result!.columns.indexOf(col);
            return acc;
        }, {} as Record<string, number>);
    }, [state.result, activeCols]);

    return (
        <div
            ref={scrollRef}
            onScroll={onScroll}
            className="overflow-auto max-h-[500px] border border-gray-100 rounded-xl custom-scrollbar"
        >
            <table className="w-full text-left border-collapse min-w-max table-fixed">
                <thead className="sticky top-0 z-20 border-b-2 border-gray-200" style={{ backgroundColor: excelHeaderColor }}>
                    <tr>
                        {activeCols.map(col => (
                            <th
                                key={col}
                                onContextMenu={(e) => onContextMenuCol(e, col)}
                                className="px-4 py-3 font-medium text-white text-[10px] border-r border-white/10 uppercase"
                                style={{ width: 160 }}
                            >
                                {col}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="bg-white">
                    {filteredRows.slice(0, 1000).map((row, rIdx) => {
                        const originalRowIdx = state.result!.rows.indexOf(row);
                        return (
                            <tr key={rIdx} className="border-b border-gray-50 hover:bg-orange-50/20 group">
                                {activeCols.map(col => {
                                    const cIdx = colIndices[col];
                                    const val = row[cIdx];
                                    const diff = isDifferent(originalRowIdx, col, val, otherState.result);

                                    return (
                                        <td
                                            key={col}
                                            onContextMenu={(e) => onContextMenuRow(e, originalRowIdx, idx)}
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
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
});

export const LabTab: React.FC = () => {
    const { connections, excelHeaderColor } = useAppStore();
    const [stmt1, setStmt1] = useState<LabStatement>({ sql: '', loading: false, connectionId: connections[0]?.id || null });
    const [stmt2, setStmt2] = useState<LabStatement>({ sql: '', loading: false, connectionId: connections[0]?.id || null });
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [colSearch, setColSearch] = useState('');
    const [priorityCols, setPriorityCols] = useState('');
    const [menuPos, setMenuPos] = useState<{ x: number, y: number, type: 'col' | 'row', content?: string, rowIndex?: number, idx?: 1 | 2 } | null>(null);
    const [copyStatus, setCopyStatus] = useState<{ [key: string]: boolean }>({});

    const scrollRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
    const isSyncing = useRef(false);

    useEffect(() => {
        const handleClick = () => setMenuPos(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => {
        if (connections.length > 0) {
            setStmt1(prev => ({ ...prev, connectionId: prev.connectionId || connections[0].id }));
            setStmt2(prev => ({ ...prev, connectionId: prev.connectionId || connections[0].id }));
        }
    }, [connections]);

    const runQuery = async (idx: 1 | 2) => {
        const setStmt = idx === 1 ? setStmt1 : setStmt2;
        const stmt = idx === 1 ? stmt1 : stmt2;

        if (!stmt.sql.trim()) return;
        const conn = connections.find(c => c.id === stmt.connectionId) || connections[0];
        if (!conn || !conn.verified) {
            alert(conn ? 'Kết nối này chưa được xác thực.' : 'No database connection selected.');
            return;
        }

        const guard = checkDangerousSql(stmt.sql);
        if (guard.isDangerous) {
            alert(`⚠️ CẢNH BÁO NGUY HIỂM!\n\nPhát hiện câu lệnh "${guard.command}" trong truy vấn của bạn. Để đảm bảo an toàn, hệ thống không cho phép chạy các câu lệnh làm thay đổi dữ liệu (UPDATE, INSERT, DELETE, TRUNCATE, etc.) tại đây.`);
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
            setStmt(prev => ({ ...prev, loading: false, error: String(err) }));
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

        const tableHtml = `
          <table style="border-collapse: collapse; border: 1px solid #000000;">
            <thead>
              <tr>
                ${state.result.columns.map(col => `<th style="background-color: ${excelHeaderColor}; color: #ffffff; padding: 8px; border: 1px solid #000000; font-family: sans-serif; font-size: 11pt; text-align: left;">${col}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${state.result.rows.map(row => `<tr>${row.map(cell => `<td style="color: #000000; padding: 6px 8px; border: 1px solid #000000; font-family: Calibri, sans-serif; font-size: 10pt; white-space: nowrap;">${cell === null ? 'NULL' : cell}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        `;

        const plainText = [state.result.columns.join('\t'), ...state.result.rows.map(row => row.join('\t'))].join('\n');
        const data = [new ClipboardItem({ 'text/html': new Blob([tableHtml], { type: 'text/html' }), 'text/plain': new Blob([plainText], { type: 'text/plain' }) })];

        navigator.clipboard.write(data).then(() => {
            setCopyStatus(prev => ({ ...prev, [idx]: true }));
            setTimeout(() => setCopyStatus(prev => ({ ...prev, [idx]: false })), 2000);
        });
    };

    const handleCopyRow = (idx: 1 | 2, rowIndex: number) => {
        const state = idx === 1 ? stmt1 : stmt2;
        if (!state.result) return;
        const row = state.result.rows[rowIndex];

        const tableHtml = `
          <table style="border-collapse: collapse; border: 1px solid #000000;">
            <thead>
              <tr>
                ${state.result.columns.map(col => `<th style="background-color: ${excelHeaderColor}; color: #ffffff; padding: 8px; border: 1px solid #000000; font-family: sans-serif; font-size: 11pt; text-align: left;">${col}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              <tr>
                ${row.map(cell => `<td style="color: #000000; padding: 6px 8px; border: 1px solid #000000; font-family: Calibri, sans-serif; font-size: 10pt; white-space: nowrap;">${cell === null ? 'NULL' : cell}</td>`).join('')}
              </tr>
            </tbody>
          </table>
        `;

        const plainText = state.result.columns.map((col, i) => `${col}: ${row[i]}`).join('\t');
        const data = [new ClipboardItem({ 'text/html': new Blob([tableHtml], { type: 'text/html' }), 'text/plain': new Blob([plainText], { type: 'text/plain' }) })];

        navigator.clipboard.write(data);
        setMenuPos(null);
    };

    const handleGenerateInsert = (idx: 1 | 2, rowIndex: number) => {
        const state = idx === 1 ? stmt1 : stmt2;
        if (!state.result) return;
        const row = state.result.rows[rowIndex];
        const tableName = "TABLE_NAME";
        const cols = state.result.columns.join(', ');
        const values = row.map(v => v === null || v === 'NULL' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`).join(', ');
        const sql = `INSERT INTO ${tableName} (${cols})\nVALUES (${values});`;
        navigator.clipboard.writeText(sql);
        setMenuPos(null);
    };

    const getOrderedColumns = useCallback((originalCols: string[]) => {
        const priorityArray = priorityCols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
        let cols = [...originalCols];
        if (priorityArray.length > 0) {
            const inPriority = cols.filter(c => priorityArray.includes(c.toUpperCase()));
            inPriority.sort((a, b) => priorityArray.indexOf(a.toUpperCase()) - priorityArray.indexOf(b.toUpperCase()));
            const notInPriority = cols.filter(c => !priorityArray.includes(c.toUpperCase()));
            cols = [...inPriority, ...notInPriority];
        }
        return cols;
    }, [priorityCols]);

    const handleScroll = useCallback((id: string, e: React.UIEvent<HTMLDivElement>) => {
        if (isSyncing.current) return;
        const target = e.currentTarget;
        requestAnimationFrame(() => {
            isSyncing.current = true;
            Object.keys(scrollRefs.current).forEach(key => {
                if (scrollRefs.current[key] && key !== id) {
                    scrollRefs.current[key]!.scrollLeft = target.scrollLeft;
                    scrollRefs.current[key]!.scrollTop = target.scrollTop;
                }
            });
            setTimeout(() => { isSyncing.current = false; }, 20);
        });
    }, []);

    const isDifferent = useCallback((rowIdx: number, colName: string, val: string, otherResult?: QueryResult) => {
        if (!otherResult) return false;
        const otherColIdx = otherResult.columns.indexOf(colName);
        if (otherColIdx === -1) return false;
        const otherRow = otherResult.rows[rowIdx];
        if (!otherRow) return true;
        return val !== otherRow[otherColIdx];
    }, []);

    const onContextMenuCol = useCallback((e: React.MouseEvent, col: string) => {
        e.preventDefault();
        setMenuPos({ x: e.clientX, y: e.clientY, type: 'col', content: col });
        e.stopPropagation();
    }, []);

    const onContextMenuRow = useCallback((e: React.MouseEvent, rowIndex: number, idx: 1 | 2) => {
        e.preventDefault();
        setMenuPos({ x: e.clientX, y: e.clientY, type: 'row', rowIndex, idx });
        e.stopPropagation();
    }, []);

    const activeConn1 = connections.find(c => c.id === stmt1.connectionId) || connections[0];
    const activeConn2 = connections.find(c => c.id === stmt2.connectionId) || connections[0];

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] gap-6 p-6 animate-in fade-in duration-300 overflow-hidden">
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap items-center gap-6 z-40">
                <h2 className="text-xl font-black bg-gradient-to-br from-orange-500 to-red-600 bg-clip-text text-transparent uppercase tracking-tight">Compare Lab</h2>
                <div className="flex-1 flex gap-4 min-w-[500px]">
                    <div className="relative flex-1 group">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                        <input
                            type="text"
                            placeholder="Data Search..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500 shadow-inner"
                        />
                    </div>
                    <div className="relative flex-1 group">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400">📋</span>
                        <input
                            type="text"
                            placeholder="Column Search..."
                            value={colSearch}
                            onChange={e => setColSearch(e.target.value)}
                            className="w-full bg-blue-50 border border-blue-100 rounded-xl pl-10 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 shadow-inner"
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
            </div>

            <div className="grid grid-cols-2 gap-6 h-[250px] shrink-0">
                {[1, 2].map(num => {
                    const stmt = num === 1 ? stmt1 : stmt2;
                    const setStmt = num === 1 ? setStmt1 : setStmt2;
                    const conn = num === 1 ? activeConn1 : activeConn2;
                    return (
                        <div key={num} className="flex flex-col gap-2">
                            <div className="flex justify-between items-center px-4 bg-gray-900 py-2 rounded-t-2xl">
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Statement {num === 1 ? 'A' : 'B'}</span>
                                    <select
                                        value={stmt.connectionId || ''}
                                        onChange={e => setStmt(prev => ({ ...prev, connectionId: e.target.value }))}
                                        className={`bg-white/10 text-[10px] font-bold border-0 rounded px-2 py-1 outline-none ${conn?.verified ? 'text-white' : 'text-red-400'}`}
                                    >
                                        {connections.map(c => <option key={c.id} value={c.id} className="text-black">{c.verified ? '🛡️' : '⚠️'} {c.name}</option>)}
                                    </select>
                                </div>
                                <button
                                    onClick={() => runQuery(num as 1 | 2)}
                                    disabled={stmt.loading || !conn?.verified}
                                    className={`px-4 py-1 text-[10px] font-black rounded transition-all ${conn?.verified ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-gray-700 text-gray-400'}`}
                                >
                                    {stmt.loading ? '...' : `RUN ${num === 1 ? 'A' : 'B'}`}
                                </button>
                            </div>
                            <textarea
                                value={stmt.sql}
                                onChange={e => setStmt(prev => ({ ...prev, sql: e.target.value }))}
                                placeholder={`Paste SQL for Statement ${num === 1 ? 'A' : 'B'}...`}
                                className="flex-1 bg-white border border-gray-200 rounded-b-2xl p-4 font-mono text-xs outline-none focus:ring-2 focus:ring-primary shadow-inner resize-none border-t-0"
                            />
                        </div>
                    );
                })}
            </div>

            <div className="flex-1 grid grid-cols-2 gap-6 overflow-hidden bg-gray-50/50 p-2 rounded-3xl border border-gray-100 shadow-inner">
                {[1, 2].map(num => {
                    const stmt = num === 1 ? stmt1 : stmt2;
                    const other = num === 1 ? stmt2 : stmt1;
                    return (
                        <div key={num} className="flex flex-col overflow-hidden bg-white rounded-2xl shadow-sm border border-gray-100">
                            <div className="p-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center px-5">
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Results {num === 1 ? 'A' : 'B'}</span>
                                    <span className="text-[10px] font-black text-orange-600">{stmt.result?.rows.length || 0} ROWS</span>
                                </div>
                                <button
                                    onClick={() => copyToExcel(num as 1 | 2)}
                                    className={`text-[9px] px-3 py-1 rounded font-black transition-all ${copyStatus[num] ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
                                >
                                    {copyStatus[num] ? '✅ COPIED' : '📊 COPY EXCEL'}
                                </button>
                            </div>
                            <div className="flex-1 overflow-hidden p-2">
                                <LabTable
                                    idx={num as 1 | 2}
                                    state={stmt}
                                    otherState={other}
                                    excelHeaderColor={excelHeaderColor}
                                    priorityCols={priorityCols}
                                    debouncedSearch={debouncedSearch}
                                    onContextMenuCol={onContextMenuCol}
                                    onContextMenuRow={onContextMenuRow}
                                    scrollRef={el => scrollRefs.current[`s${num}`] = el}
                                    onScroll={e => handleScroll(`s${num}`, e)}
                                    getOrderedColumns={getOrderedColumns}
                                    isDifferent={isDifferent}
                                    colSearch={colSearch}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>

            {menuPos && (
                <div className="fixed z-[100] bg-white border border-gray-200 rounded-2xl shadow-2xl py-2 min-w-[200px] animate-in slide-in-from-top-1" style={{ left: menuPos.x, top: menuPos.y }}>
                    {menuPos.type === 'col' ? (
                        <>
                            <div className="px-4 py-1 mb-1 border-b border-gray-50"><span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Column: {menuPos.content}</span></div>
                            <button onClick={() => { navigator.clipboard.writeText(menuPos.content!); setMenuPos(null); }} className="w-full px-4 py-2.5 text-left text-sm font-bold text-gray-700 hover:bg-orange-50 hover:text-orange-600 flex items-center gap-3"><span>📋</span> Copy Column Name</button>
                            <button onClick={() => handleAddPriority(menuPos.content!)} className="w-full px-4 py-2.5 text-left text-sm font-bold text-gray-700 hover:bg-orange-50 hover:text-orange-600 flex items-center gap-3"><span className="text-orange-500">⚡</span> Set as Priority</button>
                        </>
                    ) : (
                        <>
                            <div className="px-4 py-1 mb-1 border-b border-gray-50"><span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Row {menuPos.rowIndex! + 1}</span></div>
                            <button onClick={() => handleCopyRow(menuPos.idx!, menuPos.rowIndex!)} className="w-full px-4 py-2.5 text-left text-sm font-bold text-gray-700 hover:bg-orange-50 hover:text-orange-600 flex items-center gap-3"><span>📋</span> Copy Record (Excel Horizontal)</button>
                            <button onClick={() => handleGenerateInsert(menuPos.idx!, menuPos.rowIndex!)} className="w-full px-4 py-2.5 text-left text-sm font-bold text-gray-700 hover:bg-orange-50 hover:text-orange-600 flex items-center gap-3"><span>📝</span> Generate INSERT</button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

import React, { useState, useEffect, useMemo } from 'react';
import { readBinaryFile } from '@tauri-apps/api/fs';
import * as XLSX from 'xlsx';
import { useAppStore } from '../store/useAppStore';

interface TranslateEntry {
    japanese: string;
    english: string;
}

export const TranslateTab: React.FC = () => {
    const { activeTab } = useAppStore();
    const [data, setData] = useState<TranslateEntry[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [copyFeedback, setCopyFeedback] = useState<{ row: number, col: 'jp' | 'en' } | null>(null);

    useEffect(() => {
        if (activeTab === 'translate') {
            loadData();
        }
    }, [activeTab]);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const filePath = 'D:\\graviti\\sql-helper\\data\\translate.xlsx';
            const contents = await readBinaryFile(filePath);
            const workbook = XLSX.read(contents, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][];
            const entries: TranslateEntry[] = [];

            let startIndex = 0;
            if (jsonData.length > 0) {
                const firstRowStr = JSON.stringify(jsonData[0]).toLowerCase();
                if (firstRowStr.includes("japan") || firstRowStr.includes("en") || firstRowStr.includes("日")) {
                    startIndex = 1;
                }
            }

            for (let i = startIndex; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (row && row.length >= 2) {
                    const jp = String(row[0] || "").trim();
                    const en = String(row[1] || "").trim();
                    if (jp || en) {
                        entries.push({ japanese: jp, english: en });
                    }
                }
            }
            setData(entries);
        } catch (err: any) {
            console.error('Error loading Excel:', err);
            setError(`Lỗi: ${err.message || err}`);
        } finally {
            setLoading(false);
        }
    };

    const filteredData = useMemo(() => {
        if (!searchTerm) return data;
        const lowerSearch = searchTerm.toLowerCase();
        return data.filter(item =>
            item.japanese.toLowerCase().includes(lowerSearch) ||
            item.english.toLowerCase().includes(lowerSearch)
        );
    }, [data, searchTerm]);

    const handleCopy = (text: string, rowIdx: number, col: 'jp' | 'en') => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopyFeedback({ row: rowIdx, col });
        setTimeout(() => setCopyFeedback(null), 600);
    };

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] gap-4 p-4 animate-in fade-in duration-300 overflow-hidden font-sans">
            {/* Header */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex items-center gap-6">
                <div className="shrink-0">
                    <h2 className="text-lg font-black bg-gradient-to-br from-indigo-600 to-violet-600 bg-clip-text text-transparent uppercase tracking-tight">
                        Dictionary
                    </h2>
                    <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest leading-none">{data.length} TOTAL</span>
                </div>

                <div className="flex-1 relative group">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm opacity-50">🔍</span>
                    <input
                        type="text"
                        placeholder="Search Japanese or Code..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium shadow-inner"
                        autoFocus
                    />
                </div>

                <button
                    onClick={loadData}
                    className="p-2 hover:bg-gray-100 rounded-xl transition-all text-gray-400 hover:text-indigo-600 border border-gray-100 shadow-sm active:scale-95"
                    title="Reload"
                >
                    🔄
                </button>
            </div>

            {/* Table Area */}
            <div className="flex-1 overflow-hidden bg-white rounded-2xl border border-gray-300 shadow-sm flex flex-col">
                <div className="grid grid-cols-2 bg-gray-100 text-gray-600 border-b border-gray-300 sticky top-0 z-10">
                    <div className="px-6 py-3 text-[10px] font-black uppercase tracking-widest border-r border-gray-300 flex items-center gap-2">
                        🇯🇵 Japanese
                    </div>
                    <div className="px-6 py-3 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                        🔡 English / Code
                    </div>
                </div>

                <div className="flex-1 overflow-auto custom-scrollbar">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-full p-4">
                            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                            <p className="text-xs text-gray-500 font-bold">Loading Data...</p>
                        </div>
                    ) : (
                        <table className="w-full border-collapse table-fixed">
                            <tbody>
                                {filteredData.map((item, idx) => (
                                    <tr key={idx} className="border-b border-gray-200 group transition-colors">
                                        {/* Japanese Column */}
                                        <td
                                            className={`px-6 py-3 border-r border-gray-200 cursor-pointer align-middle transition-all duration-300 relative
                                                ${copyFeedback?.row === idx && copyFeedback.col === 'jp' ? 'bg-green-100' : 'hover:bg-indigo-50/50'}
                                            `}
                                            onClick={() => handleCopy(item.japanese, idx, 'jp')}
                                        >
                                            <div className="flex justify-between items-center pr-2">
                                                <span className={`text-[13px] font-bold text-gray-700 leading-relaxed break-words whitespace-pre-wrap ${copyFeedback?.row === idx && copyFeedback.col === 'jp' ? 'scale-105' : ''} transition-transform`}>
                                                    {item.japanese}
                                                </span>
                                                <div className="flex items-center">
                                                    {copyFeedback?.row === idx && copyFeedback.col === 'jp' ? (
                                                        <span className="text-[10px] text-green-600 font-black animate-bounce">COPIED!</span>
                                                    ) : (
                                                        <span className="opacity-0 group-hover:opacity-100 text-[10px] text-gray-300">📋</span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>

                                        {/* English Column */}
                                        <td
                                            className={`px-6 py-3 cursor-pointer align-middle transition-all duration-300 relative
                                                ${copyFeedback?.row === idx && copyFeedback.col === 'en' ? 'bg-green-100' : 'hover:bg-indigo-50/50'}
                                            `}
                                            onClick={() => handleCopy(item.english, idx, 'en')}
                                        >
                                            <div className="flex justify-between items-center pr-2">
                                                <span className={`text-[13px] font-mono font-black text-indigo-600 leading-relaxed break-all uppercase ${copyFeedback?.row === idx && copyFeedback.col === 'en' ? 'scale-105' : ''} transition-transform`}>
                                                    {item.english}
                                                </span>
                                                <div className="flex items-center">
                                                    {copyFeedback?.row === idx && copyFeedback.col === 'en' ? (
                                                        <span className="text-[10px] text-green-600 font-black animate-bounce">COPIED!</span>
                                                    ) : (
                                                        <span className="opacity-0 group-hover:opacity-100 text-[10px] text-gray-300">📋</span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {/* Empty rows if no matching data */}
                                {filteredData.length === 0 && !loading && (
                                    <tr>
                                        <td colSpan={2} className="p-20 text-center text-gray-400 text-xs font-bold uppercase tracking-widest">
                                            No matches found
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            <div className="px-2">
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter italic">
                    * Click any cell to copy. Animation confirms success. Long text will wrap automatically.
                </p>
            </div>
        </div>
    );
};

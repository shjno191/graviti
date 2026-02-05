import React, { useState, useEffect, useMemo, useRef } from 'react';
import { readBinaryFile, writeBinaryFile, readTextFile, writeTextFile } from '@tauri-apps/api/fs';
import { invoke } from '@tauri-apps/api/tauri';
import { open as openDialog } from '@tauri-apps/api/dialog';
import * as XLSX from 'xlsx';
import { useAppStore } from '../store/useAppStore';

interface TranslateEntry {
    japanese: string;
    english: string;
    vietnamese: string;
}

interface TranslatedSegment {
    type: 'text' | 'phrase';
    text: string;
    original: string;
    key: string;
    isMultiple: boolean;
    options: string[];
}

interface TranslatedLine {
    segments: TranslatedSegment[];
}

export const TranslateTab: React.FC = () => {
    const {
        activeTab,
        translateFilePath,
        setTranslateFilePath,
        setActiveTab,
        excelHeaderColor
    } = useAppStore();

    const [data, setData] = useState<TranslateEntry[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [copyFeedback, setCopyFeedback] = useState<{ row: number, col: 'jp' | 'en' | 'vi' } | null>(null);
    const [subTab, setSubTab] = useState<'dictionary' | 'quick'>('dictionary');
    const [bulkInput, setBulkInput] = useState('');
    const [targetLang, setTargetLang] = useState<'jp' | 'en' | 'vi'>('en');
    const [syncing, setSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState(0);
    const [selections, setSelections] = useState<Record<string, string>>({});
    const [translatedLines, setTranslatedLines] = useState<TranslatedLine[]>([]);
    const [hoveredKey, setHoveredKey] = useState<string | null>(null);
    const [translatePriority, setTranslatePriority] = useState('');

    const inputRef = useRef<HTMLTextAreaElement>(null);
    const outputRef = useRef<HTMLDivElement>(null);
    const highlighterRef = useRef<HTMLDivElement>(null);

    const handleInputScroll = () => {
        if (inputRef.current) {
            if (outputRef.current) outputRef.current.scrollTop = inputRef.current.scrollTop;
            if (highlighterRef.current) highlighterRef.current.scrollTop = inputRef.current.scrollTop;
        }
    };

    const handleOutputScroll = () => {
        if (outputRef.current && inputRef.current) {
            inputRef.current.scrollTop = outputRef.current.scrollTop;
            if (highlighterRef.current) highlighterRef.current.scrollTop = outputRef.current.scrollTop;
        }
    };

    const handleSortInput = () => {
        if (!bulkInput.trim()) return;
        const priorityArray = translatePriority.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
        if (priorityArray.length === 0) return;

        const lines = bulkInput.split('\n');
        lines.sort((a, b) => {
            const aUpper = a.trim().toUpperCase();
            const bUpper = b.trim().toUpperCase();

            const aIdx = priorityArray.findIndex(p => aUpper.includes(p));
            const bIdx = priorityArray.findIndex(p => bUpper.includes(p));

            if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
            if (aIdx !== -1) return -1;
            if (bIdx !== -1) return 1;

            return a.localeCompare(b);
        });

        setBulkInput(lines.join('\n'));
    };

    // Reset selections when input changes or target language changes
    useEffect(() => {
        setSelections({});
    }, [bulkInput, targetLang]);

    const loadData = async (forceSync = false) => {
        if (!translateFilePath) {
            setLoading(false);
            setError("Đường dẫn file dữ liệu chưa được cấu hình.");
            return;
        }

        setLoading(forceSync ? false : true);
        if (forceSync) setSyncing(true);
        setSyncProgress(0);
        setError(null);

        try {
            const excelPath = translateFilePath.toLowerCase().endsWith('.xlsx')
                ? translateFilePath
                : translateFilePath.replace(/\.json$/i, '.xlsx');
            const jsonPath = translateFilePath.toLowerCase().endsWith('.json')
                ? translateFilePath
                : translateFilePath.replace(/\.xlsx$/i, '.json');

            let entries: TranslateEntry[] = [];

            const performSyncFromExcel = async () => {
                setSyncProgress(10);
                const contents = await readBinaryFile(excelPath);
                setSyncProgress(30);
                const workbook = XLSX.read(contents, { type: 'array' });
                setSyncProgress(50);
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][];

                let startIndex = 0;
                let headerRows: any[][] = [];
                if (jsonData.length > 0) {
                    const firstRowStr = JSON.stringify(jsonData[0]).toLowerCase();
                    if (firstRowStr.includes("japan") || firstRowStr.includes("en") || firstRowStr.includes("vi") || firstRowStr.includes("日")) {
                        startIndex = 1;
                        headerRows = [jsonData[0]];
                    }
                }

                setSyncProgress(70);
                const seenEntries = new Set<string>();
                const uniqueResults: TranslateEntry[] = [];
                let duplicateCount = 0;

                for (let i = startIndex; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if (row && row.length >= 2) {
                        const jp = String(row[0] || "").trim();
                        const en = String(row[1] || "").trim();
                        const vi = String(row[2] || "").trim();

                        if (jp || en || vi) {
                            // Unique key is now combination of JP and EN to only remove exact duplicates of these two.
                            const pairKey = `${jp.toLowerCase()}|${en.toLowerCase()}`;
                            if (!seenEntries.has(pairKey)) {
                                seenEntries.add(pairKey);
                                uniqueResults.push({ japanese: jp, english: en, vietnamese: vi });
                            } else {
                                duplicateCount++;
                            }
                        }
                    }
                }

                setSyncProgress(85);
                let writeSucceeded = true;
                let writeError = null;

                if (duplicateCount > 0 && forceSync) {
                    try {
                        const cleanAoa = [
                            ...headerRows,
                            ...uniqueResults.map(item => [item.japanese, item.english, item.vietnamese])
                        ];
                        const newWorksheet = XLSX.utils.aoa_to_sheet(cleanAoa);
                        const newWorkbook = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, firstSheetName);
                        const excelBuffer = XLSX.write(newWorkbook, { bookType: 'xlsx', type: 'array' });
                        await writeBinaryFile(excelPath, new Uint8Array(excelBuffer));
                    } catch (excelErr: any) {
                        console.error("Could not write back to Excel:", excelErr);
                        writeSucceeded = false;
                        const errorStr = excelErr.toString().toLowerCase();
                        if (errorStr.includes("access is denied") || errorStr.includes("permission denied") || errorStr.includes("os error 32")) {
                            writeError = "locked";
                        } else {
                            writeError = excelErr.message || String(excelErr);
                        }
                    }
                }

                setSyncProgress(95);
                await writeTextFile(jsonPath, JSON.stringify(uniqueResults, null, 2));
                setSyncProgress(100);
                return { entries: uniqueResults, cleaned: duplicateCount, writeSucceeded, writeError };
            };

            let syncResult: { entries: TranslateEntry[], cleaned: number, writeSucceeded: boolean, writeError: string | null } | undefined;
            if (forceSync) {
                syncResult = await performSyncFromExcel();
                entries = syncResult.entries;
            } else {
                try {
                    const content = await readTextFile(jsonPath);
                    entries = JSON.parse(content);
                } catch (e) {
                    try {
                        syncResult = await performSyncFromExcel();
                        entries = syncResult.entries;
                    } catch (excelErr) {
                        throw new Error("Không tìm thấy cả file Excel lẫn file JSON dữ liệu.");
                    }
                }
            }

            setData(entries);
            if (forceSync) {
                setTimeout(() => {
                    setSyncing(false);
                    setSyncProgress(0);

                    if (syncResult) {
                        let msg = "JSON: Sync thành công\n";
                        if (syncResult.cleaned > 0) {
                            msg += `Excel: Phát hiện ${syncResult.cleaned} key trùng\n`;
                            if (!syncResult.writeSucceeded) {
                                msg += "Excel: Chưa xóa được do Excel đang mở";
                            } else {
                                msg += "Excel: Đã dọn dẹp thành công";
                            }
                        } else {
                            msg += "Excel: Dữ liệu đã sạch";
                        }
                        alert(msg);
                    } else {
                        alert("JSON: Sync thành công\nExcel: Dữ liệu đã tải");
                    }
                }, 500);
            }
        } catch (err: any) {
            console.error('Error loading data:', err);
            setError(`Lỗi: ${err.message || err}`);
            setSyncing(false);
        } finally {
            setLoading(false);
        }
    };

    const handleSync = () => loadData(true);

    const filteredData = useMemo(() => {
        if (!searchTerm) return data;
        const lowerSearch = searchTerm.toLowerCase();
        return data.filter(item =>
            item.japanese.toLowerCase().includes(lowerSearch) ||
            item.english.toLowerCase().includes(lowerSearch) ||
            item.vietnamese.toLowerCase().includes(lowerSearch)
        );
    }, [data, searchTerm]);

    const handleCopy = (text: string, rowIdx: number, col: 'jp' | 'en' | 'vi') => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopyFeedback({ row: rowIdx, col });
        setTimeout(() => setCopyFeedback(null), 600);
    };

    // Memoize the dictionary transformation to avoid re-calculating/sorting on every keystroke
    const translationDict = useMemo(() => {
        if (data.length === 0) return [];

        const targetKey: keyof TranslateEntry = targetLang === 'en' ? 'english' : targetLang === 'vi' ? 'vietnamese' : 'japanese';
        const sourceKeys: (keyof TranslateEntry)[] = (['japanese', 'english', 'vietnamese'] as (keyof TranslateEntry)[]).filter(k => k !== targetKey);

        const dictMap = new Map<string, Set<string>>();
        data.forEach(entry => {
            const replacement = String(entry[targetKey] || "").trim();
            if (!replacement) return;

            sourceKeys.forEach(sKey => {
                const phrase = String(entry[sKey] || "").trim();
                // If Jjp is standard, maybe we only want to source from Japanese? 
                // But keeping flexibility for now as the user didn't explicitly forbid other sources.
                // However, "lấy key Jjp làm chuẩn" might mean JP column is the main key.
                if (phrase && phrase !== replacement) {
                    if (!dictMap.has(phrase)) {
                        dictMap.set(phrase, new Set());
                    }
                    dictMap.get(phrase)!.add(replacement);
                }
            });
        });

        const sorted = Array.from(dictMap.entries())
            .map(([phrase, replacements]) => ({
                phrase,
                replacements: Array.from(replacements),
                regex: new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
            }))
            .sort((a, b) => b.phrase.length - a.phrase.length);

        return sorted;
    }, [data, targetLang]);

    // Use a timeout to debounce heavy translation logic
    useEffect(() => {
        if (!bulkInput) {
            setTranslatedLines([]);
            return;
        }

        const timer = setTimeout(() => {
            const lines = bulkInput.split('\n');
            const newTranslatedLines: TranslatedLine[] = lines.map((line, lIdx) => {
                const matches: { start: number, end: number, replacements: string[], phrase: string }[] = [];

                for (const item of translationDict) {
                    let match;
                    item.regex.lastIndex = 0;
                    while ((match = item.regex.exec(line)) !== null) {
                        const start = match.index;
                        const end = start + item.phrase.length;
                        if (!matches.some(m => (start < m.end && end > m.start))) {
                            matches.push({ start, end, replacements: item.replacements, phrase: item.phrase });
                        }
                        if (item.phrase.length === 0) break;
                    }
                }

                matches.sort((a, b) => a.start - b.start);

                const segments: TranslatedSegment[] = [];
                let lastIndex = 0;
                matches.forEach((match) => {
                    if (match.start > lastIndex) {
                        segments.push({
                            type: 'text',
                            text: line.substring(lastIndex, match.start),
                            original: line.substring(lastIndex, match.start),
                            key: `t-${lIdx}-${lastIndex}`,
                            isMultiple: false,
                            options: []
                        });
                    }

                    const key = `p-${lIdx}-${match.start}`;
                    const selected = selections[key] || match.replacements[0];

                    segments.push({
                        type: 'phrase',
                        text: selected,
                        original: match.phrase,
                        key: key,
                        isMultiple: match.replacements.length > 1,
                        options: match.replacements
                    });
                    lastIndex = match.end;
                });

                if (lastIndex < line.length) {
                    segments.push({
                        type: 'text',
                        text: line.substring(lastIndex),
                        original: line.substring(lastIndex),
                        key: `t-${lIdx}-${lastIndex}`,
                        isMultiple: false,
                        options: []
                    });
                }

                return { segments };
            });
            setTranslatedLines(newTranslatedLines);
        }, 150);

        return () => clearTimeout(timer);
    }, [bulkInput, translationDict, selections]);

    useEffect(() => {
        if (activeTab === 'translate' && data.length === 0) {
            loadData();
        }
    }, [activeTab]);

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] gap-4 p-4 animate-in fade-in duration-300 overflow-hidden font-sans">
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex items-center gap-6">
                <div className="shrink-0 flex items-center bg-gray-100 p-1.5 rounded-2xl border border-gray-200 shadow-sm">
                    <button
                        onClick={() => setSubTab('dictionary')}
                        className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-300 ${subTab === 'dictionary'
                            ? 'bg-white text-indigo-600 shadow-md scale-105'
                            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                            }`}
                    >
                        <span>📚 DICTIONARY</span>
                    </button>
                    <button
                        onClick={() => setSubTab('quick')}
                        className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-300 ${subTab === 'quick'
                            ? 'bg-white text-indigo-600 shadow-md scale-105'
                            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                            }`}
                    >
                        <span>⚡ QUICK TRANSLATE</span>
                    </button>
                </div>

                <div className="flex-1 flex items-center gap-4">
                    {subTab === 'dictionary' ? (
                        <div className="flex-1 relative group">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm opacity-50">🔍</span>
                            <input
                                type="text"
                                placeholder="Search Japanese, English or Vietnamese..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium shadow-inner"
                                autoFocus
                            />
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center gap-3">
                            <div className="relative flex-1 group">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-500">⚡</span>
                                <input
                                    type="text"
                                    placeholder="Sort Priority (e.g. ID, NAME, AGE)..."
                                    value={translatePriority}
                                    onChange={e => setTranslatePriority(e.target.value)}
                                    className="w-full bg-indigo-50 border border-indigo-200 rounded-xl pl-10 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-indigo-900 shadow-inner"
                                />
                            </div>
                            <button
                                onClick={handleSortInput}
                                className="px-4 py-2 bg-indigo-600 text-white text-[10px] font-black rounded-xl hover:bg-indigo-700 transition-all shadow-md active:scale-95 shrink-0"
                            >
                                SORT INPUT
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={async () => {
                            const excelPath = translateFilePath.toLowerCase().endsWith('.xlsx')
                                ? translateFilePath
                                : translateFilePath.replace(/\.json$/i, '.xlsx');
                            await invoke('open_file', { path: excelPath });
                        }}
                        className="flex items-center gap-2 px-3 py-2 bg-green-50 text-green-600 rounded-xl text-[10px] font-black hover:bg-green-100 border border-green-200 transition-all active:scale-95 shadow-sm"
                        title="Mở Excel để nhập liệu"
                    >
                        📂 OPEN EXCEL
                    </button>

                    <button
                        onClick={handleSync}
                        disabled={syncing}
                        className={`flex items-center gap-3 px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black hover:bg-indigo-700 transition-all active:scale-95 shadow-lg shadow-indigo-200 relative overflow-hidden`}
                        title="Đồng bộ & Làm sạch dữ liệu từ Excel"
                    >
                        {syncing && (
                            <div
                                className="absolute left-0 top-0 h-full bg-white/20 transition-all duration-300 pointer-events-none"
                                style={{ width: `${syncProgress}%` }}
                            />
                        )}
                        <span className="relative z-10">
                            {syncing ? `SYNCING ${syncProgress}%` : '⚡ SYNC & CLEAN'}
                        </span>
                    </button>
                    <button
                        onClick={handleSync}
                        className="p-2 hover:bg-gray-100 rounded-xl transition-all text-gray-400 hover:text-indigo-600 border border-gray-100 shadow-sm active:scale-95"
                        title="Reload & Sync"
                    >
                        🔄
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-hidden bg-white rounded-2xl border border-gray-300 shadow-sm flex flex-col">
                {subTab === 'dictionary' ? (
                    <>
                        <div className="grid grid-cols-3 border-b border-gray-300 sticky top-0 z-10" style={{ backgroundColor: excelHeaderColor }}>
                            <div className="px-4 py-3 text-[10px] font-medium text-white uppercase tracking-widest border-r border-white/20 flex items-center gap-2">
                                🇯🇵 Japanese
                            </div>
                            <div className="px-4 py-3 text-[10px] font-medium text-white uppercase tracking-widest border-r border-white/20 flex items-center gap-2">
                                🔡 English / Code
                            </div>
                            <div className="px-4 py-3 text-[10px] font-medium text-white uppercase tracking-widest flex items-center gap-2">
                                🇻🇳 Vietnamese
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto custom-scrollbar">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center h-full p-4">
                                    <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                                    <p className="text-xs text-gray-500 font-bold">Loading Data...</p>
                                </div>
                            ) : error ? (
                                <div className="flex flex-col items-center justify-center h-full p-10 text-center bg-gray-50/50">
                                    <div className="text-4xl mb-4">📂</div>
                                    <p className="text-gray-800 font-bold text-sm mb-2 max-w-sm">{error}</p>
                                    <div className="flex gap-3 mt-6">
                                        <button
                                            onClick={async () => {
                                                const selected = await openDialog({
                                                    filters: [{ name: 'Data', extensions: ['json', 'xlsx'] }]
                                                });
                                                if (selected && typeof selected === 'string') {
                                                    setTranslateFilePath(selected);
                                                }
                                            }}
                                            className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black shadow-lg hover:bg-indigo-700 transition-all active:scale-95"
                                        >
                                            CHỌN FILE NGAY
                                        </button>
                                        <button
                                            onClick={() => setActiveTab('settings')}
                                            className="px-5 py-2 bg-white text-gray-600 border border-gray-200 rounded-xl text-xs font-black shadow-sm hover:bg-gray-50 transition-all active:scale-95"
                                        >
                                            VÀO CÀI ĐẶT
                                        </button>
                                        <button
                                            onClick={handleSync}
                                            className="px-5 py-2 bg-gray-100 text-gray-400 rounded-xl text-xs font-black hover:bg-gray-200 transition-all active:scale-95"
                                        >
                                            THỬ LẠI
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <table className="w-full border-collapse table-fixed">
                                    <tbody>
                                        {filteredData.map((item, idx) => (
                                            <tr key={idx} className="border-b border-gray-200 group transition-colors">
                                                <td
                                                    className={`px-4 py-2.5 border-r border-gray-200 cursor-pointer align-middle transition-all duration-300 relative
                                                        ${copyFeedback?.row === idx && copyFeedback.col === 'jp' ? 'bg-green-100' : 'hover:bg-indigo-50/50'}
                                                    `}
                                                    onClick={() => handleCopy(item.japanese, idx, 'jp')}
                                                >
                                                    <div className="flex justify-between items-center">
                                                        <span className={`text-[12px] font-bold text-gray-700 leading-tight whitespace-pre-wrap break-words`}>
                                                            {item.japanese}
                                                        </span>
                                                        {copyFeedback?.row === idx && copyFeedback.col === 'jp' && <span className="text-[9px] text-green-600 font-black animate-pulse">COPY!</span>}
                                                    </div>
                                                </td>

                                                <td
                                                    className={`px-4 py-2.5 border-r border-gray-200 cursor-pointer align-middle transition-all duration-300 relative
                                                        ${copyFeedback?.row === idx && copyFeedback.col === 'en' ? 'bg-green-100' : 'hover:bg-indigo-50/50'}
                                                    `}
                                                    onClick={() => handleCopy(item.english, idx, 'en')}
                                                >
                                                    <div className="flex justify-between items-center">
                                                        <span className={`text-[12px] font-mono font-black text-indigo-600 leading-tight break-all uppercase`}>
                                                            {item.english}
                                                        </span>
                                                        {copyFeedback?.row === idx && copyFeedback.col === 'en' && <span className="text-[9px] text-green-600 font-black animate-pulse">COPY!</span>}
                                                    </div>
                                                </td>

                                                <td
                                                    className={`px-4 py-2.5 cursor-pointer align-middle transition-all duration-300 relative
                                                        ${copyFeedback?.row === idx && copyFeedback.col === 'vi' ? 'bg-green-100' : 'hover:bg-indigo-50/50'}
                                                    `}
                                                    onClick={() => handleCopy(item.vietnamese, idx, 'vi')}
                                                >
                                                    <div className="flex justify-between items-center">
                                                        <span className={`text-[12px] font-bold text-teal-600 leading-tight break-words font-sans`}>
                                                            {item.vietnamese}
                                                        </span>
                                                        {copyFeedback?.row === idx && copyFeedback.col === 'vi' && <span className="text-[9px] text-green-600 font-black animate-pulse">COPY!</span>}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col overflow-hidden bg-white">
                        <div className="grid grid-cols-2 flex-1 overflow-hidden">
                            <div className="flex flex-col border-r border-gray-200 min-h-0">
                                <div className="bg-gray-50/50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-gray-100 flex justify-between items-center h-12 shrink-0">
                                    <span>INPUT SOURCE (Any language)</span>
                                    <button
                                        onClick={() => setBulkInput('')}
                                        className="text-red-400 hover:text-red-600 transition-colors text-[9px] font-black border border-red-100 px-2 py-1 rounded-lg hover:bg-red-50"
                                    >
                                        CLEAR ALL
                                    </button>
                                </div>
                                <div className="flex-1 relative min-h-0 bg-white group/input">
                                    {/* Highlighter Overlay */}
                                    <div
                                        ref={highlighterRef}
                                        className="absolute inset-x-0 inset-y-0 p-6 font-mono text-[13px] leading-relaxed pointer-events-none text-transparent whitespace-pre-wrap break-words overflow-y-auto"
                                        style={{ scrollbarWidth: 'none' }}
                                    >
                                        {translatedLines.map((line, lIdx) => (
                                            <div key={lIdx} className="min-h-[1.5em]">
                                                {line.segments.map(seg => (
                                                    <span
                                                        key={seg.key}
                                                        className={`transition-colors duration-200 py-0.5 rounded ${seg.type === 'phrase' ? (hoveredKey === seg.key ? 'bg-indigo-500/30 ring-1 ring-indigo-400' : 'bg-indigo-500/5') : ''}`}
                                                        onMouseEnter={() => seg.type === 'phrase' && setHoveredKey(seg.key)}
                                                        onMouseLeave={() => seg.type === 'phrase' && setHoveredKey(null)}
                                                    >
                                                        {seg.original}
                                                    </span>
                                                ))}
                                                {'\n'}
                                            </div>
                                        ))}
                                    </div>
                                    <textarea
                                        ref={inputRef}
                                        onScroll={handleInputScroll}
                                        className="absolute inset-x-0 inset-y-0 w-full h-full p-6 font-mono text-[13px] outline-none resize-none bg-transparent focus:bg-indigo-50/5 transition-colors leading-relaxed overflow-y-auto z-10"
                                        placeholder="Paste code or text here..."
                                        value={bulkInput}
                                        onChange={(e) => setBulkInput(e.target.value)}
                                    ></textarea>
                                </div>
                            </div>

                            <div className="flex flex-col min-h-0">
                                <div className="bg-indigo-50/30 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-indigo-500 border-b border-indigo-100 flex justify-between items-center h-12 shrink-0">
                                    <div className="flex items-center gap-3">
                                        <span className="text-indigo-600">RESULT TO:</span>
                                        <div className="flex bg-white p-0.5 rounded-lg border border-indigo-100 shadow-sm">
                                            <button
                                                onClick={() => setTargetLang('en')}
                                                className={`px-3 py-1 rounded-md text-[9px] font-black transition-all ${targetLang === 'en' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-indigo-400'}`}
                                            >
                                                🔡 EN
                                            </button>
                                            <button
                                                onClick={() => setTargetLang('jp')}
                                                className={`px-3 py-1 rounded-md text-[9px] font-black transition-all ${targetLang === 'jp' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-indigo-400'}`}
                                            >
                                                🇯🇵 JP
                                            </button>
                                            <button
                                                onClick={() => setTargetLang('vi')}
                                                className={`px-3 py-1 rounded-md text-[9px] font-black transition-all ${targetLang === 'vi' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-indigo-400'}`}
                                            >
                                                🇻🇳 VI
                                            </button>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            if (translatedLines.length === 0) return;

                                            const finalOutput = translatedLines.map(line =>
                                                line.segments.map(seg => seg.text).join('')
                                            ).join('\n');

                                            const rawLines = finalOutput.split('\n').map(l => l.trim()).filter(l => l);
                                            const headerLabel = targetLang.toUpperCase();

                                            // Copy Record must be horizontal (all lines from output become columns in one row)
                                            const tableHtml = `
                                              <table style="border-collapse: collapse; border: 1px solid #000000;">
                                                <thead>
                                                  <tr>
                                                    ${rawLines.map(() => `
                                                      <th style="background-color: ${excelHeaderColor}; color: #ffffff; padding: 8px; border: 1px solid #000000; font-family: sans-serif; font-size: 11pt;">${headerLabel}</th>
                                                    `).join('')}
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  <tr>
                                                    ${rawLines.map(line => `
                                                      <td style="color: #000000; padding: 6px 8px; border: 1px solid #000000; font-family: Calibri, sans-serif; font-size: 10pt; white-space: nowrap;">${line}</td>
                                                    `).join('')}
                                                  </tr>
                                                </tbody>
                                              </table>
                                            `;

                                            const blob = new Blob([tableHtml], { type: 'text/html' });
                                            const data = [new ClipboardItem({ 'text/html': blob, 'text/plain': new Blob([finalOutput], { type: 'text/plain' }) })];

                                            navigator.clipboard.write(data).then(() => {
                                                alert("Đã copy định dạng Excel (Ngang)! Hãy dán vào Excel.");
                                            });
                                        }}
                                        className="px-3 py-1 bg-white text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors border border-indigo-100 shadow-sm text-[9px] font-black"
                                    >
                                        📄 COPY EXCEL
                                    </button>
                                </div>
                                <div
                                    ref={outputRef}
                                    onScroll={handleOutputScroll}
                                    className="flex-1 p-6 font-mono text-[13px] outline-none overflow-auto bg-indigo-50/10 text-indigo-900 font-bold leading-relaxed shadow-inner whitespace-pre-wrap"
                                >
                                    {translatedLines.length > 0 ? (
                                        translatedLines.map((line, lIdx) => (
                                            <div key={lIdx} className="min-h-[1.5em]">
                                                {line.segments.map(seg => {
                                                    if (seg.type === 'text') return seg.text;

                                                    return (
                                                        <span
                                                            key={seg.key}
                                                            className={`inline-flex items-center group/opt relative cursor-pointer mx-1 px-1 rounded transition-all duration-200
                                                                ${seg.isMultiple ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-300 hover:bg-amber-200' : 'bg-transparent text-indigo-600'}
                                                                ${hoveredKey === seg.key ? 'ring-2 ring-indigo-500 scale-105 shadow-sm' : ''}
                                                            `}
                                                            onMouseEnter={() => setHoveredKey(seg.key)}
                                                            onMouseLeave={() => setHoveredKey(null)}
                                                            onClick={() => {
                                                                if (seg.isMultiple) {
                                                                    const current = selections[seg.key] || seg.options[0];
                                                                    const nextIdx = (seg.options.indexOf(current) + 1) % seg.options.length;
                                                                    setSelections(prev => ({ ...prev, [seg.key]: seg.options[nextIdx] }));
                                                                }
                                                            }}
                                                        >
                                                            {seg.text}
                                                            {seg.isMultiple && (
                                                                <span className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[8px] px-1 rounded opacity-0 group-hover/opt:opacity-100 transition-opacity whitespace-nowrap z-20">
                                                                    Click to switch ({seg.options.length} options)
                                                                </span>
                                                            )}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        ))
                                    ) : (
                                        <span className="text-gray-300 italic">Translation will appear here...</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

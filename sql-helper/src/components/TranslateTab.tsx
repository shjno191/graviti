import React, { useState, useEffect, useMemo } from 'react';
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
    const [bulkOutput, setBulkOutput] = useState('');
    const [targetLang, setTargetLang] = useState<'jp' | 'en' | 'vi'>('en');
    const [syncing, setSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState(0);

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
                const seenKeys = new Set<string>();
                const uniqueResults: TranslateEntry[] = [];
                let duplicateCount = 0;

                for (let i = startIndex; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if (row && row.length >= 2) {
                        const jp = String(row[0] || "").trim();
                        const en = String(row[1] || "").trim();
                        const vi = String(row[2] || "").trim();

                        if (jp || en || vi) {
                            const enKey = en.toLowerCase();
                            if (enKey === "" || !seenKeys.has(enKey)) {
                                if (enKey !== "") seenKeys.add(enKey);
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

        const flattened: { phrase: string, replacement: string, regex: RegExp }[] = [];
        data.forEach(entry => {
            const replacement = entry[targetKey];
            if (!replacement) return;

            sourceKeys.forEach(sKey => {
                const phrase = String(entry[sKey] || "").trim();
                if (phrase && phrase !== replacement) {
                    // Pre-compile regex for performance
                    const escapedKey = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    flattened.push({
                        phrase,
                        replacement,
                        regex: new RegExp(escapedKey, 'g')
                    });
                }
            });
        });

        // Longest phrases first to prevent partial replacements
        return flattened.sort((a, b) => b.phrase.length - a.phrase.length);
    }, [data, targetLang]);

    // Use a timeout to debounce heavy translation logic
    useEffect(() => {
        if (!bulkInput) {
            setBulkOutput('');
            return;
        }

        const timer = setTimeout(() => {
            const lines = bulkInput.split('\n');
            const translated = lines.map(line => {
                let processed = line;
                for (const item of translationDict) {
                    if (processed.includes(item.phrase)) {
                        processed = processed.replace(item.regex, item.replacement);
                    }
                }
                return processed;
            });
            setBulkOutput(translated.join('\n'));
        }, 150); // 150ms debounce

        return () => clearTimeout(timer);
    }, [bulkInput, translationDict]);

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
                        <div className="flex-1 text-[10px] text-gray-400 font-bold uppercase tracking-widest italic animate-pulse">
                            Paste text below to translate automatically using dictionary data
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
                            <div className="flex flex-col border-r border-gray-200">
                                <div className="bg-gray-50/50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-gray-100 flex justify-between items-center h-12">
                                    <span>INPUT SOURCE (Any language)</span>
                                    <button
                                        onClick={() => setBulkInput('')}
                                        className="text-red-400 hover:text-red-600 transition-colors text-[9px] font-black border border-red-100 px-2 py-1 rounded-lg hover:bg-red-50"
                                    >
                                        CLEAR ALL
                                    </button>
                                </div>
                                <textarea
                                    className="flex-1 p-6 font-mono text-[13px] outline-none resize-none bg-white focus:bg-indigo-50/5 transition-colors leading-relaxed"
                                    placeholder="Paste code or text here..."
                                    value={bulkInput}
                                    onChange={(e) => setBulkInput(e.target.value)}
                                ></textarea>
                            </div>

                            <div className="flex flex-col">
                                <div className="bg-indigo-50/30 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-indigo-500 border-b border-indigo-100 flex justify-between items-center h-12">
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
                                            if (!bulkOutput) return;

                                            const rawLines = bulkOutput.split('\n').map(l => l.trim()).filter(l => l);
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
                                            const data = [new ClipboardItem({ 'text/html': blob, 'text/plain': new Blob([bulkOutput], { type: 'text/plain' }) })];

                                            navigator.clipboard.write(data).then(() => {
                                                alert("Đã copy định dạng Excel (Ngang)! Hãy dán vào Excel.");
                                            });
                                        }}
                                        className="px-3 py-1 bg-white text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors border border-indigo-100 shadow-sm text-[9px] font-black"
                                    >
                                        📄 COPY EXCEL
                                    </button>
                                </div>
                                <textarea
                                    className="flex-1 p-6 font-mono text-[13px] outline-none resize-none bg-indigo-50/10 text-indigo-900 font-bold leading-relaxed shadow-inner"
                                    readOnly
                                    value={bulkOutput}
                                    placeholder="Translation will appear here..."
                                ></textarea>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

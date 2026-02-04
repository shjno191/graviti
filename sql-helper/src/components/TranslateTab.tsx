import React, { useState, useEffect, useMemo } from 'react';
import { readBinaryFile, writeBinaryFile } from '@tauri-apps/api/fs';
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
    const { activeTab, translateFilePath, setTranslateFilePath, setActiveTab } = useAppStore();
    const [data, setData] = useState<TranslateEntry[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [copyFeedback, setCopyFeedback] = useState<{ row: number, col: 'jp' | 'en' | 'vi' } | null>(null);
    const [subTab, setSubTab] = useState<'dictionary' | 'quick'>('dictionary');
    const [bulkInput, setBulkInput] = useState('');
    const [bulkOutput, setBulkOutput] = useState('');
    const [targetLang, setTargetLang] = useState<'jp' | 'en' | 'vi'>('en');



    useEffect(() => {
        if (activeTab === 'translate' && translateFilePath) {
            loadData();
        }
    }, [activeTab, translateFilePath]);

    const loadData = async () => {
        if (!translateFilePath) {
            setLoading(false);
            setError("Đường dẫn file Excel chưa được cấu hình. Vui lòng vào tab Cài đặt để chọn file.");
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const filePath = translateFilePath;
            const contents = await readBinaryFile(filePath);
            const workbook = XLSX.read(contents, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][];
            const entries: TranslateEntry[] = [];

            let startIndex = 0;
            if (jsonData.length > 0) {
                const firstRowStr = JSON.stringify(jsonData[0]).toLowerCase();
                // Check if the first row is a header
                if (firstRowStr.includes("japan") || firstRowStr.includes("en") || firstRowStr.includes("vi") || firstRowStr.includes("日")) {
                    startIndex = 1;
                }
            }

            for (let i = startIndex; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (row && row.length >= 2) {
                    const jp = String(row[0] || "").trim();
                    const en = String(row[1] || "").trim();
                    const vi = String(row[2] || "").trim();
                    if (jp || en || vi) {
                        entries.push({ japanese: jp, english: en, vietnamese: vi });
                    }
                }
            }
            setData(entries);
        } catch (err: any) {
            console.error('Error loading Excel:', err);
            if (err.toString().includes("os error 2") || err.toString().includes("NotFound")) {
                setError(`Không tìm thấy file tại: ${translateFilePath}. Vui lòng kiểm tra lại đường dẫn trong Cài đặt.`);
            } else {
                setError(`Lỗi: ${err.message || err}`);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleCleanDuplicates = async () => {
        setLoading(true);
        setError(null);
        try {
            const filePath = translateFilePath;
            const contents = await readBinaryFile(filePath);
            const workbook = XLSX.read(contents, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][];

            if (jsonData.length <= 1) {
                setLoading(false);
                return;
            }

            let startIndex = 0;
            const firstRowStr = JSON.stringify(jsonData[0]).toLowerCase();
            if (firstRowStr.includes("japan") || firstRowStr.includes("en") || firstRowStr.includes("vi") || firstRowStr.includes("日")) {
                startIndex = 1;
            }

            const header = startIndex > 0 ? jsonData[0] : null;
            const rows = startIndex > 0 ? jsonData.slice(1) : jsonData;

            const seenKeys = new Set<string>();
            const uniqueRows = [];
            let duplicateCount = 0;

            for (const row of rows) {
                const enValue = String(row[1] || "").trim();
                const enKey = enValue.toLowerCase();

                if (enKey === "") {
                    uniqueRows.push(row);
                } else if (!seenKeys.has(enKey)) {
                    seenKeys.add(enKey);
                    uniqueRows.push(row);
                } else {
                    duplicateCount++;
                }
            }

            if (duplicateCount > 0) {
                const newJsonData = header ? [header, ...uniqueRows] : uniqueRows;
                const newWorksheet = XLSX.utils.aoa_to_sheet(newJsonData);
                const newWorkbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, firstSheetName);

                const excelBuffer = XLSX.write(newWorkbook, { bookType: 'xlsx', type: 'array' });
                await writeBinaryFile(filePath, new Uint8Array(excelBuffer));

                await loadData();
            }
            alert(duplicateCount > 0 ? `Đã dọn dẹp! Đã xóa ${duplicateCount} dòng trùng.` : 'Không có dòng trùng lặp.');
        } catch (err: any) {
            console.error('Error cleaning duplicates:', err);
            setError(`Lỗi khi dọn dẹp: ${err.message || err}`);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenExcel = async () => {
        try {
            await invoke('open_file', { path: translateFilePath });
        } catch (err: any) {
            console.error('Error opening Excel:', err);
            alert(`Không thể mở file: ${err.message || err}`);
        }
    };

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

    const handleBulkTranslate = () => {
        if (!bulkInput || data.length === 0) {
            setBulkOutput(bulkInput);
            return;
        }

        const targetKey: keyof TranslateEntry = targetLang === 'en' ? 'english' : targetLang === 'vi' ? 'vietnamese' : 'japanese';
        const sourceKeys: (keyof TranslateEntry)[] = (['japanese', 'english', 'vietnamese'] as (keyof TranslateEntry)[]).filter(k => k !== targetKey);

        // Pre-process dictionary to have a flat list of (phrase, replacement) sorted by phrase length
        const flattenedDict: { phrase: string, replacement: string }[] = [];
        data.forEach(entry => {
            const replacement = entry[targetKey];
            if (!replacement) return;

            sourceKeys.forEach(sKey => {
                const phrase = entry[sKey];
                if (phrase && String(phrase).trim() !== "" && phrase !== replacement) {
                    flattenedDict.push({ phrase: String(phrase).trim(), replacement });
                }
            });
        });

        // Sort by phrase length descending to match longest phrases first
        flattenedDict.sort((a, b) => b.phrase.length - a.phrase.length);

        let lines = bulkInput.split('\n');
        let translatedLines = lines.map(line => {
            let processedLine = line;
            for (const item of flattenedDict) {
                // Escaping special characters for regex
                const escapedKey = item.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(escapedKey, 'g');
                processedLine = processedLine.replace(regex, item.replacement);
            }
            return processedLine;
        });

        setBulkOutput(translatedLines.join('\n'));
    };

    useEffect(() => {
        handleBulkTranslate();
    }, [bulkInput, data, targetLang]);

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] gap-4 p-4 animate-in fade-in duration-300 overflow-hidden font-sans">
            {/* Header */}
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
                        onClick={handleOpenExcel}
                        className="flex items-center gap-2 px-3 py-2 bg-green-50 text-green-600 rounded-xl text-[10px] font-black hover:bg-green-100 border border-green-200 transition-all active:scale-95 shadow-sm"
                        title="Open Excel File"
                    >
                        📂 OPEN EXCEL
                    </button>
                    <button
                        onClick={handleCleanDuplicates}
                        className="flex items-center gap-2 px-3 py-2 bg-amber-50 text-amber-600 rounded-xl text-[10px] font-black hover:bg-amber-100 border border-amber-200 transition-all active:scale-95 shadow-sm"
                        title="Clean Duplicate Keys (EN)"
                    >
                        🧹 CLEAN
                    </button>
                    <button
                        onClick={loadData}
                        className="p-2 hover:bg-gray-100 rounded-xl transition-all text-gray-400 hover:text-indigo-600 border border-gray-100 shadow-sm active:scale-95"
                        title="Reload"
                    >
                        🔄
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden bg-white rounded-2xl border border-gray-300 shadow-sm flex flex-col">
                {subTab === 'dictionary' ? (
                    <>
                        <div className="grid grid-cols-3 bg-gray-100 text-gray-600 border-b border-gray-300 sticky top-0 z-10">
                            <div className="px-4 py-3 text-[10px] font-black uppercase tracking-widest border-r border-gray-300 flex items-center gap-2">
                                🇯🇵 Japanese
                            </div>
                            <div className="px-4 py-3 text-[10px] font-black uppercase tracking-widest border-r border-gray-300 flex items-center gap-2">
                                🔡 English / Code
                            </div>
                            <div className="px-4 py-3 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
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
                                                    filters: [{ name: 'Excel', extensions: ['xlsx'] }]
                                                });
                                                if (selected && typeof selected === 'string') {
                                                    setTranslateFilePath(selected);
                                                    // Auto save if possible or just rely on state
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
                                            onClick={loadData}
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
                                                {/* Japanese Column */}
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

                                                {/* English Column */}
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

                                                {/* Vietnamese Column */}
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
                                        {filteredData.length === 0 && !loading && (
                                            <tr>
                                                <td colSpan={3} className="p-20 text-center text-gray-400 text-xs font-bold uppercase tracking-widest">No matches found</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col overflow-hidden bg-white">
                        <div className="grid grid-cols-2 flex-1 overflow-hidden">
                            {/* Input Column */}
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

                            {/* Output Column */}
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
                                            navigator.clipboard.writeText(bulkOutput);
                                            alert("Copied to clipboard!");
                                        }}
                                        className="px-3 py-1 bg-white text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors border border-indigo-100 shadow-sm text-[9px] font-black"
                                    >
                                        COPY RESULT
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

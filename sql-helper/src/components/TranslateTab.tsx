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

const MemoizedSegment = React.memo(({ seg, hoveredKey, onHover, onClick, onCycle, copiedKey, lIdx }: {
    seg: TranslatedSegment,
    hoveredKey: string | null,
    onHover: (key: string | null) => void,
    onClick: (seg: TranslatedSegment) => void,
    onCycle: (key: string, option: string) => void,
    copiedKey: string | null,
    lIdx: number
}) => {
    if (seg.type === 'text') return <>{seg.text}</>;

    const isCopied = copiedKey === seg.key;

    return (
        <span
            key={seg.key}
            className={`inline-flex items-center group/opt relative cursor-pointer mx-0.5 transition-all duration-300 font-bold
                ${seg.isMultiple ? 'text-amber-600 border-b-2 border-amber-400/50 hover:border-amber-400' : 'text-indigo-600 border-b border-indigo-200 hover:border-indigo-400'}
                ${hoveredKey === seg.key ? '!text-indigo-900 !border-indigo-600 !border-b-2 scale-[1.02]' : ''}
                ${isCopied ? '!text-green-600 !border-green-600 !border-b-2' : ''}
            `}
            onMouseEnter={() => onHover(seg.key)}
            onMouseLeave={() => onHover(null)}
            onClick={() => onClick(seg)}
        >
            <span className="relative z-10">{seg.text}</span>

            {seg.isMultiple && (
                <span className="ml-1 text-[8px] opacity-60 bg-indigo-50 px-1 rounded-full border border-indigo-200 select-none">
                    {seg.options.length}
                </span>
            )}

            {/* Hover Tooltip / Selection Menu */}
            {seg.isMultiple && hoveredKey === seg.key && (
                <div
                    className="absolute left-full top-0 z-[9999] flex flex-col bg-white rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.4),0_0_1px_rgba(0,0,0,0.1)] border border-indigo-200 py-1.5 min-w-[140px] animate-in slide-in-from-left-2 duration-200 pointer-events-auto cursor-default translate-x-2"
                    onClick={(e) => e.stopPropagation()}
                    onMouseEnter={(e) => e.stopPropagation()}
                >
                    {/* Transparent bridge to maintain hover state while moving mouse to tooltip */}
                    <div className="absolute -left-2 top-0 bottom-0 w-2" />

                    {/* Speech bubble arrow */}
                    <div className="absolute top-3 -left-1.5 w-3 h-3 bg-white border-l border-b border-indigo-200 rotate-45"></div>

                    <div className="max-h-[220px] overflow-y-auto custom-scrollbar flex flex-col pt-0.5">
                        {seg.options.map((opt, oIdx) => (
                            <button
                                key={oIdx}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onCycle(seg.key, opt);
                                }}
                                className={`px-3 py-2 text-[11px] font-bold transition-all text-left flex items-center gap-2
                                    ${seg.text === opt
                                        ? 'bg-indigo-600 text-white'
                                        : 'text-gray-700 hover:bg-indigo-50 hover:text-indigo-600'}
                                `}
                            >
                                <span className="opacity-40 text-[9px] w-3">{oIdx + 1}</span>
                                <span className="flex-1 truncate">{opt}</span>
                                {seg.text === opt && <span className="text-[10px]">✓</span>}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {isCopied && (
                <span className={`absolute left-1/2 -translate-x-1/2 bg-green-600 text-white text-[8px] px-1.5 py-0.5 rounded shadow-sm animate-bounce whitespace-nowrap z-[10000] font-black select-none pointer-events-none
                    ${lIdx === 0 ? 'top-[130%]' : 'bottom-[130%]'}
                `}>
                    COPIED!
                </span>
            )}
            {!isCopied && !seg.isMultiple && (
                <span className={`absolute left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[8px] px-2 py-0.5 rounded opacity-0 group-hover/opt:opacity-100 transition-opacity whitespace-nowrap z-[9999] font-bold shadow-lg pointer-events-none select-none
                    ${lIdx === 0 ? 'top-[120%]' : 'bottom-[120%]'}
                `}>
                    📋 CLICK TO COPY
                </span>
            )}
        </span>
    );
});

const DictionaryRow = React.memo(({ item, idx, copyFeedback, onCopy }: { item: TranslateEntry, idx: number, copyFeedback: any, onCopy: any }) => (
    <tr className="border-b border-gray-200 group transition-colors">
        <td
            className={`px-4 py-2.5 border-r border-gray-200 cursor-pointer align-middle transition-all duration-300 relative
                ${copyFeedback?.row === idx && copyFeedback.col === 'jp' ? 'bg-green-100' : 'hover:bg-indigo-50/50'}
            `}
            onClick={() => onCopy(item.japanese, idx, 'jp')}
        >
            <div className="flex justify-between items-center">
                <span className="text-[12px] font-bold text-gray-700 leading-tight whitespace-pre-wrap break-words">
                    {item.japanese}
                </span>
                {copyFeedback?.row === idx && copyFeedback.col === 'jp' && <span className="text-[9px] text-green-600 font-black animate-pulse select-none pointer-events-none">COPY!</span>}
            </div>
        </td>

        <td
            className={`px-4 py-2.5 border-r border-gray-200 cursor-pointer align-middle transition-all duration-300 relative
                ${copyFeedback?.row === idx && copyFeedback.col === 'en' ? 'bg-green-100' : 'hover:bg-indigo-50/50'}
            `}
            onClick={() => onCopy(item.english, idx, 'en')}
        >
            <div className="flex justify-between items-center">
                <span className="text-[12px] font-mono font-black text-indigo-600 leading-tight break-all uppercase">
                    {item.english}
                </span>
                {copyFeedback?.row === idx && copyFeedback.col === 'en' && <span className="text-[9px] text-green-600 font-black animate-pulse select-none pointer-events-none">COPY!</span>}
            </div>
        </td>

        <td
            className={`px-4 py-2.5 cursor-pointer align-middle transition-all duration-300 relative
                ${copyFeedback?.row === idx && copyFeedback.col === 'vi' ? 'bg-green-100' : 'hover:bg-indigo-50/50'}
            `}
            onClick={() => onCopy(item.vietnamese, idx, 'vi')}
        >
            <div className="flex justify-between items-center">
                <span className="text-[12px] font-bold text-teal-600 leading-tight break-words font-sans">
                    {item.vietnamese}
                </span>
                {copyFeedback?.row === idx && copyFeedback.col === 'vi' && <span className="text-[9px] text-green-600 font-black animate-pulse select-none pointer-events-none">COPY!</span>}
            </div>
        </td>
    </tr>
));

export const TranslateTab: React.FC = () => {
    const {
        activeTab,
        translateFilePath,
        setTranslateFilePath,
        setActiveTab,
        excelHeaderColor,
        formatRemoveSpaces,
        setFormatRemoveSpaces,
        formatSqlAppend,
        setFormatSqlAppend
    } = useAppStore();

    const [data, setData] = useState<TranslateEntry[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [copyFeedback, setCopyFeedback] = useState<{ row: number, col: 'jp' | 'en' | 'vi' } | null>(null);
    const [subTab, setSubTab] = useState<'dictionary' | 'quick' | 'revertTK'>('dictionary');
    const [revertTKInput, setRevertTKInput] = useState('');
    const [revertTKResult, setRevertTKResult] = useState('');
    const [bulkInput, setBulkInput] = useState('');
    const [targetLang, setTargetLang] = useState<'jp' | 'en' | 'vi'>('en');
    const [syncing, setSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState(0);
    const [selections, setSelections] = useState<Record<string, string>>({});
    const [translatedLines, setTranslatedLines] = useState<TranslatedLine[]>([]);
    const [hoveredKey, setHoveredKey] = useState<string | null>(null);
    const [lineSpacing, setLineSpacing] = useState(1.6);
    const [segmentCopyFeedback, setSegmentCopyFeedback] = useState<string | null>(null);
    const [resultCopyFeedback, setResultCopyFeedback] = useState(false);
    const [showFormatSettings, setShowFormatSettings] = useState(false);
    const settingsPanelRef = useRef<HTMLDivElement>(null);

    // Close settings when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (settingsPanelRef.current && !settingsPanelRef.current.contains(event.target as Node)) {
                setShowFormatSettings(false);
            }
        };

        if (showFormatSettings) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showFormatSettings]);

    const inputRef = useRef<HTMLTextAreaElement>(null);
    const outputRef = useRef<HTMLDivElement>(null);
    const highlighterRef = useRef<HTMLDivElement>(null);

    const handleInputScroll = () => {
        if (inputRef.current) {
            const { scrollTop, scrollLeft } = inputRef.current;
            if (outputRef.current) {
                outputRef.current.scrollTop = scrollTop;
                outputRef.current.scrollLeft = scrollLeft;
            }
            if (highlighterRef.current) {
                highlighterRef.current.scrollTop = scrollTop;
                highlighterRef.current.scrollLeft = scrollLeft;
            }
        }
    };

    const handleOutputScroll = () => {
        if (outputRef.current) {
            const { scrollTop, scrollLeft } = outputRef.current;
            if (inputRef.current) {
                inputRef.current.scrollTop = scrollTop;
                inputRef.current.scrollLeft = scrollLeft;
            }
            if (highlighterRef.current) {
                highlighterRef.current.scrollTop = scrollTop;
                highlighterRef.current.scrollLeft = scrollLeft;
            }
        }
    };

    const handleFormatInput = () => {
        if (!bulkInput.trim()) return;

        let processedText = bulkInput;

        // Logic 2: sql.append transformation
        if (formatSqlAppend) {
            const lines = processedText.split('\n');
            const extractedLines: string[] = [];

            lines.forEach(line => {
                let s = line.trim();
                if (s.toLowerCase().includes('.append')) {
                    const first = s.indexOf('(');
                    const last = s.lastIndexOf(')');

                    if (first !== -1) {
                        let content = (last > first)
                            ? s.substring(first + 1, last)
                            : s.substring(first + 1);

                        // Clean up Java artifacts: " and + and ;
                        content = content.replace(/\"/g, '').replace(/\+/g, '').replace(/;/g, '').trim();

                        if (content) {
                            extractedLines.push(content);
                        }
                    }
                } else if (s) {
                    let cleaned = s.replace(/\"/g, '').replace(/\+/g, '').replace(/;/g, '').trim();
                    if (cleaned) extractedLines.push(cleaned);
                }
            });

            if (extractedLines.length > 0) {
                processedText = extractedLines.join('\n');
            }
        }

        // Logic 1 & 3: Remove space, tab, and commas
        if (formatRemoveSpaces) {
            // Remove commas first
            processedText = processedText.replace(/,/g, '');

            const lines = processedText.split('\n');
            const formattedLines = lines.map(line => {
                // Replace tabs and multiple spaces with a single space, then trim
                return line.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
            }).filter(line => line.length > 0);
            processedText = formattedLines.join('\n');
        }

        setBulkInput(processedText);
    };

    const handleRevertTK = () => {
        if (!revertTKInput.trim()) return;
        const formatted = smartFormatSqlDesign(revertTKInput);
        setRevertTKResult(formatted);
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
        const trimmedSearch = searchTerm.trim();
        if (!trimmedSearch) return data;
        const lowerSearch = trimmedSearch.toLowerCase();
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

    const normalizeText = (s: string) => s
        .replace(/[！-～]/g, (m) => String.fromCharCode(m.charCodeAt(0) - 0xFEE0)) // Full-width to half-width
        .replace(/　/g, ' ') // Full-width space to half-width
        .replace(/[\t\r\n\v\f]/g, ' '); // All whitespace-like to standard space (1-to-1)

    /**
     * Smart formatter for SQL design documents based on rules in CHANGES.md.
     * It:
     * - Cleans Java/C# StringBuilder + .append noise
     * - Aligns 「【SQL論理名】」「【SQL定義名】」 style blocks (colon + value)
     * - Aligns 2-column tables like 「カラム名 / セット内容」 with >=10 spaces gap
     * - Aligns JOIN condition blocks (ON / AND / OR) in columns
     * - Aligns LOG tables like 「レベル / メッセージ」
     */
    const smartFormatSqlDesign = (input: string): string => {
        if (!input.trim()) return input;

        // STEP 0: Basic cleanup of Java/C# append-style SQL (re-use current behavior)
        let text = input;

        // Remove StringBuilder initialization lines
        text = text.replace(/StringBuilder\s+\w+\s*=\s*new\s+StringBuilder\(\s*\)\s*;/gi, '');

        // Remove ".append(" prefixes (sql.append, sb.append, query.append, etc.) including optional first quote
        text = text.replace(/[\w$]+\.append\s*\(\s*\"?/gi, '');

        // Clean up common line endings like ");" or ")" with trailing semicolon
        text = text.replace(/\"?\s*\)\s*;/g, '');

        // Remove quotes and '+' used for string concatenation
        text = text.replace(/\"/g, '');
        text = text.replace(/\+/g, '');

        // Normalize tabs to spaces, but keep multiple spaces (needed for columns)
        let lines = text.split('\n').map(line =>
            line.replace(/\t/g, ' ').replace(/\s+$/g, '')
        );

        // Helper: format SQL info blocks like 【SQL論理名】 ： <value>
        const formatSqlInfoBlocks = (src: string[]): string[] => {
            const result = [...src];

            // Collect indices of lines that look like SQL info rows
            const targetIndexes: number[] = [];
            const LABEL_REGEX = /^【[^】]+】/;

            result.forEach((line, idx) => {
                if (!LABEL_REGEX.test(line)) return;
                if (!line.includes('：')) return;
                targetIndexes.push(idx);
            });

            if (targetIndexes.length === 0) return result;

            // Group contiguous indexes into blocks
            const blocks: number[][] = [];
            let current: number[] = [];
            targetIndexes.forEach((idx) => {
                if (current.length === 0 || idx === current[current.length - 1] + 1) {
                    current.push(idx);
                } else {
                    blocks.push(current);
                    current = [idx];
                }
            });
            if (current.length > 0) blocks.push(current);

            blocks.forEach(block => {
                const parts: { idx: number; label: string; value: string }[] = [];

                block.forEach(i => {
                    const raw = result[i];
                    const colonIdx = raw.indexOf('：');
                    if (colonIdx === -1) return;
                    const label = raw.substring(0, colonIdx).trimEnd();
                    const value = raw.substring(colonIdx + 1).trim();
                    parts.push({ idx: i, label, value });
                });

                parts.forEach(({ idx, label, value }) => {
                    // Tab-separated: copy sang Excel → mỗi cột vào 1 ô
                    result[idx] = `${label}：\t${value}`;
                });
            });

            return result;
        };

        // Helper: format 2-column tables (カラム名 / セット内容, レベル / メッセージ)
        const formatTwoColumnTables = (src: string[]): string[] => {
            const result = [...src];
            const tableHeaderKeywords = [
                'カラム名',
                'セット内容',
                'レベル',
                'メッセージ'
            ];

            const isHeaderLine = (line: string) =>
                tableHeaderKeywords.some(k => line.includes(k));

            let i = 0;
            while (i < result.length) {
                if (!isHeaderLine(result[i])) {
                    i++;
                    continue;
                }

                const start = i;
                let end = i;

                // Extend block until blank line or separation
                for (let j = i + 1; j < result.length; j++) {
                    const l = result[j];
                    if (!l.trim()) break;
                    // Stop if new header or section marker
                    if (isHeaderLine(l) || l.startsWith('■')) break;
                    end = j;
                }

                // Collect rows
                const rows: { idx: number; col1: string; col2: string }[] = [];

                for (let k = start; k <= end; k++) {
                    const raw = result[k];
                    const trimmed = raw.trim();
                    if (!trimmed) continue;

                    // Generic split: first group of 2+ spaces separates col1 and col2
                    const m = trimmed.match(/^(\S(?:.*?\S)?)\s{2,}(.*\S.*)$/);
                    if (m) {
                        rows.push({ idx: k, col1: m[1], col2: m[2] });
                        continue;
                    }

                    // Fallback: try to split at single space between known Japanese labels
                    if (trimmed.includes('カラム名') && trimmed.includes('セット内容')) {
                        const idxKeyword = trimmed.indexOf('カラム名') + 'カラム名'.length;
                        const col1 = trimmed.substring(0, idxKeyword).trimEnd();
                        const col2 = trimmed.substring(idxKeyword).trim();
                        rows.push({ idx: k, col1, col2 });
                        continue;
                    }

                    if (trimmed.includes('レベル') && trimmed.includes('メッセージ')) {
                        const idxKeyword = trimmed.indexOf('レベル') + 'レベル'.length;
                        const col1 = trimmed.substring(0, idxKeyword).trimEnd();
                        const col2 = trimmed.substring(idxKeyword).trim();
                        rows.push({ idx: k, col1, col2 });
                        continue;
                    }
                }

                if (rows.length > 0) {
                    // Tab-separated: copy sang Excel → 2 cột vào 2 ô
                    rows.forEach(({ idx: lineIdx, col1, col2 }) => {
                        result[lineIdx] = `${col1}\t${col2}`;
                    });
                }

                i = end + 1;
            }

            return result;
        };

        // Helper: align JOIN conditions (ON / AND / OR)
        const formatJoinBlocks = (src: string[]): string[] => {
            const result = [...src];

            let i = 0;
            while (i < result.length) {
                const line = result[i];
                // JOIN block starts with bullet like ・商品マスタ RS （INNER JOIN）
                if (!line.trim().startsWith('・')) {
                    i++;
                    continue;
                }

                const joinStart = i + 1;
                const joinLines: { idx: number; op: string; rest: string }[] = [];
                let maxOpLen = 0;

                for (let j = joinStart; j < result.length; j++) {
                    const raw = result[j];
                    const trimmed = raw.trim();
                    if (!trimmed) break;
                    if (trimmed.startsWith('■') || trimmed.startsWith('・')) break;

                    const m = trimmed.match(/^(ON|AND|OR)\s+(.*)$/);
                    if (!m) break;

                    const op = m[1];
                    const rest = m[2];
                    joinLines.push({ idx: j, op, rest });
                    if (op.length > maxOpLen) maxOpLen = op.length;
                }

                if (joinLines.length > 0) {
                    const BETWEEN_REGEX = /^(.*?)\s+BETWEEN\s+(.*?)\s+AND\s+(.*?)$/i;
                    const INDENT_JOIN = '    '; // Rule 4: "Điều kiện AND thụt vào và thẳng cột"
                    joinLines.forEach(({ idx: lineIdx, op, rest }) => {
                        const trimmedRest = rest.trim();
                        const between = trimmedRest.match(BETWEEN_REGEX);
                        if (between) {
                            result[lineIdx] = `${INDENT_JOIN}${op}\t${between[1].trim()}\tBETWEEN\t${between[2].trim()}\tAND\t${between[3].trim()}`;
                        } else {
                            result[lineIdx] = `${INDENT_JOIN}${op}\t${trimmedRest}`;
                        }
                    });
                    const nextIdx = joinLines[joinLines.length - 1].idx + 1;
                    // Cách 1 dòng giữa block INNER JOIN này và block INNER JOIN tiếp theo; đồng bộ source (chèn row)
                    if (nextIdx < result.length && result[nextIdx].trim().startsWith('・')) {
                        result.splice(nextIdx, 0, '');
                    }
                    i = nextIdx;
                } else {
                    i++;
                }
            }

            return result;
        };

        // Helper: thụt dòng nội dung dưới ■ (rule 2: "Nội dung bên dưới PHẢI thụt vào ít nhất 1 cột")
        // Dù source không thụt → output vẫn thụt 4 space. Dừng khi gặp ■ mới hoặc block JOIN (・...JOIN).
        const formatHeaderBlocks = (src: string[]): string[] => {
            const result = [...src];
            const JOIN_HEADER_REGEX = /^・.*（.*JOIN.*）/;

            for (let i = 0; i < result.length; i++) {
                const line = result[i];
                if (!line.trim().startsWith('■')) continue;

                for (let j = i + 1; j < result.length; j++) {
                    const l = result[j];
                    if (!l.trim()) break;
                    if (l.trim().startsWith('■')) break;
                    if (JOIN_HEADER_REGEX.test(l.trim())) break; // Không thụt tiêu đề JOIN block
                    if (l.trim().startsWith('【')) break; // Block SQL info (論理名・定義名) không thụt theo ■
                    if (l.startsWith('    ')) continue; // Đã thụt rồi

                    result[j] = `    ${l.trimStart()}`;
                }
            }

            return result;
        };

        lines = formatSqlInfoBlocks(lines);
        lines = formatTwoColumnTables(lines);
        lines = formatJoinBlocks(lines);
        lines = formatHeaderBlocks(lines);

        return lines.join('\n');
    };

    // Memoize the dictionary transformation
    const translationDict = useMemo(() => {
        if (data.length === 0) return [];

        const targetKey: keyof TranslateEntry = targetLang === 'en' ? 'english' : targetLang === 'vi' ? 'vietnamese' : 'japanese';
        const sourceKeys: (keyof TranslateEntry)[] = (['japanese', 'english', 'vietnamese'] as (keyof TranslateEntry)[]).filter(k => k !== targetKey);

        const dictMap = new Map<string, Set<string>>();

        data.forEach(entry => {
            const replacement = String(entry[targetKey] || "").trim();
            if (!replacement) return;

            sourceKeys.forEach(sKey => {
                const rawPhrase = String(entry[sKey] || "").trim();
                if (rawPhrase && rawPhrase !== replacement) {
                    // Normalize the dictionary phrase too
                    const phrase = normalizeText(rawPhrase);
                    if (phrase) {
                        if (!dictMap.has(phrase)) {
                            dictMap.set(phrase, new Set());
                        }
                        dictMap.get(phrase)!.add(replacement);
                    }
                }
            });
        });

        const sorted = Array.from(dictMap.entries())
            .map(([phrase, replacements]) => ({
                phrase,
                replacements: Array.from(replacements),
                // Regex created from the normalized phrase
                regex: new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
            }))
            .sort((a, b) => b.phrase.length - a.phrase.length);

        return sorted;
        return sorted;
    }, [data, targetLang]);

    const handleCopyResult = () => {
        if (translatedLines.length === 0) return;

        const fullText = translatedLines.map(line =>
            line.segments.map(seg => seg.text).join('')
        ).join('\n');

        navigator.clipboard.writeText(fullText);
        setResultCopyFeedback(true);
        setTimeout(() => setResultCopyFeedback(false), 2000);
    };

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
                const normLine = normalizeText(line);

                for (const item of translationDict) {
                    item.regex.lastIndex = 0;
                    // Always match against the normalized line for robustness
                    let match;
                    while ((match = item.regex.exec(normLine)) !== null) {
                        const start = match.index;
                        const end = start + item.phrase.length;

                        // Check if this range is already covered by a longer phrase
                        if (!matches.some(m => (start < m.end && end > m.start))) {
                            // Map the match from normLine back to the same indices in original line
                            // (Safe because normalizeText is 1-to-1)
                            matches.push({
                                start,
                                end,
                                replacements: item.replacements,
                                phrase: line.substring(start, end)
                            });
                        }
                        if (item.phrase.length === 0) break;
                    }
                }

                matches.sort((a, b) => a.start - b.start);
                const segments: TranslatedSegment[] = [];
                let lastIndex = 0;

                matches.forEach((match) => {
                    if (match.start > lastIndex) {
                        const txt = line.substring(lastIndex, match.start);
                        segments.push({ type: 'text', text: txt, original: txt, key: `t-${lIdx}-${lastIndex}`, isMultiple: false, options: [] });
                    }
                    const key = `p-${lIdx}-${match.start}`;
                    segments.push({ type: 'phrase', text: selections[key] || match.replacements[0], original: match.phrase, key, isMultiple: match.replacements.length > 1, options: match.replacements });
                    lastIndex = match.end;
                });

                if (lastIndex < line.length) {
                    const txt = line.substring(lastIndex);
                    segments.push({ type: 'text', text: txt, original: txt, key: `t-${lIdx}-${lastIndex}`, isMultiple: false, options: [] });
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
                    <button
                        onClick={() => setSubTab('revertTK')}
                        className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-300 ${subTab === 'revertTK'
                            ? 'bg-white text-amber-600 shadow-md scale-105'
                            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                            }`}
                    >
                        <span>🔄 RevertTK</span>
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
                    ) : subTab === 'quick' ? (
                        <div className="flex-1 flex items-center justify-end gap-3">
                            <div className="flex items-center gap-2 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100 shadow-inner">
                                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-tighter">Line Height</span>
                                <div className="flex items-center bg-white rounded-lg border border-indigo-200 overflow-hidden shadow-sm">
                                    <button
                                        onClick={() => setLineSpacing(prev => Math.max(1, prev - 0.2))}
                                        className="px-2 py-1 hover:bg-gray-50 text-indigo-600 font-bold border-r border-indigo-100 transition-colors"
                                    >
                                        −
                                    </button>
                                    <span className="px-3 py-1 text-[11px] font-black text-indigo-900 min-w-[3rem] text-center">
                                        {lineSpacing.toFixed(1)}
                                    </span>
                                    <button
                                        onClick={() => setLineSpacing(prev => Math.min(4, prev + 0.2))}
                                        className="px-2 py-1 hover:bg-gray-50 text-indigo-600 font-bold border-l border-indigo-100 transition-colors"
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                            <div className="relative flex items-center gap-1">
                                <button
                                    onClick={handleFormatInput}
                                    className="px-6 py-2 bg-indigo-600 text-white text-xs font-black rounded-xl hover:bg-indigo-700 transition-all shadow-lg active:scale-95 shrink-0"
                                    title="Standard normalization"
                                >
                                    ✨ FORMAT
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowFormatSettings(!showFormatSettings);
                                    }}
                                    className={`p-2 rounded-xl border transition-all ${showFormatSettings ? 'bg-indigo-100 border-indigo-300 text-indigo-600' : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50'}`}
                                    title="Format Settings"
                                >
                                    ⚙️
                                </button>

                                {showFormatSettings && (
                                    <div
                                        ref={settingsPanelRef}
                                        className="absolute top-full right-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-gray-200 p-4 z-[1000] animate-in slide-in-from-top-2 duration-200"
                                    >
                                        <div className="flex flex-col gap-3">
                                            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Format Logic</div>

                                            <label className="flex items-center gap-3 cursor-pointer group">
                                                <div className="relative flex items-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={formatRemoveSpaces}
                                                        onChange={(e) => setFormatRemoveSpaces(e.target.checked)}
                                                        className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-gray-300 transition-all checked:border-indigo-600 checked:bg-indigo-600"
                                                    />
                                                    <span className="absolute text-white opacity-0 peer-checked:opacity-100 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none text-[10px]">✓</span>
                                                </div>
                                                <span className="text-xs font-bold text-gray-700 group-hover:text-indigo-600 transition-colors">Xóa Space, Tab & Dấu phẩy (,)</span>
                                            </label>

                                            <label className="flex items-center gap-3 cursor-pointer group">
                                                <div className="relative flex items-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={formatSqlAppend}
                                                        onChange={(e) => setFormatSqlAppend(e.target.checked)}
                                                        className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-gray-300 transition-all checked:border-indigo-600 checked:bg-indigo-600"
                                                    />
                                                    <span className="absolute text-white opacity-0 peer-checked:opacity-100 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none text-[10px]">✓</span>
                                                </div>
                                                <span className="text-xs font-bold text-gray-700 group-hover:text-indigo-600 transition-colors">Xóa .append()</span>
                                            </label>

                                            <div className="mt-2 pt-2 border-t border-gray-100">
                                                <p className="text-[9px] text-gray-400 italic">
                                                    Tự động biến đổi mã nguồn Java/C# chứa sql.append thành câu lệnh SQL thô.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-end">
                            <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Revert thiết kế từ code → format SQL</span>
                        </div>
                    )}
                </div>

                <div className="flex gap-2">
                    {subTab !== 'revertTK' && (
                    <>
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
                    </>
                    )}
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
                                            <DictionaryRow
                                                key={idx}
                                                item={item}
                                                idx={idx}
                                                copyFeedback={copyFeedback}
                                                onCopy={handleCopy}
                                            />
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </>
                ) : subTab === 'revertTK' ? (
                    <div className="flex-1 flex flex-col overflow-hidden bg-white">
                        <div className="grid grid-cols-2 flex-1 overflow-hidden">
                            <div className="flex flex-col border-r border-gray-200 min-h-0">
                                <div className="bg-amber-50/80 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-amber-600 border-b border-amber-100 flex justify-between items-center h-12 shrink-0">
                                    <span>SOURCE (Code / SQL append...)</span>
                                    <button
                                        onClick={() => { setRevertTKInput(''); setRevertTKResult(''); }}
                                        className="text-red-400 hover:text-red-600 text-[9px] font-black border border-red-100 px-2 py-1 rounded-lg hover:bg-red-50"
                                    >
                                        CLEAR
                                    </button>
                                </div>
                                <textarea
                                    wrap="off"
                                    className="flex-1 w-full p-4 font-mono text-sm outline-none resize-none border-none bg-white text-gray-800 overflow-auto"
                                    style={{ whiteSpace: 'pre' }}
                                    placeholder="Dán code (Java/C# sql.append, hoặc đoạn thiết kế SQL thô)..."
                                    value={revertTKInput}
                                    onChange={(e) => setRevertTKInput(e.target.value)}
                                />
                            </div>
                            <div className="flex flex-col min-h-0">
                                <div className="bg-amber-50/80 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-amber-600 border-b border-amber-100 flex justify-between items-center h-12 shrink-0">
                                    <span>SQL DESIGN (Formatted)</span>
                                    <button
                                        onClick={() => revertTKResult && navigator.clipboard.writeText(revertTKResult)}
                                        disabled={!revertTKResult}
                                        className="px-3 py-1.5 rounded-lg text-[10px] font-black bg-white text-amber-600 border border-amber-200 hover:bg-amber-50 disabled:opacity-50"
                                    >
                                        📋 COPY
                                    </button>
                                </div>
                                <div
                                    className="flex-1 p-4 font-mono text-sm overflow-auto bg-amber-50/20 text-amber-900 whitespace-pre"
                                >
                                    {revertTKResult || <span className="opacity-40 italic">Kết quả revert/format sẽ hiện ở đây. Bấm REVERT bên dưới.</span>}
                                </div>
                                <div className="px-4 py-3 border-t border-amber-100 bg-amber-50/50 shrink-0">
                                    <button
                                        onClick={handleRevertTK}
                                        disabled={!revertTKInput.trim()}
                                        className="px-6 py-2.5 bg-amber-600 text-white text-xs font-black rounded-xl hover:bg-amber-700 transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                        title="Revert thiết kế từ code, format theo rule SQL"
                                    >
                                        🔄 REVERT / FORMAT
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col overflow-hidden bg-white">
                        <div className="grid grid-cols-2 flex-1 overflow-hidden">
                            <div className="flex flex-col border-r border-gray-200 min-h-0 relative">
                                <div className="bg-gray-50/50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-gray-100 flex justify-between items-center h-12 shrink-0 z-30">
                                    <span>INPUT SOURCE (Any language)</span>
                                    <button
                                        onClick={() => setBulkInput('')}
                                        className="text-red-400 hover:text-red-600 transition-colors text-[9px] font-black border border-red-100 px-2 py-1 rounded-lg hover:bg-red-50"
                                    >
                                        CLEAR ALL
                                    </button>
                                </div>
                                <div className="flex-1 relative min-h-0 bg-white group/input">
                                    {/* Highlighter Overlay - no wrap, sync scroll với input */}
                                    <div
                                        ref={highlighterRef}
                                        className="absolute inset-0 p-6 font-mono text-sm pointer-events-none text-transparent whitespace-pre overflow-auto box-border z-10"
                                        style={{
                                            lineHeight: `${lineSpacing}`,
                                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                                        }}
                                    >
                                        {translatedLines.map((line, lIdx) => (
                                            <div
                                                key={lIdx}
                                                className={`transition-colors duration-200 ${hoveredKey?.startsWith(`p-${lIdx}-`) ? 'bg-indigo-500/10' : ''}`}
                                                style={{ minHeight: `${lineSpacing}em` }}
                                            >
                                                {line.segments.length > 0 ? line.segments.map(seg => (
                                                    <span
                                                        key={seg.key}
                                                        className={`transition-colors duration-300 inline ${seg.type === 'phrase' ? (hoveredKey === seg.key ? 'text-indigo-600 underline decoration-2 underline-offset-4' : 'text-indigo-600/40 underline decoration-1 underline-offset-4') : ''}`}
                                                    >
                                                        {seg.original}
                                                    </span>
                                                )) : '\u200B'}
                                            </div>
                                        ))}
                                    </div>
                                    <textarea
                                        ref={inputRef}
                                        wrap="off"
                                        onScroll={handleInputScroll}
                                        className="absolute inset-0 w-full h-full p-6 font-mono text-sm outline-none resize-none bg-transparent focus:bg-indigo-50/5 transition-colors overflow-auto z-20 border-none box-border text-gray-800 caret-gray-800"
                                        style={{
                                            lineHeight: `${lineSpacing}`,
                                            whiteSpace: 'pre',
                                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                                        }}
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
                                        onClick={handleCopyResult}
                                        disabled={translatedLines.length === 0}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-300
                                            ${resultCopyFeedback
                                                ? 'bg-green-500 text-white shadow-lg scale-105'
                                                : 'bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50 hover:border-indigo-300 shadow-sm active:scale-95'
                                            }
                                            ${translatedLines.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}
                                        `}
                                    >
                                        <span>{resultCopyFeedback ? '✓ COPIED!' : '📋 COPY RESULT'}</span>
                                    </button>
                                </div>
                                <div
                                    ref={outputRef}
                                    onScroll={handleOutputScroll}
                                    className="flex-1 p-6 font-mono text-sm outline-none overflow-auto custom-scrollbar bg-indigo-50/10 text-indigo-900 shadow-inner box-border"
                                    style={{
                                        lineHeight: `${lineSpacing}`,
                                        whiteSpace: 'pre',
                                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                                    }}
                                >
                                    {translatedLines.length > 0 ? (
                                        translatedLines.map((line, lIdx) => {
                                            return (
                                                <div
                                                    key={lIdx}
                                                    className={`flex items-start transition-colors duration-200 relative group/line hover:!z-[100] whitespace-nowrap ${hoveredKey?.startsWith(`p-${lIdx}-`) ? 'bg-indigo-500/5' : ''}`}
                                                    style={{
                                                        minHeight: `${lineSpacing}em`,
                                                        zIndex: translatedLines.length - lIdx
                                                    }}
                                                >
                                                    <div className="flex-1 whitespace-nowrap">
                                                        {line.segments.length > 0 ? line.segments.map(seg => (
                                                            <MemoizedSegment
                                                                key={seg.key}
                                                                seg={seg}
                                                                lIdx={lIdx}
                                                                hoveredKey={hoveredKey}
                                                                onHover={setHoveredKey}
                                                                copiedKey={segmentCopyFeedback}
                                                                onClick={(s) => {
                                                                    if (window.getSelection()?.toString()) return;
                                                                    navigator.clipboard.writeText(s.text);
                                                                    setSegmentCopyFeedback(s.key);
                                                                    setTimeout(() => setSegmentCopyFeedback(null), 1000);
                                                                }}
                                                                onCycle={(key, option) => {
                                                                    setSelections(prev => ({ ...prev, [key]: option }));
                                                                    if (!window.getSelection()?.toString()) {
                                                                        navigator.clipboard.writeText(option);
                                                                        setSegmentCopyFeedback(key);
                                                                        setTimeout(() => setSegmentCopyFeedback(null), 1000);
                                                                    }
                                                                }}
                                                            />
                                                        )) : '\u200B'}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full opacity-20 select-none">
                                            <span className="text-4xl mb-4">✨</span>
                                            <span className="text-sm italic font-black uppercase tracking-widest">Translation will appear here</span>
                                        </div>
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

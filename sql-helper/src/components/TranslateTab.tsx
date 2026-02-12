import React, { useState, useEffect, useMemo, useRef, useDeferredValue } from 'react';
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

const MemoizedSegment = React.memo(({ seg, hoveredKey, onHover, onClick, copiedKey, lIdx, onShowTooltip }: {
    seg: TranslatedSegment,
    hoveredKey: string | null,
    onHover: (key: string | null) => void,
    onClick: (seg: TranslatedSegment) => void,
    copiedKey: string | null,
    lIdx: number,
    onShowTooltip: (seg: TranslatedSegment, rect: DOMRect) => void
}) => {
    if (seg.type === 'text') return <>{seg.text}</>;

    const isCopied = copiedKey === seg.key;
    const elementRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        if (seg.isMultiple && hoveredKey === seg.key && elementRef.current) {
            onShowTooltip(seg, elementRef.current.getBoundingClientRect());
        }
    }, [hoveredKey, seg, onShowTooltip]);

    return (
        <span
            ref={elementRef}
            key={seg.key}
            className={`inline-flex items-center group/opt relative cursor-pointer mx-0.5 transition-all duration-300 font-bold
                ${seg.isMultiple ? 'text-amber-600 border-b-2 border-amber-400/50 hover:border-amber-400' : 'text-indigo-600 border-b border-indigo-200 hover:border-indigo-400'}
                ${hoveredKey === seg.key ? '!text-indigo-900 !border-indigo-600 !border-b-2 scale-[1.02]' : ''}
                ${isCopied ? '!text-green-600 !border-green-600 !border-b-2' : ''}
            `}
            onMouseEnter={() => {
                onHover(seg.key);
            }}
            onMouseLeave={() => {
                onHover(null);
            }}
            onClick={() => onClick(seg)}
        >
            <span className="relative z-10">{seg.text}</span>

            {seg.isMultiple && (
                <span className="ml-1 text-[8px] opacity-60 bg-indigo-50 px-1 rounded-full border border-indigo-200 select-none">
                    {seg.options.length}
                </span>
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

const HighlighterOverlay = React.memo(({
    translatedLines,
    hoveredKey,
    lineSpacing
}: {
    translatedLines: TranslatedLine[],
    hoveredKey: string | null,
    lineSpacing: number
}) => {
    return (
        <>
            {translatedLines.map((line, lIdx) => (
                <div
                    key={lIdx}
                    className={`transition-colors duration-200 whitespace-nowrap overflow-hidden ${hoveredKey?.startsWith(`p-${lIdx}-`) ? 'bg-indigo-500/10' : ''}`}
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
        </>
    );
});

const getExcelColumnName = (colIndex: number) => {
    let columnName = '';
    while (colIndex >= 0) {
        columnName = String.fromCharCode((colIndex % 26) + 65) + columnName;
        colIndex = Math.floor(colIndex / 26) - 1;
    }
    return columnName;
};

const normalizeText = (s: string) => s
    .replace(/[！-～]/g, (m) => String.fromCharCode(m.charCodeAt(0) - 0xFEE0)) // Full-width to half-width
    .replace(/　/g, ' ') // Full-width space to half-width
    .replace(/[\t\r\n\v\f]/g, ' '); // All whitespace-like to standard space (1-to-1)

const RevertTKGrid = React.memo((props: {
    content: string,
    defaultWidth: number,
    customWidths: Record<number, number>,
    translationDict: any[],
    selections: Record<string, string>,
    onSelectionChange: (key: string, value: string) => void,
    hoveredKey: string | null,
    onHover: (key: string | null) => void,
    copiedKey: string | null,
    onCopySegment: (key: string) => void
}) => {
    if (!props.content) return null;

    const lines = props.content.split('\n');
    const dataRows = useMemo(() => lines.map(line => line.split('\t')), [lines]);
    const maxCols = useMemo(() => Math.max(...dataRows.map(row => row.length)), [dataRows]);
    const [copiedCell, setCopiedCell] = useState<{ r: number, c: number } | null>(null);
    const [tooltipState, setTooltipState] = useState<{ seg: TranslatedSegment, rect: DOMRect } | null>(null);

    useEffect(() => {
        if (!props.hoveredKey) {
            setTooltipState(null);
        }
    }, [props.hoveredKey]);

    const segmentedRows = useMemo(() => {
        if (props.translationDict.length === 0) return [];
        return dataRows.map((row, rIdx) =>
            row.map((cellText, cIdx) => {
                const text = cellText || '';
                if (!text) return null;

                const matches: { start: number, end: number, replacements: string[], phrase: string }[] = [];
                const normLine = normalizeText(text);

                for (const item of props.translationDict) {
                    // Performance optimization: fast fail if phrase not in line
                    if (!normLine.includes(item.phrase)) continue;

                    item.regex.lastIndex = 0;
                    let match;
                    while ((match = item.regex.exec(normLine)) !== null) {
                        const start = match.index;
                        const end = start + item.phrase.length;
                        if (!matches.some(m => (start < m.end && end > m.start))) {
                            matches.push({
                                start,
                                end,
                                replacements: item.replacements,
                                phrase: text.substring(start, end)
                            });
                        }
                        if (item.phrase.length === 0) break;
                    }
                }

                if (matches.length === 0) return null;

                matches.sort((a, b) => a.start - b.start);
                const segments: TranslatedSegment[] = [];
                let lastIndex = 0;

                matches.forEach((m) => {
                    if (m.start > lastIndex) {
                        const txt = text.substring(lastIndex, m.start);
                        segments.push({ type: 'text', text: txt, original: txt, key: `rg-t-${rIdx}-${cIdx}-${lastIndex}`, isMultiple: false, options: [] });
                    }

                    const selectionKey = `rg-s-${rIdx}-${cIdx}-${m.start}`;
                    const currentSelection = props.selections[selectionKey] || m.replacements[0];

                    segments.push({
                        type: 'phrase',
                        text: currentSelection,
                        original: m.phrase,
                        key: selectionKey,
                        isMultiple: m.replacements.length > 1,
                        options: m.replacements
                    });
                    lastIndex = m.end;
                });

                if (lastIndex < text.length) {
                    const txt = text.substring(lastIndex);
                    segments.push({ type: 'text', text: txt, original: txt, key: `rg-t-${rIdx}-${cIdx}-${lastIndex}`, isMultiple: false, options: [] });
                }
                return segments;
            })
        );
    }, [dataRows, props.translationDict, props.selections]);

    const handleCellClick = (text: string | undefined, r: number, c: number) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopiedCell({ r, c });
        setTimeout(() => setCopiedCell(null), 1000);
    };

    const getColWidth = (index: number, defaultWidth: number, customWidths: Record<number, number>) => {
        return customWidths[index] || defaultWidth;
    };

    return (
        <div className="flex-1 overflow-auto custom-scrollbar bg-white border border-gray-200 shadow-inner select-none">
            <table className="border-collapse table-fixed min-w-full">
                <thead>
                    <tr className="bg-gray-100/90 sticky top-0 z-10 shadow-sm shadow-gray-200/50">
                        <th className="w-10 px-2 py-1.5 text-[10px] font-black text-gray-500 border-r border-b border-gray-300 text-center bg-gray-100 tracking-tighter">#</th>
                        {Array.from({ length: maxCols }).map((_, i) => (
                            <th
                                key={i}
                                className="px-3 py-1.5 text-[10px] font-black text-gray-600 border-r border-b border-gray-300 text-left uppercase tracking-wider bg-gray-50 overflow-hidden text-ellipsis whitespace-nowrap"
                                style={{ width: getColWidth(i, props.defaultWidth, props.customWidths) }}
                            >
                                {getExcelColumnName(i)}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {dataRows.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-amber-50/60 transition-colors group">
                            <td className="bg-gray-50 px-2 py-1.5 text-[10px] font-bold text-gray-400 border-r border-b border-gray-200 text-center group-hover:bg-amber-100/50 transition-colors">
                                {rIdx + 1}
                            </td>
                            {Array.from({ length: maxCols }).map((_, cIdx) => {
                                const cellText = row[cIdx];
                                const isHeader = cellText?.trim() === 'カラム名' || cellText?.trim() === 'セット内容';
                                const isSection = row.length === 1 && cIdx === 0 && row[0]?.trim().startsWith('■');
                                const isJoin = row.length === 1 && cIdx === 0 && row[0]?.trim().startsWith('・');
                                const isCopied = copiedCell?.r === rIdx && copiedCell?.c === cIdx;

                                return (
                                    <td
                                        key={cIdx}
                                        onClick={(e) => {
                                            // Only handle cell click if we didn't click a segment or something interactive
                                            if ((e.target as HTMLElement).closest('.group\\/opt')) return;
                                            handleCellClick(cellText, rIdx, cIdx);
                                        }}
                                        className={`px-3 py-1.5 text-[12px] border-r border-b border-gray-200 transition-all font-sans relative cursor-cell whitespace-pre-wrap
                                            ${cellText ? 'text-gray-800 font-medium' : 'bg-gray-50/10'}
                                            ${isSection ? 'bg-amber-50 font-black text-amber-900 border-b-2 border-amber-200' : ''}
                                            ${isJoin ? 'bg-indigo-50 font-black text-indigo-900' : ''}
                                            ${isHeader ? 'bg-indigo-600 text-white font-black' : ''}
                                            ${isCopied ? '!bg-green-100 !text-green-800' : ''}
                                            ${!cellText && !isSection && !isJoin ? 'hover:bg-gray-100' : 'hover:bg-indigo-50/30'}
                                        `}
                                        colSpan={row.length === 1 && cIdx === 0 ? maxCols : 1}
                                        style={row.length === 1 && cIdx > 0 ? { display: 'none' } : {}}
                                        title={cellText ? "Click to copy cell" : ""}
                                    >
                                        <div className={`line-clamp-2 hover:line-clamp-none transition-all ${isCopied ? 'scale-105' : ''}`}>
                                            {cellText ? (
                                                segmentedRows[rIdx]?.[cIdx] ? (
                                                    segmentedRows[rIdx][cIdx].map(seg => (
                                                        <MemoizedSegment
                                                            key={seg.key}
                                                            seg={seg}
                                                            lIdx={rIdx}
                                                            hoveredKey={props.hoveredKey}
                                                            onHover={props.onHover}
                                                            copiedKey={props.copiedKey}
                                                            onShowTooltip={(s, r) => setTooltipState({ seg: s, rect: r })}
                                                            onClick={(s) => {
                                                                if (window.getSelection()?.toString()) return;
                                                                navigator.clipboard.writeText(s.text);
                                                                props.onCopySegment(s.key);
                                                            }}
                                                        />
                                                    ))
                                                ) : cellText
                                            ) : ''}
                                        </div>
                                        {isCopied && (
                                            <span className="absolute top-0 right-0 bg-green-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-bl shadow-sm animate-in fade-in zoom-in duration-200">
                                                COPIED CELL
                                            </span>
                                        )}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
            {tooltipState && props.hoveredKey === tooltipState.seg.key && (
                <div
                    className="fixed z-[99999] flex flex-col bg-white rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.4),0_0_1px_rgba(0,0,0,0.1)] border border-indigo-200 py-1.5 min-w-[140px] animate-in slide-in-from-left-2 duration-200 pointer-events-auto cursor-default"
                    style={{
                        top: tooltipState.rect.top,
                        left: tooltipState.rect.right + 8, // +8 for padding
                    }}
                    onMouseEnter={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Speech bubble arrow */}
                    <div className="absolute top-3 -left-1.5 w-3 h-3 bg-white border-l border-b border-indigo-200 rotate-45"></div>

                    <div className="max-h-[220px] overflow-y-auto custom-scrollbar flex flex-col pt-0.5">
                        {tooltipState.seg.options.map((opt, oIdx) => (
                            <button
                                key={oIdx}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    props.onSelectionChange(tooltipState.seg.key, opt);
                                    if (!window.getSelection()?.toString()) {
                                        navigator.clipboard.writeText(opt);
                                        props.onCopySegment(tooltipState.seg.key);
                                    }
                                }}
                                className={`px-3 py-2 text-[11px] font-bold transition-all text-left flex items-center gap-2
                                    ${tooltipState.seg.text === opt
                                        ? 'bg-indigo-600 text-white'
                                        : 'text-gray-700 hover:bg-indigo-50 hover:text-indigo-600'}
                                `}
                            >
                                <span className="opacity-40 text-[9px] w-3">{oIdx + 1}</span>
                                <span className="flex-1 truncate">{opt}</span>
                                {tooltipState.seg.text === opt && <span className="text-[10px]">✓</span>}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
});


const DictionaryRow = React.memo(({ item, idx, copyFeedback, onCopy, onEdit, onDelete }: {
    item: TranslateEntry,
    idx: number,
    copyFeedback: any,
    onCopy: any,
    onEdit: (item: TranslateEntry, idx: number) => void,
    onDelete: (idx: number) => void
}) => (
    <tr className="border-b border-gray-200 hover:bg-indigo-50/60 transition-colors group/row">
        <td className="w-12 px-2 py-2.5 text-center border-r border-gray-100 text-[10px] text-gray-400 font-bold select-none bg-gray-50/30 group-hover/row:bg-indigo-50/0 transition-colors">
            {idx + 1}
        </td>

        <td
            className={`px-4 py-2.5 border-r border-gray-200 cursor-pointer align-middle transition-all duration-300 relative
                ${copyFeedback?.row === idx && copyFeedback.col === 'jp' ? 'bg-green-100' : ''}
            `}
            onClick={() => onCopy(item.japanese, idx, 'jp')}
        >
            <div className="flex justify-between items-center group/cell">
                <span className="text-[12px] font-bold text-gray-700 leading-tight whitespace-pre-wrap break-words group-hover/row:text-gray-900">
                    {item.japanese}
                </span>
                {copyFeedback?.row === idx && copyFeedback.col === 'jp' && <span className="text-[9px] text-green-600 font-black animate-pulse select-none pointer-events-none">COPY!</span>}
            </div>
        </td>

        <td
            className={`px-4 py-2.5 border-r border-gray-200 cursor-pointer align-middle transition-all duration-300 relative
                ${copyFeedback?.row === idx && copyFeedback.col === 'en' ? 'bg-green-100' : ''}
            `}
            onClick={() => onCopy(item.english, idx, 'en')}
        >
            <div className="flex justify-between items-center">
                <span className="text-[12px] font-mono font-black text-indigo-600 leading-tight break-all uppercase group-hover/row:text-indigo-700">
                    {item.english}
                </span>
                {copyFeedback?.row === idx && copyFeedback.col === 'en' && <span className="text-[9px] text-green-600 font-black animate-pulse select-none pointer-events-none">COPY!</span>}
            </div>
        </td>

        <td
            className={`px-4 py-2.5 cursor-pointer align-middle transition-all duration-300 relative group/last
                ${copyFeedback?.row === idx && copyFeedback.col === 'vi' ? 'bg-green-100' : ''}
            `}
            onClick={() => onCopy(item.vietnamese, idx, 'vi')}
        >
            <div className="flex justify-between items-center">
                <span className="text-[12px] font-bold text-teal-600 leading-tight break-words font-sans group-hover/row:text-teal-700">
                    {item.vietnamese}
                </span>
                {copyFeedback?.row === idx && copyFeedback.col === 'vi' && <span className="text-[9px] text-green-600 font-black animate-pulse select-none pointer-events-none">COPY!</span>}

                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity bg-white/90 backdrop-blur-sm p-1 rounded-lg shadow-sm border border-gray-100 ring-1 ring-black/5" onClick={(e) => e.stopPropagation()}>
                    <button
                        onClick={(e) => { e.stopPropagation(); onEdit(item, idx); }}
                        className="p-1.5 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded transition-colors"
                        title="Edit"
                    >
                        ✏️
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(idx); }}
                        className="p-1.5 text-red-400 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                        title="Delete"
                    >
                        🗑️
                    </button>
                </div>
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
        setFormatSqlAppend,
        searchStrict,
        setSearchStrict,
        columnSplitEnabled, setColumnSplitEnabled,
        columnSplitKeywords, setColumnSplitKeywords,
        revertTKColConfig, setRevertTKColConfig,
        columnSplitApplyToText, setColumnSplitApplyToText,
        columnSplitApplyToTable, setColumnSplitApplyToTable,
        revertTKDeleteChars, setRevertTKDeleteChars,
        revertTKMapping, setRevertTKMapping,
        translateDeleteChars, setTranslateDeleteChars,
        translateTruncateDuplicate, setTranslateTruncateDuplicate,
        textCompareExpectedInput, setTextCompareExpectedInput,
        textCompareCurrentInput, setTextCompareCurrentInput,
        runShortcut,
        connections,
        translateSubTab: subTab, setTranslateSubTab: setSubTab
    } = useAppStore();

    const [data, setData] = useState<TranslateEntry[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [copyFeedback, setCopyFeedback] = useState<{ row: number, col: 'jp' | 'en' | 'vi' } | null>(null);
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
    const [dictionaryLimit, setDictionaryLimit] = useState(200);

    // Edit modal state
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingEntry, setEditingEntry] = useState<TranslateEntry | null>(null);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);

    const deferredBulkInput = useDeferredValue(bulkInput);
    const deferredRevertTKInput = useDeferredValue(revertTKInput);
    const deferredSearchTerm = useDeferredValue(searchTerm);
    const [showFormatSettings, setShowFormatSettings] = useState(false);
    const [newSectionLabel, setNewSectionLabel] = useState('');
    const [revertTKMode, setRevertTKMode] = useState<'TKtoCode' | 'CodetoTK'>('CodetoTK');
    const [revertTKResultFormat, setRevertTKResultFormat] = useState<'text' | 'table'>('table');

    const [revertConfigTab, setRevertConfigTab] = useState<'general' | 'codeToTk' | 'tkToCode'>('general');
    const defaultColWidth = 100;
    const parsedCustomWidths = useMemo<Record<number, number>>(() => {
        const widths: Record<number, number> = {};
        if (!revertTKColConfig.trim()) return widths;
        revertTKColConfig.split(',').forEach(part => {
            const [col, val] = part.split(':');
            if (col && val) {
                const colName = col.trim().toUpperCase();
                const widthVal = parseInt(val.trim());
                if (!isNaN(widthVal)) {
                    // Convert column name (A, B, C...) to index
                    let idx = 0;
                    for (let i = 0; i < colName.length; i++) {
                        idx = idx * 26 + (colName.charCodeAt(i) - 64);
                    }
                    widths[idx - 1] = widthVal;
                }
            }
        });
        return widths;
    }, [revertTKColConfig]);

    const [showRevertConfig, setShowRevertConfig] = useState(false);
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

    const revertTKInputRef = useRef<HTMLTextAreaElement>(null);
    const [revertTKTranslatedLines, setRevertTKTranslatedLines] = useState<TranslatedLine[]>([]);

    const handleInputScroll = () => {
        if (inputRef.current) {
            const { scrollTop, scrollLeft } = inputRef.current;
            if (outputRef.current) {
                outputRef.current.scrollTop = scrollTop;
                outputRef.current.scrollLeft = scrollLeft;
                // Sync output gutter
                const outputGutter = outputRef.current.previousElementSibling;
                if (outputGutter) outputGutter.scrollTop = scrollTop;
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
                // Sync input gutter
                const inputGutter = inputRef.current.parentElement?.previousElementSibling;
                if (inputGutter) inputGutter.scrollTop = scrollTop;
            }
            if (highlighterRef.current) {
                highlighterRef.current.scrollTop = scrollTop;
                highlighterRef.current.scrollLeft = scrollLeft;
            }
        }
    };

    const handleRevertTKInputScroll = () => {
        if (revertTKInputRef.current) {
            const { scrollTop, scrollLeft } = revertTKInputRef.current;
            if (highlighterRef.current) {
                highlighterRef.current.scrollTop = scrollTop;
                highlighterRef.current.scrollLeft = scrollLeft;
            }
            // Sync gutter
            const gutter = revertTKInputRef.current.parentElement?.previousElementSibling;
            if (gutter) gutter.scrollTop = scrollTop;
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

        // Custom delete chars (Independent)
        if (translateDeleteChars) {
            const escapeIdx = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const charsPattern = '[' + escapeIdx(translateDeleteChars) + ']';
            const regex = new RegExp(charsPattern, 'g');
            processedText = processedText.replace(regex, '');
        }

        // Logic 1 & 3: Remove space, tab, and commas
        if (formatRemoveSpaces) {
            // Remove commas first
            processedText = processedText.replace(/,/g, '');

            const lines = processedText.split('\n');
            let formattedLines = lines.map(line => {
                // Replace tabs and multiple spaces with a single space, then trim
                return line.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
            }).filter(line => line.length > 0);

            processedText = formattedLines.join('\n');
        }

        // Truncate duplicates (Apply generally)
        if (translateTruncateDuplicate) {
            const lines = processedText.split('\n');
            const uniqueLines = Array.from(new Set(lines));
            processedText = uniqueLines.join('\n');
        }

        setBulkInput(processedText);
    };

    const convertTKToCode = (input: string): string => {
        const lines = input.split('\n');
        const codeLines: string[] = [];
        let inTable = false;

        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) {
                codeLines.push('sb.append(" ");');
                return;
            }

            // Detect section headers
            if (trimmed.startsWith('■') || trimmed.startsWith('【')) {
                codeLines.push(`// ${trimmed}`);
                inTable = false;
                return;
            }

            // Detect table headers
            if (trimmed.includes('カラム名') || trimmed.includes('セット内容')) {
                inTable = true;
                return;
            }

            if (inTable && line.includes('\t')) {
                const parts = line.split('\t');
                const colName = (parts[0] || '').trim();
                const expression = (parts[1] || '').trim();
                if (expression) {
                    codeLines.push(`sb.append(" , ${expression} /* ${colName} */ ");`);
                } else if (colName) {
                    codeLines.push(`sb.append(" /* ${colName} */ ");`);
                }
            } else {
                // Raw text, wrap in append
                codeLines.push(`sb.append(" ${trimmed} ");`);
            }
        });

        return codeLines.join('\n');
    };

    const handleRevertTK = () => {
        if (!revertTKInput.trim()) return;
        let result = '';
        if (revertTKMode === 'TKtoCode') {
            result = convertTKToCode(revertTKInput);
        } else {
            // Check if column split should be applied based on current preview format
            const shouldSplit = columnSplitEnabled && (
                (revertTKResultFormat === 'text' && columnSplitApplyToText) ||
                (revertTKResultFormat === 'table' && columnSplitApplyToTable)
            );

            result = smartFormatSqlDesign(revertTKInput, {
                splitEnabled: shouldSplit,
                keywords: columnSplitKeywords.split(',').map(k => k.trim()).filter(Boolean),
                deleteChars: revertTKDeleteChars.split(',').map(k => k.trim()).filter(Boolean)
            });
        }
        setRevertTKResult(result);
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
        const trimmedSearch = deferredSearchTerm.trim();
        if (!trimmedSearch) return data;
        const lowerSearch = trimmedSearch.toLowerCase();

        return data.filter(item => {
            if (searchStrict) {
                return item.japanese.toLowerCase() === lowerSearch ||
                    item.english.toLowerCase() === lowerSearch ||
                    item.vietnamese.toLowerCase() === lowerSearch;
            }
            return item.japanese.toLowerCase().includes(lowerSearch) ||
                item.english.toLowerCase().includes(lowerSearch) ||
                item.vietnamese.toLowerCase().includes(lowerSearch);
        });
    }, [data, deferredSearchTerm, searchStrict]);

    const handleCopy = (text: string, rowIdx: number, col: 'jp' | 'en' | 'vi') => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopyFeedback({ row: rowIdx, col });
        setTimeout(() => setCopyFeedback(null), 600);
    };



    const splitSqlColumn = (val: string, keywords: string[]): string[] => {
        if (!val) return [''];
        let expression = val.trim();

        const sortedKeywords = keywords
            .map(k => k.trim())
            .filter(Boolean)
            .sort((a, b) => b.length - a.length);

        if (sortedKeywords.length === 0) return [expression];

        // Escape keywords and add word boundaries for text-based keywords (CASE, AS, etc.)
        const escaped = sortedKeywords.map(k => {
            const pattern = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Use \b for keywords that are purely alphanumeric to prevent matching inside other words
            return /^[a-zA-Z0-9_]+$/.test(k) ? `\\b${pattern}\\b` : pattern;
        });

        // Build regex with capturing group () to keep the delimiters (keywords) as separate elements
        const regex = new RegExp(`(${escaped.join('|')})`, 'gi');

        // Split and clean up parts
        return expression.split(regex)
            .map(p => p.trim())
            .filter(p => p !== '');
    };

    /**
     * Smart formatter for SQL design documents based on rules in CHANGES.md.
     */
    const smartFormatSqlDesign = (input: string, config?: { splitEnabled: boolean, keywords: string[], deleteChars?: string[] }): string => {
        if (!input.trim()) return input;

        let text = input;

        // STEP 0: Clean up specified characters (e.g. quotes, commas if configured)
        if (config?.deleteChars && config.deleteChars.length > 0) {
            const escapedChars = config.deleteChars.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            const deleteRegex = new RegExp(`[${escapedChars.join('')}]`, 'g');
            text = text.replace(deleteRegex, '');
        }

        // STEP 0: Basic cleanup of Java/C# append-style SQL (re-use current behavior)
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

        // Helper: format SQL info blocks based on config
        const formatConfiguredBlocks = (src: string[]): string[] => {
            let result = [...src];

            revertTKMapping.forEach(cfg => {
                for (let i = 0; i < result.length; i++) {
                    const line = result[i];
                    const trimmed = line.trim();

                    if (trimmed.startsWith(cfg.label)) {
                        const gapToValue1 = "\t".repeat(cfg.offsets[0]);

                        if (cfg.type === 'text') {
                            if (trimmed.includes('：') || trimmed.includes(':')) {
                                const splitChar = trimmed.includes('：') ? '：' : ':';
                                const labelPart = trimmed.substring(0, trimmed.indexOf(splitChar)).trim();
                                const valuePart = trimmed.substring(trimmed.indexOf(splitChar) + 1).trim();
                                result[i] = `${labelPart}${splitChar}${gapToValue1}${valuePart}`;
                            } else {
                                result[i] = `${trimmed}`;
                            }
                        } else if (cfg.type === 'table') {
                            result[i] = `${trimmed}`;
                        }
                    }
                }
            });

            return result;
        };

        // Helper: Insert table headers if missing based on config
        const formatTableHeaders = (src: string[]): string[] => {
            const result = [...src];

            revertTKMapping.filter(c => c.type === 'table').forEach(cfg => {
                for (let i = 0; i < result.length; i++) {
                    const trimmed = result[i].trim();
                    if (trimmed === cfg.label || trimmed.startsWith(cfg.label + ' ')) {
                        const nextIdx = i + 1;
                        if (nextIdx >= result.length) continue;
                        const nextLine = result[nextIdx].trim();
                        if (!nextLine) continue;

                        let header = "";
                        const gap = "\t".repeat(cfg.offsets[1] || 1);
                        if (cfg.id === 'ext-items' || cfg.id === 'ins-items') {
                            if (config?.splitEnabled) {
                                header = `エイリアス${gap}カラム名${gap}セット内容`;
                            } else {
                                header = `カラム名${gap}セット内容`;
                            }
                        }
                        else if (cfg.id === 'log-output') header = `レベル${gap}メッセージ`;

                        if (header && !nextLine.includes(header.split('\t')[0])) {
                            // Offset to column A
                            const lead = "\t".repeat(cfg.offsets[0] || 1);
                            result.splice(nextIdx, 0, lead + header);
                        }
                    }
                }
            });

            return result;
        };

        // Helper: format 2-column tables (カラム名 / セット内容, レベル / メッセージ)
        const formatTwoColumnTables = (src: string[]): string[] => {
            const result = [...src];
            const tableHeaderKeywords = [
                'カラム名',
                'セット内容',
                '抽出項目',
                '挿入項目',
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
                    if (isHeaderLine(l) || l.trim().startsWith('■')) break;
                    end = j;
                }

                // Collect rows
                const rows: { idx: number; col1: string; col2: string }[] = [];

                for (let k = start; k <= end; k++) {
                    const raw = result[k];
                    const trimmed = raw.trim();
                    if (!trimmed) continue;

                    // Đã có tab (header chèn từ formatExtractionBlocks): カラム名\tセット内容
                    if (trimmed.includes('カラム名') && trimmed.includes('\t')) {
                        const parts = trimmed.split(/\t/);
                        rows.push({ idx: k, col1: (parts[0] || '').trim(), col2: (parts[1] || '').trim() });
                        continue;
                    }

                    // Generic split: first group of 2+ spaces separates col1 and col2
                    const m = trimmed.match(/^(\S(?:.*?\S)?)\s{2,}(.*\S.*)$/);
                    if (m) {
                        rows.push({ idx: k, col1: m[1], col2: m[2] });
                        continue;
                    }

                    // Fallback: 抽出項目/挿入項目 data row (1 space): "法人コード 「退避・法人コード」" → 2 cột
                    const singleSpace = trimmed.match(/^(\S+)\s+(.+)$/);
                    if (singleSpace) {
                        rows.push({ idx: k, col1: singleSpace[1], col2: singleSpace[2] });
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
                    // Tab-separated: copy sang Excel → 2 cột vào 2 ô (giữ nguyên table như ảnh)
                    rows.forEach(({ idx: lineIdx, col1, col2 }) => {
                        const blockHeader = result[start].toLowerCase();
                        const isSplittableBlock = blockHeader.includes('セット内容') ||
                            blockHeader.includes('抽出項目') ||
                            blockHeader.includes('挿入項目');

                        if (config?.splitEnabled && isSplittableBlock) {
                            const splitParts = splitSqlColumn(col2, config.keywords);
                            // col1 stays, then split parts
                            result[lineIdx] = `${col1}\t` + splitParts.join('\t');
                        } else {
                            result[lineIdx] = `${col1}\t${col2}`;
                        }
                    });
                }

                i = end + 1;
            }

            return result;
        };

        // Helper: align JOIN conditions (ON / AND / OR)
        const formatJoinBlocks = (src: string[]): string[] => {
            const result = [...src];
            // Split AND/OR if they are inline before processing
            // Regex to find AND/OR that are NOT at the start of the string (preceded by space)
            const SPLIT_REGEX = /\s+(AND|OR)\s+/g;

            let i = 0;
            while (i < result.length) {
                const line = result[i];
                // JOIN block starts with bullet like ・商品マスタ RS （INNER JOIN）
                if (!line.trim().startsWith('・')) {
                    i++;
                    continue;
                }

                // Pre-process subsequent lines to split inline AND/OR
                // We do this dynamically as we consume lines
                let offset = 1;
                while (i + offset < result.length) {
                    const idx = i + offset;
                    const nextLine = result[idx];
                    const trimmedNext = nextLine.trim();
                    if (!trimmedNext) { offset++; continue; }
                    if (trimmedNext.startsWith('■') || trimmedNext.startsWith('・')) break;

                    // If line contains multiple keywords, split it
                    // Ignore if it already starts with one of them, only split subsequent ones
                    // But even if it starts with ON, it might have AND later: "ON a=b AND c=d"
                    if (SPLIT_REGEX.test(nextLine)) {
                        // Protect BETWEEN ... AND ... from splitting
                        const placeholders: string[] = [];
                        // Note: simple regex for BETWEEN ... AND. non-nested.
                        // We use \bAND\b to ensure we match the whole word AND.
                        const protectedLine = nextLine.replace(/BETWEEN\s+[\s\S]*?\s+AND\b/gi, (m) => {
                            placeholders.push(m);
                            return `__BW_PH_${placeholders.length - 1}__`;
                        });

                        // Careful split preserving delimiters
                        const parts = protectedLine.replace(SPLIT_REGEX, '\n$1 ').split('\n');

                        if (parts.length > 1) {
                            const cleanedParts = parts.map(p => {
                                // Restore
                                let restored = p.trim();
                                if (restored) {
                                    restored = restored.replace(/__BW_PH_(\d+)__/g, (_, idx) => placeholders[parseInt(idx)]);
                                }
                                return restored;
                            }).filter(p => p);

                            // Only replace if we actually split something meaningful
                            if (cleanedParts.length > 0) {
                                result.splice(idx, 1, ...cleanedParts);
                            }
                        }
                    }
                    offset++;
                }

                const joinStart = i + 1;
                const joinLines: { idx: number; op: string; rest: string }[] = [];
                let maxOpLen = 0;

                for (let j = joinStart; j < result.length; j++) {
                    const raw = result[j];
                    const trimmed = raw.trim();
                    if (!trimmed) continue; // Skip blank lines, don't break
                    if (trimmed.startsWith('■') || trimmed.startsWith('・')) break;

                    const m = trimmed.match(/^(ON|AND|OR)\s+(.*)$/);
                    if (!m) {
                        // If it doesn't start with keyword but is part of JOIN block, maybe force it or leave it?
                        // If we split correctly above, it should match. If not, it might be a weird line.
                        // Let's assume continuation or unmatched.
                        // Check if it really should be part of the join logic?
                        // For now, if it doesn't match ON/AND/OR, we ignore it for alignment but keep it in the block
                        continue;
                    }

                    const op = m[1];
                    const rest = m[2];
                    joinLines.push({ idx: j, op, rest });
                    if (op.length > maxOpLen) maxOpLen = op.length;
                }

                if (joinLines.length > 0) {
                    const BETWEEN_REGEX = /^(.*?)\s+BETWEEN\s+(.*?)\s+AND\s+(.*?)$/i;
                    // Regex for comparison operators. Order matters: checked sequentialy.
                    // Support: <=, >=, <>, !=, =, <, >
                    const COMPARE_REGEX = /^(.*?)\s*(=|<=|>=|<>|!=|<|>)\s*(.*)$/;

                    const INDENT_JOIN = '\t'; // Indent = 1 column (tab)

                    joinLines.forEach(({ idx: lineIdx, op, rest }) => {
                        const trimmedRest = rest.trim();
                        const between = trimmedRest.match(BETWEEN_REGEX);
                        if (between) {
                            // 4 columns: Left | BETWEEN | Start | ～ End
                            // Result: | (Empty) | Op | Left | BETWEEN | Start | ～ End |
                            // Ensure no newlines break the row.
                            const left = between[1].trim();
                            const start = between[2].trim();
                            const end = between[3].trim();
                            result[lineIdx] = `${INDENT_JOIN}${op}\t${left}\tBETWEEN\t${start}\t～ ${end}`;
                        } else {
                            const compare = trimmedRest.match(COMPARE_REGEX);
                            if (compare) {
                                // 3 columns for proper content: Left, Op, Right
                                // Result: | (Empty) | Op | Left | OpSymbol | Right |
                                result[lineIdx] = `${INDENT_JOIN}${op}\t${compare[1].trim()}\t${compare[2]}\t${compare[3].trim()}`;
                            } else {
                                // Fallback
                                result[lineIdx] = `${INDENT_JOIN}${op}\t${trimmedRest}`;
                            }
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
        // Dù source không thụt → output vẫn thụt 1 column (\t). Dừng khi gặp ■ mới hoặc block JOIN (・...JOIN).
        const formatHeaderBlocks = (src: string[]): string[] => {
            const result = [...src];
            const JOIN_HEADER_REGEX = /^・.*（.*JOIN.*）/;
            const INDENT_BLOCK = '\t'; // Use column indent

            for (let i = 0; i < result.length; i++) {
                const line = result[i];
                if (!line.trim().startsWith('■')) continue;

                for (let j = i + 1; j < result.length; j++) {
                    const l = result[j];
                    if (!l.trim()) break;
                    if (l.trim().startsWith('■')) break;
                    if (JOIN_HEADER_REGEX.test(l.trim())) break; // Không thụt tiêu đề JOIN block
                    if (l.trim().startsWith('【')) break; // Block SQL info (論理名・定義名) không thụt theo ■
                    if (l.startsWith('\t')) continue; // Đã thụt rồi

                    result[j] = `${INDENT_BLOCK}${l.trimStart()}`;
                }
            }

            return result;
        };

        lines = formatConfiguredBlocks(lines);
        lines = formatTableHeaders(lines);
        lines = formatTwoColumnTables(lines);
        lines = formatJoinBlocks(lines);
        lines = formatHeaderBlocks(lines);

        // Final pass: if splitEnabled is ON, split any remaining lines that don't have Tabs yet (except headers)
        if (config?.splitEnabled) {
            lines = lines.map(line => {
                if (line.includes('\t')) return line;
                const trimmed = line.trim();
                // Don't split section headers or bullet points
                if (!trimmed || trimmed.startsWith('■') || trimmed.startsWith('・') || trimmed.startsWith('【')) return line;

                const split = splitSqlColumn(line, config.keywords);
                return split.length > 1 ? split.join('\t') : line;
            });
        }

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
            .map(([phrase, replacements]) => {
                const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                // If strict search and latin characters, use word boundaries
                const pattern = (searchStrict && /^[a-zA-Z0-9_ ]+$/.test(phrase))
                    ? `\\b${escaped}\\b`
                    : escaped;

                return {
                    phrase,
                    replacements: Array.from(replacements),
                    regex: new RegExp(pattern, 'g')
                };
            })
            .sort((a, b) => b.phrase.length - a.phrase.length);

        return sorted;
    }, [data, targetLang, searchStrict]);

    const handleCopyResult = () => {
        if (translatedLines.length === 0) return;

        const fullText = translatedLines.map(line =>
            line.segments.map(seg => seg.text).join('')
        ).join('\n');

        navigator.clipboard.writeText(fullText);
        setResultCopyFeedback(true);
        setTimeout(() => setResultCopyFeedback(false), 2000);
    };

    useEffect(() => {
        if (!deferredBulkInput) {
            setTranslatedLines([]);
            return;
        }

        const timer = setTimeout(() => {
            const lines = deferredBulkInput.split('\n');

            const newTranslatedLines: TranslatedLine[] = lines.map((line, lIdx) => {
                const matches: { start: number, end: number, replacements: string[], phrase: string }[] = [];
                const normLine = normalizeText(line);

                for (const item of translationDict) {
                    // Performance optimization: fast fail if phrase not in line
                    if (!normLine.includes(item.phrase)) continue;

                    item.regex.lastIndex = 0;
                    let match;
                    while ((match = item.regex.exec(normLine)) !== null) {
                        const start = match.index;
                        const end = start + item.phrase.length;
                        if (!matches.some(m => (start < m.end && end > m.start))) {
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
        }, 100); // Debounce can be shorter now with deferredValue

        return () => clearTimeout(timer);
    }, [deferredBulkInput, translationDict, selections]);

    useEffect(() => {
        if (!deferredRevertTKInput) {
            setRevertTKTranslatedLines([]);
            return;
        }

        const timer = setTimeout(() => {
            const lines = deferredRevertTKInput.split('\n');

            const newTranslatedLines: TranslatedLine[] = lines.map((line, lIdx) => {
                const matches: { start: number, end: number, replacements: string[], phrase: string }[] = [];
                const normLine = normalizeText(line);

                for (const item of translationDict) {
                    // Performance optimization: fast fail if phrase not in line
                    if (!normLine.includes(item.phrase)) continue;

                    item.regex.lastIndex = 0;
                    let match;
                    while ((match = item.regex.exec(normLine)) !== null) {
                        const start = match.index;
                        const end = start + item.phrase.length;
                        if (!matches.some(m => (start < m.end && end > m.start))) {
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

                matches.forEach((m) => {
                    if (m.start > lastIndex) {
                        const txt = line.substring(lastIndex, m.start);
                        segments.push({ type: 'text', text: txt, original: txt, key: `rt-${lIdx}-${lastIndex}`, isMultiple: false, options: [] });
                    }

                    const selectionKey = `rs-${lIdx}-${m.start}`;
                    const currentSelection = selections[selectionKey] || m.replacements[0];

                    segments.push({
                        type: 'phrase',
                        text: currentSelection,
                        original: m.phrase,
                        key: selectionKey,
                        isMultiple: m.replacements.length > 1,
                        options: m.replacements
                    });
                    lastIndex = m.end;
                });

                if (lastIndex < line.length) {
                    const txt = line.substring(lastIndex);
                    segments.push({ type: 'text', text: txt, original: txt, key: `rt-${lIdx}-${lastIndex}`, isMultiple: false, options: [] });
                }
                return { segments };
            });
            setRevertTKTranslatedLines(newTranslatedLines);
        }, 150);

        return () => clearTimeout(timer);
    }, [deferredRevertTKInput, translationDict, selections]);

    useEffect(() => {
        if (activeTab === 'translate' && data.length === 0) {
            loadData();
        }
    }, [activeTab]);


    const handleSaveEntry = async (entry: TranslateEntry) => {
        if (!entry.japanese && !entry.english && !entry.vietnamese) return;

        let newData = [...data];
        if (editingIndex !== null) {
            // Edit existing
            newData[editingIndex] = entry;
        } else {
            // Add new
            newData = [entry, ...newData];
        }

        setData(newData);
        setShowEditModal(false);
        setEditingEntry(null);
        setEditingIndex(null);

        // Save to file logic
        if (!translateFilePath) return;

        try {
            const excelPath = translateFilePath.toLowerCase().endsWith('.xlsx')
                ? translateFilePath
                : translateFilePath.replace(/\.json$/i, '.xlsx');
            const jsonPath = translateFilePath.toLowerCase().endsWith('.json')
                ? translateFilePath
                : translateFilePath.replace(/\.xlsx$/i, '.json');

            // Write JSON
            await writeTextFile(jsonPath, JSON.stringify(newData, null, 2));

            // Write Excel (re-using logic from loadData would be better but simple write here)
            const aoa = [
                ['Japanese', 'English', 'Vietnamese'], // Header
                ...newData.map(item => [item.japanese, item.english, item.vietnamese])
            ];
            const worksheet = XLSX.utils.aoa_to_sheet(aoa);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
            const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
            await writeBinaryFile(excelPath, new Uint8Array(excelBuffer));

        } catch (e) {
            console.error("Failed to save data", e);
            setError("Lỗi khi lưu dữ liệu: " + String(e));
        }
    };

    const handleDeleteEntry = async (idx: number) => {
        if (!confirm("Bạn có chắc muốn xóa từ này không?")) return;

        const newData = [...data];
        newData.splice(idx, 1);
        setData(newData);

        // Save to file logic
        if (!translateFilePath) return;

        try {
            const excelPath = translateFilePath.toLowerCase().endsWith('.xlsx')
                ? translateFilePath
                : translateFilePath.replace(/\.json$/i, '.xlsx');
            const jsonPath = translateFilePath.toLowerCase().endsWith('.json')
                ? translateFilePath
                : translateFilePath.replace(/\.xlsx$/i, '.json');

            // Write JSON
            await writeTextFile(jsonPath, JSON.stringify(newData, null, 2));

            // Write Excel
            const aoa = [
                ['Japanese', 'English', 'Vietnamese'],
                ...newData.map(item => [item.japanese, item.english, item.vietnamese])
            ];
            const worksheet = XLSX.utils.aoa_to_sheet(aoa);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
            const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
            await writeBinaryFile(excelPath, new Uint8Array(excelBuffer));

        } catch (e) {
            console.error("Failed to save data", e);
            setError("Lỗi khi xóa dữ liệu: " + String(e));
        }
    };


    return (
        <div className="flex flex-col h-[calc(100vh-140px)] gap-4 p-4 animate-in fade-in duration-300 overflow-hidden font-sans relative">
            {/* Edit Modal */}
            {showEditModal && (
                <div className="absolute inset-0 z-[2000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowEditModal(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="bg-indigo-600 px-6 py-4 flex justify-between items-center">
                            <h3 className="font-bold text-white text-lg">
                                {editingIndex !== null ? '✏️ Edit Entry' : '✨ New Entry'}
                            </h3>
                            <button onClick={() => setShowEditModal(false)} className="text-white/80 hover:text-white font-bold text-xl">×</button>
                        </div>
                        <div className="p-6 flex flex-col gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Japanese</label>
                                <textarea
                                    className="w-full border border-gray-300 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium min-h-[80px]"
                                    value={editingEntry?.japanese || ''}
                                    onChange={e => setEditingEntry(prev => ({ ...prev!, japanese: e.target.value }))}
                                    placeholder="Enter Japanese text..."
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">English</label>
                                <textarea
                                    className="w-full border border-gray-300 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono min-h-[60px]"
                                    value={editingEntry?.english || ''}
                                    onChange={e => setEditingEntry(prev => ({ ...prev!, english: e.target.value }))}
                                    placeholder="Enter English translation..."
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Vietnamese</label>
                                <textarea
                                    className="w-full border border-gray-300 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium min-h-[60px]"
                                    value={editingEntry?.vietnamese || ''}
                                    onChange={e => setEditingEntry(prev => ({ ...prev!, vietnamese: e.target.value }))}
                                    placeholder="Enter Vietnamese translation..."
                                />
                            </div>
                        </div>
                        <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t border-gray-100">
                            <button
                                onClick={() => setShowEditModal(false)}
                                className="px-4 py-2 text-gray-500 font-bold text-sm hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => editingEntry && handleSaveEntry(editingEntry)}
                                className="px-6 py-2 bg-indigo-600 text-white font-bold text-sm rounded-lg hover:bg-indigo-700 shadow-lg active:scale-95 transition-all"
                            >
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Quick Translate Context Menu - MOVED INSIDE */}
            {contextMenu && (
                <>
                    <div
                        className="fixed inset-0 z-[2999]"
                        onClick={() => setContextMenu(null)}
                    />
                    <div
                        className="fixed z-[3000] bg-white rounded-xl shadow-xl border border-gray-100 py-2 min-w-[220px] animate-in fade-in zoom-in-95 duration-200 flex flex-col overflow-hidden text-left"
                        style={{ top: contextMenu.y, left: contextMenu.x }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 select-none">
                            ACTIONS
                        </div>
                        <button
                            onClick={() => {
                                const fullText = translatedLines.map(l => l.segments.map(s => s.text).join('')).join('\n');
                                const existing = textCompareExpectedInput ? textCompareExpectedInput + '\n' : '';
                                setTextCompareExpectedInput(existing + fullText);
                                setActiveTab('text-compare');
                                setContextMenu(null);
                            }}
                            className="w-full text-left px-4 py-3 text-xs font-bold text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 flex items-center gap-3 transition-colors group"
                        >
                            <span className="text-lg group-hover:scale-110 transition-transform bg-indigo-100 rounded-lg p-1">👈</span>
                            <div className="flex flex-col">
                                <span>Copy to Expected</span>
                                <span className="text-[9px] text-gray-400 font-medium group-hover:text-indigo-400">Text Compare (Left Side)</span>
                            </div>
                        </button>
                        <div className="my-1 border-t border-gray-100 mx-4"></div>
                        <button
                            onClick={() => {
                                const fullText = translatedLines.map(l => l.segments.map(s => s.text).join('')).join('\n');
                                const existing = textCompareCurrentInput ? textCompareCurrentInput + '\n' : '';
                                setTextCompareCurrentInput(existing + fullText);
                                setActiveTab('text-compare');
                                setContextMenu(null);
                            }}
                            className="w-full text-left px-4 py-3 text-xs font-bold text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 flex items-center gap-3 transition-colors group"
                        >
                            <span className="text-lg group-hover:scale-110 transition-transform bg-teal-100 rounded-lg p-1">👉</span>
                            <div className="flex flex-col">
                                <span>Copy to Current</span>
                                <span className="text-[9px] text-gray-400 font-medium group-hover:text-indigo-400">Text Compare (Right Side)</span>
                            </div>
                        </button>
                    </div>
                </>
            )}

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
                        <div className="flex-1 flex items-center gap-4">
                            <div className="flex-1 relative group">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm opacity-50">🔍</span>
                                <input
                                    type="text"
                                    placeholder="Search Japanese, English or Vietnamese..."
                                    value={searchTerm}
                                    onChange={(e) => {
                                        setSearchTerm(e.target.value);
                                        setDictionaryLimit(200); // Reset limit on search
                                    }}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-10 pr-4 py-2.5 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-inner"
                                    autoFocus
                                />
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer group shrink-0">
                                <div className="relative flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={searchStrict}
                                        onChange={(e) => setSearchStrict(e.target.checked)}
                                        className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-gray-300 transition-all checked:border-indigo-600 checked:bg-indigo-600"
                                    />
                                    <span className="absolute text-white opacity-0 peer-checked:opacity-100 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none text-[8px]">✓</span>
                                </div>
                                <span className="text-[10px] font-black text-gray-400 group-hover:text-indigo-600 transition-colors uppercase tracking-widest">Strict</span>
                            </label>
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
                                                <span className="text-xs font-bold text-gray-700 group-hover:text-indigo-600 transition-colors">Clean .append("...")</span>
                                            </label>

                                            <label className="flex items-center gap-3 cursor-pointer group">
                                                <div className="relative flex items-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={translateTruncateDuplicate}
                                                        onChange={(e) => setTranslateTruncateDuplicate(e.target.checked)}
                                                        className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-gray-300 transition-all checked:border-indigo-600 checked:bg-indigo-600"
                                                    />
                                                    <span className="absolute text-white opacity-0 peer-checked:opacity-100 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none text-[10px]">✓</span>
                                                </div>
                                                <span className="text-xs font-bold text-gray-700 group-hover:text-indigo-600 transition-colors">Truncate Duplicate</span>
                                            </label>

                                            <div className="border-t border-gray-200 my-1"></div>

                                            <div className="flex flex-col gap-1">
                                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Remove Characters</label>
                                                <input
                                                    type="text"
                                                    value={translateDeleteChars}
                                                    onChange={(e) => setTranslateDeleteChars(e.target.value)}
                                                    placeholder="e.g. ,;()"
                                                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                                                />
                                            </div>

                                            <label className="flex items-center gap-3 cursor-pointer group">
                                                <div className="relative flex items-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={searchStrict}
                                                        onChange={(e) => setSearchStrict(e.target.checked)}
                                                        className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-gray-300 transition-all checked:border-indigo-600 checked:bg-indigo-600"
                                                    />
                                                    <span className="absolute text-white opacity-0 peer-checked:opacity-100 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none text-[10px]">✓</span>
                                                </div>
                                                <span className="text-xs font-bold text-gray-700 group-hover:text-indigo-600 transition-colors">Strict Search (Tìm chính xác từ)</span>
                                            </label>

                                            <div className="mt-2 pt-2 border-t border-gray-100">
                                                <p className="text-[9px] text-gray-400 italic">
                                                    Strict: Dùng cho cả tìm kiếm dictionary (khớp 100%) và Quick Translate (không thay thế từ con).
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : subTab === 'revertTK' ? (
                        <div className="flex-1 flex items-center justify-end gap-3">
                            {/* Actions like REVERT / FORMAT go here, lang toggle is global */}
                            <div className="relative flex items-center gap-1">
                                <button
                                    onClick={handleRevertTK}
                                    disabled={!revertTKInput.trim()}
                                    className="px-6 py-2 bg-amber-600 text-white text-xs font-black rounded-xl hover:bg-amber-700 shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all uppercase tracking-widest"
                                    title="Revert thiết kế từ code, format theo rule SQL"
                                >
                                    🔄 REVERT / FORMAT
                                </button>
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
                                <div className="divide-y divide-gray-100">
                                    <table className="w-full border-collapse table-fixed">
                                        <tbody>
                                            {filteredData.slice(0, dictionaryLimit).map((item, idx) => (
                                                <DictionaryRow
                                                    key={idx}
                                                    item={item}
                                                    idx={idx}
                                                    copyFeedback={copyFeedback}
                                                    onCopy={handleCopy}
                                                    onEdit={(item, idx) => {
                                                        setEditingEntry(item);
                                                        setEditingIndex(idx);
                                                        setShowEditModal(true);
                                                    }}
                                                    onDelete={handleDeleteEntry}
                                                />
                                            ))}
                                        </tbody>
                                    </table>
                                    {filteredData.length > dictionaryLimit && (
                                        <div className="p-6 flex flex-col items-center justify-center bg-gray-50/50">
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">
                                                Showing {dictionaryLimit} of {filteredData.length} entries
                                            </p>
                                            <button
                                                onClick={() => setDictionaryLimit(prev => prev + 500)}
                                                className="px-8 py-3 bg-white border border-indigo-200 text-indigo-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-50 hover:shadow-md transition-all active:scale-95 shadow-sm"
                                            >
                                                📂 LOAD MORE ENTRIES (+500)
                                            </button>
                                        </div>
                                    )}

                                    {/* Floating Add Button */}
                                    <button
                                        onClick={() => {
                                            setEditingEntry({ japanese: '', english: '', vietnamese: '' });
                                            setEditingIndex(null);
                                            setShowEditModal(true);
                                        }}
                                        className="absolute bottom-6 right-6 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-2xl flex items-center justify-center hover:bg-indigo-700 hover:scale-105 active:scale-95 transition-all z-50 group"
                                        title="Add New Entry"
                                    >
                                        <span className="text-3xl font-light leading-none pb-1">+</span>
                                        <span className="absolute right-full mr-2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none font-bold">Add Entry</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                ) : subTab === 'revertTK' ? (
                    <div className="flex-1 flex flex-row overflow-hidden bg-white divide-x divide-gray-200">
                        {/* Left: Input Section */}
                        <div className="flex-[4] flex flex-col min-h-0">
                            <div className="bg-amber-50/50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-amber-600/60 border-b border-amber-100/50 flex items-center justify-between shrink-0 h-14 select-none">
                                <div className="flex items-center gap-6">
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-[8px] text-amber-600/50">INPUT TYPE</span>
                                        <div className="flex bg-white p-0.5 rounded-lg border border-amber-200">
                                            <button
                                                onClick={() => setRevertTKMode('CodetoTK')}
                                                className={`px-3 py-1 rounded-md text-[9px] font-black transition-all ${revertTKMode === 'CodetoTK' ? 'bg-amber-600 text-white shadow-sm' : 'text-gray-400 hover:text-amber-600'}`}
                                            >
                                                CODE
                                            </button>
                                            <button
                                                onClick={() => setRevertTKMode('TKtoCode')}
                                                className={`px-3 py-1 rounded-md text-[9px] font-black transition-all ${revertTKMode === 'TKtoCode' ? 'bg-amber-600 text-white shadow-sm' : 'text-gray-400 hover:text-amber-600'}`}
                                            >
                                                TK/SPEC
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => { setRevertTKInput(''); setRevertTKResult(''); }}
                                        className="text-red-400 hover:text-red-600 text-[9px] font-black border border-red-100 px-3 py-2 rounded-xl hover:bg-red-50 transition-colors"
                                    >
                                        CLEAR
                                    </button>
                                    <button
                                        onClick={handleRevertTK}
                                        className="px-10 py-2 bg-amber-600 text-white text-[10px] font-black rounded-xl hover:bg-amber-700 transition-all shadow-lg active:scale-95 flex items-center gap-2"
                                    >
                                        <span className="text-sm">🔄</span>
                                        REVERT
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-hidden bg-white relative flex">
                                {/* Left: Input with line numbers */}
                                <div
                                    className="w-12 bg-gray-50 border-r border-gray-100 flex flex-col font-mono text-sm text-gray-400 pt-6 pb-20 select-none overflow-y-auto overflow-x-hidden shrink-0 custom-scrollbar scrollbar-hide"
                                    style={{
                                        lineHeight: `${lineSpacing}`,
                                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                                    }}
                                >
                                    {(revertTKInput.split('\n').length > 0 ? revertTKInput.split('\n') : ['']).map((_, i) => (
                                        <div key={i} className="text-right pr-3" style={{ lineHeight: `${lineSpacing}` }}>{i + 1}</div>
                                    ))}
                                </div>
                                <div className="flex-1 relative overflow-hidden">
                                    <div
                                        ref={highlighterRef}
                                        className="absolute inset-0 p-6 font-mono text-sm pointer-events-none text-transparent whitespace-pre overflow-auto box-border z-10"
                                        style={{
                                            lineHeight: `${lineSpacing}`,
                                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                                        }}
                                    >
                                        <HighlighterOverlay
                                            translatedLines={revertTKTranslatedLines}
                                            hoveredKey={hoveredKey}
                                            lineSpacing={lineSpacing}
                                        />
                                    </div>
                                    <textarea
                                        ref={revertTKInputRef}
                                        wrap="off"
                                        onScroll={handleRevertTKInputScroll}
                                        className="absolute inset-0 w-full h-full p-6 font-mono text-sm outline-none resize-none bg-transparent focus:bg-amber-50/5 transition-colors overflow-auto z-20 border-none box-border text-gray-800 caret-gray-800"
                                        style={{
                                            lineHeight: `${lineSpacing}`,
                                            whiteSpace: 'pre',
                                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                                        }}
                                        placeholder="Dán code (Java/C# sql.append, hoặc đoạn thiết kế SQL thô)..."
                                        value={revertTKInput}
                                        onChange={(e) => setRevertTKInput(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex-[6] flex flex-col min-h-0 bg-white">
                            <div className="bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-amber-700 border-b border-gray-100 flex justify-between items-center h-14 shrink-0 select-none">
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2">
                                        <span className="w-5 h-5 flex items-center justify-center bg-amber-100 rounded text-[9px]">2</span>
                                        <span>SQL DESIGN PREVIEW</span>
                                    </div>
                                    <div className="flex bg-gray-50 p-0.5 rounded-lg border border-gray-200">
                                        <button
                                            onClick={() => setRevertTKResultFormat('text')}
                                            className={`px-3 py-1 rounded-md text-[9px] font-black transition-all ${revertTKResultFormat === 'text' ? 'bg-amber-600 text-white shadow-sm' : 'text-gray-400 hover:text-amber-600'}`}
                                        >
                                            TEXT
                                        </button>
                                        <button
                                            onClick={() => setRevertTKResultFormat('table')}
                                            className={`px-3 py-1 rounded-md text-[9px] font-black transition-all ${revertTKResultFormat === 'table' ? 'bg-amber-600 text-white shadow-sm' : 'text-gray-400 hover:text-amber-600'}`}
                                        >
                                            TABLE
                                        </button>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 mr-2">
                                    <button
                                        onClick={() => setShowRevertConfig(true)}
                                        className="px-3 py-1.5 bg-indigo-600 text-white text-[10px] font-black rounded-lg hover:bg-indigo-700 transition-all shadow active:scale-95"
                                    >
                                        ⚙️ CONFIG
                                    </button>
                                    <button
                                        onClick={() => revertTKResult && navigator.clipboard.writeText(revertTKResult)}
                                        disabled={!revertTKResult}
                                        className="px-3 py-1.5 rounded-lg text-[10px] font-black bg-white text-amber-600 border border-amber-100 hover:bg-amber-50 disabled:opacity-50 hover:shadow-sm active:scale-95 transition-all flex items-center gap-1.5"
                                    >
                                        <span>📋</span>
                                        COPY
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-hidden flex flex-col bg-white">
                                {revertTKResult ? (
                                    revertTKResultFormat === 'table' ? (
                                        <RevertTKGrid
                                            content={revertTKResult}
                                            defaultWidth={defaultColWidth}
                                            customWidths={parsedCustomWidths}
                                            translationDict={translationDict}
                                            selections={selections}
                                            onSelectionChange={(key, val) => setSelections(prev => ({ ...prev, [key]: val }))}
                                            hoveredKey={hoveredKey}
                                            onHover={setHoveredKey}
                                            copiedKey={segmentCopyFeedback}
                                            onCopySegment={(key) => {
                                                setSegmentCopyFeedback(key);
                                                setTimeout(() => setSegmentCopyFeedback(null), 1000);
                                            }}
                                        />
                                    ) : (
                                        <div className="flex-1 overflow-hidden relative flex">
                                            <div
                                                className="w-12 bg-gray-50 border-r border-gray-100 flex flex-col font-mono text-sm text-gray-400 pt-6 pb-20 select-none overflow-y-auto overflow-x-hidden shrink-0 custom-scrollbar scrollbar-hide"
                                                style={{
                                                    lineHeight: `${lineSpacing}`,
                                                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                                                }}
                                            >
                                                {(revertTKResult.split('\n').length > 0 ? revertTKResult.split('\n') : ['']).map((_, i) => (
                                                    <div key={i} className="text-right pr-3" style={{ lineHeight: `${lineSpacing}` }}>{i + 1}</div>
                                                ))}
                                            </div>
                                            <textarea
                                                readOnly
                                                wrap="off"
                                                className="flex-1 p-6 font-mono text-sm outline-none resize-none bg-white text-gray-800 caret-gray-800 overflow-auto"
                                                style={{
                                                    lineHeight: `${lineSpacing}`,
                                                    whiteSpace: 'pre',
                                                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                                                }}
                                                value={revertTKResult}
                                            />
                                        </div>
                                    )
                                ) : (
                                    <div className="flex-1 flex items-center justify-center p-4 text-center bg-amber-50/5 text-amber-900/40 italic text-sm">
                                        Kết quả revert/format sẽ hiện ở đây dạng bảng Excel. Bấm REVERT / FORMAT bên trên.
                                    </div>
                                )}
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
                                <div className="flex-1 relative min-h-0 bg-white group/input flex">
                                    {/* Line Numbers Source */}
                                    <div
                                        className="w-12 bg-gray-50 border-r border-gray-100 flex flex-col font-mono text-sm text-gray-400 pt-6 pb-20 select-none overflow-y-auto overflow-x-hidden shrink-0 custom-scrollbar scrollbar-hide"
                                        style={{
                                            lineHeight: `${lineSpacing}`,
                                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                                        }}
                                    >
                                        {(bulkInput.split('\n').length > 0 ? bulkInput.split('\n') : ['']).map((_, i) => (
                                            <div key={i} className="text-right pr-3" style={{ lineHeight: `${lineSpacing}` }}>{i + 1}</div>
                                        ))}
                                    </div>
                                    <div className="flex-1 relative overflow-hidden">
                                        <div
                                            ref={highlighterRef}
                                            className="absolute inset-0 p-6 font-mono text-sm pointer-events-none text-transparent whitespace-pre overflow-auto box-border z-10"
                                            style={{
                                                lineHeight: `${lineSpacing}`,
                                                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                                            }}
                                        >
                                            <HighlighterOverlay
                                                translatedLines={translatedLines}
                                                hoveredKey={hoveredKey}
                                                lineSpacing={lineSpacing}
                                            />
                                        </div>
                                        <textarea
                                            ref={inputRef}
                                            wrap="off"
                                            onScroll={(e) => {
                                                handleInputScroll();
                                                // Sync line number gutter if scrollable
                                                const gutter = e.currentTarget.parentElement?.previousElementSibling;
                                                if (gutter) gutter.scrollTop = e.currentTarget.scrollTop;
                                            }}
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
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => {
                                                const fullText = translatedLines.map(l => l.segments.map(s => s.text).join('')).join('\n');
                                                if (fullText) {
                                                    const existing = textCompareExpectedInput ? textCompareExpectedInput + '\n' : '';
                                                    setTextCompareExpectedInput(existing + fullText);
                                                }
                                                setActiveTab('text-compare');
                                            }}
                                            className="px-3 py-1.5 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-indigo-100 shadow-sm transition-all active:scale-95 flex items-center gap-1"
                                            title="Copy result to Text Compare (Expected)"
                                        >
                                            <span>📝 To Text Compare</span>
                                        </button>
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
                                </div>
                                <div className="flex-1 flex overflow-hidden">
                                    {/* Line Numbers Result */}
                                    <div
                                        className="w-12 bg-indigo-50/50 border-r border-indigo-100 flex flex-col font-mono text-sm text-indigo-400 pt-6 pb-20 select-none overflow-y-auto overflow-x-hidden shrink-0 custom-scrollbar scrollbar-hide"
                                        style={{
                                            lineHeight: `${lineSpacing}`,
                                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                                        }}
                                    >
                                        {translatedLines.length > 0 ? translatedLines.map((_, i) => (
                                            <div key={i} className="text-right pr-3" style={{ lineHeight: `${lineSpacing}` }}>{i + 1}</div>
                                        )) : (
                                            <div className="text-right pr-3" style={{ lineHeight: `${lineSpacing}` }}>1</div>
                                        )}
                                    </div>

                                    <div
                                        ref={outputRef}
                                        onContextMenu={(e) => {
                                            e.preventDefault();
                                            if (translatedLines.length === 0) return;
                                            const x = e.clientX + 220 > window.innerWidth ? e.clientX - 220 : e.clientX;
                                            setContextMenu({ x, y: e.clientY });
                                        }}
                                        onScroll={(e) => {
                                            handleOutputScroll();
                                            const gutter = e.currentTarget.previousElementSibling;
                                            if (gutter) gutter.scrollTop = e.currentTarget.scrollTop;
                                        }}
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
                                                        className={`transition-all duration-150 relative group/line hover:!z-[100] whitespace-nowrap w-full hover:bg-indigo-100/60 hover:border-l-4 hover:border-l-indigo-500 hover:pl-1 ${hoveredKey?.startsWith(`p-${lIdx}-`) ? 'bg-indigo-500/10 border-l-4 border-l-indigo-600 pl-1' : ''}`}
                                                        style={{
                                                            height: `${lineSpacing}em`,
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
                                                                    onShowTooltip={() => { }}
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
                    </div>
                )}
            </div>

            {
                showRevertConfig && (
                    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                        <div className="bg-white rounded-3xl shadow-2xl border border-gray-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in duration-300">
                            {/* Header */}
                            <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center shrink-0">
                                <div>
                                    <h3 className="text-lg font-black text-gray-800 uppercase tracking-tight">SQL Specification Layout Configuration</h3>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Customize conversion behavior and layout</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={async () => {
                                            try {
                                                const path = await invoke<string>('get_setting_path');
                                                await invoke('open_file', { path });
                                            } catch (e) {
                                                console.error('Failed to open settings file', e);
                                            }
                                        }}
                                        className="px-3 py-1.5 bg-gray-100 text-gray-500 text-[10px] font-black rounded-lg hover:bg-indigo-50 hover:text-indigo-600 transition-all flex items-center gap-1.5"
                                        title="Open setting.json"
                                    >
                                        📂 OPEN JSON
                                    </button>
                                    <button
                                        onClick={() => setShowRevertConfig(false)}
                                        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>

                            {/* Tabs Navigation */}
                            <div className="px-6 bg-white border-b border-gray-100 flex gap-1 shrink-0">
                                {[
                                    { id: 'general', label: 'GENERAL' },
                                    { id: 'codeToTk', label: 'CODE → TK' },
                                    { id: 'tkToCode', label: 'TK → CODE' }
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setRevertConfigTab(tab.id as any)}
                                        className={`px-6 py-3 text-[10px] font-black uppercase tracking-widest transition-all relative
                                        ${revertConfigTab === tab.id
                                                ? 'text-indigo-600'
                                                : 'text-gray-400 hover:text-gray-600'}
                                    `}
                                    >
                                        {tab.label}
                                        {revertConfigTab === tab.id && (
                                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-t-full" />
                                        )}
                                    </button>
                                ))}
                            </div>

                            {/* Modal Body */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar bg-gray-50/30">
                                {revertConfigTab === 'general' && (
                                    <div className="p-8 flex flex-col gap-6 animate-in slide-in-from-bottom-2 duration-300">
                                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col gap-3">
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">📐</div>
                                                <label className="text-xs font-black text-gray-700 uppercase tracking-widest">Column Width Configuration (Excel Style)</label>
                                            </div>
                                            <input
                                                type="text"
                                                placeholder="e.g. A:150, B:250, C:100"
                                                value={revertTKColConfig}
                                                onChange={(e) => setRevertTKColConfig(e.target.value)}
                                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-gray-300"
                                            />
                                            <div className="p-3 bg-indigo-50/50 rounded-xl">
                                                <p className="text-[10px] text-indigo-600/80 font-medium italic leading-relaxed">
                                                    Use format <b>[Column]:[Width]</b>, separated by commas. Example: <b>A:200, B:300</b>.<br />
                                                    This applies to the Preview grid to match your Excel template.
                                                </p>
                                            </div>
                                        </div>

                                        {/* Delete Characters Config */}
                                        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col gap-3">
                                            <div className="flex items-center gap-2 mb-1">
                                                <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center text-red-600 shrink-0">🗑️</div>
                                                <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest">Delete Characters (Input cleaner)</label>
                                            </div>
                                            <input
                                                type="text"
                                                placeholder="e.g. ', ., /"
                                                value={revertTKDeleteChars}
                                                onChange={(e) => setRevertTKDeleteChars(e.target.value)}
                                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-red-500 transition-all font-mono"
                                            />
                                            <p className="text-[9px] text-gray-400 font-bold uppercase ml-1">Ký tự sẽ bị xóa trước khi xử lý (ngăn cách bằng dấu phẩy)</p>
                                        </div>

                                        {/* Column Split Logic is now a General Setting */}
                                        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col gap-4">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">✂️</div>
                                                    <div className="flex flex-col">
                                                        <div className="text-xs font-black text-gray-700 uppercase tracking-widest">Keyword Detected</div>
                                                        <div className="flex items-center gap-4 mt-1">
                                                            <div className="flex items-center gap-1.5 cursor-pointer group" onClick={() => setColumnSplitApplyToText(!columnSplitApplyToText)}>
                                                                <input type="checkbox" checked={columnSplitApplyToText} onChange={() => { }} className="w-3 h-3 accent-amber-600 rounded pointer-events-none" />
                                                                <span className="text-[9px] font-black text-gray-400 uppercase group-hover:text-amber-600 transition-colors">Apply to Text</span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 cursor-pointer group" onClick={() => setColumnSplitApplyToTable(!columnSplitApplyToTable)}>
                                                                <input type="checkbox" checked={columnSplitApplyToTable} onChange={() => { }} className="w-3 h-3 accent-amber-600 rounded pointer-events-none" />
                                                                <span className="text-[9px] font-black text-gray-400 uppercase group-hover:text-amber-600 transition-colors">Apply to Table</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <label className="relative inline-flex items-center cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        className="sr-only peer"
                                                        checked={columnSplitEnabled}
                                                        onChange={(e) => setColumnSplitEnabled(e.target.checked)}
                                                    />
                                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                                                </label>
                                            </div>

                                            <div className="relative">
                                                {!columnSplitEnabled && (
                                                    <div className="absolute -inset-2 bg-white/60 backdrop-blur-[0.5px] z-[60] rounded-2xl cursor-not-allowed flex items-center justify-center">
                                                        <div className="bg-white/90 px-3 py-1 rounded-full border border-amber-100 shadow-sm text-[8px] font-black text-amber-600 uppercase tracking-widest animate-in zoom-in duration-300">
                                                            DISABLED
                                                        </div>
                                                    </div>
                                                )}
                                                <div className={`flex flex-col gap-4 transition-all duration-300 ${columnSplitEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                                                    <div className="flex flex-col gap-1.5">
                                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Keywords</span>
                                                        <input
                                                            type="text"
                                                            value={columnSplitKeywords}
                                                            onChange={(e) => setColumnSplitKeywords(e.target.value)}
                                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-amber-500 font-mono transition-all"
                                                            placeholder="e.g. AS, XX , YY, ZZ,..."
                                                        />
                                                    </div>

                                                    <div className="px-4 py-2.5 bg-amber-50/50 rounded-xl border border-amber-100/50 flex gap-2 items-center">
                                                        <span className="text-sm">💡</span>
                                                        <p className="text-[9px] text-amber-800 font-bold uppercase tracking-tight">
                                                            Nó sẽ tách các từ khóa trong chuỗi, các keyword sẽ phân chia với nhau bằng dấu phẩy ","
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {revertConfigTab === 'codeToTk' && (
                                    <div className="p-8 flex flex-col gap-6 animate-in slide-in-from-bottom-2 duration-300">
                                        <div className="bg-white p-8 rounded-3xl border border-dashed border-gray-200 flex flex-col items-center justify-center text-center">
                                            <div className="text-4xl mb-4">⚙️</div>
                                            <h4 className="text-sm font-black text-gray-800 uppercase tracking-widest mb-1">CODE TO TK CONFIGURATION</h4>
                                            <p className="text-[10px] text-gray-400 font-bold max-w-xs leading-relaxed">
                                                Rules for reverting code/SQL into Technical Specifications.
                                                Specific logic settings will be added here soon.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {revertConfigTab === 'tkToCode' && (
                                    <div className="p-8 flex flex-col gap-6 animate-in slide-in-from-bottom-2 duration-300">

                                        {/* Moved Layout config here temporarily as it's part of how we handle TK structures */}
                                        <div className="flex flex-col gap-4">
                                            <div className="flex justify-between items-center px-2">
                                                <div className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Section Mappings (Spec structure)</div>
                                            </div>
                                            {/* New Section Input */}
                                            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex gap-4 items-end">
                                                <div className="flex-1">
                                                    <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Label for new section</div>
                                                    <input
                                                        type="text"
                                                        placeholder="e.g. ■ Ghi chú"
                                                        value={newSectionLabel}
                                                        onChange={(e) => setNewSectionLabel(e.target.value)}
                                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                                    />
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        if (!newSectionLabel.trim()) return;
                                                        const id = newSectionLabel.trim().toLowerCase().replace(/\s+/g, '-');
                                                        const currentOffsets = revertTKMapping[0]?.offsets || [1, 1];
                                                        setRevertTKMapping([...revertTKMapping, {
                                                            id,
                                                            label: newSectionLabel.trim(),
                                                            offsets: [...currentOffsets],
                                                            type: 'text'
                                                        }]);
                                                        setNewSectionLabel('');
                                                    }}
                                                    className="px-6 py-3 bg-indigo-600 text-white text-[10px] font-black rounded-xl hover:bg-indigo-700 shadow-md transition-all active:scale-95 uppercase tracking-widest"
                                                >
                                                    Add Section
                                                </button>
                                            </div>

                                            {revertTKMapping.map((cfg, idx) => (
                                                <div key={cfg.id} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-6 group hover:border-indigo-200 transition-all">
                                                    <div className="w-48 shrink-0">
                                                        <div className="text-[9px] font-black text-indigo-600 uppercase tracking-widest mb-1">Section Title</div>
                                                        <div className="text-xs font-black text-gray-800">{cfg.label}</div>
                                                    </div>

                                                    <div className="w-20 shrink-0 flex flex-col items-center">
                                                        <div className="text-[9px] font-black text-gray-400 uppercase mb-1">Base Col</div>
                                                        <div className="w-full py-2 bg-gray-100 border border-gray-200 rounded-lg text-center text-xs font-black text-gray-400">A</div>
                                                    </div>

                                                    <div className="flex-1 flex flex-col gap-2">
                                                        <div className="flex items-center gap-4">
                                                            <div className="flex items-center gap-2">
                                                                {cfg.offsets.map((off, oIdx) => (
                                                                    <div key={oIdx} className="flex items-center bg-gray-50 border border-gray-200 rounded-xl px-2 py-1.5 gap-2 shadow-inner group/off">
                                                                        <div className="text-[8px] font-black text-gray-400 uppercase tracking-tighter">
                                                                            {oIdx === 0 ? "Offset" : `Col ${oIdx}`}
                                                                        </div>
                                                                        <input
                                                                            type="number"
                                                                            value={off}
                                                                            onChange={(e) => {
                                                                                const val = parseInt(e.target.value) || 1;
                                                                                const newMapping = [...revertTKMapping];
                                                                                newMapping[idx].offsets[oIdx] = val;
                                                                                setRevertTKMapping(newMapping);
                                                                            }}
                                                                            className="w-10 bg-transparent text-xs font-black text-indigo-600 text-center outline-none focus:text-indigo-800"
                                                                        />
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            <div className="flex items-center gap-1.5 border-l border-gray-100 pl-4 ml-2">
                                                                <button
                                                                    onClick={() => {
                                                                        const newMapping = revertTKMapping.map(item => ({
                                                                            ...item,
                                                                            offsets: [...item.offsets, 1]
                                                                        }));
                                                                        setRevertTKMapping(newMapping);
                                                                    }}
                                                                    className="w-7 h-7 flex items-center justify-center bg-indigo-50 text-indigo-600 rounded-full hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                                                                >
                                                                    <span className="text-lg font-light">+</span>
                                                                </button>
                                                                {cfg.offsets.length > 1 && (
                                                                    <button
                                                                        onClick={() => {
                                                                            const newMapping = revertTKMapping.map(item => ({
                                                                                ...item,
                                                                                offsets: item.offsets.slice(0, -1)
                                                                            }));
                                                                            setRevertTKMapping(newMapping);
                                                                        }}
                                                                        className="w-7 h-7 flex items-center justify-center bg-red-50 text-red-400 rounded-full hover:bg-red-500 hover:text-white transition-all shadow-sm"
                                                                    >
                                                                        <span className="text-lg font-light">×</span>
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end items-center shrink-0">
                                <button
                                    onClick={async (e) => {
                                        const btn = e.currentTarget;
                                        const originalText = btn.innerText;
                                        try {
                                            btn.innerText = 'SAVING...';
                                            await invoke('save_db_settings', {
                                                settings: {
                                                    connections,
                                                    translate_file_path: translateFilePath,
                                                    column_split_enabled: columnSplitEnabled,
                                                    column_split_keywords: columnSplitKeywords,
                                                    revert_tk_col_config: revertTKColConfig,
                                                    column_split_apply_to_text: columnSplitApplyToText,
                                                    column_split_apply_to_table: columnSplitApplyToTable,
                                                    revert_tk_delete_chars: revertTKDeleteChars,
                                                    revert_tk_mapping: revertTKMapping,
                                                    excel_header_color: excelHeaderColor,
                                                    run_shortcut: runShortcut
                                                }
                                            });
                                            btn.innerText = '✅ SAVED';
                                            btn.classList.add('bg-green-600');
                                            setTimeout(() => {
                                                setShowRevertConfig(false);
                                            }, 500);
                                        } catch (e) {
                                            console.error('Failed to save settings', e);
                                            btn.innerText = '❌ ERROR';
                                            setTimeout(() => {
                                                btn.innerText = originalText;
                                            }, 2000);
                                        }
                                    }}
                                    className="px-10 py-3 bg-indigo-600 text-white text-[10px] font-black rounded-xl hover:bg-indigo-700 transition-all shadow-lg active:scale-95 uppercase tracking-widest"
                                >
                                    APPLY & SAVE
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

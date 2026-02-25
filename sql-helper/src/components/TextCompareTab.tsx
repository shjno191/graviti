import React, { useState, useMemo, useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import { compareOrdered, compareUnordered } from '../utils/diffLogic';
import { useAppStore } from '../store/useAppStore';
import { HighlightText } from '../utils/uiHelpers';

const InputWithLineNumbers = ({
    value,
    onChange,
    placeholder,
    label,
    globalTerm
}: {
    value: string,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void,
    placeholder: string,
    label: string,
    globalTerm?: string
}) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const lineNumbersRef = useRef<HTMLDivElement>(null);
    const highlightRef = useRef<HTMLDivElement>(null);

    const handleScroll = () => {
        if (textareaRef.current) {
            const { scrollTop, scrollLeft } = textareaRef.current;
            if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = scrollTop;
            if (highlightRef.current) {
                highlightRef.current.scrollTop = scrollTop;
                highlightRef.current.scrollLeft = scrollLeft;
            }
        }
    };

    const lineCount = useMemo(() => value.split(/\r?\n/).length, [value]);

    return (
        <div className="flex-1 flex flex-col min-h-0">
            <div className="flex justify-between items-center mb-2">
                <label className="font-bold text-gray-700 cursor-help" data-tooltip="Dán nội dung gốc hoặc nội dung cần so sánh vào đây.">
                    {label}
                </label>
                <span className="text-gray-400 text-xs font-mono">{lineCount} lines</span>
            </div>

            <div className="flex-1 flex border border-gray-300 rounded overflow-hidden focus-within:ring-2 focus-within:ring-primary focus-within:border-primary min-h-0 bg-white shadow-sm relative">
                <div
                    ref={lineNumbersRef}
                    className="bg-gray-50 text-gray-400 font-mono text-xs py-3 pr-2 text-right select-none border-r border-gray-200 overflow-hidden shrink-0 z-10"
                    style={{ width: '3rem' }}
                >
                    {Array.from({ length: lineCount }, (_, i) => (
                        <div key={i} className="h-6 leading-6">{i + 1}</div>
                    ))}
                </div>

                <div className="flex-1 relative min-h-0 min-w-0">
                    {/* Highlighter Overlay */}
                    <div
                        ref={highlightRef}
                        className="absolute inset-0 p-3 pointer-events-none font-mono text-xs whitespace-pre overflow-hidden leading-6 text-transparent z-0 break-all"
                        aria-hidden="true"
                    >
                        <HighlightText text={value} globalTerm={globalTerm} />
                    </div>

                    <textarea
                        ref={textareaRef}
                        onScroll={handleScroll}
                        className="absolute inset-0 w-full h-full p-3 resize-none outline-none font-mono text-xs whitespace-pre overflow-auto border-none leading-6 bg-transparent text-gray-800 z-[1] break-all"
                        value={value}
                        onChange={onChange}
                        placeholder={placeholder}
                        spellCheck={false}
                    />
                </div>
            </div>
        </div>
    );
};

export function TextCompareTab() {
    // Global settings
    const textCompareDeleteChars = useAppStore(state => state.textCompareDeleteChars);
    const textCompareRemoveAppend = useAppStore(state => state.textCompareRemoveAppend);
    const textCompareTruncateDuplicate = useAppStore(state => state.textCompareTruncateDuplicate);
    const textCompareRemoveEmptyLines = useAppStore(state => state.textCompareRemoveEmptyLines);
    const uiHighlightCopied = useAppStore(state => state.uiHighlightCopied);
    const globalSearchTerm = useAppStore(state => state.globalSearchTerm);

    // Shared text compare settings
    const isOrdered = useAppStore(state => state.textCompareOrdered);
    const ignoreCase = useAppStore(state => state.textCompareIgnoreCase);
    const trimWhitespace = useAppStore(state => state.textCompareTrimWhitespace);
    const autoCompare = useAppStore(state => state.textCompareAutoCompare);
    const textCompareSort = useAppStore(state => state.textCompareSort);

    const expectedInput = useAppStore(state => state.textCompareExpectedInput);
    const setExpectedInput = useAppStore(state => state.setTextCompareExpectedInput);
    const currentInput = useAppStore(state => state.textCompareCurrentInput);
    const setCurrentInput = useAppStore(state => state.setTextCompareCurrentInput);
    const setActiveTab = useAppStore(state => state.setActiveTab);
    const setTranslateSubTab = useAppStore(state => state.setTranslateSubTab);

    const deferredGlobalSearchTerm = React.useDeferredValue(globalSearchTerm);

    const [diffInputs, setDiffInputs] = useState({ expected: '', current: '' });
    const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

    // Processing Logic
    const preprocessText = (text: string) => {
        let processed = text;

        if (textCompareRemoveAppend) {
            const lines = processed.split(/\r?\n/);
            processed = lines.map(line => {
                const match = line.match(/\.append\s*\((.*)\)/);
                if (match && match[1]) {
                    let content = match[1].trim();
                    if ((content.startsWith('"') && content.endsWith('"')) || (content.startsWith("'") && content.endsWith("'"))) {
                        content = content.slice(1, -1);
                    }
                    return content;
                }
                return line;
            }).join('\n');
        }

        if (textCompareDeleteChars) {
            const escapeIdx = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const charsPattern = '[' + escapeIdx(textCompareDeleteChars) + ']';
            const regex = new RegExp(charsPattern, 'g');
            processed = processed.replace(regex, '');
        }

        if (textCompareTruncateDuplicate) {
            const lines = processed.split(/\r?\n/);
            const uniqueLines = Array.from(new Set(lines));
            processed = uniqueLines.join('\n');
        }

        if (textCompareRemoveEmptyLines) {
            const lines = processed.split(/\r?\n/);
            processed = lines.filter(line => line.trim().length > 0).join('\n');
        }

        if (trimWhitespace) {
            const lines = processed.split(/\r?\n/);
            processed = lines.map(line => line.trim()).join('\n');
        }

        if (textCompareSort) {
            const lines = processed.split(/\r?\n/);
            const processedLines = lines
                .map(line => line.trim())
                .filter(line => line.length > 0)
                .sort((a, b) => a.localeCompare(b));
            processed = processedLines.join('\n');
        }

        return processed;
    };

    useEffect(() => {
        if (expectedInput || currentInput) {
            setDiffInputs({
                expected: preprocessText(expectedInput),
                current: preprocessText(currentInput)
            });
        }
    }, []);

    useEffect(() => {
        if (autoCompare) {
            const timer = setTimeout(() => {
                const processedExpected = preprocessText(expectedInput);
                const processedCurrent = preprocessText(currentInput);
                setDiffInputs({ expected: processedExpected, current: processedCurrent });
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [expectedInput, currentInput, autoCompare, textCompareDeleteChars, textCompareRemoveAppend, textCompareTruncateDuplicate, textCompareRemoveEmptyLines, textCompareSort, trimWhitespace]);

    const handleCompare = () => {
        const processedExpected = preprocessText(expectedInput);
        const processedCurrent = preprocessText(currentInput);
        setDiffInputs({ expected: processedExpected, current: processedCurrent });
        setExpectedInput(processedExpected);
        setCurrentInput(processedCurrent);
    };

    const handleSwap = () => {
        const temp = expectedInput;
        setExpectedInput(currentInput);
        setCurrentInput(temp);
    };

    const handleClear = () => {
        setExpectedInput('');
        setCurrentInput('');
        setDiffInputs({ expected: '', current: '' });
    };

    const handleCopy = (e: React.MouseEvent<HTMLElement> | null, text: string, label: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopyFeedback(label);
        setTimeout(() => setCopyFeedback(null), 1500);

        if (uiHighlightCopied && e && e.currentTarget) {
            const target = e.currentTarget;
            target.classList.add('copy-highlight-target');
            setTimeout(() => {
                target.classList.remove('copy-highlight-target');
            }, 5000);
        }
    };

    const diffResult = useMemo(() => {
        const expectedLines = diffInputs.expected.split(/\r?\n/);
        const currentLines = diffInputs.current.split(/\r?\n/);

        if (isOrdered) {
            return compareOrdered(expectedLines, currentLines, ignoreCase, trimWhitespace);
        } else {
            return compareUnordered(expectedLines, currentLines, ignoreCase, trimWhitespace);
        }
    }, [diffInputs, isOrdered, ignoreCase, trimWhitespace]);

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-4 gap-4">
            {/* Top Inputs Section - More compact height */}
            <div className="flex gap-4 min-h-0 basis-[30%] shrink-0">
                <InputWithLineNumbers
                    label="Side A"
                    value={expectedInput}
                    onChange={(e) => setExpectedInput(e.target.value)}
                    placeholder="Paste text A here..."
                    globalTerm={deferredGlobalSearchTerm}
                />
                <InputWithLineNumbers
                    label="Side B"
                    value={currentInput}
                    onChange={(e) => setCurrentInput(e.target.value)}
                    placeholder="Paste text B here..."
                    globalTerm={deferredGlobalSearchTerm}
                />
            </div>

            {/* Controls Row - Integrated better */}
            <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-gray-200 shadow-sm shrink-0">
                <button
                    onClick={handleCompare}
                    className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white font-black rounded-lg shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all text-xs uppercase tracking-widest"
                >
                    🚀 RUN COMPARE
                </button>

                <div className="h-6 w-px bg-gray-200 mx-2"></div>

                <button
                    onClick={handleSwap}
                    className="p-2 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors border border-gray-100"
                    title="Swap A & B"
                >
                    🔄
                </button>

                <button
                    onClick={handleClear}
                    className="p-2 bg-gray-50 text-red-500 rounded-lg hover:bg-red-50 transition-colors border border-gray-100"
                    title="Clear All"
                >
                    🗑️
                </button>

                <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-tighter text-gray-400 ml-4">
                    <span className="flex items-center gap-1.5 bg-red-50 text-red-600 px-2 py-1 rounded-md border border-red-100">
                        MISSING A: {diffResult.missingLines.length}
                    </span>
                    <span className="flex items-center gap-1.5 bg-green-50 text-green-600 px-2 py-1 rounded-md border border-green-100">
                        EXTRA B: {diffResult.extraLines.length}
                    </span>
                    {copyFeedback && (
                        <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded animate-pulse">
                            COPIED {copyFeedback}!
                        </span>
                    )}
                </div>

                <div className="ml-auto flex items-center gap-3">
                    <button
                        onClick={() => {
                            setActiveTab('translate');
                            setTranslateSubTab('quick');
                        }}
                        className="px-3 py-1.5 bg-white text-indigo-600 rounded-lg hover:bg-indigo-50 transition-all text-[10px] font-black uppercase tracking-wide border border-indigo-100 shadow-sm"
                    >
                        ⚡ QUICK TRANSLATE
                    </button>
                    <span className="text-gray-400 text-[10px] font-mono bg-gray-100 px-2 py-1 rounded">
                        {diffResult.lines.length} LINES
                    </span>
                </div>
            </div>

            {/* Diff Result - Maximized space, Scroll on result area only */}
            <div className="flex-1 flex gap-4 min-h-0 min-w-0">
                <div className="flex-1 border border-gray-200 rounded-2xl bg-white shadow-xl flex flex-col overflow-hidden">
                    <div className="flex bg-gray-50/80 backdrop-blur-sm border-b border-gray-200 text-[10px] font-black text-gray-400 uppercase tracking-widest sticky top-0 z-10">
                        <div className="w-1/2 px-4 py-2 border-r border-gray-100 flex items-center justify-between min-w-0">
                            <span className="cursor-help" data-tooltip="Kết quả xử lý từ Side A (Nội dung mong đợi)">SIDE A</span>
                            <button onClick={(e) => handleCopy(e, diffInputs.expected, 'A')} className="text-[9px] text-indigo-400 hover:text-indigo-600 bg-white px-1.5 rounded border border-gray-100 shadow-xs shrink-0">COPY ALL</button>
                        </div>
                        <div className="w-1/2 px-4 py-2 flex items-center justify-between min-w-0">
                            <span className="cursor-help" data-tooltip="Kết quả xử lý từ Side B (Nội dung thực tế)">SIDE B</span>
                            <button onClick={(e) => handleCopy(e, diffInputs.current, 'B')} className="text-[9px] text-green-400 hover:text-green-600 bg-white px-1.5 rounded border border-gray-100 shadow-xs shrink-0">COPY ALL</button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar bg-white font-mono text-[12px] select-text">
                        {diffResult.lines.map((line, idx) => (
                            <div key={idx} className="flex border-b border-gray-50 group hover:bg-indigo-50/20 transition-colors">
                                {/* Left Column: A */}
                                <div
                                    className={clsx(
                                        'w-1/2 px-4 py-1.5 border-r border-gray-50 overflow-hidden relative cursor-copy transition-all active:bg-red-50 min-w-0',
                                        line.type === 'removed' ? 'bg-red-50 text-red-900 border-l-4 border-l-red-400' : (line.type === 'same' ? 'text-gray-600' : 'bg-gray-50/30 opacity-40')
                                    )}
                                    title={line.type !== 'added' ? "Click to copy line A" : ""}
                                    onClick={(e) => line.type !== 'added' && handleCopy(e, line.text || '', 'LINE A')}
                                >
                                    <div className="flex gap-3 min-w-0">
                                        <span className="w-8 text-[10px] text-gray-300 select-none text-right shrink-0 py-0.5">
                                            {line.originalIndex !== undefined ? line.originalIndex + 1 : ''}
                                        </span>
                                        <div className="flex-1 overflow-x-auto custom-scrollbar-hidden whitespace-pre leading-relaxed text-[11px]">
                                            {line.type !== 'added' ? <HighlightText text={line.text || ''} globalTerm={deferredGlobalSearchTerm} /> : ''}
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column: B */}
                                <div
                                    className={clsx(
                                        'w-1/2 px-4 py-1.5 overflow-hidden relative cursor-copy transition-all active:bg-green-50 min-w-0',
                                        line.type === 'added' ? 'bg-green-50 text-green-900 border-l-4 border-l-green-400' : (line.type === 'same' ? 'text-gray-600' : 'bg-gray-50/30 opacity-40')
                                    )}
                                    title={line.type !== 'removed' ? "Click to copy line B" : ""}
                                    onClick={(e) => line.type !== 'removed' && handleCopy(e, line.currentText ?? line.text ?? '', 'LINE B')}
                                >
                                    <div className="flex gap-3 min-w-0">
                                        <span className="w-8 text-[10px] text-gray-300 select-none text-right shrink-0 py-0.5">
                                            {line.currentIndex !== undefined ? line.currentIndex + 1 : ''}
                                        </span>
                                        <div className="flex-1 overflow-x-auto custom-scrollbar-hidden whitespace-pre leading-relaxed text-[11px]">
                                            {line.type !== 'removed' ? <HighlightText text={(line.currentText ?? line.text) || ''} globalTerm={deferredGlobalSearchTerm} /> : ''}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {diffResult.lines.length === 0 && (
                            <div className="py-20 text-center flex flex-col items-center gap-4 text-gray-300">
                                <span className="text-4xl opacity-20">📂</span>
                                <p className="text-xs font-black uppercase tracking-widest opacity-40">Ready for comparison</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Compact Analysis Panel */}
                <div className="w-72 flex flex-col gap-4 overflow-hidden shrink-0">
                    <div className="flex-1 border border-gray-200 rounded-2xl bg-white shadow-lg overflow-hidden flex flex-col">
                        <div className="p-3 bg-red-50 border-b border-red-100 font-black text-[10px] text-red-600 uppercase tracking-widest flex justify-between items-center cursor-help" data-tooltip="Danh sách các dòng chỉ xuất hiện ở Side A mà Side B không có.">
                            MISSING IN B
                            <span className="bg-red-600 text-white px-2 rounded-full">{diffResult.missingLines.length}</span>
                        </div>
                        <div className="flex-1 overflow-auto p-2 space-y-1 custom-scrollbar">
                            {diffResult.missingLines.map((line, i) => (
                                <div key={i} className="text-[11px] font-mono p-1.5 text-red-700 bg-red-50/50 rounded border border-red-50 truncate cursor-pointer hover:bg-red-100/50 transition-colors" onClick={(e) => handleCopy(e, line, 'MISSING LINE')} title={line}>
                                    {line || '\u200B'}
                                </div>
                            ))}
                            {diffResult.missingLines.length === 0 && <p className="text-center py-4 text-gray-200 text-[10px] font-black">NONE</p>}
                        </div>
                    </div>

                    <div className="flex-1 border border-gray-200 rounded-2xl bg-white shadow-lg overflow-hidden flex flex-col">
                        <div className="p-3 bg-green-50 border-b border-green-100 font-black text-[10px] text-green-600 uppercase tracking-widest flex justify-between items-center cursor-help" data-tooltip="Danh sách các dòng tăng thêm ở Side B so với Side A.">
                            EXTRA IN B
                            <span className="bg-green-600 text-white px-2 rounded-full">{diffResult.extraLines.length}</span>
                        </div>
                        <div className="flex-1 overflow-auto p-2 space-y-1 custom-scrollbar">
                            {diffResult.extraLines.map((line, i) => (
                                <div key={i} className="text-[11px] font-mono p-1.5 text-green-700 bg-green-50/50 rounded border border-green-50 truncate cursor-pointer hover:bg-green-100/50 transition-colors" onClick={(e) => handleCopy(e, line, 'EXTRA LINE')} title={line}>
                                    {line || '\u200B'}
                                </div>
                            ))}
                            {diffResult.extraLines.length === 0 && <p className="text-center py-4 text-gray-200 text-[10px] font-black">NONE</p>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}


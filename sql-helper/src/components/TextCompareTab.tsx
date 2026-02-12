import React, { useState, useMemo, useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import { compareOrdered, compareUnordered } from '../utils/diffLogic';
import { useAppStore } from '../store/useAppStore';

const InputWithLineNumbers = ({
    value,
    onChange,
    placeholder,
    label
}: {
    value: string,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void,
    placeholder: string,
    label: string
}) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const lineNumbersRef = useRef<HTMLDivElement>(null);

    const handleScroll = () => {
        if (textareaRef.current && lineNumbersRef.current) {
            lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
        }
    };

    const lineCount = useMemo(() => value.split(/\r?\n/).length, [value]);

    return (
        <div className="flex-1 flex flex-col min-h-0">
            <div className="flex justify-between items-center mb-2">
                <label className="font-bold text-gray-700">{label}</label>
                <span className="text-gray-400 text-xs font-mono">{lineCount} lines</span>
            </div>

            <div className="flex-1 flex border border-gray-300 rounded overflow-hidden focus-within:ring-2 focus-within:ring-primary focus-within:border-primary min-h-0 bg-white shadow-sm">
                <div
                    ref={lineNumbersRef}
                    className="bg-gray-50 text-gray-400 font-mono text-xs py-3 pr-2 text-right select-none border-r border-gray-200 overflow-hidden shrink-0"
                    style={{ width: '3rem' }}
                >
                    {Array.from({ length: lineCount }, (_, i) => (
                        <div key={i} className="h-6 leading-6">{i + 1}</div>
                    ))}
                </div>
                <textarea
                    ref={textareaRef}
                    onScroll={handleScroll}
                    className="flex-1 p-3 resize-none outline-none font-mono text-xs whitespace-pre overflow-auto border-none w-full leading-6"
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    spellCheck={false}
                />
            </div>
        </div>
    );
};

export function TextCompareTab() {
    // Global settings
    const {
        textCompareDeleteChars, setTextCompareDeleteChars,
        textCompareRemoveAppend, setTextCompareRemoveAppend,
        textCompareTruncateDuplicate, setTextCompareTruncateDuplicate
    } = useAppStore();

    // Input states
    const [expectedInput, setExpectedInput] = useState('');
    const [currentInput, setCurrentInput] = useState('');

    // Comparison states
    const [diffInputs, setDiffInputs] = useState({ expected: '', current: '' });
    const [isOrdered, setIsOrdered] = useState(false);
    const [ignoreCase, setIgnoreCase] = useState(false);
    const [trimWhitespace, setTrimWhitespace] = useState(false);
    const [autoCompare, setAutoCompare] = useState(false);

    // UI states
    const [showConfig, setShowConfig] = useState(false);
    const configButtonRef = useRef<HTMLButtonElement>(null);
    const configModalRef = useRef<HTMLDivElement>(null);

    // Close config modal when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                configModalRef.current &&
                !configModalRef.current.contains(event.target as Node) &&
                configButtonRef.current &&
                !configButtonRef.current.contains(event.target as Node)
            ) {
                setShowConfig(false);
            }
        };

        if (showConfig) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showConfig]);

    // Processing Logic
    const preprocessText = (text: string) => {
        let processed = text;

        // 1. Remove .append(...) pattern
        if (textCompareRemoveAppend) {
            const lines = processed.split(/\r?\n/);
            processed = lines.map(line => {
                const match = line.match(/\.append\s*\((.*)\)/);
                if (match && match[1]) {
                    let content = match[1].trim();
                    // Remove surrounding quotes if present
                    if ((content.startsWith('"') && content.endsWith('"')) || (content.startsWith("'") && content.endsWith("'"))) {
                        content = content.slice(1, -1);
                    }
                    return content;
                }
                return line;
            }).join('\n');
        }

        // 2. Remove specific characters
        if (textCompareDeleteChars) {
            // Escape special regex chars in user input
            const escapeIdx = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const charsPattern = '[' + escapeIdx(textCompareDeleteChars) + ']';
            const regex = new RegExp(charsPattern, 'g');
            processed = processed.replace(regex, '');
        }

        // 3. Truncate duplicates (unique lines only)
        if (textCompareTruncateDuplicate) {
            const lines = processed.split(/\r?\n/);
            const uniqueLines = Array.from(new Set(lines));
            processed = uniqueLines.join('\n');
        }

        return processed;
    };

    // Handle auto-compare
    useEffect(() => {
        if (autoCompare) {
            const timer = setTimeout(() => {
                const processedExpected = preprocessText(expectedInput);
                const processedCurrent = preprocessText(currentInput);
                setDiffInputs({ expected: processedExpected, current: processedCurrent });
                // Note: Auto-compare doesn't auto-replace input text to avoid disturbing user while typing,
                // unless we strictly want that behavior. The user request earlier was "when clicking compare".
                // So auto-compare just diffs what is there.
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [expectedInput, currentInput, autoCompare, textCompareDeleteChars, textCompareRemoveAppend, textCompareTruncateDuplicate]);

    const handleCompare = () => {
        const processedExpected = preprocessText(expectedInput);
        const processedCurrent = preprocessText(currentInput);

        setDiffInputs({ expected: processedExpected, current: processedCurrent });

        // Update inputs to show cleaned text
        setExpectedInput(processedExpected);
        setCurrentInput(processedCurrent);
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
        <div className="flex flex-col h-[calc(100vh-140px)] gap-4 p-4">
            {/* Input Area */}
            <div className="flex gap-4 h-1/2">
                <InputWithLineNumbers
                    label="Expected"
                    value={expectedInput}
                    onChange={(e) => setExpectedInput(e.target.value)}
                    placeholder="Paste expected text here..."
                />
                <InputWithLineNumbers
                    label="Current"
                    value={currentInput}
                    onChange={(e) => setCurrentInput(e.target.value)}
                    placeholder="Paste current text here..."
                />
            </div>

            {/* Controls */}
            <div className="flex items-center gap-4 border-y border-gray-200 py-3 bg-gray-50 px-2 rounded relative">
                <button
                    onClick={handleCompare}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white font-bold rounded shadow hover:bg-secondary transition-colors"
                >
                    <span>🚀</span> Compare
                </button>

                <div className="relative">
                    <button
                        ref={configButtonRef}
                        onClick={() => setShowConfig(!showConfig)}
                        className={clsx(
                            "flex items-center gap-2 px-3 py-2 border rounded font-bold transition-colors select-none",
                            showConfig ? "bg-gray-100 border-gray-400" : "bg-white border-gray-300 hover:bg-gray-50"
                        )}
                    >
                        <span>⚙️</span> Config
                    </button>

                    {showConfig && (
                        <div
                            ref={configModalRef}
                            className="absolute bottom-full left-0 mb-2 w-80 bg-white border border-gray-200 shadow-xl rounded-lg p-4 z-50 flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-100"
                        >
                            <h4 className="font-bold text-gray-700 border-b border-gray-100 pb-2 mb-1 text-sm uppercase">Settings</h4>

                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={isOrdered}
                                    onChange={(e) => setIsOrdered(e.target.checked)}
                                    className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                                />
                                <span className="font-medium text-gray-700 text-sm">Ordered Comparison</span>
                            </label>

                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={ignoreCase}
                                    onChange={(e) => setIgnoreCase(e.target.checked)}
                                    className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                                />
                                <span className="font-medium text-gray-700 text-sm">Ignore Case</span>
                            </label>

                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={trimWhitespace}
                                    onChange={(e) => setTrimWhitespace(e.target.checked)}
                                    className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                                />
                                <span className="font-medium text-gray-700 text-sm">Trim Whitespace</span>
                            </label>

                            <div className="border-t border-gray-100 my-1"></div>

                            <h5 className="font-bold text-gray-500 text-xs uppercase mt-1">Pre-processing</h5>

                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={textCompareRemoveAppend}
                                    onChange={(e) => setTextCompareRemoveAppend(e.target.checked)}
                                    className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                                />
                                <span className="font-medium text-gray-700 text-sm">Remove .append(...) wrapper</span>
                            </label>

                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={textCompareTruncateDuplicate}
                                    onChange={(e) => setTextCompareTruncateDuplicate(e.target.checked)}
                                    className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                                />
                                <span className="font-medium text-gray-700 text-sm">Truncate Duplicate Lines</span>
                            </label>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Remove Characters:</label>
                                <input
                                    type="text"
                                    value={textCompareDeleteChars}
                                    onChange={(e) => setTextCompareDeleteChars(e.target.value)}
                                    placeholder="e.g. ,;()"
                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm font-mono focus:ring-1 focus:ring-primary outline-none"
                                />
                            </div>

                            <div className="border-t border-gray-100 my-1"></div>

                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={autoCompare}
                                    onChange={(e) => setAutoCompare(e.target.checked)}
                                    className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                                />
                                <span className="font-bold text-green-700 text-sm">Auto-Compare</span>
                            </label>
                        </div>
                    )}
                </div>

                <div className="h-6 w-px bg-gray-300 mx-2"></div>

                <div className="flex items-center gap-4 text-xs font-mono text-gray-500">
                    <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-red-400"></span>
                        Missing: <b className="text-gray-900">{diffResult.missingLines.length}</b>
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-green-400"></span>
                        Extra: <b className="text-gray-900">{diffResult.extraLines.length}</b>
                    </span>
                </div>

                <span className="text-gray-500 text-sm ml-auto">
                    {diffResult.lines.length} lines result
                </span>
            </div>

            {/* Diff Result */}
            <div className="flex-1 flex gap-4 min-h-0">
                {/* Main Diff View */}
                <div className="flex-1 border border-gray-300 rounded bg-white overflow-auto flex flex-col">
                    {/* Header for Side-by-Side */}
                    <div className="flex border-b border-gray-200 bg-gray-50 text-xs font-bold text-gray-500 uppercase select-none sticky top-0 z-10">
                        <div className="w-1/2 px-2 py-1 border-r border-gray-200">Expected</div>
                        <div className="w-1/2 px-2 py-1">Current</div>
                    </div>
                    <div className="flex flex-col font-mono text-sm whitespace-pre min-h-0">
                        {diffResult.lines.map((line, idx) => (
                            <div
                                key={idx}
                                className="flex border-b border-gray-50 hover:bg-gray-100"
                            >
                                {/* Left Column: Expected */}
                                <div className={clsx(
                                    'w-1/2 px-2 py-0.5 border-r border-gray-100 overflow-x-auto hide-scrollbar',
                                    line.type === 'removed' && 'bg-red-50 text-red-900',
                                    line.type === 'same' && 'text-gray-600',
                                    // If added, this side is empty gap
                                    line.type === 'added' && 'bg-gray-50/50'
                                )}>
                                    <div className="flex">
                                        <span className="w-6 text-gray-300 select-none text-right mr-2 text-xs shrink-0">
                                            {line.originalIndex !== undefined ? line.originalIndex + 1 : ''}
                                        </span>
                                        <span className={clsx("flex-1", line.type === 'removed' && 'bg-red-100')}>
                                            {line.type !== 'added' ? (line.text || ' ') : ''}
                                        </span>
                                    </div>
                                </div>

                                {/* Right Column: Current */}
                                <div className={clsx(
                                    'w-1/2 px-2 py-0.5 overflow-x-auto hide-scrollbar',
                                    line.type === 'added' && 'bg-green-50 text-green-900',
                                    line.type === 'same' && 'text-gray-600',
                                    // If removed, this side is empty gap
                                    line.type === 'removed' && 'bg-gray-50/50'
                                )}>
                                    <div className="flex">
                                        <span className="w-6 text-gray-300 select-none text-right mr-2 text-xs shrink-0">
                                            {line.currentIndex !== undefined ? line.currentIndex + 1 : ''}
                                        </span>
                                        <span className={clsx("flex-1", line.type === 'added' && 'bg-green-100')}>
                                            {line.type !== 'removed' ? ((line.currentText ?? line.text) || ' ') : ''}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {diffResult.lines.length === 0 && (
                            <div className="p-8 text-center text-gray-400">
                                No differences to show or empty input.
                            </div>
                        )}
                    </div>
                </div>

                {/* Summary / Missing Lines Panel */}
                <div className="w-64 border border-gray-300 rounded bg-gray-50 flex flex-col overflow-hidden">
                    <div className="p-2 bg-gray-100 border-b border-gray-200 font-bold text-gray-700 text-xs uppercase">
                        Analysis
                    </div>
                    <div className="overflow-auto flex-1 p-2 space-y-4">

                        {/* Missing */}
                        <div>
                            <h4 className="text-red-700 font-bold text-xs mb-1 flex items-center justify-between">
                                Missing in Expected
                                <span className="bg-red-200 text-red-800 px-1.5 rounded-full text-[10px]">{diffResult.missingLines.length}</span>
                            </h4>
                            {diffResult.missingLines.length === 0 ? (
                                <p className="text-gray-400 text-xs italic">None</p>
                            ) : (
                                <ul className="text-xs space-y-1">
                                    {diffResult.missingLines.map((line, i) => (
                                        <li key={i} className="text-red-600 truncate bg-red-50 px-1 rounded border border-red-100" title={line}>{line}</li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {/* Extra */}
                        <div>
                            <h4 className="text-green-700 font-bold text-xs mb-1 flex items-center justify-between">
                                Extra in Current
                                <span className="bg-green-200 text-green-800 px-1.5 rounded-full text-[10px]">{diffResult.extraLines.length}</span>
                            </h4>
                            {diffResult.extraLines.length === 0 ? (
                                <p className="text-gray-400 text-xs italic">None</p>
                            ) : (
                                <ul className="text-xs space-y-1">
                                    {diffResult.extraLines.map((line, i) => (
                                        <li key={i} className="text-green-600 truncate bg-green-50 px-1 rounded border border-green-100" title={line}>{line}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

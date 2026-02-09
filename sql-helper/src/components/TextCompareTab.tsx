import { useState, useMemo } from 'react';
import { clsx } from 'clsx';
import { compareOrdered, compareUnordered, DiffResult } from '../utils/diffLogic';

export function TextCompareTab() {
    const [expectedText, setExpectedText] = useState('');
    const [currentText, setCurrentText] = useState('');
    const [isOrdered, setIsOrdered] = useState(false); // Default to Unordered (User request implies a choice, let's default to unchecked as per "Compare without order" description being prominent)
    const [ignoreCase, setIgnoreCase] = useState(false); // Default to case-sensitive
    const [trimWhitespace, setTrimWhitespace] = useState(false); // Default to no trim
    // Actually user says: "Compare with order (checkbox)... If checked... Compare without order... If unchecked"
    // Wait, usually checkbox "Ordered" means checked = ordered.
    // "Compare with order (index-based) -> If checked"
    // "Compare without order (unordered mode) -> If unchecked"
    // So default should probably be ordered for standard behavior? Or unordered?
    // Let's stick to `false` (unchecked) = Unordered. `true` (checked) = Ordered.

    const diffResult = useMemo(() => {
        const expectedLines = expectedText.split(/\r?\n/);
        const currentLines = currentText.split(/\r?\n/);

        // Filter empty lines? Usually diff tools keep them.
        // Let's keep them for now.

        if (isOrdered) {
            return compareOrdered(expectedLines, currentLines, ignoreCase, trimWhitespace);
        } else {
            return compareUnordered(expectedLines, currentLines, ignoreCase, trimWhitespace);
        }
    }, [expectedText, currentText, isOrdered, ignoreCase, trimWhitespace]);

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] gap-4 p-4">
            {/* Input Area */}
            <div className="flex gap-4 h-1/2">
                <div className="flex-1 flex flex-col">
                    <label className="font-bold mb-2 text-gray-700">Expected</label>
                    <textarea
                        className="flex-1 p-3 border border-gray-300 rounded resize-none focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                        value={expectedText}
                        onChange={(e) => setExpectedText(e.target.value)}
                        placeholder="Paste expected text here..."
                    />
                </div>
                <div className="flex-1 flex flex-col">
                    <label className="font-bold mb-2 text-gray-700">Current</label>
                    <textarea
                        className="flex-1 p-3 border border-gray-300 rounded resize-none focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                        value={currentText}
                        onChange={(e) => setCurrentText(e.target.value)}
                        placeholder="Paste current text here..."
                    />
                </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-4 border-y border-gray-200 py-3 bg-gray-50 px-2 rounded">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={isOrdered}
                        onChange={(e) => setIsOrdered(e.target.checked)}
                        className="w-5 h-5 text-primary border-gray-300 rounded focus:ring-primary"
                    />
                    <span className="font-medium text-gray-700">Compare with order (Index-based)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none ml-4">
                    <input
                        type="checkbox"
                        checked={ignoreCase}
                        onChange={(e) => setIgnoreCase(e.target.checked)}
                        className="w-5 h-5 text-primary border-gray-300 rounded focus:ring-primary"
                    />
                    <span className="font-medium text-gray-700">Ignore Case</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none ml-4">
                    <input
                        type="checkbox"
                        checked={trimWhitespace}
                        onChange={(e) => setTrimWhitespace(e.target.checked)}
                        className="w-5 h-5 text-primary border-gray-300 rounded focus:ring-primary"
                    />
                    <span className="font-medium text-gray-700">Trim Whitespace</span>
                </label>
                <span className="text-gray-500 text-sm ml-auto">
                    {diffResult.lines.length} lines in result
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
                                            {line.type !== 'removed' ? (line.text || ' ') : ''}
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

import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { extractColumnsFromCreateTable, generateSelectStatement } from '../utils/schemaComparator';

interface ComparisonResult {
    tables: {
        id: string;
        tableName: string;
        columns: string[];
        onlyInThisTable: string[];
        selectStatement: string;
    }[];
    commonColumns: string[];
}

export const SchemaTab: React.FC = () => {
    const {
        compareTables, addCompareTable, updateCompareTable, removeCompareTable,
        priorityColumns, setPriorityColumns, runShortcut
    } = useAppStore();

    const [result, setResult] = useState<ComparisonResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [showCommon, setShowCommon] = useState(false);
    const [showDetails, setShowDetails] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            let combo = '';
            if (e.ctrlKey) combo += 'CTRL+';
            if (e.shiftKey) combo += 'SHIFT+';
            if (e.altKey) combo += 'ALT+';
            if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
                combo += e.key.toUpperCase();
            }

            if (combo === runShortcut.toUpperCase()) {
                e.preventDefault();
                handleCompare();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [runShortcut, compareTables, priorityColumns]);

    const handleCompare = () => {
        setError(null);
        setResult(null);

        const validScripts = compareTables.filter(t => t.content.trim());
        if (validScripts.length < 2) {
            setError('Please paste at least 2 CREATE TABLE scripts to compare');
            return;
        }

        try {
            const parsedTables = validScripts.map(t => {
                const { columns, tableName } = extractColumnsFromCreateTable(t.content);
                return { id: t.id, content: t.content, columns, tableName: tableName || 'Unknown Table' };
            });

            if (parsedTables.some(t => t.columns.length === 0)) {
                setError('Could not parse columns from one or more scripts. Please check format.');
                return;
            }

            const priorityCols = priorityColumns
                ? priorityColumns.split(',').map(c => c.trim().toUpperCase()).filter(Boolean)
                : [];

            // Find common columns
            // Intersection of all column sets
            const allColSets = parsedTables.map(t => new Set(t.columns));
            // Start with first table's columns and filter
            const commonCols = parsedTables[0].columns.filter(col =>
                allColSets.every(set => set.has(col))
            ).sort();

            // Prepare results
            const tablesResult = parsedTables.map((t, idx) => {
                const onlyInThisTable = t.columns.filter(col => !commonCols.includes(col)).sort();
                const selectStatement = generateSelectStatement(commonCols, onlyInThisTable, t.tableName, priorityCols);
                return {
                    id: t.id,
                    tableName: t.tableName || `Table ${idx + 1}`,
                    columns: t.columns,
                    onlyInThisTable,
                    selectStatement
                };
            });

            setResult({
                tables: tablesResult,
                commonColumns: commonCols
            });
            setShowCommon(true); // Open result by default?

        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleClear = () => {
        compareTables.forEach(t => updateCompareTable(t.id, ''));
        setPriorityColumns('');
        setResult(null);
        setError(null);
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    return (
        <div className="p-5 flex flex-col gap-5">
            <div className="bg-white p-5 rounded-lg shadow-sm">
                <div className="flex justify-between items-center mb-5">
                    <h3 className="text-lg font-bold text-gray-800">Tables to Compare:</h3>
                    <button
                        onClick={addCompareTable}
                        className="px-4 py-2 bg-green-600 text-white rounded font-bold text-sm hover:bg-green-700 transition-colors"
                    >
                        + Add Table
                    </button>
                </div>

                <div className={`grid gap-5 mb-5 ${compareTables.length > 2 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    {compareTables.map((table, index) => (
                        <div key={table.id} className="flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                                <label className="font-bold text-gray-700 text-sm">Table {index + 1} Script:</label>
                                <button
                                    onClick={() => {
                                        if (compareTables.length <= 2) {
                                            alert('You must keep at least 2 tables for comparison.');
                                            return;
                                        }
                                        removeCompareTable(table.id);
                                    }}
                                    className="px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 transition-colors"
                                >
                                    Remove
                                </button>
                            </div>
                            <textarea
                                value={table.content}
                                onChange={(e) => updateCompareTable(table.id, e.target.value)}
                                placeholder="Paste CREATE TABLE script here..."
                                className="w-full min-h-[300px] p-2 border border-gray-300 rounded font-mono text-xs focus:ring-1 focus:ring-primary focus:border-primary resize-y"
                            />
                        </div>
                    ))}
                </div>

                <div className="mb-5">
                    <label className="block font-bold text-gray-700 text-sm mb-2">Priority Columns (Optional - separate by comma):</label>
                    <input
                        type="text"
                        value={priorityColumns}
                        onChange={(e) => setPriorityColumns(e.target.value)}
                        placeholder="e.g., HACHU_DT,SHIME_TM,HACHU_SURYO_QT..."
                        className="w-full p-2 border border-gray-300 rounded font-mono text-sm focus:ring-1 focus:ring-primary focus:border-primary"
                    />
                    <small className="text-gray-500 mt-1 block">These columns will appear first in the generated SELECT statements</small>
                </div>

                <div className="flex gap-2 mb-5">
                    <button
                        onClick={handleCompare}
                        className="px-5 py-2 bg-primary text-white rounded font-medium hover:bg-secondary transition-colors"
                    >
                        Compare Tables
                    </button>
                    <button
                        onClick={handleClear}
                        className="px-5 py-2 bg-gray-500 text-white rounded font-medium hover:bg-gray-600 transition-colors"
                    >
                        Clear
                    </button>
                </div>

                {error && (
                    <div className="bg-red-100 text-red-800 p-3 rounded border border-red-200 mb-5">
                        {error}
                    </div>
                )}

                {result && (
                    <div className="flex flex-col gap-5 animate-fade-in">
                        <div className="bg-green-100 text-green-800 p-3 rounded border border-green-200">
                            ✓ Comparison of {result.tables.length} tables completed successfully!
                        </div>

                        <div className="bg-gray-50 border border-gray-200 rounded p-4">
                            <div
                                className="flex justify-between items-center cursor-pointer select-none"
                                onClick={() => setShowCommon(!showCommon)}
                            >
                                <h3 className="font-bold text-gray-800">Common Columns ({result.commonColumns.length}):</h3>
                                <span className="text-primary font-bold text-xl">{showCommon ? '-' : '+'}</span>
                            </div>
                            {showCommon && (
                                <div className="mt-3 font-mono text-xs bg-white p-3 border border-gray-200 rounded max-h-48 overflow-y-auto whitespace-pre-wrap break-all">
                                    {result.commonColumns.length > 0 ? (
                                        <>
                                            <span className="text-green-600 font-bold">✓ Common Columns:</span><br />
                                            {result.commonColumns.join(',\n')}
                                        </>
                                    ) : '(No common columns found)'}
                                </div>
                            )}
                        </div>

                        <div className="bg-gray-50 border border-gray-200 rounded p-4">
                            <div
                                className="flex justify-between items-center cursor-pointer select-none"
                                onClick={() => setShowDetails(!showDetails)}
                            >
                                <h3 className="font-bold text-gray-800">Column Comparison Details:</h3>
                                <span className="text-primary font-bold text-xl">{showDetails ? '-' : '+'}</span>
                            </div>
                            {showDetails && (
                                <div className={`mt-3 grid gap-4 grid-cols-${result.tables.length}`}>
                                    {result.tables.map(t => (
                                        <div key={t.id}>
                                            <h4 className="text-primary font-medium mb-2 break-all">Only in {t.tableName}:</h4>
                                            <div className="font-mono text-xs bg-white p-2 border border-gray-200 rounded max-h-40 overflow-y-auto">
                                                {t.onlyInThisTable.length > 0 ? (
                                                    <>
                                                        <span className="text-red-500 font-bold">⚠ {t.onlyInThisTable.length} column(s):</span><br />
                                                        {t.onlyInThisTable.join('\n')}
                                                    </>
                                                ) : '(None)'}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="bg-gray-50 border border-gray-200 rounded p-4">
                            <h3 className="font-bold text-gray-800 mb-4">Generated SELECT Statements:</h3>
                            <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
                                {result.tables.map((t) => (
                                    <div key={t.id} className="bg-white p-4 border border-gray-200 rounded shadow-sm">
                                        <h4 className="text-primary font-medium mb-2 break-all">SELECT for {t.tableName}:</h4>
                                        <textarea
                                            readOnly
                                            value={t.selectStatement}
                                            className="w-full min-h-[150px] p-2 border border-gray-300 rounded font-mono text-xs mb-2 bg-gray-50"
                                        />
                                        <button
                                            onClick={() => copyToClipboard(t.selectStatement)}
                                            className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition-colors"
                                        >
                                            Copy SQL
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

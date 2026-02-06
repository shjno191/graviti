import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { extractColumnsFromCreateTable, generateSelectStatement } from '../utils/schemaComparator';

export const GenerateTab: React.FC = () => {
    const {
        schemaScript, setSchemaScript,
        genPriorityColumns, setGenPriorityColumns,
        runShortcut
    } = useAppStore();

    const [columns, setColumns] = useState<string[]>([]);
    const [generatedSql, setGeneratedSql] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

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
                handleGenerate();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [runShortcut, schemaScript, genPriorityColumns]);

    const handleGenerate = () => {
        setError(null);
        setSuccess(false);
        setColumns([]);
        setGeneratedSql('');

        if (!schemaScript.trim()) {
            setError('Please paste a CREATE TABLE script');
            return;
        }

        try {
            const { columns: foundColumns, tableName } = extractColumnsFromCreateTable(schemaScript);

            if (foundColumns.length === 0) {
                setError('Could not parse columns from script. Please check format.');
                return;
            }

            const priorityCols = genPriorityColumns
                ? genPriorityColumns.split(',').map(c => c.trim().toUpperCase()).filter(Boolean)
                : [];

            // We can reuse generateSelectStatement by passing all columns as 'common' and empty 'onlyInTable', or vice versa.
            // Actually, `generateSelectStatement` parameters are (common, only, table, priorities).
            // If we treat all found columns as common (or onlyInTable), it works.
            // Let's treat them as common so they are processed.
            // Wait, logic says: sort common, then onlyInTable.
            // But here we just have ONE set of columns.
            // I'll use `commonColumns` = foundColumns, `onlyInTable` = [].

            const sql = generateSelectStatement(foundColumns, [], tableName || 'TABLE_NAME', priorityCols);

            setColumns(foundColumns);
            setGeneratedSql(sql);
            setSuccess(true);
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleClear = () => {
        setSchemaScript('');
        setGenPriorityColumns('');
        setColumns([]);
        setGeneratedSql('');
        setError(null);
        setSuccess(false);
    };

    const copySql = () => {
        if (!generatedSql) return;
        // Clean comments? The original cleans comments starting with --.
        // Let's replicate this behavior for the copy action if user wants clean SQL.
        // But maybe they want comments. Original `copyGeneratedSql` removes comments.
        const lines = generatedSql.split('\n');
        const filteredLines = lines.filter(line => !line.trim().startsWith('--'));
        const cleanedText = filteredLines.join('\n').trim();
        navigator.clipboard.writeText(cleanedText);
    };

    return (
        <div className="p-5">
            <div className="bg-white p-5 rounded-lg shadow-sm">
                <div className="mb-5">
                    <label className="block font-bold text-gray-700 text-sm mb-2">CREATE TABLE Script:</label>
                    <textarea
                        value={schemaScript}
                        onChange={(e) => setSchemaScript(e.target.value)}
                        placeholder="Paste CREATE TABLE script here..."
                        className="w-full min-h-[300px] p-2 border border-gray-300 rounded font-mono text-xs focus:ring-1 focus:ring-primary focus:border-primary resize-y"
                    />
                </div>

                <div className="mb-5">
                    <label className="block font-bold text-gray-700 text-sm mb-2">Priority Columns (Optional - separate by comma):</label>
                    <input
                        type="text"
                        value={genPriorityColumns}
                        onChange={(e) => setGenPriorityColumns(e.target.value)}
                        placeholder="e.g., ID,NAME,DATE,STATUS"
                        className="w-full p-2 border border-gray-300 rounded font-mono text-sm focus:ring-1 focus:ring-primary focus:border-primary"
                    />
                    <small className="text-gray-500 mt-1 block">These columns will appear first in the generated SELECT statement</small>
                </div>

                <div className="flex gap-2 mb-5">
                    <button
                        onClick={handleGenerate}
                        className="px-5 py-2 bg-primary text-white rounded font-medium hover:bg-secondary transition-colors"
                    >
                        Generate SELECT
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

                {success && (
                    <div className="flex flex-col gap-5 animate-fade-in">
                        <div className="bg-green-100 text-green-800 p-3 rounded border border-green-200">
                            ✓ SELECT statement generated successfully!
                        </div>

                        <div className="bg-gray-50 border border-gray-200 rounded p-4">
                            <h3 className="font-bold text-gray-800 mb-2">Columns Found:</h3>
                            <div className="font-mono text-xs bg-white p-2 border border-gray-200 rounded max-h-40 overflow-y-auto">
                                <span className="text-green-600 font-bold">📊 Total Columns: {columns.length}</span><br />
                                {columns.join(', ')}
                            </div>
                        </div>

                        <div className="bg-gray-50 border border-gray-200 rounded p-4">
                            <h3 className="font-bold text-gray-800 mb-2">Generated SELECT Statement:</h3>
                            <textarea
                                readOnly
                                value={generatedSql}
                                className="w-full min-h-[200px] p-2 border border-gray-300 rounded font-mono text-xs mb-2 bg-white"
                            />
                            <button
                                onClick={copySql}
                                className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition-colors"
                            >
                                Copy SQL (Clean)
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

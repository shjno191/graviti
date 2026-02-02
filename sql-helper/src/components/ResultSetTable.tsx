import React from 'react';
import { QueryResult } from '../store/useAppStore';

interface ResultSetTableProps {
    result: QueryResult;
}

export const ResultSetTable: React.FC<ResultSetTableProps> = ({ result }) => {
    if (!result || !result.columns.length) return null;

    const copyToExcel = () => {
        const header = result.columns.join('\t');
        const rows = result.rows.map(row => row.join('\t')).join('\n');
        const text = `${header}\n${rows}`;
        navigator.clipboard.writeText(text);
        alert('Copied to clipboard (TSV format, ready for Excel)');
    };

    return (
        <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
            <div className="flex justify-between items-center p-3 bg-gray-50 border-b border-gray-200">
                <span className="text-sm font-semibold text-gray-700">{result.rows.length} rows found</span>
                <button
                    onClick={copyToExcel}
                    className="text-xs px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex items-center gap-2"
                >
                    <span>📋</span> Copy to Excel
                </button>
            </div>
            <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-sm border-collapse">
                    <thead className="sticky top-0 bg-gray-100 shadow-sm">
                        <tr>
                            {result.columns.map((col, i) => (
                                <th key={i} className="px-3 py-2 border-r border-b border-gray-300 text-left font-bold text-gray-700 whitespace-nowrap min-w-[100px]">
                                    {col}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {result.rows.map((row, rowIndex) => (
                            <tr key={rowIndex} className="hover:bg-blue-50/50 transition-colors">
                                {row.map((cell, cellIndex) => (
                                    <td key={cellIndex} className="px-3 py-1.5 border-r border-b border-gray-200 font-mono text-xs text-gray-600 whitespace-pre">
                                        {cell}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

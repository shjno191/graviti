import React from 'react';
import { QueryResult, useAppStore } from '../store/useAppStore';

interface ResultSetTableProps {
    result: QueryResult;
}

export const ResultSetTable: React.FC<ResultSetTableProps> = React.memo(({ result }) => {
    const { excelHeaderColor } = useAppStore();
    if (!result || !result.columns.length) return null;

    const [copyStatus, setCopyStatus] = React.useState(false);
    const [menuPos, setMenuPos] = React.useState<{ x: number, y: number, rowIndex: number } | null>(null);

    React.useEffect(() => {
        const handleClick = () => setMenuPos(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    const copyToExcel = () => {
        // Full table styling
        const tableHtml = `
          <table style="border-collapse: collapse; border: 1px solid #000000;">
            <thead>
              <tr>
                ${result.columns.map(col => `
                  <th style="background-color: ${excelHeaderColor}; color: #ffffff; padding: 8px; border: 1px solid #000000; font-family: sans-serif; font-size: 11pt; text-align: left;">${col}</th>
                `).join('')}
              </tr>
            </thead>
            <tbody>
              ${result.rows.map(row => `
                <tr>
                  ${row.map(cell => `
                    <td style="color: #000000; padding: 6px 8px; border: 1px solid #000000; font-family: Calibri, sans-serif; font-size: 10pt; white-space: nowrap;">${cell === null ? 'NULL' : cell}</td>
                  `).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;

        const plainText = [
            result.columns.join('\t'),
            ...result.rows.map(row => row.join('\t'))
        ].join('\n');

        const blob = new Blob([tableHtml], { type: 'text/html' });
        const plainBlob = new Blob([plainText], { type: 'text/plain' });
        const data = [new ClipboardItem({ 'text/html': blob, 'text/plain': plainBlob })];

        navigator.clipboard.write(data).then(() => {
            setCopyStatus(true);
            setTimeout(() => setCopyStatus(false), 2000);
        });
    };

    const handleCopyRow = (rowIndex: number) => {
        const row = result.rows[rowIndex];

        // Horizontal Format HTML for Copy Record
        const tableHtml = `
          <table style="border-collapse: collapse; border: 1px solid #000000;">
            <thead>
              <tr>
                ${result.columns.map(col => `
                  <th style="background-color: ${excelHeaderColor}; color: #ffffff; padding: 8px; border: 1px solid #000000; font-family: sans-serif; font-size: 11pt; text-align: left;">${col}</th>
                `).join('')}
              </tr>
            </thead>
            <tbody>
              <tr>
                ${row.map(cell => `
                  <td style="color: #000000; padding: 6px 8px; border: 1px solid #000000; font-family: Calibri, sans-serif; font-size: 10pt; white-space: nowrap;">${cell === null ? 'NULL' : cell}</td>
                `).join('')}
              </tr>
            </tbody>
          </table>
        `;

        const plainText = result.columns.map((col, i) => `${col}: ${row[i]}`).join('\t'); // tab separated horizontal

        const blob = new Blob([tableHtml], { type: 'text/html' });
        const data = [new ClipboardItem({ 'text/html': blob, 'text/plain': new Blob([plainText], { type: 'text/plain' }) })];

        navigator.clipboard.write(data);
        setMenuPos(null);
    };

    const handleGenerateInsert = (rowIndex: number) => {
        const row = result.rows[rowIndex];
        const tableName = "TABLE_NAME";
        const cols = result.columns.join(', ');
        const values = row.map(v => {
            if (v === null || v === 'NULL') return 'NULL';
            return `'${String(v).replace(/'/g, "''")}'`;
        }).join(', ');
        const sql = `INSERT INTO ${tableName} (${cols})\nVALUES (${values});`;
        navigator.clipboard.writeText(sql);
        setMenuPos(null);
    };

    return (
        <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
            <div className="flex justify-between items-center p-3 bg-gray-50 border-b border-gray-200">
                <span className="text-sm font-semibold text-gray-700">{result.rows.length} rows found</span>
                <button
                    onClick={copyToExcel}
                    className={`text-xs px-4 py-2 rounded-xl font-black transition-all flex items-center gap-2 shadow-lg ${copyStatus ? 'bg-green-500 text-white' : 'bg-gray-900 text-white hover:bg-black'}`}
                >
                    {copyStatus ? (
                        <><span>✅</span> COPIED</>
                    ) : (
                        <><span>📊</span> COPY EXCEL</>
                    )}
                </button>
            </div>
            <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-sm border-collapse">
                    <thead className="sticky top-0 shadow-sm" style={{ backgroundColor: excelHeaderColor }}>
                        <tr>
                            {result.columns.map((col, i) => (
                                <th key={i} className="px-3 py-2 border-r border-b border-gray-300 text-left font-medium text-white whitespace-nowrap min-w-[100px]">
                                    {col}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {result.rows.slice(0, 1000).map((row, rowIndex) => (
                            <tr
                                key={rowIndex}
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    setMenuPos({ x: e.clientX, y: e.clientY, rowIndex });
                                }}
                                className="hover:bg-blue-50/50 transition-colors group cursor-default"
                            >
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

            {menuPos && (
                <div
                    className="fixed z-[1000] bg-white border border-gray-100 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] py-3 min-w-[240px] animate-in zoom-in-95 duration-100 overflow-hidden"
                    style={{ left: menuPos.x, top: menuPos.y }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="px-4 py-1 mb-2">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Record Options</span>
                    </div>
                    <button
                        onClick={() => handleCopyRow(menuPos.rowIndex)}
                        className="w-full px-5 py-3 text-left text-sm font-bold text-gray-700 hover:bg-primary/5 hover:text-primary transition-all flex items-center gap-4 group"
                    >
                        <span className="text-xl group-hover:scale-125 transition-transform">📋</span>
                        <div className="flex flex-col">
                            <span>Copy Record (Excel Horizontal)</span>
                            <span className="text-[10px] text-gray-400 font-medium">Copy all columns of this row</span>
                        </div>
                    </button>
                    <button
                        onClick={() => handleGenerateInsert(menuPos.rowIndex)}
                        className="w-full px-5 py-3 text-left text-sm font-bold text-gray-700 hover:bg-primary/5 hover:text-primary transition-all flex items-center gap-4 group"
                    >
                        <span className="text-xl group-hover:scale-125 transition-transform">📝</span>
                        <div className="flex flex-col">
                            <span>Generate INSERT</span>
                            <span className="text-[10px] text-gray-400 font-medium">Create SQL INSERT statement</span>
                        </div>
                    </button>
                </div>
            )}
        </div>
    );
});

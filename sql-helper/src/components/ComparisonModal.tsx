import React from 'react';

interface ComparisonModalProps {
    isOpen: boolean;
    onClose: () => void;
    availableGroups: { id: string; name: string; result?: any }[];
}

export const ComparisonModal: React.FC<ComparisonModalProps> = ({ isOpen, onClose, availableGroups }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-gray-900/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white w-full h-full max-w-[98vw] max-h-[96vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
                <div className="p-6 bg-white border-b border-gray-100 flex justify-between items-center shadow-sm z-30">
                    <h2 className="text-2xl font-black bg-gradient-to-br from-orange-500 to-red-600 bg-clip-text text-transparent uppercase">Compare Stack</h2>
                    <button onClick={onClose} className="px-6 py-2 bg-primary text-white font-bold rounded-xl hover:bg-secondary transition-all">Close ESC</button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-8 bg-gray-50 custom-scrollbar">
                    {availableGroups.filter(g => g.result).map((g) => (
                        <div key={g.id} className="w-full bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col border border-gray-200">
                            <div className="p-4 bg-gray-50 border-b border-gray-200 font-black text-gray-800 uppercase tracking-tighter">
                                {g.name}
                            </div>
                            <div className="overflow-auto bg-white max-h-[500px]">
                                <table className="w-full text-left border-collapse min-w-max">
                                    <thead className="sticky top-0 bg-[#f8fafc] border-b-2 border-gray-200 z-10">
                                        <tr>
                                            {g.result.columns.map((c: string) => (
                                                <th key={c} className="px-4 py-4 font-black text-gray-600 text-[11px] border-r border-gray-100">{c}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="text-black">
                                        {g.result.rows.slice(0, 100).map((row: string[], i: number) => (
                                            <tr key={i} className="border-b border-gray-50 hover:bg-orange-50/30 transition-colors">
                                                {row.map((cell, j) => (
                                                    <td key={j} className={`px-4 py-2 border-r border-gray-50 last:border-0 truncate font-mono text-[11px] ${cell === '[NULL]' ? 'text-gray-300 italic' : 'text-gray-700'}`} title={cell}>
                                                        {cell}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {g.result.rows.length > 100 && (
                                    <div className="p-4 text-center text-xs font-bold text-gray-400 border-t border-gray-100 italic">
                                        Showing first 100 of {g.result.rows.length} records. Use SQL filters to narrow down results.
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {availableGroups.filter(g => g.result).length === 0 && (
                        <div className="flex-1 flex items-center justify-center text-gray-400 font-black">
                            PLEASE RUN QUERIES FIRST TO SEE DATA HERE
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

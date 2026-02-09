import { useState, useMemo } from 'react';
import { parseJavaClass } from '../utils/javaParser';


export function JavaParserTab() {
    const [sourceCode, setSourceCode] = useState('');
    const [notification, setNotification] = useState<string | null>(null);
    
    const parsedFields = useMemo(() => {
        return parseJavaClass(sourceCode);
    }, [sourceCode]);

    const copyColumn = (key: 'description' | 'name' | 'type', label: string) => {
        if (parsedFields.length === 0) return;
        const text = parsedFields.map(f => f[key]).join('\n');
        navigator.clipboard.writeText(text);
        setNotification(`Copied ${label} to clipboard!`);
        setTimeout(() => setNotification(null), 2000);
    };

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] gap-4 p-4 relative">
            {notification && (
                <div className="absolute top-4 left-1/2 transform -translate-x-1/2 px-4 py-2 bg-gray-800 text-white text-sm rounded shadow-lg z-50 animate-fade-in-down">
                    {notification}
                </div>
            )}
            <div className="flex-1 flex gap-4 min-h-0">
                {/* Input Area */}
                <div className="w-1/2 flex flex-col">
                    <label className="font-bold mb-2 text-gray-700">Java Class Source</label>
                    <textarea
                        className="flex-1 p-3 border border-gray-300 rounded resize-none focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm whitespace-pre"
                        value={sourceCode}
                        onChange={(e) => setSourceCode(e.target.value)}
                        placeholder="Paste Java class here..."
                    />
                </div>

                {/* Output Area */}
                <div className="w-1/2 flex flex-col">
                    <div className="flex justify-between items-center mb-2">
                        <label className="font-bold text-gray-700">Extracted Properties</label>
                        <span className="text-gray-500 text-sm">{parsedFields.length} fields found</span>
                    </div>
                    
                    <div className="flex-1 border border-gray-300 rounded bg-white overflow-auto">
                        <table className="w-full text-sm text-left text-gray-700">
                            <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0 z-10">
                                <tr>
                                    <th scope="col" className="px-4 py-3 border-b border-gray-200 group cursor-pointer hover:bg-gray-100" onClick={() => copyColumn('description', 'Descriptions')}>
                                        <div className="flex items-center gap-2">
                                            Description
                                            <span className="opacity-0 group-hover:opacity-100 text-gray-400" title="Copy column">📋</span>
                                        </div>
                                    </th>
                                    <th scope="col" className="px-4 py-3 border-b border-gray-200 group cursor-pointer hover:bg-gray-100" onClick={() => copyColumn('name', 'Properties')}>
                                        <div className="flex items-center gap-2">
                                            Property
                                            <span className="opacity-0 group-hover:opacity-100 text-gray-400" title="Copy column">📋</span>
                                        </div>
                                    </th>
                                    <th scope="col" className="px-4 py-3 border-b border-gray-200 w-24 group cursor-pointer hover:bg-gray-100" onClick={() => copyColumn('type', 'Types')}>
                                        <div className="flex items-center gap-2">
                                            Type
                                            <span className="opacity-0 group-hover:opacity-100 text-gray-400" title="Copy column">📋</span>
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {parsedFields.length === 0 ? (
                                    <tr>
                                        <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                                            No fields extracted.
                                        </td>
                                    </tr>
                                ) : (
                                    parsedFields.map((field, index) => (
                                        <tr key={index} className="bg-white border-b border-gray-100 hover:bg-gray-50">
                                            <td className="px-4 py-2 font-medium break-words max-w-[200px]">
                                                {field.description || <span className="text-gray-300 italic">No description</span>}
                                            </td>
                                            <td className="px-4 py-2 font-mono text-primary">
                                                {field.name}
                                            </td>
                                            <td className="px-4 py-2 font-mono text-gray-500 text-xs">
                                                {field.type}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}

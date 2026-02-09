
import { useState, useMemo } from 'react';
import { parseJavaClass } from '../utils/javaParser';
import { invoke } from '@tauri-apps/api/tauri';
import { Mermaid } from './Mermaid';

interface MethodNode {
    name: string;
    range: [number, number];
}

interface CallGraph {
    nodes: Record<string, MethodNode>;
    calls: Record<string, string[]>;
}

// Recursive component to display the tree
const CallGraphNode = ({ 
    method, 
    graph, 
    path,
    indent = 0 
}: { 
    method: string, 
    graph: CallGraph, 
    path: Set<string>,
    indent?: number 
}) => {
    const isRecursive = path.has(method);
    const children = graph.calls[method] || [];
    const hasChildren = children.length > 0;

    // Create a new path for children to track their own recursion stack
    const newPath = new Set(path);
    newPath.add(method);

    return (
        <div style={{ marginLeft: indent * 20 }} className="font-mono text-sm">
            <div className={`flex items-center gap-1 ${isRecursive ? 'text-red-500 font-bold' : 'text-gray-800'}`}>
                <span>{method}</span>
                {isRecursive && <span className="text-xs italic">(recursive)</span>}
            </div>
            {!isRecursive && hasChildren && (
                <div className="border-l border-gray-300 ml-1 pl-1">
                    {children.map((child, idx) => (
                        <CallGraphNode 
                            key={`${method}-${child}-${idx}`} 
                            method={child} 
                            graph={graph} 
                            path={newPath}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export function JavaParserTab() {
    const [mode, setMode] = useState<'properties' | 'graph'>('properties');
    const [sourceCode, setSourceCode] = useState('');
    const [notification, setNotification] = useState<string | null>(null);
    
    // Existing Property logic
    const parsedFields = useMemo(() => {
        if (mode === 'properties') {
            return parseJavaClass(sourceCode);
        }
        return [];
    }, [sourceCode, mode]);

    // New Graph logic
    const [graphData, setGraphData] = useState<CallGraph | null>(null);
    const [mermaidGraph, setMermaidGraph] = useState<string>('');
    const [graphError, setGraphError] = useState<string | null>(null);
    const [loadingGraph, setLoadingGraph] = useState(false);

    const generateGraph = async () => {
        if (!sourceCode.trim()) return;
        setLoadingGraph(true);
        setGraphError(null);
        setGraphData(null);
        setMermaidGraph('');
        try {
            const result = await invoke<CallGraph>('parse_java_graph', { source: sourceCode });
            setGraphData(result);
            
            const mermaid = await invoke<string>('generate_mermaid_graph', { source: sourceCode });
            setMermaidGraph(mermaid);
        } catch (err: any) {
            console.error(err);
            setGraphError(typeof err === 'string' ? err : 'Failed to generate graph');
        } finally {
            setLoadingGraph(false);
        }
    };

    const copyColumn = (key: 'description' | 'name' | 'type', label: string) => {
        if (parsedFields.length === 0) return;
        const text = parsedFields.map(f => f[key]).join('\n');
        navigator.clipboard.writeText(text);
        setNotification(`Copied ${label} to clipboard!`);
        setTimeout(() => setNotification(null), 2000);
    };

    const copyMermaid = () => {
        if (!mermaidGraph) return;
        navigator.clipboard.writeText(mermaidGraph);
        setNotification('Copied Mermaid syntax to clipboard!');
        setTimeout(() => setNotification(null), 2000);
    };

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] gap-4 p-4 relative">
            {notification && (
                <div className="absolute top-4 left-1/2 transform -translate-x-1/2 px-4 py-2 bg-gray-800 text-white text-sm rounded shadow-lg z-50 animate-fade-in-down">
                    {notification}
                </div>
            )}

            {/* Mode Toggle */}
            <div className="flex gap-2 bg-gray-100 p-1 rounded-lg w-fit">
                <button
                    onClick={() => setMode('properties')}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                        mode === 'properties' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    Property Extractor
                </button>
                <button
                    onClick={() => setMode('graph')}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                        mode === 'graph' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    Call Graph Analyzer
                </button>
            </div>

            <div className="flex-1 flex gap-4 min-h-0">
                {/* Input Area (Shared) */}
                <div className="w-1/2 flex flex-col">
                    <label className="font-bold mb-2 text-gray-700">Java Class Source</label>
                    <textarea
                        className="flex-1 p-3 border border-gray-300 rounded resize-none focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm whitespace-pre"
                        value={sourceCode}
                        onChange={(e) => setSourceCode(e.target.value)}
                        placeholder="Paste Java class here..."
                    />
                     {mode === 'graph' && (
                        <button
                            onClick={generateGraph}
                            disabled={loadingGraph || !sourceCode}
                            className="mt-2 bg-primary text-white py-2 px-4 rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
                        >
                            {loadingGraph ? 'Analyzing...' : 'Generate Call Graph'}
                        </button>
                    )}
                </div>

                {/* Output Area */}
                <div className="w-1/2 flex flex-col">
                    {mode === 'properties' ? (
                        <>
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
                        </>
                    ) : (
                        <>
                            <div className="flex justify-between items-center mb-2">
                                <label className="font-bold text-gray-700">Call Graph</label>
                                {graphData && (
                                    <span className="text-gray-500 text-sm">
                                        {Object.keys(graphData.nodes).length} methods found
                                    </span>
                                )} 
                            </div>
                            <div className="flex-1 border border-gray-300 rounded bg-white overflow-auto p-4 flex flex-col gap-4">
                                {graphError && (
                                    <div className="text-red-500 p-2 bg-red-50 rounded">
                                        Error: {graphError}
                                    </div>
                                )}
                                {graphData ? (
                                    <>
                                        {/* Tree View */}
                                        <div className="flex flex-col gap-2">
                                            <h3 className="font-bold text-gray-600 border-b pb-1">Call Hierarchy</h3>
                                            <div className="flex flex-col gap-4 pl-2">
                                                {Object.keys(graphData.nodes).sort().map(method => (
                                                    <div key={method} className="bg-gray-50 p-2 rounded border border-gray-100">
                                                        <CallGraphNode 
                                                            method={method} 
                                                            graph={graphData} 
                                                            path={new Set()} 
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Mermaid Output */}
                                        <div className="flex flex-col gap-2 mt-4">
                                            <div className="flex justify-between items-center border-b pb-1">
                                                <h3 className="font-bold text-gray-600">Flow Diagram (Mermaid)</h3>
                                                <button 
                                                    onClick={copyMermaid}
                                                    className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded text-gray-600 transition-colors"
                                                >
                                                    Copy Syntax
                                                </button>
                                            </div>
                                            <pre className="bg-gray-900 text-gray-100 p-4 rounded text-xs font-mono overflow-auto max-h-[150px]">
                                                {mermaidGraph}
                                            </pre>
                                            
                                            {mermaidGraph && (
                                                <div className="flex flex-col gap-2 mt-2">
                                                    <h3 className="font-bold text-gray-600 border-b pb-1 text-xs">Visual Diagram</h3>
                                                    <Mermaid chart={mermaidGraph} />
                                                </div>
                                            )}

                                            <p className="text-xs text-gray-400 italic mt-2">
                                                Paste above code into <a href="https://mermaid.live" target="_blank" rel="noreferrer" className="underline hover:text-primary">Mermaid Live Editor</a> to visualize.
                                            </p>
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-center text-gray-400 mt-10">
                                        {loadingGraph ? 'Parsing...' : 'Click "Generate Call Graph" to see results.'}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

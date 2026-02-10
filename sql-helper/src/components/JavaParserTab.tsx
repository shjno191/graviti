
import { useState, useMemo } from 'react';
import { parseJavaClass } from '../utils/javaParser';
import { invoke } from '@tauri-apps/api/tauri';
import { Mermaid } from './Mermaid';
import { SourceCodeViewer } from './SourceCodeViewer';
import { useEffect } from 'react';

interface MethodNode {
    name: string;
    range: [number, number];
    modifiers: string[];
    returnType: string;
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
    const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
    const [mermaidGraph, setMermaidGraph] = useState<string>('');
    const [graphError, setGraphError] = useState<string | null>(null);
    const [loadingGraph, setLoadingGraph] = useState(false);
    const [loadingMermaid, setLoadingMermaid] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [showModal, setShowModal] = useState(false);
    const [highlightOffset, setHighlightOffset] = useState<number | null>(null);

    // Setup global click handler for Mermaid diagram nodes
    // This handler receives click events from the Mermaid diagram and scrolls to the corresponding source code
    useEffect(() => {
        (window as any).onNodeClick = (id: string) => {
            console.log('[JavaParserTab] Node clicked:', id);

            // Extract byte offset from node ID
            // Expected format: "offset-<byteOffset>" (e.g., "offset-1234")
            if (id.startsWith('offset-')) {
                const offsetStr = id.split('-')[1];
                const offset = parseInt(offsetStr);

                if (isNaN(offset)) {
                    console.warn(`[JavaParserTab] Invalid offset value in node ID: ${id}`);
                    return;
                }

                if (offset < 0) {
                    console.warn(`[JavaParserTab] Negative offset in node ID: ${id}`);
                    return;
                }

                console.log(`[JavaParserTab] Scrolling to offset ${offset}`);
                // Reset to trigger effect even if same offset clicked twice
                setHighlightOffset(null);
                setTimeout(() => setHighlightOffset(offset), 0);
            } else {
                console.warn(`[JavaParserTab] Unexpected node ID format: ${id}. Expected format: offset-<number>`);
            }
        };

        return () => {
            delete (window as any).onNodeClick;
        };
    }, []);

    const generateGraph = async () => {
        if (!sourceCode.trim()) return;
        setLoadingGraph(true);
        setGraphError(null);
        setGraphData(null);
        setSelectedMethod(null);
        setMermaidGraph('');
        setZoom(1);
        try {
            const result = await invoke<CallGraph>('parse_java_graph', { source: sourceCode });
            setGraphData(result);
        } catch (err: any) {
            console.error(err);
            setGraphError(typeof err === 'string' ? err : 'Failed to parse graph structure');
        } finally {
            setLoadingGraph(false);
        }
    };

    const selectMethod = async (methodName: string) => {
        setSelectedMethod(methodName);
        setLoadingMermaid(true);
        setMermaidGraph('');
        setZoom(1);
        try {
            const mermaid = await invoke<string>('generate_mermaid_graph', { 
                source: sourceCode, 
                methodName: methodName 
            });
            setMermaidGraph(mermaid);
        } catch (err: any) {
            console.error(err);
            setNotification(`Failed to generate diagram for ${methodName}`);
        } finally {
            setLoadingMermaid(false);
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

    const openModal = () => {
        if (!selectedMethod || !mermaidGraph) {
            setNotification('Please select a method first');
            setTimeout(() => setNotification(null), 2000);
            return;
        }
        setShowModal(true);
        setZoom(1);
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
                                <label className="font-bold text-gray-700">Call Graph Analyzer</label>
                                {graphData && (
                                    <span className="text-gray-500 text-sm">
                                        {Object.keys(graphData.nodes).length} methods parsed
                                    </span>
                                )} 
                            </div>
                            <div className="flex-1 border border-gray-300 rounded bg-white overflow-hidden flex min-h-0">
                                {graphData ? (
                                    <>
                                        {/* Left Sidebar: Method List */}
                                        <div className="w-1/3 border-r border-gray-200 flex flex-col min-h-0">
                                            <div className="p-2 bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                                Public & Protected Methods
                                            </div>
                                            <div className="flex-1 overflow-auto p-1">
                                                {Object.values(graphData.nodes)
                                                    .filter(node => node.modifiers.includes('public') || node.modifiers.includes('protected'))
                                                    .sort((a, b) => a.name.localeCompare(b.name))
                                                    .map(node => (
                                                        <button
                                                            key={node.name}
                                                            onClick={() => selectMethod(node.name)}
                                                            className={`w-full text-left p-2 rounded text-sm mb-1 transition-all flex flex-col gap-1 border ${
                                                                selectedMethod === node.name 
                                                                    ? 'bg-primary/10 text-primary border-primary/20 shadow-sm' 
                                                                    : 'hover:bg-gray-100 text-gray-700 border-transparent hover:border-gray-200'
                                                            }`}
                                                        >
                                                            <div className="flex justify-between items-start w-full">
                                                                <div className="font-mono font-bold truncate pr-2" title={node.name}>
                                                                    {node.name}
                                                                </div>
                                                                <span className="text-[10px] text-gray-400 font-mono shrink-0">
                                                                    {node.returnType || 'void'}
                                                                </span>
                                                            </div>
                                                            <div className="flex gap-1 items-center">
                                                                {node.modifiers.map(m => (
                                                                    <span key={m} className={`text-[9px] px-1 rounded-sm uppercase font-bold tracking-tighter ${
                                                                        m === 'public' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                                                                    }`}>
                                                                        {m}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </button>
                                                    ))}
                                            </div>
                                        </div>

                                        {/* Right Content: Graph View */}
                                        <div className="flex-1 flex flex-col min-h-0 bg-gray-50/30">
                                            {selectedMethod ? (
                                                <div className="flex-1 flex flex-col p-4 overflow-auto min-h-0 gap-4">
                                                    <div className="flex justify-between items-center border-b border-gray-200 pb-2">
                                                        <div className="flex flex-col">
                                                            <h3 className="font-bold text-gray-800">Flow: {selectedMethod}</h3>
                                                            {loadingMermaid && <div className="text-[10px] text-primary animate-pulse">Generating...</div>}
                                                        </div>
                                                        <div className="flex gap-2 items-center">
                                                            {/* Zoom Controls */}
                                                            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded p-0.5 shadow-sm mr-2">
                                                                <button 
                                                                    onClick={() => setZoom(z => Math.max(0.2, z - 0.1))}
                                                                    className="p-1 hover:bg-gray-100 rounded text-gray-500"
                                                                    title="Zoom Out"
                                                                >
                                                                    ➖
                                                                </button>
                                                                <span className="text-[10px] font-mono min-w-[40px] text-center">
                                                                    {Math.round(zoom * 100)}%
                                                                </span>
                                                                <button 
                                                                    onClick={() => setZoom(z => Math.min(3, z + 0.1))}
                                                                    className="p-1 hover:bg-gray-100 rounded text-gray-500"
                                                                    title="Zoom In"
                                                                >
                                                                    ➕
                                                                </button>
                                                                <button 
                                                                    onClick={() => setZoom(1)}
                                                                    className="p-1 hover:bg-gray-100 rounded text-xs text-gray-400"
                                                                    title="Reset Zoom"
                                                                >
                                                                    ↺
                                                                </button>
                                                            </div>
                                                            <button 
                                                                onClick={openModal}
                                                                disabled={!mermaidGraph}
                                                                className="text-xs bg-primary/10 border border-primary/20 hover:bg-primary/20 px-2 py-1 rounded text-primary transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1"
                                                            >
                                                                <span>🔍</span> Enlarge
                                                            </button>
                                                            <button 
                                                                onClick={copyMermaid}
                                                                disabled={!mermaidGraph}
                                                                className="text-xs bg-white border border-gray-200 hover:bg-gray-50 px-2 py-1 rounded text-gray-600 transition-colors shadow-sm disabled:opacity-50"
                                                            >
                                                                Copy Mermaid
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {loadingMermaid ? (
                                                        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-2">
                                                            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                                                            <span className="text-sm">Generating Flow Diagram...</span>
                                                        </div>
                                                    ) : mermaidGraph ? (
                                                        <div className="flex flex-col gap-6 h-full min-h-0">
                                                            <div className="flex-1 flex gap-4 min-h-0">
                                                                {/* Graph Panel */}
                                                                <div className="flex-[2] bg-white rounded border border-gray-200 shadow-inner overflow-auto relative flex flex-col min-h-0">
                                                                    <div
                                                                        style={{
                                                                            transform: `scale(${zoom})`,
                                                                            transformOrigin: 'top left',
                                                                            transition: 'transform 0.1s ease-out'
                                                                        }}
                                                                        className="p-4 w-max h-max"
                                                                    >
                                                                        <Mermaid chart={mermaidGraph} />
                                                                    </div>
                                                                </div>

                                                                {/* Source View Panel */}
                                                                <div className="flex-1 flex flex-col min-h-0">
                                                                    <div className="text-[10px] font-bold text-gray-400 uppercase mb-1 flex justify-between items-center">
                                                                        <span>Source Context</span>
                                                                        <span className="text-primary italic normal-case">Click nodes to scroll</span>
                                                                    </div>
                                                                    <SourceCodeViewer 
                                                                        source={sourceCode} 
                                                                        highlightOffset={highlightOffset} 
                                                                    />
                                                                </div>
                                                            </div>

                                                            <div className="shrink-0">
                                                                <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Mermaid Syntax</h4>
                                                                <pre className="bg-gray-900 text-gray-100 p-3 rounded text-[10px] font-mono overflow-auto max-h-[100px]">
                                                                    {mermaidGraph}
                                                                </pre>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex-1 flex items-center justify-center text-gray-400 italic text-sm">
                                                            No diagram available for this method.
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
                                                    <div className="text-4xl">📊</div>
                                                    <div className="text-sm">Select a method from the list to view its flow diagram.</div>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-4">
                                        {graphError ? (
                                            <div className="text-red-500 bg-red-50 p-4 rounded border border-red-100 max-w-md text-center">
                                                <div className="font-bold mb-1">Error Parsing Logic</div>
                                                <div className="text-xs">{graphError}</div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="text-5xl opacity-20">📂</div>
                                                <div className="text-sm">
                                                    {loadingGraph ? 'Analyzing Class Structure...' : 'Paste source code and click "Generate Call Graph"'}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
            {/* Modal Dialog */}
            {showModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-8">
                    <div className="bg-white w-full h-full rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                        <header className="bg-gray-800 text-white p-4 flex justify-between items-center shrink-0">
                            <div className="flex flex-col">
                                <h1 className="text-lg font-bold">Flow: {selectedMethod}</h1>
                                <span className="text-xs text-gray-400">Modal Viewer</span>
                            </div>
                            
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-1 bg-gray-700 rounded p-1 shadow-inner">
                                    <button 
                                        onClick={() => setZoom(z => Math.max(0.1, z - 0.1))}
                                        className="p-1 hover:bg-gray-600 rounded text-gray-100"
                                        title="Zoom Out"
                                    >
                                        ➖
                                    </button>
                                    <span className="text-xs font-mono min-w-[50px] text-center text-gray-100">
                                        {Math.round(zoom * 100)}%
                                    </span>
                                    <button 
                                        onClick={() => setZoom(z => Math.min(5, z + 0.1))}
                                        className="p-1 hover:bg-gray-600 rounded text-gray-100"
                                        title="Zoom In"
                                    >
                                        ➕
                                    </button>
                                    <button 
                                        onClick={() => setZoom(1)}
                                        className="p-1 hover:bg-gray-600 rounded text-xs text-gray-400"
                                        title="Reset Zoom"
                                    >
                                        ↺
                                    </button>
                                </div>
                                <button 
                                    onClick={() => setShowModal(false)}
                                    className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-md text-sm font-bold transition-colors"
                                >
                                    Close
                                </button>
                            </div>
                        </header>

                        <main className="flex-1 overflow-hidden bg-gray-50 flex min-h-0">
                            <div className="flex-1 flex gap-4 p-6 min-h-0">
                                {/* Graph Panel */}
                                <div className="flex-[2] bg-white rounded border border-gray-200 shadow-inner overflow-auto relative flex flex-col min-h-0">
                                    <div
                                        style={{
                                            transform: `scale(${zoom})`,
                                            transformOrigin: 'top left',
                                            transition: 'transform 0.1s ease-out'
                                        }}
                                        className="p-4 w-max h-max"
                                    >
                                        <Mermaid chart={mermaidGraph} />
                                    </div>
                                </div>

                                {/* Source View Panel */}
                                <div className="flex-1 flex flex-col min-h-0">
                                    <div className="text-[10px] font-bold text-gray-500 uppercase mb-2 flex justify-between items-center px-1">
                                        <span>Source Reference</span>
                                        <span className="text-primary animate-pulse normal-case">Linked to diagram</span>
                                    </div>
                                    <SourceCodeViewer 
                                        source={sourceCode} 
                                        highlightOffset={highlightOffset} 
                                    />
                                </div>
                            </div>
                        </main>
                        
                        <footer className="bg-gray-50 border-t border-gray-200 p-3 text-xs text-gray-400 text-center shrink-0">
                            Use the controls in the top right to zoom. Press ESC or click Close to return.
                        </footer>
                    </div>
                </div>
            )}
        </div>
    );
}

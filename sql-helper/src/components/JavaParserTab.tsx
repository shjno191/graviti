import React, { useState, useMemo, useDeferredValue } from 'react';
import { parseJavaClass } from '../utils/javaParser';
import { useAppStore } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { Mermaid } from './Mermaid';

function analyzeAstToMap(sourceCode: string): Map<string, Set<string>> {
    const callMap = new Map<string, Set<string>>();

    // Bước 0: Làm sạch source code (Bỏ comment và nội dung chuỗi)
    // Để tránh regex hoặc đếm ngoặc nhọn bị sai khi gặp code mồi trong comment/string.
    let cleanCode = sourceCode;

    // Xóa block comments /* ... */
    // Using RegExp with [\s\S] to match across newlines
    cleanCode = cleanCode.replace(/\/\*[\s\S]*?\*\//g, '');

    // Xóa line comments // ...
    cleanCode = cleanCode.replace(/\/\/.*/g, '');

    // Thay thế nội dung chuỗi "..." và char '...' thành chuỗi rỗng tĩnh để không chứa { } 
    // Regex này bắt chuỗi có xử lý escape character
    cleanCode = cleanCode.replace(/"(?:[^"\\]|\\.)*"/g, '""');
    cleanCode = cleanCode.replace(/'(?:[^'\\]|\\.)*'/g, "''");

    // Bước 1: Tìm các hàm nội bộ trong file
    // Cải tiến regex để an toàn hơn và xử lý các generic bounds, mảng, etc.
    const methodDeclRegex = /(?:(?:public|private|protected|static|final|native|synchronized|abstract|transient)\s+)*(?:[\w<>,\[\]]+\s+)*([a-zA-Z_$][\w$]*)\s*\([^)]*\)\s*(?:throws\s+[a-zA-Z_$,\s]+)?\s*\{/g;

    // Bỏ qua các từ khóa điều khiển luồng bị trùng mẫu
    const controlFlow = new Set(["if", "for", "while", "catch", "switch", "synchronized", "return", "new", "super", "this", "else", "try", "do"]);

    interface InternalMethod {
        name: string;
        bodyStartIdx: number;
        bodyContent: string;
    }

    const internalMethods: InternalMethod[] = [];
    let match;

    while ((match = methodDeclRegex.exec(cleanCode)) !== null) {
        const methodName = match[1];
        if (controlFlow.has(methodName)) continue;

        // match.index là vị trí bắt đầu
        // match[0].length là độ dài match (ký tự cuối cùng là '{')
        const openBraceIdx = match.index + match[0].length - 1;

        internalMethods.push({
            name: methodName,
            bodyStartIdx: openBraceIdx,
            bodyContent: ''
        });
    }

    // Bước 2: Lấy body của hàm thông qua đếm ngoặc nhọn trên cleanCode
    for (const method of internalMethods) {
        let braceCount = 0;
        let bodyEndIdx = method.bodyStartIdx;

        for (let i = method.bodyStartIdx; i < cleanCode.length; i++) {
            const char = cleanCode[i];

            if (char === '{') {
                braceCount++;
            } else if (char === '}') {
                braceCount--;
                if (braceCount === 0) {
                    bodyEndIdx = i;
                    break;
                }
            }
        }

        method.bodyContent = cleanCode.substring(method.bodyStartIdx + 1, bodyEndIdx);
    }

    // Lấy tập hợp tên hàm nội bộ để map nhanh
    const internalMethodNames = new Set(internalMethods.map(m => m.name));

    // Bước 3 & Bước 4: Tìm lời gọi hàm và Map quan hệ
    const callRegex = /([a-zA-Z_$][\w$]*)\s*\(/g;

    for (const method of internalMethods) {
        // Tùy chọn: Không vẽ các hàm Getter/Setter lớn làm Root Point rác
        const callerName = method.name;
        if (callerName.length > 3 && (callerName.startsWith("get") || callerName.startsWith("set"))) continue;
        if (callerName.length > 2 && callerName.startsWith("is") && callerName.charAt(2) === callerName.charAt(2).toUpperCase()) continue;

        if (!callMap.has(callerName)) {
            callMap.set(callerName, new Set());
        }

        const body = method.bodyContent;
        let callMatch;
        callRegex.lastIndex = 0; // Reset regex

        while ((callMatch = callRegex.exec(body)) !== null) {
            const calleeName = callMatch[1];

            if (internalMethodNames.has(calleeName) && calleeName !== callerName) {
                // Lọc bỏ phương thức Getter/Setter mờ nhạt
                if (calleeName.length > 3 && (calleeName.startsWith("get") || calleeName.startsWith("set"))) continue;
                if (calleeName.length > 2 && calleeName.startsWith("is") && calleeName.charAt(2) === calleeName.charAt(2).toUpperCase()) continue;

                callMap.get(callerName)!.add(calleeName);
            }
        }

        // Dọn dẹp nếu hàm caller không gọi ai thì xóa đi cho đồ thị đỡ rác (ùn cục)
        // Nếu bạn muốn giữ lại hàm đứng 1 mình (independent node), comment dòng dưới
        if (callMap.get(callerName)?.size === 0) {
            callMap.delete(callerName);
        }
    }

    return callMap;
}

function generateMermaidSyntax(callMap: Map<string, Set<string>>): string {
    if (callMap.size === 0) return "graph TD;\n    No_Internal_Calls_Found;";

    let syntax = "graph TD;\n";
    let hasEdges = false;

    callMap.forEach((callees, caller) => {
        callees.forEach(callee => {
            const safeCallerId = "node_" + caller.replace(/[^a-zA-Z0-9_]/g, "_");
            const safeCalleeId = "node_" + callee.replace(/[^a-zA-Z0-9_]/g, "_");
            syntax += `    ${safeCallerId}["${caller}"] --> ${safeCalleeId}["${callee}"];\n`;
            hasEdges = true;
        });
    });

    if (!hasEdges) return "graph TD;\n    No_Internal_Calls_Found;";
    return syntax;
}

const JavaParserTab: React.FC = React.memo(() => {
    const {
        sourceCode, setSourceCode,
        searchTerm, setSearchTerm,
        mermaidResult, setMermaidResult,
        isLoadingAI, setIsLoadingAI,
        javaParserAutoAnalyze
    } = useAppStore(useShallow(state => ({
        sourceCode: state.javaParserSource,
        setSourceCode: state.setJavaParserSource,
        searchTerm: state.javaParserSearch,
        setSearchTerm: state.setJavaParserSearch,
        mermaidResult: state.javaParserMermaid,
        setMermaidResult: state.setJavaParserMermaid,
        isLoadingAI: state.javaParserIsLoadingAI,
        setIsLoadingAI: state.setJavaParserIsLoadingAI,
        javaParserAutoAnalyze: state.javaParserAutoAnalyze
    })));
    const [notification, setNotification] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'properties' | 'mermaid'>('properties');
    const [analyzedSourceCode, setAnalyzedSourceCode] = useState(sourceCode);

    const deferredSearch = useDeferredValue(searchTerm);

    React.useEffect(() => {
        if (javaParserAutoAnalyze) {
            setAnalyzedSourceCode(sourceCode);
        }
    }, [sourceCode, javaParserAutoAnalyze]);

    // Existing Property logic
    const parsedFields = useMemo(() => {
        return parseJavaClass(analyzedSourceCode);
    }, [analyzedSourceCode]);

    const filteredFields = useMemo(() => {
        if (!deferredSearch) return parsedFields;
        const term = deferredSearch.toLowerCase();
        return parsedFields.filter((f: any) =>
            (f.name || '').toLowerCase().includes(term) ||
            (f.type || '').toLowerCase().includes(term) ||
            (f.description || '').toLowerCase().includes(term)
        );
    }, [parsedFields, deferredSearch]);

    const handleAnalyze = () => {
        setAnalyzedSourceCode(sourceCode);
        setViewMode('properties');
        setNotification('Parsed properties from code.');
        setTimeout(() => setNotification(null), 2000);
    };

    const handleGenerateMermaid = async () => {
        if (!sourceCode.trim()) return;

        setIsLoadingAI(true);
        try {
            // Wait slightly so the UI shows 'Loading...' before acorn blocks thread
            await new Promise(resolve => setTimeout(resolve, 50));

            const callMap = analyzeAstToMap(sourceCode);
            const mermaidScript = generateMermaidSyntax(callMap);
            setMermaidResult(mermaidScript);

            setNotification('Graph generated successfully!');
            setTimeout(() => setNotification(null), 3000);
        } catch (error: any) {
            console.error('Error parsing AST:', error);
            setNotification('Syntax Error: Make sure your JS/TS code is valid.');
            setTimeout(() => setNotification(null), 3000);
        } finally {
            setIsLoadingAI(false);
            setViewMode('mermaid');
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-80px)] gap-4 p-4 relative">
            {notification && (
                <div className="absolute top-4 left-1/2 transform -translate-x-1/2 px-4 py-2 bg-gray-800 text-white text-sm rounded shadow-lg z-50 animate-fade-in-down">
                    {notification}
                </div>
            )}

            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex flex-wrap items-center gap-4">
                <div className="flex-1 flex items-center relative group">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-hover:text-indigo-500 transition-colors">🔍</span>
                    <input
                        type="text"
                        placeholder="Search Properties..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400 shadow-inner font-bold text-gray-800 transition-all focus:bg-white"
                    />
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => {
                            setSourceCode('');
                            setAnalyzedSourceCode('');
                            setSearchTerm('');
                            setMermaidResult('');
                        }}
                        className="px-4 py-2 bg-red-50 text-red-500 rounded-xl text-xs font-black hover:bg-red-100 border border-red-200 transition-all active:scale-95 shadow-sm flex items-center gap-1"
                    >
                        🗑️ CLEAR ALL
                    </button>
                </div>
            </div>

            <div className="flex-1 flex gap-4 overflow-hidden">
                {/* LLEFT PANE: INPUT */}
                <div className="w-1/3 flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-gray-100 flex justify-between items-center">
                        <span>JAVA SOURCE CODE <span className="text-indigo-400">INPUT</span></span>
                    </div>
                    <textarea
                        className="flex-1 p-4 font-mono text-sm outline-none resize-none bg-transparent"
                        placeholder="Paste your Java class source here..."
                        value={sourceCode}
                        onChange={e => setSourceCode(e.target.value)}
                    />
                </div>

                {/* RIGHT PANE: RESULT TABS */}
                <div className="flex-1 flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    {/* TABS HEADER */}
                    <div className="flex items-center bg-gray-50 border-b border-gray-100">
                        <button
                            onClick={() => setViewMode('properties')}
                            className={`flex-1 py-3 text-xs font-black uppercase tracking-widest transition-colors ${viewMode === 'properties' ? 'text-indigo-600 bg-white border-b-2 border-indigo-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                        >
                            EXTRACTED PROPERTIES
                        </button>
                        <button
                            onClick={() => setViewMode('mermaid')}
                            className={`flex-1 py-3 text-xs font-black uppercase tracking-widest transition-colors ${viewMode === 'mermaid' ? 'text-amber-600 bg-white border-b-2 border-amber-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                        >
                            FUNCTION LOGIC (MERMAID)
                        </button>
                    </div>

                    {/* TAB CONTENT: PROPERTIES */}
                    {viewMode === 'properties' && (
                        <div className="flex-1 flex flex-col overflow-hidden relative">
                            <div className="absolute top-0 left-0 right-0 bg-white/80 backdrop-blur-md px-4 py-2 flex justify-between items-center border-b border-gray-50 z-10 shadow-sm">
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Variables & Types</span>
                                    {!javaParserAutoAnalyze && (
                                        <button
                                            onClick={handleAnalyze}
                                            className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-md text-[9px] font-black tracking-widest uppercase hover:bg-indigo-100 border border-indigo-200 transition-all active:scale-95"
                                        >
                                            ⚡ ANALYZE
                                        </button>
                                    )}
                                </div>
                                <span className="text-indigo-500 font-bold text-xs bg-indigo-50 px-2 py-1 rounded-md">{filteredFields.length} MATCHES</span>
                            </div>
                            <div className="flex-1 overflow-auto pt-10">
                                <table className="w-full text-left border-collapse">
                                    <thead className="sticky top-0 bg-white z-10 hidden">
                                        <tr>
                                            <th>Description</th>
                                            <th>Name</th>
                                            <th>Type</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredFields.length === 0 ? (
                                            <tr>
                                                <td colSpan={3} className="px-4 py-20 text-center text-xs text-gray-300 font-bold italic uppercase tracking-widest">
                                                    No fields extracted
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredFields.map((field: any, idx: number) => (
                                                <tr key={idx} className="hover:bg-indigo-50/30 transition-colors group">
                                                    <td className="px-5 py-3 text-xs font-bold text-gray-600 border-b border-gray-50">
                                                        {field.description}
                                                    </td>
                                                    <td className="px-5 py-3 font-mono text-indigo-600 font-black text-[13px] border-b border-gray-50">
                                                        {field.name}
                                                    </td>
                                                    <td className="px-5 py-3 font-mono text-gray-500 text-xs border-b border-gray-50">
                                                        {field.type}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* TAB CONTENT: MERMAID */}
                    {viewMode === 'mermaid' && (
                        <div className="flex-1 flex flex-col overflow-hidden relative">
                            <div className="absolute top-0 left-0 right-0 bg-white/80 backdrop-blur-md px-4 py-2 flex justify-between items-center border-b border-gray-50 z-10 shadow-sm">
                                <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">AI Logic Diagram</span>
                                <div className="flex items-center gap-2">
                                    {mermaidResult && (
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(mermaidResult);
                                                setNotification('Copied Mermaid syntax!');
                                                setTimeout(() => setNotification(null), 2000);
                                            }}
                                            className="px-3 py-1.5 bg-amber-50 text-amber-600 rounded-lg text-[9px] font-black tracking-widest uppercase hover:bg-amber-100 border border-amber-200 transition-colors shadow-sm"
                                        >
                                            📋 COPY M-SYNTAX
                                        </button>
                                    )}
                                    <button
                                        onClick={handleGenerateMermaid}
                                        disabled={isLoadingAI}
                                        className={`px-4 py-1.5 rounded-lg text-[10px] font-black tracking-widest uppercase transition-all shadow-md ${isLoadingAI ? 'bg-amber-100 text-amber-400' : 'bg-amber-600 text-white hover:bg-amber-700 active:scale-95'}`}
                                    >
                                        {isLoadingAI ? 'ANALYZING...' : '🪄 GENERATE DIAGRAM'}
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-auto pt-12 p-6 flex flex-col bg-gray-50/50">
                                {mermaidResult ? (
                                    <div className="flex-1 overflow-auto p-4 pt-2 bg-amber-50/10 rounded-2xl border border-amber-100 shadow-inner">
                                        <Mermaid chart={mermaidResult} />
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center text-center opacity-70">
                                        <div className="w-16 h-16 bg-amber-100 text-amber-500 rounded-full flex items-center justify-center text-3xl mb-4 shadow-inner">
                                            🪄
                                        </div>
                                        <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest mb-2">No Diagram Generated</h3>
                                        <p className="text-xs text-gray-500 font-semibold max-w-sm leading-relaxed">
                                            Click the <strong>GENERATE DIAGRAM</strong> button in the header to run Regex parser and trace internal function relationships locally.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

export default JavaParserTab;

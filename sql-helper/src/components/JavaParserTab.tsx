import React, { useState, useMemo, useDeferredValue } from 'react';
import { parseJavaClass } from '../utils/javaParser';
import { useAppStore } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { Mermaid } from './Mermaid';

function truncateLabel(str: string, max: number = 20): string {
    if (!str) return "";
    let cleanStr = str.replace(/\n|\r/g, " ").trim();
    if (cleanStr.length > max) {
        return cleanStr.substring(0, max - 3) + "...";
    }
    return cleanStr;
}

interface CallNode {
    callee: string;
    label: string;
}

function analyzeAstToMap(sourceCode: string): Map<string, CallNode[]> {
    const callMap = new Map<string, CallNode[]>();

    // 1. Lọc rác (Blacklist Keywords)
    const blacklistRegex = /^(get|set|is|clear|toString|log|warn|info|error|back|confirm|equals)/i;

    // Bước 0: Làm sạch nội dung comment và chuỗi
    let cleanCode = sourceCode;
    cleanCode = cleanCode.replace(/\/\*[\s\S]*?\*\//g, '');
    cleanCode = cleanCode.replace(/\/\/.*/g, '');
    cleanCode = cleanCode.replace(/"(?:[^"\\]|\\.)*"/g, '""');
    cleanCode = cleanCode.replace(/'(?:[^'\\]|\\.)*'/g, "''");

    // 2. Trích xuất hàm nội bộ (Lấy tên và Body)
    const methodDeclRegex = /(?:(?:public|private|protected|static|final|native|synchronized|abstract|transient)\s+)*(?:[\w<>,\[\]]+\s+)*([a-zA-Z_$][\w$]*)\s*\([^)]*\)\s*(?:throws\s+[a-zA-Z_$,\s]+)?\s*\{/g;
    const controlKeywords = new Set(["if", "for", "while", "catch", "switch", "synchronized", "return", "new", "super", "this", "else", "try", "do"]);

    interface InternalMethod {
        name: string;
        bodyStartIdx: number;
        bodyContent: string;
    }

    const internalMethods: InternalMethod[] = [];
    let match;

    while ((match = methodDeclRegex.exec(cleanCode)) !== null) {
        const methodName = match[1];

        // Loại bỏ từ khóa luồng điều khiển và các hàm blacklist
        if (controlKeywords.has(methodName) || blacklistRegex.test(methodName)) continue;

        const openBraceIdx = match.index + match[0].length - 1;

        internalMethods.push({
            name: methodName,
            bodyStartIdx: openBraceIdx,
            bodyContent: ''
        });
    }

    // Đếm ngoặc nhọn { }
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

    const methodNamesSet = new Set(internalMethods.map(m => m.name));

    // 3. Tìm quan hệ gọi hàm (Caller -> Callee)
    const callRegex = /([a-zA-Z_$][\w$]*)\s*\(/g;

    for (const method of internalMethods) {
        const callerName = method.name;
        if (!callMap.has(callerName)) callMap.set(callerName, []);

        const strBody = method.bodyContent;
        let callMatch;
        callRegex.lastIndex = 0;

        // Gộp các lời gọi trùng lặp: Caller gọi strConver() 45 lần → chỉ 1 mũi tên "×45"
        const calleeTracker = new Map<string, { count: number; firstCond: string }>();

        while ((callMatch = callRegex.exec(strBody)) !== null) {
            const calleeName = callMatch[1];

            // Ràng buộc điều kiện: trong file, không đệ quy, không dính blacklist
            if (methodNamesSet.has(calleeName) && calleeName !== callerName && !blacklistRegex.test(calleeName)) {

                // Trích xuất điều kiện rẽ nhánh (if block)
                let condText = "";
                let i = callMatch.index - 1;
                let openB = 0, closeB = 0, stmtEnded = false;

                while (i > 1) {
                    const char = strBody[i];
                    if (char === '}') closeB++;
                    else if (char === '{') openB++;
                    else if (char === ';' && openB === closeB) stmtEnded = true;

                    if (char === 'f' && strBody[i - 1] === 'i' && /\s|\}/.test(strBody[i - 2])) {
                        const isInside = (openB > closeB) || (openB === closeB && closeB === 0 && !stmtEnded);
                        if (isInside) {
                            let afterIfStart = i + 1;
                            while (afterIfStart < callMatch.index && strBody[afterIfStart] !== '(') afterIfStart++;
                            if (afterIfStart < callMatch.index) {
                                let parenDepth = 0, condEnd = afterIfStart + 1;
                                while (condEnd < callMatch.index) {
                                    if (strBody[condEnd] === '(') parenDepth++;
                                    else if (strBody[condEnd] === ')') {
                                        if (parenDepth === 0) break;
                                        parenDepth--;
                                    }
                                    condEnd++;
                                }
                                condText = strBody.substring(afterIfStart + 1, condEnd);
                            }
                        }
                        break;
                    }
                    if (closeB > openB + 1) break;
                    i--;
                }

                // Gom vào tracker: chỉ giữ lần đầu tiên có điều kiện
                if (!calleeTracker.has(calleeName)) {
                    calleeTracker.set(calleeName, { count: 1, firstCond: condText });
                } else {
                    const existing = calleeTracker.get(calleeName)!;
                    existing.count++;
                    if (!existing.firstCond && condText) {
                        existing.firstCond = condText;
                    }
                }
            }
        }

        // Sinh edge đã gộp nhóm
        let order = 1;
        calleeTracker.forEach(({ count, firstCond }, calleeName) => {
            let edgeLabel = `${order++}`;
            if (firstCond) {
                edgeLabel += `<br/>[${truncateLabel(firstCond, 25)}]`;
            }
            if (count > 1) {
                edgeLabel += ` ×${count}`;
            }
            callMap.get(callerName)!.push({ callee: calleeName, label: edgeLabel });
        });

        // Dọn điểm mù
        if (callMap.get(callerName)?.length === 0) callMap.delete(callerName);
    }

    // === BỘ LỌC LUỒNG CHÍNH (Flow-only filter) ===
    // Bước 1: Xác định các hàm "lá" (leaf) = hàm KHÔNG gọi bất kỳ hàm nội bộ nào khác
    // Ví dụ: strConver, decConver, cutword, intConver, changeDecimal...
    // Những hàm này chỉ là utility nhỏ, không mang ý nghĩa luồng nghiệp vụ
    const callerSet = new Set(callMap.keys());

    // Bước 2: Đếm xem leaf node bị gọi bởi bao nhiêu caller khác nhau
    const calleeRefCount = new Map<string, number>();
    callMap.forEach((edges) => {
        edges.forEach(edge => {
            calleeRefCount.set(edge.callee, (calleeRefCount.get(edge.callee) || 0) + 1);
        });
    });

    // Bước 3: Lọc bỏ leaf node ra khỏi edges
    // Giữ lại leaf node CHỈ KHI nó được gọi bởi <= 1 caller (có thể là hàm quan trọng)
    // Nếu bị gọi bởi >= 2 callers → chắc chắn là utility chung → loại bỏ
    callMap.forEach((edges, caller) => {
        const filtered = edges.filter(edge => {
            const isLeaf = !callerSet.has(edge.callee);
            if (!isLeaf) return true; // Giữ lại nếu callee cũng là caller (có sub-flow)
            const refCount = calleeRefCount.get(edge.callee) || 0;
            return refCount <= 1; // Giữ lại leaf chỉ khi nó unique (gọi bởi 1 hàm duy nhất)
        });
        if (filtered.length === 0) {
            callMap.delete(caller);
        } else {
            callMap.set(caller, filtered);
        }
    });

    return callMap;
}

function generateMermaidSyntax(callMap: Map<string, CallNode[]>): string {
    if (callMap.size === 0) return "graph TD;\n    No_Logical_Flow_Found;";

    // Cấu hình ELK siêu tối ưu cho sơ đồ lưới (Grid-like Diagram)
    // - NETWORK_SIMPLEX & BRANDES_KOEPF: Dàn đều các node để giảm chồng chéo line
    // - ORTHOGONAL: Bẻ góc vuông 90 độ, gọn gàng, không đâm xuyên node
    // - portAlignment: Dãn đều các điểm nối mũi tên (port) để không chụm lại 1 cục
    let syntax = `%%{
  init: {
    "flowchart": {
      "defaultRenderer": "elk",
      "curve": "stepBefore",
      "nodeSpacing": 60,
      "rankSpacing": 100
    },
    "elk": {
      "algorithm": "layered",
      "nodePlacement.strategy": "BRANDES_KOEPF",
      "edgeRouting": "ORTHOGONAL",
      "direction": "RIGHT",
      "spacing.nodeNode": 60,
      "spacing.edgeNode": 40,
      "spacing.edgeEdge": 20,
      "portAlignment.default": "DISTRIBUTED"
    }
  }
}%%\n`;
    syntax += `graph LR;\n\n`;

    const uiLayer: string[] = [];
    const actionLayer: string[] = [];
    const logicLayer: string[] = [];

    // Tự động phân loại Layer cho các hàm 
    const allUniqueNodes = new Set<string>();
    callMap.forEach((callees, caller) => {
        allUniqueNodes.add(caller);
        callees.forEach(c => allUniqueNodes.add(c.callee));
    });

    allUniqueNodes.forEach(nodeName => {
        const lowerName = nodeName.toLowerCase();
        // Cải thiện thuật toán phân cụm chuẩn hơn
        if (/^(show|init|hide|display|gamen|view|render|draw)/i.test(lowerName)) {
            uiLayer.push(nodeName);
        } else if (/^(exec|do|call|process|handle|click|change|update)/i.test(lowerName)) {
            actionLayer.push(nodeName);
        } else {
            logicLayer.push(nodeName);
        }
    });

    // Hàm render Subgraph an toàn
    const renderSubgraph = (layerName: string, title: string, items: string[], bgColor: string, strokeColor: string) => {
        if (items.length === 0) return "";
        let block = `    subgraph ${layerName} ["🛡️ ${title}"]\n`;
        block += `        direction TB\n`; // Bên trong layer xếp từ trên xuống
        block += `        style ${layerName} fill:${bgColor},stroke:${strokeColor},stroke-width:2px,stroke-dasharray: 5 5,rx:10,ry:10\n`;
        items.forEach(node => {
            const safeId = "node_" + node.replace(/[^a-zA-Z0-9_]/g, "_");
            block += `        ${safeId}["${node}()"]\n`;
        });
        block += `    end\n\n`;
        return block;
    };

    syntax += renderSubgraph("UI_Layer", "1. Setup & UI Layer", uiLayer, "#f8fafc", "#cbd5e1");
    syntax += renderSubgraph("Action_Layer", "2. Action Layer", actionLayer, "#f0fdf4", "#86efac");
    syntax += renderSubgraph("Logic_Layer", "3. Logic Layer", logicLayer, "#fefce8", "#fde047");

    // Vẽ mũi tên
    callMap.forEach((callees, caller) => {
        const safeCallerId = "node_" + caller.replace(/[^a-zA-Z0-9_]/g, "_");

        // Tối ưu UI mũi tên nếu node đó vừa là UI vừa gọi Logic (Cross layer)
        callees.forEach(node => {
            const safeCalleeId = "node_" + node.callee.replace(/[^a-zA-Z0-9_]/g, "_");

            if (node.label.trim() === "") {
                syntax += `    ${safeCallerId} --> ${safeCalleeId};\n`;
            } else {
                syntax += `    ${safeCallerId} -->|"${node.label}"| ${safeCalleeId};\n`;
            }
        });
    });

    syntax += `\n    classDef default fill:#ffffff,stroke:#64748b,stroke-width:2px,color:#0f172a,font-family:ui-sans-serif, system-ui,rx:6,ry:6,shadow:1;\n`;

    // Đổ màu class riêng tuỳ Layer (Optional nhưng tạo highlight tốt)
    syntax += `    classDef uiNode fill:#f1f5f9,stroke:#94a3b8;\n`;
    syntax += `    classDef actionNode fill:#dcfce7,stroke:#22c55e;\n`;
    syntax += `    classDef logicNode fill:#fef3c7,stroke:#eab308;\n\n`;

    if (uiLayer.length > 0) syntax += `    class ${uiLayer.map(n => "node_" + n.replace(/[^a-zA-Z0-9_]/g, "_")).join(",")} uiNode;\n`;
    if (actionLayer.length > 0) syntax += `    class ${actionLayer.map(n => "node_" + n.replace(/[^a-zA-Z0-9_]/g, "_")).join(",")} actionNode;\n`;
    if (logicLayer.length > 0) syntax += `    class ${logicLayer.map(n => "node_" + n.replace(/[^a-zA-Z0-9_]/g, "_")).join(",")} logicNode;\n`;

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
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);

    // Handler: khi click vào node trên đồ thị Mermaid, nhảy tới vị trí hàm trong textarea
    const handleNodeClick = React.useCallback((nodeName: string) => {
        const ta = textareaRef.current;
        if (!ta || !nodeName) return;

        // Tìm vị trí khai báo hàm trong source code (dạng: methodName()
        const searchPatterns = [
            new RegExp(`\\b${nodeName}\\s*\\(`),
            new RegExp(`\\b${nodeName}\\b`),
        ];

        let matchIdx = -1;
        for (const pattern of searchPatterns) {
            const m = pattern.exec(sourceCode);
            if (m) {
                matchIdx = m.index;
                break;
            }
        }

        if (matchIdx === -1) {
            setNotification(`Function "${nodeName}" not found in source`);
            setTimeout(() => setNotification(null), 2000);
            return;
        }

        // Focus textarea và cuộn đến vị trí
        ta.focus();
        ta.setSelectionRange(matchIdx, matchIdx + nodeName.length);

        // Tính toán dòng để scroll cho đúng
        const textBefore = sourceCode.substring(0, matchIdx);
        const lineNumber = textBefore.split('\n').length;
        const lineHeight = 20; // Ước lượng
        const scrollTop = Math.max((lineNumber - 3) * lineHeight, 0);
        ta.scrollTop = scrollTop;

        setNotification(`Jumped to "${nodeName}"`);
        setTimeout(() => setNotification(null), 2000);
    }, [sourceCode]);

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
                        ref={textareaRef}
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
                                        <Mermaid chart={mermaidResult} onNodeClick={handleNodeClick} />
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

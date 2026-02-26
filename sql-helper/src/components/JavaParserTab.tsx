import React, { useState, useMemo, useDeferredValue } from 'react';
import { parseJavaClass } from '../utils/javaParser';
import { useAppStore } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Mermaid } from './Mermaid';

const JavaParserTab: React.FC = React.memo(() => {
    const {
        sourceCode, setSourceCode,
        searchTerm, setSearchTerm,
        mermaidResult, setMermaidResult,
        isLoadingAI, setIsLoadingAI,
        geminiApiKey
    } = useAppStore(useShallow(state => ({
        sourceCode: state.javaParserSource,
        setSourceCode: state.setJavaParserSource,
        searchTerm: state.javaParserSearch,
        setSearchTerm: state.setJavaParserSearch,
        mermaidResult: state.javaParserMermaid,
        setMermaidResult: state.setJavaParserMermaid,
        isLoadingAI: state.javaParserIsLoadingAI,
        setIsLoadingAI: state.setJavaParserIsLoadingAI,
        geminiApiKey: state.geminiApiKey
    })));
    const [notification, setNotification] = useState<string | null>(null);

    const deferredSearch = useDeferredValue(searchTerm);

    // Existing Property logic
    const parsedFields = useMemo(() => {
        return parseJavaClass(sourceCode);
    }, [sourceCode]);

    const filteredFields = useMemo(() => {
        if (!deferredSearch) return parsedFields;
        const term = deferredSearch.toLowerCase();
        return parsedFields.filter((f: any) =>
            (f.name || '').toLowerCase().includes(term) ||
            (f.type || '').toLowerCase().includes(term) ||
            (f.description || '').toLowerCase().includes(term)
        );
    }, [parsedFields, deferredSearch]);

    const copyColumn = (key: 'description' | 'name' | 'type', label: string) => {
        if (parsedFields.length === 0) return;
        const text = parsedFields.map((f: any) => f[key]).join('\n');
        navigator.clipboard.writeText(text);
        setNotification(`Copied ${label} to clipboard!`);
        setTimeout(() => setNotification(null), 2000);
    };

    const handleGenerateMermaid = async () => {
        if (!sourceCode.trim()) return;
        if (!geminiApiKey) {
            setNotification('Please set Gemini API Key in Settings');
            setTimeout(() => setNotification(null), 3000);
            return;
        }

        setIsLoadingAI(true);
        try {
            const genAI = new GoogleGenerativeAI(geminiApiKey);
            const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

            const prompt = `Bạn là một Kiến trúc sư Phần mềm (Software Architect) xuất sắc. Nhiệm vụ của bạn là đọc đoạn mã nguồn Java tôi cung cấp và chuyển đổi logic của nó thành mã sơ đồ Mermaid (Mermaid.js). Tôi không cần bạn giải thích dài dòng, chỉ cần trả về mã Mermaid nằm trong khối code \\\`\`\`mermaid ... \\\`\`\`.

            Hãy tuân thủ nghiêm ngặt các quy tắc phân tích và trình bày sau đây:
            1. ĐỊNH DẠNG SƠ ĐỒ (Sử dụng Flowchart hoặc Sequence Diagram):
            - Ưu tiên sử dụng Flowchart (\\\`graph TD\\\`) để mô tả luồng logic tổng thể.
            - Nếu source code có quá nhiều class gọi qua lại, hãy dùng Sequence Diagram.

            2. XỬ LÝ NHIỀU HÀM (Multiple Functions):
            - Mỗi hàm \\\`public\\\` (điểm đầu vào) nên được bắt đầu bằng một node riêng.
            - Nếu các hàm hoạt động hoàn toàn độc lập, hãy tách chúng thành các \\\`subgraph\\\` riêng biệt trong cùng một Flowchart.

            3. XỬ LÝ HÀM LỒNG NHAU (Nested Functions / Call Stack):
            - Khi Hàm A (hàm lớn) gọi Hàm B (hàm nhỏ), node gọi hàm trong Hàm A phải trỏ đến một \\\`subgraph\\\` hoặc luồng nhánh đại diện cho Hàm B.

            4. XỬ LÝ LOGIC (If/Else, Loop, Try/Catch):
            - Điều kiện (\\\`if/else\\\`, \\\`switch\\\`): Phải sử dụng node hình thoi \\\`{ }\\\`.
            - Vòng lặp (\\\`for\\\`, \\\`while\\\`): Phải có đường mũi tên quay ngược lại node bắt đầu.
            - Ngoại lệ (\\\`try/catch\\\`): Tạo một nhánh riêng cho lỗi với đường nét đứt.

            5. QUY TẮC CÚ PHÁP MERMAID:
            - Tuyệt đối KHÔNG dùng các ký tự đặc biệt như ngoặc kép (\\\`"\\\`), ngoặc nhọn (\\\`{\\\`, \\\`}\\\`) bên trong text của node mà không có cách ly, vì sẽ làm gãy mã Mermaid. Tránh dùng cặp dấu ngoặc tròn ( ) bên trong text vì đôi khi xung đột cú pháp shape của Mermaid.

            Đây là source code:
            ${sourceCode}`;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            let mermaidCode = text;
            const match = text.match(new RegExp('```mermaid([\\s\\S]*?)```'));
            if (match && match[1]) {
                mermaidCode = match[1].trim();
            } else {
                mermaidCode = text.replace(new RegExp('^```[\\s\\S]*?\\n'), '').replace(new RegExp('```$'), '').trim();
            }

            if (!mermaidCode.includes('graph ') && !mermaidCode.includes('sequenceDiagram')) {
                throw new Error("AI did not return a valid Mermaid diagram syntax.");
            }

            setMermaidResult(mermaidCode);
        } catch (error) {
            console.error('Error generating mermaid:', error);
            setNotification('Error generating mermaid diagram');
            setTimeout(() => setNotification(null), 3000);
        } finally {
            setIsLoadingAI(false);
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
                        onClick={() => copyColumn('description', 'Descriptions')}
                        className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-black hover:bg-indigo-100 border border-indigo-200 transition-all active:scale-95 shadow-sm"
                    >
                        📋 COLS: DESC
                    </button>
                    <button
                        onClick={() => copyColumn('name', 'Names')}
                        className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-black hover:bg-indigo-100 border border-indigo-200 transition-all active:scale-95 shadow-sm"
                    >
                        📋 COLS: NAME
                    </button>
                    <button
                        onClick={() => copyColumn('type', 'Types')}
                        className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-black hover:bg-indigo-100 border border-indigo-200 transition-all active:scale-95 shadow-sm"
                    >
                        📋 COLS: TYPE
                    </button>
                    <button
                        onClick={() => { setSourceCode(''); setSearchTerm(''); setMermaidResult(''); }}
                        className="px-4 py-2 bg-red-50 text-red-500 rounded-xl text-xs font-black hover:bg-red-100 border border-red-200 transition-all active:scale-95 shadow-sm"
                    >
                        🗑️ CLEAR ALL
                    </button>
                    <button
                        onClick={handleGenerateMermaid}
                        disabled={isLoadingAI}
                        className={`px-4 py-2 rounded-xl text-xs font-black transition-all active:scale-95 shadow-lg flex items-center gap-2 ${isLoadingAI ? 'bg-amber-100 text-amber-400' : 'bg-amber-600 text-white hover:bg-amber-700'}`}
                    >
                        {isLoadingAI ? (
                            <><div className="w-3 h-3 border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></div> GENERATING...</>
                        ) : (
                            <>🪄 AI MERMAID</>
                        )}
                    </button>
                </div>
            </div>

            <div className="flex-1 flex gap-4 overflow-hidden">
                <div className="flex-1 flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-gray-100 flex justify-between items-center">
                        <span>JAVA SOURCE CODE</span>
                        <span className="text-indigo-400">INPUT AREA</span>
                    </div>
                    <textarea
                        className="flex-1 p-4 font-mono text-sm outline-none resize-none bg-transparent"
                        placeholder="Paste your Java class source here (DTO/Entity)..."
                        value={sourceCode}
                        onChange={e => setSourceCode(e.target.value)}
                    />
                </div>

                <div className="flex-1 flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-gray-100 flex justify-between items-center">
                        <span>EXTRACTED PROPERTIES</span>
                        <span className="text-indigo-600 font-black">{filteredFields.length} ITEMS</span>
                    </div>
                    <div className="flex-1 overflow-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 bg-white/80 backdrop-blur-md shadow-sm z-10">
                                <tr>
                                    <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Description</th>
                                    <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Name</th>
                                    <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Type</th>
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
                                            <td className="px-4 py-2 text-xs font-bold text-gray-600 border-b border-gray-50">
                                                {field.description}
                                            </td>
                                            <td className="px-4 py-2 font-mono text-indigo-600 font-black text-xs border-b border-gray-50">
                                                {field.name}
                                            </td>
                                            <td className="px-4 py-2 font-mono text-gray-500 text-xs border-b border-gray-50">
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

            {mermaidResult && (
                <div className="flex-1 flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mt-4 min-h-[400px]">
                    <div className="bg-amber-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-amber-600 border-b border-amber-100 flex justify-between items-center">
                        <span>AI GENERATED MERMAID DIAGRAM</span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(mermaidResult);
                                    setNotification('Copied Mermaid syntax!');
                                    setTimeout(() => setNotification(null), 2000);
                                }}
                                className="bg-white px-2 py-1 rounded border border-amber-200 hover:bg-amber-100 transition-colors"
                            >
                                📋 COPY SYNTAX
                            </button>
                            <button onClick={() => setMermaidResult('')} className="text-amber-400 hover:text-amber-600">✕ CLOSE</button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-auto bg-gray-50/30 p-4">
                        <Mermaid chart={mermaidResult} />
                    </div>
                </div>
            )}
        </div>
    );
});

export default JavaParserTab;

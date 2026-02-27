import { useEffect, useState, useRef, useCallback } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'loose',
    maxTextSize: 500000,
    maxEdges: 2000,
});

interface MermaidProps {
    chart: string;
    onNodeClick?: (nodeName: string) => void;
}

export const Mermaid = ({ chart, onNodeClick }: MermaidProps) => {
    const [svg, setSvg] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    const [translate, setTranslate] = useState({ x: 0, y: 0 });
    const isPanning = useRef(false);
    const lastPos = useRef({ x: 0, y: 0 });

    useEffect(() => {
        if (!chart) {
            setSvg('');
            return;
        }

        const renderChart = async () => {
            const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;

            const trap = document.createElement('div');
            trap.style.display = 'none';
            trap.id = id;
            document.body.appendChild(trap);

            try {
                const { svg } = await mermaid.render(id, chart);
                setSvg(svg);
                setError(null);
                setScale(1);
                setTranslate({ x: 0, y: 0 });
            } catch (err: any) {
                console.error("Mermaid Render Error:", err);
                setError(err.message || 'Failed to render diagram');
            } finally {
                if (trap.parentNode) {
                    trap.parentNode.removeChild(trap);
                }
                const leakedBombs = document.querySelectorAll(`[id^="d${id}"], #${id}`);
                leakedBombs.forEach(bomb => bomb.remove());
            }
        };

        renderChart();
    }, [chart]);

    // Gắn sự kiện click lên các node SVG sau khi render
    useEffect(() => {
        if (!svg || !containerRef.current || !onNodeClick) return;

        const container = containerRef.current;
        const nodes = container.querySelectorAll('.node');

        const handleClick = (e: Event) => {
            const nodeEl = (e.currentTarget as HTMLElement);
            const textEl = nodeEl.querySelector('.nodeLabel');
            if (textEl) {
                let funcName = textEl.textContent?.trim() || '';
                funcName = funcName.replace(/\(\)$/, '');
                onNodeClick(funcName);
            }
        };

        nodes.forEach(node => {
            (node as HTMLElement).style.cursor = 'pointer';
            node.addEventListener('click', handleClick);
        });

        return () => {
            nodes.forEach(node => {
                node.removeEventListener('click', handleClick);
            });
        };
    }, [svg, onNodeClick]);

    // Zoom bằng scroll chuột (Ctrl+Scroll hoặc Scroll thường)
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const factor = e.deltaY > 0 ? 0.92 : 1.08;
        setScale(prev => Math.min(Math.max(prev * factor, 0.1), 5));
    }, []);

    // Pan: Kéo chuột trái bình thường để di chuyển (không cần Shift)
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        // Chỉ cần click trái (button 0) hoặc giữa (button 1)
        if (e.button === 0 || e.button === 1) {
            e.preventDefault();
            isPanning.current = true;
            lastPos.current = { x: e.clientX, y: e.clientY };
        }
    }, []);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isPanning.current) return;
        const dx = e.clientX - lastPos.current.x;
        const dy = e.clientY - lastPos.current.y;
        lastPos.current = { x: e.clientX, y: e.clientY };
        setTranslate(prev => ({
            x: prev.x + dx,
            y: prev.y + dy,
        }));
    }, []);

    const handleMouseUp = useCallback(() => {
        isPanning.current = false;
    }, []);

    const handleResetZoom = useCallback(() => {
        setScale(1);
        setTranslate({ x: 0, y: 0 });
    }, []);

    const handleFitScreen = useCallback(() => {
        if (!containerRef.current) return;
        const svgEl = containerRef.current.querySelector('svg');
        if (!svgEl) return;
        const containerRect = containerRef.current.getBoundingClientRect();
        const svgRect = svgEl.getBoundingClientRect();
        const fitScale = Math.min(
            containerRect.width / (svgRect.width / scale),
            containerRect.height / (svgRect.height / scale),
            1
        );
        setScale(Math.max(fitScale * 0.9, 0.1));
        setTranslate({ x: 0, y: 0 });
    }, [scale]);

    if (error) {
        return (
            <div className="text-red-500 text-xs p-2 bg-red-50 border border-red-200 rounded">
                <strong>Render Error:</strong> {error}
                <pre className="mt-1 text-[10px] overflow-auto max-h-20">{chart}</pre>
            </div>
        );
    }

    if (!svg) return null;

    return (
        <div className="relative w-full h-full">
            {/* Thanh công cụ Zoom */}
            <div className="absolute top-2 right-2 z-20 flex items-center gap-1 bg-white/90 backdrop-blur-sm rounded-lg border border-gray-200 shadow-md px-1.5 py-1">
                <button
                    onClick={() => setScale(prev => Math.min(prev * 1.25, 5))}
                    className="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 rounded-md text-base font-bold transition-colors"
                    title="Zoom In"
                >+</button>
                <span className="text-[10px] text-gray-500 font-mono w-10 text-center select-none">{Math.round(scale * 100)}%</span>
                <button
                    onClick={() => setScale(prev => Math.max(prev * 0.8, 0.1))}
                    className="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 rounded-md text-base font-bold transition-colors"
                    title="Zoom Out"
                >−</button>
                <div className="w-px h-5 bg-gray-200" />
                <button
                    onClick={handleFitScreen}
                    className="w-7 h-7 flex items-center justify-center text-gray-500 hover:bg-blue-50 hover:text-blue-600 rounded-md text-xs transition-colors"
                    title="Fit to Screen"
                >⊞</button>
                <button
                    onClick={handleResetZoom}
                    className="w-7 h-7 flex items-center justify-center text-gray-500 hover:bg-amber-50 hover:text-amber-600 rounded-md text-xs transition-colors"
                    title="Reset (100%)"
                >⟳</button>
            </div>

            {/* Hint nhỏ */}
            <div className="absolute bottom-2 left-2 z-20 text-[9px] text-gray-400 bg-white/80 backdrop-blur-sm px-2 py-1 rounded-md border border-gray-100">
                🖱 Scroll: Zoom | Drag: Pan | Click node: Jump to code
            </div>

            {/* SVG Container */}
            <div
                ref={containerRef}
                className="mermaid-container overflow-hidden w-full h-full bg-white rounded border border-gray-200 min-h-[200px]"
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                style={{ cursor: isPanning.current ? 'grabbing' : 'grab' }}
            >
                <div
                    style={{
                        transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
                        transformOrigin: 'top left',
                        transition: isPanning.current ? 'none' : 'transform 0.15s ease-out',
                        willChange: 'transform',
                    }}
                    className="p-4 inline-block"
                    dangerouslySetInnerHTML={{ __html: svg }}
                />
            </div>
        </div>
    );
};

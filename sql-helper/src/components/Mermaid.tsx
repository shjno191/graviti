import { useEffect, useRef, useState, memo } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'loose',
});

interface MermaidProps {
    chart: string;
    onNodeClick?: (nodeId: string) => void;
}

// In-memory cache: chart text → rendered SVG
// Prevents re-rendering when toggling between views or reopening the modal
const svgCache = new Map<string, string>();

/**
 * Mermaid Diagram Renderer Component (Performance-Optimized)
 *
 * Key optimizations:
 * 1. SVG caching — identical chart text reuses previously rendered SVG
 * 2. React.memo — prevents re-renders from parent state changes (zoom, highlight, etc.)
 * 3. Minimal state — only `svg`, `error`, and `isRendering` as state
 * 4. Global click handler registration — isolated from render cycle
 *
 * Node Click Protocol:
 * - Backend generates: `click N1 call onNodeClick("offset-<byteOffset>")`
 * - With securityLevel: 'loose', Mermaid calls window.onNodeClick directly
 * - This component registers onNodeClick on window for the callback
 */
const MermaidInner = ({ chart, onNodeClick }: MermaidProps) => {
    const [svg, setSvg] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [isRendering, setIsRendering] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const renderIdRef = useRef(0); // Track latest render to discard stale renders

    // Register global click handler
    useEffect(() => {
        if (!onNodeClick) return;

        const handler = (nodeId: string) => {
            onNodeClick(nodeId);
        };

        (window as Window & { onNodeClick?: (id: string) => void }).onNodeClick = handler;

        return () => {
            const win = window as Window & { onNodeClick?: (id: string) => void };
            if (win.onNodeClick === handler) {
                delete win.onNodeClick;
            }
        };
    }, [onNodeClick]);

    useEffect(() => {
        if (!chart) {
            setSvg('');
            setIsRendering(false);
            return;
        }

        // Check cache first — instant render for previously seen charts
        const cached = svgCache.get(chart);
        if (cached) {
            setSvg(cached);
            setError(null);
            setIsRendering(false);
            return;
        }

        const currentRenderId = ++renderIdRef.current;
        setIsRendering(true);

        const renderChart = async () => {
            try {
                const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
                const { svg: renderedSvg } = await mermaid.render(id, chart);

                // Only apply if this is still the latest render request
                if (currentRenderId === renderIdRef.current) {
                    svgCache.set(chart, renderedSvg);
                    setSvg(renderedSvg);
                    setError(null);
                    setIsRendering(false);
                }
            } catch (err: unknown) {
                if (currentRenderId === renderIdRef.current) {
                    const message = err instanceof Error ? err.message : 'Failed to render diagram';
                    console.error("Mermaid Render Error:", err);
                    setError(message);
                    setIsRendering(false);
                }
            }
        };

        renderChart();
    }, [chart]);

    if (error) {
        return (
            <div className="text-red-500 text-xs p-2 bg-red-50 border border-red-200 rounded max-w-full overflow-auto">
                <strong>Render Error:</strong> {error}
                <pre className="mt-1 text-[10px] overflow-auto max-h-20">{chart}</pre>
            </div>
        );
    }

    if (isRendering || !svg) {
        return (
            <div className="flex items-center justify-center p-8 text-gray-400 gap-2">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-xs">Rendering diagram...</span>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className="mermaid-container bg-white"
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-start',
                overflow: 'visible'
            }}
            dangerouslySetInnerHTML={{ __html: svg }}
        />
    );
};

// React.memo prevents re-renders when parent state changes (zoom, highlight, etc.)
// Only re-renders when chart or onNodeClick actually change
export const Mermaid = memo(MermaidInner, (prevProps, nextProps) => {
    return prevProps.chart === nextProps.chart && prevProps.onNodeClick === nextProps.onNodeClick;
});

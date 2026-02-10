import { useEffect, useState } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'loose',
});

interface MermaidProps {
    chart: string;
}

/**
 * Mermaid Diagram Renderer Component
 *
 * Renders Mermaid flowchart diagrams with support for click-to-scroll functionality.
 *
 * Node Click Protocol:
 * - Nodes with click handlers should emit calls to window.onNodeClick(id)
 * - Expected node ID format: "offset-<byteOffset>" for scroll-to-source functionality
 * - Example: click(offset-1234) - scrolls to source code at byte offset 1234
 *
 * Supported Node Types:
 * - Internal method calls: Internal Method() method-name
 * - External calls: External Call() external.method
 * - Conditions/Decisions: Condition{if condition}
 * - Return statements: Return[(return value)]
 */
export const Mermaid = ({ chart }: MermaidProps) => {
    const [svg, setSvg] = useState<string>('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!chart) {
            setSvg('');
            return;
        }

        const renderChart = async () => {
            try {
                // Unique ID for each render to avoid conflicts
                const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
                // mermaid.render returns an object with svg property
                const { svg } = await mermaid.render(id, chart);
                setSvg(svg);
                setError(null);

                // Attach click handlers to diagram elements after rendering
                // This enables click-to-scroll functionality
                setTimeout(() => {
                    attachClickHandlers();
                }, 0);
            } catch (err: any) {
                console.error("Mermaid Render Error:", err);
                setError(err.message || 'Failed to render diagram');
            }
        };

        /**
         * Attaches click handlers to Mermaid diagram nodes.
         * Looks for node elements and forwards click events to the global handler.
         */
        const attachClickHandlers = () => {
            const nodeElements = document.querySelectorAll('[id*="mermaid"] [role="button"]');
            nodeElements.forEach((element) => {
                if (element.getAttribute('data-click-handler')) return; // Skip if already attached

                element.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    // Extract node ID from element
                    const nodeId = element.getAttribute('id') || element.textContent || '';
                    const win = window as any;
                    if (win.onNodeClick && typeof win.onNodeClick === 'function') {
                        win.onNodeClick(nodeId);
                    } else {
                        console.warn(`[Mermaid] onNodeClick handler not available for node: ${nodeId}`);
                    }
                });

                element.setAttribute('data-click-handler', 'true');
                (element as HTMLElement).style.cursor = 'pointer';
            });
        };

        renderChart();
    }, [chart]);

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
        <div
            className="mermaid-container overflow-auto p-4 bg-white rounded border border-gray-200 flex justify-center min-h-[200px]"
            dangerouslySetInnerHTML={{ __html: svg }}
        />
    );
};

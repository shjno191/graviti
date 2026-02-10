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
            } catch (err: any) {
                console.error("Mermaid Render Error:", err);
                setError(err.message || 'Failed to render diagram');
            }
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

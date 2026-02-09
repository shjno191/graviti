
import { useEffect, useRef, useCallback } from 'react';

interface SourceCodeViewerProps {
    source: string;
    highlightOffset?: number | null;
}

// Track the currently highlighted element globally to ensure cleanup
let currentHighlightedElement: HTMLElement | null = null;

export const SourceCodeViewer = ({ source, highlightOffset }: SourceCodeViewerProps) => {
    const lines = source.split('\n');
    const containerRef = useRef<HTMLDivElement>(null);

    // Map byte offset to line index accurately (handling multi-byte characters)
    const getLineFromOffset = useCallback((offset: number) => {
        const encoder = new TextEncoder();
        let currentByteOffset = 0;
        for (let i = 0; i < lines.length; i++) {
            const lineByteLength = encoder.encode(lines[i]).length;
            const lineEndByteOffset = currentByteOffset + lineByteLength + 1; // +1 for \n
            if (offset >= currentByteOffset && offset < lineEndByteOffset) {
                return i;
            }
            currentByteOffset = lineEndByteOffset;
        }
        return -1;
    }, [lines]);

    useEffect(() => {
        if (highlightOffset === undefined || highlightOffset === null) {
            return;
        }

        const lineIdx = getLineFromOffset(highlightOffset);
        
        if (lineIdx === -1) {
            console.warn(`[SourceCodeViewer] Could not find line for offset: ${highlightOffset}`);
            return;
        }

        const targetId = `source-line-${lineIdx}`;
        const element = document.getElementById(targetId);
        
        if (!element) {
            console.warn(`[SourceCodeViewer] Target element not found: ${targetId}`);
            return;
        }

        // Remove highlight from previously highlighted element
        if (currentHighlightedElement && currentHighlightedElement !== element) {
            currentHighlightedElement.classList.remove('flow-highlight-target');
        }

        // Scroll to the target element
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Apply highlight class (re-trigger animation by removing and re-adding)
        element.classList.remove('flow-highlight-target');
        // Force reflow to restart animation
        void element.offsetWidth;
        element.classList.add('flow-highlight-target');
        
        // Track this as the currently highlighted element
        currentHighlightedElement = element;

        // Auto-remove highlight after animation completes
        const timer = setTimeout(() => {
            element.classList.remove('flow-highlight-target');
            if (currentHighlightedElement === element) {
                currentHighlightedElement = null;
            }
        }, 2000);

        return () => clearTimeout(timer);
    }, [highlightOffset, getLineFromOffset]);

    return (
        <div ref={containerRef} className="flex-1 overflow-auto bg-gray-50 font-mono text-xs border border-gray-200 rounded custom-scrollbar">
            <div className="flex">
                {/* Line Numbers */}
                <div className="bg-gray-100 text-gray-400 text-right p-2 select-none border-r border-gray-200 min-w-[3rem] sticky left-0">
                    {lines.map((_, i) => (
                        <div key={i} className="leading-5">{i + 1}</div>
                    ))}
                </div>
                {/* Code Content */}
                <div className="p-2 whitespace-pre min-w-0">
                    {lines.map((line, i) => (
                        <div 
                            key={i} 
                            id={`source-line-${i}`}
                            className="px-2 leading-5"
                        >
                            {line || ' '}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

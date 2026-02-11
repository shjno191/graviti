
import { useEffect, useRef, useCallback, memo } from 'react';

interface SourceCodeViewerProps {
    source: string;
    highlightOffset?: number | null;
}

// Track the currently highlighted element globally to ensure cleanup across re-renders
let currentHighlightedElement: HTMLElement | null = null;

const SourceCodeViewerInner = ({ source, highlightOffset }: SourceCodeViewerProps) => {
    const lines = source.split('\n');
    const containerRef = useRef<HTMLDivElement>(null);

    // Map byte offset to line index accurately (handling multi-byte characters)
    const getLineFromOffset = useCallback((offset: number): number => {
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
        const container = containerRef.current;

        if (!element || !container) {
            console.warn(`[SourceCodeViewer] Target element or container not found: ${targetId}`);
            return;
        }

        // Remove highlight from previously highlighted element
        if (currentHighlightedElement && currentHighlightedElement !== element) {
            currentHighlightedElement.classList.remove('flow-highlight-target');
            currentHighlightedElement.classList.remove('flow-highlight-active');
        }

        // Calculate scroll position to center the line within the container
        const containerRect = container.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        
        // Compute how far the element is from the container's visible top
        const elementRelativeTop = elementRect.top - containerRect.top + container.scrollTop;
        const targetScroll = elementRelativeTop - (container.clientHeight / 2) + (element.offsetHeight / 2);

        container.scrollTo({
            top: Math.max(0, targetScroll),
            behavior: 'smooth'
        });

        // Apply highlight class (re-trigger animation by removing and re-adding)
        element.classList.remove('flow-highlight-target');
        element.classList.remove('flow-highlight-active');
        // Force reflow to restart animation
        void element.offsetWidth;
        element.classList.add('flow-highlight-target');
        element.classList.add('flow-highlight-active');

        // Track this as the currently highlighted element
        currentHighlightedElement = element;
    }, [highlightOffset, getLineFromOffset]);

    return (
        <div
            ref={containerRef}
            className="flex-1 overflow-auto bg-gray-50 font-mono text-xs border border-gray-200 rounded custom-scrollbar relative"
            aria-label="Source code viewer with click-to-scroll support"
        >
            <div className="flex min-h-full min-w-0">
                {/* Line Numbers Column */}
                <div className="bg-gray-100 text-gray-400 text-right p-2 select-none border-r border-gray-200 min-w-[3.5rem] sticky left-0 z-10 shrink-0">
                    {lines.map((_, i) => (
                        <div key={i} className="leading-5">
                            {i + 1}
                        </div>
                    ))}
                </div>

                {/* Code Content Column */}
                <div className="p-2 whitespace-pre min-w-0 flex-1">
                    {lines.map((line, i) => (
                        <div
                            key={i}
                            id={`source-line-${i}`}
                            className="px-2 leading-5 hover:bg-gray-100/50 transition-colors relative"
                            title={`Line ${i + 1}`}
                        >
                            {line || ' '}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// React.memo: only re-render when source or highlightOffset actually changes
// This prevents expensive DOM rebuilds when parent zoom/modal state changes
export const SourceCodeViewer = memo(SourceCodeViewerInner);

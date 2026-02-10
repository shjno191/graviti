
import { useEffect, useRef, useCallback } from 'react';

interface SourceCodeViewerProps {
    source: string;
    highlightOffset?: number | null;
}

// Track the currently highlighted element and active timer globally to ensure cleanup
let currentHighlightedElement: HTMLElement | null = null;
let currentHighlightTimer: NodeJS.Timeout | null = null;

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

        // Clear any pending timer from previous highlight
        if (currentHighlightTimer) {
            clearTimeout(currentHighlightTimer);
            currentHighlightTimer = null;
        }

        // Remove highlight from previously highlighted element
        if (currentHighlightedElement && currentHighlightedElement !== element) {
            currentHighlightedElement.classList.remove('flow-highlight-target');
        }

        // Scroll to the target element with smooth behavior
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Apply highlight class (re-trigger animation by removing and re-adding)
        element.classList.remove('flow-highlight-target');
        // Force reflow to restart animation
        void element.offsetWidth;
        element.classList.add('flow-highlight-target');

        // Track this as the currently highlighted element
        currentHighlightedElement = element;

        // Auto-remove highlight after animation completes (matches CSS animation duration)
        currentHighlightTimer = setTimeout(() => {
            if (element.classList.contains('flow-highlight-target')) {
                element.classList.remove('flow-highlight-target');
            }
            if (currentHighlightedElement === element) {
                currentHighlightedElement = null;
            }
            currentHighlightTimer = null;
        }, 2000);

        return () => {
            if (currentHighlightTimer) {
                clearTimeout(currentHighlightTimer);
                currentHighlightTimer = null;
            }
        };
    }, [highlightOffset, getLineFromOffset]);

    return (
        <div
            ref={containerRef}
            className="flex-1 overflow-auto bg-gray-50 font-mono text-xs border border-gray-200 rounded custom-scrollbar"
            aria-label="Source code viewer with click-to-scroll support"
        >
            <div className="flex">
                {/* Line Numbers Column */}
                <div className="bg-gray-100 text-gray-400 text-right p-2 select-none border-r border-gray-200 min-w-[3rem] sticky left-0 z-10">
                    {lines.map((_, i) => (
                        <div key={i} className="leading-5">
                            {i + 1}
                        </div>
                    ))}
                </div>

                {/* Code Content Column */}
                <div className="p-2 whitespace-pre min-w-0">
                    {lines.map((line, i) => (
                        <div
                            key={i}
                            id={`source-line-${i}`}
                            className="px-2 leading-5 hover:bg-gray-100/50 transition-colors"
                            title={`Line ${i + 1}: Click from diagram to highlight`}
                        >
                            {line || ' '}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

/**
 * SourceCodeViewer Component
 *
 * Displays source code with line numbers and supports click-to-scroll highlighting from Mermaid diagrams.
 *
 * ID Convention:
 * - Each line is assigned a stable ID: `source-line-${lineIndex}`
 * - Line index is 0-based (first line = source-line-0)
 * - IDs remain stable across re-renders if source code doesn't change
 *
 * Highlight Behavior:
 * - Triggered by `highlightOffset` prop (byte offset in source)
 * - Offset is converted to line index using UTF-8 byte calculation
 * - Target line is scrolled into view with smooth behavior
 * - Highlight animation plays for 2 seconds (matches CSS animation duration)
 * - Rapidly clicking same node removes previous highlight before applying new one
 * - Invalid offsets log a warning and silently fail
 *
 * Animation Classes:
 * - `.flow-highlight-target`: Yellow pulse animation (light mode)
 * - Dark mode: Blue pulse animation (automatically applied via @media query)
 * - Animation includes: background color, box-shadow, and inset border
 *
 * Performance Considerations:
 * - Uses CSS animations (GPU-accelerated) instead of JavaScript timers for visual changes
 * - Reflow optimization: Forces reflow to restart animation on same element
 * - Global state tracking prevents orphaned highlights and timer leaks
 */

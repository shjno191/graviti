import React from 'react';

export const HighlightText: React.FC<{ text: string, term: string }> = ({ text, term }) => {
    if (!term.trim()) return <>{text}</>;
    // Escape special characters for regex
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedTerm})`, 'gi');
    const parts = text.split(regex);

    return (
        <>
            {parts.map((part, i) => (
                regex.test(part) ? (
                    <mark key={i} className="bg-yellow-200 text-black px-0.5 rounded transition-all shadow-[0_0_8px_rgba(250,204,21,0.4)]">
                        {part}
                    </mark>
                ) : part
            ))}
        </>
    );
};

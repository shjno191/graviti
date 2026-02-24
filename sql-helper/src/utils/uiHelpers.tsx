import React from 'react';


const unaccent = (str: string) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function escapeRegex(str: string) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const HighlightText: React.FC<{ text: string, term?: string, globalTerm?: string }> = ({ text, term, globalTerm }) => {
    if (!text) return null;

    const activeTerms = [term, globalTerm].filter(t => t && t.trim().length > 0) as string[];

    if (activeTerms.length === 0) return <>{text}</>;

    const cleanText = unaccent(text);

    const patterns = activeTerms.map(t => {
        const cleanT = unaccent(t).trim();
        return cleanT.split('').map(c => c.trim() ? escapeRegex(c) : '\\s*').join('.{0,15}?');
    });

    const regex = new RegExp(`(${patterns.join('|')})`, 'gi');

    let match;
    const parts = [];
    let lastIndex = 0;

    while ((match = regex.exec(cleanText)) !== null) {
        if (match.index > lastIndex) {
            parts.push({ text: text.substring(lastIndex, match.index), highlight: false });
        }
        parts.push({ text: text.substring(match.index, regex.lastIndex), highlight: true });
        lastIndex = regex.lastIndex;
        if (match[0].length === 0) regex.lastIndex++;
    }

    if (lastIndex < text.length) {
        parts.push({ text: text.substring(lastIndex), highlight: false });
    }

    if (parts.length === 0) return <>{text}</>;

    return (
        <>
            {parts.map((p, i) => (
                p.highlight ? (
                    <mark key={i} className="bg-yellow-200 text-black px-0.5 rounded transition-all shadow-[0_0_8px_rgba(250,204,21,0.4)]">
                        {p.text}
                    </mark>
                ) : p.text
            ))}
        </>
    );
};

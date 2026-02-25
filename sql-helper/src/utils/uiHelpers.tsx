import React, { useMemo } from 'react';


const unaccent = (str: string) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function escapeRegex(str: string) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const HighlightText: React.FC<{ text: string, term?: string, globalTerm?: string }> = ({ text, term, globalTerm }) => {
    if (!text) return null;

    const regex = useMemo(() => {
        const rawTerms = [term, globalTerm].filter(t => t && t.trim().length > 0) as string[];
        if (rawTerms.length === 0) return null;

        const activeTerms: string[] = [];
        rawTerms.forEach(t => {
            t.split('|').forEach(part => {
                const trimmed = part.trim();
                if (trimmed) activeTerms.push(trimmed);
            });
        });

        if (activeTerms.length === 0) return null;

        const patterns = activeTerms.map(t => {
            const cleanT = unaccent(t).trim();
            // Fuzzy matching logic: allow some characters between letters
            return cleanT.split('').map(c => c.trim() ? escapeRegex(c) : '\\s*').join('.{0,15}?');
        });

        return new RegExp(`(${patterns.join('|')})`, 'gi');
    }, [term, globalTerm]);

    const parts = useMemo(() => {
        if (!regex) return null;

        const cleanText = unaccent(text);
        let match;
        const result = [];
        let lastIndex = 0;

        // Reset regex state since it's cached
        regex.lastIndex = 0;

        while ((match = regex.exec(cleanText)) !== null) {
            if (match.index > lastIndex) {
                result.push({ text: text.substring(lastIndex, match.index), highlight: false });
            }
            result.push({ text: text.substring(match.index, regex.lastIndex), highlight: true });
            lastIndex = regex.lastIndex;
            if (match[0].length === 0) regex.lastIndex++;
        }

        if (lastIndex < text.length) {
            result.push({ text: text.substring(lastIndex), highlight: false });
        }

        return result.length > 0 ? result : null;
    }, [text, regex]);

    if (!parts) return <>{text}</>;

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

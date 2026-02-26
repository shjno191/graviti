export interface JavaField {
    name: string;
    description: string;
    type: string;
    originalText: string;
}

/**
 * Parses a Java class source string and extracts fields with their JavaDoc comments.
 */
export function parseJavaClass(source: string): JavaField[] {
    const fields: JavaField[] = [];

    // Normalize line endings
    const text = source.replace(/\r\n/g, '\n');

    // 1. Line-by-line strict Data Dictionary Table parsing
    const lines = text.split(/[\r\n]+/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Try separating by Tabs first or multiple spaces
        const parts = trimmed.split(/[\t]+|\s{2,}/).map(p => p.trim()).filter(Boolean);
        if (parts.length >= 3) {
            let desc = parts[0];
            const name = parts[1];
            const type = parts[2];

            if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name) && /^[A-Z][a-zA-Z0-9_$<>,\[\]]*|int|long|boolean|double|char|byte|short|float$/.test(type)) {

                if (desc.includes(' ')) {
                    const descParts = desc.split(/\s+/);
                    desc = descParts[descParts.length - 1]; // Extract the very last word directly preceding the tab/spaces
                }
                // Strip leading javadocs/symbols
                desc = desc.replace(/^[^a-zA-Z0-9_\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]+/, '');

                if (!fields.some(f => f.name === name)) {
                    fields.push({ description: desc, name, type, originalText: line.trim() });
                }
            }
        }
    }

    // 2. Global scan for tabular data that might have lost its newlines, but still has meaningful gaps
    const dictRegex = /([^\s]+)\s+([A-Z_]+|[a-z]+[A-Z][a-zA-Z0-9_]*)\s+([A-Z][a-zA-Z0-9_$<>,\[\]]*|int|long|boolean|double|char|byte|short|float)\b/g;

    let dictMatch;
    while ((dictMatch = dictRegex.exec(text)) !== null) {
        let desc = dictMatch[1];
        const name = dictMatch[2];
        const type = dictMatch[3];

        if (name.length < 2) continue; // Var names should at least be 2 chars

        const javaKeywords = ['public', 'private', 'protected', 'class', 'interface', 'import', 'package', 'return'];
        if (javaKeywords.includes(desc) || javaKeywords.includes(name)) continue;

        // Strip out noise from desc
        desc = desc.replace(/^[^a-zA-Z0-9_\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]+/, '');

        if (!fields.some(f => f.name === name)) {
            fields.push({
                description: desc.trim(),
                name: name.trim(),
                type: type.trim(),
                originalText: dictMatch[0].trim()
            });
        }
    }

    // 2. Second Pass: Extract standard Java fields
    const fieldRegex = /(?:\/\*\*([\s\S]*?)\*\/|\/\/([^\n\r]*))?\s*(?:@[\w.]+(?:\([^)]*\))?\s*)*\s*(private|protected|public)\s+(?:static\s+)?(?:final\s+)?([\w<>?[\],\s]+?)\s+(\w+)(?:\s*=[\s\S]*?)?;/g;

    let match;
    while ((match = fieldRegex.exec(text)) !== null) {
        const fullMatch = match[0];
        const blockDoc = match[1];
        const lineDoc = match[2];
        const rawType = match[4];
        const name = match[5];

        let description = '';
        if (blockDoc) {
            description = blockDoc
                .split('\n')
                .map(line => line.trim().replace(/^\*+\s?/, ''))
                .filter(line => line.length > 0)
                .join(' ');
        } else if (lineDoc) {
            description = lineDoc.trim();
        }

        const type = rawType.trim();

        if (!fields.some(f => f.name === name)) {
            fields.push({
                name,
                description: description.trim(),
                type,
                originalText: fullMatch.trim()
            });
        }
    }

    return fields;
}

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

    // Regex to find fields
    // Strategy: 
    // 1. Optional JavaDoc: /** ... */  (Captured in group 1)
    // 2. Whitespace and parsing of Annotations: @Annotation(...) (Ignored)
    // 3. Modifiers: private/protected/public (Required to identify field vs local var?) 
    //    Actually user example has 'private'. We can stick to standard fields.
    // 4. Type: Non-whitespace characters (with generics support)
    // 5. Name: Identifier
    // 6. Init: = ... ; or just ;
    
    // Regex explanation:
    // (?:\/\*\*([\s\S]*?)\*\/|\/\/([^\n\r]*))?  -> Group 1: Block JavaDoc, Group 2: Line Comment
    // \s*                            -> Whitespace usually containing newlines
    // (?:@[\w.]+(?:\([^)]*\))?\s*)*  -> Optional Annotations (non-capturing), e.g. @Column(name="x")
    // (private|protected|public)\s+  -> Group 3: Visibility
    // (?:static\s+)?(?:final\s+)?    -> Optional modifiers
    // ([\w<>?[\],\s]+?)\s+           -> Group 4: Type
    // (\w+)                          -> Group 5: Field Name
    // (?:\s*=[\s\S]*?)?              -> Optional initialization
    // ;                              -> Terminator
    
    const fieldRegex = /(?:\/\*\*([\s\S]*?)\*\/|\/\/([^\n\r]*))?\s*(?:@[\w.]+(?:\([^)]*\))?\s*)*\s*(private|protected|public)\s+(?:static\s+)?(?:final\s+)?([\w<>?[\],\s]+?)\s+(\w+)(?:\s*=[\s\S]*?)?;/g;
    
    let match;
    while ((match = fieldRegex.exec(text)) !== null) {
        const fullMatch = match[0];
        const blockDoc = match[1];
        const lineDoc = match[2];
        // match[3] is visibility
        const rawType = match[4];
        const name = match[5];

        // Clean up description
        let description = '';
        if (blockDoc) {
            description = blockDoc
                .split('\n')
                .map(line => line.trim().replace(/^\*+\s?/, '')) // Remove leading *
                .filter(line => line.length > 0) // Remove empty lines
                .join(' '); 
        } else if (lineDoc) {
            description = lineDoc.trim();
        }

        // Clean up type (remove extra spaces)
        const type = rawType.trim();

        fields.push({
            name,
            description: description.trim(),
            type,
            originalText: fullMatch.trim()
        });
    }

    return fields;
}

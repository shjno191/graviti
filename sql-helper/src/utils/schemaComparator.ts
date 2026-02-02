export interface SchemaParseResult {
    columns: string[];
    tableName: string;
}

export function extractColumnsFromCreateTable(scriptText: string): SchemaParseResult {
    const columns: string[] = [];
    let tableName = '';
    const lines = scriptText.split('\n');
    let isInIndexDefinition = false;

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        // Extract table name from CREATE TABLE statement
        const tableMatch = line.match(/CREATE\s+TABLE\s+(?:\w+\.)*(\w+)\s*\(/i);
        if (tableMatch) {
            tableName = tableMatch[1];
        }

        // Skip comments
        if (trimmedLine.startsWith('--')) continue;

        // Skip CREATE INDEX lines and everything after until we find a new CREATE or semicolon
        if (trimmedLine.toUpperCase().startsWith('CREATE')) {
            if (trimmedLine.toUpperCase().includes('INDEX')) {
                isInIndexDefinition = true;
                continue;
            }
        }

        if (isInIndexDefinition) {
            if (trimmedLine.endsWith(';')) {
                isInIndexDefinition = false;
            }
            continue;
        }

        // Skip CONSTRAINT lines
        const upperLine = trimmedLine.toUpperCase();
        if (upperLine.startsWith('CONSTRAINT') ||
            upperLine.startsWith('PRIMARY KEY') ||
            upperLine.startsWith('FOREIGN KEY') ||
            upperLine.startsWith('UNIQUE') ||
            upperLine.startsWith('CHECK')) continue;

        // Look for column definitions
        const match = line.match(/^\s*(\w+)\s+(.+?)(?:,|$)/);
        if (match) {
            const columnName = match[1].trim();
            // Skip closing parenthesis and other non-column lines
            if (columnName && !columnName.includes(')') && columnName !== 'CREATE' && columnName !== 'TABLE') {
                columns.push(columnName.toUpperCase());
            }
        }
    }

    return { columns, tableName };
}

export function sortColumnsByPriority(columns: string[], priorityColumns: string[]): string[] {
    if (!priorityColumns || priorityColumns.length === 0) {
        return [...columns].sort();
    }

    const prioritySet = new Set(priorityColumns);
    const priorityColumnsInList = columns.filter(col => prioritySet.has(col));
    const otherColumns = columns.filter(col => !prioritySet.has(col)).sort();

    // Sort priority columns by the order they appear in priorityColumns
    priorityColumnsInList.sort((a, b) => {
        return priorityColumns.indexOf(a) - priorityColumns.indexOf(b);
    });

    return [...priorityColumnsInList, ...otherColumns];
}

export function generateSelectStatement(
    commonColumns: string[],
    onlyInTable: string[],
    tableName: string,
    priorityColumns: string[] = []
): string {
    const sortedCommon = sortColumnsByPriority(commonColumns, priorityColumns);
    const sortedOnlyInTable = sortColumnsByPriority(onlyInTable, priorityColumns);

    if (sortedCommon.length === 0 && sortedOnlyInTable.length === 0) {
        return '-- No columns found';
    }

    const formattedColumns: string[] = [];
    const addedColumns = new Set<string>();

    // Add priority columns first
    const priorityColumnsInList = priorityColumns.filter(col =>
        sortedCommon.includes(col) || sortedOnlyInTable.includes(col)
    );

    if (priorityColumnsInList.length > 0) {
        formattedColumns.push('-- Priority columns:');
        priorityColumnsInList.forEach(col => {
            if (!addedColumns.has(col)) {
                formattedColumns.push(col);
                addedColumns.add(col);
            }
        });
    }

    // Add remaining common columns
    const remainingCommon = sortedCommon.filter(col => !addedColumns.has(col));
    if (remainingCommon.length > 0) {
        formattedColumns.push('-- Other common columns:');
        remainingCommon.forEach(col => {
            if (!addedColumns.has(col)) {
                formattedColumns.push(col);
                addedColumns.add(col);
            }
        });
    }

    // Add only in this table
    const onlyInTableFiltered = sortedOnlyInTable.filter(col => !addedColumns.has(col));
    if (onlyInTableFiltered.length > 0) {
        formattedColumns.push(`-- Only in ${tableName}:`);
        onlyInTableFiltered.forEach(col => {
            if (!addedColumns.has(col)) {
                formattedColumns.push(col);
                addedColumns.add(col);
            }
        });
    }

    const selectList = formattedColumns.join(',\n    ');
    return `SELECT\n    ${selectList}\nFROM ${tableName}`;
}

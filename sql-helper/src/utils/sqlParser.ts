export interface SqlParam {
    type: string;
    index: number;
    value: string;
}

export interface ParseResult {
    sql: string;
    params: SqlParam[];
}

export function extractParams(paramString: string): SqlParam[] {
    const params: SqlParam[] = [];
    const pattern = /\[([A-Z_]+):(\d+):([^\]]*)\]/g;
    let match;

    while ((match = pattern.exec(paramString)) !== null) {
        params.push({
            type: match[1],
            index: parseInt(match[2]),
            value: match[3] || 'NULL'
        });
    }

    return params.sort((a, b) => a.index - b.index);
}

export function replaceParamsInSql(sql: string, params: SqlParam[]): string {
    if (params.length === 0) return sql;

    let result = sql;
    for (const p of params) {
        let value = p.value;
        if (value !== 'NULL' && p.type === 'STRING') {
            value = `'${value.replace(/'/g, "''")}'`;
        }
        // Replace first occurrence only
        result = result.replace('?', value);
    }
    return result;
}

export function findLogEntriesOptimized(content: string, targetId: string): ParseResult {
    let sql = '';
    let params: SqlParam[] = [];
    const lines = content.split('\n');
    let foundSql = false;
    let foundParams = false;

    for (const line of lines) {
        if (foundSql && foundParams) break;

        if (!foundSql) {
            const sqlMatch = line.match(/CreatePreparedStatement\s+id=([a-f0-9]+)\s+sql=(.+?)(?=\s*$)/);
            if (sqlMatch && sqlMatch[1] === targetId) {
                sql = sqlMatch[2].trim();
                foundSql = true;
            }
        }

        if (!foundParams) {
            const paramMatch = line.match(/id=([a-f0-9]+)\s+params=(\[.+\])/);
            if (paramMatch && paramMatch[1] === targetId) {
                params = extractParams(paramMatch[2]);
                foundParams = true;
            }
        }
    }

    return { sql, params };
}

export function findLastId(content: string): string | null {
    const idPattern = /id=([a-f0-9]+)/g;
    let lastId: string | null = null;
    let match;

    while ((match = idPattern.exec(content)) !== null) {
        lastId = match[1];
    }
    return lastId;
}

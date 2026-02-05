/**
 * Utility to check for dangerous SQL commands that could modify data.
 */
export const checkDangerousSql = (sql: string): { isDangerous: boolean; command?: string } => {
    const dangerousCommands = ['UPDATE', 'INSERT', 'DELETE', 'TRUNCATE', 'DROP', 'ALTER', 'CREATE', 'REPLACE'];

    // Simple regex to find the commands as whole words, ignoring case
    // We check for these words anywhere in the SQL string.
    for (const command of dangerousCommands) {
        const regex = new RegExp(`\\b${command}\\b`, 'i');
        if (regex.test(sql)) {
            return { isDangerous: true, command };
        }
    }

    return { isDangerous: false };
};

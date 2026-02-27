export type DiffType = 'same' | 'added' | 'removed' | 'modified';

export interface DiffResult {
    lines: {
        text: string;
        currentText?: string;
        type: DiffType;
        originalIndex?: number;
        currentIndex?: number;
        isDuplicateA?: boolean;
        isDuplicateB?: boolean;
    }[];
    missingLines: string[];
    extraLines: string[];
    duplicateLinesA: string[];
    duplicateLinesB: string[];
}

/**
 * Compare two text inputs line by line (Ordered comparison).
 * Uses a simple LCS (Longest Common Subsequence) approach for line-based diff.
 */
export function compareOrdered(expectedParts: string[], currentParts: string[], ignoreCase: boolean = false, trim: boolean = false): DiffResult {
    const n = expectedParts.length;
    const m = currentParts.length;

    // Helper to get comparison key
    const getKey = (s: string) => {
        let key = s;
        if (trim) key = key.trim();
        if (ignoreCase) key = key.toLowerCase();
        // Normalize Japanese full-width (Zenkaku) characters to half-width (Hankaku) for smarter matching
        key = key.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/　/g, ' ');
        return key;
    };

    // DP table for LCS
    const dp: number[][] = Array(n + 1).fill(0).map(() => Array(m + 1).fill(0));

    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            if (getKey(expectedParts[i - 1]) === getKey(currentParts[j - 1])) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    // Backtrack to find the diff
    let i = n;
    let j = m;
    const lines: DiffResult['lines'] = [];
    const missingLines: string[] = [];
    const extraLines: string[] = [];

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && getKey(expectedParts[i - 1]) === getKey(currentParts[j - 1])) {
            lines.unshift({
                text: expectedParts[i - 1],
                currentText: currentParts[j - 1],
                type: 'same',
                originalIndex: i - 1,
                currentIndex: j - 1
            });
            i--;
            j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            // Added in Current
            lines.unshift({ text: currentParts[j - 1], type: 'added', currentIndex: j - 1 });
            extraLines.unshift(currentParts[j - 1]);
            j--;
        } else {
            // Removed from Expected (Missing in Current)
            lines.unshift({ text: expectedParts[i - 1], type: 'removed', originalIndex: i - 1 });
            missingLines.unshift(expectedParts[i - 1]);
            i--;
        }
    }

    // Track duplicates
    const seenA = new Map<string, number>();
    const seenB = new Map<string, number>();
    const duplicateLinesA: string[] = [];
    const duplicateLinesB: string[] = [];

    expectedParts.forEach(line => {
        const key = getKey(line);
        const count = (seenA.get(key) || 0) + 1;
        seenA.set(key, count);
        if (count === 2) duplicateLinesA.push(line);
    });
    currentParts.forEach(line => {
        const key = getKey(line);
        const count = (seenB.get(key) || 0) + 1;
        seenB.set(key, count);
        if (count === 2) duplicateLinesB.push(line);
    });

    const finalLines = lines.map(line => {
        const keyA = line.text ? getKey(line.text) : null;
        const keyB = line.currentText ? getKey(line.currentText) : null;
        return {
            ...line,
            isDuplicateA: keyA ? (seenA.get(keyA) || 0) > 1 : false,
            isDuplicateB: keyB ? (seenB.get(keyB) || 0) > 1 : false
        };
    });

    return { lines: finalLines, missingLines: missingLines.reverse(), extraLines: extraLines.reverse(), duplicateLinesA, duplicateLinesB };
}

/**
 * Compare two text inputs ignoring order (Unordered comparison).
 * Reorders Current to match Expected where possible.
 */
export function compareUnordered(expectedParts: string[], currentParts: string[], ignoreCase: boolean = false, trim: boolean = false): DiffResult {
    // Helper to get comparison key
    const getKey = (s: string) => {
        let key = s;
        if (trim) key = key.trim();
        if (ignoreCase) key = key.toLowerCase();
        // Normalize Japanese full-width (Zenkaku) characters to half-width (Hankaku) for smarter matching
        key = key.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/　/g, ' ');
        return key;
    };

    const currentCounts = new Map<string, number>();
    const currentIndices = new Map<string, number[]>();

    currentParts.forEach((line, index) => {
        const key = getKey(line);
        currentCounts.set(key, (currentCounts.get(key) || 0) + 1);
        if (!currentIndices.has(key)) {
            currentIndices.set(key, []);
        }
        currentIndices.get(key)!.push(index);
    });

    const lines: DiffResult['lines'] = [];
    const missingLines: string[] = [];
    const extraLines: string[] = [];

    // 1. Iterate Expected to identify Matches and Missing
    expectedParts.forEach((line, index) => {
        const key = getKey(line);
        const count = currentCounts.get(key) || 0;
        if (count > 0) {
            // Found a match!
            const indices = currentIndices.get(key)!;
            const currentIndex = indices.shift(); // take first

            lines.push({
                text: line,
                currentText: currentParts[currentIndex!],
                type: 'same',
                originalIndex: index,
                currentIndex: currentIndex
            });
            currentCounts.set(key, count - 1);
        } else {
            // Missing in Current
            lines.push({ text: line, type: 'removed', originalIndex: index });
            missingLines.push(line);
        }
    });

    // 2. Any remaining lines in Current are Extra
    const allExtras: { text: string, index: number }[] = [];
    currentIndices.forEach((indices, _key) => {
        indices.forEach(idx => {
            allExtras.push({ text: currentParts[idx], index: idx });
        });
    });

    allExtras.sort((a, b) => a.index - b.index);

    allExtras.forEach(item => {
        lines.push({ text: item.text, type: 'added', currentIndex: item.index });
        extraLines.push(item.text);
    });

    // Track duplicates
    const seenA = new Map<string, number>();
    const seenB = new Map<string, number>();
    const duplicateLinesA: string[] = [];
    const duplicateLinesB: string[] = [];

    expectedParts.forEach(line => {
        const key = getKey(line);
        const count = (seenA.get(key) || 0) + 1;
        seenA.set(key, count);
        if (count === 2) duplicateLinesA.push(line);
    });
    currentParts.forEach(line => {
        const key = getKey(line);
        const count = (seenB.get(key) || 0) + 1;
        seenB.set(key, count);
        if (count === 2) duplicateLinesB.push(line);
    });

    const finalLines = lines.map(line => {
        const keyA = line.text ? getKey(line.text) : null;
        const keyB = line.currentText ? getKey(line.currentText) : null;
        return {
            ...line,
            isDuplicateA: keyA ? (seenA.get(keyA) || 0) > 1 : false,
            isDuplicateB: keyB ? (seenB.get(keyB) || 0) > 1 : false
        };
    });

    return { lines: finalLines, missingLines, extraLines, duplicateLinesA, duplicateLinesB };
}

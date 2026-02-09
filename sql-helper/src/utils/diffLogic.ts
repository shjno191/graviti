export type DiffType = 'same' | 'added' | 'removed' | 'modified';

export interface DiffResult {
    lines: {
        text: string;
        type: DiffType;
        originalIndex?: number; // Index in Expected
        currentIndex?: number; // Index in Current
    }[];
    missingLines: string[]; // Lines present in Expected but missing in Current (for summary)
    extraLines: string[];   // Lines present in Current but missing in Expected (for summary)
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
            lines.unshift({ text: expectedParts[i - 1], type: 'same', originalIndex: i - 1, currentIndex: j - 1 });
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

    // The current Ordered diff implementation aligns lines. 
    // However, typical "Side-by-Side" view might want to see them as "Modified" if they are just different in place.
    // But LCS naturally separates them into Added/Removed blocks.
    // For a cleaner "Text Compare" that resembles Git diff, keeping them as Added/Removed is correct.
    // Modified is usually inferred when a Remove is immediately followed by an Add.
    
    // Let's post-process to mark "Modified" if we have Remove immediately followed by Add?
    // The requirements say "Highlight added, removed, and modified lines".
    // Git diff usually shows Removed then Added.
    // We can leave it as is, or combine them.
    // For now, let's strictly follow LCS which gives Added/Removed. "Modified" is visually represented by a Remove block next to an Add block.

    return { lines, missingLines: missingLines.reverse(), extraLines: extraLines.reverse() };
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
            // We take the first available index for this line from Current to be specific
            const indices = currentIndices.get(key)!;
            const currentIndex = indices.shift(); // take first
            
            lines.push({ text: line, type: 'same', originalIndex: index, currentIndex: currentIndex });
            currentCounts.set(key, count - 1);
        } else {
            // Missing in Current
            lines.push({ text: line, type: 'removed', originalIndex: index });
            missingLines.push(line);
        }
    });

    // 2. Any remaining lines in Current are Extra
    // We need to find which lines are left and where they were in Current (optional, but good for context)
    // The currentCounts map tells us how many are left.
    // To preserve "original order of extras" usually we'd iterate Current again, 
    // but here we just want to list them. 
    // Let's iterate the original Current array to pick up the leftovers in their relative order.
    
    // We need to track which *instances* of lines in Current were used. 
    // A simple way is to re-build a frequency map of what we USED, and then iterate Current.
    
    // Easier way:
    // We already decremented `currentCounts`. If it's > 0, those are extras.
    // We can iterate `currentParts` and check if we still need to "consume" them as extras.
    
    // Wait, `currentCounts` decrements when we match. So remaining count is exactly what's extra.
    // But we need to know *which instance* correspond to the extras if we care about their position.
    // Actually, for "Unordered", the visual output usually appends extras at the end.
    
    // We can just iterate `currentCounts`? No, that loses order.
    // Let's iterate `currentParts`. We need a fresh map for this or reset something.
    
    // Let's reconstruct based on `currentParts` iteration:
    // We need to know for each line in `currentParts`, was it used?
    // We can use a usage tracker.
    

    
    // We iterate `currentParts` to find these extras in order
    // But wait, `currentCounts` just has counts. It doesn't tell us *which* specific index was skipped if there are duplicates.
    // Actually it doesn't matter much for unordered, but preserving relative order of extras is nice.
    
    // Let's try to match them:
    const remainingToFind = new Map(currentCounts); 
    
    currentParts.forEach((line) => {
        const key = getKey(line);
        if (remainingToFind.has(key) && remainingToFind.get(key)! > 0) {
             // This is an extra line
             // But wait, how do we know this specific instance wasn't the one used for a match?
             // Since it is "Unordered", we can technically say "Any instance is fine".
             // But valid indices are needed? Not strictly for display if we just append.
             
             // Simplification:
             // We can just iterate the map and dump them.
             // OR better: we want to show them effectively.
             // Let's just create the extra lines now.
             
             // Actually, the previous logic:
             // We used `currentIndices.shift()` to grab indices for Matches.
             // Typically we want the *remaining* indices for Extras.
             // Let's use `currentIndices` which now contains only the remaining indices!
             
             return; // just a forEach placeholder
        }
    });

    // `currentIndices` now has only the indices that were NOT used (because we shifted them out).
    // Let's collect them.
    const allExtras: {text: string, index: number}[] = [];
    currentIndices.forEach((indices, text) => {
        indices.forEach(idx => {
            allExtras.push({ text, index: idx });
        });
    });

    // Sort extras by their appearance in Current to maintain some sanity
    allExtras.sort((a, b) => a.index - b.index);

    allExtras.forEach(item => {
        lines.push({ text: item.text, type: 'added', currentIndex: item.index });
        extraLines.push(item.text);
    });

    return { lines, missingLines, extraLines };
}

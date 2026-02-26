import React, { useState, useEffect, useMemo, useRef, useDeferredValue } from 'react';
import { readBinaryFile, writeBinaryFile, readTextFile, writeTextFile } from '@tauri-apps/api/fs';
import { invoke } from '@tauri-apps/api/tauri';
import { open as openDialog } from '@tauri-apps/api/dialog';
import * as XLSX from 'xlsx';
import { createPortal } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../store/useAppStore';
import { HighlightText } from '../utils/uiHelpers';

interface TranslateEntry {
    japanese: string;
    english: string;
    vietnamese: string;
}

interface TranslatedSegment {
    type: 'text' | 'phrase';
    text: string;
    original: string;
    key: string;
    uid: string;
    isMultiple: boolean;
    options: string[];
}

interface TranslatedLine {
    segments: TranslatedSegment[];
}

interface ParserConfig {
    splitEnabled: boolean;
    keywords: string[];
    deleteChars?: string[];
    revertRules?: any[];
    revertTKMapping?: any[];
    headers?: {
        and?: string;
    };
    lineBreaks?: {
        and?: boolean;
    };
}


const MemoizedSegment = React.memo(({ seg, hoveredUid, hoveredKey, onHover, onClick, copiedKey, lIdx, onShowTooltip, globalTerm }: {
    seg: TranslatedSegment,
    hoveredUid: string | null,
    hoveredKey: string | null,
    onHover: (uid: string | null, key: string | null) => void,
    onClick: (seg: TranslatedSegment) => void,
    copiedKey: string | null,
    lIdx: number,
    onShowTooltip: (seg: TranslatedSegment, rect: DOMRect) => void,
    globalTerm?: string
}) => {
    if (seg.type === 'text') return <HighlightText text={seg.text} globalTerm={globalTerm} />;

    const isCopied = copiedKey === seg.key;
    const elementRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        if (seg.isMultiple && hoveredUid === seg.uid && elementRef.current) {
            onShowTooltip(seg, elementRef.current.getBoundingClientRect());
        }
    }, [hoveredUid, seg, onShowTooltip]);

    return (
        <span
            ref={elementRef}
            key={seg.uid}
            className={`inline-flex items-center group/opt relative cursor-pointer mx-0.5 transition-all duration-300 font-bold
                ${seg.isMultiple ? 'text-amber-600 border-b-2 border-amber-400/50 hover:border-amber-400' : 'text-indigo-600 border-b border-indigo-200 hover:border-indigo-400'}
                ${hoveredKey === seg.key ? (hoveredUid === seg.uid ? '!text-indigo-900 !border-indigo-600 !border-b-2 scale-[1.05] z-10' : '!text-indigo-600/80 !border-indigo-400/50 !border-b-2') : ''}
                ${isCopied ? '!text-green-600 !border-green-600 !border-b-2' : ''}
            `}
            onMouseEnter={() => {
                onHover(seg.uid, seg.key);
            }}
            onMouseLeave={() => {
                onHover(null, null);
            }}
            onClick={() => onClick(seg)}
        >
            <span className="relative z-10"><HighlightText text={seg.text} globalTerm={globalTerm} /></span>

            {seg.isMultiple && (
                <span className="ml-1 text-[8px] opacity-60 bg-indigo-50 px-1 rounded-full border border-indigo-200 select-none">
                    {seg.options.length}
                </span>
            )}

            {isCopied && (
                <span className={`absolute left-1/2 -translate-x-1/2 bg-green-600 text-white text-[8px] px-1.5 py-0.5 rounded shadow-sm animate-bounce whitespace-nowrap z-[10000] font-black select-none pointer-events-none
                    ${lIdx === 0 ? 'top-[130%]' : 'bottom-[130%]'}
                `}>
                    COPIED!
                </span>
            )}
            {!isCopied && !seg.isMultiple && (
                <span className={`absolute left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[8px] px-2 py-0.5 rounded opacity-0 group-hover/opt:opacity-100 transition-opacity whitespace-nowrap z-[9999] font-bold shadow-lg pointer-events-none select-none
                    ${lIdx === 0 ? 'top-[120%]' : 'bottom-[120%]'}
                `}>
                    📋 CLICK TO COPY
                </span>
            )}
        </span>
    );
});

const HighlighterOverlay = React.memo(({
    translatedLines,
    hoveredUid,
    hoveredKey,
    lineSpacing,
    globalTerm
}: {
    translatedLines: TranslatedLine[],
    hoveredUid: string | null,
    hoveredKey: string | null,
    lineSpacing: number,
    globalTerm?: string
}) => {
    return (
        <div style={{ tabSize: 4, MozTabSize: 4 }}>
            {translatedLines.map((line, lIdx) => (
                <div
                    key={lIdx}
                    className="transition-colors duration-200 whitespace-pre"
                    style={{ minHeight: `${lineSpacing}em`, lineHeight: lineSpacing }}
                >
                    {line.segments.length > 0 ? line.segments.map(seg => (
                        <span
                            key={seg.uid}
                            className={`transition-all duration-300 ${seg.type === 'phrase'
                                ? (hoveredKey === seg.key
                                    ? (hoveredUid === seg.uid
                                        ? 'text-indigo-900 underline decoration-2 underline-offset-4 bg-indigo-200/50'
                                        : 'text-indigo-500 underline decoration-1 underline-offset-4 bg-indigo-100/30')
                                    : 'text-indigo-600/40 underline decoration-px underline-offset-4 bg-indigo-50/10')
                                : 'text-gray-800'}`}
                        >
                            <HighlightText text={seg.original} globalTerm={globalTerm} />
                        </span>
                    )) : '\u200B'}
                </div>
            ))}
        </div>
    );
});

const getExcelColumnName = (colIndex: number) => {
    let columnName = '';
    while (colIndex >= 0) {
        columnName = String.fromCharCode((colIndex % 26) + 65) + columnName;
        colIndex = Math.floor(colIndex / 26) - 1;
    }
    return columnName;
};

const normalizeText = (s: string) => s
    .replace(/[！-～]/g, (m) => String.fromCharCode(m.charCodeAt(0) - 0xFEE0)) // Full-width to half-width
    .replace(/　/g, ' ') // Full-width space to half-width
    .replace(/[\t\r\n\v\f]/g, ' '); // All whitespace-like to standard space (1-to-1)

const splitSqlColumn = (val: string, keywords: string[]): string[] => {
    if (!val) return [''];
    let expression = val.trim();

    const sortedKeywords = keywords
        .map(k => k.trim())
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);

    if (sortedKeywords.length === 0) return [expression];

    const escaped = sortedKeywords.map(k => {
        const pattern = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return /^[a-zA-Z0-9_]+$/.test(k) ? `\\b${pattern}\\b` : pattern;
    });

    const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
    return expression.split(regex)
        .map(p => p.trim())
        .filter(p => p !== '');
};

const getSegmentsFromText = (
    line: string,
    lIdx: number | string,
    translationDict: any[],
    selections: Record<string, string>,
    prefix: string = 't'
): TranslatedSegment[] => {
    if (!line) return [];

    const matches: { start: number, end: number, replacements: string[], phrase: string, dictKey: string }[] = [];
    const normLine = normalizeText(line);
    const lowerNormLine = normLine.toLowerCase();

    for (const item of translationDict) {
        if (!lowerNormLine.includes(item.phrase)) continue;

        item.regex.lastIndex = 0;
        let match;
        while ((match = item.regex.exec(normLine)) !== null) {
            const start = match.index;
            const end = start + item.phrase.length;
            if (!matches.some(m => (start < m.end && end > m.start))) {
                matches.push({
                    start,
                    end,
                    replacements: item.replacements,
                    phrase: line.substring(start, end),
                    dictKey: item.phrase
                });
            }
            if (item.phrase.length === 0) break;
        }
    }

    matches.sort((a, b) => a.start - b.start);
    const segments: TranslatedSegment[] = [];
    let lastIndex = 0;

    matches.forEach((match) => {
        if (match.start > lastIndex) {
            const txt = line.substring(lastIndex, match.start);
            const posKey = `${prefix}-txt-${lIdx}-${lastIndex}`;
            segments.push({ type: 'text', text: txt, original: txt, key: posKey, uid: posKey, isMultiple: false, options: [] });
        }
        const selectionKey = `vkey-${encodeURIComponent(match.dictKey || match.phrase)}`;
        const posKey = `${prefix}-phr-${lIdx}-${match.start}`;
        segments.push({
            type: 'phrase',
            text: selections[selectionKey] || match.replacements[0],
            original: match.phrase,
            key: selectionKey,
            uid: posKey,
            isMultiple: match.replacements.length > 1,
            options: match.replacements
        });
        lastIndex = match.end;
    });

    if (lastIndex < line.length) {
        const txt = line.substring(lastIndex);
        const posKey = `${prefix}-txt-${lIdx}-${lastIndex}`;
        segments.push({ type: 'text', text: txt, original: txt, key: posKey, uid: posKey, isMultiple: false, options: [] });
    }

    return segments;
};

const parseJavaSql = (input: string, config: ParserConfig): string => {
    let text = input;

    if (config.deleteChars && config.deleteChars.length > 0) {
        const escapedChars = config.deleteChars.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const deleteRegex = new RegExp(`(${escapedChars.join('|')})`, 'g');
        text = text.replace(deleteRegex, '');
    }

    const rawLines = text.split('\n');
    const preprocessed: { sql: string; condition: string | null }[] = [];
    let braceDepth = 0;
    let conditionStack: string[] = [];

    for (const raw of rawLines) {
        const trimmed = raw.trim();
        if (!trimmed || trimmed.startsWith('//')) continue;

        const ifMatch = trimmed.match(/^if\s*\((.+?)\)\s*\{?$/);
        if (ifMatch) {
            conditionStack.push(ifMatch[1].trim());
            braceDepth++;
            continue;
        }
        if (/^else\s*\{?$/.test(trimmed) || trimmed === '}') {
            if (trimmed === '}' && braceDepth > 0) {
                braceDepth--;
                if (braceDepth < conditionStack.length) conditionStack.pop();
            }
            continue;
        }
        if (trimmed === '{') { braceDepth++; continue; }

        let sqlLine = trimmed;
        // Aggressively strip Java StringBuilder/StringBuffer append wrappers
        // Handles: sb.append("..."), sql.append("..."), append("..."), etc.
        if (/\.append\s*\(/.test(sqlLine) || sqlLine.startsWith('append(')) {
            sqlLine = sqlLine.replace(/^.*?\.\s*append\s*\(\s*/i, ''); // Strip leading part up to .append(
            sqlLine = sqlLine.replace(/^append\s*\(\s*/i, '');       // Strip leading append(
            sqlLine = sqlLine.replace(/\s*\)\s*;?.*$/i, '');          // Strip trailing ); and anything after
            sqlLine = sqlLine.replace(/^"|"$/g, '').replace(/^'|'$/g, ''); // Strip leading/trailing quotes
        }

        sqlLine = sqlLine.replace(/"\s*\+\s*([\w.$()]+)\s*\+\s*"/g, '【入力．$1】');
        sqlLine = sqlLine.replace(/"/g, '').replace(/\+/g, '').replace(/;/g, '').trim();

        if (!sqlLine) continue;

        preprocessed.push({
            sql: sqlLine,
            condition: conditionStack.length > 0 ? conditionStack[conditionStack.length - 1] : null
        });
    }

    type Section = 'none' | 'select' | 'from' | 'where' | 'orderby' | 'groupby' | 'having' | 'insert' | 'values' | 'update' | 'set' | 'delete';
    let section: Section = 'none';
    const aliasMap = new Map<string, string>();

    const outputSections: Record<string, string[]> = {
        insert: [], values: [], select: [], from: [], where: [], update: [], set: [], delete: [], orderby: [], groupby: [], having: []
    };

    const parseConditionLine = (line: string, condition: string | null): string => {
        const t = line.trim();
        const bw = t.match(/^(.+?)\s+BETWEEN\s+(.+?)\s+AND\s+(.+)$/i);
        if (bw) {
            const note = condition ? `\t【条件: ${condition}】` : '';
            return `\t${bw[1].trim()}\tBETWEEN\t${bw[2].trim()}\t～ ${bw[3].trim()}${note}`;
        }
        const cmp = t.match(/^(.+?)\s*(>=|<=|<>|!=|=|>|<)\s*(.+)$/);
        if (cmp) {
            const note = condition ? `\t【条件: ${condition}】` : '';
            return `\t${cmp[1].trim()}\t${cmp[2]}\t${cmp[3].trim()}${note}`;
        }
        if (config.splitEnabled && config.keywords && config.keywords.length > 0) {
            const parts = splitSqlColumn(t, config.keywords);
            if (parts.length > 1) {
                const note = condition ? `\t【条件: ${condition}】` : '';
                return `\t${parts.join('\t')}${note}`;
            }
        }
        const note = condition ? `\t【条件: ${condition}】` : '';
        return `\t${t}${note}`;
    };

    const splitByComma = (s: string): string[] => {
        const parts: string[] = [];
        let depth = 0, cur = '';
        for (const ch of s) {
            if (ch === '(') depth++;
            if (ch === ')') depth--;
            if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; }
            else cur += ch;
        }
        if (cur.trim()) parts.push(cur.trim());
        return parts;
    };

    let pendingRest = '';
    for (const { sql, condition } of preprocessed) {
        const upper = sql.toUpperCase().trim();

        if (/^SELECT\b/i.test(upper)) { section = 'select'; pendingRest = sql.replace(/^SELECT\s*/i, '').trim(); continue; }
        if (/^FROM\b/i.test(upper)) { section = 'from'; pendingRest = sql.replace(/^FROM\s*/i, '').trim(); continue; }
        if (/^WHERE\b/i.test(upper)) { section = 'where'; pendingRest = sql.replace(/^WHERE\s*/i, '').trim(); continue; }
        if (/^INSERT\s+INTO\b/i.test(upper)) { section = 'insert'; pendingRest = sql.replace(/^INSERT\s+INTO\s*/i, '').trim(); continue; }
        if (/^UPDATE\b/i.test(upper)) { section = 'update'; pendingRest = sql.replace(/^UPDATE\s*/i, '').trim(); continue; }
        if (/^SET\b/i.test(upper)) { section = 'set'; pendingRest = sql.replace(/^SET\s*/i, '').trim(); continue; }
        if (/^VALUES\b/i.test(upper)) { section = 'values'; pendingRest = sql.replace(/^VALUES\s*/i, '').trim(); continue; }
        if (/^DELETE\s+FROM\b/i.test(upper) || /^DELETE\b/i.test(upper)) { section = 'delete'; pendingRest = sql.replace(/^DELETE\s+(FROM\s+)?/i, '').trim(); continue; }
        if (/^ORDER\s+BY\b/i.test(upper)) { section = 'orderby'; pendingRest = sql.replace(/^ORDER\s+BY\s*/i, '').trim(); continue; }
        if (/^GROUP\s+BY\b/i.test(upper)) { section = 'groupby'; pendingRest = sql.replace(/^GROUP\s+BY\s*/i, '').trim(); continue; }
        if (/^HAVING\b/i.test(upper)) { section = 'having'; pendingRest = sql.replace(/^HAVING\s*/i, '').trim(); continue; }

        if (/(INNER|LEFT|RIGHT|FULL|CROSS|OUTER)?\s*JOIN\b/i.test(upper)) {
            section = 'from';
            const joinType = upper.match(/(INNER|LEFT|RIGHT|FULL|CROSS|OUTER)?\s*JOIN/i)?.[0] ?? 'JOIN';
            pendingRest = sql.replace(/(INNER|LEFT|RIGHT|FULL|CROSS|OUTER)?\s*JOIN\s*/i, '').trim();
            const parts = pendingRest.split(/\s+/);
            const tbl = parts[0] || pendingRest;
            const alias = parts[1];
            if (alias) aliasMap.set(alias, tbl);
            outputSections.from.push(`\t${tbl}${alias ? ` (${alias})` : ''} （${joinType}）`);
            pendingRest = '';
            continue;
        }

        const workLine = (pendingRest ? pendingRest + ' ' + sql : sql).trim();
        pendingRest = '';
        if (!workLine) continue;

        if (section === 'select' || section === 'groupby' || section === 'insert' || section === 'values') {
            const items = splitByComma(workLine).filter(Boolean);
            let target: string[];
            if (section === 'select') target = outputSections.select;
            else if (section === 'groupby') target = outputSections.groupby;
            else if (section === 'insert') target = outputSections.insert;
            else target = outputSections.values;

            items.forEach(item => {
                const cleaned = item.replace(/^\(|\)$/g, '').trim();
                if (cleaned) target.push(`\t${cleaned}`);
            });
        } else if (section === 'from' || section === 'update' || section === 'delete') {
            const target = section === 'from' ? outputSections.from : (section === 'update' ? outputSections.update : outputSections.delete);
            const tables = splitByComma(workLine);
            tables.forEach(entry => {
                const p = entry.trim().split(/\s+/);
                const tbl = p[0];
                const alias = p[1];
                if (alias) aliasMap.set(alias, tbl);
                target.push(`\t${tbl}${alias ? ` (${alias})` : ''}`);
            });
        } else if (section === 'set') {
            const items = splitByComma(workLine).filter(Boolean);
            items.forEach(item => {
                const cmp = item.match(/^(.+?)\s*=\s*(.+)$/);
                if (cmp) {
                    outputSections.set.push(`\t${cmp[1].trim()}\t=\t${cmp[2].trim()}`);
                } else {
                    outputSections.set.push(`\t${item.trim()}`);
                }
            });
        } else if (section === 'where' || section === 'having') {
            const target = section === 'where' ? outputSections.where : outputSections.having;
            const condParts = workLine.replace(/\s+(AND|OR)\s+(?!.*AND.*(?:AND|OR))/gi, '\n$1 ').split('\n');
            condParts.forEach(part => {
                const isAnd = /^AND\b/i.test(part.trim());
                const isOr = /^OR\b/i.test(part.trim());
                const stripped = part.replace(/^(AND|OR)\s+/i, '').trim();
                if (stripped) {
                    if (isAnd && config.lineBreaks?.and && target.length > 0) {
                        target.push("");
                    }
                    const prefix = isAnd ? (config.headers?.and || 'AND') : (isOr ? 'OR' : '');
                    const lineOutput = parseConditionLine(stripped, condition);
                    target.push(prefix ? (prefix + lineOutput) : lineOutput);
                }
            });
        } else if (section === 'orderby') {
            const items = splitByComma(workLine);
            items.forEach(item => {
                const t = item.trim();
                if (/\bDESC\b/i.test(t)) {
                    outputSections.orderby.push(`\t${t.replace(/\s*DESC\s*$/i, '').trim()}\t降順`);
                } else {
                    outputSections.orderby.push(`\t${t.replace(/\s*ASC\s*$/i, '').trim()}\t昇順`);
                }
            });
        }
    }

    const lines: string[] = [];
    const sectionOrder: (keyof typeof outputSections)[] = ['insert', 'values', 'update', 'set', 'delete', 'select', 'from', 'where', 'orderby', 'groupby', 'having'];
    for (const key of sectionOrder) {
        const rows = outputSections[key];
        if (rows.length > 0) {
            const rule = (config.revertRules || []).find(r =>
                r.keyword.toLowerCase() === key.toLowerCase() ||
                r.keyword.replace(/\s+/g, '').toLowerCase() === key.toLowerCase()
            );

            if (rule) {
                if (rule.lineBreak && lines.length > 0) lines.push('');
                lines.push(rule.header || `■ ${key.toUpperCase()}`);
            } else {
                lines.push(`■ ${key.toUpperCase()}`);
            }
            lines.push(...rows);
        }
    }
    return lines.join('\n');
};

const smartFormatSqlDesign = (input: string, config: ParserConfig): string => {
    if (!input.trim()) return input;

    let text = input;

    if (config.deleteChars && config.deleteChars.length > 0) {
        const escapedChars = config.deleteChars.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const deleteRegex = new RegExp(`(${escapedChars.join('|')})`, 'g');
        text = text.replace(deleteRegex, '');
    }

    text = text.replace(/StringBuilder\s+\w+\s*=\s*new\s+StringBuilder\(\s*\)\s*;/gi, '');
    text = text.replace(/[\w$]+\.append\s*\(\s*\"?/gi, '');
    text = text.replace(/\"?\s*\)\s*;/g, '');
    text = text.replace(/\"/g, '').replace(/\+/g, '');

    let lines = text.split('\n').map(line => line.replace(/\t/g, ' ').replace(/\s+$/g, ''));

    const preprocessedLines: string[] = [];
    lines.forEach(line => {
        const trimmed = line.trim().toUpperCase();
        const rule = (config.revertRules || []).find(r => r.keyword.toUpperCase() === trimmed);

        if (rule) {
            if (rule.lineBreak && preprocessedLines.length > 0) {
                preprocessedLines.push('');
            }
            preprocessedLines.push(rule.header || trimmed);
        } else {
            preprocessedLines.push(line);
        }
    });
    lines = preprocessedLines;

    const formatConfiguredBlocks = (src: string[]): string[] => {
        let result = [...src];
        (config.revertTKMapping || []).forEach(cfg => {
            for (let i = 0; i < result.length; i++) {
                const line = result[i];
                const trimmed = line.trim();
                if (trimmed.startsWith(cfg.label)) {
                    const gapToValue1 = "\t".repeat(cfg.offsets[0]);
                    if (cfg.type === 'text') {
                        if (trimmed.includes('：') || trimmed.includes(':')) {
                            const splitChar = trimmed.includes('：') ? '：' : ':';
                            const labelPart = trimmed.substring(0, trimmed.indexOf(splitChar)).trim();
                            const valuePart = trimmed.substring(trimmed.indexOf(splitChar) + 1).trim();
                            result[i] = `${labelPart}${splitChar}${gapToValue1}${valuePart}`;
                        } else {
                            result[i] = trimmed;
                        }
                    } else if (cfg.type === 'table') {
                        result[i] = trimmed;
                    }
                }
            }
        });
        return result;
    };

    const formatTableHeaders = (src: string[]): string[] => {
        const result = [...src];
        (config.revertTKMapping || []).filter((c: any) => c.type === 'table').forEach((cfg: any) => {
            for (let i = 0; i < result.length; i++) {
                const trimmed = result[i].trim();
                if (trimmed === cfg.label || trimmed.startsWith(cfg.label + ' ')) {
                    const nextIdx = i + 1;
                    if (nextIdx >= result.length) continue;
                    const nextLine = result[nextIdx].trim();
                    if (!nextLine) continue;

                    let header = "";
                    const gap = "\t".repeat(cfg.offsets[1] || 1);
                    if (cfg.id === 'ext-items' || cfg.id === 'ins-items') {
                        header = config.splitEnabled ? `エイリアス${gap}カラム名${gap}セット内容` : `カラム名${gap}セット内容`;
                    } else if (cfg.id === 'log-output') header = `レベル${gap}メッセージ`;

                    if (header && !nextLine.includes(header.split('\t')[0])) {
                        const lead = "\t".repeat(cfg.offsets[0] || 1);
                        result.splice(nextIdx, 0, lead + header);
                    }
                }
            }
        });
        return result;
    };

    const formatTwoColumnTables = (src: string[]): string[] => {
        const result = [...src];
        const tableHeaderKeywords = ['カラム名', 'セット内容', '抽出項目', '挿入項目', 'レベル', 'メッセージ'];
        const isHeaderLine = (line: string) => tableHeaderKeywords.some(k => line.includes(k));

        let i = 0;
        while (i < result.length) {
            if (!isHeaderLine(result[i])) { i++; continue; }
            const start = i;
            let end = i;
            for (let j = i + 1; j < result.length; j++) {
                if (!result[j].trim() || isHeaderLine(result[j]) || result[j].trim().startsWith('■')) break;
                end = j;
            }
            const rows: { idx: number; col1: string; col2: string }[] = [];
            for (let k = start; k <= end; k++) {
                const trimmed = result[k].trim();
                if (!trimmed) continue;
                if (trimmed.includes('カラム名') && trimmed.includes('\t')) {
                    const parts = trimmed.split(/\t/);
                    rows.push({ idx: k, col1: (parts[0] || '').trim(), col2: (parts[1] || '').trim() });
                } else {
                    const m = trimmed.match(/^(\S(?:.*?\S)?)\s{2,}(.*\S.*)$/) || trimmed.match(/^(\S+)\s+(.+)$/);
                    if (m) rows.push({ idx: k, col1: m[1], col2: m[2] });
                }
            }
            if (rows.length > 0) {
                rows.forEach(({ idx: lineIdx, col1, col2 }) => {
                    const isSplittableBlock = result[start].toLowerCase().includes('セット内容') || result[start].toLowerCase().includes('抽出項目') || result[start].toLowerCase().includes('挿入項目');
                    if (config.splitEnabled && isSplittableBlock) {
                        const splitParts = splitSqlColumn(col2, config.keywords);
                        result[lineIdx] = `${col1}\t` + splitParts.join('\t');
                    } else {
                        result[lineIdx] = `${col1}\t${col2}`;
                    }
                });
            }
            i = end + 1;
        }
        return result;
    };

    const formatJoinBlocks = (src: string[]): string[] => {
        const result = [...src];
        const SPLIT_REGEX = /\s+(AND|OR)\s+/g;
        let i = 0;
        while (i < result.length) {
            if (!result[i].trim().startsWith('・')) { i++; continue; }
            let offset = 1;
            while (i + offset < result.length) {
                const idx = i + offset;
                if (result[idx].trim().startsWith('■') || result[idx].trim().startsWith('・')) break;
                if (SPLIT_REGEX.test(result[idx])) {
                    const placeholders: string[] = [];
                    const protectedLine = result[idx].replace(/BETWEEN\s+[\s\S]*?\s+AND\b/gi, (m) => {
                        placeholders.push(m);
                        return `__BW_PH_${placeholders.length - 1}__`;
                    });
                    const parts = protectedLine.replace(SPLIT_REGEX, '\n$1 ').split('\n');
                    if (parts.length > 1) {
                        const cleanedParts = parts.map(p => p.trim().replace(/__BW_PH_(\d+)__/g, (_, idx) => placeholders[parseInt(idx)])).filter(p => p);
                        if (cleanedParts.length > 0) result.splice(idx, 1, ...cleanedParts);
                    }
                }
                offset++;
            }
            const joinStart = i + 1;
            const joinLines: { idx: number; op: string; rest: string }[] = [];
            for (let j = joinStart; j < result.length; j++) {
                const trimmed = result[j].trim();
                if (!trimmed) continue;
                if (trimmed.startsWith('■') || trimmed.startsWith('・')) break;
                const m = trimmed.match(/^(ON|AND|OR)\s+(.*)$/);
                if (m) joinLines.push({ idx: j, op: m[1], rest: m[2] });
            }
            if (joinLines.length > 0) {
                const BETWEEN_REGEX = /^(.*?)\s+BETWEEN\s+(.*?)\s+AND\s+(.*?)$/i;
                const COMPARE_REGEX = /^(.*?)\s*(=|<=|>=|<>|!=|<|>)\s*(.*)$/;
                const andRule = (config.revertRules || []).find(r => r.keyword.toUpperCase() === 'AND');
                joinLines.forEach(({ idx: lineIdx, op, rest }) => {
                    const trimmedRest = rest.trim();
                    const between = trimmedRest.match(BETWEEN_REGEX);
                    const displayOp = op.toUpperCase() === 'AND' ? (andRule?.header || 'AND') : op;
                    if (between) result[lineIdx] = `\t${displayOp}\t${between[1].trim()}\tBETWEEN\t${between[2].trim()}\t～ ${between[3].trim()}`;
                    else {
                        const compare = trimmedRest.match(COMPARE_REGEX);
                        if (compare) result[lineIdx] = `\t${displayOp}\t${compare[1].trim()}\t${compare[2]}\t${compare[3].trim()}`;
                        else result[lineIdx] = `\t${displayOp}\t${trimmedRest}`;
                    }
                });
                const nextIdx = joinLines[joinLines.length - 1].idx + 1;
                if (nextIdx < result.length && result[nextIdx].trim().startsWith('・')) result.splice(nextIdx, 0, '');
                i = nextIdx;
            } else i++;
        }
        return result;
    };

    const formatHeaderBlocks = (src: string[]): string[] => {
        const result = [...src];
        for (let i = 0; i < result.length; i++) {
            if (!result[i].trim().startsWith('■')) continue;
            for (let j = i + 1; j < result.length; j++) {
                const l = result[j];
                if (!l.trim() || l.trim().startsWith('■') || /^・.*（.*JOIN.*）/.test(l.trim()) || l.trim().startsWith('【') || l.startsWith('\t')) break;
                result[j] = `\t${l.trimStart()}`;
            }
        }
        return result;
    };

    lines = formatConfiguredBlocks(lines);
    lines = formatTableHeaders(lines);
    lines = formatTwoColumnTables(lines);
    lines = formatJoinBlocks(lines);
    lines = formatHeaderBlocks(lines);

    if (config.splitEnabled) {
        lines = lines.map(line => {
            if (line.includes('\t')) return line;
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('■') || trimmed.startsWith('・') || trimmed.startsWith('【')) return line;
            const split = splitSqlColumn(line, config.keywords);
            return split.length > 1 ? split.join('\t') : line;
        });
    }
    return lines.join('\n');
};

const RevertTKGrid = React.memo((props: {
    content: string,
    defaultWidth: number,
    customWidths: Record<number, number>,
    translationDict: any[],
    selections: Record<string, string>,
    onSelectionChange: (key: string, value: string) => void,
    hoveredUid: string | null,
    hoveredKey: string | null,
    onHover: (uid: string | null, key: string | null) => void,
    copiedKey: string | null,
    onCopySegment: (key: string) => void
}) => {
    if (!props.content) return null;

    const lines = props.content.split('\n');
    const dataRows = useMemo(() => lines.map(line => line.split('\t')), [lines]);
    const maxCols = useMemo(() => Math.max(...dataRows.map(row => row.length)), [dataRows]);
    const [copiedCell, setCopiedCell] = useState<{ r: number, c: number } | null>(null);
    const [tooltipState, setTooltipState] = useState<{ seg: TranslatedSegment, rect: DOMRect } | null>(null);

    const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
    const [lastSelectedRow, setLastSelectedRow] = useState<number | null>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (selectedRows.size === 0) return;
            const target = e.target as HTMLElement;
            if (target.closest('td[data-row-selector="true"]')) {
                return; // Let the row selection handler deal with it
            }
            setSelectedRows(new Set());
            setLastSelectedRow(null);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [selectedRows]);

    const handleRowSelection = (e: React.MouseEvent, rIdx: number) => {
        e.preventDefault();
        e.stopPropagation();

        const newSet = new Set(selectedRows);
        if (e.shiftKey && lastSelectedRow !== null) {
            const start = Math.min(lastSelectedRow, rIdx);
            const end = Math.max(lastSelectedRow, rIdx);
            if (!e.ctrlKey && !e.metaKey) {
                newSet.clear();
            }
            for (let i = start; i <= end; i++) {
                newSet.add(i);
            }
        } else if (e.ctrlKey || e.metaKey) {
            if (newSet.has(rIdx)) {
                newSet.delete(rIdx);
            } else {
                newSet.add(rIdx);
            }
            setLastSelectedRow(rIdx);
        } else {
            newSet.clear();
            newSet.add(rIdx);
            setLastSelectedRow(rIdx);
        }
        setSelectedRows(newSet);
    };

    useEffect(() => {
        if (!props.hoveredKey) {
            setTooltipState(null);
        }
    }, [props.hoveredKey]);

    const segmentedRows = useMemo(() => {
        if (props.translationDict.length === 0) return [];
        return dataRows.map((row, rIdx) =>
            row.map((cellText, cIdx) => {
                const text = cellText || '';
                if (!text) return null;
                return getSegmentsFromText(text, `${rIdx}-${cIdx}`, props.translationDict, props.selections, 'rg');
            })
        );
    }, [dataRows, props.translationDict, props.selections]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && selectedRows.size > 0) {
                if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

                const sortedSelected = Array.from(selectedRows).sort((a, b) => a - b);
                const textToCopy = sortedSelected.map(rIdx => {
                    const row = dataRows[rIdx];
                    return row.map((cellText, cIdx) => {
                        const segs = segmentedRows[rIdx]?.[cIdx];
                        if (segs) {
                            return segs.map(s => s.text).join('');
                        }
                        return cellText || '';
                    }).join('\t');
                }).join('\n');

                navigator.clipboard.writeText(textToCopy);

                // Visual feedback globally
                setCopiedCell({ r: -1, c: -1 });
                setTimeout(() => setCopiedCell(null), 500);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedRows, dataRows, segmentedRows]);

    const handleCellClick = (text: string | undefined, r: number, c: number) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopiedCell({ r, c });
        setTimeout(() => setCopiedCell(null), 1000);
    };

    const getColWidth = (index: number, defaultWidth: number, customWidths: Record<number, number>) => {
        return customWidths[index] || defaultWidth;
    };

    return (
        <div
            className="flex-1 overflow-auto custom-scrollbar bg-white border border-gray-200 shadow-inner select-none"
        >
            <table className="border-collapse table-fixed min-w-full">
                <thead>
                    <tr className="bg-gray-100/90 sticky top-0 z-10 shadow-sm shadow-gray-200/50">
                        <th className="w-10 px-2 py-1.5 text-[10px] font-black text-gray-500 border-r border-b border-gray-300 text-center bg-gray-100 tracking-tighter">#</th>
                        {Array.from({ length: maxCols }).map((_, i) => (
                            <th
                                key={i}
                                className="px-3 py-1.5 text-[10px] font-black text-gray-600 border-r border-b border-gray-300 text-left uppercase tracking-wider bg-gray-50 overflow-hidden text-ellipsis whitespace-nowrap"
                                style={{ width: getColWidth(i, props.defaultWidth, props.customWidths) }}
                            >
                                {getExcelColumnName(i)}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {dataRows.map((row, rIdx) => (
                        <tr key={rIdx} className={`hover:bg-amber-50/60 transition-colors group ${selectedRows.has(rIdx) ? '!bg-amber-100/90 shadow-inner' : ''}`}>
                            <td
                                onClick={(e) => handleRowSelection(e, rIdx)}
                                data-row-selector="true"
                                className={`bg-gray-50 px-2 py-1.5 text-[10px] font-bold text-gray-400 border-r border-b border-gray-200 text-center cursor-pointer hover:bg-amber-200/80 hover:text-amber-800 transition-colors ${selectedRows.has(rIdx) ? '!bg-amber-500 !text-white' : ''}`}>
                                {rIdx + 1}
                            </td>
                            {Array.from({ length: maxCols }).map((_, cIdx) => {
                                const cellText = row[cIdx];
                                const isHeader = cellText?.trim() === 'カラム名' || cellText?.trim() === 'セット内容';
                                const isSection = row.length === 1 && cIdx === 0 && row[0]?.trim().startsWith('■');
                                const isJoin = row.length === 1 && cIdx === 0 && row[0]?.trim().startsWith('・');
                                const isCopied = copiedCell?.r === rIdx && copiedCell?.c === cIdx;

                                return (
                                    <td
                                        key={cIdx}
                                        onClick={(e) => {
                                            // Only handle cell click if we didn't click a segment or something interactive
                                            if ((e.target as HTMLElement).closest('.group\\/opt')) return;
                                            handleCellClick(cellText, rIdx, cIdx);
                                        }}
                                        className={`px-3 py-1.5 text-[12px] border-r border-b border-gray-200 transition-all font-sans relative cursor-cell whitespace-pre-wrap
                                            ${cellText ? 'text-gray-800 font-medium' : 'bg-gray-50/10'}
                                            ${isSection ? 'bg-amber-50 font-black text-amber-900 border-b-2 border-amber-200' : ''}
                                            ${isJoin ? 'bg-indigo-50 font-black text-indigo-900' : ''}
                                            ${isHeader ? 'bg-indigo-600 text-white font-black' : ''}
                                            ${isCopied ? '!bg-green-100 !text-green-800' : ''}
                                            ${!cellText && !isSection && !isJoin ? 'hover:bg-gray-100' : 'hover:bg-indigo-50/30'}
                                        `}
                                        colSpan={row.length === 1 && cIdx === 0 ? maxCols : 1}
                                        style={row.length === 1 && cIdx > 0 ? { display: 'none' } : {}}
                                        title={cellText ? "Click to copy cell" : ""}
                                    >
                                        <div className={`line-clamp-2 hover:line-clamp-none transition-all ${isCopied ? 'scale-105' : ''}`}>
                                            {cellText ? (
                                                segmentedRows[rIdx]?.[cIdx] ? (
                                                    segmentedRows[rIdx][cIdx].map(seg => (
                                                        <MemoizedSegment
                                                            key={seg.uid}
                                                            seg={seg}
                                                            lIdx={rIdx}
                                                            hoveredUid={props.hoveredUid}
                                                            hoveredKey={props.hoveredKey}
                                                            onHover={props.onHover}
                                                            copiedKey={props.copiedKey}
                                                            onShowTooltip={(s, r) => setTooltipState({ seg: s, rect: r })}
                                                            onClick={(s) => {
                                                                if (window.getSelection()?.toString()) return;
                                                                navigator.clipboard.writeText(s.text);
                                                                props.onCopySegment(s.key);
                                                            }}
                                                        />
                                                    ))
                                                ) : cellText
                                            ) : ''}
                                        </div>
                                        {isCopied && (
                                            <span className="absolute top-0 right-0 bg-green-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-bl shadow-sm animate-in fade-in zoom-in duration-200">
                                                COPIED CELL
                                            </span>
                                        )}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
            {tooltipState && props.hoveredKey === tooltipState.seg.key && (
                <div
                    className="fixed z-[99999] flex flex-col bg-white rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.4),0_0_1px_rgba(0,0,0,0.1)] border border-indigo-200 py-1.5 min-w-[140px] animate-in slide-in-from-left-2 duration-200 pointer-events-auto cursor-default"
                    style={{
                        top: tooltipState.rect.top,
                        left: tooltipState.rect.right + 8, // +8 for padding
                    }}
                    onMouseEnter={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Speech bubble arrow */}
                    <div className="absolute top-3 -left-1.5 w-3 h-3 bg-white border-l border-b border-indigo-200 rotate-45"></div>

                    <div className="max-h-[220px] overflow-y-auto custom-scrollbar flex flex-col pt-0.5">
                        {tooltipState.seg.options.map((opt, oIdx) => (
                            <button
                                key={oIdx}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    props.onSelectionChange(tooltipState.seg.key, opt);
                                    if (!window.getSelection()?.toString()) {
                                        navigator.clipboard.writeText(opt);
                                        props.onCopySegment(tooltipState.seg.key);
                                    }
                                }}
                                className={`px-3 py-2 text-[11px] font-bold transition-all text-left flex items-center gap-2
                                    ${tooltipState.seg.text === opt
                                        ? 'bg-indigo-600 text-white'
                                        : 'text-gray-700 hover:bg-indigo-50 hover:text-indigo-600'}
                                `}
                            >
                                <span className="opacity-40 text-[9px] w-3">{oIdx + 1}</span>
                                <span className="flex-1 truncate">{opt}</span>
                                {tooltipState.seg.text === opt && <span className="text-[10px]">✓</span>}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
});


const DictionaryRow = React.memo(({ item, displayIdx, originalIdx, copyFeedback, onCopy, onEdit, onDelete, searchTerm, globalSearchTerm }: {
    item: TranslateEntry,
    displayIdx: number,
    originalIdx: number,
    copyFeedback: any,
    onCopy: any,
    onEdit: (item: TranslateEntry, idx: number) => void,
    onDelete: (idx: number) => void,
    searchTerm: string,
    globalSearchTerm: string
}) => (
    <tr className="border-b border-gray-200 hover:bg-indigo-50/60 transition-colors group/row">
        <td className="w-12 px-2 py-2.5 text-center border-r border-gray-100 text-[10px] text-gray-400 font-bold select-none bg-gray-50/30 group-hover/row:bg-indigo-50/0 transition-colors">
            {displayIdx + 1}
        </td>

        <td
            className={`px-4 py-2.5 border-r border-gray-200 cursor-pointer align-middle transition-all duration-300 relative
                ${copyFeedback?.row === originalIdx && copyFeedback.col === 'jp' ? 'bg-green-100' : ''}
            `}
            onClick={() => onCopy(item.japanese, originalIdx, 'jp')}
        >
            <div className="flex justify-between items-center group/cell">
                <div className="text-[12px] font-bold text-gray-800 leading-relaxed mb-0.5 break-words">
                    <HighlightText text={item.japanese} term={searchTerm} globalTerm={globalSearchTerm} />
                </div>
                {copyFeedback?.row === originalIdx && copyFeedback.col === 'jp' && <span className="text-[9px] text-green-600 font-black animate-pulse select-none pointer-events-none">COPY!</span>}
            </div>
        </td>

        <td
            className={`px-4 py-2.5 border-r border-gray-200 cursor-pointer align-middle transition-all duration-300 relative
                ${copyFeedback?.row === originalIdx && copyFeedback.col === 'en' ? 'bg-green-100' : ''}
            `}
            onClick={() => onCopy(item.english, originalIdx, 'en')}
        >
            <div className="flex justify-between items-center">
                <div className="text-[12px] font-mono font-black text-indigo-600 leading-tight break-all uppercase group-hover/row:text-indigo-700 text-left w-full">
                    <HighlightText text={item.english} term={searchTerm} globalTerm={globalSearchTerm} />
                </div>
                {copyFeedback?.row === originalIdx && copyFeedback.col === 'en' && <span className="text-[9px] text-green-600 font-black animate-pulse select-none pointer-events-none">COPY!</span>}
            </div>
        </td>

        <td
            className={`px-4 py-2.5 cursor-pointer align-middle transition-all duration-300 relative group/last
                ${copyFeedback?.row === originalIdx && copyFeedback.col === 'vi' ? 'bg-green-100' : ''}
            `}
            onClick={() => onCopy(item.vietnamese, originalIdx, 'vi')}
        >
            <div className="flex justify-between items-center">
                <div className="text-[12px] font-bold text-teal-600 leading-tight break-words font-sans group-hover/row:text-teal-700">
                    <HighlightText text={item.vietnamese} term={searchTerm} globalTerm={globalSearchTerm} />
                </div>
                {copyFeedback?.row === originalIdx && copyFeedback.col === 'vi' && <span className="text-[9px] text-green-600 font-black animate-pulse select-none pointer-events-none">COPY!</span>}

                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity bg-white/90 backdrop-blur-sm p-1 rounded-lg shadow-sm border border-gray-100 ring-1 ring-black/5" onClick={(e) => e.stopPropagation()}>
                    <button
                        onClick={(e) => { e.stopPropagation(); onEdit(item, originalIdx); }}
                        className="p-1.5 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded transition-colors"
                        title="Edit"
                    >
                        ✏️
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(originalIdx); }}
                        className="p-1.5 text-red-400 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                        title="Delete"
                    >
                        🗑️
                    </button>
                </div>
            </div>
        </td>
    </tr>
));

const TranslateTab: React.FC = React.memo(() => {
    const {
        activeTab, setActiveTab,
        translateFilePath, setTranslateFilePath,
        excelHeaderColor, formatRemoveSpaces, formatSqlAppend,
        searchStrict, setSearchStrict,
        columnSplitEnabled,
        columnSplitKeywords,
        revertTKColConfig,
        columnSplitApplyToText,
        columnSplitApplyToTable,
        revertTKDeleteChars,
        revertTKMapping,
        translateDeleteChars, translateTruncateDuplicate,
        textCompareExpectedInput, setTextCompareExpectedInput,
        textCompareCurrentInput, setTextCompareCurrentInput,
        runShortcut, connections,
        subTab, setSubTab,
        lineSpacing,
        globalSearchTerm,
        revertTKInput, setRevertTKInput,
        revertTKResult, setRevertTKResult,
        revertTKMode, setRevertTKMode,
        revertTKResultFormat, setRevertTKResultFormat,
        revertRules,
        bulkInput, setBulkInput,
        targetLang, setTargetLang,
        searchTerm, setSearchTerm,
        selections, setSelections,
        data, setData,
        dictionaryLimit, setDictionaryLimit
    } = useAppStore(useShallow(state => ({
        activeTab: state.activeTab,
        setActiveTab: state.setActiveTab,
        translateFilePath: state.translateFilePath,
        setTranslateFilePath: state.setTranslateFilePath,
        excelHeaderColor: state.excelHeaderColor,
        formatRemoveSpaces: state.formatRemoveSpaces,
        formatSqlAppend: state.formatSqlAppend,
        searchStrict: state.searchStrict,
        setSearchStrict: state.setSearchStrict,
        columnSplitEnabled: state.columnSplitEnabled,
        columnSplitKeywords: state.columnSplitKeywords,
        revertTKColConfig: state.revertTKColConfig,
        columnSplitApplyToText: state.columnSplitApplyToText,
        columnSplitApplyToTable: state.columnSplitApplyToTable,
        revertTKDeleteChars: state.revertTKDeleteChars,
        revertTKMapping: state.revertTKMapping,
        translateDeleteChars: state.translateDeleteChars,
        translateTruncateDuplicate: state.translateTruncateDuplicate,
        textCompareExpectedInput: state.textCompareExpectedInput,
        setTextCompareExpectedInput: state.setTextCompareExpectedInput,
        textCompareCurrentInput: state.textCompareCurrentInput,
        setTextCompareCurrentInput: state.setTextCompareCurrentInput,
        runShortcut: state.runShortcut,
        connections: state.connections,
        subTab: state.translateSubTab,
        setSubTab: state.setTranslateSubTab,
        lineSpacing: state.translateLineHeight,
        globalSearchTerm: state.globalSearchTerm,
        revertTKInput: state.revertTKInputStore,
        setRevertTKInput: state.setRevertTKInputStore,
        revertTKResult: state.revertTKResultStore,
        setRevertTKResult: state.setRevertTKResultStore,
        revertTKMode: state.revertTKModeStore,
        setRevertTKMode: state.setRevertTKModeStore,
        revertTKResultFormat: state.revertTKResultFormatStore,
        setRevertTKResultFormat: state.setRevertTKResultFormatStore,
        revertRules: state.revertRules,
        bulkInput: state.translateInputStore,
        setBulkInput: state.setTranslateInputStore,
        targetLang: state.translateTargetLangStore,
        setTargetLang: state.setTranslateTargetLangStore,
        searchTerm: state.translateSearchStore,
        setSearchTerm: state.setTranslateSearchStore,
        selections: state.translateSelectionsStore,
        setSelections: state.setTranslateSelectionsStore,
        data: state.translateDataStore,
        setData: state.setTranslateDataStore,
        dictionaryLimit: state.translateDictionaryLimit,
        setDictionaryLimit: state.setTranslateDictionaryLimit
    })));

    const deferredGlobalSearchTerm = React.useDeferredValue(globalSearchTerm);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copyFeedback, setCopyFeedback] = useState<{ row: number, col: 'jp' | 'en' | 'vi' } | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState(0);
    const [hoveredUid, setHoveredUid] = useState<string | null>(null);
    const [hoveredKey, setHoveredKey] = useState<string | null>(null);
    const [segmentCopyFeedback, setSegmentCopyFeedback] = useState<string | null>(null);
    const [resultCopyFeedback, setResultCopyFeedback] = useState(false);
    const [tooltip, setTooltip] = useState<{ seg: TranslatedSegment, rect: DOMRect } | null>(null);
    const [isMouseInTooltip, setIsMouseInTooltip] = useState(false);

    // Edit modal state
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingEntry, setEditingEntry] = useState<TranslateEntry | null>(null);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);

    const deferredBulkInput = useDeferredValue(bulkInput);
    const deferredRevertTKInput = useDeferredValue(revertTKInput);
    const deferredSearchTerm = useDeferredValue(searchTerm);
    const deferredRevertTKResult = useDeferredValue(revertTKResult);

    // Memoize the dictionary transformation
    const translationDict = useMemo(() => {
        if (data.length === 0) return [];

        const targetKey: keyof TranslateEntry = targetLang === 'en' ? 'english' : targetLang === 'vi' ? 'vietnamese' : 'japanese';
        const sourceKeys: (keyof TranslateEntry)[] = (['japanese', 'english', 'vietnamese'] as (keyof TranslateEntry)[]).filter(k => k !== targetKey);

        const dictMap = new Map<string, Set<string>>();

        data.forEach(entry => {
            const replacement = String(entry[targetKey] || "").trim();
            if (!replacement) return;

            sourceKeys.forEach(sKey => {
                const rawPhrase = String(entry[sKey] || "").trim();
                if (rawPhrase && rawPhrase !== replacement) {
                    const phrase = normalizeText(rawPhrase);
                    if (phrase) {
                        const lowPhrase = phrase.toLowerCase();
                        if (!dictMap.has(lowPhrase)) {
                            dictMap.set(lowPhrase, new Set());
                        }
                        dictMap.get(lowPhrase)!.add(replacement);
                    }
                }
            });
        });

        const sorted = Array.from(dictMap.entries())
            .map(([phrase, replacements]) => {
                const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                return {
                    phrase,
                    regex: new RegExp(escaped, 'gi'),
                    replacements: Array.from(replacements)
                };
            })
            .sort((a, b) => b.phrase.length - a.phrase.length);

        return sorted;
    }, [data, targetLang]);

    const translatedLines = useMemo(() => {
        if (!deferredBulkInput) return [];
        return deferredBulkInput.split('\n').map((line, lIdx) => ({
            segments: getSegmentsFromText(line, lIdx, translationDict, selections, 't')
        }));
    }, [deferredBulkInput, translationDict, selections]);

    const revertTKTranslatedLines = useMemo(() => {
        if (!deferredRevertTKInput) return [];
        return deferredRevertTKInput.split('\n').map((line, lIdx) => ({
            segments: getSegmentsFromText(line, lIdx, translationDict, selections, 'rt')
        }));
    }, [deferredRevertTKInput, translationDict, selections]);

    const revertTKResultTranslatedLines = useMemo(() => {
        if (!deferredRevertTKResult) return [];
        return deferredRevertTKResult.split('\n').map((line, lIdx) => ({
            segments: getSegmentsFromText(line, lIdx, translationDict, selections, 'rr')
        }));
    }, [deferredRevertTKResult, translationDict, selections]);
    const defaultColWidth = 100;
    const parsedCustomWidths = useMemo<Record<number, number>>(() => {
        const widths: Record<number, number> = {};
        if (!revertTKColConfig.trim()) return widths;
        revertTKColConfig.split(',').forEach(part => {
            const [col, val] = part.split(':');
            if (col && val) {
                const colName = col.trim().toUpperCase();
                const widthVal = parseInt(val.trim());
                if (!isNaN(widthVal)) {
                    // Convert column name (A, B, C...) to index
                    let idx = 0;
                    for (let i = 0; i < colName.length; i++) {
                        idx = idx * 26 + (colName.charCodeAt(i) - 64);
                    }
                    widths[idx - 1] = widthVal;
                }
            }
        });
        return widths;
    }, [revertTKColConfig]);

    const inputRef = useRef<HTMLTextAreaElement>(null);
    const outputRef = useRef<HTMLDivElement>(null);
    const highlighterRef = useRef<HTMLDivElement>(null);
    const revertTKInputRef = useRef<HTMLTextAreaElement>(null);
    const scrollSourceRef = useRef<HTMLElement | null>(null);

    const handleInputScroll = React.useCallback(() => {
        if (!inputRef.current) return;
        if (scrollSourceRef.current && scrollSourceRef.current !== inputRef.current) return;

        scrollSourceRef.current = inputRef.current;
        const { scrollTop, scrollLeft } = inputRef.current;

        requestAnimationFrame(() => {
            if (outputRef.current) {
                outputRef.current.scrollTop = scrollTop;
                outputRef.current.scrollLeft = scrollLeft;
            }
            if (highlighterRef.current) {
                highlighterRef.current.scrollTop = scrollTop;
                highlighterRef.current.scrollLeft = scrollLeft;
            }
            // Sync input gutter
            const inputGutter = inputRef.current?.parentElement?.previousElementSibling;
            if (inputGutter) inputGutter.scrollTop = scrollTop;

            // Sync output gutter
            const outputGutter = outputRef.current?.previousElementSibling;
            if (outputGutter) outputGutter.scrollTop = scrollTop;

            setTimeout(() => { if (scrollSourceRef.current === inputRef.current) scrollSourceRef.current = null; }, 50);
        });
    }, []);

    const handleOutputScroll = React.useCallback(() => {
        if (!outputRef.current) return;
        if (scrollSourceRef.current && scrollSourceRef.current !== outputRef.current) return;

        scrollSourceRef.current = outputRef.current;
        const { scrollTop, scrollLeft } = outputRef.current;

        requestAnimationFrame(() => {
            if (inputRef.current) {
                inputRef.current.scrollTop = scrollTop;
                inputRef.current.scrollLeft = scrollLeft;
            }
            if (highlighterRef.current) {
                highlighterRef.current.scrollTop = scrollTop;
                highlighterRef.current.scrollLeft = scrollLeft;
            }
            // Sync input gutter
            const inputGutter = inputRef.current?.parentElement?.previousElementSibling;
            if (inputGutter) inputGutter.scrollTop = scrollTop;

            // Sync output gutter
            const outputGutter = outputRef.current?.previousElementSibling;
            if (outputGutter) outputGutter.scrollTop = scrollTop;

            setTimeout(() => { if (scrollSourceRef.current === outputRef.current) scrollSourceRef.current = null; }, 50);
        });
    }, []);

    const handleRevertTKInputScroll = React.useCallback(() => {
        if (revertTKInputRef.current) {
            const { scrollTop, scrollLeft } = revertTKInputRef.current;
            requestAnimationFrame(() => {
                if (highlighterRef.current) {
                    highlighterRef.current.scrollTop = scrollTop;
                    highlighterRef.current.scrollLeft = scrollLeft;
                }
                const gutter = revertTKInputRef.current?.parentElement?.previousElementSibling;
                if (gutter) gutter.scrollTop = scrollTop;
            });
        }
    }, []);

    const handleFormatInput = () => {
        if (!bulkInput.trim()) return;

        let processedText = bulkInput;

        // Logic 2: sql.append transformation
        if (formatSqlAppend) {
            const lines = processedText.split('\n');
            const extractedLines: string[] = [];

            lines.forEach(line => {
                let s = line.trim();
                if (s.toLowerCase().includes('.append')) {
                    const first = s.indexOf('(');
                    const last = s.lastIndexOf(')');

                    if (first !== -1) {
                        let content = (last > first)
                            ? s.substring(first + 1, last)
                            : s.substring(first + 1);

                        // Clean up Java artifacts: " and + and ;
                        content = content.replace(/\"/g, '').replace(/\+/g, '').replace(/;/g, '').trim();

                        if (content) {
                            extractedLines.push(content);
                        }
                    }
                } else if (s) {
                    let cleaned = s.replace(/\"/g, '').replace(/\+/g, '').replace(/;/g, '').trim();
                    if (cleaned) extractedLines.push(cleaned);
                }
            });

            if (extractedLines.length > 0) {
                processedText = extractedLines.join('\n');
            }
        }

        // Custom delete chars (Independent)
        if (translateDeleteChars) {
            const escapeIdx = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Split by | to get individual chars or strings to delete
            const targets = translateDeleteChars.split('|').map(c => c.trim()).filter(Boolean);
            if (targets.length > 0) {
                const charsPattern = targets.map(t => escapeIdx(t)).join('|');
                // Use a regex that matches any of the targets
                const regex = new RegExp(charsPattern, 'g');
                processedText = processedText.replace(regex, '');
            }
        }

        // Logic 1 & 3: Remove space, tab, and commas
        if (formatRemoveSpaces) {
            // Remove commas first
            processedText = processedText.replace(/,/g, '');

            const lines = processedText.split('\n');
            let formattedLines = lines.map(line => {
                // Replace tabs and multiple spaces with a single space, then trim
                return line.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
            }).filter(line => line.length > 0);

            processedText = formattedLines.join('\n');
        }

        // Truncate duplicates (Apply generally)
        if (translateTruncateDuplicate) {
            const lines = processedText.split('\n');
            const uniqueLines = Array.from(new Set(lines));
            processedText = uniqueLines.join('\n');
        }

        setBulkInput(processedText);
    };

    const convertTKToCode = (input: string): string => {
        const lines = input.split('\n');
        const codeLines: string[] = [];
        let inTable = false;

        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) {
                codeLines.push('sb.append(" ");');
                return;
            }

            // Detect section headers
            if (trimmed.startsWith('■') || trimmed.startsWith('【')) {
                codeLines.push(`// ${trimmed}`);
                inTable = false;
                return;
            }

            // Detect table headers
            if (trimmed.includes('カラム名') || trimmed.includes('セット内容')) {
                inTable = true;
                return;
            }

            if (inTable && line.includes('\t')) {
                const parts = line.split('\t');
                const colName = (parts[0] || '').trim();
                const expression = (parts[1] || '').trim();
                if (expression) {
                    codeLines.push(`sb.append(" , ${expression} /* ${colName} */ ");`);
                } else if (colName) {
                    codeLines.push(`sb.append(" /* ${colName} */ ");`);
                }
            } else {
                // Raw text, wrap in append
                codeLines.push(`sb.append(" ${trimmed} ");`);
            }
        });

        return codeLines.join('\n');
    };



    const handleRevertTK = async () => {
        if (!revertTKInput.trim()) return;
        try {
            let result = '';
            if (revertTKMode === 'TKtoCode') {
                result = convertTKToCode(revertTKInput);
            } else {
                const shouldSplit = columnSplitEnabled && (
                    (revertTKResultFormat === 'text' && columnSplitApplyToText) ||
                    (revertTKResultFormat === 'table' && columnSplitApplyToTable)
                );
                const parserConfig: ParserConfig = {
                    splitEnabled: shouldSplit,
                    keywords: columnSplitKeywords.split('|').map(k => k.trim()).filter(Boolean),
                    deleteChars: revertTKDeleteChars.split('|').map(k => k.trim()).filter(Boolean),
                    revertRules,
                    revertTKMapping
                };

                const isJava = /append\s*\(/i.test(revertTKInput);
                if (isJava) {
                    result = parseJavaSql(revertTKInput, parserConfig);
                } else {
                    result = smartFormatSqlDesign(revertTKInput, parserConfig);
                }
            }
            setRevertTKResult(result);
        } catch (error) {
            console.error('Lỗi khi convert:', error);
            setRevertTKResult(`[SYSTEM ERROR - Báo lỗi này cho Dev nhé]\n${(error as Error).message}\n${(error as Error).stack}`);
        }
    };

    const lastInputRef = useRef(bulkInput);
    const lastRevertInputRef = useRef(revertTKInput);
    const lastTargetLangRef = useRef(targetLang);

    // Reset selections when input changes or target language changes
    useEffect(() => {
        if (bulkInput !== lastInputRef.current || revertTKInput !== lastRevertInputRef.current || targetLang !== lastTargetLangRef.current) {
            setSelections({});
            lastInputRef.current = bulkInput;
            lastRevertInputRef.current = revertTKInput;
            lastTargetLangRef.current = targetLang;
        }
    }, [bulkInput, revertTKInput, targetLang, setSelections]);

    const loadData = async (forceSync = false) => {
        if (!translateFilePath) {
            setLoading(false);
            setError("Đường dẫn file dữ liệu chưa được cấu hình.");
            return;
        }

        setLoading(forceSync ? false : true);
        if (forceSync) setSyncing(true);
        setSyncProgress(0);
        setError(null);

        try {
            const excelPath = translateFilePath.toLowerCase().endsWith('.xlsx')
                ? translateFilePath
                : translateFilePath.replace(/\.json$/i, '.xlsx');
            const jsonPath = translateFilePath.toLowerCase().endsWith('.json')
                ? translateFilePath
                : translateFilePath.replace(/\.xlsx$/i, '.json');

            let entries: TranslateEntry[] = [];

            const performSyncFromExcel = async () => {
                setSyncProgress(10);
                const contents = await readBinaryFile(excelPath);
                setSyncProgress(30);
                const workbook = XLSX.read(contents, { type: 'array' });
                setSyncProgress(50);
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][];

                let startIndex = 0;
                let headerRows: any[][] = [];
                if (jsonData.length > 0) {
                    const firstRowStr = JSON.stringify(jsonData[0]).toLowerCase();
                    if (firstRowStr.includes("japan") || firstRowStr.includes("en") || firstRowStr.includes("vi") || firstRowStr.includes("日")) {
                        startIndex = 1;
                        headerRows = [jsonData[0]];
                    }
                }

                setSyncProgress(70);
                const seenEntries = new Set<string>();
                const uniqueResults: TranslateEntry[] = [];
                let duplicateCount = 0;

                for (let i = startIndex; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if (row) {
                        // Smart cleaning: trim and normalize everything first
                        const jp = String(row[0] || "").trim();
                        const en = String(row[1] || "").trim();
                        const vi = String(row[2] || "").trim();

                        if (jp || en || vi) {
                            // Unique key: Combination of all 3 trimmed/lowercased fields for standard cleaning
                            // This ensures we remove exact duplicates regardless of which column they are in.
                            const uniqueKey = `${jp.toLowerCase()}|${en.toLowerCase()}|${vi.toLowerCase()}`;

                            if (!seenEntries.has(uniqueKey)) {
                                seenEntries.add(uniqueKey);
                                uniqueResults.push({ japanese: jp, english: en, vietnamese: vi });
                            } else {
                                duplicateCount++;
                            }
                        }
                    }
                }

                setSyncProgress(85);
                let writeSucceeded = true;
                let writeError = null;

                if (duplicateCount > 0 && forceSync) {
                    try {
                        const cleanAoa = [
                            ...headerRows,
                            ...uniqueResults.map(item => [item.japanese, item.english, item.vietnamese])
                        ];
                        const newWorksheet = XLSX.utils.aoa_to_sheet(cleanAoa);
                        const newWorkbook = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, firstSheetName);
                        const excelBuffer = XLSX.write(newWorkbook, { bookType: 'xlsx', type: 'array' });
                        await writeBinaryFile(excelPath, new Uint8Array(excelBuffer));
                    } catch (excelErr: any) {
                        console.error("Could not write back to Excel:", excelErr);
                        writeSucceeded = false;
                        const errorStr = excelErr.toString().toLowerCase();
                        if (errorStr.includes("access is denied") || errorStr.includes("permission denied") || errorStr.includes("os error 32")) {
                            writeError = "locked";
                        } else {
                            writeError = excelErr.message || String(excelErr);
                        }
                    }
                }

                setSyncProgress(95);
                await writeTextFile(jsonPath, JSON.stringify(uniqueResults, null, 2));
                setSyncProgress(100);
                return { entries: uniqueResults, cleaned: duplicateCount, writeSucceeded, writeError };
            };

            let syncResult: { entries: TranslateEntry[], cleaned: number, writeSucceeded: boolean, writeError: string | null } | undefined;
            if (forceSync) {
                syncResult = await performSyncFromExcel();
                entries = syncResult.entries;
            } else {
                try {
                    const content = await readTextFile(jsonPath);
                    entries = JSON.parse(content);
                } catch (e) {
                    try {
                        syncResult = await performSyncFromExcel();
                        entries = syncResult.entries;
                    } catch (excelErr) {
                        throw new Error("Không tìm thấy cả file Excel lẫn file JSON dữ liệu.");
                    }
                }
            }

            setData(entries);
            if (forceSync) {
                setTimeout(() => {
                    setSyncing(false);
                    setSyncProgress(0);

                    if (syncResult) {
                        let msg = "JSON: Sync thành công\n";
                        if (syncResult.cleaned > 0) {
                            msg += `Excel: Phát hiện ${syncResult.cleaned} key trùng\n`;
                            if (!syncResult.writeSucceeded) {
                                msg += "Excel: Chưa xóa được do Excel đang mở";
                            } else {
                                msg += "Excel: Đã dọn dẹp thành công";
                            }
                        } else {
                            msg += "Excel: Dữ liệu đã sạch";
                        }
                        alert(msg);
                    } else {
                        alert("JSON: Sync thành công\nExcel: Dữ liệu đã tải");
                    }
                }, 500);
            }
        } catch (err: any) {
            console.error('Error loading data:', err);
            setError(`Lỗi: ${err.message || err}`);
            setSyncing(false);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!hoveredUid && !isMouseInTooltip && tooltip) {
            const timer = setTimeout(() => {
                setTooltip(null);
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [hoveredUid, isMouseInTooltip, tooltip]);

    const handleSync = () => loadData(true);

    const filteredData = useMemo(() => {
        const results = data.map((item, originalIndex) => ({ item, originalIndex }));
        const trimmedSearch = deferredSearchTerm.trim();

        if (!trimmedSearch) return results;
        const searchTerms = trimmedSearch.split('|').map(s => s.trim().toLowerCase()).filter(Boolean);
        if (searchTerms.length === 0) return results;

        return results.filter(({ item }) => {
            return searchTerms.some(term => {
                const lowerJp = item.japanese.toLowerCase();
                const lowerEn = item.english.toLowerCase();
                const lowerVi = item.vietnamese.toLowerCase();

                if (searchStrict) {
                    return lowerJp === term || lowerEn === term || lowerVi === term;
                }
                return lowerJp.includes(term) || lowerEn.includes(term) || lowerVi.includes(term);
            });
        });
    }, [data, deferredSearchTerm, searchStrict]);

    const handleCopy = React.useCallback((text: string, rowIdx: number, col: 'jp' | 'en' | 'vi') => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopyFeedback({ row: rowIdx, col });
        setTimeout(() => setCopyFeedback(null), 600);
    }, []);

    const handleShowTooltip = React.useCallback((seg: TranslatedSegment, rect: DOMRect) => {
        setTooltip({ seg, rect });
    }, []);

    const handleSegmentClick = React.useCallback((s: TranslatedSegment) => {
        if (window.getSelection()?.toString()) return;
        navigator.clipboard.writeText(s.text);
        setSegmentCopyFeedback(s.key);
        setTimeout(() => setSegmentCopyFeedback(null), 1000);
    }, []);

    const setEditingEntryAndIndex = React.useCallback((item: TranslateEntry, idx: number) => {
        setEditingEntry(item);
        setEditingIndex(idx);
        setShowEditModal(true);
    }, []);





    const handleCopyResult = () => {
        if (translatedLines.length === 0) return;

        const fullText = translatedLines.map(line =>
            line.segments.map(seg => seg.text).join('')
        ).join('\n');

        navigator.clipboard.writeText(fullText);
        setResultCopyFeedback(true);
        setTimeout(() => setResultCopyFeedback(false), 2000);
    };


    useEffect(() => {
        if (activeTab === 'translate' || activeTab === 'revert-tk') {
            if (data.length === 0 && !loading) {
                loadData();
            } else if (data.length > 0 && loading) {
                setLoading(false);
            }
        }
    }, [activeTab, data.length, loading]);


    const handleSaveEntry = React.useCallback(async (entry: TranslateEntry) => {
        if (!entry.japanese && !entry.english && !entry.vietnamese) return;

        let newData = [...data];
        if (editingIndex !== null) {
            newData[editingIndex] = entry;
        } else {
            newData = [entry, ...newData];
        }

        setData(newData);
        setShowEditModal(false);
        setEditingEntry(null);
        setEditingIndex(null);

        if (!translateFilePath) return;

        try {
            const excelPath = translateFilePath.toLowerCase().endsWith('.xlsx')
                ? translateFilePath
                : translateFilePath.replace(/\.json$/i, '.xlsx');
            const jsonPath = translateFilePath.toLowerCase().endsWith('.json')
                ? translateFilePath
                : translateFilePath.replace(/\.xlsx$/i, '.json');

            await writeTextFile(jsonPath, JSON.stringify(newData, null, 2));

            const aoa = [
                ['Japanese', 'English', 'Vietnamese'],
                ...newData.map(item => [item.japanese, item.english, item.vietnamese])
            ];
            const worksheet = XLSX.utils.aoa_to_sheet(aoa);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
            const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
            await writeBinaryFile(excelPath, new Uint8Array(excelBuffer));

        } catch (e) {
            console.error("Failed to save data", e);
            setError("Lỗi khi lưu dữ liệu: " + String(e));
        }
    }, [data, editingIndex, translateFilePath]);

    const handleDeleteEntry = React.useCallback(async (idx: number) => {
        if (!confirm("Bạn có chắc muốn xóa từ này không?")) return;

        const newData = [...data];
        newData.splice(idx, 1);
        setData(newData);

        if (!translateFilePath) return;

        try {
            const excelPath = translateFilePath.toLowerCase().endsWith('.xlsx')
                ? translateFilePath
                : translateFilePath.replace(/\.json$/i, '.xlsx');
            const jsonPath = translateFilePath.toLowerCase().endsWith('.json')
                ? translateFilePath
                : translateFilePath.replace(/\.xlsx$/i, '.json');

            await writeTextFile(jsonPath, JSON.stringify(newData, null, 2));

            const aoa = [
                ['Japanese', 'English', 'Vietnamese'],
                ...newData.map(item => [item.japanese, item.english, item.vietnamese])
            ];
            const worksheet = XLSX.utils.aoa_to_sheet(aoa);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
            const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
            await writeBinaryFile(excelPath, new Uint8Array(excelBuffer));

        } catch (e) {
            console.error("Failed to save data", e);
            setError("Lỗi khi xóa dữ liệu: " + String(e));
        }
    }, [data, translateFilePath]);


    return (
        <div className="flex flex-col h-[calc(100vh-80px)] gap-4 p-4 animate-in fade-in duration-300 overflow-hidden font-sans relative">
            {/* Edit Modal */}
            {showEditModal && (
                <div className="absolute inset-0 z-[2000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-indigo-600 px-6 py-4 flex justify-between items-center">
                            <h3 className="font-bold text-white text-lg">
                                {editingIndex !== null ? '✏️ Edit Entry' : '✨ New Entry'}
                            </h3>
                            <button onClick={() => setShowEditModal(false)} className="text-white/80 hover:text-white font-bold text-xl">×</button>
                        </div>
                        <div className="p-6 flex flex-col gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Japanese</label>
                                <textarea
                                    className="w-full border border-gray-300 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium min-h-[80px]"
                                    value={editingEntry?.japanese || ''}
                                    onChange={e => setEditingEntry(prev => ({ ...prev!, japanese: e.target.value }))}
                                    placeholder="Enter Japanese text..."
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">English</label>
                                <textarea
                                    className="w-full border border-gray-300 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono min-h-[60px]"
                                    value={editingEntry?.english || ''}
                                    onChange={e => setEditingEntry(prev => ({ ...prev!, english: e.target.value }))}
                                    placeholder="Enter English translation..."
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Vietnamese</label>
                                <textarea
                                    className="w-full border border-gray-300 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium min-h-[60px]"
                                    value={editingEntry?.vietnamese || ''}
                                    onChange={e => setEditingEntry(prev => ({ ...prev!, vietnamese: e.target.value }))}
                                    placeholder="Enter Vietnamese translation..."
                                />
                            </div>
                        </div>
                        <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t border-gray-100">
                            <button
                                onClick={() => setShowEditModal(false)}
                                className="px-4 py-2 text-gray-500 font-bold text-sm hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => editingEntry && handleSaveEntry(editingEntry)}
                                className="px-6 py-2 bg-indigo-600 text-white font-bold text-sm rounded-lg hover:bg-indigo-700 shadow-lg active:scale-95 transition-all"
                            >
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Quick Translate Context Menu - MOVED INSIDE */}
            {contextMenu && (
                <>
                    <div
                        className="fixed inset-0 z-[2999]"
                        onClick={() => setContextMenu(null)}
                    />
                    <div
                        className="fixed z-[3000] bg-white rounded-xl shadow-xl border border-gray-100 py-2 min-w-[220px] animate-in fade-in zoom-in-95 duration-200 flex flex-col overflow-hidden text-left"
                        style={{ top: contextMenu.y, left: contextMenu.x }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 select-none">
                            ACTIONS
                        </div>
                        <button
                            onClick={() => {
                                const fullText = translatedLines.map(l => l.segments.map(s => s.text).join('')).join('\n');
                                const existing = textCompareExpectedInput ? textCompareExpectedInput + '\n' : '';
                                setTextCompareExpectedInput(existing + fullText);
                                setActiveTab('text-compare');
                                setContextMenu(null);
                            }}
                            className="w-full text-left px-4 py-3 text-xs font-bold text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 flex items-center gap-3 transition-colors group"
                        >
                            <span className="text-lg group-hover:scale-110 transition-transform bg-indigo-100 rounded-lg p-1">👈</span>
                            <div className="flex flex-col">
                                <span>Copy to A</span>
                                <span className="text-[9px] text-gray-400 font-medium group-hover:text-indigo-400">Text Compare (Left Side)</span>
                            </div>
                        </button>
                        <div className="my-1 border-t border-gray-100 mx-4"></div>
                        <button
                            onClick={() => {
                                const fullText = translatedLines.map(l => l.segments.map(s => s.text).join('')).join('\n');
                                const existing = textCompareCurrentInput ? textCompareCurrentInput + '\n' : '';
                                setTextCompareCurrentInput(existing + fullText);
                                setActiveTab('text-compare');
                                setContextMenu(null);
                            }}
                            className="w-full text-left px-4 py-3 text-xs font-bold text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 flex items-center gap-3 transition-colors group"
                        >
                            <span className="text-lg group-hover:scale-110 transition-transform bg-teal-100 rounded-lg p-1">👉</span>
                            <div className="flex flex-col">
                                <span>Copy to B</span>
                                <span className="text-[9px] text-gray-400 font-medium group-hover:text-indigo-400">Text Compare (Right Side)</span>
                            </div>
                        </button>
                    </div>
                </>
            )}

            {activeTab === 'translate' && (
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex flex-wrap items-center gap-4">
                    <div className="flex items-center bg-gray-100 p-1.5 rounded-2xl border border-gray-200 shadow-sm overflow-x-auto max-w-full">
                        <button
                            onClick={() => setSubTab('dictionary')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-300 whitespace-nowrap ${subTab === 'dictionary'
                                ? 'bg-white text-indigo-600 shadow-md scale-105'
                                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                                }`}
                        >
                            <span>📖 DICTIONARY</span>
                        </button>
                        <button
                            onClick={() => setSubTab('quick')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-300 whitespace-nowrap ${subTab === 'quick'
                                ? 'bg-white text-indigo-600 shadow-md scale-105'
                                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                                }`}
                        >
                            <span>⚡ QUICK TRANSLATE</span>
                        </button>
                    </div>

                    <div className="flex-1 flex flex-wrap items-center gap-4 min-w-[200px]">
                        {subTab === 'dictionary' ? (
                            <div className="flex-1 flex items-center gap-4">
                                <div className="flex-1 flex items-center relative group">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400">🔍</span>
                                    <input
                                        type="text"
                                        placeholder="Search Dictionary..."
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        onFocus={(e) => e.target.select()}
                                        className="app-local-search w-full bg-indigo-50 border border-indigo-100 rounded-xl pl-10 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400 shadow-inner font-bold text-indigo-900 transition-all focus:bg-white"
                                    />
                                </div>
                                <label className="flex items-center gap-2 cursor-pointer group shrink-0">
                                    <div className="relative flex items-center">
                                        <input
                                            type="checkbox"
                                            checked={searchStrict}
                                            onChange={(e) => setSearchStrict(e.target.checked)}
                                            className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-gray-300 transition-all checked:border-indigo-600 checked:bg-indigo-600"
                                        />
                                        <span className="absolute text-white opacity-0 peer-checked:opacity-100 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none text-[8px]">✓</span>
                                    </div>
                                    <span className="text-[10px] font-black text-gray-400 group-hover:text-indigo-600 transition-colors uppercase tracking-widest">Strict</span>
                                </label>
                            </div>
                        ) : subTab === 'quick' ? (
                            <div className="flex-1 flex items-center justify-end gap-3">
                                <div className="relative flex items-center gap-1">
                                    <button
                                        onClick={handleFormatInput}
                                        className="px-6 py-2 bg-indigo-600 text-white text-xs font-black rounded-xl hover:bg-indigo-700 transition-all shadow-lg active:scale-95 shrink-0"
                                        title="Standard normalization"
                                    >
                                        ✨ FORMAT
                                    </button>
                                </div>
                            </div>
                        ) : ""}
                    </div>

                    <div className="flex flex-wrap gap-2 justify-end">
                        <button
                            onClick={async () => {
                                const excelPath = translateFilePath.toLowerCase().endsWith('.xlsx')
                                    ? translateFilePath
                                    : translateFilePath.replace(/\.json$/i, '.xlsx');
                                await invoke('open_file', { path: excelPath });
                            }}
                            className="flex items-center gap-2 px-3 py-2 bg-green-50 text-green-600 rounded-xl text-[10px] font-black hover:bg-green-100 border border-green-200 transition-all active:scale-95 shadow-sm"
                            title="Mở Excel để nhập liệu"
                        >
                            📂 OPEN EXCEL
                        </button>

                        <button
                            onClick={handleSync}
                            disabled={syncing}
                            className={`flex items-center gap-3 px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black hover:bg-indigo-700 transition-all active:scale-95 shadow-lg shadow-indigo-200 relative overflow-hidden`}
                            title="Đồng bộ & Làm sạch dữ liệu từ Excel"
                        >
                            {syncing && (
                                <div
                                    className="absolute left-0 top-0 h-full bg-white/20 transition-all duration-300 pointer-events-none"
                                    style={{ width: `${syncProgress}%` }}
                                />
                            )}
                            <span className="relative z-10">
                                {syncing ? `SYNCING ${syncProgress}%` : '⚡ SYNC & CLEAN'}
                            </span>
                        </button>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-hidden bg-white rounded-2xl border border-gray-300 shadow-sm flex flex-col">
                {activeTab === 'revert-tk' ? (
                    <div className="flex-1 flex flex-row overflow-hidden bg-white divide-x divide-gray-200">
                        {/* Left: Input Section */}
                        <div className="flex-[4] flex flex-col min-h-0">
                            <div className="bg-amber-50/50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-amber-600/60 border-b border-amber-100/50 flex items-center justify-between shrink-0 h-14 select-none">
                                <div className="flex items-center gap-6">
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-[8px] text-amber-600/50">INPUT TYPE</span>
                                        <div className="flex bg-white p-0.5 rounded-lg border border-amber-200">
                                            <button
                                                onClick={() => setRevertTKMode('CodetoTK')}
                                                className={`px-3 py-1 rounded-md text-[9px] font-black transition-all ${revertTKMode === 'CodetoTK' ? 'bg-amber-600 text-white shadow-sm' : 'text-gray-400 hover:text-amber-600'}`}
                                            >
                                                CODE → TK
                                            </button>
                                            <button
                                                onClick={() => setRevertTKMode('TKtoCode')}
                                                className={`px-3 py-1 rounded-md text-[9px] font-black transition-all ${revertTKMode === 'TKtoCode' ? 'bg-amber-600 text-white shadow-sm' : 'text-gray-400 hover:text-amber-600'}`}
                                            >
                                                TK → CODE
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => { setRevertTKInput(''); setRevertTKResult(''); }}
                                        className="text-red-400 hover:text-red-600 text-[9px] font-black border border-red-100 px-3 py-2 rounded-xl hover:bg-red-50 transition-colors"
                                    >
                                        CLEAR
                                    </button>
                                    <button
                                        onClick={handleRevertTK}
                                        className="px-10 py-2 bg-amber-600 text-white text-[10px] font-black rounded-xl hover:bg-amber-700 transition-all shadow-lg active:scale-95 flex items-center gap-2"
                                    >
                                        <span className="text-sm">🔄</span>
                                        REVERT
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-hidden bg-white relative flex">
                                {/* Left: Input with line numbers */}
                                <div
                                    className="w-12 bg-gray-50 border-r border-gray-100 flex flex-col font-mono text-sm text-gray-400 pt-6 pb-20 select-none overflow-y-auto overflow-x-hidden shrink-0 custom-scrollbar scrollbar-hide"
                                    style={{
                                        lineHeight: `${lineSpacing}`,
                                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                                    }}
                                >
                                    {(revertTKInput.split('\n').length > 0 ? revertTKInput.split('\n') : ['']).map((_, i) => (
                                        <div key={i} className="text-right pr-3" style={{ lineHeight: `${lineSpacing}` }}>{i + 1}</div>
                                    ))}
                                </div>
                                <div className="flex-1 relative overflow-hidden">
                                    <div
                                        ref={highlighterRef}
                                        className="absolute inset-0 p-6 font-mono text-sm pointer-events-none overflow-hidden box-border z-10"
                                        style={{
                                            lineHeight: `${lineSpacing}`,
                                            tabSize: 4, MozTabSize: 4,
                                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                                        }}
                                    >
                                        <HighlighterOverlay
                                            translatedLines={revertTKTranslatedLines}
                                            hoveredUid={hoveredUid}
                                            hoveredKey={hoveredKey}
                                            lineSpacing={lineSpacing}
                                            globalTerm={deferredGlobalSearchTerm}
                                        />
                                    </div>
                                    <textarea
                                        ref={revertTKInputRef}
                                        wrap="off"
                                        onScroll={handleRevertTKInputScroll}
                                        className="absolute inset-0 w-full h-full p-6 font-mono text-sm outline-none resize-none bg-transparent focus:bg-amber-50/5 transition-colors overflow-auto z-20 border-none box-border text-transparent caret-gray-800"
                                        style={{
                                            lineHeight: `${lineSpacing}`,
                                            whiteSpace: 'pre',
                                            tabSize: 4, MozTabSize: 4,
                                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                                        }}
                                        placeholder="Dán code (Java/C# sql.append, hoặc đoạn thiết kế SQL thô)..."
                                        value={revertTKInput}
                                        onChange={(e) => setRevertTKInput(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex-[6] flex flex-col min-h-0 bg-white">
                            <div className="bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-amber-700 border-b border-gray-100 flex justify-between items-center h-14 shrink-0 select-none">
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2">
                                        <span className="w-5 h-5 flex items-center justify-center bg-amber-100 rounded text-[9px]">2</span>
                                        <span>SQL DESIGN PREVIEW</span>
                                    </div>
                                    <div className="flex bg-gray-50 p-0.5 rounded-lg border border-gray-200">
                                        <button
                                            onClick={() => setRevertTKResultFormat('text')}
                                            className={`px-3 py-1 rounded-md text-[9px] font-black transition-all ${revertTKResultFormat === 'text' ? 'bg-amber-600 text-white shadow-sm' : 'text-gray-400 hover:text-amber-600'}`}
                                        >
                                            TEXT
                                        </button>
                                        <button
                                            onClick={() => setRevertTKResultFormat('table')}
                                            className={`px-3 py-1 rounded-md text-[9px] font-black transition-all ${revertTKResultFormat === 'table' ? 'bg-amber-600 text-white shadow-sm' : 'text-gray-400 hover:text-amber-600'}`}
                                        >
                                            TABLE
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-2 ml-4 border-l border-gray-100 pl-4">
                                        <span className="text-amber-600 font-black text-[9px] whitespace-nowrap uppercase">Result To:</span>
                                        <div className="flex bg-gray-50 p-0.5 rounded-lg border border-gray-200 shadow-sm">
                                            <button
                                                onClick={() => setTargetLang('en')}
                                                className={`px-3 py-1 rounded-md text-[9px] font-black transition-all ${targetLang === 'en' ? 'bg-amber-600 text-white shadow-sm' : 'text-gray-400 hover:text-amber-600'}`}
                                            >
                                                🔡 EN
                                            </button>
                                            <button
                                                onClick={() => setTargetLang('jp')}
                                                className={`px-3 py-1 rounded-md text-[9px] font-black transition-all ${targetLang === 'jp' ? 'bg-amber-600 text-white shadow-sm' : 'text-gray-400 hover:text-amber-600'}`}
                                            >
                                                🇯🇵 JP
                                            </button>
                                            <button
                                                onClick={() => setTargetLang('vi')}
                                                className={`px-3 py-1 rounded-md text-[9px] font-black transition-all ${targetLang === 'vi' ? 'bg-amber-600 text-white shadow-sm' : 'text-gray-400 hover:text-amber-600'}`}
                                            >
                                                🇻🇳 VI
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 mr-2">
                                    <button
                                        onClick={() => revertTKResult && navigator.clipboard.writeText(revertTKResult)}
                                        disabled={!revertTKResult}
                                        className="px-3 py-1.5 rounded-lg text-[10px] font-black bg-white text-amber-600 border border-amber-100 hover:bg-amber-50 disabled:opacity-50 hover:shadow-sm active:scale-95 transition-all flex items-center gap-1.5"
                                    >
                                        <span>📋</span>
                                        COPY
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-hidden flex flex-col bg-white">
                                {revertTKResult ? (
                                    revertTKResultFormat === 'table' ? (
                                        <RevertTKGrid
                                            content={revertTKResult}
                                            defaultWidth={defaultColWidth}
                                            customWidths={parsedCustomWidths}
                                            translationDict={translationDict}
                                            selections={selections}
                                            onSelectionChange={(key, val) => setSelections({ ...selections, [key]: val })}
                                            hoveredUid={hoveredUid}
                                            hoveredKey={hoveredKey}
                                            onHover={(uid, key) => { setHoveredUid(uid); setHoveredKey(key); }}
                                            copiedKey={segmentCopyFeedback}
                                            onCopySegment={(key) => {
                                                setSegmentCopyFeedback(key);
                                                setTimeout(() => setSegmentCopyFeedback(null), 1000);
                                            }}
                                        />
                                    ) : (
                                        <div className="flex-1 overflow-hidden relative flex">
                                            <div
                                                className="w-12 bg-gray-50 border-r border-gray-100 flex flex-col font-mono text-sm text-gray-400 pt-6 pb-20 select-none overflow-y-auto overflow-x-hidden shrink-0 custom-scrollbar scrollbar-hide"
                                                style={{
                                                    lineHeight: `${lineSpacing}`,
                                                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                                                }}
                                            >
                                                {(revertTKResult.split('\n').length > 0 ? revertTKResult.split('\n') : ['']).map((_, i) => (
                                                    <div key={i} className="text-right pr-3" style={{ lineHeight: `${lineSpacing}` }}>{i + 1}</div>
                                                ))}
                                            </div>
                                            <div
                                                className="flex-1 p-6 font-mono text-sm outline-none overflow-auto custom-scrollbar bg-white text-gray-800 box-border"
                                                style={{
                                                    lineHeight: `${lineSpacing}`,
                                                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                                                }}
                                            >
                                                {revertTKResultTranslatedLines.map((line, lIdx) => (
                                                    <div key={lIdx} style={{ minHeight: `${lineSpacing}em` }}>
                                                        {line.segments.length > 0 ? line.segments.map(seg => (
                                                            <MemoizedSegment
                                                                key={seg.uid}
                                                                seg={seg}
                                                                hoveredUid={hoveredUid}
                                                                hoveredKey={hoveredKey}
                                                                onHover={(u, k) => { setHoveredUid(u); setHoveredKey(k); }}
                                                                onClick={handleSegmentClick}
                                                                copiedKey={segmentCopyFeedback}
                                                                lIdx={lIdx}
                                                                onShowTooltip={handleShowTooltip}
                                                                globalTerm={deferredGlobalSearchTerm}
                                                            />
                                                        )) : '\u200B'}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )
                                ) : (
                                    <div className="flex-1 flex items-center justify-center p-4 text-center bg-amber-50/5 text-amber-900/40 italic text-sm">
                                        Kết quả revert/format sẽ hiện ở đây dạng bảng Excel. Bấm REVERT / FORMAT bên trên.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ) : subTab === 'dictionary' ? (
                    <>
                        <div className="grid grid-cols-[3rem_1fr_1fr_1fr] border-b border-gray-300 sticky top-0 z-10" style={{ backgroundColor: excelHeaderColor }}>
                            <div className="w-12 py-3 border-r border-white/20 flex items-center justify-center text-[10px] font-medium text-white opacity-60 uppercase tracking-widest">
                                #
                            </div>
                            <div className="px-4 py-3 text-[10px] font-medium text-white uppercase tracking-widest border-r border-white/20 flex items-center gap-2">
                                🇯🇵 Japanese
                            </div>
                            <div className="px-4 py-3 text-[10px] font-medium text-white uppercase tracking-widest border-r border-white/20 flex items-center gap-2">
                                🔡 English / Code
                            </div>
                            <div className="px-4 py-3 text-[10px] font-medium text-white uppercase tracking-widest flex items-center gap-2">
                                🇻🇳 Vietnamese
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto custom-scrollbar">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center h-full p-4">
                                    <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                                    <p className="text-xs text-gray-500 font-bold">Loading Data...</p>
                                </div>
                            ) : error ? (
                                <div className="flex flex-col items-center justify-center h-full p-10 text-center bg-gray-50/50">
                                    <div className="text-4xl mb-4">📂</div>
                                    <p className="text-gray-800 font-bold text-sm mb-2 max-w-sm">{error}</p>
                                    <div className="flex gap-3 mt-6">
                                        <button
                                            onClick={async () => {
                                                const selected = await openDialog({
                                                    filters: [{ name: 'Data', extensions: ['json', 'xlsx'] }]
                                                });
                                                if (selected && typeof selected === 'string') {
                                                    const newPath = selected;
                                                    setTranslateFilePath(newPath);

                                                    // Auto-save to persist setting
                                                    try {
                                                        await invoke('save_db_settings', {
                                                            settings: {
                                                                connections,
                                                                translate_file_path: newPath,
                                                                column_split_enabled: columnSplitEnabled,
                                                                column_split_keywords: columnSplitKeywords,
                                                                revert_tk_col_config: revertTKColConfig,
                                                                column_split_apply_to_text: columnSplitApplyToText,
                                                                column_split_apply_to_table: columnSplitApplyToTable,
                                                                revert_tk_delete_chars: revertTKDeleteChars,
                                                                revert_tk_mapping: revertTKMapping,
                                                                excel_header_color: excelHeaderColor,
                                                                run_shortcut: runShortcut
                                                            }
                                                        });
                                                    } catch (e) {
                                                        console.error("Failed to persist translate file path", e);
                                                    }
                                                }
                                            }}
                                            className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black shadow-lg hover:bg-indigo-700 transition-all active:scale-95"
                                        >
                                            CHỌN FILE NGAY
                                        </button>
                                        <button
                                            onClick={() => setActiveTab('settings')}
                                            className="px-5 py-2 bg-white text-gray-600 border border-gray-200 rounded-xl text-xs font-black shadow-sm hover:bg-gray-50 transition-all active:scale-95"
                                        >
                                            VÀO CÀI ĐẶT
                                        </button>
                                        <button
                                            onClick={handleSync}
                                            className="px-5 py-2 bg-gray-100 text-gray-400 rounded-xl text-xs font-black hover:bg-gray-200 transition-all active:scale-95"
                                        >
                                            THỬ LẠI
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-100">
                                    <table className="w-full border-collapse table-fixed">
                                        <tbody>
                                            {filteredData.slice(0, dictionaryLimit).map(({ item, originalIndex }, idx) => (
                                                <DictionaryRow
                                                    key={`${item.japanese}-${item.english}-${originalIndex}`}
                                                    item={item}
                                                    displayIdx={idx}
                                                    originalIdx={originalIndex}
                                                    copyFeedback={copyFeedback}
                                                    onCopy={handleCopy}
                                                    onEdit={setEditingEntryAndIndex}
                                                    onDelete={handleDeleteEntry}
                                                    searchTerm={deferredSearchTerm}
                                                    globalSearchTerm={deferredGlobalSearchTerm}
                                                />
                                            ))}
                                        </tbody>
                                    </table>
                                    {filteredData.length > dictionaryLimit && (
                                        <div className="p-6 flex flex-col items-center justify-center bg-gray-50/50">
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">
                                                Showing {dictionaryLimit} of {filteredData.length} entries
                                            </p>
                                            <button
                                                onClick={() => setDictionaryLimit((prev: number) => prev + 500)}
                                                className="px-8 py-3 bg-white border border-indigo-200 text-indigo-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-50 hover:shadow-md transition-all active:scale-95 shadow-sm"
                                            >
                                                📂 LOAD MORE ENTRIES (+500)
                                            </button>
                                        </div>
                                    )}

                                    {/* Floating Add Button */}
                                    <button
                                        onClick={() => {
                                            setEditingEntry({ japanese: '', english: '', vietnamese: '' });
                                            setEditingIndex(null);
                                            setShowEditModal(true);
                                        }}
                                        className="absolute bottom-6 right-6 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-2xl flex items-center justify-center hover:bg-indigo-700 hover:scale-105 active:scale-95 transition-all z-50 group"
                                        title="Add New Entry"
                                    >
                                        <span className="text-3xl font-light leading-none pb-1">+</span>
                                        <span className="absolute right-full mr-2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none font-bold">Add Entry</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col overflow-hidden bg-white">
                        <div className="grid grid-cols-2 flex-1 overflow-hidden">
                            <div className="flex flex-col border-r border-gray-200 min-h-0 relative">
                                <div className="bg-gray-50/50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-gray-100 flex justify-between items-center h-12 shrink-0 z-30">
                                    <span>INPUT SOURCE (Any language)</span>
                                    <button
                                        onClick={() => setBulkInput('')}
                                        className="text-red-400 hover:text-red-600 transition-colors text-[9px] font-black border border-red-100 px-2 py-1 rounded-lg hover:bg-red-50"
                                    >
                                        CLEAR ALL
                                    </button>
                                </div>
                                <div className="flex-1 relative min-h-0 bg-white group/input flex">
                                    {/* Line Numbers Source */}
                                    <div
                                        className="w-12 bg-gray-50 border-r border-gray-100 flex flex-col font-mono text-sm text-gray-400 pt-6 pb-20 select-none overflow-y-auto overflow-x-hidden shrink-0 custom-scrollbar scrollbar-hide"
                                        style={{
                                            lineHeight: `${lineSpacing}`,
                                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                                        }}
                                    >
                                        {(bulkInput.split('\n').length > 0 ? bulkInput.split('\n') : ['']).map((_, i) => (
                                            <div key={i} className="text-right pr-3" style={{ lineHeight: `${lineSpacing}` }}>{i + 1}</div>
                                        ))}
                                    </div>
                                    <div className="flex-1 relative overflow-hidden">
                                        <div
                                            ref={highlighterRef}
                                            className="absolute inset-0 p-6 font-mono text-sm pointer-events-none text-transparent whitespace-pre overflow-auto box-border z-10"
                                            style={{
                                                lineHeight: `${lineSpacing}`,
                                                tabSize: 4, MozTabSize: 4,
                                                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                                            }}
                                        >
                                            <HighlighterOverlay
                                                translatedLines={translatedLines}
                                                hoveredUid={hoveredUid}
                                                hoveredKey={hoveredKey}
                                                lineSpacing={lineSpacing}
                                                globalTerm={deferredGlobalSearchTerm}
                                            />
                                        </div>
                                        <textarea
                                            ref={inputRef}
                                            wrap="off"
                                            onScroll={handleInputScroll}
                                            className="absolute inset-0 w-full h-full p-6 font-mono text-sm outline-none resize-none bg-transparent focus:bg-indigo-50/5 transition-colors overflow-auto z-20 border-none box-border text-transparent caret-gray-800"
                                            style={{
                                                lineHeight: `${lineSpacing}`,
                                                whiteSpace: 'pre',
                                                tabSize: 4, MozTabSize: 4,
                                                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                                            }}
                                            placeholder="Paste code or text here..."
                                            value={bulkInput}
                                            onChange={(e) => setBulkInput(e.target.value)}
                                        ></textarea>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col min-h-0">
                                <div className="bg-indigo-50/30 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-indigo-500 border-b border-indigo-100 flex justify-between items-center h-12 shrink-0">
                                    <div className="flex items-center gap-3">
                                        <span className="text-indigo-600">RESULT TO:</span>
                                        <div className="flex bg-white p-0.5 rounded-lg border border-indigo-100 shadow-sm">
                                            <button
                                                onClick={() => setTargetLang('en')}
                                                className={`px-3 py-1 rounded-md text-[9px] font-black transition-all ${targetLang === 'en' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-indigo-400'}`}
                                            >
                                                🔡 EN
                                            </button>
                                            <button
                                                onClick={() => setTargetLang('jp')}
                                                className={`px-3 py-1 rounded-md text-[9px] font-black transition-all ${targetLang === 'jp' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-indigo-400'}`}
                                            >
                                                🇯🇵 JP
                                            </button>
                                            <button
                                                onClick={() => setTargetLang('vi')}
                                                className={`px-3 py-1 rounded-md text-[9px] font-black transition-all ${targetLang === 'vi' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-indigo-400'}`}
                                            >
                                                🇻🇳 VI
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => {
                                                const fullText = translatedLines.map(l => l.segments.map(s => s.text).join('')).join('\n');
                                                if (fullText) {
                                                    const existing = textCompareExpectedInput ? textCompareExpectedInput + '\n' : '';
                                                    setTextCompareExpectedInput(existing + fullText);
                                                }
                                                setActiveTab('text-compare');
                                            }}
                                            className="px-3 py-1.5 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-indigo-100 shadow-sm transition-all active:scale-95 flex items-center gap-1"
                                            title="Copy result to Text Compare (Expected)"
                                        >
                                            <span>📝 To Text Compare</span>
                                        </button>
                                        <button
                                            onClick={handleCopyResult}
                                            disabled={translatedLines.length === 0}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-300
                                            ${resultCopyFeedback
                                                    ? 'bg-green-500 text-white shadow-lg scale-105'
                                                    : 'bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50 hover:border-indigo-300 shadow-sm active:scale-95'
                                                }
                                            ${translatedLines.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}
                                        `}
                                        >
                                            <span>{resultCopyFeedback ? '✓ COPIED!' : '📋 COPY RESULT'}</span>
                                        </button>
                                    </div>
                                </div>
                                <div className="flex-1 flex overflow-hidden">
                                    {/* Line Numbers Result */}
                                    <div
                                        className="w-12 bg-indigo-50/50 border-r border-indigo-100 flex flex-col font-mono text-sm text-indigo-400 pt-6 pb-20 select-none overflow-y-auto overflow-x-hidden shrink-0 custom-scrollbar scrollbar-hide"
                                        style={{
                                            lineHeight: `${lineSpacing}`,
                                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                                        }}
                                    >
                                        {translatedLines.length > 0 ? translatedLines.map((_, i) => (
                                            <div key={i} className="text-right pr-3" style={{ lineHeight: `${lineSpacing}` }}>{i + 1}</div>
                                        )) : (
                                            <div className="text-right pr-3" style={{ lineHeight: `${lineSpacing}` }}>1</div>
                                        )}
                                    </div>

                                    <div
                                        ref={outputRef}
                                        onContextMenu={(e) => {
                                            e.preventDefault();
                                            if (translatedLines.length === 0) return;
                                            const x = e.clientX + 220 > window.innerWidth ? e.clientX - 220 : e.clientX;
                                            setContextMenu({ x, y: e.clientY });
                                        }}
                                        onScroll={handleOutputScroll}
                                        className="flex-1 p-6 font-mono text-sm outline-none overflow-auto custom-scrollbar bg-indigo-50/10 text-indigo-900 shadow-inner box-border"
                                        style={{
                                            lineHeight: `${lineSpacing}`,
                                            whiteSpace: 'pre',
                                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                                        }}
                                    >
                                        {translatedLines.length > 0 ? (
                                            translatedLines.map((line, lIdx) => {
                                                return (
                                                    <div
                                                        key={lIdx}
                                                        className="transition-all duration-150 relative group/line hover:!z-[100] whitespace-nowrap w-full hover:bg-indigo-100/60 hover:border-l-4 hover:border-l-indigo-500 hover:pl-1"
                                                        style={{
                                                            height: `${lineSpacing}em`,
                                                            zIndex: translatedLines.length - lIdx
                                                        }}
                                                    >
                                                        <div className="flex-1 whitespace-nowrap">
                                                            {line.segments.length > 0 ? line.segments.map(seg => (
                                                                <MemoizedSegment
                                                                    key={seg.uid}
                                                                    seg={seg}
                                                                    lIdx={lIdx}
                                                                    hoveredUid={hoveredUid}
                                                                    hoveredKey={hoveredKey}
                                                                    onHover={(uid, key) => { setHoveredUid(uid); setHoveredKey(key); }}
                                                                    copiedKey={segmentCopyFeedback}
                                                                    onClick={handleSegmentClick}
                                                                    onShowTooltip={handleShowTooltip}
                                                                    globalTerm={deferredGlobalSearchTerm}
                                                                />
                                                            )) : '\u200B'}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <div className="flex flex-col items-center justify-center h-full opacity-20 select-none">
                                                <span className="text-4xl mb-4">✨</span>
                                                <span className="text-sm italic font-black uppercase tracking-widest">Translation will appear here</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {tooltip && createPortal(
                <div className="fixed inset-0 z-[99999] pointer-events-none">
                    <div
                        className="absolute bg-white rounded-xl shadow-2xl border border-indigo-100 py-2 min-w-[200px] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 pointer-events-auto"
                        onMouseEnter={() => setIsMouseInTooltip(true)}
                        onMouseLeave={() => setIsMouseInTooltip(false)}
                        style={{
                            top: Math.max(10, Math.min(tooltip.rect.top + (tooltip.rect.height / 2) - 40, window.innerHeight - 300)),
                            left: Math.min(tooltip.rect.right + 12, window.innerWidth - 240),
                        }}
                    >
                        <div className="px-3 py-1.5 bg-indigo-50/50 border-b border-indigo-50 flex items-center justify-between">
                            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Select Version</span>
                            <span className="text-[10px] font-bold text-indigo-300">{tooltip.seg.options.length} options</span>
                        </div>
                        <div className="max-h-[250px] overflow-y-auto custom-scrollbar">
                            {tooltip.seg.options.map((opt, i) => (
                                <button
                                    key={i}
                                    onClick={() => {
                                        setSelections({ ...selections, [tooltip.seg.key]: opt });
                                        setTooltip(null);
                                    }}
                                    className={`w-full text-left px-4 py-2.5 text-xs font-bold transition-all border-l-4
                                        ${selections[tooltip.seg.key] === opt
                                            ? 'bg-indigo-50 text-indigo-600 border-indigo-500'
                                            : 'text-gray-600 border-transparent hover:bg-gray-50 hover:text-indigo-600 hover:border-indigo-200'}
                                    `}
                                >
                                    {opt}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
});

export default TranslateTab;

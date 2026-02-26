import { parse } from 'java-parser';
import * as fs from 'fs';

const code = fs.readFileSync('test.java', 'utf-8');
const cst = parse(code);

const callMap = new Map();
const methods = [];
function findMethods(node) {
    if (!node) return;
    if (node.name === "methodDeclaration") {
        try {
            const idNode = node.children.methodHeader[0].children.methodDeclarator[0].children.Identifier[0];
            methods.push({
                name: idNode.image,
                startOffset: node.location?.startOffset || 0,
                endOffset: node.location?.endOffset || 0,
                nameOffset: idNode.startOffset
            });
        } catch (e) { }
    }
    if (node.children) {
        for (const key in node.children) {
            if (Array.isArray(node.children[key])) node.children[key].forEach(findMethods);
        }
    }
}
findMethods(cst);

const tokens = [];
function collectTokens(node) {
    if (!node) return;
    if (node.image !== undefined && node.tokenType) {
        tokens.push(node);
    }
    if (node.children) {
        for (const key in node.children) {
            if (Array.isArray(node.children[key])) node.children[key].forEach(collectTokens);
        }
    }
}
collectTokens(cst);
tokens.sort((a, b) => a.startOffset - b.startOffset);

const controlKeywords = new Set(["if", "for", "while", "catch", "switch", "synchronized", "return"]);

for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i];
    const next = tokens[i + 1];

    let activeMethod = "Global_Scope";
    let isMethodName = false;

    for (const m of methods) {
        if (t.startOffset >= m.startOffset && t.endOffset <= m.endOffset) {
            activeMethod = m.name;
        }
        if (m.nameOffset === t.startOffset) {
            isMethodName = true;
        }
    }

    if (t.tokenType.name === "Identifier" && next.image === "(" && !isMethodName && !controlKeywords.has(t.image)) {
        if (!callMap.has(activeMethod)) callMap.set(activeMethod, new Set());
        callMap.get(activeMethod).add(t.image);
    }
}

let syntax = "graph TD;\n";
callMap.forEach((callees, caller) => {
    callees.forEach(callee => {
        // PREFIX node_ to avoid JS property collision like toString, length, constructor
        const safeCallerId = "node_" + caller.replace(/[^a-zA-Z0-9_]/g, "_");
        const safeCalleeId = "node_" + callee.replace(/[^a-zA-Z0-9_]/g, "_");
        syntax += `    ${safeCallerId}["${caller}"] --> ${safeCalleeId}["${callee}"];\n`;
    });
});
console.log(syntax);

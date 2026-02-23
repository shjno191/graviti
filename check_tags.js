const fs = require('fs');
const content = fs.readFileSync('d:\\graviti\\sql-helper\\src\\components\\TranslateTab.tsx', 'utf8');

const lines = content.split('\n');
let stack = [];
let lineNum = 0;

for (let line of lines) {
    lineNum++;
    let opens = (line.match(/<([a-zA-Z0-9]+)(?![^>]*\/>)/g) || []).map(t => t.slice(1));
    let closes = (line.match(/<\/([a-zA-Z0-9]+)>/g) || []).map(t => t.slice(3, -1));

    for (let o of opens) stack.push({ tag: o, line: lineNum });
    for (let c of closes) {
        if (stack.length === 0) {
            console.log(`Extra close tag </${c}> at line ${lineNum}`);
            continue;
        }
        let last = stack.pop();
        if (last.tag !== c) {
            console.log(`Mismatch: opened <${last.tag}> at line ${last.line}, closed </${c}> at line ${lineNum}`);
        }
    }
}

console.log("Unclosed tags:", stack);

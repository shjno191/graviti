const fs = require('fs');
const content = fs.readFileSync('d:\\graviti\\sql-helper\\src\\components\\TranslateTab.tsx', 'utf8');

// Find the "return (" that starts the JSX
const returnIdx = content.indexOf('\n    return (\n');
console.log('return ( found at char index:', returnIdx);
console.log('That is around line:', content.substr(0, returnIdx).split('\n').length);

// Now trace parens from that point
const fromReturn = content.substr(returnIdx);
let stack = [];
let extraClose = [];

for (let i = 0; i < fromReturn.length; i++) {
    if (fromReturn[i] === '(') stack.push(i + returnIdx);
    if (fromReturn[i] === ')') {
        if (stack.length === 0) {
            extraClose.push(i + returnIdx);
        } else {
            stack.pop();
        }
    }
}

console.log('After return, unclosed ( at:', stack.length);
console.log('After return, extra ) at (chars):', extraClose);

// Convert extra ) to line numbers
for (let idx of extraClose) {
    const line = content.substr(0, idx).split('\n').length;
    console.log('Extra ) at line:', line, '|', content.split('\n')[line - 1]);
}

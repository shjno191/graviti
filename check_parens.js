const fs = require('fs');
const content = fs.readFileSync('d:\\graviti\\sql-helper\\src\\components\\TranslateTab.tsx', 'utf8');

let stack = [];
for (let i = 0; i < content.length; i++) {
    if (content[i] === '(') stack.push(i);
    if (content[i] === ')') {
        if (stack.length === 0) {
            console.log(`Extra ) at index ${i}, around: ${content.substr(i - 20, 40)}`);
        } else {
            stack.pop();
        }
    }
}
console.log("Unclosed ( at indexes:", stack);

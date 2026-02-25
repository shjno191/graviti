const fs = require('fs');
const content = fs.readFileSync('d:\\graviti\\sql-helper\\src\\components\\TranslateTab.tsx', 'utf8');

let stack = [];
let lines = content.split('\n');
let count = 0;

for (let l = 0; l < lines.length; l++) {
    for (let char of lines[l]) {
        if (char === '(') stack.push(l + 1);
        if (char === ')') {
            if (stack.length === 0) {
                console.log(`Extra ) at line ${l + 1}: ${lines[l]}`);
            } else {
                stack.pop();
            }
        }
    }
}

const fs = require('fs');
const content = fs.readFileSync('d:\\graviti\\sql-helper\\src\\components\\TranslateTab.tsx', 'utf8');

let divOpen = 0;
let divClose = 0;
let braceOpen = 0;
let braceClose = 0;
let parenOpen = 0;
let parenClose = 0;

for (let i = 0; i < content.length; i++) {
    if (content.substr(i, 4) === '<div') divOpen++;
    if (content.substr(i, 6) === '</div>') divClose++;
    if (content[i] === '{') braceOpen++;
    if (content[i] === '}') braceClose++;
    if (content[i] === '(') parenOpen++;
    if (content[i] === ')') parenClose++;
}

console.log({ divOpen, divClose, braceOpen, braceClose, parenOpen, parenClose });

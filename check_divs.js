const fs = require('fs');
const content = fs.readFileSync('d:\\graviti\\sql-helper\\src\\components\\TranslateTab.tsx', 'utf8');

const lines = content.split('\n');
let divStack = [];
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Match <div ... but not <div.../>
    let reOpen = /<div(?![^>]*\/>)[^>]*>/g;
    let match;
    while ((match = reOpen.exec(line)) !== null) {
        divStack.push(lineNum);
    }

    let reClose = /<\/div>/g;
    while ((match = reClose.exec(line)) !== null) {
        if (divStack.length === 0) {
            console.log(`Extra </div> at line ${lineNum}`);
        } else {
            divStack.pop();
        }
    }
}

console.log("Unclosed <div> starts at lines:", divStack);

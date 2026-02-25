const fs = require('fs');
const content = fs.readFileSync('d:\\graviti\\sql-helper\\src\\components\\TranslateTab.tsx', 'utf8');

// Find where the component return starts
const idx = content.indexOf('    return (');
console.log('Found at char:', idx);
if (idx === -1) {
    // try with different whitespace
    const m = content.match(/return\s*\(/);
    if (m) {
        console.log('Match found at:', m.index, '|Context:', content.substr(m.index, 30));
    }
}

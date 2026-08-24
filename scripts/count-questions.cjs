const fs = require('fs');

function countStem(content, paper) {
  const start = content.indexOf(paper + ': [');
  if (start === -1) return 0;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let count = 0;
  
  for (let i = start + paper.length + 2; i < content.length; i++) {
    const c = content[i];
    if (inString) {
      if (escaped) { escaped = false; }
      else if (c === '\\') { escaped = true; }
      else if (c === '"') { inString = false; }
    } else {
      if (c === '"') { inString = true; }
      else if (c === '[') { depth++; }
      else if (c === ']') {
        depth--;
        if (depth < 0) break;
      }
      else if (!inString && content.slice(i, i+5) === 'stem:') {
        count++;
      }
    }
  }
  return count;
}

const physics = fs.readFileSync('C:\\Users\\momo\\Documents\\Default Project\\public\\igcse\\banks\\physics.js', 'utf8');
const chemistry = fs.readFileSync('C:\\Users\\momo\\Documents\\Default Project\\public\\igcse\\banks\\chemistry.js', 'utf8');
const biology = fs.readFileSync('C:\\Users\\momo\\Documents\\Default Project\\public\\igcse\\banks\\biology.js', 'utf8');

console.log('Physics P4:', countStem(physics, 'p4'), 'P6:', countStem(physics, 'p6'));
console.log('Chemistry P4:', countStem(chemistry, 'p4'), 'P6:', countStem(chemistry, 'p6'));
console.log('Biology P4:', countStem(biology, 'p4'), 'P6:', countStem(biology, 'p6'));
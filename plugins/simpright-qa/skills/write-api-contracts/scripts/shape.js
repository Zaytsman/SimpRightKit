// Prints the shape of a JSON document (keys and value types, never values), so live responses can be
// described in contracts without copying data. Usage: node shape.js <file>   or   ... | node shape.js
const { readFileSync } = require('node:fs');

function shape(value, depth = 0) {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `${shape(value[0], depth)}[]  (${value.length} items)`;
  }
  if (typeof value === 'object') {
    if (depth >= 4) return 'object';
    const pad = '  '.repeat(depth + 1);
    const lines = Object.entries(value).map(([key, v]) => `${pad}${key}: ${shape(v, depth + 1)}`);
    return lines.length ? `{\n${lines.join('\n')}\n${'  '.repeat(depth)}}` : '{}';
  }
  return typeof value;
}

const text = readFileSync(process.argv[2] ?? 0, 'utf-8');
try {
  console.log(shape(JSON.parse(text)));
} catch {
  const firstLine = text.trim().split('\n')[0] ?? '';
  console.log(`not JSON (${text.length} characters), starts with: ${firstLine.slice(0, 60)}`);
}

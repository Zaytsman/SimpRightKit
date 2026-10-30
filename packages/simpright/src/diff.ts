// A line diff for simpright apply's output: what a file holds now against what apply would write, in the unified
// format (`-` now, `+` new) with three lines of context. Line endings don't count.

/** The diff of `file` from `before` to `after` (undefined: the file doesn't exist on that side); '' when they're equal. */
export function unifiedDiff(file: string, before: string | undefined, after: string | undefined, context = 3): string {
  const split = (text: string | undefined) => (text === undefined ? [] : text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n'));
  const [a, b] = [split(before), split(after)];

  // The longest common subsequence, from the ends: common[i][j] is its length for a[i..] and b[j..].
  const common = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      common[i]![j] = a[i] === b[j] ? common[i + 1]![j + 1]! + 1 : Math.max(common[i + 1]![j]!, common[i]![j + 1]!);
    }
  }
  /** Every line in order: kept (' '), removed ('-') or added ('+'), with its number on each side. */
  const ops: { kind: ' ' | '-' | '+'; text: string; aLine: number; bLine: number }[] = [];
  let [i, j] = [0, 0];
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) ops.push({ kind: ' ', text: a[i++]!, aLine: i, bLine: ++j });
    else if (j >= b.length || (i < a.length && common[i + 1]![j]! >= common[i]![j + 1]!)) ops.push({ kind: '-', text: a[i++]!, aLine: i, bLine: j });
    else ops.push({ kind: '+', text: b[j++]!, aLine: i, bLine: j });
  }
  if (ops.every((op) => op.kind === ' ')) return '';

  // Hunks: the changed lines with up to `context` kept lines around them; changes closer than that share a hunk.
  const changed = ops.flatMap((op, index) => (op.kind === ' ' ? [] : [index]));
  const hunks: [number, number][] = [];
  for (const index of changed) {
    const [start, end] = [Math.max(0, index - context), Math.min(ops.length - 1, index + context)];
    const last = hunks[hunks.length - 1];
    if (last && start <= last[1] + 1) last[1] = end;
    else hunks.push([start, end]);
  }
  const out = [before === undefined ? '--- /dev/null' : `--- a/${file}`, after === undefined ? '+++ /dev/null' : `+++ b/${file}`];
  for (const [start, end] of hunks) {
    const part = ops.slice(start, end + 1);
    const aCount = part.filter((op) => op.kind !== '+').length;
    const bCount = part.filter((op) => op.kind !== '-').length;
    // The first line of each side in the hunk (a side with no lines in it names the line before).
    const aStart = aCount === 0 ? part[0]!.aLine : (part.find((op) => op.kind !== '+')?.aLine ?? 0);
    const bStart = bCount === 0 ? part[0]!.bLine : (part.find((op) => op.kind !== '-')?.bLine ?? 0);
    out.push(`@@ -${aStart},${aCount} +${bStart},${bCount} @@`, ...part.map((op) => `${op.kind}${op.text}`));
  }
  return `${out.join('\n')}\n`;
}

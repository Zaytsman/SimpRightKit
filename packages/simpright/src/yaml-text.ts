// YAML text edited in place, for simpright init's changes to simpright.yml. Each edit splices only the text of the
// nodes it touches, so the comments, the spacing and the quoting of everything else stay byte for byte: a round trip
// through the yaml package's Document re-spaces inline comments and flow collections, which would bury init's real
// changes in its diff. The yaml package still parses the text after each edit, to find the nodes and their ranges.

import { isMap, isScalar, isSeq, type Node, type Pair, parseDocument, stringify, type YAMLMap } from 'yaml';
import { withLf } from './state.ts';

/** A key path into the YAML mapping, e.g. ['ids', 'layers', 'ui']. */
export type YamlPath = readonly string[];

/** A flow value longer than this is written as a block instead. */
const FLOW_MAX = 100;

/** A value init writes: a scalar, a list or a mapping of such values. */
type Value = unknown;

const isPlainObject = (value: Value): value is Record<string, Value> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isLeaf = (value: Value) => !Array.isArray(value) && !isPlainObject(value);

/** `base` with `over`'s keys set over it, mappings merged key by key; lists and scalars are replaced. */
function deepMerge(base: Value, over: Value): Value {
  if (!isPlainObject(base) || !isPlainObject(over)) return over;
  const merged: Record<string, Value> = { ...base };
  for (const [key, value] of Object.entries(over)) merged[key] = deepMerge(base[key], value);
  return merged;
}

/** A scalar as YAML writes it: plain when that reads back as the same value, else double-quoted. */
function scalarText(value: Value, inFlow: boolean): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  const text = String(value);
  const written = stringify(text, { lineWidth: 0 }).trimEnd();
  const quoted = written.startsWith('"') || written.startsWith("'");
  // Plain in a block can still break a flow collection: a comma or a bracket ends the item there.
  if (!quoted && inFlow && /[,[\]{}]/.test(text)) return JSON.stringify(text);
  return written.includes('\n') ? JSON.stringify(text) : written;
}

/** A value in flow style: { a: 1, b: x } for a mapping (as simpright.yml writes them) and [a, b] for a list. */
function flowText(value: Value): string {
  if (Array.isArray(value)) return `[${value.map(flowText).join(', ')}]`;
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    return entries.length === 0 ? '{}' : `{ ${entries.map(([key, item]) => `${scalarText(key, true)}: ${flowText(item)}`).join(', ')} }`;
  }
  return scalarText(value, true);
}

/** Whether a value fits one line in flow style: a scalar, or a list or mapping of scalars that's short enough. */
function fitsFlow(value: Value): boolean {
  if (isLeaf(value)) return true;
  const items = Array.isArray(value) ? value : Object.values(value as Record<string, Value>);
  return items.every(isLeaf) && flowText(value).length <= FLOW_MAX;
}

/** `key: value` at `indent`, ending with a newline: on one line when the value fits flow style, else as a block below. */
function pairText(key: string, value: Value, indent: number): string {
  const pad = ' '.repeat(indent);
  if (fitsFlow(value)) return `${pad}${scalarText(key, false)}: ${flowText(value)}\n`;
  const block = stringify(value, { lineWidth: 0 })
    .trimEnd()
    .split('\n')
    .map((line) => `${pad}  ${line}`)
    .join('\n');
  return `${pad}${scalarText(key, false)}:\n${block}\n`;
}

/** The YAML text of a mapping document (simpright.yml), edited one change at a time; toString() gives the result. */
export class YamlText {
  private text: string;

  constructor(text: string) {
    this.text = withLf(text);
    this.parse();
  }

  toString(): string {
    return this.text;
  }

  /** The value at `path` as plain data, or undefined when there is none. */
  get(path: YamlPath): Value {
    let value: Value = this.parse().toJS();
    for (const key of path) {
      if (!isPlainObject(value)) return undefined;
      value = value[key];
    }
    return value;
  }

  has(path: YamlPath): boolean {
    return this.pairAt(path) !== undefined;
  }

  /**
   * Sets the value at `path`. An existing scalar or flow value is replaced where it stands, its comment kept; a block
   * value is rewritten whole. A missing key is added at the end of its mapping (which must exist), or of the file.
   */
  set(path: YamlPath, value: Value): void {
    const pair = this.pairAt(path);
    if (!pair) {
      this.insert(path, value);
      return;
    }
    const node = pair.value as Node;
    const inPlace = isScalar(node) || ((isMap(node) || isSeq(node)) && node.flow === true);
    if (inPlace && fitsFlow(value)) {
      this.splice(node.range![0], node.range![1], flowText(value));
      return;
    }
    const key = pair.key as Node;
    const start = this.lineStart(key.range![0]);
    this.splice(start, node.range![2], pairText(path.at(-1)!, value, key.range![0] - start));
  }

  /**
   * Merges `value` into `path`: a mapping into an existing block mapping key by key (recursively), anything else as
   * set() does. Keys the value doesn't name stay as they are.
   */
  merge(path: YamlPath, value: Value): void {
    const pair = this.pairAt(path);
    if (pair && isPlainObject(value) && isMap(pair.value)) {
      if (!pair.value.flow) {
        for (const [key, item] of Object.entries(value)) this.merge([...path, key], item);
        return;
      }
      this.set(path, deepMerge(this.get(path), value));
      return;
    }
    this.set(path, value);
  }

  /**
   * Removes the key at `path` with its value and the comment lines right above it at its own indentation. When that
   * leaves two blank lines together, one goes. Removing a key that isn't there does nothing.
   */
  remove(path: YamlPath): void {
    const pair = this.pairAt(path);
    if (!pair) return;
    const key = pair.key as Node;
    const keyLine = this.lineStart(key.range![0]);
    const indent = key.range![0] - keyLine;
    let start = keyLine;
    while (start > 0) {
      const previous = this.lineStart(start - 1);
      const line = this.text.slice(previous, start - 1);
      if (!line.trimStart().startsWith('#') || line.length - line.trimStart().length !== indent) break;
      start = previous;
    }
    let end = pair.value ? (pair.value as Node).range![2] : this.lineEnd(key.range![1]);
    const blankBefore = start === 0 || this.text.slice(this.lineStart(start - 1), start - 1).trim() === '';
    const blankAfter = end >= this.text.length || this.text[end] === '\n';
    if (blankBefore && blankAfter && end < this.text.length) end += 1;
    this.splice(start, end, '');
  }

  /** Adds `path`'s key at the end of its parent mapping, or, for a top-level key, after a blank line at the end of the file. */
  private insert(path: YamlPath, value: Value): void {
    const key = path.at(-1)!;
    if (path.length === 1) {
      const body = this.text.trimEnd();
      this.text = `${body}${body === '' ? '' : '\n\n'}${pairText(key, value, 0)}`;
      this.parse();
      return;
    }
    const parentPath = path.slice(0, -1);
    const parent = this.pairAt(parentPath);
    if (!parent || !isMap(parent.value)) throw new Error(`Can't add ${path.join('.')}: ${parentPath.join('.')} isn't a mapping`);
    if (parent.value.flow) {
      this.set(parentPath, { ...(this.get(parentPath) as Record<string, Value>), [key]: value });
      return;
    }
    const map = parent.value as YAMLMap;
    const first = map.items[0]?.key as Node | undefined;
    const last = map.items.at(-1);
    if (!first || !last) throw new Error(`Can't add ${path.join('.')}: ${path.slice(0, -1).join('.')} is empty`);
    const indent = first.range![0] - this.lineStart(first.range![0]);
    const at = last.value ? (last.value as Node).range![2] : this.lineEnd((last.key as Node).range![1]) + 1;
    this.splice(at, at, pairText(key, value, indent));
  }

  /** The pair at `path` in the document's block mappings, or undefined. */
  private pairAt(path: YamlPath): Pair | undefined {
    let node: unknown = this.parse().contents;
    let pair: Pair | undefined;
    for (const key of path) {
      if (!isMap(node)) return undefined;
      pair = node.items.find((item) => isScalar(item.key) && item.key.value === key) as Pair | undefined;
      if (!pair) return undefined;
      node = pair.value;
    }
    return pair;
  }

  private parse() {
    const doc = parseDocument(this.text, { keepSourceTokens: false });
    if (doc.errors.length > 0) throw new Error(`YAML: ${doc.errors[0]!.message}`);
    if (doc.contents !== null && !isMap(doc.contents)) throw new Error('YAML: the document is not a mapping');
    return doc;
  }

  private splice(start: number, end: number, insert: string): void {
    this.text = this.text.slice(0, start) + insert + this.text.slice(end);
    this.parse();
  }

  private lineStart(offset: number): number {
    return this.text.lastIndexOf('\n', offset - 1) + 1;
  }

  /** The offset of the newline that ends the line holding `offset` (or the text's end). */
  private lineEnd(offset: number): number {
    const end = this.text.indexOf('\n', offset);
    return end === -1 ? this.text.length : end;
  }
}

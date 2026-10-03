#!/usr/bin/env node
/**
 * Codemod: boolean size flags -> `size` prop (plan F3.6).
 *
 *   node scripts/codemods/pixel-button.mjs --dry            # print counts, write nothing
 *   node scripts/codemods/pixel-button.mjs                  # rewrite files in place
 *   node scripts/codemods/pixel-button.mjs --dry components/shared/SignIn.tsx
 *
 * Paths default to the client source roots. Directories are walked for
 * .tsx/.jsx files. Uses the TypeScript compiler API (already a devDependency)
 * to find JSX attributes, then applies text edits by position so formatting
 * and comments around the attributes are kept.
 *
 * Rewrites, per component:
 *   PixelButton  isSmall -> size="sm", isBig -> size="lg",
 *                isWidthFull -> fullWidth, isDisabled -> disabled
 *   Tag          isSmall -> size="sm"
 *   Countdown    isBig -> size="lg"
 *   Snowfall     isSmall -> size="sm"
 *
 * A bare flag or `={true}` becomes the literal size, `={false}` is dropped, and
 * `={expr}` becomes `size={expr ? "sm" : "<default>"}`. Anything the script
 * cannot rewrite safely (two size flags on one element, a `size` already
 * present, `isMedium`, spread props) is left untouched and listed as MANUAL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const CLIENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_ROOTS = ["components", "pages", "context", "layouts", "features", "hooks"];
const SKIP_DIRS = new Set(["node_modules", ".next", "out", "android", "ios", "public"]);

/** Component name -> { sizeFlags: flag -> size | null (manual), renames, defaultSize } */
export const COMPONENTS = {
  PixelButton: {
    sizeFlags: { isSmall: "sm", isBig: "lg", isMedium: null },
    renames: { isWidthFull: "fullWidth", isDisabled: "disabled" },
    defaultSize: "md",
  },
  Tag: { sizeFlags: { isSmall: "sm" }, renames: {}, defaultSize: "md" },
  Countdown: { sizeFlags: { isBig: "lg" }, renames: {}, defaultSize: "md" },
  Snowfall: { sizeFlags: { isSmall: "sm" }, renames: {}, defaultSize: "md" },
};

const tagNameOf = (node) => {
  const name = node.tagName;
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isPropertyAccessExpression(name)) return name.name.text;
  return null;
};

const attrName = (attr) => (ts.isJsxAttribute(attr) ? attr.name.getText() : null);

/**
 * Value of a JSX attribute: { kind: "true" } for a bare flag or {true},
 * { kind: "false" } for {false}, { kind: "expr", text } otherwise.
 */
const attrValue = (attr, sf) => {
  const init = attr.initializer;
  if (!init) return { kind: "true" };
  if (ts.isJsxExpression(init) && init.expression) {
    const expr = init.expression;
    if (expr.kind === ts.SyntaxKind.TrueKeyword) return { kind: "true" };
    if (expr.kind === ts.SyntaxKind.FalseKeyword) return { kind: "false" };
    return { kind: "expr", text: expr.getText(sf) };
  }
  return { kind: "expr", text: init.getText(sf) };
};

/** Start of the attribute including the whitespace before it, for removal. */
const removalStart = (attr, text) => {
  let start = attr.getFullStart();
  while (start > 0 && /\s/.test(text[start - 1])) start--;
  return start;
};

export function transformSource(source, fileName = "file.tsx") {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  const counts = {};
  const manual = [];
  const bump = (key) => (counts[key] = (counts[key] || 0) + 1);
  const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const name = tagNameOf(node);
      const config = name && COMPONENTS[name];
      if (config) handleElement(node, name, config);
    }
    ts.forEachChild(node, visit);
  };

  const handleElement = (node, name, config) => {
    const attrs = node.attributes.properties;
    const flags = attrs.filter((a) => attrName(a) in config.sizeFlags);
    const hasSize = attrs.some((a) => attrName(a) === "size");
    const spreads = attrs.filter((a) => ts.isJsxSpreadAttribute(a));

    if (spreads.length && (flags.length || attrs.some((a) => attrName(a) in config.renames))) {
      manual.push(`${lineOf(node)}: <${name}> has spread props next to legacy flags`);
    }

    // Size flags.
    const flagSizes = flags.map((a) => config.sizeFlags[attrName(a)]);
    if (flags.length > 1 || (flags.length === 1 && hasSize) || flagSizes.includes(null)) {
      if (flags.length) {
        manual.push(
          `${lineOf(node)}: <${name}> ${flags.map((a) => a.getText(sf)).join(" ")}` +
            (hasSize ? " (size already set)" : "")
        );
      }
    } else if (flags.length === 1) {
      const attr = flags[0];
      const size = flagSizes[0];
      const value = attrValue(attr, sf);
      const key = `${name}.${attrName(attr)} -> size`;
      if (value.kind === "true") {
        edits.push({ start: attr.getStart(sf), end: attr.end, text: `size="${size}"` });
      } else if (value.kind === "false") {
        edits.push({ start: removalStart(attr, sf.text), end: attr.end, text: "" });
      } else {
        edits.push({
          start: attr.getStart(sf),
          end: attr.end,
          text: `size={${value.text} ? "${size}" : "${config.defaultSize}"}`,
        });
      }
      bump(key);
    }

    // Plain renames.
    for (const attr of attrs) {
      const from = attrName(attr);
      if (!from || !(from in config.renames)) continue;
      const to = config.renames[from];
      if (attrs.some((a) => attrName(a) === to)) {
        manual.push(`${lineOf(attr)}: <${name}> has both ${from} and ${to}`);
        continue;
      }
      edits.push({ start: attr.name.getStart(sf), end: attr.name.end, text: to });
      bump(`${name}.${from} -> ${to}`);
    }
  };

  visit(sf);

  edits.sort((a, b) => b.start - a.start);
  let output = source;
  for (const edit of edits) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  }
  return { output, counts, manual, changed: output !== source };
}

function* walk(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    if (/\.(tsx|jsx)$/.test(target)) yield target;
    return;
  }
  for (const entry of fs.readdirSync(target)) {
    if (SKIP_DIRS.has(entry)) continue;
    yield* walk(path.join(target, entry));
  }
}

function main(argv) {
  const dry = argv.includes("--dry");
  const targets = argv.filter((a) => !a.startsWith("--"));
  const roots = (targets.length ? targets : DEFAULT_ROOTS).map((p) => path.resolve(CLIENT_ROOT, p));
  const totals = {};
  const manualAll = [];
  let files = 0;

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const file of walk(root)) {
      const source = fs.readFileSync(file, "utf8");
      if (!/\b(isSmall|isMedium|isBig|isWidthFull|isDisabled)\b/.test(source)) continue;
      const rel = path.relative(CLIENT_ROOT, file);
      const { output, counts, manual, changed } = transformSource(source, file);
      for (const [k, v] of Object.entries(counts)) totals[k] = (totals[k] || 0) + v;
      manual.forEach((m) => manualAll.push(`${rel}:${m}`));
      if (!changed) continue;
      files++;
      const summary = Object.entries(counts).map(([k, v]) => `${k} x${v}`).join(", ");
      console.log(`${dry ? "would change" : "changed"} ${rel}: ${summary}`);
      if (!dry) fs.writeFileSync(file, output);
    }
  }

  console.log(`\n${dry ? "[dry run] " : ""}${files} file(s)`);
  for (const [k, v] of Object.entries(totals).sort()) console.log(`  ${k}: ${v}`);
  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  console.log(`  total: ${total}`);
  if (manualAll.length) {
    console.log(`\nMANUAL (${manualAll.length}):`);
    manualAll.forEach((m) => console.log(`  ${m}`));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}

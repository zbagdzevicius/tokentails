// Text extraction for the copy lint (plan F11).
//
// extractTs(fileName, text, { ruleset }) and extractJson(fileName, text) return copy units:
//   { text, line, endLine, kind, prop?, webOnly, appOnly, grouped? }
// kind: 'jsx' (flattened JSX text), 'attr' (a text-bearing JSX attribute), 'prop' (a text property of
// an object literal), 'object' (the text properties of one object literal joined, for claim rules),
// 'string' (any other prose string literal or template), 'json'. A copy-position string that does not
// read as prose but has a space ("100 Tails = $1", "1 USDC") is a unit with `short: true`: the rules
// give it the word checks only (R8, R9, R10). One-word strings are never units.
//
// The TypeScript AST is used so comments, class names, imports, keys and comparisons are never read
// as copy. `webOnly` marks text in an `isApp ? app : web` web branch (or a `// copy-lint: web-only`
// file); app-build rules skip it.

import ts from 'typescript';

// JSX attributes that carry user-visible text.
const TEXT_ATTRS = new Set([
  'alt', 'title', 'aria-label', 'aria-description', 'aria-valuetext', 'aria-roledescription', 'placeholder',
  'label', 'description', 'subtitle', 'caption', 'heading', 'text', 'tooltip', 'message', 'cta', 'ctaLabel',
  'buttonText', 'content', 'headline', 'kicker', 'body', 'hint', 'confirmText', 'cancelText', 'emptyText',
]);
// JSX attributes that never do, even with spaces (class lists, URLs, ids, styling, SVG paths).
const NON_TEXT_ATTRS = /^(?:className|class|style|id|href|src|srcSet|sizes|key|type|name|role|rel|target|as|variant|size|color|icon|htmlFor|method|action|autoComplete|inputMode|pattern|lang|dir|xmlns|viewBox|d|fill|stroke|transform|points|poster|media|crossOrigin|loading|decoding|referrerPolicy|sandbox|allow|form|path|to|ref|tabIndex|data-[\w-]+|testId|gradient|animation|preload|property|itemProp|charSet|httpEquiv)$/;
// Object properties whose string values are copy.
export const TEXT_PROPS = new Set([
  'label', 'title', 'text', 'description', 'message', 'name', 'value', 'subtitle', 'caption', 'heading',
  'body', 'cta', 'ctaLabel', 'tagline', 'hint', 'tooltip', 'placeholder', 'revealTitle', 'content', 'question',
  'answer', 'summary', 'note', 'headline', 'kicker', 'detail', 'details', 'button', 'buttonText', 'desc',
  'short', 'long', 'subtext', 'eyebrow', 'badge', 'chip', 'alt', 'announce', 'toast', 'error', 'success',
]);
// Plan F11: the backend rule set reads only these properties (plus exception messages and HTML).
export const BACKEND_PROPS = new Set(['message', 'label', 'name', 'description', 'revealTitle']);
// Calls whose string arguments are never copy.
const SKIP_CALLEE = /^(?:console\.\w+|require|import|cn|clsx|cx|twMerge|twJoin|classNames|cva|tv|track\w*|logEvent|gtag|dataLayer\.push|fetch|axios(?:\.\w+)?|\w+\.(?:get|post|put|patch|delete)|querySelector(?:All)?|\w+\.querySelector(?:All)?|document\.\w+|getElementById|\w+\.addEventListener|\w+\.removeEventListener|localStorage\.\w+|sessionStorage\.\w+|\w*[Ss]torage\.\w+|RegExp|Symbol|URL|URLSearchParams|\w+\.(?:startsWith|endsWith|includes|indexOf|split|replace|replaceAll|match|test|join)|\w+\.set(?:Attribute|Property)|\w+\.(?:emit|on|off|once)|dispatch\w*|\w+\.(?:load|image|audio|spritesheet|atlas|json|tilemapTiledJSON)|\w+\.anims\.\w+|\w+\.play|Error|TypeError|RangeError|assert\w*|expect|describe|it|test)$/;
// Identifiers that mean "this is the Capacitor app build".
const APP_FLAG = /^(?:isApp|IS_APP|isNative|isNativeApp|isNativePlatform|isCapacitor|isCapacitorApp|isAppHost|inApp|HEIST_APP)$/;
// Identifiers that mean "this is the web build". The Heist ships inside the app export
// (client/public/heist-game), so its web-only copy branches on one of these (docs/CLAIMS.md, R10).
const WEB_FLAG = /^(?:isWeb|IS_WEB|isWebHost|isWebBuild|HEIST_WEB)$/;
const PROSE = /[A-Za-z]{2,}[\s ]+[A-Za-z{$€£0-9]/;
const HTML = /<\/?(?:p|div|html|body|h[1-6]|span|a|strong|em|br|table|td|tr|li|ul|button)\b/i;

export function lineOf(sf, pos) {
  return sf.getLineAndCharacterOfPosition(pos).line + 1;
}

function calleeName(expr) {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) {
    const left = calleeName(expr.expression);
    return left ? `${left}.${expr.name.text}` : `?.${expr.name.text}`;
  }
  if (expr.kind === ts.SyntaxKind.ImportKeyword) return 'import';
  if (ts.isCallExpression(expr)) return calleeName(expr.expression);
  return '';
}

function propName(name) {
  if (!name) return '';
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name) || ts.isPrivateIdentifier(name)) return name.text;
  return '';
}

/** +1 when `expr` tests for the app build, -1 when it tests for the web build, 0 otherwise. */
function appTest(expr) {
  while (ts.isParenthesizedExpression(expr)) expr = expr.expression;
  if (ts.isPrefixUnaryExpression(expr) && expr.operator === ts.SyntaxKind.ExclamationToken) return -appTest(expr.operand);
  if (ts.isIdentifier(expr)) return APP_FLAG.test(expr.text) ? 1 : WEB_FLAG.test(expr.text) ? -1 : 0;
  if (ts.isPropertyAccessExpression(expr)) {
    if (APP_FLAG.test(expr.name.text)) return 1;
    if (WEB_FLAG.test(expr.name.text)) return -1;
    if (expr.name.text === 'NEXT_PUBLIC_IS_APP') return 1;
    return 0;
  }
  if (ts.isCallExpression(expr)) return appTest(expr.expression);
  if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    const l = appTest(expr.left);
    const r = appTest(expr.right);
    return l || r;
  }
  return 0;
}

function templateText(node) {
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  let out = node.head.text;
  for (const span of node.templateSpans) out += `{${span.expression.getText().replace(/\s+/g, ' ').slice(0, 30)}}${span.literal.text}`;
  return out;
}

const isPlus = (node) => ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken;

/** The operands of a `+` chain (parentheses unwrapped), or null when `node` is not one. */
function concatParts(node) {
  if (!isPlus(node)) return null;
  const side = (e) => {
    while (ts.isParenthesizedExpression(e)) e = e.expression;
    return isPlus(e) ? concatParts(e) : [e];
  };
  return [...side(node.left), ...side(node.right)];
}

/** Whether `node` sits inside a larger `+` chain (that chain is the unit, not this part). */
function inConcat(node) {
  let p = node.parent;
  while (p && ts.isParenthesizedExpression(p)) p = p.parent;
  return !!p && isPlus(p);
}

const tidy = (s) => s.replace(/[\s ]+/g, ' ').replace(/\s+([,.:;!?)])/g, '$1').replace(/\(\s+/g, '(').trim();

function jsxTextOf(node) {
  return node.containsOnlyTriviaWhiteSpaces ? '' : node.text;
}

// Inline elements join their parent's sentence; block elements are units of their own.
const INLINE_TAGS = new Set(['span', 'strong', 'b', 'em', 'i', 'a', 'small', 'sup', 'sub', 'mark', 'code', 'u', 's', 'abbr', 'time', 'q', 'cite', 'label', 'Link', 'Claim', 'Trans']);

function isInline(node) {
  if (ts.isJsxFragment(node)) return true;
  if (!ts.isJsxElement(node)) return false;
  return INLINE_TAGS.has(node.openingElement.tagName.getText());
}

/** Flattened text of a JSX element and its inline descendants, with the string literals it consumed. */
function flattenJsx(node, consumed) {
  const parts = [];
  let textChildren = 0;
  let direct = false;
  const children = ts.isJsxElement(node) || ts.isJsxFragment(node) ? node.children : [];
  for (const c of children) {
    if (ts.isJsxText(c)) {
      const t = jsxTextOf(c);
      if (t.trim()) { parts.push(t); direct = true; textChildren++; }
    } else if (ts.isJsxExpression(c) && c.expression) {
      const e = c.expression;
      if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) {
        parts.push(e.text); consumed.add(e);
        if (e.text.trim()) { direct = true; textChildren++; }
      } else if (ts.isTemplateExpression(e)) {
        parts.push(templateText(e)); consumed.add(e); direct = true; textChildren++;
      } else parts.push(' {…} ');
    } else if ((ts.isJsxElement(c) || ts.isJsxFragment(c)) && isInline(c)) {
      const inner = flattenJsx(c, consumed);
      if (inner.text) { parts.push(` ${inner.text} `); textChildren++; }
    } else if (ts.isJsxElement(c) || ts.isJsxFragment(c) || ts.isJsxSelfClosingElement(c)) parts.push(' ');
  }
  return { text: tidy(parts.join('')), textChildren, direct };
}

function emptyUnitContext() {
  return { webOnly: false, appOnly: false };
}

/**
 * Copy units of one TypeScript or TSX source.
 * ruleset 'client' reads every prose string; 'backend' reads only BACKEND_PROPS values, exception
 * messages and HTML templates.
 */
export function extractTs(fileName, text, { ruleset = 'client' } = {}) {
  const kind = /\.tsx$/.test(fileName) ? ts.ScriptKind.TSX : /\.jsx?$/.test(fileName) ? ts.ScriptKind.JSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const units = [];
  const consumed = new Set();
  const fileWebOnly = /\/\/\s*copy-lint:\s*web-only\b/.test(text.split('\n').slice(0, 30).join('\n'));
  const backend = ruleset === 'backend';

  const push = (node, textValue, unitKind, ctx, extra = {}) => {
    const t = tidy(textValue);
    if (!t || !/[A-Za-z]/.test(t)) return null;
    const u = {
      text: t,
      line: lineOf(sf, node.getStart(sf)),
      endLine: lineOf(sf, node.getEnd()),
      kind: unitKind,
      webOnly: fileWebOnly || ctx.webOnly,
      appOnly: ctx.appOnly,
      ...extra,
    };
    units.push(u);
    return u;
  };

  const literalValue = (node) => (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : ts.isTemplateExpression(node) ? templateText(node) : null);
  // "a " + "b" + n is one piece of copy: a `+` chain with a string operand reads like a template,
  // with the other operands as {spans}. Only the outermost `+` of a chain is a unit.
  const stringValue = (node) => {
    const lit = literalValue(node);
    if (lit !== null) return lit;
    const parts = concatParts(node);
    if (!parts || !parts.some((q) => literalValue(q) !== null)) return null;
    return parts.map((q) => literalValue(q) ?? `{${q.getText(sf).replace(/\s+/g, ' ').slice(0, 30)}}`).join('');
  };

  /** Whether a string literal in this position is copy (client rule set). */
  const isCopyString = (node, value) => {
    const p = node.parent;
    if (!p) return false;
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p) || ts.isLiteralTypeNode(p) || ts.isImportTypeNode?.(p)) return false;
    if ((ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p)) && p.name === node) return false;
    if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return false;
    if (ts.isCaseClause(p)) return false;
    if (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.InKeyword].includes(p.operatorToken.kind)) return false;
    if ((ts.isCallExpression(p) || ts.isNewExpression(p)) && p.expression !== node && SKIP_CALLEE.test(calleeName(p.expression))) return false;
    if (ts.isJsxAttribute(p) || (ts.isJsxExpression(p) && p.parent && ts.isJsxAttribute(p.parent))) return false; // attributes are handled on their own
    if (ts.isPropertyAssignment(p) && TEXT_PROPS.has(propName(p.name))) return 'prose';
    if (PROSE.test(value)) return 'prose';
    // Short strings with a space ("100 Tails = $1") are read for the word rules; one-word strings
    // ("bg-black", "wallet") are class names, keys and symbols far more often than copy.
    // Template spans ({data.txHash.slice(2, 10)}) are code, so their spaces do not count.
    const literal = value.replace(/\{[^}]*\}/g, '');
    return /[A-Za-z]/.test(literal) && /\S\s+\S/.test(literal) ? 'short' : false;
  };

  const visit = (node, ctx) => {
    // Branches on the app flag: the web branch is web-only, the app branch app-only.
    if (ts.isConditionalExpression(node)) {
      const a = appTest(node.condition);
      if (a) {
        visit(node.condition, ctx);
        visit(node.whenTrue, a > 0 ? { ...ctx, appOnly: true, webOnly: false } : { ...ctx, webOnly: true, appOnly: false });
        visit(node.whenFalse, a > 0 ? { ...ctx, webOnly: true, appOnly: false } : { ...ctx, appOnly: true, webOnly: false });
        return;
      }
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      const a = appTest(node.left);
      if (a) {
        visit(node.left, ctx);
        visit(node.right, a > 0 ? { ...ctx, appOnly: true, webOnly: false } : { ...ctx, webOnly: true, appOnly: false });
        return;
      }
    }
    if (ts.isIfStatement(node)) {
      const a = appTest(node.expression);
      if (a) {
        visit(node.thenStatement, a > 0 ? { ...ctx, appOnly: true } : { ...ctx, webOnly: true });
        if (node.elseStatement) visit(node.elseStatement, a > 0 ? { ...ctx, webOnly: true } : { ...ctx, appOnly: true });
        return;
      }
    }

    if (backend) {
      visitBackend(node, ctx);
    } else {
      // JSX inside an expression ({cond && <p>…</p>}) is not part of the parent's flattened text.
      if (ts.isJsxExpression(node) && ctx.inJsxText) ctx = { ...ctx, inJsxText: false };
      if ((ts.isJsxElement(node) || ts.isJsxFragment(node)) && !(ctx.inJsxText && isInline(node))) {
        const localConsumed = new Set();
        const flat = flattenJsx(node, localConsumed);
        if (flat.text && (flat.direct || (flat.textChildren >= 2 && flat.text.length <= 160))) {
          for (const c of localConsumed) consumed.add(c);
          push(node, flat.text, 'jsx', ctx);
          ts.forEachChild(node, (c) => visit(c, { ...ctx, inJsxText: true }));
          return;
        }
      }
      if (ts.isJsxAttribute(node) && node.initializer) {
        const name = node.name.getText(sf);
        const init = node.initializer;
        const expr = ts.isJsxExpression(init) ? init.expression : init;
        const value = expr ? stringValue(expr) : null;
        if (value !== null && !NON_TEXT_ATTRS.test(name) && (TEXT_ATTRS.has(name) || PROSE.test(value))) push(node, value, 'attr', ctx, { prop: name });
        if (expr && value === null) visit(expr, ctx);
        return;
      }
      if (ts.isObjectLiteralExpression(node)) {
        const texts = [];
        for (const p of node.properties) {
          if (ts.isPropertyAssignment(p) && TEXT_PROPS.has(propName(p.name))) {
            const v = stringValue(p.initializer);
            if (v !== null && /[A-Za-z0-9]/.test(v)) texts.push(v);
          }
        }
        if (texts.length >= 2) push(node, texts.join(' '), 'object', ctx, { members: texts.length });
      }
      const v = inConcat(node) ? null : stringValue(node);
      if (v !== null) {
        const copy = consumed.has(node) ? false : isCopyString(node, v);
        if (copy === 'short') push(node, v, 'string', ctx, { short: true, spaced: /\s/.test(v.trim()) });
        else if (copy) {
          const p = node.parent;
          const prop = ts.isPropertyAssignment(p) ? propName(p.name) : undefined;
          const grouped = prop && TEXT_PROPS.has(prop) && ts.isObjectLiteralExpression(p.parent) && p.parent.properties.filter((q) => ts.isPropertyAssignment(q) && TEXT_PROPS.has(propName(q.name)) && stringValue(q.initializer) !== null).length >= 2;
          push(node, v, prop && TEXT_PROPS.has(prop) ? 'prop' : 'string', ctx, prop ? { prop, grouped: !!grouped } : {});
        }
        if (ts.isTemplateExpression(node)) for (const s of node.templateSpans) visit(s.expression, ctx);
        for (const q of concatParts(node) || []) if (literalValue(q) === null) visit(q, ctx);
        return;
      }
    }
    ts.forEachChild(node, (c) => visit(c, ctx));
  };

  const visitBackend = (node, ctx) => {
    const v = inConcat(node) ? null : stringValue(node);
    if (v === null) return;
    const p = node.parent;
    if (ts.isPropertyAssignment(p) && p.initializer === node && BACKEND_PROPS.has(propName(p.name))) push(node, v, 'prop', ctx, { prop: propName(p.name) });
    else if (ts.isNewExpression(p) && /Exception$/.test(calleeName(p.expression)) && p.arguments?.[0] === node) push(node, v, 'string', ctx, { prop: 'exception' });
    else if (HTML.test(v)) push(node, v.replace(/<[^>]+>/g, ' '), 'string', ctx, { prop: 'html' });
  };

  visit(sf, emptyUnitContext());
  return units;
}

/**
 * Copy units of a JSON file: string values, with the object's `claim` id when present. Prose is a
 * full unit; other strings are `short` (word rules only). `paths` limits the scan to those value
 * paths ("meta.title", "meta.objectives[]", "meta.hints[].text"): a level file is mostly map data.
 */
export function extractJson(fileName, text, { paths } = {}) {
  let data;
  try { data = JSON.parse(text); } catch { return []; }
  const lines = text.split('\n');
  const units = [];
  const findLine = (s, from) => {
    const needle = JSON.stringify(s).slice(1, -1);
    for (let i = from; i < lines.length; i++) if (lines[i].includes(needle)) return i + 1;
    for (let i = 0; i < from; i++) if (lines[i].includes(needle)) return i + 1;
    return 1;
  };
  let cursor = 0;
  const wanted = paths ? new Set(paths) : null;
  const walk = (v, claim, path) => {
    if (typeof v === 'string') {
      if (wanted && !wanted.has(path)) return;
      const prose = PROSE.test(v);
      if (prose || (/[A-Za-z]/.test(v) && /\S\s+\S/.test(v))) {
        const line = findLine(v, cursor);
        cursor = Math.max(cursor, line - 1);
        const extra = prose ? {} : { short: true, spaced: /\s/.test(v.trim()) };
        units.push({ text: tidy(v), line, endLine: line, kind: 'json', webOnly: false, appOnly: false, claim, ...extra });
      }
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, claim, `${path}[]`));
    else if (v && typeof v === 'object') {
      const own = typeof v.claim === 'string' ? v.claim : typeof v.claimId === 'string' ? v.claimId : claim;
      for (const [k, x] of Object.entries(v)) if (k !== 'claim' && k !== 'claimId') walk(x, own, path ? `${path}.${k}` : k);
    }
  };
  walk(data, undefined, '');
  return units;
}

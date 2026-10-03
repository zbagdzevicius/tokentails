import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import * as ts from 'typescript';

/*
 * Ledger split guard (plan G5, decision #34): every Tails credit moves `tails` AND `tailsEarned`, so
 * lifetime earned Tails (what every rank, tier and threshold reads) can never fall behind. Credits go
 * through `earnTailsInc` (src/user/tails-ledger.ts), gives through `giveTailsInc`. This spec parses
 * every backend source file with the TypeScript AST and fails on:
 *   - an `$inc` with a `tails` key that names no `tailsEarned`, unless it is a give: a negative
 *     `tails` next to `tailsGiven` (a positive `tails` next to `tailsGiven` is a credit in disguise);
 *   - the same written into a variable first (`const inc = { tails: n }; … { $inc: inc }`), or
 *     spread from one (`$inc: { ...inc }`);
 *   - a `$set` of `tails` outside the allow-list (account deletion zeroes the board fields, the
 *     starter pack sets the opening balance), since a `$set` moves the balance without the ledger.
 * Values built at run time (a function parameter, a computed key) are out of its reach; the helpers
 * are the way to write them.
 */

const SRC = __dirname;
const SKIP_DIRS = new Set(['vendor', 'shared-contracts', 'node_modules']);

/**
 * Files allowed to `$set` the `tails` balance directly. Rescue Goals (task 5f): the refund pipeline
 * gives a held or cancelled give back (`tails + n`, `tailsGiven - n` clamped at 0) without crediting
 * `tailsEarned`, since the give never lowered it.
 */
export const TAILS_SET_ALLOW_LIST = new Set([
    'src/user/guest/account-deletion.ts',
    'src/user/starter.ts',
    'src/rescue-goal/rescue-goal.ledger.ts',
]);

export interface ILedgerViolation {
    file: string;
    line: number;
    text: string;
}

const keyName = (name: ts.PropertyName): string | null => {
    if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) {
        return name.text;
    }
    return null;
};

/** `const name = { … }` object literals of a file, by name (file scope; good enough for a guard). */
function objectVariables(sourceFile: ts.SourceFile): Map<string, ts.ObjectLiteralExpression> {
    const variables = new Map<string, ts.ObjectLiteralExpression>();
    const visit = (node: ts.Node) => {
        if (
            ts.isVariableDeclaration(node) &&
            ts.isIdentifier(node.name) &&
            node.initializer &&
            ts.isObjectLiteralExpression(node.initializer)
        ) {
            variables.set(node.name.text, node.initializer);
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return variables;
}

/**
 * Property keys of an object literal and their value expressions. Spreads of a known variable are
 * followed; spreads of a call (`...earnTailsInc(n)`) are the helper's job and add nothing here.
 */
function literalProperties(
    object: ts.ObjectLiteralExpression,
    variables: Map<string, ts.ObjectLiteralExpression>,
    seen = new Set<ts.Node>()
): Map<string, ts.Expression | null> {
    const properties = new Map<string, ts.Expression | null>();
    if (seen.has(object)) return properties;
    seen.add(object);
    for (const property of object.properties) {
        if (ts.isPropertyAssignment(property)) {
            const key = keyName(property.name);
            if (key) properties.set(key, property.initializer);
        } else if (ts.isMethodDeclaration(property)) {
            const key = keyName(property.name);
            if (key) properties.set(key, null);
        } else if (ts.isShorthandPropertyAssignment(property)) {
            properties.set(property.name.text, null);
        } else if (ts.isSpreadAssignment(property) && ts.isIdentifier(property.expression)) {
            const spread = variables.get(property.expression.text);
            if (spread) {
                literalProperties(spread, variables, seen).forEach((value, key) => properties.set(key, value));
            }
        }
    }
    return properties;
}

/** The object literal an update operator's value is, directly or through a `const`. */
function operatorObject(
    value: ts.Expression | undefined,
    variables: Map<string, ts.ObjectLiteralExpression>
): ts.ObjectLiteralExpression | null {
    if (!value) return null;
    if (ts.isObjectLiteralExpression(value)) return value;
    if (ts.isIdentifier(value)) return variables.get(value.text) || null;
    return null;
}

const isNegative = (value: ts.Expression | null | undefined) =>
    !!value && ts.isPrefixUnaryExpression(value) && value.operator === ts.SyntaxKind.MinusToken;

/** Every ledger-unaware `tails` write in `source` (see the header). */
export function findLedgerViolations(file: string, source: string): ILedgerViolation[] {
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const variables = objectVariables(sourceFile);
    const violations: ILedgerViolation[] = [];
    const report = (node: ts.Node) => {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        violations.push({ file, line: line + 1, text: node.getText(sourceFile).replace(/\s+/g, ' ') });
    };
    const visit = (node: ts.Node) => {
        let operator: string | null = null;
        let value: ts.Expression | undefined;
        if (ts.isPropertyAssignment(node)) {
            operator = keyName(node.name);
            value = node.initializer;
        } else if (ts.isShorthandPropertyAssignment(node)) {
            operator = node.name.text;
            value = node.name;
        }
        const object = operator === '$inc' || operator === '$set' ? operatorObject(value, variables) : null;
        if (object) {
            const properties = literalProperties(object, variables);
            if (properties.has('tails')) {
                if (operator === '$set') {
                    if (!TAILS_SET_ALLOW_LIST.has(file)) report(node);
                } else if (!properties.has('tailsEarned')) {
                    const give = properties.has('tailsGiven') && isNegative(properties.get('tails'));
                    if (!give) report(node);
                }
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return violations;
}

function* sourceFiles(dir: string): Generator<string> {
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
            if (!SKIP_DIRS.has(entry)) yield* sourceFiles(path);
        } else if (
            entry.endsWith('.ts') &&
            !entry.endsWith('.d.ts') &&
            !/\.(spec|helper-spec|fakes-spec)\.ts$/.test(entry)
        ) {
            yield path;
        }
    }
}

const relativePath = (path: string) => relative(join(SRC, '..'), path).split(sep).join('/');

describe('G5 ledger split: no Tails credit without tailsEarned (AST)', () => {
    const files = [...sourceFiles(SRC)];

    it('scans the backend sources', () => {
        expect(files.length).toBeGreaterThan(100);
        expect(files.map(relativePath)).toEqual(expect.arrayContaining(['src/user/user.controller.ts']));
    });

    it('every `$inc` with `tails` goes through earnTailsInc (or names tailsEarned / tailsGiven)', () => {
        const violations = files.flatMap(path => findLedgerViolations(relativePath(path), readFileSync(path, 'utf8')));
        expect(violations).toEqual([]);
    });

    it('the credit sites use the helper', () => {
        // The ~20 credit sites of plan G5, by file. A new site may be added; a site silently going
        // back to a raw `tails` increment fails the test above.
        const expected: Record<string, number> = {
            'src/user/user.controller.ts': 8,
            'src/user/user.service.ts': 1,
            'src/user/guest/guest-lifecycle.ts': 1,
            'src/user/guest/referral.ts': 2,
            'src/quest/quest.controller.ts': 2,
            'src/cat/cat-staking.service.ts': 1,
            'src/cat/cat.controller.ts': 1,
        };
        const actual = Object.fromEntries(
            Object.keys(expected).map(file => [
                file,
                (readFileSync(join(SRC, '..', file), 'utf8').match(/\bearnTailsInc\(/g) || []).length,
            ])
        );
        for (const [file, minimum] of Object.entries(expected)) {
            expect([file, actual[file] >= minimum]).toEqual([file, true]);
        }
    });

    describe('the checker itself', () => {
        const check = (code: string) => findLedgerViolations('fixture.ts', code);

        it('catches a credit without tailsEarned', () => {
            expect(check(`users.updateOne({ _id }, { $inc: { tails: 100, monthTails: 100 } });`)).toEqual([
                { file: 'fixture.ts', line: 1, text: '$inc: { tails: 100, monthTails: 100 }' },
            ]);
        });

        it('catches shorthand and quoted keys, in bulk writes too', () => {
            expect(check(`const tails = 5; update({ $inc: { tails, monthTailsCrafted: tails } });`)).toHaveLength(1);
            expect(check(`update({ '$inc': { 'tails': 5 } });`)).toHaveLength(1);
            expect(
                check(
                    `bulkWrite(rows.map(r => ({ updateOne: { filter: { _id: r }, update: { $inc: { tails: 1 } } } })));`
                )
            ).toHaveLength(1);
        });

        it('accepts the helper, an explicit tailsEarned, a give, and unrelated increments', () => {
            expect(check(`update({ $inc: { ...earnTailsInc(5), monthTails: 5 } });`)).toEqual([]);
            expect(check(`update({ $inc: earnTailsInc(5) });`)).toEqual([]);
            expect(check(`update({ $inc: { tails: 5, tailsEarned: 5 } });`)).toEqual([]);
            expect(check(`update({ $inc: { tails: -5, tailsGiven: 5, monthTailsGiven: 5 } });`)).toEqual([]);
            expect(check(`update({ $inc: { boxes: 1, catnipCount: 3 } });`)).toEqual([]);
            expect(check(`const inc = { ...earnTailsInc(5), monthTails: 5 }; update({ $inc: inc });`)).toEqual([]);
            expect(check(`update({ $set: { referredBy: id }, $inc: earnTailsInc(5) });`)).toEqual([]);
        });

        it('catches a credit built in a variable first, or spread from one (4e review fix #4)', () => {
            expect(check(`const inc = { tails: n }; users.updateOne({ _id }, { $inc: inc });`)).toEqual([
                { file: 'fixture.ts', line: 1, text: '$inc: inc' },
            ]);
            expect(check(`const $inc = { tails: n }; users.updateOne({ _id }, { $inc });`)).toHaveLength(1);
            expect(check(`const base = { tails: n }; update({ $inc: { ...base, monthTails: n } });`)).toHaveLength(1);
        });

        it('a positive tails next to tailsGiven is a credit, not a give', () => {
            expect(check(`update({ $inc: { tails: 100, tailsGiven: 0 } });`)).toHaveLength(1);
            expect(check(`update({ $inc: { tails: amount, tailsGiven: amount } });`)).toHaveLength(1);
            expect(check(`update({ $inc: { ...giveTailsInc(amount), goalsHelped: 1 } });`)).toEqual([]);
        });

        it('a $set of tails is allowed only in the allow-listed files', () => {
            expect(check(`update({ $set: { tails: 1e6 } });`)).toHaveLength(1);
            expect(check(`const set = { tails: 0, monthTails: 0 }; update({ $set: set });`)).toHaveLength(1);
            expect(
                findLedgerViolations('src/user/guest/account-deletion.ts', `update({ $set: { tails: 0 } });`)
            ).toEqual([]);
            expect(findLedgerViolations('src/user/starter.ts', `update({ $set: { tails: 50 } });`)).toEqual([]);
        });
    });
});

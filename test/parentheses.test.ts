import { strict as assert } from 'node:assert';
import { validator, ValidatorSyntaxError } from '../src/index.js';

describe('parentheses', () => {
  test('can be used to group types', () => {
    const v = validator`(string | boolean)[]`;
    v.assertMatches(['x', true]);
  });

  test('can be used to modify order of operations', () => {
    const v = validator`{ x: number } & ({ y: number } | { z: number })`;
    expect(v.matches({ x: 1, y: 2 })).toBe(true);
    expect(v.matches({ x: 1, z: 3 })).toBe(true);
    expect(v.matches({ x: 1 })).toBe(false);
    expect(v.matches({ y: 2 })).toBe(false);
    expect(v.matches({ z: 3 })).toBe(false);
  });

  test('can be used with a single simple rule in it', () => {
    const v = validator`(string)[]`;
    v.assertMatches(['x']);
  });

  test('produces the correct rule', () => {
    const v = validator`(string)`;
    expect(v.ruleset).toMatchObject({
      rootRule: {
        category: 'simple',
        type: 'string',
      },
      interpolated: [],
    });
    expect(Object.isFrozen(v.ruleset)).toBe(true);
    expect(Object.isFrozen(v.ruleset.rootRule)).toBe(true);
    expect(Object.isFrozen(v.ruleset.interpolated)).toBe(true);
  });

  test('works with funky whitespace', () => {
    const v = validator`( string  )`;
    expect(v.ruleset).toMatchObject({
      rootRule: {
        category: 'simple',
        type: 'string',
      },
      interpolated: [],
    });
  });

  test('union types are flattened through parentheses (test 1)', () => {
    const v = validator`number | (string | boolean) | ((null)) | undefined`;
    expect(v.ruleset.rootRule).toMatchObject({
      category: 'union',
      variants: [
        { category: 'simple', type: 'number' },
        { category: 'simple', type: 'string' },
        { category: 'simple', type: 'boolean' },
        { category: 'simple', type: 'null' },
        { category: 'simple', type: 'undefined' },
      ],
    });
    expect(Object.isFrozen(v.ruleset.rootRule)).toBe(true);
  });

  test('union types are flattened through parentheses (test 2)', () => {
    const v = validator`(number | null) | ((string | boolean))`;
    expect(v.ruleset.rootRule).toMatchObject({
      category: 'union',
      variants: [
        { category: 'simple', type: 'number' },
        { category: 'simple', type: 'null' },
        { category: 'simple', type: 'string' },
        { category: 'simple', type: 'boolean' },
      ],
    });
    expect(Object.isFrozen(v.ruleset.rootRule)).toBe(true);
  });

  test('intersection types are flattened through parentheses (test 1)', () => {
    const v = validator`number & (string & boolean) & ((null)) & undefined`;
    expect(v.ruleset.rootRule).toMatchObject({
      category: 'intersection',
      variants: [
        { category: 'simple', type: 'number' },
        { category: 'simple', type: 'string' },
        { category: 'simple', type: 'boolean' },
        { category: 'simple', type: 'null' },
        { category: 'simple', type: 'undefined' },
      ],
    });
    expect(Object.isFrozen(v.ruleset.rootRule)).toBe(true);
  });

  test('intersection types are flattened through parentheses (test 2)', () => {
    const v = validator`(number & null) & ((string & boolean))`;
    expect(v.ruleset.rootRule).toMatchObject({
      category: 'intersection',
      variants: [
        { category: 'simple', type: 'number' },
        { category: 'simple', type: 'null' },
        { category: 'simple', type: 'string' },
        { category: 'simple', type: 'boolean' },
      ],
    });
    expect(Object.isFrozen(v.ruleset.rootRule)).toBe(true);
  });

  describe('syntax', () => {
    test('throws a syntax error if the parentheses are empty', () => {
      const act = (): any => validator`()`;
      assert.throws(act, {
        message: [
          'Expected to find a type here. (line 1, col 2)',
          '  ()',
          '   ~',
        ].join('\n'),
      });
      assert.throws(act, ValidatorSyntaxError);
    });

    test('throws a syntax error if a closing parentheses is not where it should be', () => {
      const act = (): any => validator`(string number)`;
      assert.throws(act, {
        message: [
          'Expected to find a closing parentheses (`)`) here. (line 1, col 9)',
          '  (string number)',
          '          ~~~~~~',
        ].join('\n'),
      });
      assert.throws(act, ValidatorSyntaxError);
    });

    test('throws a syntax error if eof is reaches without a closing parentheses', () => {
      const act = (): any => validator`(string`;
      assert.throws(act, {
        message: [
          'Expected to find a closing parentheses (`)`) here. (line 1, col 8)',
          '  (string',
          '         ~',
        ].join('\n'),
      });
      assert.throws(act, ValidatorSyntaxError);
    });

    test('throws a syntax error if an interpolation point is reaches without a closing parentheses', () => {
      const act = (): any => validator`(string ${42} number)`;
      assert.throws(act, {
        message: [
          'Expected to find a closing parentheses (`)`) here. (line 1, col 9)',
          '  (string ${…} number)',
          '          ~~~~',
        ].join('\n'),
      });
      assert.throws(act, ValidatorSyntaxError);
    });
  });
});

import { strict as assert } from 'node:assert';
import { validator, ValidatorSyntaxError } from '../src/index.js';

describe('tuple rules', () => {
  test('accepts an array with matching entries', () => {
    const v = validator`[string, number]`;
    v.assertMatches(['abc', 2]);
  });

  test('accepts an empty array', () => {
    const v = validator`[]`;
    v.assertMatches([]);
  });

  test('rejects a non-array', () => {
    const v = validator`[string, number]`;
    const act = (): any => v.assertMatches({});
    assert.throws(act, { message: 'Expected <receivedValue> to be an array but got [object Object].' });
    assert.throws(act, TypeError);
  });

  test('rejects a typed-array', () => {
    const v = validator`[string, number]`;
    const act = (): any => v.assertMatches(new Uint8Array());
    assert.throws(act, { message: 'Expected <receivedValue> to be an array but got [object Uint8Array].' });
    assert.throws(act, TypeError);
  });

  test('rejects an array of the wrong length', () => {
    const v = validator`[string, number]`;
    const act = (): any => v.assertMatches(['xyz']);
    assert.throws(act, { message: 'Expected the <receivedValue> array to have 2 entries, but found 1.' });
    assert.throws(act, TypeError);
  });

  test('gives the correct pluralization in an error related to matching against a one-sized tuple', () => {
    const v = validator`[string]`;
    const act = (): any => v.assertMatches(['xyz', 'abc']);
    assert.throws(act, { message: 'Expected the <receivedValue> array to have 1 entry, but found 2.' });
    assert.throws(act, TypeError);
  });

  test('rejects an array with the wrong properties', () => {
    const v = validator`[string, number]`;
    const act = (): any => v.assertMatches(['abc', 'def']);
    assert.throws(act, { message: 'Expected <receivedValue>[1] to be of type "number" but got type "string".' });
    assert.throws(act, TypeError);
  });

  test('accepts an inherited array', () => {
    class MyArray extends Array {}
    const v = validator`[string, number]`;
    v.assertMatches(new (MyArray as any)('abc', 2));
  });

  test('rejects an inherited array with the wrong properties', () => {
    class MyArray extends Array {}
    const v = validator`[string, number]`;
    const act = (): any => v.assertMatches(new (MyArray as any)('abc', 'def'));
    assert.throws(act, { message: 'Expected <receivedValue>[1] to be of type "number" but got type "string".' });
    assert.throws(act, TypeError);
  });

  test('rejects sparse arrays if the matcher does not allow for undefined entries (test 1)', () => {
    const v = validator`[number]`;
    const act = (): any => v.assertMatches([2,,]); // eslint-disable-line no-sparse-arrays
    assert.throws(act, { message: 'Expected the <receivedValue> array to have 1 entry, but found 2.' });
    assert.throws(act, TypeError);
  });

  test('rejects sparse arrays if the matcher does not allow for undefined entries (test 2)', () => {
    const v = validator`[number]`;
    const act = (): any => v.assertMatches([,]); // eslint-disable-line no-sparse-arrays
    assert.throws(act, { message: 'Expected <receivedValue>[0] to be of type "number" but got type "undefined".' });
    assert.throws(act, TypeError);
  });

  test('allows sparse arrays if the matcher allows undefined entries', () => {
    const v = validator`[number | undefined]`;
    v.assertMatches([,]); // eslint-disable-line no-sparse-arrays
  });

  describe('optional entries', () => {
    test('can choose to supply some of the optional entries', () => {
      const v = validator`[string, number?, boolean?, bigint?]`;
      v.assertMatches(['xyz', 2, true]);
    });

    test('optional properties must be of the correct type', () => {
      const v = validator`[string, number?, boolean?]`;
      const act = (): any => v.assertMatches(['xyz', 2, 4]);
      assert.throws(act, { message: 'Expected <receivedValue>[2] to be of type "boolean" but got type "number".' });
      assert.throws(act, TypeError);
    });

    test('rejects arrays that are larger than the max tuple size', () => {
      const v = validator`[string, number?, boolean?]`;
      const act = (): any => v.assertMatches(['xyz', 2, true, undefined]);
      assert.throws(act, { message: 'Expected the <receivedValue> array to have between 1 and 3 entries, but found 4.' });
      assert.throws(act, TypeError);
    });

    test('rejects arrays that are smaller than the max tuple size', () => {
      const v = validator`[string, number, boolean?]`;
      const act = (): any => v.assertMatches(['xyz']);
      assert.throws(act, { message: 'Expected the <receivedValue> array to have between 2 and 3 entries, but found 1.' });
      assert.throws(act, TypeError);
    });

    test('optional entries and no required entries', () => {
      const v = validator`[string?]`;
      expect(v.matches([])).toBe(true);
      expect(v.matches(['xyz'])).toBe(true);
      expect(v.matches([2])).toBe(false);
    });
  });

  describe('tuples with the rest operator', () => {
    test('can supply extra entries', () => {
      const v = validator`[string, number, ...boolean[]]`;
      v.assertMatches(['xyz', 2, false, true]);
    });

    test('can supply the minimum number of required entries', () => {
      const v = validator`[string, number, ...boolean[]]`;
      v.assertMatches(['xyz', 2]);
    });

    test('can avoid supplying both rest and optional entries', () => {
      const v = validator`[string, number, string?, ...boolean[]]`;
      v.assertMatches(['xyz', 2]);
    });

    test('can supply an optional property without supplying values to the "rest"', () => {
      const v = validator`[string, number, string?, ...boolean[]]`;
      v.assertMatches(['xyz', 2, 'abc']);
    });

    test('rejects when not enough entries are supplied', () => {
      const v = validator`[string, number, ...string[]]`;
      const act = (): any => v.assertMatches(['xyz']);
      assert.throws(act, { message: 'Expected the <receivedValue> array to have at least 2 entries, but found 1.' });
      assert.throws(act, TypeError);
    });

    test('gives the correct pluralization in an error related to rejecting a tuple of at least length 1', () => {
      const v = validator`[string, ...string[]]`;
      const act = (): any => v.assertMatches([]);
      assert.throws(act, { message: 'Expected the <receivedValue> array to have at least 1 entry, but found 0.' });
      assert.throws(act, TypeError);
    });

    test('rejects when the rest entry is of the wrong type', () => {
      const v = validator`[string, number, ...boolean[]]`;
      const act = (): any => v.assertMatches(['xyz', 2, true, 'xyz']);
      assert.throws(act, { message: 'Expected <receivedValue>[3] to be of type "boolean" but got type "string".' });
      assert.throws(act, TypeError);
    });

    test('works with empty tuples', () => {
      const v = validator`[...string[]]`;
      expect(v.matches(['xyz'])).toBe(true);
      expect(v.matches([])).toBe(true);
      expect(v.matches([2])).toBe(false);
    });

    test('rejects when rest type does not accept an array', () => {
      const v = validator`[string, ...boolean]`;
      const act = (): any => v.assertMatches(['xyz', true]);
      assert.throws(act, { message: 'Expected <receivedValue>.slice(1) to be of type "boolean" but got an array.' });
      assert.throws(act, TypeError);
    });

    test('an expectation function interpolated into a rest patter will get called, even when it receives an empty array', () => {
      let calledWith: any = null;
      const myExpectation = validator.expectTo(value => {
        calledWith = value;
        return undefined;
      });
      const v = validator`[string, number?, ...${myExpectation}]`;
      v.assertMatches(['xyz']);
      expect(calledWith).toMatchObject([]);
    });

    test('nested rest', () => {
      const v = validator`[string, ...[number, ...[boolean]]]`;
      const act = (): any => v.assertMatches(['xyz', 1, 'whoops']);
      // Notice how the error message can correctly collapse the nested rest into a single `<receivedValue>[2]`
      assert.throws(act, { message: 'Expected <receivedValue>[2] to be of type "boolean" but got type "string".' });
    });
  });

  test('you can name tuple fields (test 1)', () => {
    const v = validator`[string: boolean, entry2?: number, ...entry3: unknown[]]`;
    expect(v.matches([true, 2, 'a', 'b'])).toBe(true);
    expect(v.matches([true, 2])).toBe(true);
    expect(v.matches([true, 'x'])).toBe(false);
    expect(v.matches([true])).toBe(true);
    expect(v.matches(['y'])).toBe(false);
  });

  test('you can name tuple fields (test 2)', () => {
    const v = validator`[string?: boolean, ...entry3: unknown[]]`;
    expect(v.matches([true, 'a', 'b'])).toBe(true);
    expect(v.matches([true])).toBe(true);
    expect(v.matches(['x'])).toBe(false);
    expect(v.matches([])).toBe(true);
  });

  test('produces the correct rule', () => {
    const v = validator`[string, number?, boolean?]`;
    expect(v.ruleset).toMatchObject({
      rootRule: {
        category: 'tuple',
        content: [
          {
            category: 'simple',
            type: 'string',
          },
        ],
        optionalContent: [
          {
            category: 'simple',
            type: 'number',
          },
          {
            category: 'simple',
            type: 'boolean',
          },
        ],
        rest: null,
        entryLabels: null,
      },
      interpolated: [],
    });
    expect(Object.isFrozen(v.ruleset)).toBe(true);
    expect(Object.isFrozen(v.ruleset.rootRule)).toBe(true);
    expect(Object.isFrozen(v.ruleset.interpolated)).toBe(true);
  });

  test('produces the correct rule for tuples with a rest operator', () => {
    const v = validator`[string, ...boolean[]]`;
    expect(v.ruleset).toMatchObject({
      rootRule: {
        category: 'tuple',
        content: [
          {
            category: 'simple',
            type: 'string',
          },
        ],
        optionalContent: [],
        rest: {
          category: 'array',
          content: {
            category: 'simple',
            type: 'boolean',
          },
        },
        entryLabels: null,
      },
      interpolated: [],
    });
    expect(Object.isFrozen(v.ruleset)).toBe(true);
    expect(Object.isFrozen(v.ruleset.rootRule)).toBe(true);
    expect(Object.isFrozen(v.ruleset.interpolated)).toBe(true);
  });

  test('produces the correct entry names in the rule', () => {
    const v = validator`[x: string, y?: number, ...z: unknown[]]`;
    assert(v.ruleset.rootRule.category === 'tuple');
    expect(v.ruleset.rootRule.entryLabels).toMatchObject(['x', 'y', 'z']);
  });

  test('works with funky whitespace', () => {
    const v = validator`[  string ,... boolean [ ] ]`;
    expect(v.ruleset).toMatchObject({
      rootRule: {
        category: 'tuple',
        content: [
          {
            category: 'simple',
            type: 'string',
          },
        ],
        optionalContent: [],
        rest: {
          category: 'array',
          content: {
            category: 'simple',
            type: 'boolean',
          },
        },
        entryLabels: null,
      },
      interpolated: [],
    });
  });

  describe('syntax errors', () => {
    test('forbids an omitted separator', () => {
      const act = (): any => validator`[number string]`;
      assert.throws(act, {
        message: [
          'Expected a comma (`,`) or closing bracket (`]`). (line 1, col 9)',
          '  [number string]',
          '          ~~~~~~',
        ].join('\n'),
      });
      assert.throws(act, ValidatorSyntaxError);
    });

    test('allows a trailing comma', () => {
      validator`[number, string,]`;
    });

    test('forbids an empty tuple with a lone comma', () => {
      const act = (): any => validator`[,]`;
      assert.throws(act, {
        message: [
          'Expected a tuple entry or a closing bracket (`]`). (line 1, col 2)',
          '  [,]',
          '   ~',
        ].join('\n'),
      });
      assert.throws(act, ValidatorSyntaxError);
    });

    test('forbids an optional entry before a required one', () => {
      // Intentionally left padding after `}` to see if the error ends the `~` at the correct place.
      const act = (): any => validator`[string, number?, { x: number } ]`;
      assert.throws(act, {
        message: [
          'Required entries can not appear after optional entries. (line 1, col 19)',
          '  [string, number?, { x: number } ]',
          '                    ~~~~~~~~~~~~~',
        ].join('\n'),
      });
      assert.throws(act, ValidatorSyntaxError);
    });

    test('forbids a number as a tuple entry name', () => {
      const act = (): any => validator`[42: boolean]`;
      assert.throws(act, {
        message: [
          'Expected a comma (`,`) or closing bracket (`]`). (line 1, col 4)',
          '  [42: boolean]',
          '     ~',
        ].join('\n'),
      });
      assert.throws(act, ValidatorSyntaxError);
    });

    test('forbids an unnamed tuple entry that is both "rest" and "optional"', () => {
      const act = (): any => validator`[boolean, ...string[]?]`;
      assert.throws(act, {
        message: [
          'A tuple entry can not both be rest (...) and optional (?). (line 1, col 11)',
          '  [boolean, ...string[]?]',
          '            ~~~~~~~~~~~~',
        ].join('\n'),
      });
      assert.throws(act, ValidatorSyntaxError);
    });

    test('forbids a named tuple entry that is both "rest" and "optional"', () => {
      const act = (): any => validator`[x: boolean, ...y?: string[]]`;
      assert.throws(act, {
        message: [
          'A tuple entry can not both be rest (...) and optional (?). (line 1, col 14)',
          '  [x: boolean, ...y?: string[]]',
          '               ~~~~~~~~~~~~~~~',
        ].join('\n'),
      });
      assert.throws(act, ValidatorSyntaxError);
    });

    test('forbids anything else after a rest entry', () => {
      const act = (): any => validator`[boolean, ...string[], { x: number }]`;
      assert.throws(act, {
        message: [
          'Found unexpected content after a rest entry. A rest entry must be the last item in the tuple. (line 1, col 24)',
          '  [boolean, ...string[], { x: number }]',
          '                         ~',
        ].join('\n'),
      });
      assert.throws(act, ValidatorSyntaxError);
    });

    test('forbids the use of a "?" after an entry type when naming tuple entries (test 1)', () => {
      const act = (): any => validator`[x: number, y: number?]`;
      assert.throws(act, {
        message: [
          'To mark a named tuple entry as optional, place the question mark (`?`) before the colon (`:`). (line 1, col 22)',
          '  [x: number, y: number?]',
          '                       ~',
        ].join('\n'),
      });
      assert.throws(act, ValidatorSyntaxError);
    });

    test('forbids the use of a "?" after an entry type when naming tuple entries (test 2)', () => {
      const act = (): any => validator`[x: number, y?: number?]`;
      assert.throws(act, {
        message: [
          'To mark a named tuple entry as optional, place the question mark (`?`) before the colon (`:`). (line 1, col 23)',
          '  [x: number, y?: number?]',
          '                        ~',
        ].join('\n'),
      });
      assert.throws(act, ValidatorSyntaxError);
    });

    test('can not mix named and unnamed entries in the same tuple (test 1)', () => {
      const act = (): any => validator`[string: number, boolean]`;
      assert.throws(act, {
        message: [
          'A tuple must either have all of its entries be named, or none of its entries be named. (line 1, col 18)',
          '  [string: number, boolean]',
          '                   ~~~~~~~',
        ].join('\n'),
      });
      assert.throws(act, ValidatorSyntaxError);
    });

    test('can not mix named and unnamed entries in the same tuple (test 2)', () => {
      const act = (): any => validator`[number, string: boolean]`;
      assert.throws(act, {
        message: [
          'A tuple must either have all of its entries be named, or none of its entries be named. (line 1, col 10)',
          '  [number, string: boolean]',
          '           ~~~~~~~~~~~~~~~',
        ].join('\n'),
      });
      assert.throws(act, ValidatorSyntaxError);
    });

    test('can not mix named and unnamed entries in the same tuple - with rest (test 1)', () => {
      const act = (): any => validator`[name: { x: number } | string, boolean]`;
      assert.throws(act, {
        message: [
          'A tuple must either have all of its entries be named, or none of its entries be named. (line 1, col 32)',
          '  [name: { x: number } | string, boolean]',
          '                                 ~~~~~~~',
        ].join('\n'),
      });
      assert.throws(act, ValidatorSyntaxError);
    });

    test('can not mix named and unnamed entries in the same tuple - with rest (test 2)', () => {
      const act = (): any => validator`[{ x: number } | string, name: boolean]`;
      assert.throws(act, {
        message: [
          'A tuple must either have all of its entries be named, or none of its entries be named. (line 1, col 26)',
          '  [{ x: number } | string, name: boolean]',
          '                           ~~~~~~~~~~~~~',
        ].join('\n'),
      });
      assert.throws(act, ValidatorSyntaxError);
    });

    test('can not mix named and unnamed entries in the same tuple - with complex types (test 1)', () => {
      const act = (): any => validator`[number, boolean, ...args: string[]]`;
      assert.throws(act, {
        message: [
          'A tuple must either have all of its entries be named, or none of its entries be named. (line 1, col 19)',
          '  [number, boolean, ...args: string[]]',
          '                    ~~~~~~~~~~~~~~~~~',
        ].join('\n'),
      });
      assert.throws(act, ValidatorSyntaxError);
    });

    test('can not mix named and unnamed entries in the same tuple - with complex types (test 2)', () => {
      const act = (): any => validator`[name1: number, name2: boolean, ...string[]]`;
      assert.throws(act, {
        message: [
          'A tuple must either have all of its entries be named, or none of its entries be named. (line 1, col 33)',
          '  [name1: number, name2: boolean, ...string[]]',
          '                                  ~~~~~~~~~~~',
        ].join('\n'),
      });
      assert.throws(act, ValidatorSyntaxError);
    });

    test('able to name a tuple containing only a rest entry', () => {
      const v = validator`[...name: unknown[]]`;
      expect(v.matches([2, 'x'])).toBe(true);
    });
  });
});

import { strict as assert } from 'node:assert';
import { validator } from '../src/index.js';

describe('union rules with tuples', () => {
  test('fails to match both union variants (test 1)', () => {
    const v = validator`[number] | [string]`;
    const act = (): any => v.assertMatches([true]);
    assert.throws(act, {
      message: [
        'One of the following issues needs to be resolved:',
        '  * Expected <receivedValue>[0] to be of type "number" but got type "boolean".',
        '  * Expected <receivedValue>[0] to be of type "string" but got type "boolean".',
      ].join('\n'),
    });
  });

  test('fails to match both union variants (test 2)', () => {
    const v = validator`[number] | [string, number]`;
    const act = (): any => v.assertMatches([]);
    assert.throws(act, {
      message: [
        'One of the following issues needs to be resolved:',
        '  * Expected the <receivedValue> array to have 1 entry, but found 0.',
        '  * Expected the <receivedValue> array to have 2 entries, but found 0.',
      ].join('\n'),
    });
  });

  describe('tuples entries are a union', () => {
    test('given a valid input, the simple case does not throw', () => {
      const v = validator`[0 | 1]`;
      v.assertMatches([0]);
    });

    test('given an invalid input, the simple case properly throws', () => {
      const v = validator`[0 | 1]`;
      const act = (): any => v.assertMatches([2]);
      assert.throws(act, {
        message: [
          'One of the following issues needs to be resolved:',
          '  * Expected <receivedValue>[0] to be 0 but got 2.',
          '  * Expected <receivedValue>[0] to be 1 but got 2.',
        ].join('\n'),
      });
    });

    test('having nested and outer unions with the same entry correctly allows valid input (test 1)', () => {
      const v = validator`[0 | 1] | [2]`;
      v.assertMatches([0]);
    });

    test('having nested and outer unions with the same entry correctly allows valid input (test 2)', () => {
      const v = validator`[0 | 1] | [2]`;
      v.assertMatches([2]);
    });

    test('having nested and outer unions with the same entry correctly throws with invalid input', () => {
      const v = validator`[0 | 1] | [2]`;
      const act = (): any => v.assertMatches([3]);
      assert.throws(act, {
        message: [
          'One of the following issues needs to be resolved:',
          '  * Expected <receivedValue>[0] to be 0 but got 3.',
          '  * Expected <receivedValue>[0] to be 1 but got 3.',
          '  * Expected <receivedValue>[0] to be 2 but got 3.',
        ].join('\n'),
      });
    });
  });

  describe('if the tuple length check passes, sibling rule errors are omitted', () => {
    test('primitive sibling rule errors are ignored', () => {
      const v = validator`number | [0] | [1]`;
      const act = (): any => v.assertMatches([2]);
      assert.throws(act, {
        message: [
          'One of the following issues needs to be resolved:',
          '  * Expected <receivedValue>[0] to be 0 but got 2.',
          '  * Expected <receivedValue>[0] to be 1 but got 2.',
        ].join('\n'),
      });
    });

    // In addition to ignoring errors from sibling rules with invalid lengths,
    // only the errors related to the right-most failed entry in the tuple are shown.
    // (The exception being rest errors, which will only show if there are no non-rest errors)
    test('sibling tuple rule errors with invalid lengths are ignored (test 1)', () => {
      const v = validator`[1] | [2] | [...5[]] | [1, 2]`;
      const act = (): any => v.assertMatches([3]);
      assert.throws(act, {
        message: 'Expected <receivedValue>[0] to be 5 but got 3.',
      });
    });

    test('sibling tuple rule errors with invalid lengths are ignored (test 2)', () => {
      const v = validator`[1] | [2] | [1, 2]`;
      const act = (): any => v.assertMatches([3]);
      assert.throws(act, {
        message: [
          'One of the following issues needs to be resolved:',
          '  * Expected <receivedValue>[0] to be 1 but got 3.',
          '  * Expected <receivedValue>[0] to be 2 but got 3.',
        ].join('\n'),
      });
    });

    test('sibling tuple rule errors with invalid lengths are ignored (test 3)', () => {
      const v = validator`[0, ...4[]] | [0, ...5[]] | [0, 1, 2]`;
      const act = (): any => v.assertMatches([0, 4, 4, 4, 5]);
      assert.throws(act, {
        message: 'Expected <receivedValue>[4] to be 4 but got 5.',
      });
    });

    test('sibling tuple rule errors with invalid lengths are ignored (test 4)', () => {
      const v = validator`[0, ...0[]] | [0, 0, ...5[]] | [0, 1, 2]`;
      const act = (): any => v.assertMatches([0, 0, 5, 5, 4]);
      // A union-style error shows, because the lookup paths don't quite line up,
      // so it won't remove duplicates.
      assert.throws(act, {
        message: [
          'One of the following issues needs to be resolved:',
          '  * Expected <receivedValue>[2] to be 0 but got 5.',
          '  * Expected <receivedValue>[4] to be 5 but got 4.',
        ].join('\n'),
      });
    });

    test('does not throw a union-style error if there is only one non-ignored union variant', () => {
      const v = validator`number | [2]`;
      const act = (): any => v.assertMatches([0]);
      assert.throws(act, {
        message: 'Expected <receivedValue>[0] to be 2 but got 0.',
      });
    });
  });

  describe('picking union variants to travel down, when there are multiple potential options', () => {
    // This "picking a variant to travel down" behavior can lead to error messages that don't
    // fully explain everything that could be wrong. These error messages tend to be of a similar quality to
    // TypeScript's error messages, so I'm not overly worried about it. And, if we don't pick-and-choose,
    // we may run into errors that are extremely large, due to the many possible things that could have gone wrong
    // at every step of the nesting process. Though, ideally, we would still leave some sort of note stating that
    // they may be other ways to fix the issue then what's stated in the error message - maybe in a future release.

    test('fail to match all variants, because deep primitive entries are incorrect', () => {
      const v = validator`[[2], unknown] | [[3], unknown] | [unknown, [2]] | [unknown, [3]]`;
      const act = (): any => v.assertMatches([[0], [0]]);
      assert.throws(act, {
        message: [
          'One of the following issues needs to be resolved:',
          '  * Expected <receivedValue>[1][0] to be 2 but got 0.',
          '  * Expected <receivedValue>[1][0] to be 3 but got 0.',
        ].join('\n'),
      });
    });

    test('sub-tuples are missing entries required by all variants', () => {
      const v = validator`[[2], unknown] | [unknown, [2]]`;
      const act = (): any => v.assertMatches([[], []]);
      assert.throws(act, {
        message: 'Expected the <receivedValue>[1] array to have 1 entry, but found 0.',
      });
    });

    test('sub-tuples are missing required and optional properties', () => {
      const v = validator`[[2, 3?], unknown] | [unknown, [2, 3?]]`;
      const act = (): any => v.assertMatches([[], []]);
      assert.throws(act, {
        message: 'Expected the <receivedValue>[1] array to have between 1 and 2 entries, but found 0.',
      });
    });
  });

  test('you can supply bad property values for an object in the rest params (including when you properly match another variant)', () => {
    const v = validator`[...{ type: 'A', value: 1 }[]] | [...{ type: 'B' }[]]`;
    v.assertMatches([{ type: 'B', value: 2 }]);
  });
});

import type { ObjectRule, ObjectRuleContentValue, ObjectRuleIndexValue, Rule } from '../types/validationRules';
import { assert, reprUnknownValue } from '../util';
import { ValidatorAssertionError, createValidatorSyntaxError } from '../exceptions';
import { isIdentifier } from '../tokenStream';
import { getSimpleTypeOf, type SpecificRuleset } from './shared';
import { DEEP_LEVELS } from './deepnessTools';
import { SuccessMatchResponse, FailedMatchResponse, type VariantMatchResponse, mergeMatchResultsToSuccessResult } from './VariantMatchResponse';
import { UnionVariantCollection } from './UnionVariantCollection';
import { matchVariants } from './unionEnforcer';

// The deep levels used in this module
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const availableDeepLevels = () => ({
  irrelevant: DEEP_LEVELS.irrelevant,
  nonSpecificTypeCheck: DEEP_LEVELS.nonSpecificTypeCheck,
  immediateInfoCheck: DEEP_LEVELS.immediateInfoCheck,
  recurseInwardsCheck: DEEP_LEVELS.recurseInwardsCheck,
});

/**
 * Not a real rule,
 * rather, this data was derived from rule data.
 * This type is similar to ObjectRule, but all dynamic keys have been accounted for,
 * and added to this value, as if they were static keys all along.
 */
export interface ObjectRuleWithStaticKeys {
  // In the case of `{ x: 1, [${'x'}]: 2 }`, the key `x` will have multiple values,
  // which is why this maps keys to lists of values.
  readonly content: Map<string | symbol, readonly ObjectRuleContentValue[]>
  readonly index: ObjectRuleIndexValue | null
}

export function matchObjectVariants(
  variantCollection: UnionVariantCollection<ObjectRule>,
  target: unknown,
  lookupPath: string,
): VariantMatchResponse<ObjectRule> {
  assert(!variantCollection.isEmpty());
  let curVariantCollection = variantCollection;

  if (!isObject(target)) {
    return variantCollection.createFailResponse(
      `Expected ${lookupPath} to be an object but got ${reprUnknownValue(target)}.`,
      { deep: availableDeepLevels().nonSpecificTypeCheck },
    );
  }

  const objRulesetToProcessedObjects = new Map<SpecificRuleset<ObjectRule>, ObjectRuleWithStaticKeys>();

  const keyCheckResponse = curVariantCollection.matchEach(variant => {
    const ruleWithStaticKeys = validateAndApplyDynamicKeys(variant);
    objRulesetToProcessedObjects.set(variant, ruleWithStaticKeys);
    assertRequiredKeysArePresent(ruleWithStaticKeys, target, lookupPath);
  }, { deep: availableDeepLevels().immediateInfoCheck });

  curVariantCollection = curVariantCollection.removeFailed(keyCheckResponse);
  if (curVariantCollection.isEmpty()) {
    assert(keyCheckResponse instanceof FailedMatchResponse);
    return keyCheckResponse.asFailedResponseFor(variantCollection);
  }

  // TODO: Merge the responses from failed index checks and other failed property value checks.
  // One shouldn't take precedence over the other.
  const indexSignatureResponse = curVariantCollection.matchEach(({ rootRule, interpolated }) => {
    if (rootRule.index !== null) {
      assertIndexSignatureIsSatisfied(rootRule.index, target, interpolated, lookupPath);
    }
  }, { deep: availableDeepLevels().immediateInfoCheck });

  curVariantCollection = curVariantCollection.removeFailed(indexSignatureResponse);
  if (curVariantCollection.isEmpty()) {
    assert(indexSignatureResponse instanceof FailedMatchResponse);
    return indexSignatureResponse.asFailedResponseFor(variantCollection);
  }

  const keysFromAllRules = new Set<string | symbol>(
    curVariantCollection.variants
      .flatMap(variant => {
        const objectRuleWithStaticKeys = objRulesetToProcessedObjects.get(variant);
        assert(objectRuleWithStaticKeys !== undefined);
        return [...objectRuleWithStaticKeys.content.keys()];
      }),
  );

  // Do assertions on each property
  let filteredView = curVariantCollection.asFilteredView();
  for (const key of keysFromAllRules) {
    // The assertions to check if all required keys are present have already happened.
    // Here, we assume those checks still hold, and if a key is missing, that must be ok.
    if (!(key in target)) {
      continue;
    }

    const derivedCollection = curVariantCollection.map(variant => {
      const objectRuleWithStaticKeys = objRulesetToProcessedObjects.get(variant);
      assert(objectRuleWithStaticKeys !== undefined);
      return derivePropertyRule(objectRuleWithStaticKeys, key, variant.interpolated);
    });
    assert(derivedCollection.variants.length > 0);

    const matchResponse = matchVariants(
      derivedCollection,
      (target as any)[key],
      calcSubLookupPath(lookupPath, key),
      { deep: availableDeepLevels().recurseInwardsCheck },
    );

    if (matchResponse instanceof FailedMatchResponse) {
      return matchResponse.asFailedResponseFor(variantCollection);
    }
    filteredView = filteredView.removeFailed(matchResponse);
  }

  // An example of when this would happen is if we had the pattern `{ x: 1, y: 2 } | { x: 11, y: 22 }`.
  // Above, we would compare the "x" property against `1 | 11` and the "y" property against `2 | 22`.
  // If an object like `{ x: 1, y: 22 }` were provided, then it would pass the above checks.
  // However, we would still fail the overall pattern.
  if (filteredView.isEmpty()) {
    return variantCollection.createFailResponse(
      `${lookupPath}'s properties matches various union variants ` +
      'when it needs to pick a single variant to follow.',
      { deep: availableDeepLevels().recurseInwardsCheck },
    );
  }

  return (
    mergeMatchResultsToSuccessResult([keyCheckResponse, indexSignatureResponse])
  ) as VariantMatchResponse<ObjectRule>;
}

/**
 * Takes a type like `{ x: number, y: string } | { x: boolean }`
 * and a property name like "x", and returns all variants that it must
 * conform to, like `number | boolean`.
 * Or, an example with index signatures, you can go from
 * `{ [n: number]: boolean } | { 0: string }` with the property `0`
 * to `boolean | string`;
 */
function derivePropertyRule(
  ruleWithStaticKeys: ObjectRuleWithStaticKeys,
  key: string | symbol,
  interpolated: readonly unknown[],
): null | SpecificRuleset<Rule> {
  const intersectionRules = [];

  if (ruleWithStaticKeys.content.has(key)) {
    intersectionRules.push(...ruleWithStaticKeys.content.get(key) as ObjectRuleContentValue[]);
  }

  if (
    ruleWithStaticKeys.index !== null &&
    doesIndexSignatureApplyToProperty(ruleWithStaticKeys.index, key, interpolated)
  ) {
    intersectionRules.push({ optional: true, rule: ruleWithStaticKeys.index.value });
  }

  if (intersectionRules.length === 0) {
    return null;
  }

  return {
    rootRule: duplicateKeysToIntersection(intersectionRules),
    interpolated,
  };
}

/** Helps to convert stuff like `{ x: A, ['x']: B }` to `{ x: A & B }` */
function duplicateKeysToIntersection(intersectionRules: readonly ObjectRuleContentValue[]): Rule {
  // The array should have at least one item in it.
  assert(intersectionRules[0] !== undefined);

  return intersectionRules.length === 1
    ? intersectionRules[0].rule
    : {
        category: 'intersection' as const,
        variants: intersectionRules.map(expectation => expectation.rule),
      };
}

/**
 * Ensures the interpolated dynamic keys are of correct types (strings or symbols),
 * then transforms the data into a more accessible form.
 */
function validateAndApplyDynamicKeys({ rootRule, interpolated }: SpecificRuleset<ObjectRule>): ObjectRuleWithStaticKeys {
  const content = new Map<string | symbol, ObjectRuleContentValue[]>(
    [...rootRule.content.entries()]
      .map(([key, value]) => [key, [value]]),
  );

  // Add dynamic key entries to the content map.
  for (const [interpolationIndex, value] of rootRule.dynamicContent) {
    let key = interpolated[interpolationIndex];
    if (typeof key === 'number') {
      key = String(key);
    }

    if (typeof key !== 'string' && typeof key !== 'symbol') {
      throw createValidatorSyntaxError(
        'Attempted to match against a mal-formed validator instance. ' +
        `Its interpolation #${interpolationIndex + 1} must be either of type string, symbol, or number. ` +
        `Got type ${getSimpleTypeOf(key)}.`,
      );
    }

    let existingContentEntry = content.get(key);
    if (existingContentEntry === undefined) {
      existingContentEntry = [];
      content.set(key, existingContentEntry);
    }
    existingContentEntry.push(value);
  }

  return {
    content,
    index: rootRule.index,
  };
}

function assertRequiredKeysArePresent(
  ruleWithStaticKeys: ObjectRuleWithStaticKeys,
  target: object,
  lookupPath: string,
): void {
  const missingKeys = [...ruleWithStaticKeys.content.entries()]
    .filter(([key, value]) => !value.every(({ optional }) => optional))
    .filter(([key, value]) => !(key in target))
    .map(([key]) => key);

  if (missingKeys.length > 0) {
    throw new ValidatorAssertionError(
      `${lookupPath} is missing the required properties: ` +
      missingKeys.map(key => reprUnknownValue(key)).join(', '),
    );
  }
}

function assertIndexSignatureIsSatisfied(
  indexInfo: ObjectRuleIndexValue,
  target: object,
  interpolated: readonly unknown[],
  lookupPath: string,
): void {
  for (const [key, value] of allObjectEntries(target)) {
    if (doesIndexSignatureApplyToProperty(indexInfo, key, interpolated)) {
      matchVariants(
        new UnionVariantCollection([{ rootRule: indexInfo.value, interpolated }]),
        value,
        calcSubLookupPath(lookupPath, key),
        { deep: availableDeepLevels().irrelevant },
      ).throwIfFailed();
    }
  }
}

function doesIndexSignatureApplyToProperty(
  indexInfo: ObjectRuleIndexValue,
  propertyKey: string | symbol,
  interpolated: readonly unknown[],
): boolean {
  const numericPropertyKey = typeof propertyKey === 'string' ? Number(propertyKey) : NaN;
  const keyRuleset = { rootRule: indexInfo.key, interpolated };
  return (
    doesMatch(keyRuleset, propertyKey) ||
    // Handles the case where we're matching the key against the `number` rule.
    // The key has to be turned into a number first, before the `number` rule will take it.
    (!isNaN(numericPropertyKey) && doesMatch(keyRuleset, numericPropertyKey))
  );
}

export function doesMatch(ruleset: SpecificRuleset<Rule>, target: unknown): boolean {
  const variantCollection = new UnionVariantCollection([ruleset]);
  return matchVariants(
    variantCollection,
    target,
    '<receivedValue>',
    { deep: availableDeepLevels().irrelevant },
  ) instanceof SuccessMatchResponse;
}

/** Calculates the next lookup path, given the current lookup path and an object key. */
function calcSubLookupPath(lookupPath: string, key: string | symbol): string {
  if (typeof key === 'string' && isIdentifier(key)) {
    return `${lookupPath}.${key}`;
  } else if (typeof key === 'string') {
    return `${lookupPath}[${JSON.stringify(key)}]`;
  } else {
    return `${lookupPath}[Symbol(${key.description ?? ''})]`;
  }
}

// ------------------------------
//   UTILITY FUNCTIONS
// ------------------------------

/**
 * Returns all object entries, regardless of if they're enumerable or have symbol keys.
 */
function * allObjectEntries(obj: any): Generator<[string | symbol, unknown]> {
  for (const key of Object.getOwnPropertyNames(obj)) {
    yield [key, obj[key]];
  }
  for (const symb of Object.getOwnPropertySymbols(obj)) {
    yield [symb, obj[symb]];
  }
}

const isObject = (value: unknown): value is object => Object(value) === value;

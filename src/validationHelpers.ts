import type { Expectation, ValidatorTemplateTag } from './types/validator.js';
import { isDirectInstanceOf, reprUnknownValue } from './util.js';

export function expectDirectInstanceFactory(validator: ValidatorTemplateTag) {
  return (targetClass: new (...params: any[]) => any) => validator.expectTo((value) => {
    return isDirectInstanceOf(value, targetClass)
      ? undefined
      : `be a direct instance of ${reprUnknownValue(targetClass)}.`;
  });
}

export function expectNonSparseFactory(validator: ValidatorTemplateTag): Expectation {
  return validator.expectTo((array: unknown) => {
    if (!Array.isArray(array)) return 'be an array.';
    for (let i = 0; i < array.length; i++) {
      if (!(i in array)) {
        return `not be a sparse array. Found a hole at index ${i}.`;
      }
    }

    return undefined;
  });
}

export function expectKeysFromFactory(validator: ValidatorTemplateTag) {
  return (keys_: readonly string[]) => {
    const keys = new Set(keys_);
    return validator.expectTo((object) => {
      // Loops through all enumerable and non-enumerable own properties.
      // Does not check symbols - unrecognized symbols can slide.
      for (const key of Object.getOwnPropertyNames(object)) {
        if (!keys.has(key)) {
          return `have only known keys. ${JSON.stringify(key)} is not recognized as a valid key.`;
        }
      }

      return undefined;
    });
  };
}

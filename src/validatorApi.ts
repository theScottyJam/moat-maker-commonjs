import { type Ruleset, _parsingRulesInternals } from './types/parsingRules';
import { validatable } from './validatableProtocol';
import {
  type AssertMatchesOpts,
  createAssertMatchesOptsCheck,
  isValidatorInstance,
  type Validator,
  type ValidatorRef,
  type CustomChecker,
  type ValidatorTemplateTagStaticFields,
  type ValidatorTemplateTag,
} from './types/validator';
import { type ValidatableProtocolFnOpts, _validatableProtocolInternals } from './types/validatableProtocol';
import { uncheckedValidator } from './uncheckedValidatorApi';
import { packagePrivate } from './types/packagePrivateAccess';
import { DISABLE_PARAM_VALIDATION } from './config';

const { createRulesetCheck } = _parsingRulesInternals[packagePrivate];
const rulesetCheck = createRulesetCheck(uncheckedValidator);
const { createValidatableProtocolFnOptsCheck } = _validatableProtocolInternals[packagePrivate];
const validatableProtocolFnOptsCheck = createValidatableProtocolFnOptsCheck(uncheckedValidator);

const isValidatorCheck = uncheckedValidator.checker(
  (value: unknown) => Object(value)[isValidatorInstance] === true,
  { to: 'be a validator instance' },
);

const isArrayLikeCheck = uncheckedValidator.checker(
  (value: unknown) => (
    'length' in Object(value) &&
    typeof (value as any).length === 'number' &&
    (value as any).length >= 0 &&
    Math.floor((value as any).length) === (value as any).length
  ),
  { to: 'be array-like' },
);

export const validator = function validator<T=unknown>(
  parts: TemplateStringsArray,
  ...interpolated: readonly unknown[]
): Validator<T> {
  !DISABLE_PARAM_VALIDATION && uncheckedValidator`[parts: { raw: string[] }, ...interpolated: unknown[]]`
    .assertArgs(validator.name, arguments);

  return wrapValidatorWithUserInputChecks(uncheckedValidator(parts, ...interpolated));
} as ValidatorTemplateTag;

function wrapValidatorWithUserInputChecks<T>(unwrappedValidator: Validator<T>): Validator<T> {
  return Object.freeze({
    [isValidatorInstance]: true as const,
    assertMatches(value: unknown, opts?: AssertMatchesOpts): T {
      // TODO: I'm not validating the return value of opts.errorFactory
      !DISABLE_PARAM_VALIDATION && uncheckedValidator`[value: unknown, opts?: ${createAssertMatchesOptsCheck(uncheckedValidator)}]`
        .assertArgs('<validator instance>.assertMatches', arguments);

      return unwrappedValidator.assertMatches(value, opts);
    },
    assertionTypeGuard(value: unknown, opts?: AssertMatchesOpts): asserts value is T {
      // TODO: I'm not validating the return value of opts.errorFactory
      !DISABLE_PARAM_VALIDATION && uncheckedValidator`[value: unknown, opts?: ${createAssertMatchesOptsCheck(uncheckedValidator)}]`
        .assertArgs('<validator instance>.assertionTypeGuard', arguments);

      unwrappedValidator.assertionTypeGuard(value, opts);
    },
    assertArgs(whichFn: string, args: ArrayLike<unknown>) {
      !DISABLE_PARAM_VALIDATION && uncheckedValidator`[whichFn: string, args: ${isArrayLikeCheck}]`
        .assertArgs('<validator instance>.assertArgs', arguments);

      unwrappedValidator.assertArgs(whichFn, args);
    },
    matches(value: unknown): value is T {
      !DISABLE_PARAM_VALIDATION && uncheckedValidator`[value: unknown]`.assertArgs('<validator instance>.matches', arguments);
      return unwrappedValidator.matches(value);
    },
    ruleset: unwrappedValidator.ruleset,
    [validatable](value: unknown, opts: ValidatableProtocolFnOpts) {
      // TODO: I never validate the return value of opts.failure
      !DISABLE_PARAM_VALIDATION && uncheckedValidator`[value: unknown, opts: ${validatableProtocolFnOptsCheck}]`
        .assertArgs('<validator instance>[validator.validatable]', arguments);

      unwrappedValidator[validatable](value, opts);
    },
  });
}

const staticFields: ValidatorTemplateTagStaticFields = {
  fromRuleset<T=unknown>(ruleset: Ruleset): Validator<T> {
    !DISABLE_PARAM_VALIDATION && uncheckedValidator`[ruleset: ${rulesetCheck}]`
      .assertArgs('validator.fromRuleset', arguments);

    return wrapValidatorWithUserInputChecks(uncheckedValidator.fromRuleset<T>(ruleset));
  },

  from(unknownValue: string | Validator): Validator {
    !DISABLE_PARAM_VALIDATION && uncheckedValidator`[stringOrValidator: string | ${isValidatorCheck}]`
      .assertArgs('validator.from', arguments);

    return typeof unknownValue === 'string'
      ? wrapValidatorWithUserInputChecks(uncheckedValidator.from(unknownValue))
      : unknownValue;
  },

  createRef(): ValidatorRef {
    uncheckedValidator`[]`.assertArgs('validator.createRef', arguments);
    const ref = uncheckedValidator.createRef();
    return {
      [validatable](value: unknown, opts: ValidatableProtocolFnOpts) {
        // TODO: I never validate the return value of opts.failure
        !DISABLE_PARAM_VALIDATION && uncheckedValidator`[value: unknown, opts: ${validatableProtocolFnOptsCheck}]`
          .assertArgs('<validator ref>[validator.validatable]', arguments);

        ref[validatable](value, opts);
      },
      set(validator_: Validator) {
        !DISABLE_PARAM_VALIDATION && uncheckedValidator`[validator: ${isValidatorCheck}]`
          .assertArgs('<validator ref>.set', arguments);

        ref.set(validator_);
      },
    };
  },

  checker(doCheck_: (valueBeingMatched: unknown) => boolean, opts: { to?: string } = {}): CustomChecker {
    !DISABLE_PARAM_VALIDATION && uncheckedValidator`[doCheck: ${Function}, opts?: { to?: string }]`
      .assertArgs('validator.checker', arguments);

    const doCheck = (valueBeingMatched: unknown): boolean => {
      const result = doCheck_(valueBeingMatched);
      !DISABLE_PARAM_VALIDATION && uncheckedValidator`boolean`.assertMatches(result, {
        errorPrefix: 'validator.checker() received a bad "doCheck" function:',
        at: '<doCheck return value>',
      });
      return result;
    };

    const checker = uncheckedValidator.checker(doCheck, opts);
    return {
      [validatable](value: unknown, opts: ValidatableProtocolFnOpts): void {
        !DISABLE_PARAM_VALIDATION && uncheckedValidator`[value: unknown, opts: ${validatableProtocolFnOptsCheck}]`
          .assertArgs('<validator checker>[validator.validatable]', arguments);

        checker.protocolFn(value, opts);
      },

      /**
       * Provides easy access to the validatable protocol value, for use-cases where you want
       * to copy it out and put it on a different object.
       */
      protocolFn(value: unknown, opts: ValidatableProtocolFnOpts): void {
        !DISABLE_PARAM_VALIDATION && uncheckedValidator`[value: unknown, opts: ${validatableProtocolFnOptsCheck}]`
          .assertArgs('<validator checker>.protocolFn', arguments);

        checker.protocolFn(value, opts);
      },
    };
  },

  validatable,
};

Object.assign(validator, staticFields);

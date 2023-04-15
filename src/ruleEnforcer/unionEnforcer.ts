import { ArrayRule, ObjectRule, Rule, TupleRule } from '../types/parsingRules';
import { assertMatches } from './ruleEnforcer';
import { matchObjectVariants } from './objectEnforcer';
import { matchTupleVariants } from './tupleEnforcer';
import { SuccessMatchResponse, stepVariantsBackTo, VariantMatchResponse } from './VariantMatchResponse';
import { UnionVariantCollection } from './UnionVariantCollection';
import { matchArrayVariants } from './arrayEnforcer';

export function matchVariants<RuleType extends Rule>(
  unflattenedVariantCollection: UnionVariantCollection,
  target: unknown,
  interpolated: readonly unknown[],
  lookupPath: string,
): VariantMatchResponse<RuleType> {
  const variantCollection = unflattenedVariantCollection.flattenUnions();
  let remainingVariants = variantCollection.asFilteredView();

  const groupedVariants = variantCollection.groups(
    v => ['object', 'tuple', 'array'].includes(v.category) ? v.category : 'other',
    { keys: ['object', 'tuple', 'array', 'other'] },
  );

  const matchOtherResponse = groupedVariants.other.matchEach(variant => {
    assertMatches(variant, target, interpolated, lookupPath);
  });
  remainingVariants = remainingVariants.removeFailed(matchOtherResponse);
  if (remainingVariants.isEmpty()) {
    return matchOtherResponse as VariantMatchResponse<RuleType>;
  }

  const matchObjectResponse = matchObjectVariants(
    groupedVariants.object as UnionVariantCollection<ObjectRule>,
    target,
    interpolated,
    lookupPath,
  );
  remainingVariants = remainingVariants.removeFailed(matchObjectResponse);
  if (remainingVariants.isEmpty()) {
    return matchObjectResponse as VariantMatchResponse<RuleType>;
  }

  const matchArrayResponse = matchArrayVariants(
    groupedVariants.array as UnionVariantCollection<ArrayRule>,
    target,
    interpolated,
    lookupPath,
  );
  remainingVariants = remainingVariants.removeFailed(matchArrayResponse);
  if (remainingVariants.isEmpty()) {
    return matchArrayResponse as VariantMatchResponse<RuleType>;
  }

  const matchTupleResponse = matchTupleVariants(
    groupedVariants.tuple as UnionVariantCollection<TupleRule>,
    target,
    interpolated,
    lookupPath,
  );
  remainingVariants = remainingVariants.removeFailed(matchTupleResponse);
  if (remainingVariants.isEmpty()) {
    return matchTupleResponse as VariantMatchResponse<RuleType>;
  }

  const failedVariants = [
    ...matchOtherResponse.failedVariants(),
    ...matchObjectResponse.failedVariants(),
    ...matchArrayResponse.failedVariants(),
    ...matchTupleResponse.failedVariants(),
  ];

  const steppedBackFailedVariants = stepVariantsBackTo(
    failedVariants,
    { from: variantCollection, to: unflattenedVariantCollection },
  );

  return (
    new SuccessMatchResponse(steppedBackFailedVariants, unflattenedVariantCollection)
  ) as SuccessMatchResponse<RuleType>;
}
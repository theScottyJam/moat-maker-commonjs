import { strict as assert } from 'node:assert';
import { createValidatorSyntaxError } from './exceptions';
import { TextPosition, Token, TokenStream } from './types/tokenizer';

// The regex is stateful with the sticky flag, so we create a new one each time
// we need one.
const getIdentifierPattern = (): RegExp => /[a-zA-Z$_][a-zA-Z0-9$_]*/y;

/// Returns the extracted result, the first position in the extracted range range
/// (i.e. the passed in pos object), and the last position in the extracted range.
function extract(regex: RegExp, sections: readonly string[], pos_: TextPosition): [string | null, TextPosition, TextPosition] {
  const pos = { ...pos_ };
  assert(regex.sticky, 'Internal error: The sticky flag must be set');
  assert(regex.lastIndex === 0);

  regex.lastIndex = pos.textIndex;
  const match = regex.exec(sections[pos.sectionIndex]);
  regex.lastIndex = 0;

  if (match === null || match[0] === '') {
    return [null, pos_, pos_];
  }

  const theExtract = match[0];
  pos.textIndex += theExtract.length;
  for (const c of theExtract) {
    if (c === '\n') {
      pos.lineNumb++;
      pos.colNumb = 1;
    } else {
      pos.colNumb++;
    }
  }

  return [theExtract, pos_, Object.freeze(pos)];
}

type ExtractStringReturn = [{ parsed: string } | null, TextPosition, TextPosition];

function extractString(sections: readonly string[], startPos: TextPosition): ExtractStringReturn {
  const currentPos = { ...startPos };

  const targetSection = sections[currentPos.sectionIndex];
  const openingQuote = targetSection[currentPos.textIndex];
  if (!['"', "'"].includes(openingQuote)) {
    return [null, startPos, startPos];
  }

  let result = '';
  let escaping = false;
  while (true) {
    currentPos.textIndex++;
    currentPos.colNumb++;
    const char = targetSection[currentPos.textIndex];
    if (char === undefined) {
      const errorRange = { start: startPos, end: currentPos };
      throw createValidatorSyntaxError('Expected to find a quote to end the string literal.', sections, errorRange);
    }

    if (!escaping && char === openingQuote) {
      break;
    } else if (!escaping && char === '\\') {
      escaping = true;
    } else if (escaping) {
      const mapSpecialChars: { [index: string]: string | undefined } = {
        0: '\0',
        '\\': '\\',
        n: '\n',
        r: '\r',
        v: '\v',
        t: '\t',
        b: '\b',
        f: '\f',
      };
      result += mapSpecialChars[char] ?? char;
      escaping = false;
    } else {
      result += char;
    }
  }

  currentPos.textIndex++;
  currentPos.colNumb++;
  return [{ parsed: result }, startPos, Object.freeze(currentPos)];
}

function extractNumber(sections: readonly string[], startPos: TextPosition): [string | null, TextPosition, TextPosition] {
  let segment: string | null;
  let currentPos = startPos;

  // hexadecimal literal
  [segment, , currentPos] = extract(/0[xX]([0-9a-fA-F]+_)*[0-9a-fA-F]+/y, sections, currentPos);
  if (segment !== null) return [segment, startPos, currentPos];

  // octal literal
  [segment, , currentPos] = extract(/0[oO]([0-7]+_)*[0-7]+/y, sections, currentPos);
  if (segment !== null) return [segment, startPos, currentPos];

  // binary literal
  [segment, , currentPos] = extract(/0[bB]([01]+_)*[01]+/y, sections, currentPos);
  if (segment !== null) return [segment, startPos, currentPos];

  // base-10 literal with decimal and scientific notation support
  [segment, , currentPos] = extract(/(((\d+_)*\d+)?\.)?(\d+_)*\d+([eE](\d+_)*\d+)?/y, sections, currentPos);
  if (segment !== null) return [segment, startPos, currentPos];

  return [null, startPos, startPos];
}

export function createTokenStream(sections: readonly string[]): TokenStream {
  let currentPos = {
    sectionIndex: 0,
    textIndex: 0,
    lineNumb: 1,
    colNumb: 1,
  };

  const getNextToken = (): Token => {
    let afterNewline;
    ({ newPos: currentPos, foundNewLine: afterNewline } = ignoreWhitespaceAndComments(sections, currentPos));

    if (currentPos.textIndex === sections[currentPos.sectionIndex].length) {
      // If reached end of entire string
      if (currentPos.sectionIndex === sections.length - 1) {
        return {
          category: 'eof',
          value: '',
          afterNewline,
          range: { start: currentPos, end: currentPos },
        };
      } else {
        const lastPos = currentPos;
        currentPos = {
          ...lastPos,
          sectionIndex: lastPos.sectionIndex + 1,
          textIndex: 0,
        };
        const token = {
          category: 'interpolation' as const,
          value: undefined,
          afterNewline,
          interpolationIndex: currentPos.sectionIndex,
          range: { start: lastPos, end: currentPos },
        };
        return token;
      }
    }

    let lastPos: TextPosition;
    let segment: string | null;

    [segment, lastPos, currentPos] = extract(getIdentifierPattern(), sections, currentPos);
    if (segment !== null) {
      return {
        category: 'identifier',
        value: segment,
        afterNewline,
        range: { start: lastPos, end: currentPos },
      };
    }

    [segment, lastPos, currentPos] = extract(/\d+n/y, sections, currentPos);
    if (segment !== null) {
      return {
        category: 'bigint',
        value: segment,
        afterNewline,
        range: { start: lastPos, end: currentPos },
      };
    }

    [segment, lastPos, currentPos] = extractNumber(sections, currentPos);
    if (segment !== null) {
      return {
        category: 'number',
        value: segment,
        afterNewline,
        range: { start: lastPos, end: currentPos },
      };
    }

    let strSegmentInfo: { parsed: string } | null;
    [strSegmentInfo, lastPos, currentPos] = extractString(sections, currentPos);
    if (strSegmentInfo !== null) {
      return {
        category: 'string',
        value: undefined,
        parsedValue: strSegmentInfo.parsed,
        afterNewline,
        range: { start: lastPos, end: currentPos },
      };
    }

    [segment, lastPos, currentPos] = extract(/[[\]{}()@<>:;,\-+|&?]|(\.\.\.)/y, sections, currentPos);
    if (segment !== null) {
      return {
        category: 'specialChar',
        value: segment,
        afterNewline,
        range: { start: lastPos, end: currentPos },
      };
    }

    [segment, lastPos, currentPos] = extract(/\S+/y, sections, currentPos);
    assert(segment);
    const errorRange = { start: lastPos, end: currentPos };
    throw createValidatorSyntaxError('Failed to interpret this syntax.', sections, errorRange);
  };

  let nextToken = getNextToken();
  // lastTokenEndPos would be the same as peek().range.start if it weren't for the possibility
  // of whitespace between them.
  let lastTokenEndPos: TextPosition = { sectionIndex: 0, textIndex: 0, lineNumb: 1, colNumb: 1 };
  return Object.freeze({
    originalText: sections,
    next(): Token {
      const requestedToken = nextToken;
      lastTokenEndPos = requestedToken.range.end;
      nextToken = getNextToken();
      return requestedToken;
    },
    peek(): Token {
      return nextToken;
    },
    lastTokenEndPos(): TextPosition {
      return lastTokenEndPos;
    },
  });
}

function ignoreWhitespaceAndComments(
  sections: readonly string[],
  startingPos: TextPosition,
): { foundNewLine: boolean, newPos: TextPosition } {
  let currentPos = startingPos;

  while (true) {
    const startingIndex = currentPos.textIndex;
    let segment, lastPos;

    // whitespace
    [,, currentPos] = extract(/\s+/y, sections, currentPos);

    // block comments
    [segment, lastPos, currentPos] = extract(/\/\*/y, sections, currentPos);
    if (segment !== null) {
      const { newPos, matchFound } = eatUntil(sections, currentPos, /(.|\n)*?\*\//y);
      if (!matchFound) {
        const errorRange = { start: lastPos, end: currentPos };
        throw createValidatorSyntaxError('This block comment never got closed.', sections, errorRange);
      }
      currentPos = newPos;
    }

    // single-line comments
    [segment,, currentPos] = extract(/\/\//y, sections, currentPos);
    if (segment !== null) {
      // ignoring `matchFound`. If no match is found, then there was simply a single-line
      // comment at the end of the whole string, so it didn't have a newline afterwards.
      const { newPos, matchFound } = eatUntil(sections, currentPos, /(.|\n)*?\n/y);
      currentPos = newPos;
    }

    if (startingIndex === currentPos.textIndex) break;
  }

  return {
    foundNewLine: currentPos.lineNumb > startingPos.lineNumb,
    newPos: currentPos,
  };
}

/// Keeps moving currentPos (including across interpolation points) until
/// the provided pattern is matched. currentPos will be set to the position
/// right after the matched text.
function eatUntil(
  sections: readonly string[],
  startingPos: TextPosition,
  pattern: RegExp,
): { newPos: TextPosition, matchFound: boolean } {
  let currentPos = startingPos;
  while (true) {
    let segment;
    [segment,, currentPos] = extract(pattern, sections, currentPos);
    if (segment !== null) {
      return { newPos: currentPos, matchFound: true };
    }

    // If reached end of entire string
    if (currentPos.sectionIndex === sections.length - 1) {
      [,, currentPos] = extract(/.*/y, sections, currentPos); // move currentPos to the end
      return { newPos: currentPos, matchFound: false };
    } else {
      const lastPos = currentPos;
      currentPos = {
        ...lastPos,
        sectionIndex: lastPos.sectionIndex + 1,
        textIndex: 0,
      };
    }
  }
}

export function isIdentifier(text: string): boolean {
  const match = getIdentifierPattern().exec(text);
  return match !== null && match[0].length === text.length;
}

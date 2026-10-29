// Answer-key matching for predict and trace tasks. The model never grades these.
//
// Learners mostly dictate, so an answer can spell numbers out ("thirteen"), restate the question ("of the 13
// requests, 10 get through") or show its working ("1 + 1 + 1 = 3"). The rules accept those and still reject a
// list of guesses. `context` is the task's prompt and snippet: numbers taken from it are treated as restating
// the question, unless they are part of the key.

const ONES = {
  zero: 0, none: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, once: 1, twice: 2,
};
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
// First and second are left out on their own: "first, it reads" and "at second 61" are not counts.
const ORDINALS = {
  third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12,
  thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19,
  twentieth: 20, thirtieth: 30, fortieth: 40, fiftieth: 50, sixtieth: 60, seventieth: 70, eightieth: 80, ninetieth: 90,
  hundredth: 100,
};
const COMPOUND_ORDINALS = { ...ORDINALS, first: 1, second: 2 }; // only after a tens word, as in twenty-first
const SCALES = { hundred: 100, thousand: 1000, million: 1000000 };
// "one" is a pronoun after these words ("each one", "which one"), or after "the" and an ordinal ("the third one").
// "first one, then three" stays a count.
const DETERMINERS = new Set(['the', 'this', 'that', 'each', 'every', 'any', 'which', 'another', 'other', 'no', 'same']);
const POSITIONS = new Set(['first', 'second', 'last', 'next', ...Object.keys(ORDINALS)]);
const isNumberWord = (w) => w in ONES || w in TENS || w in SCALES || w in ORDINALS;

// Every number in the text, in order, with where it starts and ends in the text. Thousands separators (8,192) and
// decimals (2.5) are read as one number, a minus directly before digits makes it negative, and number words are
// converted.
export function numbersIn(text) {
  const t = String(text ?? '').toLowerCase();
  const tokens = [...t.matchAll(/\d{1,3}(?:,\d{3})+(?!\d)(?:\.\d+)?|\d+(?:\.\d+)?|[a-z]+/g)];
  const found = [];
  let phrase = null; // { total, current, start, end }
  const close = () => {
    if (phrase) found.push({ value: phrase.total + phrase.current, start: phrase.start, end: phrase.end });
    phrase = null;
  };

  for (let i = 0; i < tokens.length; i++) {
    const [tok] = tokens[i];
    const start = tokens[i].index;
    const end = start + tok.length;
    if (phrase && /[^\s-]/.test(t.slice(phrase.end, start))) close(); // "twenty, five" is two numbers
    if (/^\d/.test(tok)) {
      close();
      const negative = t[start - 1] === '-' && (start === 1 || /[\s(]/.test(t[start - 2]));
      found.push({ value: Number(tok.replaceAll(',', '')) * (negative ? -1 : 1), start: negative ? start - 1 : start, end });
      continue;
    }
    const prev = tokens[i - 1]?.[0];
    const joinedByHyphen = t[start - 1] === '-' && prev && prev in TENS && tokens[i - 1].index + prev.length === start - 1;
    if (phrase && joinedByHyphen && tok in COMPOUND_ORDINALS) {
      phrase.current += COMPOUND_ORDINALS[tok];
      phrase.end = end;
      close();
    } else if (tok in ORDINALS) {
      close();
      found.push({ value: ORDINALS[tok], start, end });
    } else if (tok in SCALES) {
      if (!phrase) {
        if (prev !== 'a') continue; // "hundred" on its own is not a count, "a hundred" is
        phrase = { total: 0, current: 1, start: tokens[i - 1].index, end };
      }
      if (SCALES[tok] === 100) phrase.current = (phrase.current || 1) * 100;
      else { phrase.total += (phrase.current || 1) * SCALES[tok]; phrase.current = 0; }
      phrase.end = end;
    } else if (tok in TENS || tok in ONES) {
      const before = tokens[i - 2]?.[0];
      if (tok === 'one' && !phrase && (DETERMINERS.has(prev) || (POSITIONS.has(prev) && DETERMINERS.has(before)))) continue;
      const v = TENS[tok] ?? ONES[tok];
      // A new number starts when this word cannot extend the phrase, as in "two three" or "five twenty".
      const extends_ = phrase && (phrase.current % 100 === 0 || (phrase.current % 100 >= 20 && phrase.current % 10 === 0 && v < 10));
      if (phrase && !extends_) close();
      phrase ??= { total: 0, current: 0, start, end };
      phrase.current += v;
      phrase.end = end;
    } else if (tok === 'and' && phrase && phrase.current % 100 === 0 && isNumberWord(tokens[i + 1]?.[0] ?? '')) {
      phrase.end = end; // "two hundred and fifty six", but "two and three" stays two numbers
    } else {
      close();
    }
  }
  close();
  return found;
}

// Spoken punctuation, quotes and spacing do not matter in a text answer.
const normaliseText = (s) =>
  String(s ?? '').toLowerCase()
    .replace(/\bcomma\b/g, ',').replace(/\bslash\b/g, '/').replace(/\bdot\b/g, '.')
    .replace(/[\s"'`‘’“”]+/g, '');

// A conclusion word right before the last number: "so 3", "= 14", "the answer is 9".
const CONCLUSION = /(=|\bso\b|\btotal\b|\bequals?\b|\banswer\b|\bresult\b|\bthat'?s\b|\bwhich is\b|\btherefore\b|\bthus\b|\bin all\b|\bgives?\b|\bmakes?\b|\bleaves?\b|\bcomes? to\b)[^\d]{0,20}$/;

// Distinct extra numbers a numbers_all answer may carry, such as intermediate steps of the working.
export const MAX_EXTRA_NUMBERS = 2;

export function keyMatches(key, text, context = '') {
  const answer = String(text ?? '');
  const expected = [].concat(key.expected);

  if (key.match === 'text_ci') {
    const want = normaliseText(key.expected);
    // An answer that offers alternatives with "or" passes only if every alternative has the expected text.
    const parts = answer.split(/\bor\b/i).filter((p) => p.trim());
    return parts.length > 0 && parts.every((p) => normaliseText(p).includes(want));
  }

  const all = numbersIn(answer);
  // A hedge between two different numbers, such as "3 or 4" or "3, or maybe 4", is never a right answer.
  const hedged = all.some((n, i) => {
    const next = all[i + 1];
    return next && next.value !== n.value && /^[\s,]*or\b(\s+(maybe|perhaps|possibly))?[\s,]*$/i.test(answer.slice(n.end, next.start));
  });
  if (hedged) return false;
  const fromPrompt = new Set(numbersIn(context).map((n) => n.value));
  const own = all.filter((n) => expected.includes(n.value) || !fromPrompt.has(n.value));

  if (key.match === 'number_exact') {
    const distinct = new Set(own.map((n) => n.value));
    if (distinct.size === 1 && distinct.has(key.expected)) return true;
    // Working shown, then a conclusion: "1 + 1 + 1 = 3", "two letters and a newline, so three".
    const last = all.at(-1);
    return last?.value === key.expected && CONCLUSION.test(answer.slice(0, last.start));
  }

  if (key.match === 'numbers_all') {
    // The expected numbers must appear in order, and only a few other numbers may appear besides them.
    let i = 0;
    for (const n of own) if (i < expected.length && n.value === expected[i]) i++;
    const extras = new Set(own.map((n) => n.value).filter((v) => !expected.includes(v)));
    return i === expected.length && extras.size <= MAX_EXTRA_NUMBERS;
  }
  return false;
}

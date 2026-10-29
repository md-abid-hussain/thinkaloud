import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyMatches, numbersIn, MAX_EXTRA_NUMBERS } from '../support/matching.mjs';

const values = (text) => numbersIn(text).map((n) => n.value);
const exact = (expected) => ({ match: 'number_exact', expected });
const all = (...expected) => ({ match: 'numbers_all', expected });
const text = (expected) => ({ match: 'text_ci', expected });

// The rate limiter's step 1.2, a typical prompt with many numbers in it.
const BUCKET = 'The bucket holds at most 10 tokens and starts full at time 0. One token is added at each whole second, at 1 second, 2 seconds and so on. The client sends 13 requests at time 0, then 3 requests at 2.5 seconds. How many of the 13 are accepted, and how many of the 3?';

test('numbers are read from digits, separators, decimals, signs and words', () => {
  assert.deepEqual(values('8,192 bytes, 8,192 and 3,616'), [8192, 8192, 3616]);
  assert.deepEqual(values('fields 3,1 and 1,2'), [3, 1, 1, 2], 'a comma without three digits after it is a list');
  assert.deepEqual(values('2.5 seconds, then HTTP/1.1'), [2.5, 1.1]);
  assert.deepEqual(values('the read returns -1 at the end, and 3-4 is a range'), [-1, 3, 4]);
  assert.deepEqual(values('thirteen requests, ten get through'), [13, 10]);
  assert.deepEqual(values('two hundred and fifty six, one thousand and four, a hundred'), [256, 1004, 100]);
  assert.deepEqual(values('twenty-five, ninety nine, twenty-first'), [25, 99, 21]);
  assert.deepEqual(values('two and three, five twenty, twenty, five'), [2, 3, 5, 20, 20, 5]);
  assert.deepEqual(values('it is the third one, and each one of them'), [3], 'one after a determiner is a pronoun');
  assert.deepEqual(values('first one, then three'), [1, 3]);
  assert.deepEqual(values('only one, it appears twice, none are left'), [1, 2, 0]);
  assert.deepEqual(values('first it reads, then at second 61'), [61], 'first and second alone are not counts');
});

test('number_exact accepts dictated answers, restated questions and shown working', () => {
  assert.ok(keyMatches(exact(10), 'Ten of them get through.', BUCKET));
  assert.ok(keyMatches(exact(10), 'Of the 13 requests, 10 get through, because the bucket starts with 10 tokens.', BUCKET));
  assert.ok(keyMatches(exact(3), '1 + 1 + 1 = 3', 'A file holds two letters followed by a newline. How many bytes?'));
  assert.ok(keyMatches(exact(9), 'Three plus three quarters of eight, which is six, so the answer is nine.', 'previous 8, current 3, at 75 of 60'));
  assert.ok(keyMatches(exact(3), 'cherry is the third one', 'pear, apple, cherry, banana'));
  assert.ok(keyMatches(exact(1004), 'It expires at one thousand and four seconds.', 'clock reads 1000 s, PX 4000'));
});

test('number_exact rejects guesses and wrong answers', () => {
  assert.ok(!keyMatches(exact(10), '10 or 11', BUCKET));
  assert.ok(!keyMatches(exact(10), '0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12', BUCKET));
  assert.ok(!keyMatches(exact(10), '13', BUCKET), 'a number copied from the question is not an answer');
  assert.ok(!keyMatches(exact(10), 'I think 9, the bucket has 10', ''), 'two numbers of its own and no conclusion');
  assert.ok(!keyMatches(exact(3), 'so 4 or 3', ''), 'a conclusion must be the last number on its own');
  assert.ok(!keyMatches(exact(2), 'between 1 and 2', ''));
  assert.ok(!keyMatches(exact(8192), '8,192 or 9,000', ''), 'separators do not hide a hedge');
  assert.ok(keyMatches(exact(3616), '20,000 minus 8,192 twice leaves 3,616', ''), 'a conclusion word after separators');
  assert.ok(!keyMatches(exact(2), '2, or maybe three', 'two spaces, hello, three spaces, world'),
    'a hedge fails even when the other number is in the question');
  assert.ok(keyMatches(exact(2), 'two, because three spaces only separate words', 'two spaces, hello, three spaces, world'));
});

test('numbers_all checks order and limits extra numbers', () => {
  const key = all(10, 2);
  assert.ok(keyMatches(key, 'Of the 13, 10 are accepted, and of the 3 later ones only 2.', BUCKET));
  assert.ok(keyMatches(key, 'ten, then two', BUCKET));
  assert.ok(!keyMatches(key, '2 then 10', BUCKET), 'swapped order');
  assert.ok(!keyMatches(key, Array.from({ length: 31 }, (_, i) => i).join(' '), BUCKET), 'a spray of numbers');
  assert.ok(keyMatches(all(6, 5), '1 + 1 + 1 + 2 + 1 = 6 bytes and 5 characters', 'café saved as UTF-8'), 'working shown');
  assert.ok(!keyMatches(all(6, 5), '1 2 3 4 6 5', ''), `more than ${MAX_EXTRA_NUMBERS} extra numbers`);
  assert.ok(keyMatches(all(3, 8192, 8192, 3616), '3 reads: 8,192, 8,192 and 3,616 bytes', 'A 20,000-byte file and an 8,192-byte buffer'));
  assert.ok(!keyMatches(all(3, 8192, 8192, 3616), '3 reads of 8,192 bytes', 'A 20,000-byte file and an 8,192-byte buffer'));
});

test('text_ci ignores case, spacing, quotes and spoken punctuation, and rejects alternatives', () => {
  assert.ok(keyMatches(text('red,blue'), 'It prints red, blue.'));
  assert.ok(keyMatches(text('red,blue'), 'red comma blue'));
  assert.ok(keyMatches(text('GET / HTTP/1.1'), 'The line is "get /HTTP/1.1".'));
  assert.ok(keyMatches(text('GET / HTTP/1.1'), 'GET  /  HTTP / 1.1'));
  assert.ok(keyMatches(text('docs/intro.html'), 'docs slash intro dot html'));
  assert.ok(keyMatches(text('bacb'), 'b a c b'));
  assert.ok(!keyMatches(text('Q7kx2T'), 'Y3S9wb or Q7kx2T'), 'a hedge between two answers');
  assert.ok(!keyMatches(text('banana'), 'apple or banana or cherry'));
  assert.ok(!keyMatches(text('red,blue'), 'blue, red'));
});

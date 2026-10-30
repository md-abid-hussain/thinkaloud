"""An arithmetic calculator: python3 main.py '<expression>'

Prints the value of an expression made of numbers, + - * /, unary minus, parentheses and the functions
sin, cos and tan (radians). For example, '1 + 22 - 12 * 33 / 2' prints -175 and '(1 + 1) * 5' prints 10.

It works in three stages, each with its own job:

1. The scanner turns the text into tokens: numbers (digits with at most one decimal point), operators,
   parentheses and function names. Whitespace only separates tokens. A minus sign is negation at the start, after
   an operator or after "(", and subtraction everywhere else, so the two get different kinds of token.
2. The shunting-yard algorithm rewrites the tokens in postfix order. Waiting operators sit on a stack; a new binary
   operator first sends out every waiting operator that binds at least as tightly, so equal operators group from
   the left. The same pass checks the order of tokens: an operand must come where one is expected and an operator
   where one is expected, and every parenthesis must have a partner.
3. The evaluator walks the postfix tokens with a value stack. A number is pushed; an operator pops its operands
   (the first value popped is the right operand), applies itself and pushes the result. Exactly one value is left.

Arithmetic is in binary floating point. A result is printed with at most 15 significant digits, in plain decimal
notation, without trailing zeros, so 3 / 2 prints 1.5, 2 * 3 prints 6 and 0.1 + 0.2 prints 0.3.

A malformed expression, a division by zero or a result too large to hold prints a message to standard error,
pointing at the place in the expression, and exits with status 1. Running with no expression exits with status 2.
"""

import math
import sys
from decimal import Decimal


class CalcError(Exception):
    """A malformed expression, or a well-formed one with no value. pos is the 0-based index it points to."""

    def __init__(self, message, pos):
        super().__init__(message)
        self.pos = pos


class Token:
    """kind is one of num, op (a binary operator), neg (unary minus), func, ( and )."""

    def __init__(self, kind, text, pos, value=None):
        self.kind, self.text, self.pos, self.value = kind, text, pos, value


# Binary operators: precedence, and all of them group from the left. Negation binds tighter than all of them.
PRECEDENCE = {"+": 1, "-": 1, "*": 2, "/": 2}
NEG_PRECEDENCE = 3

FUNCTIONS = {"sin": math.sin, "cos": math.cos, "tan": math.tan}


def scan(text):
    """The expression's tokens, in order."""
    tokens = []
    i = 0
    while i < len(text):
        ch = text[i]
        if ch.isspace():
            i += 1
        elif ch.isdigit() or ch == ".":
            start = i
            while i < len(text) and text[i].isdigit():
                i += 1
            if i < len(text) and text[i] == ".":
                i += 1
                while i < len(text) and text[i].isdigit():
                    i += 1
            word = text[start:i]
            if word == ".":
                raise CalcError("a decimal point needs digits", start)
            value = float(word)
            if not math.isfinite(value):
                raise CalcError(f"the number {word} is too large", start)
            tokens.append(Token("num", word, start, value))
        elif ch.isalpha():
            start = i
            while i < len(text) and text[i].isalpha():
                i += 1
            name = text[start:i]
            if name not in FUNCTIONS:
                raise CalcError(f"unknown name '{name}' (functions: {', '.join(FUNCTIONS)})", start)
            tokens.append(Token("func", name, start))
        elif ch in PRECEDENCE:
            # A minus with no value before it (start, after an operator or after an opening parenthesis) negates.
            prev = tokens[-1] if tokens else None
            if ch == "-" and (prev is None or prev.kind in ("op", "neg", "func", "(")):
                tokens.append(Token("neg", ch, i))
            else:
                tokens.append(Token("op", ch, i))
            i += 1
        elif ch in "()":
            tokens.append(Token(ch, ch, i))
            i += 1
        else:
            raise CalcError(f"unexpected character '{ch}'", i)
    return tokens


def describe(tok):
    return "the end of the expression" if tok is None else f"'{tok.text}'"


def to_postfix(tokens, length):
    """Shunting-yard: the tokens in postfix order. Raises CalcError for tokens in an impossible order."""
    out, ops = [], []
    expect_operand = True  # True where a number, "(", a function or a unary minus may come next
    prev = None
    for tok in tokens:
        if prev is not None and prev.kind == "func" and tok.kind != "(":
            raise CalcError(f"expected '(' after {prev.text} but found {describe(tok)}", tok.pos)
        if expect_operand:
            if tok.kind == "num":
                out.append(tok)
                expect_operand = False
            elif tok.kind in ("neg", "func", "("):
                ops.append(tok)  # prefix operators wait; they bind to what follows
            else:
                raise CalcError(f"expected a number or '(' but found {describe(tok)}", tok.pos)
        else:
            if tok.kind == "op":
                prec = PRECEDENCE[tok.text]
                while ops and ops[-1].kind in ("op", "neg") and precedence(ops[-1]) >= prec:
                    out.append(ops.pop())
                ops.append(tok)
                expect_operand = True
            elif tok.kind == ")":
                while ops and ops[-1].kind != "(":
                    out.append(ops.pop())
                if not ops:
                    raise CalcError("')' has no matching '('", tok.pos)
                ops.pop()
                if ops and ops[-1].kind == "func":
                    out.append(ops.pop())
            else:
                raise CalcError(f"expected an operator or ')' but found {describe(tok)}", tok.pos)
        prev = tok
    if expect_operand:
        if not tokens:
            raise CalcError("the expression is empty", 0)
        if prev.kind == "func":
            raise CalcError(f"expected '(' after {prev.text} but found the end of the expression", length)
        raise CalcError("expected a number or '(' but found the end of the expression", length)
    while ops:
        tok = ops.pop()
        if tok.kind == "(":
            raise CalcError("'(' is never closed", tok.pos)
        out.append(tok)
    return out


def precedence(tok):
    return NEG_PRECEDENCE if tok.kind == "neg" else PRECEDENCE[tok.text]


def evaluate(postfix):
    """The value of a postfix token list, computed with a stack."""
    stack = []
    for tok in postfix:
        if tok.kind == "num":
            stack.append(tok.value)
            continue
        needed = 2 if tok.kind == "op" else 1
        if len(stack) < needed:
            raise CalcError(f"{describe(tok)} is missing an operand", tok.pos)
        if tok.kind == "neg":
            result = -stack.pop()
        elif tok.kind == "func":
            result = FUNCTIONS[tok.text](stack.pop())
        else:
            right = stack.pop()  # pushed last, so popped first
            left = stack.pop()
            if tok.text == "+":
                result = left + right
            elif tok.text == "-":
                result = left - right
            elif tok.text == "*":
                result = left * right
            else:
                if right == 0:
                    raise CalcError("division by zero", tok.pos)
                result = left / right
        if not math.isfinite(result):
            raise CalcError("the result is too large", tok.pos)
        stack.append(result)
    if len(stack) != 1:
        raise CalcError("the expression does not reduce to one value", 0)
    return stack[0]


def show(value):
    """At most 15 significant digits, in plain decimal notation, without trailing zeros."""
    if value == 0:
        return "0"  # also turns -0.0 into 0
    text = format(Decimal(format(value, ".15g")), "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text


def calculate(text):
    return evaluate(to_postfix(scan(text), len(text)))


def main(argv):
    if len(argv) < 2:
        print("usage: python3 main.py '<expression>'", file=sys.stderr)
        return 2
    text = " ".join(argv[1:])
    try:
        value = calculate(text)
    except CalcError as e:
        print(f"error: {e}", file=sys.stderr)
        print(f"  {text}", file=sys.stderr)
        print(f"  {' ' * e.pos}^", file=sys.stderr)
        return 1
    print(show(value))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

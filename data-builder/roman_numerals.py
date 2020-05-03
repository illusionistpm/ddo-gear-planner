import sys

letterValues = {
    'M': 1000,
    'D': 500,
    'C': 100,
    'L': 50,
    'X': 10,
    'V': 5,
    'I': 1
}

def value_of_roman_letter(ch):
    """Return the value associated with a single Roman numeral letter."""
    try:
        return letterValues[ch.upper()]
    except KeyError:
        print(f"error: invalid Roman numeral character '{ch}'\n",
              file=sys.stderr)
        sys.exit(1)

def int_from_roman_numeral(s):
    """Return the integer value of the given Roman numeral string."""
    result = 0
    lastValue = sys.maxsize
    for ch in s:
        value = value_of_roman_letter(ch)
        if value > lastValue:
            # We've found something like "IV" or "IX"
            # or "XC".  Need to undo the addition
            # of the previous value, then add
            # (value - lastValue) to the result.
            result += value - 2 * lastValue
        else:
            result += value
        lastValue = value
    return result

def input_loop():
    """Repeatedly prompt user for a Roman numeral and print the integer value."""
    while True:
        try:
            userInput = input("Enter a Roman numeral > ").strip()
            if len(userInput) == 0:
                sys.exit(0)
            intValue = int_from_roman_numeral(userInput)
            print(f"{userInput} = {intValue}")
        except EOFError:
            print()
            sys.exit(0)

def main():
    """If command-line arguments given, convert them, otherwise enter input loop."""
    if len(sys.argv) > 1:
        for arg in sys.argv[1:]:
            intValue = int_from_roman_numeral(arg)
            print(f"{arg} = {intValue}")
    else:
        input_loop()

if __name__ == "__main__":
    main()
import math

def calculate_area(radius: float) -> float:
    """
    Calculate the area of a circle given its radius.
    Returns the area as a float.
    """
    if radius < 0:
        raise ValueError("Radius cannot be negative")
    return math.pi * radius ** 2


def greet(name: str = "Guest") -> str:
    """
    Return a greeting message for the given name.
    Defaults to 'Guest' if no name is provided.
    """
    if not isinstance(name, str) or not name.strip():
        raise ValueError("Name must be a non-empty string")
    return f"Hello, {name}!"


def main():
    # Test Autocomplete role (Qwen2.5-Coder)
    print("Circle area with radius 5:", calculate_area(5))

    # Test Edit role (CodeLlama)
    print(greet("Uma"))
    print(greet())  # default Guest


if __name__ == "__main__":
    main()

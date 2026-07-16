function calculateArea(radius) {
  // Calculate the area of a circle given its radius
  if (radius < 0) {
    throw new Error("Radius cannot be negative");
  }
  return Math.PI * Math.pow(radius, 2);
}

function greet(name = "Guest") {
  // Return a greeting message for the given name
  if (typeof name !== "string" || name.trim() === "") {
    throw new Error("Name must be a non-empty string");
  }
  return `Hello, ${name}!`;
}

// Main test routine
function main() {
  // Test Autocomplete role (Qwen2.5-Coder)
  console.log("Circle area with radius 5:", calculateArea(5));

  // Test Edit role (CodeLlama)
  console.log(greet("Uma"));
  console.log(greet()); // default Guest
}

main();

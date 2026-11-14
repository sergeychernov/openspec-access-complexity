// Prints a greeting for the given name.
export function greet(name) {
  return `Hello, ${name}!`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(greet(process.argv[2] || 'world'));
}

const { greet } = require("./src/greet");
const name = process.argv[2] || "world";
console.log(greet(name));

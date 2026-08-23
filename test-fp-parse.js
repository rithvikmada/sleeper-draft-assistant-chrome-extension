const fs = require("fs");
const vm = require("vm");
const DIR = "/Users/rithvikmada/Repos/sleeper-draft-ext 4/";
const chrome = { storage: { local: { get: async (keys) => ({}), set: async (o) => {} }, onChanged:{addListener:()=>{}} } };
const ctx = vm.createContext({ chrome, console });
vm.runInContext(fs.readFileSync(DIR+"rankings.js","utf8"), ctx);
vm.runInContext(fs.readFileSync(DIR+"shared.js","utf8"), ctx);
const run = c => vm.runInContext(c, ctx);

const fp_csv = fs.readFileSync("/Users/rithvikmada/Downloads/FantasyPros_2026_Draft_ALL_Rankings (1).csv", "utf8");
console.log("CSV lines:", fp_csv.split("\n").length);
console.log("First 3 lines:");
fp_csv.split("\n").slice(0, 3).forEach((l, i) => console.log(`  ${i}: ${l.slice(0, 100)}`));
console.log("\nParsing...");
try {
  const result = run(`parseRankings(${JSON.stringify(fp_csv)})`);
  console.log(`Parsed ${result.length} players`);
  console.log("First 3:", result.slice(0, 3).map(p => `${p.name} ${p.pos} rank=${p.rank}`));
} catch (e) {
  console.log("ERROR:", e.message);
}

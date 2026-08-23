const fs = require("fs");
const vm = require("vm");
const DIR = __dirname + "/";
const chrome = { storage: { local: { get: async (keys) => ({}), set: async (o) => {} }, onChanged:{addListener:()=>{}} } };
const ctx = vm.createContext({ chrome, console });
vm.runInContext(fs.readFileSync(DIR+"rankings.js","utf8"), ctx);
vm.runInContext(fs.readFileSync(DIR+"shared.js","utf8"), ctx);
const run = c => vm.runInContext(c, ctx);

const fp_csv = fs.readFileSync("/Users/rithvikmada/Downloads/FantasyPros_2026_Draft_ALL_Rankings (1).csv", "utf8");
const result = run(`parseRankings(${JSON.stringify(fp_csv)})`);

// Create the JavaScript export
const jsCode = `// FantasyPros 2026 Draft Rankings
// Auto-generated from FantasyPros CSV — update via build-fp-source.js

const FP_RANKINGS = ${JSON.stringify(result.players, null, 2)};
`;

fs.writeFileSync(DIR + "fp-rankings.js", jsCode);
console.log(`Created fp-rankings.js with ${result.players.length} players`);
console.log("Warnings:", result.warnings);

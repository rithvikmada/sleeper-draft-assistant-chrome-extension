const fs = require("fs");
const vm = require("vm");
const DIR = "/Users/rithvikmada/Repos/sleeper-draft-ext 4/";
const chrome = { storage: { local: { get: async (keys) => ({}), set: async (o) => {} }, onChanged:{addListener:()=>{}} } };
const ctx = vm.createContext({ chrome, console });
vm.runInContext(fs.readFileSync(DIR+"rankings.js","utf8"), ctx);
vm.runInContext(fs.readFileSync(DIR+"shared.js","utf8"), ctx);
const run = c => vm.runInContext(c, ctx);

const fp_csv = fs.readFileSync("/Users/rithvikmada/Downloads/FantasyPros_2026_Draft_ALL_Rankings (1).csv", "utf8");
try {
  const result = run(`parseRankings(${JSON.stringify(fp_csv)})`);
  console.log("Parse result:", JSON.stringify({
    playerCount: result.players.length,
    warnings: result.warnings,
    first3: result.players.slice(0, 3).map(p => `${p.name} ${p.pos} rank=${p.rank}`)
  }, null, 2));
} catch (e) {
  console.log("ERROR:", e.message);
  console.log(e.stack);
}

import fs from "fs";
import readline from "readline";

const path = process.argv[2];
if (!path) {
  console.error("usage: node tmp-scan-mysql-status.js <sqlfile>");
  process.exit(1);
}

const rs = fs.createReadStream(path, { encoding: "utf8" });
const rl = readline.createInterface({ input: rs });
const tokens = new Set();
let inBlock = false;
let buf = "";

function harvest(str) {
  const re = /'([A-Z][A-Z0-9_]*)'/g;
  let m;
  while ((m = re.exec(str)) !== null) tokens.add(m[1]);
}

rl.on("line", (line) => {
  if (line.includes("INSERT INTO `change_status_legalized`")) inBlock = true;
  if (!inBlock) return;
  buf += `${line}\n`;
  if (line.trim().endsWith(";")) {
    inBlock = false;
    harvest(buf);
    buf = "";
  }
});

rl.on("close", () => {
  console.log([...tokens].sort().join("\n"));
});

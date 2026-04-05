import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(import.meta.url);
let sqlPromise;
function getSql() {
    if (!sqlPromise) {
        const initSqlJs = require("sql.js-fts5");
        const wasmPath = require.resolve("sql.js-fts5/dist/sql-wasm.wasm");
        const wasmBinary = fs.readFileSync(wasmPath);
        sqlPromise = initSqlJs({ wasmBinary });
    }
    return sqlPromise;
}
export async function openDb(filePath) {
    const SQL = await getSql();
    if (fs.existsSync(filePath)) {
        return new SQL.Database(fs.readFileSync(filePath));
    }
    return new SQL.Database();
}
export function saveDb(db, filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, Buffer.from(db.export()));
}

import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
export async function ensureDir(dirPath) {
    await mkdir(dirPath, { recursive: true });
}
export async function pathExists(filePath) {
    try {
        await access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
export async function listFiles(dirPath) {
    try {
        return await readdir(dirPath);
    }
    catch {
        return [];
    }
}
export async function writeJson(filePath, value) {
    await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}
export async function readJson(filePath) {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
}
export async function writeJsonLines(filePath, rows) {
    const content = rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : "");
    await writeFile(filePath, content, "utf8");
}
export async function readJsonLines(filePath) {
    try {
        const raw = await readFile(filePath, "utf8");
        return raw
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => JSON.parse(line));
    }
    catch {
        return [];
    }
}

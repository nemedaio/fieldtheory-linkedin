import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const LABEL = "com.fieldtheory.linkedin-sync";
const PLIST_NAME = `${LABEL}.plist`;
const CRONTAB_COMMENT = "# fieldtheory-linkedin: auto-sync";

interface ScheduleOptions {
  hour: number;
  minute: number;
  classify: boolean;
}

function launchAgentsDir(): string {
  return path.join(os.homedir(), "Library", "LaunchAgents");
}

function plistPath(): string {
  return path.join(launchAgentsDir(), PLIST_NAME);
}

function resolveFtliBin(): string {
  const globalBin = path.join(process.execPath, "..", "ftli");
  try {
    fs.accessSync(globalBin, fs.constants.X_OK);
    return globalBin;
  } catch {
    return "npx";
  }
}

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function buildPlist(options: ScheduleOptions): string {
  const bin = resolveFtliBin();
  const useNpx = bin === "npx";
  const args = useNpx
    ? ["<string>fieldtheory-linkedin</string>", "<string>sync</string>"]
    : ["<string>sync</string>"];
  if (options.classify) {
    args.push("<string>--classify</string>");
  }
  args.push("<string>--headless</string>");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${bin}</string>
    ${args.join("\n    ")}
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${options.hour}</integer>
    <key>Minute</key>
    <integer>${options.minute}</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>${path.join(os.homedir(), ".ft-linkedin-bookmarks", "schedule-stdout.log")}</string>
  <key>StandardErrorPath</key>
  <string>${path.join(os.homedir(), ".ft-linkedin-bookmarks", "schedule-stderr.log")}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:${process.env.PATH ?? ""}</string>
  </dict>
</dict>
</plist>
`;
}

function buildCronLine(options: ScheduleOptions): string {
  const bin = resolveFtliBin();
  const useNpx = bin === "npx";
  const cmd = useNpx ? "npx fieldtheory-linkedin sync" : `${bin} sync`;
  const classifyFlag = options.classify ? " --classify" : "";
  return `${options.minute} ${options.hour} * * * ${cmd}${classifyFlag} --headless ${CRONTAB_COMMENT}`;
}

const isMac = process.platform === "darwin";

export async function enableSchedule(options: ScheduleOptions): Promise<string> {
  return isMac ? enableLaunchd(options) : enableCron(options);
}

async function enableLaunchd(options: ScheduleOptions): Promise<string> {
  fs.mkdirSync(launchAgentsDir(), { recursive: true });

  const dest = plistPath();
  fs.writeFileSync(dest, buildPlist(options), "utf-8");

  try {
    await execFileAsync("launchctl", ["unload", dest]);
  } catch { /* not loaded */ }

  await execFileAsync("launchctl", ["load", dest]);
  return `Scheduled daily sync at ${formatTime(options.hour, options.minute)} via launchd\n  ${dest}`;
}

async function enableCron(options: ScheduleOptions): Promise<string> {
  const newLine = buildCronLine(options);
  let existing = "";
  try {
    const { stdout } = await execFileAsync("crontab", ["-l"]);
    existing = stdout;
  } catch { /* no crontab */ }

  const filtered = existing
    .split("\n")
    .filter((line) => !line.includes(CRONTAB_COMMENT))
    .join("\n");

  const updated = filtered.trimEnd() + "\n" + newLine + "\n";
  const tmp = path.join(os.tmpdir(), "ftli-crontab.tmp");
  fs.writeFileSync(tmp, updated, "utf-8");
  await execFileAsync("crontab", [tmp]);
  fs.unlinkSync(tmp);

  return `Scheduled daily sync at ${formatTime(options.hour, options.minute)} via cron`;
}

export async function disableSchedule(): Promise<string> {
  return isMac ? disableLaunchd() : disableCron();
}

async function disableLaunchd(): Promise<string> {
  const dest = plistPath();
  if (!fs.existsSync(dest)) {
    return "No schedule found.";
  }
  try {
    await execFileAsync("launchctl", ["unload", dest]);
  } catch { /* not loaded */ }
  fs.unlinkSync(dest);
  return "Schedule removed.";
}

async function disableCron(): Promise<string> {
  let existing = "";
  try {
    const { stdout } = await execFileAsync("crontab", ["-l"]);
    existing = stdout;
  } catch {
    return "No schedule found.";
  }

  const filtered = existing
    .split("\n")
    .filter((line) => !line.includes(CRONTAB_COMMENT))
    .join("\n")
    .trimEnd();

  if (filtered === existing.trimEnd()) {
    return "No schedule found.";
  }

  if (!filtered) {
    await execFileAsync("crontab", ["-r"]);
  } else {
    const tmp = path.join(os.tmpdir(), "ftli-crontab.tmp");
    fs.writeFileSync(tmp, filtered + "\n", "utf-8");
    await execFileAsync("crontab", [tmp]);
    fs.unlinkSync(tmp);
  }

  return "Schedule removed.";
}

export async function getScheduleStatus(): Promise<string> {
  return isMac ? getLaunchdStatus() : getCronStatus();
}

function readLastLogLine(logPath: string): string {
  try {
    const fd = fs.openSync(logPath, "r");
    const stat = fs.fstatSync(fd);
    const readSize = Math.min(stat.size, 4096);
    const buf = Buffer.alloc(readSize);
    fs.readSync(fd, buf, 0, readSize, stat.size - readSize);
    fs.closeSync(fd);
    const lines = buf.toString("utf-8").trim().split("\n");
    return lines[lines.length - 1] ?? "";
  } catch {
    return "";
  }
}

async function getLaunchdStatus(): Promise<string> {
  const dest = plistPath();
  if (!fs.existsSync(dest)) {
    return "No schedule configured.\n\n  Enable with: ftli schedule enable";
  }

  const content = fs.readFileSync(dest, "utf-8");
  const hourMatch = content.match(/<key>Hour<\/key>\s*<integer>(\d+)<\/integer>/);
  const minMatch = content.match(/<key>Minute<\/key>\s*<integer>(\d+)<\/integer>/);
  const hour = hourMatch ? hourMatch[1].padStart(2, "0") : "??";
  const min = minMatch ? minMatch[1].padStart(2, "0") : "??";
  const hasClassify = content.includes("--classify");

  let loaded = false;
  try {
    const { stdout } = await execFileAsync("launchctl", ["list", LABEL]);
    loaded = stdout.includes(LABEL);
  } catch { /* not loaded */ }

  const logPath = path.join(os.homedir(), ".ft-linkedin-bookmarks", "schedule-stderr.log");
  const lastLog = readLastLogLine(logPath);

  return [
    `Schedule: daily at ${hour}:${min}${hasClassify ? " (with classify)" : ""}`,
    `Status: ${loaded ? "loaded" : "not loaded"}`,
    `Plist: ${dest}`,
    lastLog ? `Last log: ${lastLog.slice(0, 120)}` : "",
  ].filter(Boolean).join("\n  ");
}

async function getCronStatus(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("crontab", ["-l"]);
    const line = stdout.split("\n").find((l) => l.includes(CRONTAB_COMMENT));
    if (!line) {
      return "No schedule configured.\n\n  Enable with: ftli schedule enable";
    }
    return `Schedule: ${line.replace(CRONTAB_COMMENT, "").trim()}`;
  } catch {
    return "No schedule configured.\n\n  Enable with: ftli schedule enable";
  }
}

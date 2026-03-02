/**
 * @module electron/utils/logger
 * @description 文件日志系统。
 * 接管主进程的 console.log / console.warn / console.error，
 * 将所有输出同时写入日志文件和原始终端（stdout/stderr）。
 *
 * 日志文件位置：<项目路径>/.state/app.log
 * 每次启动时自动轮转：旧日志重命名为 app.log.prev，新日志从空文件开始。
 * 单个日志文件最大 5MB，超过后自动截断。
 *
 * 调用 setupLogger() 后，所有 console.log/warn/error 自动被拦截，无需修改现有代码。
 */
import * as fs from 'fs';
import * as path from 'path';

const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB

let logStream: fs.WriteStream | null = null;
let logFilePath: string | null = null;
let bytesWritten = 0;

// Keep references to original console methods
const originalLog = console.log.bind(console);
const originalWarn = console.warn.bind(console);
const originalError = console.error.bind(console);

/**
 * Format a log line with timestamp and level prefix.
 */
function formatLine(level: string, args: any[]): string {
  const now = new Date();
  const ts = now.toISOString().replace('T', ' ').replace('Z', '');
  const parts = args.map(a => {
    if (a === undefined) return 'undefined';
    if (a === null) return 'null';
    if (a instanceof Error) return `${a.message}\n${a.stack || ''}`;
    if (typeof a === 'object') {
      try { return JSON.stringify(a, null, 2); } catch { return String(a); }
    }
    return String(a);
  });
  return `[${ts}] [${level}] ${parts.join(' ')}\n`;
}

/**
 * Write a line to the log file (non-blocking, fire-and-forget).
 */
function writeToFile(line: string): void {
  if (!logStream) return;

  // Auto-truncate if file gets too large
  if (bytesWritten > MAX_LOG_SIZE) {
    logStream.end();
    try {
      fs.truncateSync(logFilePath!, 0);
    } catch { /* ignore */ }
    logStream = fs.createWriteStream(logFilePath!, { flags: 'a' });
    bytesWritten = 0;
    const notice = formatLine('INFO', ['--- Log truncated (exceeded 5MB) ---']);
    logStream.write(notice);
    bytesWritten += Buffer.byteLength(notice);
  }

  logStream.write(line);
  bytesWritten += Buffer.byteLength(line);
}

/**
 * Initialize the file logger.
 * Call this once at the very start of the main process.
 *
 * @param appDataPath - The directory to store log files in.
 *                      Defaults to the app's userData path.
 *                      Once a project is opened, call setProjectLogPath() to redirect.
 */
export function setupLogger(appDataPath: string): void {
  const logDir = path.join(appDataPath, '.state');
  try { fs.mkdirSync(logDir, { recursive: true }); } catch { /* ignore */ }

  logFilePath = path.join(logDir, 'app.log');

  // Rotate: rename current log to .prev
  try {
    const prevPath = logFilePath + '.prev';
    if (fs.existsSync(logFilePath)) {
      try { fs.unlinkSync(prevPath); } catch { /* ignore */ }
      fs.renameSync(logFilePath, prevPath);
    }
  } catch { /* ignore */ }

  logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
  bytesWritten = 0;

  // Write startup header
  const header = `\n${'='.repeat(60)}\n  NovelWriter started at ${new Date().toISOString()}\n${'='.repeat(60)}\n\n`;
  logStream.write(header);
  bytesWritten += Buffer.byteLength(header);

  // Override console methods
  console.log = (...args: any[]) => {
    originalLog(...args);
    writeToFile(formatLine('LOG', args));
  };
  console.warn = (...args: any[]) => {
    originalWarn(...args);
    writeToFile(formatLine('WARN', args));
  };
  console.error = (...args: any[]) => {
    originalError(...args);
    writeToFile(formatLine('ERROR', args));
  };

  originalLog(`[Logger] Logging to: ${logFilePath}`);
}

/**
 * Redirect log output to a project-specific log file.
 * Call this when a project is opened.
 */
export function setProjectLogPath(projectPath: string): void {
  const logDir = path.join(projectPath, '.state');
  try { fs.mkdirSync(logDir, { recursive: true }); } catch { /* ignore */ }

  const newLogPath = path.join(logDir, 'app.log');

  // Close old stream
  if (logStream) {
    const notice = formatLine('INFO', [`--- Redirecting log to: ${newLogPath} ---`]);
    logStream.write(notice);
    logStream.end();
  }

  logFilePath = newLogPath;

  // Rotate
  try {
    const prevPath = logFilePath + '.prev';
    if (fs.existsSync(logFilePath)) {
      try { fs.unlinkSync(prevPath); } catch { /* ignore */ }
      fs.renameSync(logFilePath, prevPath);
    }
  } catch { /* ignore */ }

  logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
  bytesWritten = 0;

  const header = `\n${'='.repeat(60)}\n  Project log started at ${new Date().toISOString()}\n  Project: ${projectPath}\n${'='.repeat(60)}\n\n`;
  logStream.write(header);
  bytesWritten += Buffer.byteLength(header);

  originalLog(`[Logger] Redirected to: ${logFilePath}`);
}

/**
 * Get the current log file path.
 */
export function getLogPath(): string | null {
  return logFilePath;
}

/**
 * Flush and close the log stream. Call on app quit.
 */
export function closeLogger(): void {
  if (logStream) {
    const footer = formatLine('INFO', ['NovelWriter shutting down']);
    logStream.write(footer);
    logStream.end();
    logStream = null;
  }
}

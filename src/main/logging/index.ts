import { closeSync, existsSync, openSync, readSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import pino, { type Logger } from 'pino';
import { DEFAULT_LOG_LEVEL, type LogLevel } from '@shared/ipc/log';
import { readLogSettings, writeLogSettings } from './log-settings';
import { RotatingFileStream } from './rotating-stream';
import { clearSecrets, registerSecret } from './scrubber';

/**
 * The one logging facility of the app (feature 007). Local file only, no telemetry. Invoice contents, names,
 * addresses, IBANs and amounts must NOT be logged, only technical messages and numbers.
 */
export type Component = 'app' | 'db' | 'pdf' | 'address' | 'ipc' | 'ui';

/** Field names that are masked whatever their value is (top level and one level deep). */
const SENSITIVE_FIELDS = ['password', 'apiKey', 'token', 'authorization', 'secret'];
const REDACT_PATHS = SENSITIVE_FIELDS.flatMap((name) => [name, `*.${name}`]);

export const LOG_FILENAME = 'swissbill.log';

function createRoot(stream: RotatingFileStream, level: LogLevel): Logger {
  return pino(
    {
      level,
      base: null, // no pid/hostname in the log
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
      serializers: { err: pino.stdSerializers.err },
      redact: { paths: REDACT_PATHS, censor: '***' },
    },
    stream,
  );
}

// Before `initLogging` everything goes to stderr, so early entries are not lost
let root: Logger = createRoot(new RotatingFileStream({ file: null }), DEFAULT_LOG_LEVEL);
let currentLevel: LogLevel = DEFAULT_LOG_LEVEL;
let settingsDir: string | null = null;
const children = new Map<Component, Logger>();

/** A log file in the old text format is moved aside once, so JSON lines and text lines are never mixed. */
function moveLegacyFile(file: string): void {
  if (!existsSync(file)) return;
  const buffer = Buffer.alloc(1);
  const fd = openSync(file, 'r');
  let first = '{';
  try {
    if (readSync(fd, buffer, 0, 1, 0) === 1) first = buffer.toString('utf8');
  } finally {
    closeSync(fd);
  }
  if (first !== '{') renameSync(file, `${file}.1`);
}

/**
 * Starts file logging in `<userData>/logs/` and applies the stored level of this device.
 * Safe to call again (tests): the previous destination is replaced.
 */
export function initLogging(userDataDir: string): void {
  const file = join(userDataDir, 'logs', LOG_FILENAME);
  try {
    moveLegacyFile(file);
  } catch {
    // the file cannot be moved: logging continues, the rotation will take care of it
  }
  const { level, problem } = readLogSettings(userDataDir);
  settingsDir = userDataDir;
  currentLevel = level;
  children.clear();
  root = createRoot(new RotatingFileStream({ file }), level);
  if (problem) getLogger('app').warn(`${problem}; es gilt der Standard "${DEFAULT_LOG_LEVEL}"`);
}

function child(component: Component): Logger {
  let logger = children.get(component);
  if (!logger) {
    logger = root.child({ component });
    logger.level = currentLevel;
    children.set(component, logger);
  }
  return logger;
}

type Log = {
  (message: string): void;
  (context: object, message: string): void;
};

export interface ComponentLogger {
  debug: Log;
  info: Log;
  warn: Log;
  error: Log;
}

/**
 * Logger of one area of the app. It looks up the current destination on every call, so it can be created
 * at module level before `initLogging` and keeps working after a level change.
 */
export function getLogger(component: Component): ComponentLogger {
  const at =
    (level: LogLevel): Log =>
    (a: string | object, b?: string) => {
      const logger = child(component);
      if (typeof a === 'string') logger[level](a);
      else logger[level](a, b);
    };
  return { debug: at('debug'), info: at('info'), warn: at('warn'), error: at('error') };
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

/** Applies the level immediately to all loggers (not stored). */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
  root.level = level;
  for (const logger of children.values()) logger.level = level;
}

/** Stores the level for this device (`log-settings.json`) and applies it immediately. */
export function saveLogLevel(level: LogLevel): void {
  setLogLevel(level);
  if (settingsDir === null) throw new Error('Logging is not initialized');
  writeLogSettings(settingsDir, level);
}

/** Registers a secret (e.g. the database password) that must never appear in the log. */
export const redactFromLogs = registerSecret;

export { clearSecrets };
export type { LogLevel };

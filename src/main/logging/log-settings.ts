import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { DEFAULT_LOG_LEVEL, LOG_LEVELS, type LogLevel } from '@shared/ipc/log';

/**
 * The log level is stored per device in a small file in the Electron `userData` folder (not in the database):
 * it must be known at startup, also when the database cannot be opened. A missing file means: `info`.
 */
export const LOG_SETTINGS_FILENAME = 'log-settings.json';
const CURRENT_VERSION = 1;

const fileSchema = z.object({ version: z.literal(CURRENT_VERSION), level: z.enum(LOG_LEVELS) });

export interface LogSettingsResult {
  level: LogLevel;
  /** Set if the file exists but cannot be used; the default level applies then. */
  problem?: string;
}

export function readLogSettings(dir: string): LogSettingsResult {
  const path = join(dir, LOG_SETTINGS_FILENAME);
  if (!existsSync(path)) return { level: DEFAULT_LOG_LEVEL };
  try {
    const parsed = fileSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
    if (parsed.success) return { level: parsed.data.level };
    return { level: DEFAULT_LOG_LEVEL, problem: 'Ungültiger Inhalt in log-settings.json' };
  } catch (error) {
    return {
      level: DEFAULT_LOG_LEVEL,
      problem: `log-settings.json nicht lesbar: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** Writes atomically (temporary file, then rename). Only the known fields are written. */
export function writeLogSettings(dir: string, level: LogLevel): void {
  const path = join(dir, LOG_SETTINGS_FILENAME);
  const temp = `${path}.tmp`;
  writeFileSync(temp, `${JSON.stringify({ version: CURRENT_VERSION, level })}\n`, 'utf8');
  renameSync(temp, path);
}

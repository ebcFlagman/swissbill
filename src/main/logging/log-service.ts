import { AppException } from '@shared/ipc/errors';
import type { LogLevelState, ReportInput, SetLevelInput } from '@shared/ipc/log';
import { getLogLevel, getLogger, saveLogLevel } from './index';

const REPORT_LIMIT = 20;
const REPORT_WINDOW_MS = 60_000;

export interface LogService {
  getLevel(): LogLevelState;
  /** Stores the level for this device and applies it immediately. */
  setLevel(input: SetLevelInput): LogLevelState;
  /** Logs an unexpected error of the user interface (component `ui`), at most 20 per minute. */
  report(input: ReportInput): void;
}

/** Logic behind the log IPC channels (without Electron, so it can be tested directly). */
export function createLogService(options: { now?: () => number } = {}): LogService {
  const now = options.now ?? Date.now;
  let windowStart = 0;
  let inWindow = 0;
  let dropped = 0;

  return {
    getLevel: () => ({ level: getLogLevel() }),

    setLevel({ level }) {
      try {
        saveLogLevel(level);
      } catch (error) {
        // saveLogLevel has applied the level before writing the file
        getLogger('app').error({ err: error }, 'Log-Level konnte nicht gespeichert werden');
        throw new AppException(
          'IO',
          'Die Einstellung konnte nicht gespeichert werden. Sie gilt bis zum nächsten Neustart.',
        );
      }
      return { level };
    },

    report({ message, stack, source }) {
      const time = now();
      if (time - windowStart >= REPORT_WINDOW_MS) {
        windowStart = time;
        inWindow = 0;
      }
      if (inWindow >= REPORT_LIMIT) {
        dropped++;
        return;
      }
      inWindow++;
      const context: Record<string, unknown> = {};
      if (stack !== undefined) context.stack = stack;
      if (source !== undefined) context.source = source;
      if (dropped > 0) {
        context.dropped = dropped;
        dropped = 0;
      }
      getLogger('ui').error(context, message);
    },
  };
}

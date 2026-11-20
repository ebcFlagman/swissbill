import { z } from 'zod';

/** Log levels, from most to least severe. The default is `info`. */
export const LOG_LEVELS = ['error', 'warn', 'info', 'debug'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];
export const DEFAULT_LOG_LEVEL: LogLevel = 'info';

export interface LogLevelState {
  level: LogLevel;
}

export const setLevelSchema = z.object({ level: z.enum(LOG_LEVELS) });
export type SetLevelInput = z.infer<typeof setLevelSchema>;

export const REPORT_MESSAGE_MAX = 500;
export const REPORT_STACK_MAX = 4000;
export const REPORT_SOURCE_MAX = 200;

/** An unexpected error of the user interface, reported to the main process (component `ui`). */
export const reportSchema = z.object({
  message: z.string().min(1).max(REPORT_MESSAGE_MAX),
  stack: z.string().max(REPORT_STACK_MAX).optional(),
  source: z.string().max(REPORT_SOURCE_MAX).optional(),
});
export type ReportInput = z.infer<typeof reportSchema>;

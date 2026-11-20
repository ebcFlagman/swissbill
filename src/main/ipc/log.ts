import { z } from 'zod';
import { CHANNELS } from '@shared/ipc/api';
import { reportSchema, setLevelSchema, type LogLevelState } from '@shared/ipc/log';
import type { LogService } from '../logging/log-service';
import { handle } from './handle';

/**
 * Log channels: they work without an open database (also in recovery mode). The renderer never writes a file,
 * it only reports errors and chooses the level.
 */
export function registerLogHandlers(service: LogService): void {
  handle<undefined, LogLevelState>(CHANNELS.logGetLevel, z.undefined(), () => service.getLevel());
  handle<z.infer<typeof setLevelSchema>, LogLevelState>(
    CHANNELS.logSetLevel,
    setLevelSchema,
    (input) => service.setLevel(input),
  );
  handle<z.infer<typeof reportSchema>, void>(CHANNELS.logReport, reportSchema, (input) =>
    service.report(input),
  );
}

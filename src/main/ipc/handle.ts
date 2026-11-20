import { ipcMain } from 'electron';
import type { z } from 'zod';
import type { ChannelName } from '../../shared/ipc/api';
import { wrapHandler } from './wrap';

/** Registers a channel. Inputs are validated with zod, errors are returned as `Result`. */
export function handle<I, O>(
  channel: ChannelName,
  schema: z.ZodType<I>,
  handler: Parameters<typeof wrapHandler<I, O>>[1],
): void {
  const wrapped = wrapHandler(schema, handler);
  ipcMain.handle(channel, (_event, rawInput: unknown) => wrapped(rawInput));
}

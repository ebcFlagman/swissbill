import { appendFileSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { scrub } from './scrubber';

export interface RotatingFileOptions {
  /** Active log file; `null` writes to stderr only (before the logger is initialized). */
  file: string | null;
  /** Rotate when the active file has reached this size. */
  maxBytes?: number;
  /** Number of files kept: the active one plus `maxFiles - 1` older ones (`.1`, `.2`, …). */
  maxFiles?: number;
}

export const DEFAULT_MAX_BYTES = 1_000_000;
export const DEFAULT_MAX_FILES = 5;

/**
 * Synchronous log destination for pino: one line per write, size based rotation, secrets scrubbed.
 * It never throws: if the file cannot be written, the line goes to stderr (FR-010).
 */
export class RotatingFileStream {
  private readonly file: string | null;
  private readonly maxBytes: number;
  private readonly maxFiles: number;
  private size = 0;
  private ready = false;

  constructor(options: RotatingFileOptions) {
    this.file = options.file;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.maxFiles = Math.max(1, options.maxFiles ?? DEFAULT_MAX_FILES);
  }

  write(chunk: string): void {
    const line = scrub(chunk);
    if (this.file === null) {
      process.stderr.write(line);
      return;
    }
    try {
      this.prepare(this.file);
      if (this.size >= this.maxBytes) this.rotate(this.file);
      appendFileSync(this.file, line, 'utf8');
      this.size += Buffer.byteLength(line);
    } catch {
      this.ready = false;
      process.stderr.write(line);
    }
  }

  /** Creates the folder and learns the size of an existing file once. */
  private prepare(file: string): void {
    if (this.ready) return;
    mkdirSync(dirname(file), { recursive: true });
    try {
      this.size = statSync(file).size;
    } catch {
      this.size = 0; // file does not exist yet
    }
    this.ready = true;
  }

  /** `log.3` is dropped, `log.2` → `log.3`, `log.1` → `log.2`, `log` → `log.1`. */
  private rotate(file: string): void {
    if (this.maxFiles > 1) {
      rmSync(`${file}.${this.maxFiles - 1}`, { force: true });
      for (let n = this.maxFiles - 2; n >= 1; n--) {
        try {
          renameSync(`${file}.${n}`, `${file}.${n + 1}`);
        } catch {
          // this older file does not exist
        }
      }
      renameSync(file, `${file}.1`);
    } else {
      rmSync(file, { force: true });
    }
    this.size = 0;
  }
}

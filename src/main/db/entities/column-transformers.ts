import type { ValueTransformer } from 'typeorm';

/**
 * `pg` and `mysql2` return `bigint` columns as strings. Amounts (rappen) and quantities stay far below
 * 2^53, so they are plain numbers in the application.
 */
export const bigintToNumber: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | number | null | undefined) =>
    value === null || value === undefined ? value : Number(value),
};

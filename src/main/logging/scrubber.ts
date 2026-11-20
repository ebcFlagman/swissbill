const MIN_SECRET_LENGTH = 3;

const secrets = new Set<string>();

/** Registers a secret (e.g. the database password) that must never appear in the log. */
export function registerSecret(secret: string): void {
  if (secret.length >= MIN_SECRET_LENGTH) secrets.add(secret);
}

/** For tests: forget all registered secrets. */
export function clearSecrets(): void {
  secrets.clear();
}

/**
 * Replaces every registered secret in a finished log line. A JSON line shows quotes, backslashes and
 * control characters escaped, so the escaped form of the secret is replaced as well as the raw one.
 */
export function scrub(line: string): string {
  let result = line;
  for (const secret of secrets) {
    const escaped = JSON.stringify(secret).slice(1, -1);
    if (escaped !== secret) result = result.split(escaped).join('***');
    result = result.split(secret).join('***');
  }
  return result;
}

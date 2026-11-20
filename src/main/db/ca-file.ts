import { readFileSync } from 'node:fs';

/** The CA certificate file of a TLS connection must be readable and hold a PEM certificate. */
export function checkCaFile(path: string): string | null {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return 'Die Datei kann nicht gelesen werden.';
  }
  return text.includes('-----BEGIN CERTIFICATE-----')
    ? null
    : 'Die Datei enthält kein Zertifikat im PEM-Format.';
}

/** Reads the CA certificate for a connection; a missing or damaged file gives a clear German error. */
export function readCaFile(path: string): string {
  const problem = checkCaFile(path);
  if (problem) throw new Error(`Das CA-Zertifikat «${path}» ist nicht verwendbar: ${problem}`);
  return readFileSync(path, 'utf8');
}

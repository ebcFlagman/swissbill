// Validiert eine Release-Version (SemVer) und leitet Tag und Vorabversions-Status ab.
// Aufruf in der Release-Pipeline: node scripts/resolve-release-version.mjs <version|tag>
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/;

/**
 * @param {string | undefined} input Version mit oder ohne führendes «v»
 * @returns {{ version: string, tag: string, prerelease: boolean }}
 */
export function resolveReleaseVersion(input) {
  const version = (input ?? '').trim().replace(/^v/, '');
  if (!SEMVER.test(version)) {
    throw new Error(
      `Ungültige Version «${input ?? ''}». Erwartet wird MAJOR.MINOR.PATCH, optional mit Zusatz (z. B. 1.2.0 oder 1.2.0-rc.1).`,
    );
  }
  return { version, tag: `v${version}`, prerelease: version.includes('-') };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = resolveReleaseVersion(process.argv[2]);
    const lines = Object.entries(result).map(([key, value]) => `${key}=${value}`);
    console.log(lines.join('\n'));
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exit(1);
  }
}

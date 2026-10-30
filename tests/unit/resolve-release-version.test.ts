import { describe, expect, it } from 'vitest';
import { resolveReleaseVersion } from '../../scripts/resolve-release-version.mjs';

describe('resolveReleaseVersion', () => {
  it('akzeptiert eine stabile Version', () => {
    expect(resolveReleaseVersion('1.2.0')).toEqual({
      version: '1.2.0',
      tag: 'v1.2.0',
      prerelease: false,
    });
  });

  it('entfernt ein führendes v', () => {
    expect(resolveReleaseVersion('v1.2.0')).toEqual({
      version: '1.2.0',
      tag: 'v1.2.0',
      prerelease: false,
    });
  });

  it('erkennt Vorabversionen', () => {
    expect(resolveReleaseVersion('1.2.0-rc.1')).toEqual({
      version: '1.2.0-rc.1',
      tag: 'v1.2.0-rc.1',
      prerelease: true,
    });
  });

  it.each(['', '  ', 'abc', '1.2', '01.2.3', '1.2.0+build', '1.2.0-', 'v', '1.2.3.4'])(
    'lehnt %j ab',
    (input) => {
      expect(() => resolveReleaseVersion(input)).toThrow(/Ungültige Version/);
    },
  );

  it('lehnt undefined ab', () => {
    expect(() => resolveReleaseVersion(undefined)).toThrow(/Ungültige Version/);
  });
});

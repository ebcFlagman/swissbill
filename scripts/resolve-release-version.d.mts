export interface ReleaseVersion {
  version: string;
  tag: string;
  prerelease: boolean;
}

export function resolveReleaseVersion(input: string | undefined): ReleaseVersion;

import { describe, it, expect } from 'vitest';
import { isReleasesPath, parseReleasesPath, releasesPath, type ReleaseRoute } from './releasesRoute';

describe('release URLs', () => {
  it('knows which paths are Release Master', () => {
    expect(isReleasesPath('/releases')).toBe(true);
    expect(isReleasesPath('/releases/rel-1/builds')).toBe(true);
    expect(isReleasesPath('/releases-old')).toBe(false);
    expect(isReleasesPath('/')).toBe(false);
  });

  it('reads the list, the new-release form and a release with its tab and build', () => {
    expect(parseReleasesPath('/releases')).toEqual({ view: 'list' });
    expect(parseReleasesPath('/releases/')).toEqual({ view: 'list' });
    expect(parseReleasesPath('/releases/new')).toEqual({ view: 'new' });
    expect(parseReleasesPath('/releases/rel-1')).toEqual({ view: 'release', releaseId: 'rel-1', tab: 'overview', buildId: null });
    expect(parseReleasesPath('/releases/rel-1/audit')).toEqual({ view: 'release', releaseId: 'rel-1', tab: 'audit', buildId: null });
    expect(parseReleasesPath('/releases/rel-1/builds/rc101')).toEqual({ view: 'release', releaseId: 'rel-1', tab: 'builds', buildId: 'rc101' });
  });

  it('falls back to the overview for an unknown tab, and ignores a build outside the builds tab', () => {
    expect(parseReleasesPath('/releases/rel-1/nonsense')).toEqual({ view: 'release', releaseId: 'rel-1', tab: 'overview', buildId: null });
    expect(parseReleasesPath('/releases/rel-1/notes/rc101')).toMatchObject({ tab: 'notes', buildId: null });
  });

  it('writes back what it reads', () => {
    const routes: ReleaseRoute[] = [
      { view: 'list' }, { view: 'new' },
      { view: 'release', releaseId: 'rel-1', tab: 'overview', buildId: null },
      { view: 'release', releaseId: 'rel-1', tab: 'blockers', buildId: null },
      { view: 'release', releaseId: 'rel-1', tab: 'builds', buildId: 'rc100' },
    ];
    for (const route of routes) expect(parseReleasesPath(releasesPath(route))).toEqual(route);
    expect(releasesPath({ view: 'release', releaseId: 'rel-1', tab: 'overview', buildId: null })).toBe('/releases/rel-1');
  });

  it('encodes ids that are not URL-safe', () => {
    const route: ReleaseRoute = { view: 'release', releaseId: 'a b/c', tab: 'notes', buildId: null };
    expect(releasesPath(route)).toBe('/releases/a%20b%2Fc/notes');
    expect(parseReleasesPath(releasesPath(route))).toEqual(route);
  });
});

import { describe, it, expect } from 'vitest';
import { getActiveEffect3d, activateEffect3d } from '../../scripts/plugins3d-loader.js';

describe('plugins3d-loader', () => {
  it('getActiveEffect3d returns null by default', () => {
    expect(getActiveEffect3d()).toBeNull();
  });

  it('throws an error if activateEffect3d is called before initialization', () => {
    expect(() => activateEffect3d('some-effect')).toThrow('[plugins3d] initPlugins3dLoader() non chiamato');
  });
});

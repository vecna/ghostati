import { describe, it, expect } from 'vitest';
import { createUvRenderer } from '../../scripts/ghostyle3d-uv-renderer.js';

describe('ghostyle3d-uv-renderer', () => {
  it('throws an error if uvPath is missing', () => {
    expect(() => createUvRenderer()).toThrow('[uv-renderer] uvPath obbligatorio');
    expect(() => createUvRenderer({})).toThrow('[uv-renderer] uvPath obbligatorio');
  });

  it('returns ensureLoaded and render functions when initialized correctly', () => {
    const renderer = createUvRenderer({ uvPath: 'data/face_canonical_uv.json' });
    expect(renderer).toHaveProperty('ensureLoaded');
    expect(renderer).toHaveProperty('render');
    expect(typeof renderer.ensureLoaded).toBe('function');
    expect(typeof renderer.render).toBe('function');
  });
});

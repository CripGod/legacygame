import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { CARD_BY_ID } from '../src/engine';
import { CINEMATICS, CINE_VOLUME } from '../src/ui/cinematics';

describe('card cinematics', () => {
  it('every entry names a real card and a clip the game and Unity both have', () => {
    for (const [card, c] of Object.entries(CINEMATICS)) {
      expect(CARD_BY_ID[card], `${card} is not a card`).toBeDefined();
      expect(c.clip, `${card}: the clip is a .webm under public/art/video`).toMatch(/^[a-z0-9-]+\.webm$/);
      expect(existsSync(`public/art/video/${c.clip}`), `${card}: public/art/video/${c.clip} is missing (npm run cine)`).toBe(true);
      expect(existsSync(`unity/StandOnBusiness/Assets/StandOnBusiness/Resources/video/${c.clip}`), `${card}: the Unity twin of ${c.clip} is missing (npm run cine)`).toBe(true);
      expect(c.line.length, `${card}: the line under the name`).toBeGreaterThan(0);
    }
  });
  it('plays a clip with sound under full scale, beside the game cues', () => {
    expect(CINE_VOLUME).toBeGreaterThan(0);
    expect(CINE_VOLUME).toBeLessThanOrEqual(1);
  });
});

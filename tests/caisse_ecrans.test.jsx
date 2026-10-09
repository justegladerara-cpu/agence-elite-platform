// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { lireCoupures } from '../src/modules/cloture/Clotures.jsx';

describe('comptage du tiroir', () => {
  test('coupures : nombres positifs, du plus grand au plus petit, sans doublon ni devise supposée', () => {
    expect(lireCoupures('500, 10000 ; 1000 5000,500')).toEqual([10000, 5000, 1000, 500]);
    expect(lireCoupures('0.5, 2, abc, -1, 0')).toEqual([2, 0.5]);
    expect(lireCoupures('')).toEqual([]);
    expect(lireCoupures(undefined)).toEqual([]);
  });
});

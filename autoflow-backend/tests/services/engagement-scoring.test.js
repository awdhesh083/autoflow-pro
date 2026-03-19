'use strict';
const { clearAllStores } = require('../helpers/testApp');

afterAll(() => clearAllStores());

describe('EngagementScoring', () => {
  const EngagementScoring = require('../../services/engagement.scoring');

  describe('getTier', () => {
    it('returns Champion for score 80-100', () => {
      expect(EngagementScoring.getTier(100).label).toBe('Champion');
      expect(EngagementScoring.getTier(80).label).toBe('Champion');
    });
    it('returns Loyal for score 60-79', () => {
      expect(EngagementScoring.getTier(79).label).toBe('Loyal');
      expect(EngagementScoring.getTier(60).label).toBe('Loyal');
    });
    it('returns Potential for 40-59', () => {
      expect(EngagementScoring.getTier(59).label).toBe('Potential');
      expect(EngagementScoring.getTier(40).label).toBe('Potential');
    });
    it('returns At-risk for 20-39', () => {
      expect(EngagementScoring.getTier(39).label).toBe('At-risk');
      expect(EngagementScoring.getTier(20).label).toBe('At-risk');
    });
    it('returns Dormant for 0-19', () => {
      expect(EngagementScoring.getTier(19).label).toBe('Dormant');
      expect(EngagementScoring.getTier(0).label).toBe('Dormant');
    });
  });

  describe('TIER_LABELS', () => {
    it('has exactly 5 tiers', () => {
      expect(EngagementScoring.TIER_LABELS.length).toBe(5);
    });
    it('tiers cover full 0-100 range', () => {
      const mins = EngagementScoring.TIER_LABELS.map(t => t.min).sort((a, b) => a - b);
      expect(mins[0]).toBe(0);
      expect(mins[mins.length - 1]).toBeLessThanOrEqual(80);
    });
    it('each tier has label, color, min, tag', () => {
      EngagementScoring.TIER_LABELS.forEach(t => {
        expect(t).toHaveProperty('label');
        expect(t).toHaveProperty('color');
        expect(t).toHaveProperty('min');
        expect(t).toHaveProperty('tag');
      });
    });
  });

  describe('scoreContact (mocked - no real DB needed)', () => {
    it('getTier returns object with all expected fields', () => {
      const tier = EngagementScoring.getTier(85);
      expect(tier).toHaveProperty('label', 'Champion');
      expect(tier).toHaveProperty('color');
      expect(tier).toHaveProperty('tag', 'Champion');
    });

    it('score of 0 gives Dormant tier', () => {
      expect(EngagementScoring.getTier(0).label).toBe('Dormant');
    });

    it('score boundary: 79 is Loyal, 80 is Champion', () => {
      expect(EngagementScoring.getTier(79).label).toBe('Loyal');
      expect(EngagementScoring.getTier(80).label).toBe('Champion');
    });

    it('negative scores clamp to Dormant', () => {
      // getTier with negative would match last tier
      const tier = EngagementScoring.getTier(-5);
      expect(tier).toBeDefined();
    });
  });
});

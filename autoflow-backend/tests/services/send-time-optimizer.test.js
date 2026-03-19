'use strict';

describe('SendTimeOptimizer', () => {
  const STO = require('../../services/send-time-optimizer');

  describe('getIndustryBestTimes', () => {
    it('returns best hours and days for email', () => {
      const r = STO.getIndustryBestTimes('email');
      expect(r.platform).toBe('email');
      expect(Array.isArray(r.bestHours)).toBe(true);
      expect(r.bestHours.length).toBeGreaterThan(0);
      expect(r.source).toBe('industry');
      expect(r.confidence).toBe(100);
    });

    it('returns data for all major platforms', () => {
      for (const platform of ['whatsapp', 'instagram', 'linkedin', 'twitter', 'telegram']) {
        const r = STO.getIndustryBestTimes(platform);
        expect(r.bestHours.length).toBeGreaterThan(0);
        expect(r.bestDays.length).toBeGreaterThan(0);
      }
    });

    it('falls back to email data for unknown platform', () => {
      const r = STO.getIndustryBestTimes('unknown_platform');
      expect(r.bestHours).toBeTruthy();
    });

    it('hours are valid 0   23 range', () => {
      const r = STO.getIndustryBestTimes('email');
      expect(r.bestHours.every(h => h >= 0 && h <= 23)).toBe(true);
    });
  });
});

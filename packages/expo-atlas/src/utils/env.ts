import { boolish } from 'getenv';

export const env = {
  get EXPO_DEBUG() {
    return boolish('EXPO_DEBUG', false);
  },
  get EXPO_ATLAS_NO_VALIDATION() {
    return boolish('EXPO_ATLAS_NO_VALIDATION', false);
  },
  get EXPO_ATLAS_STATS_ONLY() {
    return boolish('EXPO_ATLAS_STATS_ONLY', false);
  },
};

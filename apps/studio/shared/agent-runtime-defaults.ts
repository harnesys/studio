import type { PortRef } from 'harnesys';

export function defaultAgentCompaction(): PortRef {
  return {
    name: 'threshold-summary',
    spec: {
      thresholdRatio: 0.8,
      protectRecentRatio: 0.1,
      auto: true,
    },
  };
}

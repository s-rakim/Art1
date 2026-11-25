import { useQuery, useQueryClient } from '@tanstack/react-query';

import { api, unwrap } from '@/api/client';
import { rider, type RiderDelivery } from '@/api/market';

/**
 * The rider screens read four things: profile and totals, the run in
 * progress, jobs on the board, and today's finished drops (green pins).
 */
export const riderKeys = {
  me: ['rider', 'me'] as const,
  jobs: ['rider', 'jobs'] as const,
  run: ['rider', 'run'] as const,
  done: ['rider', 'done'] as const,
  earnings: ['rider', 'earnings'] as const,
};

export function useRiderMe() {
  return useQuery({ queryKey: riderKeys.me, queryFn: () => unwrap(api.GET('/api/v1/rider/me')) });
}

export function useOpenJobs(enabled: boolean) {
  return useQuery({ queryKey: riderKeys.jobs, enabled, refetchInterval: 30_000, queryFn: rider.openJobs });
}

export function useRun(enabled: boolean) {
  return useQuery({ queryKey: riderKeys.run, enabled, refetchInterval: 30_000, queryFn: rider.run });
}

/** Today's finished drops, shown as green pins. */
export function useDoneToday(enabled: boolean) {
  return useQuery({
    queryKey: riderKeys.done,
    enabled,
    queryFn: async (): Promise<RiderDelivery[]> => {
      const page = await unwrap(api.GET('/api/v1/rider/deliveries', { params: { query: { scope: 'history', page_size: 50 } } }));
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return page.items.filter((d) => d.status === 'delivered' && d.delivered_at && new Date(d.delivered_at) >= start);
    },
  });
}

export function useRiderRefresh() {
  const qc = useQueryClient();
  return () => Object.values(riderKeys).forEach((k) => qc.invalidateQueries({ queryKey: k }));
}

export const blockedText: Record<string, string> = {
  batch_full: 'Your bag is full for this run.',
  on_run_far: 'Too far from the drops on your current run.',
  pickup_far: 'The shop is too far from your other pickups.',
};

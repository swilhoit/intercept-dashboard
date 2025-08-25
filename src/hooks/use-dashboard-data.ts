import useSWR from 'swr';
import { DateRange } from 'react-day-picker';

const fetcher = (url: string) => fetch(url).then(res => res.json());

interface UseDashboardDataOptions {
  dateRange?: DateRange;
  channel?: string;
  refreshInterval?: number;
}

export function useSalesSummary({ dateRange, channel, refreshInterval = 300000 }: UseDashboardDataOptions) {
  const params = new URLSearchParams();
  if (dateRange?.from) params.append('startDate', dateRange.from.toISOString().split('T')[0]);
  if (dateRange?.to) params.append('endDate', dateRange.to.toISOString().split('T')[0]);
  if (channel && channel !== 'all') params.append('channel', channel);

  return useSWR(
    `/api/sales/summary?${params}`,
    fetcher,
    {
      refreshInterval,
      revalidateOnFocus: false,
      dedupingInterval: 60000,
      fallbackData: {
        total_revenue: 0,
        total_orders: 0,
        days_with_sales: 0,
        amazon_revenue: 0,
        woocommerce_revenue: 0,
      }
    }
  );
}

export function useSalesDaily({ dateRange, channel, refreshInterval = 300000 }: UseDashboardDataOptions) {
  const params = new URLSearchParams();
  if (dateRange?.from) params.append('startDate', dateRange.from.toISOString().split('T')[0]);
  if (dateRange?.to) params.append('endDate', dateRange.to.toISOString().split('T')[0]);
  if (channel && channel !== 'all') params.append('channel', channel);

  return useSWR(
    `/api/sales/daily?${params}`,
    fetcher,
    {
      refreshInterval,
      revalidateOnFocus: false,
      dedupingInterval: 60000,
      fallbackData: []
    }
  );
}

export function useProducts({ dateRange, channel, refreshInterval = 600000 }: UseDashboardDataOptions) {
  const params = new URLSearchParams();
  if (dateRange?.from) params.append('startDate', dateRange.from.toISOString().split('T')[0]);
  if (dateRange?.to) params.append('endDate', dateRange.to.toISOString().split('T')[0]);
  if (channel && channel !== 'all') params.append('channel', channel);

  return useSWR(
    `/api/sales/products?${params}`,
    fetcher,
    {
      refreshInterval,
      revalidateOnFocus: false,
      dedupingInterval: 120000,
      fallbackData: []
    }
  );
}

export function useAdSpend({ dateRange, refreshInterval = 600000 }: UseDashboardDataOptions) {
  const params = new URLSearchParams();
  if (dateRange?.from) params.append('startDate', dateRange.from.toISOString().split('T')[0]);
  if (dateRange?.to) params.append('endDate', dateRange.to.toISOString().split('T')[0]);

  return useSWR(
    `/api/ads/total-spend?${params}`,
    fetcher,
    {
      refreshInterval,
      revalidateOnFocus: false,
      dedupingInterval: 120000,
      fallbackData: { metrics: {}, trend: [] }
    }
  );
}

// Parallel data fetching hook
export function useDashboardData({ dateRange, channel }: UseDashboardDataOptions) {
  const summary = useSalesSummary({ dateRange, channel });
  const daily = useSalesDaily({ dateRange, channel });
  const products = useProducts({ dateRange, channel });
  const adSpend = useAdSpend({ dateRange });

  const isLoading = summary.isLoading || daily.isLoading || products.isLoading || adSpend.isLoading;
  const error = summary.error || daily.error || products.error || adSpend.error;

  return {
    summary: summary.data,
    dailySales: daily.data,
    products: products.data,
    adSpend: adSpend.data,
    isLoading,
    error,
    mutate: () => {
      summary.mutate();
      daily.mutate();
      products.mutate();
      adSpend.mutate();
    }
  };
}
import '@/lib/location-task';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import { AuthProvider } from '@/lib/auth';
import { startPinning } from '@/lib/pinning';

export default function RootLayout() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            // Don't hammer the API with retries for answers that won't change.
            retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
          },
        },
      }),
  );
  useEffect(() => {
    startPinning();
  }, []);
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }} />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

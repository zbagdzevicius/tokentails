'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { FirebaseAuthProvider } from '../context/FirebaseAuthContext';
import { ProfileProvider } from '../context/ProfileContext';
import { ToastProvider } from '../context/ToastContext';
import DashboardLayout from './pageLayout';

export const queryClient = new QueryClient();

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ProfileProvider>
          <FirebaseAuthProvider>
            <DashboardLayout>{children}</DashboardLayout>
          </FirebaseAuthProvider>
        </ProfileProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

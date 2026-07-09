import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from './utils/themeContext';

import Login from './pages/Login';
import DashboardLayout from './layouts/DashboardLayout';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import Attendance from './pages/Attendance';
import Requests from './pages/Requests';
import Campaigns from './pages/Campaigns';
import Loans from './pages/Loans';
import Payroll from './pages/Payroll';
import Audit from './pages/Audit';
import DigitalTwin from './pages/DigitalTwin';

const queryClient = new QueryClient();

// Helper Route Guard
function RequireAuth({ children }) {
  const token = localStorage.getItem('accessToken');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<Login />} />

            {/* Protected Routes (Dashboard Area) */}
            <Route
              path="/dashboard"
              element={
                <RequireAuth>
                  <DashboardLayout />
                </RequireAuth>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="employees" element={<Employees />} />
              <Route path="attendance" element={<Attendance />} />
              <Route path="requests" element={<Requests />} />
              <Route path="campaigns" element={<Campaigns />} />
              <Route path="loans" element={<Loans />} />
              <Route path="payroll" element={<Payroll />} />
              <Route path="audit" element={<Audit />} />
              <Route path="digital-twin" element={<DigitalTwin />} />
            </Route>

            {/* Fallback Catch-all Redirect */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: 'var(--brand-bg-elevated)',
                color: 'var(--brand-text)',
                borderColor: 'var(--brand-border)',
                borderWidth: '1px'
              }
            }}
          />
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

import { createBrowserRouter, Navigate } from 'react-router-dom';
import { lazy } from 'react';
import { Layout } from './Layout';
import { ErrorPage } from './ErrorPage';

const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'));
const ProductsPage = lazy(() => import('@/pages/products/ProductsPage'));
const ProductDetailPage = lazy(() => import('@/pages/products/ProductDetailPage'));
const ProductEditPage = lazy(() => import('@/pages/products/ProductEditPage'));
const WarehousesPage = lazy(() => import('@/pages/warehouses/WarehousesPage'));
const ScanPage = lazy(() => import('@/pages/scan/ScanPage'));
const MovementsPage = lazy(() => import('@/pages/movements/MovementsPage'));
const NewMovementPage = lazy(() => import('@/pages/movements/NewMovementPage'));
const MorePage = lazy(() => import('@/pages/more/MorePage'));
const SettingsPage = lazy(() => import('@/pages/more/SettingsPage'));
const BackupPage = lazy(() => import('@/pages/more/BackupPage'));

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'products', element: <ProductsPage /> },
      { path: 'products/new', element: <ProductEditPage /> },
      { path: 'products/:id', element: <ProductDetailPage /> },
      { path: 'products/:id/edit', element: <ProductEditPage /> },
      { path: 'warehouses', element: <WarehousesPage /> },
      { path: 'scan', element: <ScanPage /> },
      { path: 'movements', element: <MovementsPage /> },
      { path: 'movements/new', element: <NewMovementPage /> },
      { path: 'more', element: <MorePage /> },
      { path: 'more/settings', element: <SettingsPage /> },
      { path: 'more/backup', element: <BackupPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

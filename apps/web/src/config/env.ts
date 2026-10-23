export const config = {
  apiUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api',
  ravexUrl: import.meta.env.VITE_RAVEX_URL ?? 'http://localhost:3000',
  appName: import.meta.env.VITE_APP_NAME ?? 'Ravex Support Chat',
}

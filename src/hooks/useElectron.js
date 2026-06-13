// Safe wrapper around window.electron (works in both Electron and browser dev)
const api = window.electron || {};

export const useElectron = () => api;

export default api;

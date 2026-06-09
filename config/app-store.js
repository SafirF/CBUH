// ============================================
// app-store.js - Store Reactivo Centralizado
// ============================================
// Reemplaza el uso de window.adminContext, window.teacherContext, etc.
// con un store centralizado y reactivo.

const state = {
    adminContext: null,
    studentContext: null,
    teacherContext: null,
    activeTab: 'dashboard'
};

const listeners = new Set();

export const store = {
    get: () => state,
    set: (newState) => {
        Object.assign(state, newState);
        listeners.forEach(callback => callback(state));
    },
    subscribe: (callback) => {
        listeners.add(callback);
        return () => listeners.delete(callback); // Unsubscribe
    }
};

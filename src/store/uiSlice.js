import { createSlice } from '@reduxjs/toolkit';
const initialState = {
  sidebarOpen: true,
  activeTab: 'dashboard',
  loading: false,
  notifications: []
};
export const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleSidebar: state => {
      state.sidebarOpen = !state.sidebarOpen;
    },
    setActiveTab: (state, action) => {
      state.activeTab = action.payload;
    },
    setLoading: (state, action) => {
      state.loading = action.payload;
    },
    addNotification: (state, action) => {
      state.notifications.push(action.payload);
    },
    removeNotification: (state, action) => {
      state.notifications = state.notifications.filter(n => n.id !== action.payload);
    }
  }
});
export const {
  toggleSidebar,
  setActiveTab,
  setLoading,
  addNotification,
  removeNotification
} = uiSlice.actions;
export default uiSlice.reducer;
import { configureStore } from "@reduxjs/toolkit";
import examsReducer from "./examsSlice";
import uiReducer from "./uiSlice";
import authReducer from "./authSlice";

export const store = configureStore({
  reducer: {
    exams: examsReducer,
    ui: uiReducer,
    auth: authReducer,
  },
});
// Export for JavaScript usage
export const getState = store.getState;
export const dispatch = store.dispatch;

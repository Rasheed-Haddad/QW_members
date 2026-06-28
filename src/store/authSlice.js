import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";

const API_BASE_URL = "https://qaddha-wqdood-employers.onrender.com";

// تسجيل دخول العضو: رقم الموبايل + الكلمات الثلاث
export const employer_login = createAsyncThunk(
  "auth/login",
  async (
    { phone_number, password1, password2, password3 },
    { rejectWithValue },
  ) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/employerlogin`, {
        phone_number,
        password1,
        password2,
        password3,
      });
      return response.data.employer;
    } catch (error) {
      if (error.response) {
        return rejectWithValue(
          error.response.data.message || "فشل تسجيل الدخول",
        );
      } else if (error.request) {
        return rejectWithValue("تأكد من اتصالك بالإنترنت");
      } else {
        return rejectWithValue("حدث خطأ غير متوقع");
      }
    }
  },
);

// ملاحظة: لا نخزّن الجلسة في localStorage عمداً — يُطلب تسجيل الدخول كل مرة.
const authSlice = createSlice({
  name: "auth",
  initialState: {
    employer: null, // { _id, name, phone_number }
    loading: false,
    error: null,
  },
  reducers: {
    logout: (state) => {
      state.employer = null;
      state.error = null;
    },
    clearAuthError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(employer_login.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(employer_login.fulfilled, (state, action) => {
        state.loading = false;
        state.employer = action.payload;
        state.error = null;
      })
      .addCase(employer_login.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { logout, clearAuthError } = authSlice.actions;
export default authSlice.reducer;

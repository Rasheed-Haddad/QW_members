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

// ─── بقاء الجلسة ──────────────────────────────────────────────────────────────
// كانت الجلسة في الذاكرة وحدها، فكل تحديثٍ للصفحة يعيد شاشة الدخول — وهو
// عبثٌ يوميّ لعضوٍ يعمل ساعات، ويزداد سوءاً على الموبايل حيث يُعاد تحميل
// التبويب من تلقائه حين ينقص الذاكرة.
//
// المحفوظ **هوية العضو لا كلماته**: `_id` والاسم والهاتف. وهذا لا يمنح
// صلاحيةً بذاته — الخادم يتحقّق في كل طلب أن المادة مُسلَّمة لهذا العضو
// (`allowSubject`)، فالمخزَّن مفتاحُ تعريفٍ لا مفتاحُ مرور.
const STORE = "employer_session_v1";

const loadSession = () => {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return null;
    const e = JSON.parse(raw);
    // نقبل ما يحمل معرّفاً فقط: نصفُ كائنٍ محفوظ يُنتج طلباتٍ بلا هوية
    return e && e._id ? e : null;
  } catch {
    return null;
  }
};

const saveSession = (employer) => {
  try {
    if (employer && employer._id) {
      localStorage.setItem(STORE, JSON.stringify(employer));
    } else {
      localStorage.removeItem(STORE);
    }
  } catch {
    // امتلاء المخزن أو حظره لا يمنع العمل — تبقى الجلسة في الذاكرة
  }
};

const authSlice = createSlice({
  name: "auth",
  initialState: {
    employer: loadSession(), // { _id, name, phone_number }
    loading: false,
    error: null,
  },
  reducers: {
    logout: (state) => {
      state.employer = null;
      state.error = null;
      saveSession(null);
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
        saveSession(action.payload);
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

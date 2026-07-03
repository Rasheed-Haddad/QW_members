import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";
const API_BASE_URL = "https://qaddha-wqdood-employers.onrender.com";

// جلب المواد المخصّصة للعضو الحالي فقط
export const fetch_exams = createAsyncThunk(
  "exams/fetchExams",
  async ({ searchTerm, employer_id }, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/employersubjects`, {
        searchTerm,
        employer_id,
      });
      return response.data;
    } catch (error) {
      if (error.response) {
        return rejectWithValue(error.response.data.message || "فشل جلب المواد");
      } else if (error.request) {
        return rejectWithValue("تأكد من اتصالك بالإنترنت");
      } else {
        return rejectWithValue("حدث خطأ غير متوقع");
      }
    }
  },
);

// حفظ تعديلات العضو: يُرسل الأسئلة فقط + الوقت المنقضي + معرّف العضو
export const update_exam = createAsyncThunk(
  "exams/updateExam",
  async (
    { _id, new_questions, new_classifications, employer_id, elapsed_seconds },
    { rejectWithValue },
  ) => {
    try {
      const response = await axios.put(`${API_BASE_URL}/updateexam`, {
        _id,
        new_questions,
        new_classifications,
        employee: true,
        employer_id,
        elapsed_seconds,
      });
      return response.data.message;
    } catch (error) {
      if (error.response) {
        return rejectWithValue(
          error.response.data.message || "فشل حفظ التعديلات",
        );
      } else if (error.request) {
        return rejectWithValue("تأكد من اتصالك بالإنترنت");
      } else {
        return rejectWithValue("حدث خطأ غير متوقع");
      }
    }
  },
);

const examsSlice = createSlice({
  name: "exams",
  initialState: {
    exams: [],
    status: "",
    error: null,
    loading: false,
  },
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // جلب المواد
      .addCase(fetch_exams.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetch_exams.fulfilled, (state, action) => {
        state.exams = action.payload;
        state.loading = false;
        state.error = null;
      })
      .addCase(fetch_exams.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // حفظ التعديلات
      .addCase(update_exam.pending, (state) => {
        state.status = "";
        state.loading = true;
        state.error = null;
      })
      .addCase(update_exam.fulfilled, (state, action) => {
        state.loading = false;
        state.status = action.payload;
        state.error = null;
      })
      .addCase(update_exam.rejected, (state, action) => {
        state.error = action.payload;
        state.loading = false;
      });
  },
});

export const { clearError } = examsSlice.actions;
export default examsSlice.reducer;

import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";
import { API_BASE_URL, PASSWORD } from "../config";

// جلب الامتحانات
export const fetch_exams = createAsyncThunk(
  "exams/fetchExams",
  async (searchTerm, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/exams`, {
        searchTerm,
        PASSWORD,
      });
      return response.data;
    } catch (error) {
      if (error.response) {
        return rejectWithValue(
          error.response.data.message || "فشل جلب الامتحانات",
        );
      } else if (error.request) {
        return rejectWithValue(error.response.data.message);
      } else {
        return rejectWithValue("حدث خطأ غير متوقع");
      }
    }
  },
);

// ─── الجلب التدريجي ──────────────────────────────────────────────────────────
// المادة الواحدة ~294 KB والقائمة تحتاج ~0.1 KB. نجلب على ثلاث درجات:
// شجرة الكليات ← أسماء مواد كلية ← مادة واحدة بالنطاق المطلوب.

/** الكليات التي بها مواد + عدد كل منها */
export const fetch_college_tree = createAsyncThunk(
  "exams/collegeTree",
  async (_, { rejectWithValue }) => {
    try {
      const r = await axios.post(`${API_BASE_URL}/exams/tree`, { PASSWORD });
      return r.data;
    } catch (e) {
      return rejectWithValue(
        e.response?.data?.message || "تعذّر جلب شجرة الكليات",
      );
    }
  },
);

/** أسماء مواد كلية واحدة — بلا أسئلة ولا ملخص ولا محاضرات */
export const fetch_exam_names = createAsyncThunk(
  "exams/names",
  async ({ college_id, searchTerm } = {}, { rejectWithValue }) => {
    try {
      // v2: الأعداد تُحسب في القاعدة عبر lectures[] — الأسئلة لم تعد
      // على مستوى المادة بعد الهجرة، فالمسار القديم يعيد أصفاراً.
      const r = await axios.post(`${API_BASE_URL}/v2/subjects`, {
        PASSWORD,
        college_id,
        searchTerm,
      });
      return r.data;
    } catch (e) {
      return rejectWithValue(e.response?.data?.message || "تعذّر جلب المواد");
    }
  },
);

/** مادة واحدة بنطاق: full | meta | lectures | lecture | part.
 *  الرد يُدمج في state.exams حتى تجده الشاشات التي تبحث بالمعرّف. */
export const fetch_one_subject = createAsyncThunk(
  "exams/oneSubject",
  async ({ _id, scope = "full", lecture_id, part }, { rejectWithValue }) => {
    try {
      const r = await axios.post(`${API_BASE_URL}/getonesubject`, {
        _id,
        scope,
        lecture_id,
        part,
      });
      return { scope, data: r.data };
    } catch (e) {
      return rejectWithValue(e.response?.data?.message || "تعذّر جلب المادة");
    }
  },
);

/** حفظ شريحة واحدة من محاضرة واحدة.
 *  لا يمرّ بـ/updateexam عمداً: ذاك يكتب المادة كاملةً ويمسّ محاسبة الأرباح
 *  والمشتركين، وتعديل بطاقة فلاش لا يجوز أن يقترب من أيّهما. */
export const save_lecture_part = createAsyncThunk(
  "exams/saveLecturePart",
  async ({ _id, lecture_id, part, payload }, { rejectWithValue }) => {
    try {
      const r = await axios.put(`${API_BASE_URL}/exams/save-part`, {
        PASSWORD,
        _id,
        lecture_id,
        part,
        payload,
      });
      return { _id, lecture_id, part, data: r.data };
    } catch (e) {
      // 409 = عدّل أحدٌ المادة أثناء التعديل. الرسالة من الخادم تشرح ما يُفعل،
      // فنمرّرها كما هي بدل رسالة عامة لا تُرشد إلى شيء.
      return rejectWithValue(
        e.response?.data?.message ||
          (e.response?.status === 409
            ? "تغيّرت المادة أثناء تعديلك — أعد الفتح"
            : "تعذّر الحفظ"),
      );
    }
  },
);

// إضافة امتحان
export const add_exam = createAsyncThunk(
  "exams/addExam",
  async (new_exam, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/addexam`, new_exam);
      return response.data;
    } catch (error) {
      if (error.response) {
        return rejectWithValue(
          error.response.data.message || "فشل إضافة الامتحان",
        );
      } else if (error.request) {
        return rejectWithValue("تأكد من اتصالك بالإنترنت");
      } else {
        return rejectWithValue("حدث خطأ غير متوقع");
      }
    }
  },
);

// تحديث امتحان
export const update_exam = createAsyncThunk(
  "exams/updateExam",
  async (
    {
      _id,
      new_name,
      new_info,
      new_price,
      new_price_moadal,
      new_available_to,
    },
    { rejectWithValue },
  ) => {
    try {
      const response = await axios.put(`${API_BASE_URL}/updateexam`, {
        _id: _id,
        new_name: new_name,
        new_info: new_info,
        new_price: new_price,
        new_price_moadal: new_price_moadal,
        new_available_to: new_available_to,
        PASSWORD,
      });
      return response.data.message;
    } catch (error) {
      if (error.response) {
        return rejectWithValue(
          error.response.data.message || "فشل تحديث الامتحان",
        );
      } else if (error.request) {
        return rejectWithValue("تأكد من اتصالك بالإنترنت");
      } else {
        return rejectWithValue("حدث خطأ غير متوقع");
      }
    }
  },
);

// حذف امتحان
export const delete_exam = createAsyncThunk(
  "exams/deleteExam",
  async (exam_id, { rejectWithValue }) => {
    try {
      await axios.delete(`${API_BASE_URL}/deleteexam`, {
        data: {
          exam_id,
          PASSWORD,
        },
      });
      return exam_id;
    } catch (error) {
      if (error.response) {
        return rejectWithValue(
          error.response.data.message || "فشل حذف الامتحان",
        );
      } else if (error.request) {
        return rejectWithValue("تأكد من اتصالك بالإنترنت");
      } else {
        return rejectWithValue("حدث خطأ غير متوقع");
      }
    }
  },
);

export const add_student_to_exam = createAsyncThunk(
  "exam/addstudent",
  async ({ STUDENT_ID, EXAM_ID, is_free, is_moadal }, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/addstudenttoexam`, {
        STUDENT_ID,
        EXAM_ID,
        is_free,
        is_moadal,
      });
      return response.data;
    } catch (error) {
      if (error.response) {
        return rejectWithValue(
          error.response.data.message || "فشل إضافة الطالب",
        );
      } else if (error.request) {
        return rejectWithValue("تأكد من اتصالك بالإنترنت");
      } else {
        return rejectWithValue("حدث خطأ غير متوقع");
      }
    }
  },
);

export const set_price_for_question = createAsyncThunk(
  "exam/setprice",
  async ({ _id, new_price }, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/priceforquestion`, {
        _id,
        new_price,
      });
      return response.data;
    } catch (error) {
      if (error.response) {
        return rejectWithValue(
          error.response.data.message || "فشل تحديث السعر",
        );
      } else if (error.request) {
        return rejectWithValue("تأكد من اتصالك بالإنترنت");
      } else {
        return rejectWithValue("حدث خطأ غير متوقع");
      }
    }
  },
);

// ─── كيان المحاضرة (خطة «معدل») ──────────────────────────────────────────────

// حفظ محاضرات مادة (استبدال كامل + روابط الملخص)
export const update_lectures = createAsyncThunk(
  "exams/updateLectures",
  async ({ _id, lectures, summary_links }, { rejectWithValue }) => {
    try {
      const response = await axios.put(`${API_BASE_URL}/updatelectures`, {
        _id,
        lectures,
        summary_links,
        PASSWORD,
      });
      return { _id, ...response.data };
    } catch (error) {
      if (error.response) {
        return rejectWithValue(
          error.response.data.message || "فشل حفظ المحاضرات",
        );
      } else if (error.request) {
        return rejectWithValue("تأكد من اتصالك بالإنترنت");
      } else {
        return rejectWithValue("حدث خطأ غير متوقع");
      }
    }
  },
);

// قائمة نصوص المقررات المتاحة للربط (بلا النص الكامل)
export const fetch_lecture_texts = createAsyncThunk(
  "exams/fetchLectureTexts",
  async (search, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/lecturetexts`, {
        search: search || "",
        PASSWORD,
      });
      return response.data;
    } catch (error) {
      if (error.response) {
        return rejectWithValue(
          error.response.data.message || "فشل جلب نصوص المقررات",
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
    lecture_texts: [],
    lecture_texts_loading: false,
    // ── الجلب التدريجي ──
    college_tree: [], // [{college_id, count}]
    tree_loading: false,
    names_loading: false,
    // المواد التي جُلبت كاملةً — الشاشات تتحقق منها قبل السماح بالحفظ
    full_loaded: {},
    // الكلية التي تخصّها أسماء المواد في `exams` الآن — بها تعرف شاشة
    // المواد أن ما في المخزن هو ما تريده فلا تطلبه ثانيةً
    names_college_id: null,
    // حال شاشة المواد تبقى هنا لا في المكوّن: الدخول إلى مساحة عمل مادة
    // يفكّ الشاشة، والرجوع كان يعيدها إلى «اختر الجامعة» من أوّلها.
    list_view: { universityId: null, collegeId: null, searchTerm: "", scrollY: 0 },
  },
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    set_list_view: (state, action) => {
      state.list_view = { ...state.list_view, ...action.payload };
    },
    set_new_data_of_exam: (state, action) => {
      const examIndex = state.exams.findIndex(
        (exam) => exam._id == action.payload._id,
      );
      if (examIndex !== -1) {
        state.exams[examIndex] = {
          ...state.exams[examIndex],
          ...action.payload.exam,
        };
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // ── الجلب التدريجي ──
      .addCase(fetch_college_tree.pending, (state) => {
        state.tree_loading = true;
        state.error = null;
      })
      .addCase(fetch_college_tree.fulfilled, (state, action) => {
        state.tree_loading = false;
        state.college_tree = action.payload.colleges || [];
      })
      .addCase(fetch_college_tree.rejected, (state, action) => {
        state.tree_loading = false;
        state.error = action.payload;
      })

      .addCase(fetch_exam_names.pending, (state) => {
        state.names_loading = true;
        state.error = null;
      })
      .addCase(fetch_exam_names.fulfilled, (state, action) => {
        state.names_loading = false;
        // الأسماء تحلّ محلّ القائمة المعروضة، لكنها **خفيفة**: لا تحمل
        // أسئلة ولا ملخصاً. لذلك نُسقط عنها علامة «مُحمَّلة كاملةً»
        // حتى لا يُفتح محرّر على سجلّ ناقص فيمحو ما لم يُرسَل.
        state.exams = action.payload.exams || [];
        state.full_loaded = {};
        state.names_college_id =
          action.meta.arg?.college_id != null
            ? String(action.meta.arg.college_id)
            : null;
      })
      .addCase(fetch_exam_names.rejected, (state, action) => {
        state.names_loading = false;
        state.names_college_id = null;
        state.error = action.payload;
      })

      .addCase(fetch_one_subject.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetch_one_subject.fulfilled, (state, action) => {
        state.loading = false;
        const { scope, data } = action.payload;
        if (!data?._id) return;
        const id = String(data._id);
        const i = state.exams.findIndex((e) => String(e._id) === id);

        // النطاقات الجزئية تُعيد أشكالاً مختلفة عن شكل المادة:
        //   scope="lecture" → summary كائنٌ واحد لا مصفوفة،
        //                     و questions مصفوفة {index, question}.
        // دمجُها في قائمة المواد كان يستبدل مصفوفاتِ المادة بأشكالٍ أخرى،
        // فينهار كل من يقرأها لاحقاً بـ«.map is not a function».
        // لذلك: هذه الحقول لا تُدمج إلا من نطاقٍ يُعيد شكل المادة نفسه.
        const SHAPED = ["summary", "questions", "lectures"];
        const merged = { ...data };
        if (scope !== "full" && scope !== "meta") {
          SHAPED.forEach((k) => delete merged[k]);
        } else {
          // حتى في «كاملة» نتحقّق من الشكل: وثيقةٌ قديمة قد تحمل summary
          // كائناً أو null، والمخطط يجعلها null افتراضياً.
          SHAPED.forEach((k) => {
            if (k in merged && !Array.isArray(merged[k])) merged[k] = [];
          });
        }

        // دمج لا استبدال: النطاق الجزئي يضيف حقولاً ولا يمحو ما سبقه
        if (i === -1) state.exams.push(merged);
        else state.exams[i] = { ...state.exams[i], ...merged };
        // «كاملة» وحدها تسمح بالحفظ الشامل
        if (scope === "full") state.full_loaded[id] = true;
      })
      .addCase(fetch_one_subject.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // جلب الامتحانات
      .addCase(fetch_exams.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetch_exams.fulfilled, (state, action) => {
        state.exams = action.payload;
        state.names_college_id = null; // كل المواد، لا كلية بعينها
        state.loading = false;
        state.error = null;
        // المسار القديم يجلب الوثائق كاملة — نعلّمها كذلك حتى لا يمنع
        // حارسُ الحفظ الجديد العملَ على من يستعمل هذا المسار.
        state.full_loaded = {};
        (action.payload || []).forEach((e) => {
          if (e?._id) state.full_loaded[String(e._id)] = true;
        });
      })
      .addCase(fetch_exams.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // إضافة امتحان
      .addCase(add_exam.pending, (state) => {
        state.error = null;
        state.loading = true;
      })
      .addCase(add_exam.fulfilled, (state, action) => {
        state.loading = false;
        state.exams.push(action.payload);
        state.error = null;
      })
      .addCase(add_exam.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // تحديث امتحان
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
      })

      // حذف امتحان
      .addCase(delete_exam.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(delete_exam.fulfilled, (state, action) => {
        state.loading = false;
        state.exams = state.exams.filter((exam) => exam.ID !== action.payload);
        state.error = null;
      })
      .addCase(delete_exam.rejected, (state, action) => {
        state.error = action.payload;
        state.loading = false;
      })
      .addCase(add_student_to_exam.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(add_student_to_exam.rejected, (state, action) => {
        state.error = action.payload;
        state.loading = false;
      })
      .addCase(add_student_to_exam.fulfilled, (state, action) => {
        state.loading = false;
        state.status = action.payload;
      })
      .addCase(set_price_for_question.pending, (state) => {
        state.error = null;
        state.loading = true;
      })
      .addCase(set_price_for_question.rejected, (state, action) => {
        state.error = action.payload;
        state.loading = false;
      })
      .addCase(set_price_for_question.fulfilled, (state, action) => {
        state.loading = false;
        state.error = null;
        state.status = action.payload;
      })

      // حفظ المحاضرات — تحديث نسخة المادة في المخزن مباشرة
      .addCase(update_lectures.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(update_lectures.fulfilled, (state, action) => {
        state.loading = false;
        state.status = action.payload.message;
        const examIndex = state.exams.findIndex(
          (exam) => exam._id === action.payload._id,
        );
        if (examIndex !== -1) {
          const prev = state.exams[examIndex];
          // نُزامن ربط الملخص مع ما استقرّ في القاعدة. بدونه تبقى الواجهة
          // على حالة قديمة فتُظهر ملخصات مرتبطة وهي ليست كذلك (أو العكس).
          const meta = action.payload.summary_meta;
          const summary =
            Array.isArray(meta) && Array.isArray(prev.summary)
              ? prev.summary.map((s, i) => ({
                  ...s,
                  meta: { ...(s.meta || {}), ...(meta[i] || {}) },
                }))
              : prev.summary;
          state.exams[examIndex] = {
            ...prev,
            summary,
            lectures: action.payload.lectures,
            moadal_available: action.payload.moadal_available,
          };
        }
      })
      .addCase(update_lectures.rejected, (state, action) => {
        state.error = action.payload;
        state.loading = false;
      })

      // نصوص المقررات المتاحة للربط
      .addCase(fetch_lecture_texts.pending, (state) => {
        state.lecture_texts_loading = true;
      })
      .addCase(fetch_lecture_texts.fulfilled, (state, action) => {
        state.lecture_texts = action.payload;
        state.lecture_texts_loading = false;
      })
      .addCase(fetch_lecture_texts.rejected, (state, action) => {
        state.lecture_texts_loading = false;
        state.error = action.payload;
      });
  },
});

export const { clearError, set_new_data_of_exam, set_list_view } =
  examsSlice.actions;
export default examsSlice.reducer;

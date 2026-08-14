import { useEffect, useState, useRef, useCallback, useMemo, memo } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  update_exam,
  add_exam,
  fetch_one_subject,
} from "../../store/examsSlice";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  Plus,
  ArrowUp,
  ArrowDown,
  Move,
  Download,
  Cloud,
  CloudOff,
  X,
  Layers,
} from "lucide-react";
import LectureLinkPanel from "./LectureLinkPanel"; // ← جديد

// ─── تطبيع عربي للبحث ────────────────────────────────────────────────────────
// من يكتب «الاسنان» يقصد «الأسنان»، ومن يكتب «مسؤول» يقصد «مسئول».
// بحثٌ حرفيّ يفشل في كليهما، فنُسقط التشكيل ونوحّد الهمزات والتاء المربوطة.
const normAr = (s) =>
  String(s == null ? "" : s)
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "") // تشكيل وتطويل
    .replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627") // أ إ آ ٱ ← ا
    .replace(/\u0649/g, "\u064A") // ى ← ي
    .replace(/\u0629/g, "\u0647") // ة ← ه
    .replace(/[\u0624\u0626]/g, "\u0621") // ؤ ئ ← ء
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// ─── helper: extract lecture title from a summary JSON object ────────────────
const getSummaryTitle = (obj) =>
  obj?.meta?.lecture_title || obj?.lecture_title || obj?.title || null;

// ─── ModeSwitch ────────────────────────────────────────────────────────────────


// ─── BasicFieldsSection ────────────────────────────────────────────────────────

const BasicFieldsSection = memo(({ formData, handleChange, isEditing }) => {
  return (
    <div className="gap-3 bg-white p-4 rounded-lg border border-gray-200">
      {[
        { label: "اسم المادة", name: "name" },
        { label: "رمز الكلية", name: "college_id" },
        { label: "سعر خطة ترفيع", name: "price" },
        { label: "سعر خطة معدل", name: "price_moadal" },
      ].map((field) => (
        <div key={field.name}>
          <span className="text-xs mb-1 text-gray-600">{field.label}</span>
          <input
            value={formData[field.name]?.toString() || ""}
            onChange={(e) => handleChange(field.name, e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg text-sm bg-white"
          />
        </div>
      ))}

      {isEditing && (
        <div>
          <span className="text-xs mb-1 text-gray-600">
            الطلاب المسجلين على المادة
          </span>
          <textarea
            style={{ direction: "ltr" }}
            value={formData.available_to.toString()}
            onChange={(e) => handleChange("available_to", e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg text-sm bg-white"
            rows={3}
          />
        </div>
      )}

      <div>
        <span className="text-xs mb-1 text-gray-600">وصف المادة</span>
        <textarea
          value={formData.info}
          onChange={(e) => handleChange("info", e.target.value)}
          className="w-full border border-gray-300 p-3 rounded-lg text-sm bg-white"
          rows={3}
        />
      </div>
    </div>
  );
});

// ─── ExamEditor ────────────────────────────────────────────────────────────────

const ExamEditor = () => {
  const navigate = useNavigate();
  const params = useParams();
  const examId = params.id || params.examId || null;

  const dispatch = useDispatch();
  const { exams, loading, full_loaded } = useSelector(
    (state) => state.exams,
  );

  const [isSaved, setIsSaved] = useState(true);
  const autoSaveTimeoutRef = useRef(null);
  const [showSortModal, setShowSortModal] = useState(false);

  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pastedText, setPastedText] = useState("");

  const examToEdit = useMemo(() => {
    if (!examId || !exams) return null;
    if (Array.isArray(exams))
      return exams.find((e) => e._id === examId) || null;
    return exams[examId] || null;
  }, [exams, examId]);

  // النية تُشتق من المسار لا من وجود الكائن في الذاكرة.
  // `Boolean(examToEdit)` كان يعني: مادة لم تُجلب بعد ⇒ المحرّر يظنّ نفسه
  // في وضع «إنشاء» صامتاً، فيُنشئ مادة مكرّرة بدل تعديل القائمة.
  // هذا الفرق حاسم قبل تحويل الجلب إلى تدريجي (حيث الغياب هو الأصل).
  const isEditing = Boolean(examId);
  // المادة مطلوبة للتعديل ولم تصل بعد ⇒ لا نعرض نموذجاً ولا نسمح بحفظ
  const isLoadingSubject = isEditing && !examToEdit;

  // المحرّر يجلب مادته بنفسه.
  // سابقاً كان يعتمد كلياً على وجودها في الحالة من جلبٍ شامل سابق —
  // وهو ما يسقط مع الجلب التدريجي (وعند تحديث الصفحة بـF5 أصلاً).
  const isFullyLoaded = Boolean(examId && full_loaded?.[String(examId)]);
  const askedRef = useRef(null);
  useEffect(() => {
    if (!examId || isFullyLoaded) return;
    if (askedRef.current === examId) return; // طلب واحد لكل مادة
    askedRef.current = examId;
    dispatch(fetch_one_subject({ _id: examId, scope: "full" }));
  }, [examId, isFullyLoaded, dispatch]);

  const DRAFT_STORAGE_KEY = "exam_draft_";
  const draftKey = examId
    ? `${DRAFT_STORAGE_KEY}${examId}`
    : `${DRAFT_STORAGE_KEY}new`;

  const [formData, setFormData] = useState({
    name: "",
    college_id: "",
    info: "",
    available_to: [],
    price: "",
    price_moadal: "",
    questions: [
      { question: "", options: ["", "", "", ""], answer: 0, lecture: "" },
    ],
    summary: [],
  });

  const [moveToPosition, setMoveToPosition] = useState({});
  const [showSuggestions, setShowSuggestions] = useState(null);
  const [qSearch, setQSearch] = useState("");
  const [lectureOrder, setLectureOrder] = useState([]);

  // Load draft on mount
  useEffect(() => {
    const loadDraft = () => {
      try {
        const savedDraft = localStorage.getItem(draftKey);
        if (savedDraft) {
          const shouldRestore = window.confirm(
            "مسودة محفوظة\nوجدنا مسودة محفوظة من جلسة سابقة. هل تريد استعادتها؟",
          );
          if (shouldRestore) {
            const draft = JSON.parse(savedDraft);
            setFormData(draft);
          } else {
            localStorage.removeItem(draftKey);
            if (examToEdit) {
              setFormData({
                ...examToEdit,
                available_to: Array.isArray(examToEdit.available_to)
                  ? (Array.isArray(examToEdit.available_to) ? examToEdit.available_to : []).join(", ")
                  : examToEdit.available_to,
              });
            }
          }
        } else if (examToEdit) {
          setFormData({
            ...examToEdit,
            available_to: Array.isArray(examToEdit.available_to)
              ? (Array.isArray(examToEdit.available_to) ? examToEdit.available_to : []).join(", ")
              : examToEdit.available_to,
          });
        }
      } catch (error) {
        console.error("Error loading draft:", error);
      }
    };
    loadDraft();
  }, [examToEdit, draftKey]);

  // Auto-save every 5 seconds
  useEffect(() => {
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    autoSaveTimeoutRef.current = setTimeout(() => saveDraft(), 5000);
    return () => {
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    };
  }, [formData]);

  const saveDraft = () => {
    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({ ...formData, savedAt: new Date().toISOString() }),
      );
      setIsSaved(true);
    } catch (error) {
      console.error("Error saving draft:", error);
      setIsSaved(false);
    }
  };

  const deleteDraft = () => {
    try {
      localStorage.removeItem(draftKey);
    } catch (error) {
      console.error(error);
    }
  };

  const allLectures = useMemo(() => {
    // الأسئلة لم تعد تُحمَّل في هذا المحرّر (صارت داخل المحاضرات)، فالحقل
    // قد يكون undefined — والقراءة منه مباشرةً تُسقط الشاشة كلها.
    const lectures = (Array.isArray(formData.questions) ? formData.questions : [])
      .map((q) => q.lecture)
      .filter((l) => l && l.trim() !== "");
    return Array.from(new Set(lectures));
  }, [formData.questions]);

  // الأسئلة المعروضة مع فهرسها الأصلي.
  // التصفية تغيّر ما يُرى لا ما هو مخزَّن: كل زر (حذف، نقل، تعديل، إضافة بعده)
  // يستقبل الفهرس الحقيقي، فالبحث لا يستطيع أن يحذف السؤال الخطأ.
  const visibleQuestions = useMemo(() => {
    const all = (Array.isArray(formData.questions) ? formData.questions : []).map((question, originalIndex) => ({
      question,
      originalIndex,
    }));
    const terms = normAr(qSearch).split(" ").filter(Boolean);
    if (terms.length === 0) return all;
    return all.filter(({ question: q }) => {
      const hay = normAr(
        `${q?.question || ""} ${(q?.options || []).join(" ")}`,
      );
      // كل الكلمات مطلوبة: «سرطان جلد» تجد «سرطان الجلد»
      return terms.every((t) => hay.includes(t));
    });
  }, [formData.questions, qSearch]);

  const handleChange = useCallback((name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setIsSaved(false);
  }, []);

  // ─── Rename callbacks for LectureLinkPanel ────────────────────────────────

  /**
   * Renames oldName → newName inside formData.summary
   * Works by finding the right key (meta.lecture_title / lecture_title / title)
   * and updating it.
   */
  const handleRenameInSummary = useCallback((oldName, newName) => {
    setFormData((prev) => {
      const updatedSummary = (Array.isArray(prev.summary) ? prev.summary : []).map((lecture) => {
        const title = getSummaryTitle(lecture);
        if (title !== oldName) return lecture;

        // Deep-clone and update whichever key holds the title
        const updated = JSON.parse(JSON.stringify(lecture));
        if (updated.meta?.lecture_title !== undefined) {
          updated.meta.lecture_title = newName;
        } else if (updated.lecture_title !== undefined) {
          updated.lecture_title = newName;
        } else if (updated.title !== undefined) {
          updated.title = newName;
        }
        return updated;
      });
      return { ...prev, summary: updatedSummary };
    });
    setIsSaved(false);
  }, []);

  /**
   * Renames oldName → newName inside ALL questions that have lecture === oldName
   */
  const handleRenameInQuestions = useCallback((oldName, newName) => {
    setFormData((prev) => {
      const updatedQuestions = (Array.isArray(prev.questions) ? prev.questions : []).map((q) =>
        q.lecture?.trim() === oldName ? { ...q, lecture: newName } : q,
      );
      return { ...prev, questions: updatedQuestions };
    });
    setIsSaved(false);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────

  const handleQuestionChange = useCallback((index, field, value) => {
    setFormData((prev) => {
      const updatedQuestions = [...prev.questions];
      updatedQuestions[index] = { ...updatedQuestions[index], [field]: value };
      return { ...prev, questions: updatedQuestions };
    });
    setIsSaved(false);
  }, []);

  const handleOptionChange = useCallback(
    (questionIndex, optionIndex, value) => {
      setFormData((prev) => {
        const updatedQuestions = [...prev.questions];
        const updatedOptions = [...updatedQuestions[questionIndex].options];
        updatedOptions[optionIndex] = value;
        updatedQuestions[questionIndex] = {
          ...updatedQuestions[questionIndex],
          options: updatedOptions,
        };
        return { ...prev, questions: updatedQuestions };
      });
      setIsSaved(false);
    },
    [],
  );

  const handleCorrectOptionChange = useCallback((questionIndex, value) => {
    setFormData((prev) => {
      const updatedQuestions = [...prev.questions];
      updatedQuestions[questionIndex] = {
        ...updatedQuestions[questionIndex],
        answer: value,
      };
      return { ...prev, questions: updatedQuestions };
    });
    setIsSaved(false);
  }, []);

  const addQuestion = () => {
    setQSearch(""); // السؤال الجديد فارغ فلا يطابق أي بحث — نكشفه بدل أن يختفي
    setFormData((prev) => ({
      ...prev,
      questions: [
        ...prev.questions,
        { question: "", options: ["", "", "", ""], answer: 0, lecture: "" },
      ],
    }));
    setIsSaved(false);
  };

  const addQuestionAfter = (index) => {
    setQSearch("");
    setFormData((prev) => {
      const newQuestions = [...prev.questions];
      newQuestions.splice(index + 1, 0, {
        question: "",
        options: ["", "", "", ""],
        answer: 0,
        lecture: "",
      });
      return { ...prev, questions: newQuestions };
    });
    setIsSaved(false);
  };

  const removeQuestion = (index) => {
    if ((Array.isArray(formData.questions) ? formData.questions : []).length <= 1) {
      alert("يجب أن يحتوي المادة على سؤال واحد على الأقل");
      return;
    }
    setFormData((prev) => ({
      ...prev,
      questions: (Array.isArray(prev.questions) ? prev.questions : []).filter((_, i) => i !== index),
    }));
    setIsSaved(false);
  };

  const moveQuestionUp = (index) => {
    if (index === 0) return;
    setFormData((prev) => {
      const q = [...prev.questions];
      [q[index - 1], q[index]] = [q[index], q[index - 1]];
      return { ...prev, questions: q };
    });
    setIsSaved(false);
  };

  const moveQuestionDown = (index) => {
    if (index === (Array.isArray(formData.questions) ? formData.questions : []).length - 1) return;
    setFormData((prev) => {
      const q = [...prev.questions];
      [q[index], q[index + 1]] = [q[index + 1], q[index]];
      return { ...prev, questions: q };
    });
    setIsSaved(false);
  };

  const moveQuestionToPosition = (currentIndex, newPosition) => {
    const targetIndex = parseInt(newPosition) - 1;
    if (
      isNaN(targetIndex) ||
      targetIndex < 0 ||
      targetIndex >= (Array.isArray(formData.questions) ? formData.questions : []).length
    ) {
      alert(`الرجاء إدخال رقم صحيح بين 1 و ${(Array.isArray(formData.questions) ? formData.questions : []).length}`);
      return;
    }
    if (currentIndex === targetIndex) return;
    setFormData((prev) => {
      const q = [...prev.questions];
      const [moved] = q.splice(currentIndex, 1);
      q.splice(targetIndex, 0, moved);
      return { ...prev, questions: q };
    });
    setMoveToPosition((prev) => ({ ...prev, [currentIndex]: "" }));
    setIsSaved(false);
  };

  const openSortModal = () => {
    setLectureOrder([...allLectures]);
    setShowSortModal(true);
  };
  const moveLectureUp = (i) => {
    if (i === 0) return;
    setLectureOrder((p) => {
      const a = [...p];
      [a[i - 1], a[i]] = [a[i], a[i - 1]];
      return a;
    });
  };
  const moveLectureDown = (i) => {
    if (i === lectureOrder.length - 1) return;
    setLectureOrder((p) => {
      const a = [...p];
      [a[i], a[i + 1]] = [a[i + 1], a[i]];
      return a;
    });
  };
  const applySortByLecture = () => {
    setFormData((prev) => {
      const byLecture = {};
      const noLecture = [];
      (Array.isArray(prev.questions) ? prev.questions : []).forEach((q) => {
        if (q.lecture?.trim()) {
          (byLecture[q.lecture] ??= []).push(q);
        } else noLecture.push(q);
      });
      const sorted = [];
      lectureOrder.forEach((l) => {
        if (byLecture[l]) sorted.push(...byLecture[l]);
      });
      sorted.push(...noLecture);
      return { ...prev, questions: sorted };
    });
    setShowSortModal(false);
    setIsSaved(false);
    alert("✅ تم ترتيب الأسئلة حسب المحاضرة بنجاح");
  };

  // ─── معالجة لصق الأسئلة ─────────────────────────────────────────────────────

  const parsePastedQuestions = useCallback((text) => {
    const lines = text.split("\n").map((l) => l.trim());
    const questions = [];
    let currentLecture = "";
    let currentBlock = [];

    const flushBlock = () => {
      if (currentBlock.length === 0) return;

      if (currentBlock.length === 6) {
        currentLecture = currentBlock[0];
        const qText = currentBlock[1];
        const opts = currentBlock.slice(2, 6);
        const answerIdx = opts.findIndex((o) => /✅|☑️|✓|✔/u.test(o));
        const cleanOpts = opts.map((o) => o.replace(/✅|☑️|✓|✔/gu, "").trim());
        questions.push({
          lecture: currentLecture,
          question: qText,
          options: cleanOpts.length === 4 ? cleanOpts : ["", "", "", ""],
          answer: answerIdx >= 0 ? answerIdx + 1 : 1,
        });
      } else if (currentBlock.length === 5) {
        const qText = currentBlock[0];
        const opts = currentBlock.slice(1, 5);
        const answerIdx = opts.findIndex((o) => /✅|☑️|✓|✔/u.test(o));
        const cleanOpts = opts.map((o) => o.replace(/✅|☑️|✓|✔/gu, "").trim());
        questions.push({
          lecture: currentLecture,
          question: qText,
          options: cleanOpts.length === 4 ? cleanOpts : ["", "", "", ""],
          answer: answerIdx >= 0 ? answerIdx + 1 : 1,
        });
      } else if (
        currentBlock.length === 1 &&
        !/✅|☑️|✓|✔/u.test(currentBlock[0])
      ) {
        currentLecture = currentBlock[0];
      }

      currentBlock = [];
    };

    for (const line of lines) {
      if (line === "") {
        flushBlock();
      } else {
        currentBlock.push(line);
      }
    }
    flushBlock();

    return questions;
  }, []);

  const handlePasteImport = useCallback(() => {
    const parsed = parsePastedQuestions(pastedText);
    if (parsed.length === 0) {
      alert(
        "❌ لم يتم العثور على أسئلة بالتنسيق المطلوب.\n\nتأكد من أن كل سؤال يحتوي على 5 أسطر (سؤال + 4 خيارات) وأن اسم المحاضرة يأخذ سطرًا إضافيًا في البداية.",
      );
      return;
    }
    setFormData((prev) => ({
      ...prev,
      questions: [...prev.questions, ...parsed],
    }));
    setPastedText("");
    setShowPasteModal(false);
    setIsSaved(false);
    alert(`✅ تم استيراد ${parsed.length} سؤال بنجاح`);
  }, [pastedText, parsePastedQuestions]);

  const handleSubmit = async () => {
    // حارس فقدان البيانات: الحفظ من نموذج بُني على مادة لم تكتمل يمحو
    // الأسئلة والمشتركين، لأن Update_Exam يُسنِد المصفوفات بلا شرط.
    if (isLoadingSubject) {
      alert("لم تكتمل بيانات المادة بعد — انتظر التحميل قبل الحفظ");
      return;
    }
    if (!formData.name || !formData.info) {
      alert("يرجى ملء جميع الحقول المطلوبة");
      return;
    }
    const invalid = (Array.isArray(formData.questions) ? formData.questions : []).filter(
      (q) => !q.question || (Array.isArray(q.options) ? q.options : []).some((o) => !o),
    );
    if (invalid.length > 0) {
      alert("يرجى ملء جميع الأسئلة والخيارات");
      return;
    }
    try {
      const payload = {
        name: formData.name,
        info: formData.info,
        questions: formData.questions,
        price: formData.price || 0,
        price_moadal: formData.price_moadal || 0,
        available_to:
          typeof formData.available_to === "string"
            ? formData.available_to.split(",").map((s) => s.trim())
            : formData.available_to,
        summary: Array.isArray(formData.summary) ? formData.summary : [],
      };
      if (isEditing) {
        await dispatch(
          update_exam({
            _id: examToEdit._id,
            new_name: payload.name,
            new_info: payload.info,
            // الأسئلة والملخص لم يعودا على مستوى المادة بعد الهجرة —
            // صارا داخل كل محاضرة. إرسالهما من هنا يُعيد بناء الحقلين
            // الميتين ويوهم بمصدرين للحقيقة. التعديل من مساحة العمل.
            new_price: payload.price,
            new_price_moadal: payload.price_moadal,
            new_available_to: payload.available_to,
          }),
        ).unwrap();
      } else {
        await dispatch(
          add_exam({
            ...payload,
            college_id: formData.college_id,
            admin_id: "6934998caad4fa6ea1e59d31",
          }),
        ).unwrap();
      }

      deleteDraft();
      alert(
        isEditing ? "✅ تم تحديث الامتحان بنجاح" : "✅ تم إنشاء المادة بنجاح",
      );
      navigate("/exams");
    } catch (error) {
      alert(
        `❌ ${error.message || error.error?.message || "حدث خطأ أثناء الإرسال"}`,
      );
    }
  };

  const exportExamAsJSON = () => {
    const data = {
      ...formData,
      available_to:
        typeof formData.available_to === "string"
          ? formData.available_to.split(",").map((s) => s.trim())
          : formData.available_to,
      exportDate: new Date().toISOString(),
      version: "1.0",
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${formData.name || "exam"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getSuggestions = useCallback(
    (val) => {
      if (!val?.trim()) return [];
      return allLectures.filter(
        (l) => l.toLowerCase().includes(val.toLowerCase()) && l !== val,
      );
    },
    [allLectures],
  );

  const renderQuestion = (question, qIndex) => {
    const suggestions =
      showSuggestions === qIndex ? getSuggestions(question.lecture) : [];
    return (
      <div
        key={qIndex}
        style={{ direction: "rtl" }}
        className="p-4 border border-gray-300 rounded-xl bg-white mx-3 mb-4 shadow-sm"
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-xl font-bold text-[#8C52FF]">
            #{qIndex + 1}
          </span>
          <button
            onClick={() => removeQuestion(qIndex)}
            className="px-3 py-1.5 bg-red-50 rounded-lg border border-red-200 hover:bg-red-100"
          >
            <span className="text-red-600 text-xs font-medium">حذف</span>
          </button>
        </div>

        <div className="mb-3 p-3 bg-blue-50 rounded-xl border border-blue-200">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="number"
              value={moveToPosition[qIndex] || ""}
              onChange={(e) =>
                setMoveToPosition((p) => ({ ...p, [qIndex]: e.target.value }))
              }
              placeholder={`1-${(Array.isArray(formData.questions) ? formData.questions : []).length}`}
              className="border border-blue-300 p-2 rounded-lg text-sm w-20 bg-white"
            />
            <button
              onClick={() =>
                moveQuestionToPosition(qIndex, moveToPosition[qIndex])
              }
              className="bg-[#8C52FF] px-3 py-2 rounded-lg flex items-center gap-1 hover:bg-purple-700"
            >
              <Move size={14} color="#ffffff" />
              <span className="text-white text-xs font-medium">نقل</span>
            </button>
            <button
              onClick={() => moveQuestionUp(qIndex)}
              disabled={qIndex === 0}
              className="p-1 disabled:opacity-50"
            >
              <ArrowUp size={24} color={qIndex === 0 ? "#d1d5db" : "#3b82f6"} />
            </button>
            <button
              onClick={() => moveQuestionDown(qIndex)}
              disabled={qIndex === (Array.isArray(formData.questions) ? formData.questions : []).length - 1}
              className="p-1 disabled:opacity-50"
            >
              <ArrowDown
                size={24}
                color={
                  qIndex === (Array.isArray(formData.questions) ? formData.questions : []).length - 1
                    ? "#d1d5db"
                    : "#3b82f6"
                }
              />
            </button>
          </div>
        </div>

        <div className="mb-3 relative">
          <input
            value={question.lecture}
            onChange={(e) => {
              handleQuestionChange(qIndex, "lecture", e.target.value);
              setShowSuggestions(e.target.value.trim() ? qIndex : null);
            }}
            onBlur={() => setTimeout(() => setShowSuggestions(null), 1000)}
            className="w-full border-2 text-base border-purple-300 bg-purple-50 p-2 rounded-xl"
            placeholder="📚 اسم المحاضرة"
          />
          {suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-purple-200 rounded-lg shadow-lg z-50 max-h-32 overflow-y-auto">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => {
                    handleQuestionChange(qIndex, "lecture", s);
                    setShowSuggestions(null);
                  }}
                  className="w-full p-3 border-b border-gray-100 text-left hover:bg-purple-50"
                >
                  <span className="text-sm text-gray-700">{s}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mb-3">
          <textarea
            value={question.question}
            onChange={(e) =>
              handleQuestionChange(qIndex, "question", e.target.value)
            }
            className="w-full border-2 border-blue-400 bg-blue-50 p-2 rounded-xl text-base font-medium"
            placeholder="❓ نص السؤال"
            rows={3}
          />
        </div>

        <div className="gap-2 mb-4 space-y-2">
          {(Array.isArray(question.options) ? question.options : []).map((option, optIndex) => (
            <div key={optIndex} className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                <span className="text-sm font-bold text-gray-600">
                  {optIndex + 1}
                </span>
              </div>
              <textarea
                value={option}
                onChange={(e) =>
                  handleOptionChange(qIndex, optIndex, e.target.value)
                }
                className="flex-1 border border-gray-300 bg-gray-50 p-2 rounded-lg text-base"
                placeholder={`الخيار ${optIndex + 1}`}
                rows={2}
              />
            </div>
          ))}
        </div>

        <div className="mb-3">
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                onClick={() => handleCorrectOptionChange(qIndex, n)}
                className={`flex-1 py-3 rounded-lg font-bold ${
                  question.answer == n
                    ? "bg-green-500 text-white"
                    : "bg-gray-200 text-gray-600"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => addQuestionAfter(qIndex)}
          className="w-full bg-green-500 px-3 py-2 rounded-lg flex items-center justify-center gap-1.5 hover:bg-green-600"
        >
          <Plus size={14} color="#ffffff" />
          <span className="text-white text-xs font-medium">إضافة سؤال هنا</span>
        </button>
      </div>
    );
  };

  // شاشة انتظار صريحة بدل نموذج فارغ.
  // النموذج الفارغ على مادة لم تصل كان يبدو «مادة بلا أسئلة»، وحفظه
  // يمحو محتواها الحقيقي — فالانتظار هنا حارس بيانات لا تجميل.
  if (isLoadingSubject) {
    return (
      <div className="flex-1 bg-gray-50 min-h-screen">
        <div style={{ direction: "rtl" }} className="p-4 space-y-4">
          <button
            onClick={() => navigate("/exams")}
            className="p-1 hover:bg-gray-200 rounded"
          >
            <ArrowRight size={24} color="#8C52FF" />
          </button>
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
            <div className="inline-block w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm text-gray-600">جارٍ تحميل المادة…</p>
            <p className="text-xs text-gray-400 mt-1">
              لا تُحفظ أي تعديلات قبل اكتمال التحميل
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-gray-50 min-h-screen">
      <div style={{ direction: "rtl" }} className="p-4 gap-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/exams")}
            className="p-1 hover:bg-gray-200 rounded"
          >
            <ArrowRight size={24} color="#8C52FF" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-gray-100 px-3 py-1 rounded-full">
              {isSaved ? (
                <Cloud size={16} color="#10b981" />
              ) : (
                <CloudOff size={16} color="#ef4444" />
              )}
              <span
                className="text-xs ml-1"
                style={{ color: isSaved ? "#10b981" : "#ef4444" }}
              >
                {isSaved ? "محفوظ" : "جاري الحفظ..."}
              </span>
            </div>
            <button
              onClick={exportExamAsJSON}
              className="bg-brand px-3 py-2 rounded-lg flex items-center gap-1.5 hover:opacity-90"
            >
              <Download size={16} color="#ffffff" />
            </button>
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={handleSubmit}
          className="bg-[#8C52FF] py-3 rounded-lg hover:bg-purple-700 disabled:opacity-50 w-full"
          disabled={loading}
        >
          <span className="text-white text-center text-base font-semibold">
            {isEditing ? "حفظ التغييرات" : "إنشاء المادة"}
          </span>
        </button>
      </div>

      <div className="py-4 space-y-4 mx-auto">
        <BasicFieldsSection
          formData={formData}
          handleChange={handleChange}
          isEditing={isEditing}
        />

        {/* ── Lecture Link Panel ── يظهر دائماً بين الـ fields والـ mode switch */}
        <LectureLinkPanel
          formData={formData}
          onRenameInSummary={handleRenameInSummary}
          onRenameInQuestions={handleRenameInQuestions}
        />

        {/* المحتوى صار داخل كل محاضرة بعد توحيد الهيكل. هذا المحرّر
            لحقول المادة وحدها — والأسئلة والملخص من مساحة العمل. */}
        <div className="mx-3 p-4 rounded-2xl bg-brand/5 border border-brand/20">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
              <Layers size={17} className="text-brand" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800">
                الأسئلة والملخص صارا داخل كل محاضرة
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                كل محتوى المحاضرة في مكان واحد: نصّ وملخص وأسئلة وبطاقات
                وتحريري — والمطابقة بمعرّف المحاضرة لا بالاسم.
              </p>
            </div>
            {isEditing && (
              <button
                type="button"
                onClick={() => navigate(`/exams/work/${examId}`)}
                className="mr-auto bg-brand text-white text-sm font-bold rounded-xl px-5 py-2.5 flex items-center gap-2 shrink-0"
              >
                <Layers size={16} /> افتح مساحة العمل
              </button>
            )}
          </div>
        </div>


      </div>

      {/* ─── Sort Modal ─────────────────────────────────────────────────────── */}
      {showSortModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div
            style={{ direction: "rtl" }}
            className="bg-white rounded-xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">
                ترتيب المحاضرات
              </h3>
              <button
                onClick={() => setShowSortModal(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X size={20} color="#666" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              رتب المحاضرات بالترتيب الذي تريده.
            </p>
            <div className="space-y-2">
              {lectureOrder.map((lecture, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => moveLectureUp(index)}
                      disabled={index === 0}
                      className="p-1 disabled:opacity-30"
                    >
                      <ArrowUp
                        size={16}
                        color={index === 0 ? "#d1d5db" : "#3b82f6"}
                      />
                    </button>
                    <button
                      onClick={() => moveLectureDown(index)}
                      disabled={index === lectureOrder.length - 1}
                      className="p-1 disabled:opacity-30"
                    >
                      <ArrowDown
                        size={16}
                        color={
                          index === lectureOrder.length - 1
                            ? "#d1d5db"
                            : "#3b82f6"
                        }
                      />
                    </button>
                  </div>
                  <div className="flex-1">
                    <span className="text-sm font-medium text-gray-700">
                      {lecture}
                    </span>
                  </div>
                  <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                    <span className="text-xs font-bold text-purple-600">
                      {index + 1}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowSortModal(false)}
                className="flex-1 bg-gray-200 py-2 rounded-lg hover:bg-gray-300"
              >
                <span className="text-gray-700 font-medium">إلغاء</span>
              </button>
              <button
                onClick={applySortByLecture}
                className="flex-1 bg-blue-500 py-2 rounded-lg hover:bg-blue-600"
              >
                <span className="text-white font-medium">تطبيق الترتيب</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Paste Questions Modal ────────────────────────────────────────── */}
      {showPasteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div
            style={{ direction: "rtl" }}
            className="bg-white rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">
                📋 لصق أسئلة من النص
              </h3>
              <button
                onClick={() => {
                  setShowPasteModal(false);
                  setPastedText("");
                }}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X size={20} color="#666" />
              </button>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-sm text-yellow-800 leading-relaxed">
              <p className="font-semibold mb-1">التنسيق المطلوب:</p>
              <ul className="list-disc pr-4 space-y-1">
                <li>كل سؤال = 5 أسطر (السؤال + 4 خيارات)</li>
                <li>
                  إذا أردت تغيير المحاضرة ضع اسمها في سطر قبل السؤال (يصبح 6
                  أسطر)
                </li>
                <li>ضع علامة ✅ بجانب الخيار الصحيح</li>
                <li>افصل بين الأسئلة بسطر فارغ</li>
              </ul>
            </div>

            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder={`اسم المحاضرة\nنص السؤال الأول\nخيار1\nخيار2✅\nخيار3\nخيار4\n\nنص السؤال الثاني\nخيار1\nخيار2\nخيار3✅\nخيار4`}
              className="w-full border border-gray-300 p-3 rounded-lg text-sm bg-white font-mono leading-7"
              rows={12}
              style={{ direction: "rtl" }}
            />

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => {
                  setShowPasteModal(false);
                  setPastedText("");
                }}
                className="flex-1 bg-gray-200 py-2.5 rounded-lg hover:bg-gray-300"
              >
                <span className="text-gray-700 font-medium">إلغاء</span>
              </button>
              <button
                onClick={handlePasteImport}
                className="flex-1 bg-indigo-600 py-2.5 rounded-lg hover:bg-indigo-700"
              >
                <span className="text-white font-medium">استيراد الأسئلة</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExamEditor;

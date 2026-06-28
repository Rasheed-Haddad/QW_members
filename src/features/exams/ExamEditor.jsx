import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { update_exam } from "../../store/examsSlice";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  Plus,
  Save,
  Cloud,
  CloudOff,
  X,
  Timer,
  Filter,
  ClipboardPaste,
} from "lucide-react";

// مدّة تبدّل الحالة من "غير محفوظ" إلى "محفوظ" (مسودة)
const AUTOSAVE_DELAY_MS = 4000;

const formatElapsed = (totalSeconds) => {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const ExamEditor = () => {
  const navigate = useNavigate();
  const params = useParams();
  const examId = params.id || params.examId || null;

  const dispatch = useDispatch();
  const { exams, loading } = useSelector((state) => state.exams);
  const employer = useSelector((state) => state.auth.employer);

  const [isSaved, setIsSaved] = useState(true);
  const autoSaveTimeoutRef = useRef(null);

  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pastedText, setPastedText] = useState("");

  // ─── التصفية حسب المحاضرة (مثل QWCP) ─────────────────────────────────────────
  const [selectedLecture, setSelectedLecture] = useState("الكل");
  const [showLectureFilter, setShowLectureFilter] = useState(false);

  // ─── عداد الوقت المنقضي ──────────────────────────────────────────────────────
  // يعدّ فقط عندما تكون الحالة "غير محفوظ"، ويتراكم حتى الضغط على حفظ.
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const elapsedIntervalRef = useRef(null);

  const examToEdit = useMemo(() => {
    if (!examId || !exams) return null;
    if (Array.isArray(exams)) return exams.find((e) => e._id === examId) || null;
    return exams[examId] || null;
  }, [exams, examId]);

  const DRAFT_STORAGE_KEY = "exam_draft_";
  const draftKey = examId
    ? `${DRAFT_STORAGE_KEY}${examId}`
    : `${DRAFT_STORAGE_KEY}new`;

  const [questions, setQuestions] = useState([
    { question: "", options: ["", "", "", ""], answer: 0, lecture: "" },
  ]);

  // تحميل الأسئلة (من مسودة محفوظة أو من المادة)
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
            setQuestions(draft.questions || []);
            return;
          }
          localStorage.removeItem(draftKey);
        }
        if (examToEdit) {
          setQuestions(
            examToEdit.questions.map((q) => ({
              ...q,
              lecture: q.lecture || "",
            })),
          );
        }
      } catch (error) {
        console.error("Error loading draft:", error);
      }
    };
    loadDraft();
  }, [examToEdit, draftKey]);

  // حفظ المسودة بعد فترة من آخر تغيير → تتبدّل الحالة إلى "محفوظ"
  useEffect(() => {
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    autoSaveTimeoutRef.current = setTimeout(() => saveDraft(), AUTOSAVE_DELAY_MS);
    return () => {
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    };
  }, [questions]);

  // العداد: يعمل فقط أثناء "غير محفوظ"
  useEffect(() => {
    if (!isSaved) {
      if (!elapsedIntervalRef.current) {
        elapsedIntervalRef.current = setInterval(() => {
          setElapsedSeconds((s) => s + 1);
        }, 1000);
      }
    } else if (elapsedIntervalRef.current) {
      clearInterval(elapsedIntervalRef.current);
      elapsedIntervalRef.current = null;
    }
    return () => {
      if (elapsedIntervalRef.current) {
        clearInterval(elapsedIntervalRef.current);
        elapsedIntervalRef.current = null;
      }
    };
  }, [isSaved]);

  const saveDraft = () => {
    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({ questions, savedAt: new Date().toISOString() }),
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

  // أي تعديل يجعل الحالة "غير محفوظ" ويبدأ العداد عند أول مرة
  const markUnsaved = useCallback(() => {
    setIsSaved(false);
  }, []);

  const allLectures = useMemo(() => {
    const lectures = questions
      .map((q) => q.lecture)
      .filter((l) => l && l.trim() !== "");
    return Array.from(new Set(lectures));
  }, [questions]);

  // إحصاء عدد الأسئلة لكل محاضرة
  const lectureStats = useMemo(() => {
    const stats = {};
    questions.forEach((q) => {
      const lecture = q.lecture || "بدون محاضرة";
      stats[lecture] = (stats[lecture] || 0) + 1;
    });
    return stats;
  }, [questions]);

  // الأسئلة المعروضة حسب التصفية (مع الاحتفاظ بالفهرس الأصلي)
  const filteredQuestions = useMemo(() => {
    return questions
      .map((q, idx) => ({ question: q, originalIndex: idx }))
      .filter(
        (item) =>
          selectedLecture === "الكل" ||
          (item.question.lecture || "بدون محاضرة") === selectedLecture,
      );
  }, [questions, selectedLecture]);

  const handleQuestionChange = useCallback(
    (index, field, value) => {
      setQuestions((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], [field]: value };
        return updated;
      });
      markUnsaved();
    },
    [markUnsaved],
  );

  const handleOptionChange = useCallback(
    (questionIndex, optionIndex, value) => {
      setQuestions((prev) => {
        const updated = [...prev];
        const updatedOptions = [...updated[questionIndex].options];
        updatedOptions[optionIndex] = value;
        updated[questionIndex] = {
          ...updated[questionIndex],
          options: updatedOptions,
        };
        return updated;
      });
      markUnsaved();
    },
    [markUnsaved],
  );

  const handleCorrectOptionChange = useCallback(
    (questionIndex, value) => {
      setQuestions((prev) => {
        const updated = [...prev];
        updated[questionIndex] = { ...updated[questionIndex], answer: value };
        return updated;
      });
      markUnsaved();
    },
    [markUnsaved],
  );

  // السؤال الجديد يرث المحاضرة المُصفّاة حالياً (مثل QWCP)
  const newQuestionTemplate = () => ({
    question: "",
    options: ["", "", "", ""],
    answer: 0,
    lecture: selectedLecture !== "الكل" ? selectedLecture : "",
  });

  const addQuestion = () => {
    setQuestions((prev) => [...prev, newQuestionTemplate()]);
    markUnsaved();
  };

  const addQuestionAfter = (index) => {
    setQuestions((prev) => {
      const updated = [...prev];
      updated.splice(index + 1, 0, newQuestionTemplate());
      return updated;
    });
    markUnsaved();
  };

  const removeQuestion = (index) => {
    if (questions.length <= 1) {
      alert("يجب أن يحتوي المادة على سؤال واحد على الأقل");
      return;
    }
    setQuestions((prev) => prev.filter((_, i) => i !== index));
    markUnsaved();
  };

  // ─── لصق الأسئلة ─────────────────────────────────────────────────────────────
  const parsePastedQuestions = useCallback((text) => {
    const lines = text.split("\n").map((l) => l.trim());
    const parsed = [];
    let currentLecture = "";
    let currentBlock = [];

    const flushBlock = () => {
      if (currentBlock.length === 0) return;
      if (currentBlock.length === 6) {
        currentLecture = currentBlock[0];
        const qText = currentBlock[1];
        const opts = currentBlock.slice(2, 6);
        const answerIdx = opts.findIndex((o) => /[✅☑️✓✔]/u.test(o));
        const cleanOpts = opts.map((o) => o.replace(/[✅☑️✓✔]/gu, "").trim());
        parsed.push({
          lecture: currentLecture,
          question: qText,
          options: cleanOpts.length === 4 ? cleanOpts : ["", "", "", ""],
          answer: answerIdx >= 0 ? answerIdx + 1 : 1,
        });
      } else if (currentBlock.length === 5) {
        const qText = currentBlock[0];
        const opts = currentBlock.slice(1, 5);
        const answerIdx = opts.findIndex((o) => /[✅☑️✓✔]/u.test(o));
        const cleanOpts = opts.map((o) => o.replace(/[✅☑️✓✔]/gu, "").trim());
        parsed.push({
          lecture: currentLecture,
          question: qText,
          options: cleanOpts.length === 4 ? cleanOpts : ["", "", "", ""],
          answer: answerIdx >= 0 ? answerIdx + 1 : 1,
        });
      } else if (
        currentBlock.length === 1 &&
        !/[✅☑️✓✔]/u.test(currentBlock[0])
      ) {
        currentLecture = currentBlock[0];
      }
      currentBlock = [];
    };

    for (const line of lines) {
      if (line === "") flushBlock();
      else currentBlock.push(line);
    }
    flushBlock();
    return parsed;
  }, []);

  const handlePasteImport = useCallback(() => {
    const parsed = parsePastedQuestions(pastedText);
    if (parsed.length === 0) {
      alert(
        "❌ لم يتم العثور على أسئلة بالتنسيق المطلوب.\n\nتأكد من أن كل سؤال يحتوي على 5 أسطر (سؤال + 4 خيارات) وأن اسم المحاضرة يأخذ سطرًا إضافيًا في البداية.",
      );
      return;
    }
    setQuestions((prev) => [...prev, ...parsed]);
    setPastedText("");
    setShowPasteModal(false);
    markUnsaved();
    alert(`✅ تم استيراد ${parsed.length} سؤال بنجاح`);
  }, [pastedText, parsePastedQuestions, markUnsaved]);

  const handleSubmit = async () => {
    if (!examToEdit) {
      alert("❌ تعذر تحديد المادة");
      return;
    }
    const invalid = questions.filter(
      (q) => !q.question || q.options.some((o) => !o),
    );
    if (invalid.length > 0) {
      alert("يرجى ملء جميع الأسئلة والخيارات");
      return;
    }

    // أوقف العداد والتقط القيمة النهائية
    if (elapsedIntervalRef.current) {
      clearInterval(elapsedIntervalRef.current);
      elapsedIntervalRef.current = null;
    }
    const finalElapsed = elapsedSeconds;

    try {
      await dispatch(
        update_exam({
          _id: examToEdit._id,
          new_questions: questions,
          employer_id: employer?._id,
          elapsed_seconds: finalElapsed,
        }),
      ).unwrap();

      deleteDraft();
      setIsSaved(true);
      setElapsedSeconds(0);
      alert("✅ تم حفظ تعديلات الأسئلة بنجاح");
      navigate("/exams");
    } catch (error) {
      alert(
        `❌ ${error?.message || error?.error?.message || error || "حدث خطأ أثناء الإرسال"}`,
      );
    }
  };

  const renderQuestion = (item) => {
    const { question, originalIndex } = item;
    const displayNumber =
      selectedLecture === "الكل"
        ? originalIndex + 1
        : filteredQuestions.findIndex(
            (f) => f.originalIndex === originalIndex,
          ) + 1;
    return (
      <div
        key={originalIndex}
        style={{ direction: "rtl" }}
        className="p-3 sm:p-4 border border-gray-300 rounded-xl bg-white mx-2 sm:mx-3 mb-3 sm:mb-4 shadow-sm"
      >
        {/* رأس السؤال: الرقم + المحاضرة (عرض فقط) + حذف */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg sm:text-xl font-bold text-[#8C52FF] shrink-0">
            #{displayNumber}
          </span>
          <div className="flex-1 min-w-0">
            <div className="w-full bg-brand/10 border border-brand/20 px-2.5 py-1.5 rounded-lg text-center">
              <span className="text-xs sm:text-sm font-bold text-brand break-words">
                📚 {question.lecture?.trim() ? question.lecture : "بدون محاضرة"}
              </span>
            </div>
          </div>
          <button
            onClick={() => removeQuestion(originalIndex)}
            className="px-2.5 sm:px-3 py-1.5 bg-red-50 rounded-lg border border-red-200 hover:bg-red-100 shrink-0"
          >
            <span className="text-red-600 text-xs font-medium">حذف</span>
          </button>
        </div>

        {/* نص السؤال */}
        <div className="mb-3">
          <textarea
            value={question.question}
            onChange={(e) =>
              handleQuestionChange(originalIndex, "question", e.target.value)
            }
            className="w-full border-2 border-blue-400 bg-blue-50 p-2 rounded-xl text-sm sm:text-base font-medium"
            placeholder="❓ نص السؤال"
            rows={3}
          />
        </div>

        {/* الخيارات */}
        <div className="gap-2 mb-4 space-y-2">
          {question.options.map((option, optIndex) => (
            <div key={optIndex} className="flex items-center gap-2">
              <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gray-200 rounded-full flex items-center justify-center shrink-0">
                <span className="text-xs sm:text-sm font-bold text-gray-600">
                  {optIndex + 1}
                </span>
              </div>
              <textarea
                value={option}
                onChange={(e) =>
                  handleOptionChange(originalIndex, optIndex, e.target.value)
                }
                className="flex-1 border border-gray-300 bg-gray-50 p-2 rounded-lg text-sm sm:text-base"
                placeholder={`الخيار ${optIndex + 1}`}
                rows={2}
              />
            </div>
          ))}
        </div>

        {/* الإجابة الصحيحة */}
        <div className="mb-3">
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                onClick={() => handleCorrectOptionChange(originalIndex, n)}
                className={`flex-1 py-2.5 sm:py-3 rounded-lg font-bold text-sm sm:text-base ${
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
          onClick={() => addQuestionAfter(originalIndex)}
          className="w-full bg-green-500 px-3 py-2 rounded-lg flex items-center justify-center gap-1.5 hover:bg-green-600"
        >
          <Plus size={14} color="#ffffff" />
          <span className="text-white text-xs font-medium">إضافة سؤال هنا</span>
        </button>
      </div>
    );
  };

  return (
    <div className="flex-1 bg-gray-50 min-h-screen">
      {/* شريط علوي ثابت */}
      <div
        style={{ direction: "rtl" }}
        className="p-3 sm:p-4 space-y-3 sm:space-y-4 sticky top-0 bg-gray-50 z-20 border-b border-gray-100"
      >
        <div className="max-w-2xl mx-auto w-full space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => navigate("/exams")}
            className="p-1.5 hover:bg-gray-200 rounded shrink-0"
          >
            <ArrowRight size={22} color="#8C52FF" />
          </button>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
            {/* عداد الوقت المنقضي */}
            <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
              <Timer size={15} color="#d97706" />
              <span className="text-xs font-bold text-amber-700">
                {formatElapsed(elapsedSeconds)}
              </span>
            </div>
            {/* حالة الحفظ */}
            <div className="flex items-center bg-gray-100 px-2.5 py-1 rounded-full">
              {isSaved ? (
                <Cloud size={15} color="#10b981" />
              ) : (
                <CloudOff size={15} color="#ef4444" />
              )}
              <span
                className="text-xs ml-1"
                style={{ color: isSaved ? "#10b981" : "#ef4444" }}
              >
                {isSaved ? "محفوظ" : "غير محفوظ"}
              </span>
            </div>
          </div>
        </div>

        {/* اسم المادة (للعرض فقط) */}
        {examToEdit && (
          <div className="bg-white border border-gray-200 rounded-lg p-2.5 sm:p-3">
            <span className="text-xs text-gray-500">المادة: </span>
            <span className="text-sm font-bold text-gray-800">
              {examToEdit.name}
            </span>
          </div>
        )}

        {/* زر الحفظ */}
        <button
          onClick={handleSubmit}
          className="bg-[#8C52FF] py-2.5 sm:py-3 rounded-lg hover:bg-purple-700 disabled:opacity-50 w-full"
          disabled={loading}
        >
          <span className="text-white text-center text-sm sm:text-base font-semibold">
            حفظ التغييرات
          </span>
        </button>
        </div>
      </div>

      {/* ── تصفية حسب المحاضرة (مثل QWCP) ── */}
      <div
        style={{ direction: "rtl" }}
        className="bg-white p-3 sm:p-4 border-b border-gray-200 mx-2 sm:mx-3 mt-3 rounded-xl border max-w-2xl lg:mx-auto"
      >
        <button
          onClick={() => setShowLectureFilter((v) => !v)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Filter size={18} color="#8C52FF" />
            <span className="text-sm sm:text-base font-semibold text-gray-800">
              تصفية حسب المحاضرة
            </span>
            {selectedLecture !== "الكل" && (
              <span className="text-xs bg-brand/10 text-brand px-2 py-0.5 rounded-full font-bold">
                {selectedLecture}
              </span>
            )}
          </div>
          <span className="text-gray-500 text-sm">
            {showLectureFilter ? "▲" : "▼"}
          </span>
        </button>
        {showLectureFilter && (
          <div className="mt-3 overflow-x-auto">
            <div className="flex flex-row gap-2 w-max pb-1">
              <button
                onClick={() => setSelectedLecture("الكل")}
                className={`px-3 sm:px-4 py-2 rounded-lg border whitespace-nowrap text-sm font-medium ${
                  selectedLecture === "الكل"
                    ? "bg-[#8C52FF] border-[#8C52FF] text-white"
                    : "bg-white border-gray-300 text-gray-700"
                }`}
              >
                الكل ({questions.length})
              </button>
              {Object.keys(lectureStats).map((l) => (
                <button
                  key={l}
                  onClick={() => setSelectedLecture(l)}
                  className={`px-3 sm:px-4 py-2 rounded-lg border whitespace-nowrap text-sm font-medium ${
                    selectedLecture === l
                      ? "bg-[#8C52FF] border-[#8C52FF] text-white"
                      : "bg-white border-gray-300 text-gray-700"
                  }`}
                >
                  {l} ({lectureStats[l]})
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* قائمة الأسئلة المُصفّاة */}
      <div className="py-3 sm:py-4 max-w-2xl mx-auto w-full">
        {filteredQuestions.map((item) => renderQuestion(item))}

        {/* أزرار الإجراءات */}
        <div className="p-3 sm:p-4 gap-3 space-y-3 max-w-2xl mx-auto">
          <button
            onClick={() => setShowPasteModal(true)}
            className="w-full bg-indigo-500 py-2.5 sm:py-3 rounded-lg flex items-center justify-center gap-1.5 hover:bg-indigo-600"
          >
            <ClipboardPaste size={18} color="#ffffff" />
            <span className="text-white font-medium text-sm sm:text-base">
              📋 لصق أسئلة من النص
            </span>
          </button>
          <button
            onClick={addQuestion}
            className="w-full bg-green-500 py-2.5 sm:py-3 rounded-lg flex items-center justify-center gap-1.5 hover:bg-green-600"
          >
            <Plus size={18} color="#ffffff" />
            <span className="text-white font-medium text-sm sm:text-base">
              إضافة سؤال
            </span>
          </button>
          <button
            onClick={handleSubmit}
            className="w-full bg-[#8C52FF] py-2.5 sm:py-3 rounded-lg flex items-center justify-center gap-1.5 hover:bg-purple-700 disabled:opacity-50"
            disabled={loading}
          >
            <Save size={18} color="#ffffff" />
            <span className="text-white font-medium text-sm sm:text-base">
              حفظ التغييرات
            </span>
          </button>
        </div>
      </div>

      {/* ─── Paste Questions Modal ─── */}
      {showPasteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div
            style={{ direction: "rtl" }}
            className="bg-white rounded-xl p-4 sm:p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base sm:text-lg font-bold text-gray-800">
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

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-xs sm:text-sm text-yellow-800 leading-relaxed">
              <p className="font-semibold mb-1">التنسيق المطلوب:</p>
              <ul className="list-disc pr-4 space-y-1">
                <li>كل سؤال = 5 أسطر (السؤال + 4 خيارات)</li>
                <li>
                  إذا أردت تغيير المحاضرة ضع اسمها في سطر قبل السؤال (يصبح 6 أسطر)
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

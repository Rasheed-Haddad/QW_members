import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import {
  FileScan,
  X,
  Upload,
  Loader2,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Bot,
  Save,
} from "lucide-react";
import { API_BASE_URL, PASSWORD } from "../../config";
import { getLecture, saveLecture } from "./v2api";
import { ToolBtn } from "../production/components/ToolBtn";
import { DEFAULT_GEMINI_MODEL } from "../production/components/AiActions";
import PdfPane from "../production/components/PdfPane";
import { uploadGeminiFile, cleanupGeminiFile } from "../production/lib/transcribe";

// ─── تفريغ دورة ───────────────────────────────────────────────────────────────
// ملف دورةٍ يرسله الطلاب (PDF أو صورة، بخط اليد غالباً) ← Gemini يقرؤه ←
// أسئلة بخيارات (MCQ) وأسئلة بجوابها فقط (بطاقات)، كلٌّ مصنَّف إلى محاضرته.
// النتيجة تُراجَع وتُعدَّل كاملةً بجانب الملف نفسه، ثم تُضاف تحت الموجود في
// كل محاضرة وتُحفظ.

const FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.5-pro"];
const withDefault = (list) =>
  list.includes(DEFAULT_GEMINI_MODEL) ? list : [DEFAULT_GEMINI_MODEL, ...list];

let uid = 0;
const keyed = (it) => ({ ...it, key: `i${(uid += 1)}` });

export default function CourseExtractAction({ subjectId, lectures, onSaved }) {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState([]);
  const [model, setModel] = useState(DEFAULT_GEMINI_MODEL);
  const [file, setFile] = useState(null); // File
  const [bytes, setBytes] = useState(null); // للعرض (PDF)
  const [imgUrl, setImgUrl] = useState("");
  const [stage, setStage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState("all");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    if (!open || models.length) return;
    axios
      .post(`${API_BASE_URL}/production/gemini-models`, { PASSWORD })
      .then((r) => setModels(withDefault(r.data?.models || [])))
      .catch(() => setModels(withDefault(FALLBACK_MODELS)));
  }, [open, models.length]);

  useEffect(() => () => imgUrl && URL.revokeObjectURL(imgUrl), [imgUrl]);

  const pickFile = async (f) => {
    setFile(f);
    setItems(null);
    setError("");
    setSaved("");
    if (imgUrl) URL.revokeObjectURL(imgUrl);
    if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
      setBytes(new Uint8Array(await f.arrayBuffer()));
      setImgUrl("");
    } else {
      setBytes(null);
      setImgUrl(URL.createObjectURL(f));
    }
  };

  const extract = async () => {
    if (!file) return;
    setBusy(true);
    setError("");
    setItems(null);
    setSaved("");
    let fileName = null;
    try {
      const up = await uploadGeminiFile(file, {
        onStage: setStage,
        onProgress: (p) => setStage(`جارٍ رفع الملف… ${p}%`),
        label: "الملف",
      });
      fileName = up.fileName;
      setStage("Gemini يقرأ الدورة ويستخرج الأسئلة — قد يستغرق دقائق…");
      const r = await axios.post(
        `${API_BASE_URL}/production/course-extract`,
        {
          PASSWORD,
          fileUri: up.uri,
          mimeType: up.mimeType || file.type || "application/pdf",
          model,
          lectures: lectures.map((l) => l.name || "بلا اسم"),
          cost: { exam_id: subjectId },
        },
        { timeout: 15 * 60 * 1000 },
      );
      const list = (r.data?.items || []).map(keyed);
      if (!list.length) setError("لم يُستخرج أي سؤال من الملف");
      if (r.data?.truncated) setError("الملف أطول من سعة المخرَج — بعض الأسئلة الأخيرة قد تكون ناقصة");
      setItems(list);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "تعذّر التفريغ");
    } finally {
      if (fileName) cleanupGeminiFile(fileName);
      setBusy(false);
      setStage("");
    }
  };

  const update = (key, patch) =>
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  // تبديل النوع يحفظ الجواب: الصحيح من الخيارات يصير جواب البطاقة، والعكس
  const switchType = (it, type) => {
    if (type === it.type) return;
    if (type === "flash") {
      update(it.key, { type, answer_text: it.options?.[it.answer - 1] || "" });
    } else {
      update(it.key, {
        type,
        options: [it.answer_text || "", "", "", ""],
        answer: 1,
        solved_by_model: false,
      });
    }
  };

  const counts = useMemo(() => {
    const xs = items || [];
    return {
      mcq: xs.filter((x) => x.type === "mcq").length,
      flash: xs.filter((x) => x.type === "flash").length,
      solved: xs.filter((x) => x.type === "mcq" && x.solved_by_model).length,
      orphan: xs.filter((x) => !x.lecture).length,
    };
  }, [items]);

  const shown = (items || []).filter((x) =>
    filter === "all" ? true : filter === "orphan" ? !x.lecture : String(x.lecture) === filter,
  );

  // صالح للحفظ: له محاضرة وسؤال، وجوابه موجود
  const invalid = (x) =>
    !x.lecture ||
    !String(x.question || "").trim() ||
    (x.type === "mcq"
      ? !String(x.options?.[x.answer - 1] || "").trim()
      : !String(x.answer_text || "").trim());
  const invalidCount = (items || []).filter(invalid).length;

  const save = async () => {
    if (!items?.length || invalidCount) return;
    const byLecture = {};
    items.forEach((x) => {
      const l = lectures[x.lecture - 1];
      (byLecture[l.lecture_id] ||= { name: l.name, items: [] }).items.push(x);
    });
    if (
      !window.confirm(
        `إضافة ${counts.mcq} سؤال MCQ و${counts.flash} بطاقة إلى ${Object.keys(byLecture).length} محاضرة وحفظها؟\n\n` +
          "إن كانت إحداها مفتوحةً بتعديلات غير محفوظة فاحفظها أولاً — وإلا كتب حفظُها فوق ما يُضاف هنا.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    const stamp = Date.now().toString(36);
    const done = [];
    try {
      for (const [lid, g] of Object.entries(byLecture)) {
        setStage(`جارٍ الحفظ في «${g.name}»…`);
        // eslint-disable-next-line no-await-in-loop
        const cur = (await getLecture(subjectId, lid)).lecture || {};
        const mcq = g.items.filter((x) => x.type === "mcq");
        const flash = g.items.filter((x) => x.type === "flash");
        const payload = {};
        // معرّفات صريحة فريدة: الخادم يولّد q_id من الموضع إن غاب، وبعد
        // حذفٍ سابق قد يتكرّر الموضع مع معرّفٍ قائم فيختلط تقدّم الطلاب
        if (mcq.length) {
          payload.questions = [
            ...(cur.questions || []),
            ...mcq.map((x, i) => ({
              q_id: `${lid}_crs${stamp}_${i + 1}`,
              question: x.question.trim(),
              options: x.options.map((o) => String(o || "").trim()),
              answer: String(x.answer),
            })),
          ];
        }
        if (flash.length) {
          payload.flash_cards = [
            ...(cur.flash_cards || []),
            ...flash.map((x, i) => ({
              card_id: `${lid}_crs${stamp}_${i + 1}`,
              front: x.question.trim(),
              back: x.answer_text.trim(),
            })),
          ];
        }
        // eslint-disable-next-line no-await-in-loop
        await saveLecture(subjectId, lid, payload);
        done.push(lid);
      }
      setSaved(`أُضيف ${counts.mcq} سؤال و${counts.flash} بطاقة إلى ${done.length} محاضرة وحُفظت`);
      setItems(null);
      onSaved?.(done);
    } catch (e) {
      setError(
        `${e?.response?.data?.message || e?.message || "تعذّر الحفظ"}` +
          (done.length ? ` — حُفظ ${done.length} محاضرة قبل الخطأ، أعد الحفظ للباقي بعد حذف ما حُفظ` : ""),
      );
    } finally {
      setBusy(false);
      setStage("");
    }
  };

  const close = () => {
    if (busy) return;
    if (items?.length && !window.confirm("لم تُحفظ الأسئلة المستخرجة بعد. إغلاق؟")) return;
    setOpen(false);
  };

  return (
    <>
      <ToolBtn icon={FileScan} color="#ea580c" onClick={() => setOpen(true)}>
        تفريغ دورة
      </ToolBtn>

      {open &&
        createPortal(
          <div className="fixed inset-0 bg-white z-50 flex flex-col" dir="rtl">
            {/* الترويسة والأدوات */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 flex-wrap">
              <FileScan size={18} className="text-orange-600" />
              <h3 className="text-base font-bold text-gray-800">تفريغ دورة</h3>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={busy}
                dir="ltr"
                className="border border-gray-300 rounded-lg p-1.5 text-sm bg-white"
              >
                {(models.length ? models : withDefault(FALLBACK_MODELS)).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <label className="cursor-pointer text-sm border border-gray-300 rounded-lg px-3 py-1.5 flex items-center gap-1.5 bg-white">
                <Upload size={14} />
                <span className="max-w-[16rem] truncate">{file ? file.name : "اختر ملف الدورة (PDF أو صورة)"}</span>
                <input
                  type="file"
                  accept="application/pdf,.pdf,image/*"
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) pickFile(f);
                  }}
                />
              </label>
              <button
                onClick={extract}
                disabled={!file || busy}
                className="bg-orange-600 text-white text-sm font-bold rounded-lg px-4 py-1.5 disabled:opacity-40 flex items-center gap-1.5"
              >
                {busy && !items ? <Loader2 size={14} className="animate-spin" /> : <FileScan size={14} />}
                {items ? "إعادة التفريغ" : "تفريغ"}
              </button>
              <button onClick={close} className="mr-auto p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 flex min-h-0">
              {/* العناصر — يمين */}
              <div className="w-[55%] min-w-0 flex flex-col border-l border-gray-200">
                {(stage || error || saved) && (
                  <div className="px-4 pt-3 space-y-2">
                    {stage && (
                      <p className="text-sm text-gray-600 flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin" /> {stage}
                      </p>
                    )}
                    {error && (
                      <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 flex items-start gap-2">
                        <AlertTriangle size={15} className="shrink-0 mt-0.5" /> {error}
                      </p>
                    )}
                    {saved && (
                      <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2 flex items-center gap-2">
                        <CheckCircle2 size={15} /> {saved}
                      </p>
                    )}
                  </div>
                )}

                {!items && !busy && !saved && (
                  <p className="text-sm text-gray-400 text-center py-16 px-6 leading-7">
                    اختر ملف الدورة ثم «تفريغ». الأسئلة ذات الخيارات تصير MCQ (ويحلّ النموذج غير
                    المحلول منها)، والأسئلة بجوابها فقط تصير بطاقات — وكلٌّ يُصنَّف إلى محاضرته.
                  </p>
                )}

                {items && (
                  <>
                    <div className="px-4 py-2 flex items-center gap-2 flex-wrap text-xs border-b border-gray-100">
                      <span className="font-semibold text-gray-700">
                        {counts.mcq} MCQ · {counts.flash} بطاقة
                      </span>
                      {counts.solved > 0 && (
                        <span className="text-amber-700 bg-amber-50 rounded px-1.5 py-0.5">
                          {counts.solved} حلّها النموذج — راجعها
                        </span>
                      )}
                      {counts.orphan > 0 && (
                        <span className="text-red-600 bg-red-50 rounded px-1.5 py-0.5">
                          {counts.orphan} بلا محاضرة
                        </span>
                      )}
                      <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="mr-auto border border-gray-200 rounded-lg p-1 text-xs bg-white"
                      >
                        <option value="all">كل المحاضرات</option>
                        <option value="orphan">بلا محاضرة</option>
                        {lectures.map((l, i) => (
                          <option key={l.lecture_id} value={String(i + 1)}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                      {shown.map((x) => (
                        <div
                          key={x.key}
                          className={`rounded-xl border p-3 space-y-2 ${
                            invalid(x) ? "border-red-200 bg-red-50/30" : "border-gray-200 bg-white"
                          }`}
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex rounded-lg bg-gray-100 p-0.5 text-xs">
                              {[
                                ["mcq", "MCQ"],
                                ["flash", "بطاقة"],
                              ].map(([t, label]) => (
                                <button
                                  key={t}
                                  onClick={() => switchType(x, t)}
                                  className={`px-2.5 py-1 rounded-md font-semibold ${
                                    x.type === t ? "bg-white shadow-sm text-gray-800" : "text-gray-500"
                                  }`}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                            <select
                              value={x.lecture || 0}
                              onChange={(e) => update(x.key, { lecture: Number(e.target.value) })}
                              className={`flex-1 min-w-0 border rounded-lg p-1.5 text-xs bg-white ${
                                x.lecture ? "border-gray-200" : "border-red-300 text-red-600"
                              }`}
                            >
                              <option value={0}>— اختر المحاضرة —</option>
                              {lectures.map((l, i) => (
                                <option key={l.lecture_id} value={i + 1}>
                                  {l.name}
                                </option>
                              ))}
                            </select>
                            {x.type === "mcq" && x.solved_by_model && (
                              <span
                                className="text-[10px] font-bold text-amber-700 bg-amber-100 rounded px-1.5 py-0.5 flex items-center gap-1"
                                title="لم يكن محلولاً في الملف — الجواب من معرفة النموذج"
                              >
                                <Bot size={11} /> حلّه النموذج
                              </span>
                            )}
                            <button
                              onClick={() => setItems((xs) => xs.filter((y) => y.key !== x.key))}
                              className="p-1.5 rounded-md text-red-500 hover:bg-red-50"
                              title="حذف"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>

                          <textarea
                            value={x.question}
                            onChange={(e) => update(x.key, { question: e.target.value })}
                            rows={2}
                            dir="auto"
                            placeholder="نص السؤال"
                            className="w-full border border-gray-300 rounded-lg p-2 text-sm font-arabic"
                          />

                          {x.type === "mcq" ? (
                            <div className="space-y-1.5">
                              {[0, 1, 2, 3].map((i) => {
                                const ok = x.answer === i + 1;
                                return (
                                  <div key={i} className="flex items-center gap-2">
                                    <button
                                      onClick={() => update(x.key, { answer: i + 1, solved_by_model: false })}
                                      title="اجعله الصحيح"
                                      className={`w-7 h-7 shrink-0 rounded-lg text-xs font-bold ${
                                        ok ? "bg-green-500 text-white" : "bg-gray-200 text-gray-600 hover:bg-gray-300"
                                      }`}
                                    >
                                      {ok ? "✓" : i + 1}
                                    </button>
                                    <input
                                      value={x.options[i] || ""}
                                      onChange={(e) => {
                                        const options = [...x.options];
                                        options[i] = e.target.value;
                                        update(x.key, { options });
                                      }}
                                      dir="auto"
                                      placeholder={`الخيار ${i + 1}`}
                                      className={`flex-1 border rounded-lg p-1.5 text-sm font-arabic ${
                                        ok ? "border-green-300 bg-green-50/50" : "border-gray-300"
                                      }`}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <input
                              value={x.answer_text}
                              onChange={(e) => update(x.key, { answer_text: e.target.value })}
                              dir="auto"
                              placeholder="الجواب (ظهر البطاقة)"
                              className="w-full border border-green-300 bg-green-50/40 rounded-lg p-2 text-sm font-arabic"
                            />
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="px-4 py-3 border-t border-gray-200 flex items-center gap-3">
                      <p className="text-xs flex-1 text-gray-500">
                        {invalidCount
                          ? `${invalidCount} عنصراً ناقصاً (بلا محاضرة أو بلا جواب) — أكمله أو احذفه`
                          : "تُضاف تحت الموجود في كل محاضرة وتُحفظ فوراً"}
                      </p>
                      <button
                        onClick={save}
                        disabled={busy || !items.length || invalidCount > 0}
                        className="bg-brand text-white text-sm font-bold rounded-xl px-5 py-2.5 disabled:opacity-40 flex items-center gap-2"
                      >
                        {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                        تأكيد وإضافة ({items.length})
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* الملف نفسه — يسار، للمقارنة بخط اليد */}
              <div className="w-[45%] min-w-0 h-full bg-gray-100">
                {bytes ? (
                  <PdfPane bytes={bytes} title="ملف الدورة" />
                ) : imgUrl ? (
                  <div className="h-full overflow-auto p-3 flex justify-center">
                    <img src={imgUrl} alt="الدورة" className="max-w-full h-fit bg-white shadow" />
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-gray-400">
                    يظهر الملف هنا للمقارنة
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

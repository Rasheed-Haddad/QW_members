import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ScanLine,
  Key,
  Eye,
  EyeOff,
  Play,
  Square,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ImageIcon,
  ArrowLeft,
  Loader2,
  X,
  FileText,
} from "lucide-react";
import { usePipeline } from "../pipelineStore";
import { scanLecture, checkR2, OCR_MODEL } from "../lib/mistralOcr";
import { TranscribeAction } from "../components/AiActions";

// ─── الخطوة ٢: المسح الضوئي ───────────────────────────────────────────────────
// كل محاضرة تمرّ على Mistral: نصّاً وصوراً في تمريرة واحدة. بين ملفٍ وآخر
// ستون ثانية — احتراماً لحدّ الاستعمال، وهو ما ثبت أنه يعمل في الأداة
// الأصلية (WAIT_BETWEEN_FILES = 60).
//
// المفتاح يُدخَل هنا لا في الخادم: منصّة Mistral تُبطله كل ساعة تقريباً،
// فهو متغيّر لا سرّ. يُحفظ في localStorage ليبقى بين الجلسات.

const KEY_STORE = "mistral_api_key";
const WAIT_SECONDS = 60;

const StatusChip = ({ status }) => {
  const map = {
    idle: { t: "لم يُمسح", c: "bg-gray-100 text-gray-500" },
    running: { t: "جارٍ…", c: "bg-blue-50 text-blue-700" },
    done: { t: "تمّ", c: "bg-green-50 text-green-700" },
    error: { t: "فشل", c: "bg-red-50 text-red-700" },
  };
  const s = map[status] || map.idle;
  return (
    <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${s.c}`}>
      {s.t}
    </span>
  );
};

export default function Step2Ocr() {
  const { state, dispatch, getLectureBytes } = usePipeline();
  const { lectures } = state;

  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem(KEY_STORE) || "",
  );
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState(OCR_MODEL);
  const [withImages, setWithImages] = useState(true);
  const [r2, setR2] = useState(null);

  // نتائج المسح: id → {status, markdown, pages, stats, error, stage}
  const [results, setResults] = useState({});
  const [running, setRunning] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [viewing, setViewing] = useState(null);
  const stopRef = useRef(false);

  useEffect(() => {
    checkR2().then(setR2);
  }, []);

  useEffect(() => {
    if (apiKey) localStorage.setItem(KEY_STORE, apiKey);
  }, [apiKey]);

  const patch = useCallback((id, v) => {
    setResults((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), ...v } }));
  }, []);

  const counts = useMemo(() => {
    let done = 0;
    let error = 0;
    lectures.forEach((l) => {
      const s = results[l.id]?.status;
      if (s === "done") done += 1;
      else if (s === "error") error += 1;
    });
    return { done, error, total: lectures.length, left: lectures.length - done };
  }, [lectures, results]);

  // ─── مسح واحد ───────────────────────────────────────────────────────────────
  const scanOne = async (lec) => {
    const bytes = getLectureBytes(lec.id);
    if (!bytes) {
      patch(lec.id, { status: "error", error: "بايتات المحاضرة مفقودة — أعد التقسيم" });
      return false;
    }
    patch(lec.id, { status: "running", error: null, stage: "بدء…" });
    try {
      const r = await scanLecture({
        apiKey: apiKey.trim(),
        subject: state.sourceFiles?.[0]?.name || "مادة",
        name: lec.name,
        bytes,
        model,
        withImages: withImages && r2?.ready !== false,
        onStage: (t) => patch(lec.id, { stage: t }),
      });
      patch(lec.id, {
        status: "done",
        markdown: r.markdown,
        rawMarkdown: r.rawMarkdown || r.markdown,
        pages: r.pages,
        stats: r.stats,
        stage: null,
      });
      return true;
    } catch (e) {
      const detail =
        e?.response?.data?.message ||
        e?.response?.data?.detail ||
        e?.message ||
        "خطأ غير معروف";
      patch(lec.id, { status: "error", error: String(detail).slice(0, 300), stage: null });
      return false;
    }
  };

  // ─── مسح الكل بالتتابع مع الانتظار ──────────────────────────────────────────
  const scanAll = async (onlyFailedOrPending = true) => {
    if (!apiKey.trim()) return;
    stopRef.current = false;
    setRunning(true);
    const todo = lectures.filter((l) =>
      onlyFailedOrPending ? results[l.id]?.status !== "done" : true,
    );
    for (let i = 0; i < todo.length; i++) {
      if (stopRef.current) break;
      // eslint-disable-next-line no-await-in-loop
      await scanOne(todo[i]);
      const more = i < todo.length - 1;
      if (more && !stopRef.current) {
        // الانتظار بين الملفات — احترام حدّ الاستعمال
        for (let s = WAIT_SECONDS; s > 0; s--) {
          if (stopRef.current) break;
          setCountdown(s);
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 1000));
        }
        setCountdown(0);
      }
    }
    setCountdown(0);
    setRunning(false);
  };

  const stop = () => {
    stopRef.current = true;
  };

  const proceed = () => {
    const md = {};
    const orig = {};
    lectures.forEach((l) => {
      const r = results[l.id];
      if (r?.status === "done") {
        md[l.id] = r.markdown;
        orig[l.id] = r.rawMarkdown || r.markdown;
      }
    });
    dispatch({ type: "markdown", markdown: md, original: orig });
    dispatch({ type: "step", step: "spell" });
  };

  if (!lectures.length) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
        <FileText size={24} className="text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500">
          لا محاضرات — ارجع إلى خطوة التقسيم أولاً
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* الإعدادات */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center">
            <Key size={17} className="text-brand" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-800">مفتاح Mistral</p>
            <p className="text-xs text-gray-400">
              يُحفظ في هذا الجهاز فقط — المنصّة تُجدّده كل ساعة تقريباً
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              dir="ltr"
              placeholder="sk-…"
              className="w-full px-3 py-2.5 pl-10 rounded-xl border border-gray-200 text-sm outline-none focus:border-brand font-mono"
            />
            <button
              onClick={() => setShowKey((v) => !v)}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600"
            >
              {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            dir="ltr"
            title="نموذج المسح"
            className="w-52 px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-brand font-mono"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={withImages}
            onChange={(e) => setWithImages(e.target.checked)}
            className="w-4 h-4 accent-[#8C52FF]"
          />
          <ImageIcon size={15} className="text-gray-400" />
          استخرج الصور وارفعها
          {r2 && !r2.ready && (
            <span className="text-xs text-amber-600">
              · R2 غير مهيّأ في الخادم — سيُستخرج النصّ بلا صور
            </span>
          )}
          {r2?.ready && (
            <span className="text-xs text-green-600">· R2 جاهز</span>
          )}
        </label>
      </div>

      {/* التحكّم */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 flex-wrap">
        <span className="text-sm text-gray-600">
          {counts.done} من {counts.total} ممسوحة
          {counts.error > 0 && (
            <span className="text-red-600"> · {counts.error} فشلت</span>
          )}
        </span>

        {countdown > 0 && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1.5 rounded-lg">
            <Clock size={14} /> انتظار {countdown} ثانية قبل الملف التالي
          </span>
        )}

        <div className="mr-auto flex items-center gap-2">
          {running ? (
            <button
              onClick={stop}
              className="text-sm font-bold text-red-600 border border-red-200 bg-red-50 rounded-xl px-4 py-2.5 flex items-center gap-2"
            >
              <Square size={15} /> أوقف
            </button>
          ) : (
            <>
              {counts.error > 0 && (
                <button
                  onClick={() => scanAll(true)}
                  disabled={!apiKey.trim()}
                  className="text-sm font-medium text-brand bg-brand/10 rounded-xl px-4 py-2.5 flex items-center gap-2 disabled:opacity-40"
                >
                  <RotateCw size={15} /> أعد الفاشلة
                </button>
              )}
              <button
                onClick={() => scanAll(true)}
                disabled={!apiKey.trim() || counts.left === 0}
                title={apiKey.trim() ? "" : "أدخل مفتاح Mistral أولاً"}
                className="bg-brand text-white text-sm font-bold rounded-xl px-5 py-2.5 flex items-center gap-2 disabled:opacity-40"
              >
                <Play size={15} /> امسح الكل ({counts.left})
              </button>
            </>
          )}
        </div>
      </div>

      {countdown === 0 && running && (
        <p className="text-xs text-gray-400 text-center">
          الانتظار ستون ثانية بين كل ملفين — احتراماً لحدّ الاستعمال
        </p>
      )}

      {/* المحاضرات */}
      <div className="flex flex-col gap-2">
        {lectures.map((l, i) => {
          const r = results[l.id] || {};
          return (
            <div
              key={l.id}
              className={`bg-white rounded-xl border p-3.5 ${
                r.status === "error" ? "border-red-200" : "border-gray-100"
              }`}
            >
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-bold text-gray-400 w-5 shrink-0">
                  {i + 1}
                </span>
                <span className="text-sm font-semibold text-gray-800 truncate max-w-[240px]">
                  {l.name}
                </span>
                <span className="text-xs text-gray-400">
                  {l.pages} ص · {Math.round(l.size / 1024)} ك.ب
                </span>
                <StatusChip status={r.status || "idle"} />

                {r.status === "done" && (
                  <span className="text-xs text-gray-500 flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-green-500" />
                    {r.pages} صفحة
                    {r.stats?.uploaded > 0 && ` · ${r.stats.uploaded} صورة`}
                    {r.stats?.deduped > 0 && ` · ${r.stats.deduped} مكرّرة`}
                  </span>
                )}

                <div className="mr-auto flex items-center gap-2">
                  {r.status === "done" && (
                    <button
                      onClick={() => setViewing(l.id)}
                      className="text-xs text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5"
                    >
                      اعرض النتيجة
                    </button>
                  )}
                  <TranscribeAction
                    onText={(md) =>
                      patch(l.id, {
                        status: "done",
                        markdown: md,
                        pages: 0,
                        stats: { transcribed: true },
                        stage: null,
                        error: null,
                      })
                    }
                  />
                  <button
                    onClick={() => scanOne(l)}
                    disabled={running || !apiKey.trim() || r.status === "running"}
                    className="text-xs font-medium text-brand bg-brand/10 rounded-lg px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-40"
                  >
                    {r.status === "running" ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <ScanLine size={13} />
                    )}
                    {r.status === "done" ? "أعد المسح" : "امسح"}
                  </button>
                </div>
              </div>

              {r.stage && (
                <p className="text-xs text-blue-600 mt-2 flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" /> {r.stage}
                </p>
              )}
              {r.error && (
                <p className="text-xs text-red-600 mt-2 flex items-start gap-1.5">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  {r.error}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* المتابعة */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
        <p className="text-sm text-gray-500">
          {counts.done === counts.total
            ? "كل المحاضرات ممسوحة"
            : `${counts.left} محاضرة لم تُمسح بعد`}
        </p>
        <button
          onClick={proceed}
          disabled={counts.done === 0 || running}
          title={counts.done ? "" : "امسح محاضرةً واحدة على الأقل"}
          className="mr-auto bg-brand text-white text-sm font-bold rounded-xl px-6 py-2.5 disabled:opacity-40 flex items-center gap-2"
        >
          <ArrowLeft size={16} /> متابعة إلى التدقيق ({counts.done})
        </button>
      </div>

      {/* عارض النتيجة */}
      {viewing && (
        <div
          className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4"
          onClick={() => setViewing(null)}
        >
          <div
            dir="rtl"
            className="bg-white rounded-2xl w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 p-4 border-b border-gray-100">
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-gray-800 truncate">
                  {lectures.find((l) => l.id === viewing)?.name}
                </h3>
                <p className="text-xs text-gray-400">
                  {results[viewing]?.markdown?.length.toLocaleString("ar-EG")} حرف
                </p>
              </div>
              <button
                onClick={() => setViewing(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>
            <pre className="flex-1 overflow-auto p-4 text-sm leading-7 whitespace-pre-wrap font-mono text-gray-800">
              {results[viewing]?.markdown}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE_URL, PASSWORD } from "../../../config";
import { MODES } from "../lib/claudeRun";

// ─── مشترك بين أزرار Claude (الأسئلة والملخّص) ───────────────────────────────
// حالة الخادم (هل المفتاح مضبوط؟ وما النماذج؟) تُسأل مرة واحدة للتطبيق كله،
// واختيار النموذج والجهد واحدٌ للأزرار كلها ويُتذكَّر بين الجلسات.

let statusPromise = null;
export const getClaudeStatus = () => {
  if (!statusPromise) {
    statusPromise = axios
      .post(`${API_BASE_URL}/production/claude-status`, { PASSWORD })
      .then((r) => r.data)
      .catch(() => {
        statusPromise = null; // فشل الشبكة لا يُحفظ — يُعاد السؤال لاحقاً
        return { configured: false, unreachable: true };
      });
  }
  return statusPromise;
};

export const useClaudeStatus = () => {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    getClaudeStatus().then(setStatus);
  }, []);
  return status;
};

/** سبب تعطيل الزرّ، أو "" إن كان جاهزاً */
export const claudeDisabledReason = (status) =>
  !status
    ? "جارٍ الفحص…"
    : status.unreachable
      ? "تعذّر سؤال الخادم عن مفتاح Claude"
      : !status.configured
        ? "مفتاح Claude غير مضبوط — أضف ANTHROPIC_API_KEY في متغيّرات Render"
        : "";

const PREFS_KEY = "claude_mcq_prefs_v1";
const loadPrefs = () => {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {};
  } catch {
    return {};
  }
};

/** النموذج والجهد وطريقة التنفيذ (عادي/Batch) — محفوظة، وتعود للافتراضي إن لم تعد متاحة */
export const useClaudePrefs = (status) => {
  const [model, setModel] = useState(() => loadPrefs().model || "");
  const [effort, setEffort] = useState(() => loadPrefs().effort || "");
  const [mode, setMode] = useState(() =>
    MODES.some((m) => m.id === loadPrefs().mode) ? loadPrefs().mode : "regular",
  );

  useEffect(() => {
    if (!status?.models) return;
    if (!status.models.some((m) => m.id === model)) setModel(status.default_model);
    if (!(status.efforts || []).includes(effort)) setEffort(status.default_effort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    if (!model || !effort) return;
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ model, effort, mode }));
    } catch {
      /* التخزين غير متاح — يبقى الاختيار لهذه الجلسة */
    }
  }, [model, effort, mode]);

  return { model, setModel, effort, setEffort, mode, setMode };
};

const EFFORT_LABELS = {
  low: "منخفض — أسرع وأرخص",
  medium: "متوسط",
  high: "عالٍ (مُوصى به)",
  xhigh: "عالٍ جداً",
  max: "أقصى — أبطأ وأغلى",
};

/** قوائم النموذج والجهد وطريقة التنفيذ */
export function ClaudeModelPicker({ status, prefs, disabled }) {
  const select =
    "border border-gray-300 rounded-lg p-2 text-sm text-gray-800 bg-white";
  return (
    <>
      <label className="flex flex-col gap-1 text-xs text-gray-500">
        النموذج
        <select
          value={prefs.model}
          onChange={(e) => prefs.setModel(e.target.value)}
          disabled={disabled}
          className={select}
        >
          {(status?.models || []).map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-gray-500">
        الجهد
        <select
          value={prefs.effort}
          onChange={(e) => prefs.setEffort(e.target.value)}
          disabled={disabled}
          className={select}
        >
          {(status?.efforts || []).map((e) => (
            <option key={e} value={e}>
              {EFFORT_LABELS[e] || e}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-gray-500">
        التنفيذ
        <select
          value={prefs.mode}
          onChange={(e) => prefs.setMode(e.target.value)}
          disabled={disabled}
          className={select}
        >
          {MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

/** عدّاد ثوانٍ أثناء التوليد — دقيقةٌ أو أكثر بلا مؤشّر توحي بالتعليق */
export const useElapsed = (running) => {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running) return undefined;
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  return elapsed;
};

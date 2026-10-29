import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Scissors,
  X,
  Plus,
  Trash2,
  FolderDown,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Upload,
} from "lucide-react";
import PdfPane from "./PdfPane";
import { pageCount, splitPdf } from "../lib/pdfEngine";
import { ToolBtn } from "./ToolBtn";

// ─── تقسيم المقرَّر ───────────────────────────────────────────────────────────
// ملف مقرَّرٍ واحد فيه عدّة محاضرات ← ملف PDF لكل محاضرة. يساراً الملف نفسه
// للقراءة، ويميناً الأقسام: من صفحة، إلى صفحة، واسم المحاضرة. الحفظ في مجلدٍ
// يختاره المستخدم من جهازه، ملفاتٍ منفصلة لا أرشيفاً مضغوطاً، والصفحات تُنسخ
// كما هي بلا إعادة ضغط (انظر splitPdf).
//
// كل شيء محلّي: الملف لا يُرفع إلى الخادم.

// محارف لا يقبلها نظام الملفات في الأسماء
const safeFileName = (s) =>
  String(s || "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

const newRow = (from = "", to = "") => ({
  key: Math.random().toString(36).slice(2),
  name: "",
  from,
  to,
});

export default function SplitPdfAction({ pdfBytes, onPdfBytes }) {
  const [open, setOpen] = useState(false);
  const [bytes, setBytes] = useState(null);
  const [pages, setPages] = useState(0);
  const [rows, setRows] = useState(() => [newRow(1, "")]);
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState(null); // { ok, message }

  // الملف المفتوح في المحاضرة (إن وُجد) نقطة البداية، ويمكن اختيار غيره
  useEffect(() => {
    if (open && !bytes && pdfBytes?.length) setBytes(pdfBytes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    setPages(0);
    if (!bytes?.length) return;
    pageCount(bytes)
      .then((n) => {
        setPages(n);
        // أوّل قسمٍ يمتدّ للنهاية افتراضياً — يُقصّ حين يُضاف ما بعده
        setRows((rs) =>
          rs.length === 1 && !rs[0].to ? [{ ...rs[0], to: n }] : rs,
        );
      })
      .catch(() =>
        setResult({
          ok: false,
          message: "تعذّر قراءة الملف — هل هو PDF سليم؟",
        }),
      );
  }, [bytes]);

  const pick = (b) => {
    setBytes(b);
    setRows([newRow(1, "")]);
    setResult(null);
    onPdfBytes?.(b); // يصير هو الملف الأصلي للمقارنة والتدقيق أيضاً
  };

  const setField = (key, field, value) =>
    setRows((rs) =>
      rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)),
    );

  const addRow = () =>
    setRows((rs) => {
      const last = rs[rs.length - 1];
      const start = Number(last?.to) ? Number(last.to) + 1 : "";
      return [...rs, newRow(start && start <= pages ? start : "", pages || "")];
    });

  // التحقّق لكل قسم: الأرقام صحيحة وضمن الملف، والبداية لا تتجاوز النهاية
  const problem = (r) => {
    const f = Number(r.from);
    const t = Number(r.to);
    if (!Number.isInteger(f) || !Number.isInteger(t) || f < 1 || t < 1)
      return "أدخل صفحتين صحيحتين";
    if (f > t) return "«من» أكبر من «إلى»";
    if (pages && t > pages) return `الملف ${pages} صفحة فقط`;
    return "";
  };
  const problems = rows.map(problem);
  const ready = bytes?.length && rows.length > 0 && problems.every((p) => !p);

  const save = async () => {
    if (!ready || busy) return;
    setResult(null);
    const names = [];
    const seen = {};
    rows.forEach((r, i) => {
      const base = safeFileName(r.name) || `محاضرة ${i + 1}`;
      seen[base] = (seen[base] || 0) + 1;
      names.push(seen[base] > 1 ? `${base} (${seen[base]})` : base);
    });

    let dir = null;
    if (window.showDirectoryPicker) {
      try {
        dir = await window.showDirectoryPicker({ mode: "readwrite" });
      } catch {
        return; // أُغلق اختيار المجلد — لا شيء يُحفظ
      }
    }

    try {
      setBusy(`جارٍ التقسيم… 0 / ${rows.length}`);
      const files = await splitPdf(
        bytes,
        rows.map((r) => ({ from: Number(r.from), to: Number(r.to) })),
        (i) => setBusy(`جارٍ التقسيم… ${i + 1} / ${rows.length}`),
      );

      setBusy("جارٍ الحفظ…");
      if (dir) {
        for (let i = 0; i < files.length; i++) {
          // eslint-disable-next-line no-await-in-loop
          const fh = await dir.getFileHandle(`${names[i]}.pdf`, {
            create: true,
          });
          // eslint-disable-next-line no-await-in-loop
          const w = await fh.createWritable();
          // eslint-disable-next-line no-await-in-loop
          await w.write(files[i]);
          // eslint-disable-next-line no-await-in-loop
          await w.close();
        }
        setResult({
          ok: true,
          message: `حُفظ ${files.length} ملفاً في المجلد «${dir.name}»`,
        });
      } else {
        // بلا اختيار مجلد (متصفّحٌ لا يدعمه): تنزيل كل ملفٍ على حدة
        for (let i = 0; i < files.length; i++) {
          const url = URL.createObjectURL(
            new Blob([files[i]], { type: "application/pdf" }),
          );
          const a = document.createElement("a");
          a.href = url;
          a.download = `${names[i]}.pdf`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 10000);
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 400));
        }
        setResult({ ok: true, message: `نُزّل ${files.length} ملفاً` });
      }
    } catch (e) {
      setResult({ ok: false, message: e?.message || "تعذّر التقسيم أو الحفظ" });
    } finally {
      setBusy("");
    }
  };

  return (
    <>
      <ToolBtn icon={Scissors} color="#0ea5e9" onClick={() => setOpen(true)}>
        تقسيم المقرر
      </ToolBtn>

      {/* بوابةٌ إلى body: الزرّ يعيش في ترويسةٍ ذات backdrop-blur، وهذه تجعل
          أي عنصر fixed داخلها محصوراً فيها بدل ملء الشاشة */}
      {open && createPortal(
        <div className="fixed inset-0 bg-white z-50 flex" dir="rtl">
          {/* اليمين ٤٠٪: الأقسام */}
          <div className="w-[40%] min-w-0 h-full flex flex-col border-l border-gray-200">
            <div className="flex items-center gap-3 p-4 border-b border-gray-100">
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-gray-800">
                  تقسيم المقرر
                </h3>
                <p className="text-xs text-gray-400">
                  {bytes?.length
                    ? `${pages || "…"} صفحة · كل قسم يصير ملف PDF مستقلاً باسم محاضرته`
                    : "اختر ملف المقرر أولاً"}
                </p>
              </div>
              {bytes?.length > 0 && (
                <label className="cursor-pointer text-xs text-brand border border-brand/30 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
                  <Upload size={13} /> ملف آخر
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) pick(new Uint8Array(await f.arrayBuffer()));
                    }}
                  />
                </label>
              )}
              <button
                onClick={() => !busy && setOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <div className="grid grid-cols-[1.5rem_1fr_4.5rem_4.5rem_2rem] gap-2 px-1 text-[11px] font-bold text-gray-500">
                <span>#</span>
                <span>اسم المحاضرة</span>
                <span>من</span>
                <span>إلى</span>
                <span />
              </div>
              {rows.map((r, i) => (
                <div key={r.key}>
                  <div className="grid grid-cols-[1.5rem_1fr_4.5rem_4.5rem_2rem] gap-2 items-center">
                    <span className="text-xs font-bold text-gray-400 text-center">
                      {i + 1}
                    </span>
                    <input
                      value={r.name}
                      onChange={(e) => setField(r.key, "name", e.target.value)}
                      placeholder={`محاضرة ${i + 1}`}
                      className="border border-gray-300 rounded-lg p-2 text-sm font-arabic"
                    />
                    <input
                      type="text"
                      min={1}
                      max={pages || undefined}
                      value={r.from}
                      onChange={(e) => setField(r.key, "from", e.target.value)}
                      className="border border-gray-300 rounded-lg p-2 text-sm text-center"
                    />
                    <input
                      type="text"
                      min={1}
                      max={pages || undefined}
                      value={r.to}
                      onChange={(e) => setField(r.key, "to", e.target.value)}
                      className="border border-gray-300 rounded-lg p-2 text-sm text-center"
                    />
                    <button
                      onClick={() =>
                        setRows((rs) => rs.filter((x) => x.key !== r.key))
                      }
                      disabled={rows.length === 1}
                      className="p-1.5 rounded-md text-red-500 hover:bg-red-50 disabled:opacity-30"
                      title="حذف القسم"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  {problems[i] && (r.from !== "" || r.to !== "") && (
                    <p className="text-[11px] text-red-500 mr-8 mt-0.5">
                      {problems[i]}
                    </p>
                  )}
                </div>
              ))}
              <button
                onClick={addRow}
                disabled={!bytes?.length}
                className="w-full border border-dashed border-gray-300 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <Plus size={15} /> قسم جديد
              </button>
            </div>

            {(busy || result) && (
              <div
                className={`mx-3 mb-2 text-sm rounded-lg px-3 py-2 flex items-center gap-2 ${
                  busy
                    ? "bg-gray-50 text-gray-600"
                    : result.ok
                      ? "bg-green-50 text-green-700"
                      : "bg-red-50 text-red-600"
                }`}
              >
                {busy ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : result.ok ? (
                  <CheckCircle2 size={15} />
                ) : (
                  <AlertTriangle size={15} />
                )}
                {busy || result.message}
              </div>
            )}

            <div className="p-4 border-t border-gray-100 flex items-center gap-3">
              <p className="text-xs text-gray-400 flex-1">
                ملفات منفصلة بلا ضغط · الأصل لا يتغيّر
              </p>
              <button
                onClick={save}
                disabled={!ready || !!busy}
                className="bg-brand text-white text-sm font-bold rounded-xl px-5 py-2.5 disabled:opacity-40 flex items-center gap-2"
              >
                <FolderDown size={16} /> حفظ {rows.length} ملف في مجلد…
              </button>
            </div>
          </div>

          {/* اليسار ٦٠٪: الملف نفسه */}
          <div className="w-[60%] min-w-0 h-full">
            <PdfPane bytes={bytes} onPickFile={pick} title="ملف المقرر" />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// ─── حساب النطاقات والتحقق منها ───────────────────────────────────────────────
// وحدة خالصة بلا React ولا DOM: كل ما يخصّ «أي صفحات تخصّ أي محاضرة» يعيش هنا
// وحده، فيمكن اختباره كاملاً بلا متصفّح.
//
// الاصطلاح: أرقام الصفحات للمستخدم 1-based شاملة الطرفين [start, end].
// التحويل إلى 0-based لا يحدث إلا عند القصّ الفعلي (pdfOps.js).
//
// نموذج التفاعل: المستند يبدأ نطاقاً واحداً يغطّي كل صفحة، والمستخدم يشقّه.
// الأداة المرجعية كانت تبدأ من الفراغ فتُسقط صفحاتٍ بلا إنذار — أخطر عيوبها.
// هنا التغطية كاملةٌ بالتصميم، والثغرة فعلٌ متعمَّد لا سهو.

/** ألوان مميِّزة للنطاقات — تدور عند النفاد */
export const RANGE_COLORS = [
  "#8C52FF",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#14b8a6",
  "#6366f1",
  "#84cc16",
  "#f97316",
];

export const colorFor = (index) => RANGE_COLORS[index % RANGE_COLORS.length];

let seq = 0;
export const newRangeId = () => `r${++seq}_${seq * 7919}`;

/** نطاق واحد يغطّي المستند كلّه — حالة البدء */
export const wholeDocument = (pageCount, name = "") => [
  { id: newRangeId(), start: 1, end: Math.max(1, pageCount), name },
];

/** ترتيب حسب بداية النطاق. الترتيب مشتقّ لا مخزَّن: تعديل start يعيد الترتيب
 *  تلقائياً، فلا يتناقض ما يُرى في القائمة مع ما في الشبكة. */
export const sorted = (ranges) =>
  [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);

/** خريطة صفحة → فهرس النطاق (بعد الفرز). الصفحة غير المغطاة = -1.
 *  عند التداخل تفوز الأسبقُ بداية، لأنها الأعلى في القائمة. */
export const pageOwners = (ranges, pageCount) => {
  const out = new Int32Array(pageCount + 1).fill(-1);
  const list = sorted(ranges);
  for (let i = list.length - 1; i >= 0; i--) {
    const r = list[i];
    const s = Math.max(1, r.start);
    const e = Math.min(pageCount, r.end);
    for (let p = s; p <= e; p++) out[p] = i;
  }
  return out;
};

/** يشقّ النطاق الذي تقع فيه الصفحة، فتصير هذه الصفحة أول محاضرة جديدة.
 *  الشقّ عند بداية نطاق أو خارج أي نطاق لا يفعل شيئاً. */
export const splitAt = (ranges, page) => {
  const list = sorted(ranges);
  const i = list.findIndex((r) => page > r.start && page <= r.end);
  if (i === -1) return ranges;
  const r = list[i];
  const left = { ...r, end: page - 1 };
  const right = { id: newRangeId(), start: page, end: r.end, name: "" };
  return [...list.slice(0, i), left, right, ...list.slice(i + 1)];
};

/** يدمج النطاق الذي يبدأ بهذه الصفحة مع سابقه — عكس الشقّ.
 *  يُشترط التلاصق: دمج نطاقين بينهما ثغرة يبتلعها صامتاً. */
export const mergeAt = (ranges, page) => {
  const list = sorted(ranges);
  const i = list.findIndex((r) => r.start === page);
  if (i <= 0) return ranges;
  const prev = list[i - 1];
  const cur = list[i];
  if (prev.end + 1 !== cur.start) return ranges;
  const merged = {
    ...prev,
    end: cur.end,
    // اسم السابق أولى: هو الباقي بصرياً في موضعه
    name: prev.name || cur.name,
  };
  return [...list.slice(0, i - 1), merged, ...list.slice(i + 1)];
};

/** تعديل حقل واحد. start/end يُقصَّان على حدود المستند، ولا يُسمح بـend<start
 *  لأن نطاقاً مقلوباً يُنتج ملفاً بصفحة واحدة صامتاً في الأداة المرجعية. */
export const updateRange = (ranges, id, field, value, pageCount) => {
  return ranges.map((r) => {
    if (r.id !== id) return r;
    if (field === "name") return { ...r, name: value };
    const n = parseInt(value, 10);
    // النموذج لا يحمل قيمةً غير صالحة أبداً. الحقل الفارغ أثناء الكتابة شأن
    // العرض لا شأن الحالة: لو خزّنّا "" لانهارت حسابات التغطية والثغرات.
    if (!Number.isFinite(n)) return r;
    const clamped = Math.max(1, Math.min(pageCount, n));
    if (field === "start") return { ...r, start: clamped, end: Math.max(clamped, r.end) };
    return { ...r, end: clamped, start: Math.min(clamped, r.start) };
  });
};

export const removeRange = (ranges, id) => ranges.filter((r) => r.id !== id);

/** الصفحات غير المغطاة، مجمّعةً في فترات متّصلة للعرض المفهوم:
 *  «٤٥–٥٠» بدل ستة أرقام متفرقة. */
export const gaps = (ranges, pageCount) => {
  const owners = pageOwners(ranges, pageCount);
  const out = [];
  let run = null;
  for (let p = 1; p <= pageCount; p++) {
    if (owners[p] === -1) {
      if (run) run.end = p;
      else run = { start: p, end: p };
    } else if (run) {
      out.push(run);
      run = null;
    }
  }
  if (run) out.push(run);
  return out;
};

/** أزواج النطاقات المتداخلة */
export const overlaps = (ranges) => {
  const list = sorted(ranges);
  const out = [];
  for (let i = 1; i < list.length; i++) {
    if (list[i].start <= list[i - 1].end) {
      out.push({
        a: list[i - 1],
        b: list[i],
        from: list[i].start,
        to: Math.min(list[i - 1].end, list[i].end),
      });
    }
  }
  return out;
};

/** تنظيف الاسم ليصلح اسمَ ملف على ويندوز ولينكس معاً.
 *  الأداة المرجعية كانت تمرّر الاسم كما هو، فيُشوّهه المتصفّح أو يفشل التنزيل. */
export const sanitizeName = (name) =>
  String(name || "")
    // محظورة في أسماء ملفات ويندوز، مع محارف التحكّم. المسافة والشرطة
    // مسموحتان: «محاضرة 1-2» اسمٌ مشروع وحذف شرطته يغيّر معناه.
    // eslint-disable-next-line no-control-regex
    .replace(/[/\\:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "") // نقطة في الطرفين تُخفي الملف أو تُبطله
    .slice(0, 120);

/** أسماء مكرَّرة (بعد التنظيف والتطبيع) — تُنتج ملفين لا يُفرَّق بينهما */
export const duplicateNames = (ranges) => {
  const seen = new Map();
  ranges.forEach((r) => {
    const k = sanitizeName(r.name).trim().toLowerCase();
    if (!k) return;
    seen.set(k, (seen.get(k) || 0) + 1);
  });
  return [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
};

/** تقرير التحقق الكامل.
 *  blocking = يمنع المتابعة (يُنتج ملفاً خاطئاً حتماً)
 *  warning  = يُعرض ولا يمنع (قد يكون مقصوداً) */
export const validate = (ranges, pageCount) => {
  const problems = [];
  const list = sorted(ranges);

  if (list.length === 0) {
    problems.push({ level: "blocking", code: "empty", text: "لا نطاقات — أضف نطاقاً واحداً على الأقل" });
  }

  list.forEach((r, i) => {
    const label = r.name?.trim() || `النطاق ${i + 1}`;
    if (!Number.isFinite(r.start) || !Number.isFinite(r.end) || r.start < 1 || r.end < 1) {
      problems.push({ level: "blocking", code: "bad_number", id: r.id, text: `${label}: أرقام صفحات غير صالحة` });
    } else if (r.end < r.start) {
      problems.push({ level: "blocking", code: "inverted", id: r.id, text: `${label}: النهاية (${r.end}) قبل البداية (${r.start})` });
    } else if (r.end > pageCount || r.start > pageCount) {
      problems.push({ level: "blocking", code: "out_of_range", id: r.id, text: `${label}: خارج حدود المستند (${pageCount} صفحة)` });
    }
    if (!sanitizeName(r.name).trim()) {
      problems.push({ level: "blocking", code: "no_name", id: r.id, text: `النطاق ${i + 1} (صفحات ${r.start}–${r.end}) بلا اسم — الاسم يصير اسم المحاضرة` });
    }
  });

  duplicateNames(list).forEach((n) => {
    problems.push({ level: "blocking", code: "dup_name", text: `الاسم «${n}» مكرَّر — لا يمكن تمييز الملفين` });
  });

  const g = gaps(list, pageCount);
  g.forEach((x) => {
    problems.push({
      level: "warning",
      code: "gap",
      text: x.start === x.end
        ? `الصفحة ${x.start} لا تخصّ أي محاضرة`
        : `الصفحات ${x.start}–${x.end} لا تخصّ أي محاضرة`,
      pages: x,
    });
  });

  overlaps(list).forEach((o) => {
    problems.push({
      level: "warning",
      code: "overlap",
      text: `تداخل في الصفحات ${o.from}–${o.to} بين «${o.a.name || "نطاق"}» و«${o.b.name || "نطاق"}»`,
    });
  });

  return {
    problems,
    blocking: problems.filter((p) => p.level === "blocking"),
    warnings: problems.filter((p) => p.level === "warning"),
    ok: problems.every((p) => p.level !== "blocking"),
    coveredPages: pageCount - g.reduce((s, x) => s + (x.end - x.start + 1), 0),
  };
};

/** تسمية جماعية: بادئة + ترقيم متسلسل يحترم عدد الخانات */
export const applyBulkNames = (ranges, prefix) => {
  const list = sorted(ranges);
  const width = String(list.length).length;
  return list.map((r, i) => ({
    ...r,
    name: `${prefix}${String(i + 1).padStart(width, "0")}`,
  }));
};

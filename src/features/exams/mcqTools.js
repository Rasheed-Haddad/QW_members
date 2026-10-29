// ─── أدوات ترتيب خيارات أسئلة MCQ ─────────────────────────────────────────────
// كلها تنقل الخيارات ولا تغيّر نصّها: الجواب الصحيح يبقى هو نفسه، ويتغيّر
// رقمه فقط. `answer` مخزَّن نصاً 1-based ("1".."4") ويبقى كذلك.

const normAr = (s) =>
  String(s == null ? "" : s)
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// خيارات «جامعة» تشير إلى ما قبلها فيجب أن تبقى رابعةً حصراً. تُطابَق بعد
// التطبيع (أ ← ا)، فـ«أ + ب» و«ا+ب» سواء.
const PINNED = [
  /كل ما سبق/,
  /جميع ما سبق/,
  /(لا شيء|ولا واحد|لا احد) مما سبق/,
  /(^|[\s(])[ابجد] ?[+و] ?[ابجد]([\s)]|$)/,
  /all of the above/,
  /none of the above/,
  /(^|[\s(])[a-d] ?(\+|&|and) ?[a-d]([\s)]|$)/,
];

/** سؤالٌ أحد خياراته «كل ما سبق…» أو «أ + ب» — لا يُمسّ ترتيبه */
export const isPinnedQuestion = (q) =>
  (q?.options || []).some((o) => {
    const t = normAr(o);
    return t && PINNED.some((re) => re.test(t));
  });

/** رقم الصحيح 0-based، أو -1 إن كان مفقوداً أو خارج المدى */
const answerIndex = (q) => {
  const n = Number(q?.answer);
  return Number.isInteger(n) && n >= 1 && n <= 4 ? n - 1 : -1;
};

/**
 * يبدّل مكانَي خيارين، والجواب الصحيح يتبع نصّه أينما ذهب.
 * سحب الخيار 4 (الصحيح) إلى 2: يصير الصحيح 2 ويصير ما كان في 2 رابعاً.
 */
export const swapOptions = (q, from, to) => {
  if (from === to) return q;
  const options = [...(q.options || [])];
  while (options.length < 4) options.push("");
  [options[from], options[to]] = [options[to], options[from]];
  const a = answerIndex(q);
  const answer = a === from ? to : a === to ? from : a;
  return { ...q, options, answer: a < 0 ? q.answer : String(answer + 1) };
};

/**
 * يوزّع مكان الجواب الصحيح عشوائياً على كل الأسئلة — بالتساوي تقريباً بين
 * الأرقام الأربعة، لا عشوائيةً مستقلّة قد تجمع نصف الأجوبة على رقمٍ واحد.
 * المُستثنى: أسئلة «كل ما سبق»/«أ + ب» (تبقى الرابعة)، وأسئلة بلا جواب صالح.
 */
export const shuffleCorrectPositions = (questions) => {
  const eligible = [];
  let pinned = 0;
  let invalid = 0;
  questions.forEach((q, i) => {
    if (isPinnedQuestion(q)) pinned += 1;
    else if (answerIndex(q) < 0) invalid += 1;
    else eligible.push(i);
  });

  // أهداف متوازنة: 0,1,2,3,0,1,… ثم خلط Fisher–Yates
  const targets = eligible.map((_, k) => k % 4);
  for (let k = targets.length - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    [targets[k], targets[j]] = [targets[j], targets[k]];
  }

  const next = [...questions];
  let moved = 0;
  eligible.forEach((qi, k) => {
    const from = answerIndex(next[qi]);
    if (from !== targets[k]) {
      next[qi] = swapOptions(next[qi], from, targets[k]);
      moved += 1;
    }
  });

  return { questions: next, eligible: eligible.length, moved, pinned, invalid };
};

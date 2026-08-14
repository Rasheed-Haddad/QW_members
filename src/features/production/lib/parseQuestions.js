// ─── استخراج الأسئلة من نصّ ملصوق ─────────────────────────────────────────────
// منقول عن parsePastedQuestions في ExamEditor ليُستعمل في ثلاثة مواضع بنسخةٍ
// واحدة: محرّر المادة، ومحرّر المحاضرة، وخطّ الإنتاج.
//
// التنسيق: كتلٌ يفصلها سطر فارغ.
//   ٦ أسطر = اسم المحاضرة + السؤال + أربعة خيارات
//   ٥ أسطر = السؤال + أربعة خيارات (تتبع آخر محاضرة ذُكرت)
//   سطر واحد = اسم محاضرة جديدة لما يليها
// الجواب الصحيح مُعلَّم بـ ✅ أو ✓ أو ☑️ في أوّل الخيار أو آخره.

// بالتناوب لا بصنف محارف: ☑️ محرفان (U+2611 + U+FE0F)، وصنفُ المحارف
// يفصلهما فيصير محدِّد التنويع U+FE0F وحده علامةً صالحة — ومحرفٌ خفيّ
// في الخيار كان يجعله «الجواب الصحيح» بلا أن يُرى.
const MARK = /✅|☑️|✓|✔/gu;
const HAS_MARK = /✅|☑️|✓|✔/u;

export const parsePastedQuestions = (text) => {
  const lines = String(text || "")
    .split("\n")
    .map((l) => l.trim());
  const questions = [];
  let currentLecture = "";
  let block = [];

  const push = (qText, opts) => {
    const answerIdx = opts.findIndex((o) => HAS_MARK.test(o));
    const clean = opts.map((o) => o.replace(MARK, "").trim());
    questions.push({
      lecture: currentLecture,
      question: qText,
      options: clean.length === 4 ? clean : ["", "", "", ""],
      // 1-based كما يخزّنها المخطّط؛ الافتراضي 1 حين لا علامة
      answer: answerIdx >= 0 ? answerIdx + 1 : 1,
    });
  };

  const flush = () => {
    if (block.length === 0) return;
    if (block.length === 6) {
      [currentLecture] = block;
      push(block[1], block.slice(2, 6));
    } else if (block.length === 5) {
      push(block[0], block.slice(1, 5));
    } else if (block.length === 1 && !HAS_MARK.test(block[0])) {
      [currentLecture] = block;
    }
    block = [];
  };

  lines.forEach((line) => {
    if (line === "") flush();
    else block.push(line);
  });
  flush();

  return questions;
};

/** تشخيص للعرض حين يفشل الاستخراج — «لم يُعثر على أسئلة» وحدها لا تُرشد */
export const diagnosePaste = (text) => {
  const blocks = String(text || "")
    .split(/\n\s*\n/)
    .map((b) => b.split("\n").filter((l) => l.trim()).length)
    .filter((n) => n > 0);
  const bad = blocks.filter((n) => n !== 5 && n !== 6 && n !== 1);
  return {
    blocks: blocks.length,
    bad: bad.length,
    hint: bad.length
      ? `${bad.length} كتلة بعدد أسطر غير متوقَّع (${[...new Set(bad)].join("، ")}). المتوقَّع ٥ أسطر (سؤال + ٤ خيارات) أو ٦ (اسم المحاضرة معها).`
      : "",
  };
};

import { Check, Lock } from "lucide-react";
import { PipelineProvider, STEPS, usePipeline } from "./pipelineStore";
import Step1Split from "./steps/Step1Split";
import Step2Ocr from "./steps/Step2Ocr";
import Step3Spell from "./steps/Step3Spell";
import Step4Review from "./steps/Step4Review";
import GenerateStep from "./steps/GenerateStep";
import Step5Summary from "./steps/Step5Summary";
import Step6Questions from "./steps/Step6Questions";
import { Step9Save } from "./steps/FinalSteps";

// ─── خط إنتاج المادة ──────────────────────────────────────────────────────────
// تسع خطوات من ملف المقرَّر إلى مادةٍ كاملة في القاعدة. الشريط أعلى الشاشة
// يقول أين أنت ممّا بقي — عمل بهذا الطول بلا خريطةٍ يُنسي صاحبَه موضعه.

const StepBar = () => {
  const { state, dispatch } = usePipeline();
  const order = STEPS.map((s) => s.key);
  const cur = order.indexOf(state.step);
  const max = order.indexOf(state.furthest);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-3 overflow-x-auto">
      <div className="flex items-center gap-1 min-w-max">
        {STEPS.map((s, i) => {
          const done = i < max;
          const active = i === cur;
          const reachable = i <= max;
          return (
            <div key={s.key} className="flex items-center">
              <button
                onClick={() => reachable && dispatch({ type: "step", step: s.key })}
                disabled={!reachable}
                title={reachable ? s.label : "لم تصل إليها بعد"}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  active
                    ? "bg-brand text-white"
                    : done
                      ? "bg-brand/10 text-brand hover:bg-brand/20"
                      : "text-gray-400"
                } ${reachable ? "" : "cursor-not-allowed"}`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                    active
                      ? "bg-white/25"
                      : done
                        ? "bg-brand/20"
                        : "bg-gray-100"
                  }`}
                >
                  {done ? (
                    <Check size={11} />
                  ) : reachable ? (
                    s.n
                  ) : (
                    <Lock size={9} />
                  )}
                </span>
                <span className="whitespace-nowrap">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <span
                  className={`w-4 h-px shrink-0 ${done ? "bg-brand/40" : "bg-gray-200"}`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const NotBuiltYet = ({ label, n }) => {
  const { state } = usePipeline();
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
      <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
        <span className="text-lg font-black text-gray-400">{n}</span>
      </div>
      <h3 className="text-base font-semibold text-gray-800">{label}</h3>
      <p className="text-sm text-gray-400 mt-1.5">
        هذه الخطوة قيد الإنشاء.
        {state.lectures.length > 0 &&
          ` ${state.lectures.length} محاضرة جاهزة من الخطوة السابقة.`}
      </p>
      {state.lectures.length > 0 && (
        <div className="mt-5 max-w-md mx-auto text-right rounded-xl border border-gray-100 divide-y divide-gray-100">
          {state.lectures.map((l, i) => (
            <div key={l.id} className="flex items-center gap-2 px-3 py-2 text-xs">
              <span className="text-gray-400 w-5 shrink-0">{i + 1}</span>
              <span className="truncate text-gray-700">{l.name}</span>
              <span className="mr-auto text-gray-400 shrink-0">
                {l.pages} ص · {Math.round(l.size / 1024)} ك.ب
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const Body = () => {
  const { state } = usePipeline();
  const step = STEPS.find((s) => s.key === state.step) || STEPS[0];
  if (state.step === "split") return <Step1Split />;
  if (state.step === "ocr") return <Step2Ocr />;
  if (state.step === "spell") return <Step3Spell />;
  if (state.step === "review") return <Step4Review />;
  if (state.step === "summary") return <Step5Summary />;
  if (state.step === "questions") return <Step6Questions />;
  // نوعان بنمطٍ واحد: مكوّن واحد يخدمهما بفارق النوع وحده
  if (state.step === "flash")
    return <GenerateStep kind="flash" nextStep="written" />;
  if (state.step === "written")
    return <GenerateStep kind="written" nextStep="save" />;
  if (state.step === "save") return <Step9Save />;
  return <NotBuiltYet label={step.label} n={step.n} />;
};

const Shell = () => (
  <div dir="rtl" className="flex flex-col gap-4">
    <div>
      <h1 className="text-xl font-semibold text-gray-900">إنتاج مادة</h1>
      <p className="text-sm text-gray-400 mt-1">
        من ملف المقرَّر إلى مادةٍ كاملة — تسع خطوات
      </p>
    </div>
    <StepBar />
    <Body />
  </div>
);

export default function ProductionPipeline() {
  return (
    <PipelineProvider>
      <Shell />
    </PipelineProvider>
  );
}

import { Wallet } from "lucide-react";
import EmployerEarnings from "./EmployerEarnings";

// ─── أرباحي ───────────────────────────────────────────────────────────────────
// نسبة العضو من كل مادة مُسلَّمة له. الخادم يأخذ العضو من هويته (employer_id
// الذي يلحقه config.js بكل طلب) — فلا يرى عضوٌ أرباح غيره.

export default function MyEarnings() {
  return (
    <div className="p-3 sm:p-5" dir="rtl">
      <h1 className="text-lg sm:text-2xl font-bold text-brand mb-4 flex items-center gap-2">
        <Wallet size={22} />
        أرباحي
      </h1>
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <EmployerEarnings />
      </div>
    </div>
  );
}

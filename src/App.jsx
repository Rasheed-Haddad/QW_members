import { useEffect } from "react";
import { Provider, useSelector } from "react-redux";
import { store } from "./store/store";
import {
  HashRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import Layout from "./components/Layout";
import ExamsList from "./features/exams/ExamsList";
import ExamDetails from "./features/exams/ExamDetails";
import ExamEditor from "./features/exams/ExamEditor";
import SubjectWorkspace from "./features/exams/SubjectWorkspace";
import Login from "./features/auth/Login";
import { setEmployerId } from "./config";

// ─── تطبيق الأعضاء ────────────────────────────────────────────────────────────
// تبويب المواد منقول من لوحة التحكم بمساراته نفسها، فما يتعلّمه العضو هنا
// يعمل هناك — والإصلاح في اللوحة يُنسَخ بلا تحويل.
//
// **ما لا يُنقَل:** ربط النصوص وتصفير الكلية والطلاب والشكاوى — ليست من عمل
// العضو. والحدّ الحقيقي في الخادم: لا يبلغ العضو مادةً لم تُسلَّم له، مهما
// كان المسار الذي يكتبه.

function AuthGate() {
  const employer = useSelector((state) => state.auth.employer);

  // هويّة العضو تصل إلى طبقة الشبكة: كل طلبٍ يحملها، وبها يقرّر الخادم
  // ما يُقرأ وما يُكتب.
  useEffect(() => {
    setEmployerId(employer?._id || null);
  }, [employer]);

  if (!employer) return <Login />;

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/exams" replace />} />

          <Route path="exams" element={<ExamsList />} />
          <Route path="exams/:id" element={<ExamDetails />} />
          <Route path="exams/edit/:id" element={<ExamEditor />} />
          <Route path="exams/work/:id" element={<SubjectWorkspace />} />

          <Route path="*" element={<Navigate to="/exams" replace />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default function App() {
  return (
    <Provider store={store}>
      <AuthGate />
    </Provider>
  );
}

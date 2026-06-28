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
import ExamEditor from "./features/exams/ExamEditor";
import Login from "./features/auth/Login";

// يعرض التطبيق فقط بعد تسجيل الدخول، وإلا يعرض شاشة الدخول
function AuthGate() {
  const employer = useSelector((state) => state.auth.employer);

  if (!employer) {
    return <Login />;
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          {/* الصفحة الرئيسية - توجيه لصفحة المواد */}
          <Route index element={<Navigate to="/exams" replace />} />

          {/* مسارات المواد */}
          <Route path="exams" element={<ExamsList />} />
          <Route path="exams/edit/:id" element={<ExamEditor />} />

          {/* صفحة 404 - أي مسار غير موجود يتم توجيهه للمواد */}
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

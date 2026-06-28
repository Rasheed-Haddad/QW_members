import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { useSelector } from "react-redux";

const Layout = () => {
  const { sidebarOpen } = useSelector((state) => state.ui);

  return (
    <div dir="rtl">
      <Sidebar />
      <div
        className={`flex flex-col flex-1 overflow-hidden transition-all duration-200 ${
          sidebarOpen ? "mr-0 md:mr-52" : "mr-0 md:mr-12"
        }`}
      >
        <Header />
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
          <div className="container max-w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;

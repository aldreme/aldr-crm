import { BrowserRouter, Route, Routes } from "react-router-dom";
import { CrmApp, Dashboard, TablePage } from "./components/crm/CrmApp";
import { CrmLogin } from "./components/crm/CrmLogin";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<CrmLogin />} />
        <Route element={<CrmApp />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/:slug" element={<TablePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

import React, { useEffect, useState } from "react";
import AdminLoginPage from "./AdminLoginPage";
import AdminLayout from "./AdminLayout";
import { getAdminToken, fetchCurrentAdmin } from "./adminApi";

// Entirely self-contained — does NOT use the regular consumer AppContext
// or its login modal. Admin auth is a fully separate system: separate
// database table, separate JWT namespace (by virtue of querying a
// different table), separate localStorage key. Mounted by App.jsx when
// the URL path starts with /admin, in place of the normal consumer app.
export default function AdminApp() {
  const [currentAdmin, setCurrentAdmin] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) {
      setCheckingSession(false);
      return;
    }
    fetchCurrentAdmin()
      .then(setCurrentAdmin)
      .catch(() => setCurrentAdmin(null))
      .finally(() => setCheckingSession(false));
  }, []);

  if (checkingSession) {
    return (
      <div style={{ background: "#0a0104", minHeight: "100vh" }} className="flex items-center justify-center">
        <p style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
      </div>
    );
  }

  if (!currentAdmin) {
    return <AdminLoginPage onLoggedIn={setCurrentAdmin} />;
  }

  return <AdminLayout currentAdmin={currentAdmin} onLogout={() => setCurrentAdmin(null)} />;
}

'use client';

import { createContext, useContext, useState } from 'react';

export type AdminTheme = 'light' | 'dark';

type AdminThemeContextValue = {
  theme: AdminTheme;
  setTheme: (theme: AdminTheme) => void;
  toggleTheme: () => void;
};

const AdminThemeContext = createContext<AdminThemeContextValue | null>(null);

export function AdminThemeProvider({ children, initialTheme }: { children: React.ReactNode; initialTheme: AdminTheme }) {
  const [theme, updateTheme] = useState(initialTheme);

  function setTheme(nextTheme: AdminTheme) {
    updateTheme(nextTheme);
    document.cookie = `fitness-staff-theme=${nextTheme}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }

  function toggleTheme() {
    setTheme(theme === 'light' ? 'dark' : 'light');
  }

  return (
    <AdminThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      <div className={`staff-theme min-h-screen ${theme === 'dark' ? 'dark' : ''}`} data-theme={theme}>
        {children}
      </div>
    </AdminThemeContext.Provider>
  );
}

export function useAdminTheme() {
  const context = useContext(AdminThemeContext);
  if (!context) throw new Error('useAdminTheme must be used inside AdminThemeProvider');
  return context;
}

export { useAdminTheme as useStaffTheme, type AdminTheme as StaffTheme };

import { createContext, useContext, useEffect, type ReactNode } from "react";

// Namma Seva ships one theme: monochrome light. The provider stays so shadcn pieces that ask for a
// theme (the toaster) keep working, but there is nothing to switch and no stored preference.

export type Theme = "light";

const ThemeContext = createContext<{ theme: Theme } | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.classList.add("light");
  }, []);
  return <ThemeContext.Provider value={{ theme: "light" }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

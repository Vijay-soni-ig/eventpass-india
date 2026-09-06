import { createContext, useContext, useState, type ReactNode } from "react";

const STORAGE_KEY = "exhibittix:selected-city";

/**
 * Single source of truth for "which city is the visitor currently browsing
 * in", shared between the header's city control and any page that wants to
 * show that context (e.g. the homepage hero). Replaces three previously
 * independent, disagreeing city mechanisms (header indicator, hero "Any
 * city" select, homepage "Explore by City" grid) with one real control (the
 * header) plus read-only context elsewhere.
 *
 * `null` means "no city chosen" ("All Cities") — deliberately NOT defaulted
 * to a specific city like the header's previous hardcoded "Ahmedabad": the
 * seeded/live exhibition data today only covers Bengaluru, Delhi, Hyderabad
 * and Mumbai, so silently defaulting to a city with zero live exhibitions
 * would make the homepage search look broken for a first-time visitor who
 * never chose anything. The user's own explicit choice is what gets
 * persisted.
 */
interface CityContextValue {
  city: string | null;
  setCity: (city: string | null) => void;
}

const CityContext = createContext<CityContextValue | undefined>(undefined);

function readStoredCity(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private browsing / storage disabled — fall back to in-memory only for this session.
    return null;
  }
}

export function CityProvider({ children }: { children: ReactNode }) {
  const [city, setCityState] = useState<string | null>(readStoredCity);

  const setCity = (next: string | null) => {
    setCityState(next);
    try {
      if (next) {
        window.localStorage.setItem(STORAGE_KEY, next);
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Storage unavailable — the in-memory state above still works for this session.
    }
  };

  return <CityContext.Provider value={{ city, setCity }}>{children}</CityContext.Provider>;
}

export function useCity(): CityContextValue {
  const ctx = useContext(CityContext);
  if (!ctx) throw new Error("useCity must be used within a CityProvider");
  return ctx;
}

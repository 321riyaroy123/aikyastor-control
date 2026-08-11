import { useState, useCallback } from "react";

let toastId = 0;

/**
 * useToasts - Toast notification management.
 * This existed twice, byte-for-byte identical, in hooks.js and inline in
 * AiKyaStorCONTROL.jsx. Deduplicated to this single source.
 */
export function useToasts() {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((msg, type = "info", duration = 4000) => {
    const id = ++toastId;
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), duration);
  }, []);

  return [toasts, toast];
}

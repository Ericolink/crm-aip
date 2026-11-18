"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient, hardNavigate } from "@/lib/auth/client";
import { SESSION_POLICY } from "@/lib/auth/policy";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
const IDLE_MS = SESSION_POLICY.idleTimeoutSeconds * 1000;
const WARNING_MS = SESSION_POLICY.idleWarningSeconds * 1000;
const PING_MS = SESSION_POLICY.activityPingSeconds * 1000;

/**
 * Cierre de sesión por inactividad.
 * - Con actividad, renueva la sesión en el servidor (como máximo cada 2 min).
 * - Sin actividad, avisa 2 min antes y cierra sesión a los 15 min.
 * - Sincroniza entre pestañas: actividad en una pestaña mantiene viva la sesión en todas.
 */
export function IdleTimeout() {
  const t = useTranslations("Idle");
  const locale = useLocale();
  // Se inicializan al montar (useEffect), no durante el render.
  const lastActivity = useRef(0);
  const lastPing = useRef(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    lastActivity.current = Date.now();
    lastPing.current = Date.now();
  }, []);

  const signOut = useCallback(
    async (reason: "idle" | "signed_out") => {
      await authClient.signOut().catch(() => undefined);
      hardNavigate(`/${locale}/login?reason=${reason}`);
    },
    [locale],
  );

  const markActive = useCallback(() => {
    const now = Date.now();
    lastActivity.current = now;
    try {
      localStorage.setItem("crm:last-activity", String(now));
    } catch {
      // Sin almacenamiento disponible: cada pestaña lleva su propio contador.
    }
    if (now - lastPing.current > PING_MS) {
      lastPing.current = now;
      // Consultar la sesión la renueva en el servidor y refresca la cookie.
      void authClient.getSession();
    }
  }, []);

  useEffect(() => {
    // Mientras se muestra el aviso, solo el botón "Seguir trabajando" cuenta como actividad.
    if (secondsLeft !== null) return;
    for (const event of ACTIVITY_EVENTS)
      window.addEventListener(event, markActive, { passive: true });
    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, markActive);
    };
  }, [markActive, secondsLeft]);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === "crm:last-activity" && e.newValue) {
        lastActivity.current = Math.max(lastActivity.current, Number(e.newValue));
        setSecondsLeft(null);
      }
    }
    window.addEventListener("storage", onStorage);
    const timer = window.setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= IDLE_MS) {
        window.clearInterval(timer);
        void signOut("idle");
      } else if (idle >= IDLE_MS - WARNING_MS) {
        setSecondsLeft(Math.ceil((IDLE_MS - idle) / 1000));
      } else {
        setSecondsLeft(null);
      }
    }, 1000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", onStorage);
    };
  }, [signOut]);

  if (secondsLeft === null) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,26,38,0.45)] p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="idle-title"
        aria-describedby="idle-body"
        className="border-border bg-surface w-full max-w-sm rounded-xl border p-5 shadow-xl"
      >
        <h2 id="idle-title" className="text-base font-semibold">
          {t("title")}
        </h2>
        <p id="idle-body" className="text-muted mt-1 text-sm">
          {t("body", { seconds: secondsLeft })}
        </p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => void signOut("signed_out")}>
            {t("signOut")}
          </Button>
          <Button
            size="sm"
            autoFocus
            onClick={() => {
              lastPing.current = 0;
              markActive();
              setSecondsLeft(null);
            }}
          >
            {t("stay")}
          </Button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { apiFetch, getToken, SesionVencidaError } from "@/lib/api";
import { estadoSesion, leerPayload, usuarioDeMe } from "@/lib/session";
import { Button } from "@/components/ui/Button";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState(false);
  // H23: una vez autorizado, una sesion vencida la resuelve la ventana de re-ingreso de SessionKeeper (sin perder
  // lo escrito); solo se manda a /login si todavia no se habia autorizado.
  const autorizado = useRef(false);
  const [errorVerificacion, setErrorVerificacion] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const irALogin = () => {
      if (typeof window === "undefined") return;
      localStorage.removeItem("token");
      sessionStorage.setItem("returnUrl", (pathname || "/dashboard") + window.location.search);
      router.replace("/login?reason=session-expired");
    };

    const estado = estadoSesion(leerPayload(getToken()), Date.now(), 0);
    if (estado === "vencida" || estado === "sin-token") {
      if (!autorizado.current) irALogin();
      return;
    }

    apiFetch("/auth/me")
      .then((data) => {
        if (!isMounted) return;
        // Un 200 sin usuario es una sesion que no sirve: sigue la rama de /login (si todavia no se autorizo).
        const user = usuarioDeMe(data);
        if (!user) throw new SesionVencidaError();
        // Las paginas leen user_name / user_id para atribuir acciones (actividad,
        // asesor por defecto). Antes nadie escribia estas claves, asi que toda la
        // app registraba acciones sin responsable y dejaba el asesor vacio.
        try {
          localStorage.setItem("user_id", String(user?.id ?? ""));
          localStorage.setItem("user_email", user?.email || "");
          localStorage.setItem("user_name", user?.username || user?.email || "");
          localStorage.setItem("user_role", user?.role || "");
        } catch {}
        autorizado.current = true;
        setErrorVerificacion(false);
        setAuthorized(true);
      })
      .catch((err) => {
        console.error("AuthGuard session check error:", err);
        if (!isMounted || autorizado.current) return;
        if (err instanceof SesionVencidaError) {
          irALogin();
        } else {
          // Red caida o 500: no se borra el token ni se cierra la sesion; se ofrece reintentar.
          setErrorVerificacion(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [pathname, router, intento]);

  if (!authorized && errorVerificacion) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white gap-4 px-4 text-center">
        <p className="text-sm font-semibold text-slate-700">
          No se pudo verificar tu sesión. Revisa la conexión e intenta de nuevo.
        </p>
        <Button
          color="purple"
          icon={RefreshCw}
          onClick={() => {
            setErrorVerificacion(false);
            setIntento((n) => n + 1);
          }}
        >
          Reintentar
        </Button>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white">
        <div className="flex items-center gap-3 text-slate-700">
          <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
          <span className="text-sm font-semibold tracking-wide">Verificando sesión...</span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
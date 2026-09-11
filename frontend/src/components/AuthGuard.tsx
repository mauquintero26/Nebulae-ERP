"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { apiFetch, getToken } from "@/lib/api";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const token = getToken();

    if (!token) {
      if (typeof window !== "undefined") {
        const returnUrl = pathname || "/dashboard";
        sessionStorage.setItem("returnUrl", returnUrl);
        router.replace("/login?reason=session-expired");
      }
      return;
    }

    apiFetch("/auth/me")
      .then((data) => {
        if (!isMounted) return;
        const user = data?.data || data;
        if (data && (data.status === "success" || data.status === 200 || user?.id || user?.email)) {
          setAuthorized(true);
        } else {
          throw new Error("Invalid session");
        }
      })
      .catch((err) => {
        console.error("AuthGuard session check error:", err);
        if (!isMounted) return;
        if (typeof window !== "undefined") {
          localStorage.removeItem("token");
          const returnUrl = pathname || "/dashboard";
          sessionStorage.setItem("returnUrl", returnUrl);
          router.replace("/login?reason=session-expired");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [pathname, router]);

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
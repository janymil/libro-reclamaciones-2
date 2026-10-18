import { useEffect, useState } from "react";
import BackToTop from "@/components/layout/back-to-top";
import type { ComponentStatus, StatusResponse } from "@shared/status";

/**
 * Public status page (Phase 3.13). Standalone (no AppLayout/auth) so it stays
 * reachable during incidents; polls /api/status every 60s.
 *
 * The badges render what the API actually observed: `disabled` means "not
 * configured" (not a failure) and `pending` means "the first probe is still
 * running", so a missing key or a cold start is never dressed up as "Operativo".
 */

const STATUS_LABELS: Record<ComponentStatus, { label: string; className: string }> = {
  operational: { label: "Operativo", className: "bg-green-100 text-green-800" },
  degraded: { label: "Degradado", className: "bg-yellow-100 text-yellow-800" },
  down: { label: "Caído", className: "bg-red-100 text-red-800" },
  disabled: { label: "No configurado", className: "bg-gray-100 text-gray-600" },
  pending: { label: "Comprobando", className: "bg-blue-100 text-blue-800" },
};

const COMPONENT_LABELS: Record<string, string> = {
  api: "API",
  database: "Servicio de datos",
  ai: "Inteligencia artificial",
  email: "Correo electrónico",
};

const JOB_LABELS: Record<string, string> = {
  retention: "Retención de datos (2 años)",
  slaMonitoring: "Monitoreo de SLA",
};

type ComponentEntry = StatusResponse["components"][keyof StatusResponse["components"]];
type JobEntry = StatusResponse["jobs"][keyof StatusResponse["jobs"]];

const formatTime = (value: string | null) =>
  value ? new Date(value).toLocaleString("es-PE") : "—";

/** One line of evidence under a component, so the badge is not all you get. */
function componentDetail(key: string, component: ComponentEntry): string | null {
  if (key === "ai") {
    const ai = component as StatusResponse["components"]["ai"];
    if (ai.status === "disabled") {
      return "Sin configurar: la app sigue funcionando con análisis local.";
    }
    if (ai.status === "degraded") {
      return "Servicio de IA no disponible temporalmente.";
    }
    const parts = [
      ai.latencyMs != null ? `${ai.latencyMs} ms` : null,
      ai.checkedAt ? `comprobado ${formatTime(ai.checkedAt)}` : null,
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
  }

  if (key === "email") {
    const email = component as StatusResponse["components"]["email"];
    if (email.status === "disabled") {
      return "Sin configurar.";
    }
    if (email.status === "pending") {
      return "Comprobando el servicio de correo…";
    }
    if (email.status === "degraded") {
      return "No se pudo verificar el servicio de correo.";
    }
    const parts = [
      "Servicio de correo verificado",
      email.latencyMs != null ? `${email.latencyMs} ms` : null,
      email.checkedAt ? `comprobado ${formatTime(email.checkedAt)}` : null,
    ].filter(Boolean);
    return parts.join(" · ");
  }

  if (key === "database" && component.status === "down") {
    return "La comprobación del servicio de datos no respondió.";
  }

  return null;
}

export default function StatusPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch("/api/status");
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const body = (await response.json()) as StatusResponse;
        if (!cancelled) {
          setStatus(body);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error desconocido");
        }
      }
    };

    void load();
    const interval = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const components = status
    ? (Object.entries(status.components) as Array<[string, ComponentEntry]>)
    : [];
  const jobs = status ? (Object.entries(status.jobs) as Array<[string, JobEntry]>) : [];

  return (
    <div className="min-h-screen bg-surface py-12 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Estado del sistema</h1>
          <p className="text-gray-600 mt-1">LibroDigital.pe</p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-center">
            <p className="font-medium text-red-800">No se pudo consultar el estado</p>
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {status && (
          <>
            <div className="rounded-lg border p-4 bg-white shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900">Estado general</span>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_LABELS[status.status]?.className ?? ""}`}>
                  {STATUS_LABELS[status.status]?.label ?? status.status}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Versión {status.version} · Verificado {formatTime(status.checkedAt)}
              </p>
            </div>

            <div className="space-y-3">
              {components.map(([key, component]) => {
                const detail = componentDetail(key, component);
                const badge = STATUS_LABELS[component.status];
                return (
                  <div key={key} className="rounded-lg border p-4 bg-white shadow-sm flex items-start justify-between gap-4">
                    <div>
                      <span className="text-gray-800">{COMPONENT_LABELS[key] ?? key}</span>
                      {detail && <p className="text-xs text-gray-500 mt-1">{detail}</p>}
                    </div>
                    <span className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium ${badge?.className ?? ""}`}>
                      {badge?.label ?? component.status}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="rounded-lg border p-4 bg-white shadow-sm space-y-4">
              <p className="font-medium text-gray-900 text-sm">Tareas programadas</p>
              {jobs.map(([key, job]) => {
                const badge = STATUS_LABELS[job.status];
                return (
                  <div key={key} className="border-t border-gray-100 pt-3 first:border-t-0 first:pt-0">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-gray-800">{JOB_LABELS[key] ?? key}</span>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${badge?.className ?? ""}`}>
                        {badge?.label ?? job.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Última ejecución: {formatTime(job.lastRun)}
                    </p>
                    {job.lastResult && (
                      <p className="text-xs text-gray-500">Resultado: {job.lastResult}</p>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="text-center text-xs text-gray-500">
              Los servicios se comprueban automáticamente. Esta página se actualiza cada 60 segundos.
            </p>
          </>
        )}

        <p className="text-center text-sm">
          <a href="/" className="text-primary hover:underline">Volver al inicio</a>
        </p>
      </div>
      <BackToTop />
    </div>
  );
}

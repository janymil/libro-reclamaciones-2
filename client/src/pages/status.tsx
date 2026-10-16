import { useEffect, useState } from "react";

/**
 * Public status page (Phase 3.13). Standalone (no AppLayout/auth) so it stays
 * reachable during incidents; polls /api/status every 60s.
 */

interface StatusResponse {
  status: string;
  version: string;
  checkedAt: string;
  components: Record<string, { status: string; [key: string]: unknown }>;
  jobs: {
    retention: { lastRun: string | null; lastResult: string | null };
    slaMonitoring: { lastRun: string | null; lastResult: string | null };
  };
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  operational: { label: "Operativo", className: "bg-green-100 text-green-800" },
  degraded: { label: "Degradado", className: "bg-yellow-100 text-yellow-800" },
  down: { label: "Caído", className: "bg-red-100 text-red-800" },
};

const COMPONENT_LABELS: Record<string, string> = {
  api: "API",
  database: "Base de datos",
  ai: "Inteligencia artificial",
  email: "Correo electrónico",
};

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

  const formatTime = (value: string | null) =>
    value ? new Date(value).toLocaleString("es-PE") : "—";

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
              {Object.entries(status.components).map(([key, component]) => (
                <div key={key} className="rounded-lg border p-4 bg-white shadow-sm flex items-center justify-between">
                  <span className="text-gray-800">{COMPONENT_LABELS[key] ?? key}</span>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_LABELS[component.status]?.className ?? ""}`}>
                    {STATUS_LABELS[component.status]?.label ?? component.status}
                  </span>
                </div>
              ))}
            </div>

            <div className="rounded-lg border p-4 bg-white shadow-sm space-y-2">
              <p className="font-medium text-gray-900 text-sm">Tareas programadas</p>
              <div className="text-sm text-gray-600">
                <p>Retención de datos (2 años): última ejecución {formatTime(status.jobs.retention.lastRun)}</p>
                <p>Monitoreo de SLA: última ejecución {formatTime(status.jobs.slaMonitoring.lastRun)}</p>
              </div>
            </div>
          </>
        )}

        <p className="text-center text-sm">
          <a href="/" className="text-primary hover:underline">Volver al inicio</a>
        </p>
      </div>
    </div>
  );
}

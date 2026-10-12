import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  useAgentCapabilities,
  useAgentChat,
  type AgentCitation,
  type AgentMessage,
} from "@/hooks/use-agent";

interface ChatEntry {
  role: "user" | "assistant";
  content: string;
  citations?: AgentCitation[];
  toolsUsed?: string[];
  source?: "ai" | "fallback";
}

const SUGGESTIONS = [
  "¿Cuál es el plazo legal para responder un reclamo?",
  "¿Qué reclamos están por vencer?",
  "Resume el caso 2026-0001",
  "¿Cómo está el cumplimiento legal de la empresa?",
];

const WELCOME =
  "Hola, soy el Copiloto de Cumplimiento. Puedo explicar la normativa del Libro de Reclamaciones, " +
  "revisar sus reclamos, calcular plazos y resumir casos. ¿En qué le ayudo?";

/**
 * The compliance co-pilot conversation, shared by the full page (`/asistente`) and
 * the floating chat window (`ComplianceAgentWidget`). Presentational only: all the
 * reasoning, tenancy scoping and grounding happen on the server.
 */
export default function ComplianceAgentChat({ className = "" }: { className?: string }) {
  const { toast } = useToast();
  const { data: capabilities } = useAgentCapabilities();
  const chat = useAgentChat();
  const [input, setInput] = useState("");
  const [entries, setEntries] = useState<ChatEntry[]>([{ role: "assistant", content: WELCOME }]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [entries, chat.isPending]);

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || chat.isPending) return;

    const next: ChatEntry[] = [...entries, { role: "user", content: text }];
    setEntries(next);
    setInput("");

    try {
      const reply = await chat.mutateAsync(
        next.map(({ role, content }) => ({ role, content }) as AgentMessage),
      );
      setEntries([
        ...next,
        {
          role: "assistant",
          content: reply.reply,
          citations: reply.citations,
          toolsUsed: reply.toolsUsed,
          source: reply.source,
        },
      ]);
    } catch (error) {
      toast({
        title: "Error del asistente",
        description:
          error instanceof Error && error.message
            ? error.message
            : "No se pudo procesar la consulta. Intente nuevamente.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className={`flex flex-col overflow-hidden rounded-lg border border-[#e3d9c6] bg-white ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-[#e3d9c6] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="material-icons text-[#c02b0a]">smart_toy</span>
          <span className="text-sm font-medium text-[#1b1611]">Copiloto de Cumplimiento</span>
        </div>
        {capabilities && (
          <Badge variant={capabilities.enabled ? "default" : "secondary"}>
            {capabilities.enabled ? "IA activa" : "Referencia local"}
          </Badge>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-3" data-testid="agent-messages">
        {entries.map((entry, index) => (
          <div key={index} className={entry.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                entry.role === "user"
                  ? "max-w-[85%] rounded-lg bg-[#c02b0a] px-3 py-2 text-sm text-white"
                  : "max-w-[90%] space-y-2 rounded-lg bg-[#f7f2e8] px-3 py-2 text-sm text-[#1b1611]"
              }
            >
              <p className="whitespace-pre-wrap">{entry.content}</p>
              {entry.role === "assistant" && entry.source === "fallback" && (
                <Badge variant="secondary">Referencia local (IA no configurada)</Badge>
              )}
              {entry.citations && entry.citations.length > 0 && (
                <div className="space-y-1 border-t border-[#e3d9c6] pt-2">
                  <span className="font-mono text-[10px] uppercase tracking-wide text-[#8a7d6d]">Fuentes</span>
                  <ul className="space-y-0.5">
                    {entry.citations.map((citation) => (
                      <li key={citation.id} className="text-xs text-[#5c5246]">
                        • {citation.norm} — {citation.article}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ))}
        {chat.isPending && <p className="text-sm text-gray-500">El asistente está escribiendo…</p>}
      </div>

      <div className="flex flex-wrap gap-1.5 border-t border-[#e3d9c6] px-3 pt-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => setInput(suggestion)}
            className="rounded-full border border-[#e3d9c6] bg-[#fdfaf3] px-2.5 py-0.5 text-[11px] text-[#5c5246] hover:bg-[#f3eadc]"
          >
            {suggestion}
          </button>
        ))}
      </div>

      <div className="flex items-end gap-2 p-3">
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send(input);
            }
          }}
          placeholder="Escriba su consulta…"
          className="min-h-[44px] resize-none"
          data-testid="agent-input"
        />
        <Button onClick={() => void send(input)} disabled={chat.isPending || !input.trim()}>
          <span className="material-icons mr-1 text-[18px]">send</span>
          Enviar
        </Button>
      </div>
    </div>
  );
}


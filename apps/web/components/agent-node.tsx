"use client";

import type { AgentProfile, ProviderCredential } from "@agent-studio/shared";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Brain, Bot, Cable, Globe, MessageSquareText, Route, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type StudioNodeData = {
  label: string;
  description: string;
  kind: "input" | "agent" | "router" | "http_tool" | "output";
  status?: "idle" | "queued" | "running" | "completed" | "failed" | "skipped";
  agent?: AgentProfile;
  provider?: ProviderCredential;
  subtitle?: string;
  tools?: string[];
  theme?: "dark" | "light";
};

function iconForKind(kind: StudioNodeData["kind"]) {
  switch (kind) {
    case "input":
      return Sparkles;
    case "agent":
      return Bot;
    case "router":
      return Route;
    case "http_tool":
      return Globe;
    case "output":
      return Brain;
  }
}

function glowForStatus(status: StudioNodeData["status"]) {
  switch (status) {
    case "running":
      return "shadow-[0_0_30px_rgba(93,92,255,0.45)] border-indigo-500/80";
    case "completed":
      return "shadow-[0_0_24px_rgba(0,209,149,0.2)] border-emerald-400/60";
    case "failed":
      return "shadow-[0_0_24px_rgba(255,87,87,0.24)] border-rose-400/60";
    case "queued":
      return "shadow-[0_0_24px_rgba(102,102,255,0.18)] border-indigo-300/40";
    default:
      return "border-white/10";
  }
}

export function AgentNode({ data, selected }: NodeProps) {
  const typed = data as StudioNodeData;
  const Icon = iconForKind(typed.kind);
  const isLight = typed.theme === "light";

  return (
    <div
      className={cn(
        "min-w-[290px] rounded-[28px] border p-4 backdrop-blur-xl transition-all",
        isLight ? "bg-white/95 text-slate-900" : "bg-[#11111b]/95 text-white",
        glowForStatus(typed.status),
        selected && "ring-1 ring-indigo-300/50",
      )}
    >
      <div
        className={cn(
          "absolute -left-2 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.22em]",
          isLight ? "bg-slate-100 text-slate-500" : "bg-white/5 text-white/35",
        )}
      >
        in
      </div>
      <div
        className={cn(
          "absolute -right-2 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.22em]",
          isLight ? "bg-slate-100 text-slate-500" : "bg-white/5 text-white/35",
        )}
      >
        out
      </div>
      <Handle
        type="target"
        position={Position.Left}
        className="!h-4 !w-4 !border-2 !border-white/70 !bg-indigo-400"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-4 !w-4 !border-2 !border-white/70 !bg-cyan-400"
      />
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 via-sky-300 to-emerald-300 text-lg text-slate-950 shadow-lg shadow-cyan-500/20">
          {typed.agent?.avatar || <Icon className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="truncate text-2xl font-medium tracking-tight">
                {typed.label}
              </div>
              <div className={cn("truncate text-sm", isLight ? "text-slate-500" : "text-white/35")}>
                {typed.subtitle || typed.provider?.name || typed.kind}
              </div>
            </div>
            <div
              className={cn(
                "mt-1 h-3 w-3 rounded-full",
                typed.status === "running"
                  ? "bg-emerald-400 shadow-[0_0_18px_rgba(16,185,129,0.8)]"
                  : typed.status === "failed"
                    ? "bg-rose-400"
                    : "bg-white/15",
              )}
            />
          </div>
          <p className={cn("mt-3 line-clamp-2 text-sm leading-5", isLight ? "text-slate-500" : "text-white/45")}>
            {typed.description || "Configure this node from the inspector."}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.22em] text-indigo-200/80">
        <span
          className={cn(
            "rounded-full border px-2.5 py-1",
            isLight
              ? "border-indigo-300 bg-indigo-50 text-indigo-600"
              : "border-indigo-400/30 bg-indigo-500/10",
          )}
        >
          {typed.kind === "agent" ? typed.agent?.role || "agent" : typed.kind}
        </span>
        {(typed.tools || []).slice(0, 4).map((tool) => (
          <span
            key={tool}
            className={cn(
              "rounded-full border px-2 py-1 text-[10px] tracking-[0.18em]",
              isLight
                ? "border-slate-200 bg-slate-100 text-slate-500"
                : "border-white/8 bg-white/[0.03] text-white/40",
            )}
          >
            {tool}
          </span>
        ))}
      </div>
      {typed.agent?.notes ? (
        <div
          className={cn(
            "mt-4 rounded-2xl border px-3 py-2 text-sm",
            isLight
              ? "border-amber-200 bg-amber-50 text-slate-600"
              : "border-amber-300/10 bg-amber-400/5 text-white/65",
          )}
        >
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-amber-500">
            <MessageSquareText className="h-3.5 w-3.5" />
            Notes
          </div>
          <div className="mt-1 line-clamp-3 text-sm leading-5">{typed.agent.notes}</div>
        </div>
      ) : null}
      <div className={cn("mt-5 h-1.5 overflow-hidden rounded-full", isLight ? "bg-slate-200" : "bg-white/5")}>
        <div
          className={cn(
            "h-full rounded-full transition-all",
            typed.status === "completed"
              ? "w-full bg-emerald-400"
              : typed.status === "running"
                ? "w-2/3 bg-cyan-300"
                : typed.status === "failed"
                  ? "w-full bg-rose-400"
                  : "w-1/4 bg-white/10",
          )}
        />
      </div>
      <div className={cn("mt-3 flex items-center gap-2 text-[11px]", isLight ? "text-slate-500" : "text-white/30")}>
        <Cable className="h-3.5 w-3.5" />
        <span>
          {typed.kind === "agent"
            ? `model ${typed.agent?.model || "not set"}`
            : "local orchestration node"}
        </span>
      </div>
    </div>
  );
}

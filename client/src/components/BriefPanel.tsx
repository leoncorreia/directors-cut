import { AnimatePresence, motion } from "framer-motion";
import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import type { Revision, RevisionStatus } from "../types";

const briefPlaceholders = [
  "A lone astronaut drifting through a nebula at dusk",
  "Neon-soaked Tokyo alley in heavy rain, one red umbrella",
  "A wolf through snow-covered pines at dawn",
  "Underwater cathedral, light rays through stained glass",
];

type BriefPanelProps = {
  brief: string;
  styleDNA: string;
  aspectRatio: "16:9" | "9:16" | "1:1";
  revisions: Revision[];
  activeRevisionId: string | null;
  isAgentThinking: boolean;
  isVideoGenerating: boolean;
  onBriefChange: (value: string) => void;
  onStyleDNAChange: (value: string) => void;
  onAspectRatioChange: (value: "16:9" | "9:16" | "1:1") => void;
  onDirectShoot: () => void;
  onSelectRevision: (id: string) => void;
};

const statusDotClass: Record<RevisionStatus, string> = {
  pending: "bg-zinc-500",
  generating: "bg-cine-accent animate-pulse",
  done: "bg-green-500",
  error: "bg-red-500",
};

export const BriefPanel = ({
  brief,
  styleDNA,
  aspectRatio,
  revisions,
  activeRevisionId,
  isAgentThinking,
  isVideoGenerating,
  onBriefChange,
  onStyleDNAChange,
  onAspectRatioChange,
  onDirectShoot,
  onSelectRevision,
}: BriefPanelProps): JSX.Element => {
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % briefPlaceholders.length);
    }, 4000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="h-full rounded-card border border-white/10 bg-cine-surface p-4">
      <p className="mb-3 text-[10px] uppercase tracking-[0.22em] text-cine-muted">Director&apos;s Brief</p>

      <textarea
        value={brief}
        onChange={(event) => onBriefChange(event.target.value)}
        placeholder={briefPlaceholders[placeholderIndex]}
        rows={6}
        className="mb-4 w-full resize-none rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-[#f0f0f8] placeholder:text-cine-muted focus:border-cine-accent focus:outline-none"
      />

      <div className="mb-1 flex items-center gap-1.5 text-xs text-cine-muted">
        <span>Style DNA (optional)</span>
        <span className="group relative inline-flex">
          <Info className="h-3.5 w-3.5" />
          <span className="absolute left-4 top-4 z-20 hidden w-56 rounded-md border border-white/10 bg-cine-bg px-2 py-1 text-[11px] text-[#f0f0f8] group-hover:block">
            Describe a director, film, or visual style. The agent will extract a visual fingerprint.
          </span>
        </span>
      </div>

      <input
        value={styleDNA}
        onChange={(event) => onStyleDNAChange(event.target.value)}
        placeholder="e.g. Blade Runner 2049, Wong Kar-wai, Terrence Malick"
        className="mb-4 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-[#f0f0f8] placeholder:text-cine-muted focus:border-cine-accent focus:outline-none"
      />

      <div className="mb-4 flex rounded-full bg-black/30 p-1">
        {(["16:9", "9:16", "1:1"] as const).map((ratio) => (
          <button
            key={ratio}
            type="button"
            className={`flex-1 rounded-full px-3 py-1.5 text-xs transition ${
              aspectRatio === ratio
                ? "bg-cine-accent text-[#f0f0f8]"
                : "text-cine-muted hover:bg-white/5 hover:text-[#f0f0f8]"
            }`}
            onClick={() => onAspectRatioChange(ratio)}
          >
            {ratio}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onDirectShoot}
        disabled={!brief.trim() || isAgentThinking || isVideoGenerating}
        className="mb-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-cine-accent text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isAgentThinking ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            Agent is thinking...
          </>
        ) : (
          "🎬 Direct & Shoot"
        )}
      </button>

      <div className="mb-4 border-b border-white/10" />

      {revisions.length > 0 ? (
        <>
          <p className="mb-2 text-[10px] uppercase tracking-[0.22em] text-cine-muted">Takes</p>
          <AnimatePresence mode="popLayout">
            <div className="flex flex-wrap gap-2">
              {revisions.map((revision) => {
                const isActive = activeRevisionId === revision.id;
                return (
                  <motion.button
                    key={revision.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.3 }}
                    type="button"
                    onClick={() => onSelectRevision(revision.id)}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
                      isActive
                        ? "border-cine-accent text-cine-accent"
                        : "border-white/10 text-cine-muted hover:text-[#f0f0f8]"
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${statusDotClass[revision.status]}`} />
                    Take {revision.takeNumber}
                  </motion.button>
                );
              })}
            </div>
          </AnimatePresence>
        </>
      ) : null}
    </div>
  );
};

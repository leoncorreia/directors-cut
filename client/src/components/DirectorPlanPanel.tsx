import { motion } from "framer-motion";
import { ChevronDown, ChevronUp, Copy, Film } from "lucide-react";
import { useMemo, useState } from "react";
import type { Revision } from "../types";

type DirectorPlanPanelProps = {
  activeRevision: Revision | null;
  latestRevisionId: string | null;
  onCopyPrompt: (text: string) => void;
};

const panelMotion = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3 },
};

export const DirectorPlanPanel = ({
  activeRevision,
  latestRevisionId,
  onCopyPrompt,
}: DirectorPlanPanelProps): JSX.Element => {
  const [isOpen, setIsOpen] = useState(true);

  const palette = useMemo(() => activeRevision?.agentResponse.shotPlan.colorPalette ?? [], [activeRevision]);

  if (!activeRevision) {
    return (
      <div className="flex h-full items-center justify-center rounded-card border border-white/10 bg-cine-surface p-4 text-cine-muted">
        <div className="text-center">
          <Film className="mx-auto mb-3 h-8 w-8" />
          <p>Your shot plan will appear here</p>
        </div>
      </div>
    );
  }

  const { agentResponse } = activeRevision;
  const shot = agentResponse.shotPlan;
  const fields: Array<{ label: string; value: string }> = [
    { label: "Scene", value: shot.scene },
    { label: "Mood", value: shot.mood },
    { label: "Camera", value: shot.cameraMotion },
    { label: "Lighting", value: shot.lighting },
    { label: "Pacing", value: shot.pacing },
    { label: "Style", value: shot.style },
    { label: "Subjects", value: shot.subjects },
    { label: "Background", value: shot.background },
  ];

  return (
    <motion.div {...panelMotion} className="h-full overflow-y-auto rounded-card border border-white/10 bg-cine-surface p-4">
      <div className="mb-3 rounded-lg border border-white/10 bg-black/20 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-[0.22em] text-cine-muted">Director&apos;s Notes</p>
          <button type="button" onClick={() => setIsOpen((prev) => !prev)} className="text-cine-muted">
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
        {isOpen ? <p className="text-sm italic leading-[1.7] text-[#f0f0f8]">💭 {agentResponse.directorNotes}</p> : null}
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-2">
        {fields.map((field) => (
          <div key={field.label} className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-cine-muted">{field.label}</p>
            <p className="text-sm text-[#f0f0f8]">{field.value}</p>
          </div>
        ))}
        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-cine-muted">Color Palette</p>
          <div className="flex gap-3">
            {palette.map((color) => (
              <div key={color} className="text-center">
                <div className="mx-auto mb-1 h-5 w-5 rounded-full border border-white/20" style={{ backgroundColor: color }} />
                <p className="text-[11px] text-cine-muted">{color}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        className={`relative mb-3 rounded-lg border bg-[#0d0d14] p-3 font-mono text-xs text-[#f0f0f8] ${
          activeRevision.id === latestRevisionId ? "animate-pulse border-cine-accent/40" : "border-white/10"
        }`}
      >
        <p className="mb-2 text-[10px] uppercase tracking-[0.22em] text-cine-muted">Seedance Prompt</p>
        <button
          type="button"
          onClick={() => onCopyPrompt(agentResponse.seedancePrompt)}
          className="absolute right-3 top-3 rounded border border-white/10 p-1 text-cine-muted hover:text-[#f0f0f8]"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        {agentResponse.seedancePrompt}
      </div>

      <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-amber-400">
        <p className="mb-1 text-[10px] uppercase tracking-[0.18em]">Director&apos;s Critique</p>
        <p className="text-sm">⚠️ {agentResponse.critique}</p>
      </div>
    </motion.div>
  );
};

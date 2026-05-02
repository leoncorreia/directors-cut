import { motion } from "framer-motion";
import { Film } from "lucide-react";
import { useEffect, useState } from "react";
import type { Revision } from "../types";

const feedbackPlaceholders = [
  "Make it warmer and more golden",
  "Add more camera movement — slow dolly in",
  "The mood is too dark, lighten it up",
  "Add fog or mist to the background",
  "Make it more cinematic, less digital-looking",
];

type AspectRatio = "16:9" | "9:16" | "1:1";

type OutputPanelProps = {
  activeRevision: Revision | null;
  revisions: Revision[];
  aspectRatio: AspectRatio;
  isAgentThinking: boolean;
  isVideoGenerating: boolean;
  onRefine: (feedback: string) => Promise<void>;
  onSelectRevision: (id: string) => void;
};

const formatElapsed = (seconds: number): string => {
  const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");
  return `${mins}:${secs}`;
};

export const OutputPanel = ({
  activeRevision,
  revisions,
  aspectRatio,
  isAgentThinking,
  isVideoGenerating,
  onRefine,
  onSelectRevision,
}: OutputPanelProps): JSX.Element => {
  const [feedback, setFeedback] = useState("");
  const [feedbackPlaceholderIndex, setFeedbackPlaceholderIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [compareMode, setCompareMode] = useState(false);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setFeedbackPlaceholderIndex((prev) => (prev + 1) % feedbackPlaceholders.length);
    }, 4000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!activeRevision || activeRevision.status !== "generating") {
      setElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeRevision?.id, activeRevision?.status]);

  const showVideo = activeRevision?.status === "done" && activeRevision.videoUrl;
  const compareRevisions = revisions.filter((rev) => rev.status === "done" && rev.videoUrl).slice(-3).reverse();
  const canCompare = compareRevisions.length >= 2;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex h-full flex-col rounded-card border border-white/10 bg-cine-surface p-4"
    >
      <div className="relative mb-3 overflow-hidden rounded-lg border border-white/10 bg-black/30" style={{ aspectRatio: "16 / 9" }}>
        {activeRevision?.status === "generating" ? (
          <>
            <div className="absolute left-0 top-0 h-1 w-full overflow-hidden bg-white/10">
              <div className="h-full w-1/3 animate-shimmer bg-cine-accent/80" />
            </div>
            <div className="absolute bottom-0 left-0 h-1.5 w-full bg-gradient-to-r from-cine-accent/10 via-cine-accent to-cine-accent/10 animate-pulse" />
            <div className="flex h-full flex-col items-center justify-center gap-2 text-cine-muted">
              <div className="flex items-center gap-2 text-sm text-[#f0f0f8]">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                Camera is rolling...
              </div>
              <p className="text-xs text-cine-muted">Seedance is rendering your shot... (~30-60s)</p>
              <p className="text-xs text-cine-muted">{formatElapsed(elapsed)}</p>
            </div>
          </>
        ) : null}

        {!activeRevision || activeRevision.status === "pending" ? (
          <div className="flex h-full items-center justify-center text-cine-muted">
            <Film className="h-8 w-8" />
          </div>
        ) : null}

        {showVideo ? (
          <video
            controls
            muted
            autoPlay
            loop
            src={activeRevision.videoUrl ?? undefined}
            className="h-full w-full object-cover"
          />
        ) : null}

        {activeRevision?.status === "error" ? (
          <div className="flex h-full items-center justify-center bg-red-500/20 px-4 text-center text-sm text-red-200">
            {activeRevision.errorMessage ?? "Video generation failed."}
          </div>
        ) : null}
      </div>

      {activeRevision?.status === "done" ? (
        <div className="mb-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.22em] text-cine-muted">Director&apos;s Feedback</p>
            {canCompare ? (
              <button
                type="button"
                onClick={() => setCompareMode((prev) => !prev)}
                className="rounded-md border border-white/20 px-2 py-1 text-[10px] text-cine-muted hover:text-[#f0f0f8]"
              >
                {compareMode ? "Hide Compare" : "Compare Last 3"}
              </button>
            ) : null}
          </div>
          {compareMode ? (
            <div className="mb-2 grid grid-cols-1 gap-2 min-[1280px]:grid-cols-3">
              {compareRevisions.map((rev) => (
                <button
                  key={rev.id}
                  type="button"
                  onClick={() => onSelectRevision(rev.id)}
                  className={`overflow-hidden rounded-lg border text-left ${
                    activeRevision?.id === rev.id ? "border-cine-accent" : "border-white/10"
                  }`}
                >
                  <div className="bg-black/30" style={{ aspectRatio: "16 / 9" }}>
                    <video src={rev.videoUrl ?? undefined} className="h-full w-full object-cover" muted loop />
                  </div>
                  <div className="px-2 py-1">
                    <p className="text-xs text-[#f0f0f8]">Take {rev.takeNumber}</p>
                    <p className="truncate text-[11px] text-cine-muted">{rev.agentResponse.shotPlan.mood}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : null}
          <textarea
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            rows={3}
            placeholder={feedbackPlaceholders[feedbackPlaceholderIndex]}
            className="mb-2 w-full resize-none rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-[#f0f0f8] placeholder:text-cine-muted focus:border-cine-accent focus:outline-none"
          />
          <button
            type="button"
            disabled={!feedback.trim() || isAgentThinking || isVideoGenerating}
            onClick={async () => {
              const message = feedback.trim();
              if (!message) return;
              await onRefine(message);
              setFeedback("");
            }}
            className="w-full rounded-lg border border-cine-accent/50 py-2 text-sm text-cine-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            🔄 Refine Shot
          </button>
        </div>
      ) : null}

      <div className="mt-auto text-xs text-cine-muted">
        {activeRevision ? (
          <>
            Take {activeRevision.takeNumber} ·{" "}
            {activeRevision.createdAt.toLocaleTimeString("en-US", {
              hour12: false,
            })}{" "}
            · {aspectRatio}
          </>
        ) : (
          "No active take"
        )}
      </div>
    </motion.div>
  );
};

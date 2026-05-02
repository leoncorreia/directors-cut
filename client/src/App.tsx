import axios, { type AxiosError } from "axios";
import { nanoid } from "nanoid";
import { useEffect, useMemo, useState } from "react";
import { BriefPanel } from "./components/BriefPanel";
import { DirectorPlanPanel } from "./components/DirectorPlanPanel";
import { OutputPanel } from "./components/OutputPanel";
import { SubmitModal } from "./components/SubmitModal";
import { Toast } from "./components/Toast";
import { useDirectorAgent } from "./hooks/useDirectorAgent";
import { useToast } from "./hooks/useToast";
import type { Revision } from "./types";
import {
  createRevision,
  createSession,
  getRevisions,
  getSession,
  updateRevision,
} from "./utils/butterbase";
import { exportDirectorsNotesPDF } from "./utils/exportPDF";
import { storeVideoToButterbase } from "./utils/storeVideo";

type AspectRatio = "16:9" | "9:16" | "1:1";

const API_BASE = import.meta.env.VITE_API_BASE?.trim() || "http://localhost:3001";
const SESSION_STORAGE_KEY = "cineagent_session_id";

const aspectMap: Record<AspectRatio, string> = {
  "16:9": "16:9",
  "9:16": "9:16",
  "1:1": "1:1",
};

type VideoResult = {
  videoUrl: string;
  taskId?: string;
};

function App() {
  const { generateShotPlan, refineWithFeedback } = useDirectorAgent();
  const { toasts, showToast, removeToast } = useToast();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [brief, setBrief] = useState("");
  const [styleDNA, setStyleDNA] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [activeRevisionId, setActiveRevisionId] = useState<string | null>(null);
  const [isAgentThinking, setIsAgentThinking] = useState(false);
  const [isVideoGenerating, setIsVideoGenerating] = useState(false);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);

  if (import.meta.env.DEV) {
    console.assert(!(isAgentThinking && isVideoGenerating), "State conflict: both thinking and generating");
  }

  useEffect(() => {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!stored || !import.meta.env.VITE_BUTTERBASE_APP_ID) return;

    void (async () => {
      try {
        const session = await getSession(stored);
        const revRows = await getRevisions(stored);
        if (session) {
          setSessionId(stored);
          setBrief(session.brief);
          setStyleDNA(session.style_dna ?? "");
          setAspectRatio(session.aspect_ratio as AspectRatio);
          setRevisions(revRows);
          if (revRows.length > 0) {
            setActiveRevisionId(revRows[revRows.length - 1].id);
          }
        }
      } catch (error: unknown) {
        console.warn("[CineAgent] Could not hydrate session from Butterbase", error);
      }
    })();
  }, []);

  useEffect(() => {
    if (sessionId) {
      localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    }
  }, [sessionId]);

  const activeRevision = useMemo(
    () => revisions.find((revision) => revision.id === activeRevisionId) ?? null,
    [activeRevisionId, revisions],
  );

  const setRevisionUpdates = (id: string, updates: Partial<Revision>): void => {
    setRevisions((prev) => prev.map((revision) => (revision.id === id ? { ...revision, ...updates } : revision)));
  };

  const notifyButterbaseWriteFailure = (): void => {
    showToast("info", "Could not sync with Butterbase — your video still works locally.");
  };

  const unwrapPayload = (data: Record<string, unknown>): Record<string, unknown> => {
    const inner = data.data;
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      return inner as Record<string, unknown>;
    }
    return data;
  };

  const extractStatusVideo = (raw: Record<string, unknown>): string | null => {
    const data = unwrapPayload(raw);
    const content = data.content as { video_url?: string } | undefined;
    if (content?.video_url) return content.video_url;

    const results = data.results as unknown[] | undefined;
    const output = data.output as unknown[] | undefined;
    const single = data.result;

    const values: unknown[] = [...(results ?? []), ...(output ?? []), ...(single ? [single] : [])];
    for (const value of values) {
      if (typeof value === "string") return value;
      if (value && typeof value === "object") {
        const obj = value as { url?: string; data?: string };
        if (obj.url) return obj.url;
        if (obj.data) return obj.data;
      }
    }
    return null;
  };

  const pollVideoStatus = async (taskId: string): Promise<VideoResult> => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = await axios.get<Record<string, unknown>>(`${API_BASE}/api/video-status/${taskId}`);
      const data = unwrapPayload(response.data);
      const status = String(data.status ?? "").toLowerCase();
      if (status === "completed" || status === "success" || status === "succeeded") {
        const video = extractStatusVideo(response.data);
        if (!video) {
          throw new Error("Seedance completed but no video URL was returned.");
        }
        return { videoUrl: video, taskId };
      }
      if (status === "failed" || status === "fail" || status === "cancelled" || status === "expired") {
        const errObj = data.error as { message?: string } | string | undefined;
        const errorMessage =
          typeof errObj === "string" ? errObj : errObj && typeof errObj === "object" ? errObj.message : undefined;
        throw new Error(errorMessage ?? "Seedance failed to render.");
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    throw new Error("Polling timeout reached (150 seconds).");
  };

  const requestVideo = async (prompt: string, ratio: AspectRatio): Promise<VideoResult> => {
    try {
      const response = await axios.post<VideoResult>(
        `${API_BASE}/api/generate-video`,
        {
          prompt,
          aspect_ratio: aspectMap[ratio],
        },
        { timeout: 130000 },
      );
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ error?: string; taskId?: string }>;
      const isTimeout = axiosError.code === "ECONNABORTED";
      const isGatewayTimeout = axiosError.response?.status === 504;
      const taskId = axiosError.response?.data?.taskId;
      if ((isTimeout || isGatewayTimeout) && taskId) {
        return pollVideoStatus(taskId);
      }
      throw error;
    }
  };

  const finalizeVideo = async (
    revisionId: string,
    persistedToBb: boolean,
    seedanceUrl: string,
    takeLabel: number,
  ): Promise<void> => {
    let finalUrl = seedanceUrl;
    if (seedanceUrl.startsWith("http")) {
      const storedUrl = await storeVideoToButterbase(seedanceUrl, revisionId);
      if (storedUrl) {
        finalUrl = storedUrl;
      }
    }

    if (persistedToBb) {
      try {
        await updateRevision(revisionId, { status: "done", videoUrl: finalUrl });
      } catch (error: unknown) {
        console.error("[CineAgent] updateRevision failed", error);
        notifyButterbaseWriteFailure();
      }
    }

    setRevisionUpdates(revisionId, { status: "done", videoUrl: finalUrl });
    showToast("success", `Video ready! Take ${takeLabel} complete.`);
  };

  const handleDirectShoot = async (): Promise<void> => {
    try {
      setIsAgentThinking(true);
      const agentResponse = await generateShotPlan(brief, styleDNA);

      let sid = sessionId;
      if (!sid) {
        try {
          const created = await createSession(brief, styleDNA, aspectRatio);
          sid = created.id;
          setSessionId(sid);
        } catch (error: unknown) {
          console.error("[CineAgent] createSession", error);
          notifyButterbaseWriteFailure();
        }
      }

      const takeNumber = revisions.length + 1;
      let revisionId: string;
      let persistedToBb = false;

      if (sid) {
        try {
          const created = await createRevision(sid, takeNumber, agentResponse, agentResponse.seedancePrompt, "");
          revisionId = created.id;
          persistedToBb = true;
        } catch (error: unknown) {
          console.error("[CineAgent] createRevision", error);
          notifyButterbaseWriteFailure();
          revisionId = nanoid();
        }
      } else {
        revisionId = nanoid();
      }

      const revision: Revision = {
        id: revisionId,
        sessionId: sid ?? "",
        takeNumber,
        feedback: "",
        agentResponse,
        seedancePrompt: agentResponse.seedancePrompt,
        videoUrl: null,
        status: "generating",
        createdAt: new Date(),
      };

      setRevisions((prev) => [...prev, revision]);
      setActiveRevisionId(revisionId);
      setIsAgentThinking(false);
      setIsVideoGenerating(true);
      showToast("info", "Shot plan ready! Sending to Seedance...");

      try {
        const video = await requestVideo(agentResponse.seedancePrompt, aspectRatio);
        await finalizeVideo(revisionId, persistedToBb, video.videoUrl, takeNumber);
      } catch (videoError: unknown) {
        const message =
          (videoError as AxiosError<{ error?: string }>)?.response?.data?.error ??
          (videoError as Error).message ??
          "Unknown Seedance error";
        setRevisionUpdates(revisionId, { status: "error", errorMessage: message });
        showToast("error", `Seedance error: ${message}`);
        if (persistedToBb) {
          try {
            await updateRevision(revisionId, { status: "error", errorMessage: message });
          } catch (error: unknown) {
            console.error("[CineAgent] updateRevision error state failed", error);
            notifyButterbaseWriteFailure();
          }
        }
      } finally {
        setIsVideoGenerating(false);
      }
    } catch (error: unknown) {
      setIsAgentThinking(false);
      showToast("error", (error as Error).message);
    }
  };

  const handleRefineShot = async (feedback: string): Promise<void> => {
    if (!activeRevision) return;
    try {
      setIsAgentThinking(true);
      const refined = await refineWithFeedback(
        brief,
        activeRevision.agentResponse.shotPlan,
        activeRevision.seedancePrompt,
        feedback,
      );

      let sid = sessionId;
      if (!sid) {
        try {
          const created = await createSession(brief, styleDNA, aspectRatio);
          sid = created.id;
          setSessionId(sid);
        } catch (error: unknown) {
          console.error("[CineAgent] createSession (refine)", error);
          notifyButterbaseWriteFailure();
        }
      }
      const takeNumber = revisions.length + 1;
      let revisionId: string;
      let persistedToBb = false;

      if (sid) {
        try {
          const created = await createRevision(sid, takeNumber, refined, refined.seedancePrompt, feedback);
          revisionId = created.id;
          persistedToBb = true;
        } catch (error: unknown) {
          console.error("[CineAgent] createRevision (refine)", error);
          notifyButterbaseWriteFailure();
          revisionId = nanoid();
        }
      } else {
        revisionId = nanoid();
      }

      const nextRevision: Revision = {
        id: revisionId,
        sessionId: sid ?? "",
        takeNumber,
        feedback,
        agentResponse: refined,
        seedancePrompt: refined.seedancePrompt,
        videoUrl: null,
        status: "generating",
        createdAt: new Date(),
      };

      setRevisions((prev) => [...prev, nextRevision]);
      setActiveRevisionId(revisionId);
      setIsAgentThinking(false);
      setIsVideoGenerating(true);
      showToast("info", "Shot plan ready! Sending to Seedance...");

      try {
        const video = await requestVideo(refined.seedancePrompt, aspectRatio);
        await finalizeVideo(revisionId, persistedToBb, video.videoUrl, takeNumber);
      } catch (videoError: unknown) {
        const message =
          (videoError as AxiosError<{ error?: string }>)?.response?.data?.error ??
          (videoError as Error).message ??
          "Unknown Seedance error";
        setRevisionUpdates(revisionId, { status: "error", errorMessage: message });
        showToast("error", `Seedance error: ${message}`);
        if (persistedToBb) {
          try {
            await updateRevision(revisionId, { status: "error", errorMessage: message });
          } catch (error: unknown) {
            console.error("[CineAgent] updateRevision error state failed", error);
            notifyButterbaseWriteFailure();
          }
        }
      } finally {
        setIsVideoGenerating(false);
      }
    } catch (error: unknown) {
      setIsAgentThinking(false);
      showToast("error", (error as Error).message);
    }
  };

  const hasDoneRevision = revisions.some((r) => r.status === "done");
  const hasAnyRevision = revisions.length > 0;

  return (
    <div className="min-h-screen bg-cine-bg text-[#f0f0f8]">
      <header className="fixed left-0 right-0 top-0 z-30 flex h-14 items-center justify-between border-b border-white/10 bg-cine-bg px-4">
        <h1 className="text-lg font-semibold">🎬 Director&apos;s Cut</h1>
        <div className="flex items-center gap-2">
          {hasDoneRevision ? (
            <button
              type="button"
              onClick={() => setSubmitModalOpen(true)}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-cine-muted hover:text-[#f0f0f8]"
            >
              🏆 Submit
            </button>
          ) : null}
          <button
            type="button"
            disabled={!hasAnyRevision}
            onClick={() => exportDirectorsNotesPDF(brief, styleDNA, revisions)}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-cine-muted hover:text-[#f0f0f8] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export Director&apos;s Notes
          </button>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-cine-muted">v1.0</span>
        </div>
      </header>

      <main className="grid min-h-[calc(100vh-56px)] grid-cols-1 gap-4 p-4 pt-[72px] min-[1280px]:grid-cols-3">
        <BriefPanel
          brief={brief}
          styleDNA={styleDNA}
          aspectRatio={aspectRatio}
          revisions={revisions}
          activeRevisionId={activeRevisionId}
          isAgentThinking={isAgentThinking}
          isVideoGenerating={isVideoGenerating}
          onBriefChange={setBrief}
          onStyleDNAChange={setStyleDNA}
          onAspectRatioChange={setAspectRatio}
          onDirectShoot={handleDirectShoot}
          onSelectRevision={setActiveRevisionId}
        />
        <DirectorPlanPanel
          activeRevision={activeRevision}
          latestRevisionId={revisions.length > 0 ? revisions[revisions.length - 1].id : null}
          onCopyPrompt={(text) => {
            navigator.clipboard.writeText(text);
            showToast("success", "Copied to clipboard");
          }}
        />
        <OutputPanel
          activeRevision={activeRevision}
          revisions={revisions}
          aspectRatio={aspectRatio}
          isAgentThinking={isAgentThinking}
          isVideoGenerating={isVideoGenerating}
          onRefine={handleRefineShot}
          onSelectRevision={setActiveRevisionId}
        />
      </main>

      <Toast toasts={toasts} onRemove={removeToast} />

      <SubmitModal
        open={submitModalOpen}
        onClose={() => setSubmitModalOpen(false)}
        onSuccess={() => showToast("success", "🏆 Submitted! Good luck!")}
        onError={(msg) => showToast("error", msg)}
        onSchemaError={() => {
          /* schema shown inline in modal */
        }}
      />
    </div>
  );
}

export default App;

export type ShotPlan = {
  scene: string;
  mood: string;
  colorPalette: string[];
  cameraMotion: string;
  lighting: string;
  pacing: string;
  subjects: string;
  background: string;
  style: string;
};

export type AgentResponse = {
  directorNotes: string;
  shotPlan: ShotPlan;
  seedancePrompt: string;
  critique: string;
};

export type RevisionStatus = "pending" | "generating" | "done" | "error";

export type Revision = {
  id: string;
  sessionId: string;
  takeNumber: number;
  feedback: string;
  agentResponse: AgentResponse;
  seedancePrompt: string;
  videoUrl: string | null;
  status: RevisionStatus;
  errorMessage?: string;
  createdAt: Date;
};

export type SessionState = {
  sessionId: string | null;
  brief: string;
  styleDNA: string;
  aspectRatio: "16:9" | "9:16" | "1:1";
  revisions: Revision[];
  activeRevisionId: string | null;
  isAgentThinking: boolean;
  isVideoGenerating: boolean;
};

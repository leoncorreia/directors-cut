import axios, { type AxiosError } from "axios";
import type { AgentResponse, Revision, ShotPlan } from "../types";

const apiBase = import.meta.env.VITE_API_BASE?.trim() || "http://localhost:3001";
export const BASE = `${apiBase}/api/bb`;

type SessionRow = {
  id: string;
  brief: string;
  style_dna: string | null;
  aspect_ratio: string;
  created_at: string;
};

type RevisionRow = {
  id: string;
  session_id: string;
  take_number: number;
  feedback: string | null;
  director_notes: string;
  shot_plan: ShotPlan;
  seedance_prompt: string;
  critique: string;
  video_url: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
};

const mapRowToRevision = (row: RevisionRow): Revision => ({
  id: row.id,
  sessionId: row.session_id,
  takeNumber: row.take_number,
  feedback: row.feedback ?? "",
  agentResponse: {
    directorNotes: row.director_notes,
    shotPlan: row.shot_plan,
    seedancePrompt: row.seedance_prompt,
    critique: row.critique,
  },
  seedancePrompt: row.seedance_prompt,
  videoUrl: row.video_url,
  status: row.status as Revision["status"],
  errorMessage: row.error_message ?? undefined,
  createdAt: new Date(row.created_at),
});

export async function createSession(
  brief: string,
  styleDNA: string,
  aspectRatio: string,
): Promise<{ id: string }> {
  try {
    const { data } = await axios.post<SessionRow[] | SessionRow>(
      `${BASE}/sessions`,
      {
        brief,
        style_dna: styleDNA,
        aspect_ratio: aspectRatio,
      },
    );
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.id) {
      throw new Error("Butterbase did not return a session id.");
    }
    return { id: row.id };
  } catch (error: unknown) {
    const ax = error as AxiosError<{ message?: string }>;
    if (ax.response?.status === 409) {
      throw new Error("Database schema not ready. Ask an organizer for help.");
    }
    throw error;
  }
}

export async function createRevision(
  sessionId: string,
  takeNumber: number,
  agentResponse: AgentResponse,
  seedancePrompt: string,
  feedback: string,
): Promise<{ id: string }> {
  try {
    const { data } = await axios.post<RevisionRow[] | RevisionRow>(
      `${BASE}/revisions`,
      {
        session_id: sessionId,
        take_number: takeNumber,
        feedback,
        director_notes: agentResponse.directorNotes,
        shot_plan: agentResponse.shotPlan,
        seedance_prompt: seedancePrompt,
        critique: agentResponse.critique,
        video_url: null,
        status: "generating",
      },
    );
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.id) {
      throw new Error("Butterbase did not return a revision id.");
    }
    return { id: row.id };
  } catch (error: unknown) {
    const ax = error as AxiosError<{ message?: string }>;
    if (ax.response?.status === 409) {
      throw new Error("Database schema not ready. Ask an organizer for help.");
    }
    throw error;
  }
}

export async function updateRevision(id: string, patch: Partial<Revision>): Promise<void> {
  const body: Record<string, unknown> = {};
  if (patch.feedback !== undefined) body.feedback = patch.feedback;
  if (patch.videoUrl !== undefined) body.video_url = patch.videoUrl;
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.errorMessage !== undefined) body.error_message = patch.errorMessage;
  if (patch.seedancePrompt !== undefined) body.seedance_prompt = patch.seedancePrompt;
  if (patch.agentResponse !== undefined) {
    body.director_notes = patch.agentResponse.directorNotes;
    body.shot_plan = patch.agentResponse.shotPlan;
    body.critique = patch.agentResponse.critique;
  }
  if (Object.keys(body).length === 0) return;
  await axios.patch(`${BASE}/revisions/${id}`, body);
}

export async function getRevisions(sessionId: string): Promise<Revision[]> {
  const { data } = await axios.get<RevisionRow[]>(`${BASE}/revisions`, {
    params: { session_id: sessionId },
  });
  return data.map(mapRowToRevision);
}

export async function getSession(sessionId: string): Promise<SessionRow | null> {
  const { data } = await axios.get<SessionRow | null>(`${BASE}/sessions/${sessionId}`);
  return data;
}

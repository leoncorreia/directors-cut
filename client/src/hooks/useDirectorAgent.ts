import type { AgentResponse, ShotPlan } from "../types";

const MODEL_NAME = import.meta.env.VITE_ZAI_MODEL ?? "glm-5.1";
/** OpenAI-compatible base URL (no trailing slash). See https://docs.z.ai/guides/llm/glm-5.1 */
const ZAI_API_BASE =
  (import.meta.env.VITE_ZAI_BASE_URL ?? "https://api.z.ai/api/paas/v4").replace(/\/$/, "");

const SHOT_PLAN_SYSTEM_PROMPT = `
You are Director's Cut, an AI film director. Your job is to transform a rough
creative brief into a precise, production-ready shot plan for AI video 
generation. Think like a cinematographer: consider framing, lighting, 
camera motion, color palette, and emotional pacing.

When given a brief, reason through your creative choices step by step, 
then output a structured JSON shot plan. Your reasoning should be visible 
and insightful — explain WHY you made each choice, not just what.

Always respond in this exact JSON format (no markdown fences, raw JSON only):
{
  "directorNotes": "string — your visible chain-of-thought reasoning, 
    2-4 paragraphs, written as a creative director explaining their vision",
  "shotPlan": {
    "scene": "string",
    "mood": "string",
    "colorPalette": ["string", "string", "string"],
    "cameraMotion": "string",
    "lighting": "string",
    "pacing": "string",
    "subjects": "string",
    "background": "string",
    "style": "string"
  },
  "seedancePrompt": "string — 80-120 word rich paragraph. Lead with 
    subject+action, layer camera motion, lighting, mood, style. 
    Use cinematic language.",
  "critique": "string — one sentence self-critique"
}
`.trim();

const REFINE_SYSTEM_PROMPT = `
You are Director's Cut refining your previous shot. You receive your original 
shot plan and user feedback. Explain what you changed and why, then output
a refined plan in the identical JSON format. Start directorNotes with 
"REVISION: ". Preserve elements the user did not ask to change.
`.trim();

type ZaiChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string | null; reasoning_content?: string | null } }>;
  error?: { message?: string; code?: string };
};

const extractFirstJsonObject = (text: string): string => {
  const clean = text.replace(/```json|```/gi, "").trim();
  const start = clean.indexOf("{");
  if (start < 0) return clean;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < clean.length; i += 1) {
    const ch = clean[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return clean.slice(start, i + 1);
      }
    }
  }

  return clean.slice(start);
};

const parseAgentJson = (raw: string): Record<string, unknown> => {
  const parsed = JSON.parse(extractFirstJsonObject(raw)) as Record<string, unknown>;
  return parsed;
};

const mapZaiError = (error: unknown): string => {
  const msg =
    error instanceof Error ? error.message : typeof error === "string" ? error : String(error);

  if (error instanceof TypeError || /network|fetch|Failed to fetch|ENOTFOUND|ECONNREFUSED/i.test(msg)) {
    return "Z.AI API unreachable. Check your network and API key.";
  }
  if (/\b429\b/.test(msg)) {
    return "Rate limit hit. Please wait and try again.";
  }
  return msg.trim() || "Z.AI request failed.";
};

const buildSeedancePrompt = (shot: ShotPlan): string => {
  return [
    `${shot.subjects || shot.scene}.`,
    `Scene: ${shot.scene}.`,
    `Mood: ${shot.mood}.`,
    `Camera: ${shot.cameraMotion}.`,
    `Lighting: ${shot.lighting}.`,
    `Pacing: ${shot.pacing}.`,
    `Background: ${shot.background}.`,
    `Style: ${shot.style}.`,
    shot.colorPalette.length ? `Palette: ${shot.colorPalette.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
};

const normalizeAgentResponse = (data: Record<string, unknown>, fallbackNotes = ""): AgentResponse => {
  const fallbackShot: ShotPlan = {
    scene: "",
    mood: "",
    colorPalette: [],
    cameraMotion: "",
    lighting: "",
    pacing: "",
    subjects: "",
    background: "",
    style: "",
  };

  const maybeShotPlanOnly =
    !("shotPlan" in data) &&
    ("scene" in data || "mood" in data || "cameraMotion" in data || "lighting" in data);
  const sourceShot = (maybeShotPlanOnly ? data : (data.shotPlan ?? {})) as Record<string, unknown>;
  const paletteRaw = sourceShot.colorPalette;
  const normalizedPalette = Array.isArray(paletteRaw)
    ? paletteRaw.map((item) => String(item)).filter(Boolean)
    : typeof paletteRaw === "string"
      ? paletteRaw
          .split(",")
          .map((item: string) => item.trim())
          .filter(Boolean)
      : [];

  const shot: ShotPlan = {
    ...fallbackShot,
    scene: String(sourceShot.scene ?? "").trim(),
    mood: String(sourceShot.mood ?? "").trim(),
    colorPalette: normalizedPalette,
    cameraMotion: String(sourceShot.cameraMotion ?? "").trim(),
    lighting: String(sourceShot.lighting ?? "").trim(),
    pacing: String(sourceShot.pacing ?? "").trim(),
    subjects: String(sourceShot.subjects ?? "").trim(),
    background: String(sourceShot.background ?? "").trim(),
    style: String(sourceShot.style ?? "").trim(),
  };

  const normalized: AgentResponse = {
    directorNotes: String(data.directorNotes ?? fallbackNotes).trim(),
    shotPlan: shot,
    seedancePrompt: String(data.seedancePrompt ?? "").trim() || buildSeedancePrompt(shot),
    critique: String(data.critique ?? "").trim() || "Refined for stronger cinematic clarity and prompt fidelity.",
  };

  if (!normalized.directorNotes || !normalized.seedancePrompt || !normalized.critique || !normalized.shotPlan.scene) {
    throw new Error("Invalid agent response format.");
  }

  return normalized;
};

async function chatCompletion(
  apiKey: string,
  systemInstruction: string,
  userMessage: string,
): Promise<{ content: string; reasoning: string }> {
  const url = `${ZAI_API_BASE}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: userMessage },
      ],
      thinking: { type: "enabled" },
      max_tokens: 4096,
      temperature: 1.0,
    }),
  });

  const data = (await res.json()) as ZaiChatCompletionResponse;

  if (!res.ok) {
    const apiMsg = data.error?.message ?? res.statusText;
    throw new Error(apiMsg || `HTTP ${res.status}`);
  }

  const content = data.choices?.[0]?.message?.content;
  const reasoning = data.choices?.[0]?.message?.reasoning_content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Z.AI returned an empty response.");
  }
  return { content, reasoning: typeof reasoning === "string" ? reasoning : "" };
}

const runGeneration = async (systemInstruction: string, userMessage: string): Promise<AgentResponse> => {
  const apiKey = import.meta.env.VITE_ZAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing VITE_ZAI_API_KEY. Add it to your .env file.");
  }

  try {
    const first = await chatCompletion(apiKey, systemInstruction, userMessage);
    try {
      return normalizeAgentResponse(parseAgentJson(first.content), first.reasoning);
    } catch {
      const retryUser = `${userMessage}\n\nReturn only raw JSON, no backticks, no prose`;
      const retry = await chatCompletion(apiKey, systemInstruction, retryUser);
      return normalizeAgentResponse(parseAgentJson(retry.content), retry.reasoning || first.reasoning);
    }
  } catch (error: unknown) {
    const message = mapZaiError(error);
    throw new Error(message);
  }
};

export const useDirectorAgent = () => {
  const generateShotPlan = async (brief: string, styleDNA: string): Promise<AgentResponse> => {
    const userMessage = `Brief: ${brief}\nStyle DNA: ${styleDNA || "None provided"}`;
    return runGeneration(SHOT_PLAN_SYSTEM_PROMPT, userMessage);
  };

  const refineWithFeedback = async (
    originalBrief: string,
    previousShotPlan: ShotPlan,
    previousPrompt: string,
    feedback: string,
  ): Promise<AgentResponse> => {
    const userMessage = `Original brief: ${originalBrief}
Previous shot plan: ${JSON.stringify(previousShotPlan)}
Previous Seedance prompt: ${previousPrompt}
User feedback: ${feedback}`;
    return runGeneration(REFINE_SYSTEM_PROMPT, userMessage);
  };

  return {
    generateShotPlan,
    refineWithFeedback,
  };
};

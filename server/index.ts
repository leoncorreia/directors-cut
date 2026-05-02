import express, { type Request, type Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios, { type AxiosRequestConfig } from "axios";
import path from "path";

// Load repo-root `.env` when the process cwd is `server/` (dev + Render with rootDir server).
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

const app = express();
const PORT = Number.parseInt(process.env.PORT ?? "3001", 10) || 3001;
const REQUEST_TIMEOUT_MS = 130_000;
const GENERATION_TIMEOUT_MS = 120_000;
const STATUS_POLL_INTERVAL_MS = 3_000;

const seedanceApiKey = process.env.SEEDANCE_API_KEY;
const seedanceApiBase = process.env.SEEDANCE_API_BASE ?? "https://api.seedance.ai";
const seedanceModel = process.env.SEEDANCE_MODEL ?? "seedance-2.0-text-to-video";
const seedanceResolution = process.env.SEEDANCE_RESOLUTION ?? "720p";
const seedanceGenerateAudio = process.env.SEEDANCE_GENERATE_AUDIO !== "false";
const butterbaseApiUrl = process.env.BUTTERBASE_API_URL ?? process.env.VITE_BUTTERBASE_API_URL ?? "https://api.butterbase.ai";
const butterbaseAppId = process.env.BUTTERBASE_APP_ID ?? process.env.VITE_BUTTERBASE_APP_ID ?? "";
const butterbaseKey = process.env.BUTTERBASE_KEY ?? butterbaseAppId;

const normalizeApiBase = (base: string): string => base.replace(/\/$/, "");

/** BytePlus ModelArk data-plane uses `/contents/generations/tasks` (not legacy Seedance paths). See https://docs.byteplus.com/en/docs/ModelArk/1298459 */
const isBytePlusArkApi = (): boolean => {
  const b = normalizeApiBase(seedanceApiBase).toLowerCase();
  return b.includes("bytepluses.com") || b.endsWith("/api/v3");
};

/** Comma-separated list (e.g. https://your-app.butterbase.dev,http://localhost:5173). Required for browser calls from your deployed Butterbase UI. */
const parsedCorsOrigins =
  process.env.CORS_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? [];
const corsOrigins =
  parsedCorsOrigins.length > 0
    ? parsedCorsOrigins
    : ["http://localhost:5173", "http://localhost:5174"];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, corsOrigins.includes(origin));
    },
  }),
);
app.use(express.json());

app.use((req, _res, next) => {
  req.setTimeout(REQUEST_TIMEOUT_MS);
  next();
});

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

const butterbaseHeaders = (): Record<string, string> => ({
  "x-butterbase-key": butterbaseKey,
  "Content-Type": "application/json",
});

const butterbaseBase = (): string => `${normalizeApiBase(butterbaseApiUrl)}/v1/${butterbaseAppId}`;

const ensureButterbaseConfig = (res: Response): boolean => {
  if (!butterbaseAppId || !butterbaseKey) {
    res.status(500).json({ error: "Missing BUTTERBASE_APP_ID/BUTTERBASE_KEY server config" });
    return false;
  }
  return true;
};

const passthroughError = (res: Response, error: unknown): void => {
  if (axios.isAxiosError(error) && error.response) {
    res.status(error.response.status).json(
      typeof error.response.data === "object" ? error.response.data : { error: String(error.response.data) },
    );
    return;
  }
  res.status(500).json({ error: error instanceof Error ? error.message : "Unexpected server error" });
};

app.post("/api/bb/sessions", async (req: Request, res: Response) => {
  if (!ensureButterbaseConfig(res)) return;
  try {
    const response = await axios.post(`${butterbaseBase()}/sessions`, req.body, { headers: butterbaseHeaders() });
    res.status(response.status).json(response.data);
  } catch (error: unknown) {
    passthroughError(res, error);
  }
});

app.post("/api/bb/revisions", async (req: Request, res: Response) => {
  if (!ensureButterbaseConfig(res)) return;
  try {
    const response = await axios.post(`${butterbaseBase()}/revisions`, req.body, { headers: butterbaseHeaders() });
    res.status(response.status).json(response.data);
  } catch (error: unknown) {
    passthroughError(res, error);
  }
});

app.patch("/api/bb/revisions/:id", async (req: Request<{ id: string }>, res: Response) => {
  if (!ensureButterbaseConfig(res)) return;
  try {
    const response = await axios.patch(`${butterbaseBase()}/revisions/${encodeURIComponent(req.params.id)}`, req.body, {
      headers: butterbaseHeaders(),
    });
    res.status(response.status).json(response.data);
  } catch (error: unknown) {
    passthroughError(res, error);
  }
});

app.get("/api/bb/revisions", async (req: Request, res: Response) => {
  if (!ensureButterbaseConfig(res)) return;
  try {
    const sessionIdRaw = req.query.session_id;
    const sessionId = typeof sessionIdRaw === "string" ? sessionIdRaw : "";
    const params = new URLSearchParams();
    if (sessionId) params.set("session_id", `eq.${sessionId}`);
    params.set("order", "take_number.asc");

    const response = await axios.get(`${butterbaseBase()}/revisions?${params.toString()}`, {
      headers: butterbaseHeaders(),
    });
    res.status(response.status).json(response.data);
  } catch (error: unknown) {
    passthroughError(res, error);
  }
});

app.get("/api/bb/sessions/:id", async (req: Request<{ id: string }>, res: Response) => {
  if (!ensureButterbaseConfig(res)) return;
  try {
    const response = await axios.get(`${butterbaseBase()}/sessions?id=eq.${encodeURIComponent(req.params.id)}`, {
      headers: butterbaseHeaders(),
    });
    const rows = Array.isArray(response.data) ? response.data : [];
    res.status(200).json(rows[0] ?? null);
  } catch (error: unknown) {
    passthroughError(res, error);
  }
});

app.get("/api/bb/storage/upload-url", async (req: Request, res: Response) => {
  if (!ensureButterbaseConfig(res)) return;
  try {
    const filename = typeof req.query.filename === "string" ? req.query.filename : "";
    const contentType = typeof req.query.content_type === "string" ? req.query.content_type : "application/octet-stream";
    const params = new URLSearchParams({ filename, content_type: contentType });
    const response = await axios.get(`${butterbaseBase()}/storage/upload-url?${params.toString()}`, {
      headers: butterbaseHeaders(),
    });
    res.status(response.status).json(response.data);
  } catch (error: unknown) {
    passthroughError(res, error);
  }
});

app.get("/api/bb/storage/download-url", async (req: Request, res: Response) => {
  if (!ensureButterbaseConfig(res)) return;
  try {
    const filename = typeof req.query.filename === "string" ? req.query.filename : "";
    const params = new URLSearchParams({ filename });
    const response = await axios.get(`${butterbaseBase()}/storage/download-url?${params.toString()}`, {
      headers: butterbaseHeaders(),
    });
    res.status(response.status).json(response.data);
  } catch (error: unknown) {
    passthroughError(res, error);
  }
});

type GenerateBody = {
  prompt?: string;
  aspect_ratio?: string;
  duration?: number;
};

type SeedanceStatus = {
  id?: string;
  taskId?: string;
  job_id?: string;
  status?: string;
  progress?: number;
  result?: string | { url?: string; data?: string };
  results?: Array<string | { url?: string; data?: string }>;
  output?: Array<{ url?: string; data?: string }>;
  error?: { message?: string } | string;
};

const authHeaders = (): Record<string, string> => ({
  Authorization: `Bearer ${seedanceApiKey ?? ""}`,
  "Content-Type": "application/json",
});

const delay = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const normalizeStatus = (status?: string): string => (status ?? "").toLowerCase();

const extractTaskId = (payload: Record<string, unknown>): string | null =>
  (payload.id as string | undefined) ??
  (payload.taskId as string | undefined) ??
  (payload.job_id as string | undefined) ??
  null;

const extractVideoString = (status: SeedanceStatus): string | null => {
  const candidates: Array<unknown> = [];
  if (status.result !== undefined) candidates.push(status.result);
  if (Array.isArray(status.results)) candidates.push(...status.results);
  if (Array.isArray(status.output)) candidates.push(...status.output);

  for (const item of candidates) {
    if (typeof item === "string") {
      return item;
    }
    if (item && typeof item === "object") {
      const record = item as { url?: string; data?: string; base64?: string };
      if (record.url) return record.url;
      if (record.data) return record.data;
      if (record.base64) return record.base64;
    }
  }
  return null;
};

/** BytePlus ARK returns `content.video_url` when status is `succeeded`. */
const extractVideoFromPayload = (payload: Record<string, unknown>): string | null => {
  const content = payload.content;
  if (content && typeof content === "object" && !Array.isArray(content)) {
    const url = (content as { video_url?: string }).video_url;
    if (typeof url === "string" && url.trim()) return url.trim();
  }
  return extractVideoString(payload as SeedanceStatus);
};

const toVideoUrl = (raw: string): string => {
  if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("data:")) {
    return raw;
  }

  // Convert plain base64 bytes into a data URI that can be played directly.
  const buffer = Buffer.from(raw, "base64");
  return `data:video/mp4;base64,${buffer.toString("base64")}`;
};

const unwrapPayload = (payload: Record<string, unknown>): Record<string, unknown> => {
  const inner = payload.data;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    return inner as Record<string, unknown>;
  }
  return payload;
};

const seedanceRequest = async (
  method: "get" | "post",
  url: string,
  data?: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const config: AxiosRequestConfig<Record<string, unknown>> = {
    method,
    url,
    headers: authHeaders(),
    timeout: 30_000,
    data,
  };

  console.log(`[Seedance] ${method.toUpperCase()} ${url}`);
  try {
    const response = await axios.request<Record<string, unknown>>(config);
    console.log(`[Seedance] Response status: ${response.status}`);
    return unwrapPayload(response.data as Record<string, unknown>);
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && err.response) {
      const snippet =
        typeof err.response.data === "object"
          ? JSON.stringify(err.response.data).slice(0, 500)
          : String(err.response.data);
      throw new Error(`HTTP ${err.response.status} ${err.response.statusText}: ${snippet}`);
    }
    throw err;
  }
};

const createArkGenerationTask = async (payload: GenerateBody): Promise<Record<string, unknown>> => {
  const base = normalizeApiBase(seedanceApiBase);
  const url = `${base}/contents/generations/tasks`;
  const durationRaw = payload.duration ?? 6;
  const duration = Math.min(12, Math.max(2, Math.round(durationRaw)));
  const arkBody: Record<string, unknown> = {
    model: seedanceModel,
    content: [{ type: "text", text: payload.prompt ?? "" }],
    ratio: payload.aspect_ratio ?? "16:9",
    duration,
    resolution: seedanceResolution,
  };
  if (seedanceGenerateAudio) {
    arkBody.generate_audio = true;
  }
  return seedanceRequest("post", url, arkBody);
};

const createLegacyGenerationTask = async (payload: GenerateBody): Promise<Record<string, unknown>> => {
  const generationPayload = {
    model: seedanceModel,
    prompt: payload.prompt,
    aspect_ratio: payload.aspect_ratio ?? "16:9",
    duration: payload.duration ?? 6,
  };

  const base = normalizeApiBase(seedanceApiBase);
  const endpoints = [
    `${base}/v1/videos/generations`,
    `${base}/video/generations`,
    `${base}/v1/video/text-to-video`,
    `${base}/generate/text-to-video`,
  ];

  let lastError: unknown = null;
  for (const endpoint of endpoints) {
    try {
      return await seedanceRequest("post", endpoint, generationPayload);
    } catch (error: unknown) {
      lastError = error;
      console.error(`[Seedance] generation endpoint failed: ${endpoint}`, error);
    }
  }

  throw lastError;
};

const createGenerationTask = async (payload: GenerateBody): Promise<Record<string, unknown>> => {
  if (isBytePlusArkApi()) {
    return createArkGenerationTask(payload);
  }
  return createLegacyGenerationTask(payload);
};

const fetchArkStatus = async (taskId: string): Promise<SeedanceStatus> => {
  const base = normalizeApiBase(seedanceApiBase);
  const url = `${base}/contents/generations/tasks/${encodeURIComponent(taskId)}`;
  const payload = await seedanceRequest("get", url);
  return payload as SeedanceStatus;
};

const fetchLegacyStatus = async (taskId: string): Promise<SeedanceStatus> => {
  const base = normalizeApiBase(seedanceApiBase);
  const endpoints = [
    `${base}/v1/tasks/${taskId}`,
    `${base}/v1/video/jobs/${taskId}`,
    `${base}/video/${taskId}/status`,
    `${base}/api/v1/jobs/recordInfo?taskId=${taskId}`,
  ];

  let lastError: unknown = null;
  for (const endpoint of endpoints) {
    try {
      const payload = await seedanceRequest("get", endpoint);
      return payload as SeedanceStatus;
    } catch (error: unknown) {
      lastError = error;
      console.error(`[Seedance] status endpoint failed: ${endpoint}`, error);
    }
  }

  throw lastError;
};

const fetchStatus = async (taskId: string): Promise<SeedanceStatus> => {
  if (isBytePlusArkApi()) {
    return fetchArkStatus(taskId);
  }
  return fetchLegacyStatus(taskId);
};

app.post("/api/generate-video", async (req: Request<unknown, unknown, GenerateBody>, res: Response) => {
  try {
    if (!seedanceApiKey) {
      res.status(500).json({ error: "Missing SEEDANCE_API_KEY" });
      return;
    }

    const { prompt, aspect_ratio, duration } = req.body;
    if (!prompt || !prompt.trim()) {
      res.status(400).json({ error: "Prompt is required" });
      return;
    }

    const taskCreation = await createGenerationTask({ prompt, aspect_ratio, duration });
    const taskId = extractTaskId(taskCreation);
    if (!taskId) {
      res.status(502).json({ error: "Seedance did not return a task ID" });
      return;
    }

    const startedAt = Date.now();
    while (Date.now() - startedAt <= GENERATION_TIMEOUT_MS) {
      const statusResponse = await fetchStatus(taskId);
      const statusRaw = statusResponse as Record<string, unknown>;
      const status = normalizeStatus(statusResponse.status);

      // BytePlus ARK uses `succeeded`; legacy APIs use `completed` / `success`.
      if (status === "completed" || status === "success" || status === "succeeded") {
        const rawVideo = extractVideoFromPayload(statusRaw);
        if (!rawVideo) {
          res.status(502).json({ error: "Seedance completed without a video result", taskId });
          return;
        }

        res.json({
          videoUrl: toVideoUrl(rawVideo),
          taskId,
        });
        return;
      }

      if (status === "failed" || status === "fail" || status === "cancelled" || status === "expired") {
        const errObj = statusRaw.error as { message?: string } | string | undefined;
        const errorMessage =
          typeof errObj === "string"
            ? errObj
            : errObj && typeof errObj === "object"
              ? errObj.message
              : undefined;
        res.status(502).json({
          error: errorMessage ?? (status === "expired" ? "Video generation task expired" : "Video generation failed"),
          taskId,
        });
        return;
      }

      await delay(STATUS_POLL_INTERVAL_MS);
    }

    res.status(504).json({ error: "Video generation timed out after 120 seconds", taskId });
  } catch (error: unknown) {
    console.error("[Seedance] /api/generate-video error", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unexpected server error",
    });
  }
});

app.get("/api/video-status/:taskId", async (req: Request<{ taskId: string }>, res: Response) => {
  try {
    if (!seedanceApiKey) {
      res.status(500).json({ error: "Missing SEEDANCE_API_KEY" });
      return;
    }
    const { taskId } = req.params;
    const statusResponse = await fetchStatus(taskId);
    res.json(statusResponse);
  } catch (error: unknown) {
    console.error("[Seedance] /api/video-status error", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unexpected server error",
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Director's Cut proxy listening on port ${PORT}`);
});

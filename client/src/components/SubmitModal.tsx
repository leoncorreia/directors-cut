import { motion } from "framer-motion";
import axios, { type AxiosError } from "axios";
import { useEffect, useState } from "react";

const STORAGE_SUBMITTED = "cineagent_hackathon_submitted";

type SubmitModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onError: (message: string) => void;
  onSchemaError: (message: string) => void;
};

const DEFAULT_DESCRIPTION =
  "An agentic AI film director that reasons through creative briefs, generates cinematic video via Seedance 2.0, and iterates on feedback in a natural conversation. Built with Z.AI GLM-5.1 + Butterbase.";

export const SubmitModal = ({ open, onClose, onSuccess, onError, onSchemaError }: SubmitModalProps): JSX.Element | null => {
  const [projectName, setProjectName] = useState("CineAgent");
  const [demoUrl, setDemoUrl] = useState("");
  const [description, setDescription] = useState(DEFAULT_DESCRIPTION);
  const [submissionCode, setSubmissionCode] = useState("");
  const [schemaHint, setSchemaHint] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [hasSubmittedBefore, setHasSubmittedBefore] = useState(
    () => localStorage.getItem(STORAGE_SUBMITTED) === "true",
  );

  const apiUrl = import.meta.env.VITE_BUTTERBASE_API_URL;
  const appId = import.meta.env.VITE_BUTTERBASE_APP_ID;
  const key = appId;

  useEffect(() => {
    if (!open) return;
    setHasSubmittedBefore(localStorage.getItem(STORAGE_SUBMITTED) === "true");
    const envDemo = import.meta.env.VITE_BUTTERBASE_DEV_URL ?? "";
    setDemoUrl(envDemo);
    setSchemaHint("");
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (): Promise<void> => {
    setSchemaHint("");
    if (!hasSubmittedBefore && !submissionCode.trim()) {
      onError("Submission code is required on first submit.");
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        app_id: appId,
        data: {
          project_name: projectName,
          demo_url: demoUrl,
          description,
        },
      };
      if (!hasSubmittedBefore) {
        body.submission_code = submissionCode.trim();
      }

      await axios.post(`${apiUrl}/v1/hackathon/submit`, body, {
        headers: {
          "Content-Type": "application/json",
          "x-butterbase-key": key,
        },
      });

      localStorage.setItem(STORAGE_SUBMITTED, "true");
      setHasSubmittedBefore(true);
      onSuccess();
      onClose();
    } catch (error: unknown) {
      const ax = error as AxiosError<{ field_schema?: unknown; message?: string }>;
      if (ax.response?.status === 422) {
        const schema = ax.response.data?.field_schema;
        const hint = schema
          ? `Required fields / schema: ${JSON.stringify(schema)}`
          : "Check required submission fields.";
        setSchemaHint(hint);
        onSchemaError(hint);
        return;
      }
      const msg = ax.response?.data?.message ?? ax.message ?? "Submission failed.";
      onError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md rounded-card border border-white/10 bg-cine-surface p-6 shadow-xl"
      >
        <h2 className="mb-4 text-lg font-semibold text-[#f0f0f8]">🏆 Submit to Hackathon</h2>

        <label className="mb-1 block text-xs text-cine-muted">Project Name</label>
        <input
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          className="mb-3 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-[#f0f0f8]"
        />

        <label className="mb-1 block text-xs text-cine-muted">Demo URL</label>
        <input
          value={demoUrl}
          onChange={(e) => setDemoUrl(e.target.value)}
          placeholder="https://your-app.butterbase.dev"
          className="mb-3 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-[#f0f0f8]"
        />

        <label className="mb-1 block text-xs text-cine-muted">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="mb-3 w-full resize-none rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-[#f0f0f8]"
        />

        {!hasSubmittedBefore ? (
          <>
            <label className="mb-1 block text-xs text-cine-muted">Submission Code</label>
            <input
              value={submissionCode}
              onChange={(e) => setSubmissionCode(e.target.value)}
              placeholder="Enter promo code from organizers"
              className="mb-3 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-[#f0f0f8]"
            />
          </>
        ) : null}

        {schemaHint ? <p className="mb-3 text-xs text-amber-400">{schemaHint}</p> : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm text-cine-muted hover:text-[#f0f0f8]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleSubmit()}
            className="rounded-lg bg-cine-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit"}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

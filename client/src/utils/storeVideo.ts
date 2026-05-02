import { BASE } from "./butterbase";

export async function storeVideoToButterbase(videoUrl: string, revisionId: string): Promise<string | null> {
  try {
    const blob = await fetch(videoUrl).then((res) => res.blob());

    const uploadParams = new URLSearchParams({
      filename: `revision-${revisionId}.mp4`,
      content_type: "video/mp4",
    });

    const uploadUrlRes = await fetch(`${BASE}/storage/upload-url?${uploadParams.toString()}`);

    if (!uploadUrlRes.ok) {
      console.error("[storeVideo] upload-url failed", uploadUrlRes.status);
      return null;
    }

    const uploadPayload = (await uploadUrlRes.json()) as { url?: string; upload_url?: string };
    const putUrl = uploadPayload.url ?? uploadPayload.upload_url;
    if (!putUrl) {
      console.error("[storeVideo] No presigned upload URL in response");
      return null;
    }

    const putRes = await fetch(putUrl, {
      method: "PUT",
      body: blob,
      headers: {
        "Content-Type": "video/mp4",
      },
    });

    if (!putRes.ok) {
      console.error("[storeVideo] PUT to storage failed", putRes.status);
      return null;
    }

    const downloadParams = new URLSearchParams({
      filename: `revision-${revisionId}.mp4`,
    });

    const downloadUrlRes = await fetch(`${BASE}/storage/download-url?${downloadParams.toString()}`);

    if (!downloadUrlRes.ok) {
      console.error("[storeVideo] download-url failed", downloadUrlRes.status);
      return null;
    }

    const downloadPayload = (await downloadUrlRes.json()) as { url?: string; download_url?: string };
    const downloadUrl = downloadPayload.url ?? downloadPayload.download_url;
    return downloadUrl ?? null;
  } catch (error: unknown) {
    console.error("[storeVideo] Failed to persist video to Butterbase storage", error);
    return null;
  }
}

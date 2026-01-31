const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
const LLAVA_MODEL = "@cf/llava-hf/llava-1.5-7b-hf";
const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3MB

function isImageKey(key: string): boolean {
  const lower = key.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function getAnalysisKey(imageKey: string): string {
  const baseName = imageKey.replace(/\.[^/.]+$/, "");
  return `analysis:${baseName}.txt`;
}

async function processImage(
  bucket: R2Bucket,
  ai: Ai,
  imageKey: string
): Promise<void> {
  const r2Object = await bucket.get(imageKey);
  if (!r2Object) return;

  const imageData = await r2Object.arrayBuffer();
  const outputKey = getAnalysisKey(imageKey);

  if (imageData.byteLength > MAX_IMAGE_BYTES) {
    await bucket.put(
      outputKey,
      `[Skipped: image too large (${(imageData.byteLength / 1024).toFixed(0)}KB). Max 3MB.]`,
      { httpMetadata: { contentType: "text/plain" } }
    );
    return;
  }

  try {
    const imageArray = [...new Uint8Array(imageData)];
    const response = (await ai.run(LLAVA_MODEL, {
      image: imageArray,
      prompt: "Describe this image",
      max_tokens: 512,
    })) as { description?: string };

    await bucket.put(outputKey, response?.description ?? "No description", {
      httpMetadata: { contentType: "text/plain" },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await bucket.put(
      outputKey,
      `[Analysis failed: ${errMsg}]`,
      { httpMetadata: { contentType: "text/plain" } }
    );
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/trigger-analysis" && request.method === "POST") {
      try {
        const allObjects = await env.MY_BUCKET.list({ limit: 1000 });
        const analysisListed = await env.MY_BUCKET.list({
          prefix: "analysis:",
          limit: 1000,
        });
        const existingAnalysisKeys = new Set(
          analysisListed.objects.map((o) => o.key)
        );

        const imagesToProcess = allObjects.objects
          .filter((obj) => isImageKey(obj.key))
          .filter((obj) => !existingAnalysisKeys.has(getAnalysisKey(obj.key)));

        for (const obj of imagesToProcess) {
          await processImage(env.MY_BUCKET, env.AI, obj.key);
        }

        return Response.json({
          success: true,
          processed: imagesToProcess.length,
        });
      } catch (error) {
        console.error("Failed to trigger analysis:", error);
        return Response.json(
          { error: "Failed to trigger analysis" },
          { status: 500 }
        );
      }
    }

    if (url.pathname === "/api/test-single-image" && request.method === "POST") {
      try {
        const listed = await env.MY_BUCKET.list({ limit: 100 });
        const firstImage = listed.objects.find((obj) => isImageKey(obj.key));
        if (!firstImage) {
          return Response.json({ error: "No images found in bucket" }, { status: 404 });
        }

        await processImage(env.MY_BUCKET, env.AI, firstImage.key);

        return Response.json({
          success: true,
          imageKey: firstImage.key,
          outputKey: getAnalysisKey(firstImage.key),
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error("Test single image failed:", error);
        return Response.json(
          { error: "Test failed", details: errMsg },
          { status: 500 }
        );
      }
    }

    if (url.pathname === "/api/bucket-status" && request.method === "GET") {
      try {
        const allObjects = await env.MY_BUCKET.list({ limit: 1000 });
        const imageKeys = allObjects.objects
          .filter((obj) => isImageKey(obj.key))
          .map((obj) => obj.key);
        const analysisKeys = allObjects.objects
          .filter((obj) => obj.key.startsWith("analysis:") && obj.key.endsWith(".txt"))
          .map((obj) => obj.key);
        return Response.json({
          imageCount: imageKeys.length,
          analysisCount: analysisKeys.length,
          imageKeys,
          analysisKeys,
        });
      } catch (error) {
        console.error("Failed to get bucket status:", error);
        return Response.json(
          { error: "Failed to get bucket status" },
          { status: 500 }
        );
      }
    }

    if (url.pathname === "/api/analysis" && request.method === "GET") {
      try {
        const listed = await env.MY_BUCKET.list({
          prefix: "analysis:",
          limit: 1000,
        });
        const analyses: { key: string; text: string }[] = [];
        for (const obj of listed.objects) {
          if (obj.key.endsWith(".txt")) {
            const r2Object = await env.MY_BUCKET.get(obj.key);
            if (r2Object) {
              const text = await r2Object.text();
              analyses.push({ key: obj.key, text });
            }
          }
        }
        return Response.json({ analyses });
      } catch (error) {
        console.error("Failed to fetch analysis:", error);
        return Response.json(
          { error: "Failed to fetch analysis" },
          { status: 500 }
        );
      }
    }

    if (url.pathname.startsWith("/api/")) {
      return Response.json({
        name: "Cloudflare",
      });
    }

    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
const LLAVA_MODEL = "@cf/llava-hf/llava-1.5-7b-hf";
const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3MB
const DETAILED_PROMPT = `Analyze this image as customer feedback. Provide a structured analysis with the following sections:

1. OPINIONS: List the key opinions and viewpoints expressed. What do customers think or believe about the product/service?

2. OVERALL CUSTOMER VIEW: Summarize the general customer perspective. Is the sentiment positive, negative, mixed, or neutral? What is the consensus?

3. CUSTOMER SENTIMENT: How does the customer feel? Describe the emotional tone (e.g., frustrated, pleased, confused, excited, disappointed). Include specific evidence from the content.

4. ESTIMATED SATISFACTION: Based on the feedback, provide an estimated percent satisfaction (0-100%). Explain the reasoning for this estimate.

Format your response clearly with these section headers. Be specific and reference the actual content in the image.`;

function isImageKey(key: string): boolean {
  const lower = key.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function getSourceFromKey(imageKey: string): string {
  const parts = imageKey.split("/");
  if (parts.length >= 2) {
    const folder = parts[parts.length - 2]?.toLowerCase() ?? "general";
    return folder === "reddit" || folder === "x" ? folder : "general";
  }
  return "general";
}

function getAnalysisOutputKey(source: string, index: number): string {
  const name = source.charAt(0).toUpperCase() + source.slice(1);
  return `${name} analysis ${index}.txt`;
}

async function processImage(
  bucket: R2Bucket,
  ai: Ai,
  imageKey: string,
  outputKey: string
): Promise<void> {
  const r2Object = await bucket.get(imageKey);
  if (!r2Object) return;

  const imageData = await r2Object.arrayBuffer();

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
      prompt: DETAILED_PROMPT,
      max_tokens: 1536,
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
        const images = allObjects.objects
          .filter((obj) => isImageKey(obj.key))
          .sort((a, b) => a.key.localeCompare(b.key));

        const bySource: Record<string, string[]> = {};
        for (const obj of images) {
          const source = getSourceFromKey(obj.key);
          if (!bySource[source]) bySource[source] = [];
          bySource[source].push(obj.key);
        }

        let processed = 0;
        for (const [source, keys] of Object.entries(bySource)) {
          for (let i = 0; i < keys.length; i++) {
            const outputKey = getAnalysisOutputKey(source, i + 1);
            await processImage(env.MY_BUCKET, env.AI, keys[i], outputKey);
            processed++;
          }
        }

        return Response.json({
          success: true,
          processed,
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

        const source = getSourceFromKey(firstImage.key);
        const outputKey = getAnalysisOutputKey(source, 1);
        await processImage(env.MY_BUCKET, env.AI, firstImage.key, outputKey);

        return Response.json({
          success: true,
          imageKey: firstImage.key,
          outputKey,
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
          .filter((obj) => obj.key.endsWith(".txt") && obj.key.includes(" analysis "))
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
        const listed = await env.MY_BUCKET.list({ limit: 1000 });
        const analyses: { key: string; text: string }[] = [];
        const analysisObjects = listed.objects.filter(
          (obj) => obj.key.endsWith(".txt") && obj.key.includes(" analysis ")
        );
        for (const obj of analysisObjects) {
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

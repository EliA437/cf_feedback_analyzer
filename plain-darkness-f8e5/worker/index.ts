export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/bucket/images") {
      try {
        const listed = await env.MY_BUCKET.list({ limit: 1000 });
        const imageNames = listed.objects.map((obj) => obj.key);
        return Response.json({ images: imageNames });
      } catch (error) {
        console.error("Failed to list bucket:", error);
        return Response.json(
          { error: "Failed to list bucket images" },
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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const folder = "shri-senthura/products";

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

async function cloudinarySignature(params: Record<string, string>, secret: string): Promise<string> {
  const payload = Object.entries(params)
    .filter(([, value]) => value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&") + secret;
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Authentication is required." }, 401);
    }

    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ error: "A valid signed-in user is required." }, 401);
    }

    const cloudName = requiredEnv("CLOUDINARY_CLOUD_NAME");
    const apiKey = requiredEnv("CLOUDINARY_API_KEY");
    const apiSecret = requiredEnv("CLOUDINARY_API_SECRET");
    if (!/^[a-zA-Z0-9_-]+$/.test(cloudName)) {
      throw new Error("Cloudinary cloud name is invalid.");
    }

    const body = await request.json();
    if (body.action === "sign-upload") {
      const timestamp = Math.floor(Date.now() / 1000);
      const publicId = `product-${crypto.randomUUID()}`;
      const params = {
        folder,
        overwrite: "true",
        public_id: publicId,
        timestamp: String(timestamp),
      };

      return jsonResponse({
        cloudName,
        apiKey,
        folder,
        publicId,
        timestamp,
        signature: await cloudinarySignature(params, apiSecret),
      });
    }

    if (body.action === "delete") {
      const publicId = body.publicId;
      if (typeof publicId !== "string" || !/^(?:shri-senthura\/products\/)?product-[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(publicId)) {
        return jsonResponse({ error: "Invalid product image ID." }, 400);
      }

      const timestamp = Math.floor(Date.now() / 1000);
      const params = {
        invalidate: "true",
        public_id: publicId,
        timestamp: String(timestamp),
      };
      const signature = await cloudinarySignature(params, apiSecret);
      const formData = new FormData();
      formData.set("api_key", apiKey);
      formData.set("invalidate", "true");
      formData.set("public_id", publicId);
      formData.set("timestamp", String(timestamp));
      formData.set("signature", signature);

      const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
        method: "POST",
        body: formData,
      });
      const result = await response.json();
      if (!response.ok || (result.result !== "ok" && result.result !== "not found")) {
        return jsonResponse({ error: result.error?.message || "Cloudinary could not delete this image." }, 502);
      }
      return jsonResponse({ deleted: result.result === "ok" });
    }

    return jsonResponse({ error: "Unsupported image action." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The image service failed.";
    return jsonResponse({ error: message }, 500);
  }
});

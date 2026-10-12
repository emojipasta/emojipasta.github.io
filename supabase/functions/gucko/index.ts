// Gucko — assistant IA de Koris (fonction Supabase « gucko »)
// Nécessite le secret ANTHROPIC_API_KEY (Supabase > Edge Functions > Secrets).
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // Réservé aux membres connectés de Koris
    const auth = req.headers.get("Authorization") ?? "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ error: "non connecté" }, 401);

    const { messages = [], context = "", member = {} } = await req.json();
    const clean = (Array.isArray(messages) ? messages : [])
      .filter((m: any) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string" && m.content.trim())
      .slice(-10)
      .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 1500) }));
    while (clean.length && clean[0].role !== "user") clean.shift();
    if (!clean.length) return json({ error: "message vide" }, 400);

    const system = String(context).slice(0, 8000) +
      `\n\nMembre qui te parle : prénom ${member.firstName || "inconnu"}, ville ${member.city || "inconnue"}, commune ${member.commune || "inconnue"}.`;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: "claude-haiku-5-5", max_tokens: 500, system, messages: clean }),
    });
    if (!r.ok) return json({ error: "ia indisponible", status: r.status }, 502);
    const out = await r.json();
    const text = (out.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("").trim();
    return json({ text });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Método no permitido" }), { status: 405, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const supabase = createClient(
      Deno.env.get("6fb8db5c658ab3abb5c898c2d90c9d17a5f3a30a19f006c8415fb9632180f418")!,
      Deno.env.get("39b1e4c81535440d9f9f3ea4bb1dccb0fd4a58e4e3db821a902d41e287eda056")!
    );

    const form = await req.formData();
    const nombre = String(form.get("nombre") || "").trim();
    const telefono = String(form.get("telefono") || "").trim();
    const correo = String(form.get("correo") || "").trim();
    const contacto = String(form.get("contacto") || "").trim();
    const comentarios = String(form.get("comentarios") || "").trim();
    const files = form.getAll("files").filter(v => v instanceof File) as File[];

    if (!nombre) return json({ error: "Falta nombre o razón social" }, 400);
    if (!files.length) return json({ error: "Debes subir al menos un archivo" }, 400);
    if (files.length > 12) return json({ error: "Máximo 12 archivos" }, 400);

    const ip = req.headers.get("x-forwarded-for") || "";
    const ua = req.headers.get("user-agent") || "";

    const { data: solicitud, error: errSolicitud } = await supabase
      .from("solicitudes_alta")
      .insert({
        nombre,
        telefono,
        correo,
        contacto,
        comentarios,
        origen: "alta.html",
        ip,
        user_agent: ua,
        archivos_count: files.length
      })
      .select("id")
      .single();

    if (errSolicitud) return json({ error: errSolicitud.message }, 500);

    const permitidos = [
      "application/pdf",
      "application/zip",
      "application/x-zip-compressed",
      "image/png",
      "image/jpeg",
      "image/webp"
    ];

    for (const file of files) {
      if (file.size > 25 * 1024 * 1024) return json({ error: `Archivo demasiado grande: ${file.name}` }, 400);
      if (file.type && !permitidos.includes(file.type)) return json({ error: `Tipo no permitido: ${file.name}` }, 400);

      const clean = file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_").replace(/[^a-zA-Z0-9._()-]/g, "");
      const path = `${solicitud.id}/${Date.now()}_${crypto.randomUUID()}_${clean}`;
      const bytes = new Uint8Array(await file.arrayBuffer());

      const { error: upErr } = await supabase.storage
        .from("altas_tmp")
        .upload(path, bytes, {
          contentType: file.type || "application/octet-stream",
          upsert: false
        });

      if (upErr) return json({ error: `Error subiendo ${file.name}: ${upErr.message}` }, 500);

      const tipo_detectado =
        file.type.includes("pdf") ? "pdf" :
        file.type.includes("zip") ? "zip" :
        file.type.includes("image") ? "imagen" : "otro";

      const { error: fileErr } = await supabase
        .from("solicitud_archivos")
        .insert({
          solicitud_id: solicitud.id,
          nombre_archivo: file.name,
          storage_path: path,
          mime_type: file.type || null,
          tamano_bytes: file.size,
          tipo_detectado
        });

      if (fileErr) return json({ error: `Error guardando metadata de ${file.name}: ${fileErr.message}` }, 500);
    }

    return json({ ok: true, solicitud_id: solicitud.id }, 200);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Error inesperado" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" }
  });
}
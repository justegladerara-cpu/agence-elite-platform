import { NextResponse } from "next/server";
import { validateQuote, QuoteInput } from "@/domain/quotes";
import { localQuotes } from "@/server/quote-repository";
import { rateLimit } from "@/server/database";
import { sameOrigin } from "@/server/security";
import { production } from "@/config";
export const runtime = "nodejs";
const fail = (
  message: string,
  status: number,
  errors?: Record<string, string>,
) => NextResponse.json({ message, errors }, { status });
export async function POST(request: Request) {
  if (production())
    return fail("Les demandes en ligne ne sont pas encore activées.", 503);
  if (!sameOrigin(request)) return fail("Origine non autorisée.", 403);
  if (Number(request.headers.get("content-length") || 0) > 11000000)
    return fail("Pièces jointes trop volumineuses.", 413);
  // Local preview only: a single global bucket avoids trusting proxy IP headers.
  if (!(await rateLimit("quote-global", 100, 600)))
    return fail("Trop de demandes. Réessayez plus tard.", 429);
  const key = request.headers.get("idempotency-key") || "";
  if (!/^[a-zA-Z0-9-]{16,100}$/.test(key))
    return fail("Clé de demande invalide.", 400);
  try {
    const reader = request.body?.getReader();
    if (!reader) return fail("Demande vide.", 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 11000000) {
        await reader.cancel();
        return fail("Pièces jointes trop volumineuses.", 413);
      }
      chunks.push(chunk.value);
    }
    const form = await new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": request.headers.get("content-type") || "" },
    }).formData();
    const raw = form.get("payload");
    if (typeof raw !== "string" || raw.length > 60000)
      return fail("Demande invalide.", 400);
    const input = JSON.parse(raw) as QuoteInput,
      errors = validateQuote(input);
    if (Object.keys(errors).length)
      return fail("Vérifiez les champs indiqués.", 422, errors);
    const files = form
      .getAll("documents")
      .filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length > 3 || files.reduce((s, f) => s + f.size, 0) > 10000000)
      return fail("3 fichiers maximum, 10 Mo au total.", 422);
    const uploads = [];
    for (const file of files) {
      const bytes = Buffer.from(await file.arrayBuffer());
      let mime = "";
      if (bytes.subarray(0, 5).toString() === "%PDF-") mime = "application/pdf";
      if (
        bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      )
        mime = "image/png";
      if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
        mime = "image/jpeg";
      if (
        !mime ||
        mime !== file.type ||
        file.size > 5000000 ||
        !/\.(pdf|jpe?g|png)$/i.test(file.name)
      )
        return fail(
          "PDF, JPG ou PNG uniquement, 5 Mo par fichier. Le type réel doit correspondre.",
          422,
        );
      uploads.push({
        mime,
        bytes,
        name: file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100),
      });
    }
    const result = await localQuotes.create(input, key, uploads);
    return NextResponse.json(
      {
        reference: result.reference,
        notification: "non-connectee",
        demo: true,
      },
      {
        status: result.created ? 201 : 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (e) {
    return fail(
      (e as Error).message === "IDEMPOTENCY_CONFLICT"
        ? "La demande a changé. Recommencez avec une nouvelle référence."
        : "La demande n’a pas pu être enregistrée.",
      (e as Error).message === "IDEMPOTENCY_CONFLICT" ? 409 : 400,
    );
  }
}

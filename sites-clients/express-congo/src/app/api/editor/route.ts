import { NextResponse } from "next/server";
import { editorSession, sameOrigin } from "@/server/security";
import { db } from "@/server/database";
import { localQuotes } from "@/server/quote-repository";
import { publicPaths } from "@/content";
export async function GET() {
  if (!(await editorSession()))
    return NextResponse.json({ message: "Accès refusé." }, { status: 401 });
  return NextResponse.json(
    {
      quotes: await localQuotes.list(),
      contents: await (await db()).all("SELECT * FROM editorial"),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request) {
  if (!sameOrigin(request) || !(await editorSession()))
    return NextResponse.json({ message: "Accès refusé." }, { status: 403 });
  const input = await request.json().catch(() => ({}));
  if (
    !publicPaths.includes(input.slug) ||
    typeof input.title !== "string" ||
    input.title.length > 160 ||
    typeof input.body !== "string" ||
    input.body.length > 10000
  )
    return NextResponse.json({ message: "Contenu invalide." }, { status: 422 });
  const date = new Date().toISOString();
  try {
    // Contenu et journal enregistrés d’un seul bloc.
    await (
      await db()
    ).batch([
      [
        "INSERT INTO editorial(slug,title,body,updated_at) VALUES(?,?,?,?) ON CONFLICT(slug) DO UPDATE SET title=excluded.title,body=excluded.body,truth_status='PROPOSÉ',version=version+1,updated_at=excluded.updated_at",
        [input.slug, input.title, input.body, date],
      ],
      [
        "INSERT INTO audit(actor,action,object_id,detail,created_at) VALUES(?,?,?,?,?)",
        ["demo-editor", "content.saved", input.slug, "{}", date],
      ],
    ]);
  } catch {
    return NextResponse.json(
      { message: "Enregistrement impossible." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}

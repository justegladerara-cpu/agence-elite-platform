import { NextResponse } from "next/server";
import { currentActor } from "@/server/demo-auth";
import { sameOrigin } from "@/server/security";
import {
  getEntity,
  listEntities,
  operation,
} from "@/server/operations-repository";
import { setQuoteStatus } from "@/server/backoffice";
export async function GET(request: Request) {
  const actor = await currentActor();
  if (!actor) return new Response(null, { status: 401 });
  try {
    const id = new URL(request.url).searchParams.get("id");
    return NextResponse.json(
      id
        ? await getEntity(actor, id)
        : { actor, entities: await listEntities(actor) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return new Response(null, { status: 403 });
  }
}
export async function POST(request: Request) {
  const actor = await currentActor();
  if (!actor || !sameOrigin(request))
    return new Response(null, { status: 403 });
  if (Number(request.headers.get("content-length") || 0) > 30000)
    return new Response(null, { status: 413 });
  const input = await request.json().catch(() => ({}));
  try {
    // Les demandes du site vivent dans leur propre table et transaction.
    const result =
      input.command === "quoteStatus"
        ? await setQuoteStatus(actor, input.quoteId, input.status, input.reason)
        : await operation(actor, String(input.command), input);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const message = (e as Error).message;
    return NextResponse.json(
      { message },
      { status: message === "ACCESS_DENIED" ? 403 : 422 },
    );
  }
}

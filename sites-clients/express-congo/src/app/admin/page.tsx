import { editorSession } from "@/server/security";
import { isDemo } from "@/config";
import { Editor } from "@/components/editor";
import { localQuotes } from "@/server/quote-repository";
import { publicPaths } from "@/content";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Gestion locale",
  robots: { index: false, follow: false },
};
export default async function Admin() {
  if (!isDemo())
    return (
      <div className="container section">
        <h1>Administration non activée</h1>
        <p>
          L’authentification de production et le second facteur doivent être
          raccordés.
        </p>
      </div>
    );
  const session = await editorSession();
  return (
    <div className="container section">
      <h1>Gestion éditoriale et demandes</h1>
      <Editor
        quotes={session ? await localQuotes.list() : []}
        paths={session ? publicPaths.filter((p) => p !== "/") : []}
      />
    </div>
  );
}

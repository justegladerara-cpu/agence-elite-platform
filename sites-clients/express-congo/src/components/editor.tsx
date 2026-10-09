"use client";
import { useState } from "react";
import type { QuoteRecord } from "@/server/quote-repository";
export function Editor({
  quotes,
  paths,
}: {
  quotes: QuoteRecord[];
  paths: string[];
}) {
  const [password, setPassword] = useState(""),
    [message, setMessage] = useState(""),
    [slug, setSlug] = useState(paths[0]),
    [title, setTitle] = useState(""),
    [body, setBody] = useState("");
  async function login(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/editor/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await r.json();
    if (r.ok) location.reload();
    else setMessage(data.message);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/editor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, title, body }),
    });
    setMessage(
      r.ok
        ? "Proposition éditoriale enregistrée. Elle reste non validée."
        : (await r.json()).message,
    );
  }
  return quotes.length === 0 && paths.length === 0 ? (
    <form className="card login" onSubmit={login}>
      <span className="eyebrow">Accès local de démonstration</span>
      <h2>Gestion éditoriale</h2>
      <p>Ce compte de démonstration n’est jamais disponible en production.</p>
      <label>
        Mot de passe de démonstration
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </label>
      {message && <p role="alert">{message}</p>}
      <button className="button">Ouvrir la gestion locale</button>
    </form>
  ) : (
    <div>
      <div className="admin-toolbar">
        <span>Gestion locale · Données fictives uniquement</span>
        <button
          className="text-button"
          onClick={async () => {
            await fetch("/api/editor/session", { method: "DELETE" });
            location.reload();
          }}
        >
          Se déconnecter
        </button>
      </div>
      <div className="two-col">
        <div>
          <h2>Demandes enregistrées ({quotes.length})</h2>
          <div className="admin-list">
            {quotes.map((q) => (
              <article className="card" key={q.id}>
                <strong>{q.reference}</strong>
                <p>
                  {q.status} · {q.agency} · {q.volume.replace(".", ",")} m³
                </p>
                <p>
                  {new Intl.DateTimeFormat("fr-FR", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Europe/Paris",
                  }).format(new Date(q.created_at))}
                </p>
                <details>
                  <summary>Consulter le dossier fictif</summary>
                  <pre>{JSON.stringify(JSON.parse(q.payload), null, 2)}</pre>
                </details>
              </article>
            ))}
          </div>
        </div>
        <form className="card" onSubmit={save}>
          <h2>Proposition éditoriale</h2>
          <p>
            Le texte est affiché en préproduction comme proposition. Il ne
            remplace pas une validation d’Express Congo.
          </p>
          <label>
            Page
            <select
              aria-label="Page"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            >
              {paths.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            Titre
            <input
              value={title}
              required
              maxLength={160}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Texte
            <textarea
              value={body}
              required
              maxLength={10000}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <button className="button">Enregistrer la proposition</button>
          {message && <p role="status">{message}</p>}
        </form>
      </div>
    </div>
  );
}

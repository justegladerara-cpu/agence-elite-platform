/** Contenus WordPress retirés : 410 explicite plutôt qu’une redirection. */
export function retired() {
  return new Response(
    "Ce contenu a été retiré. Consultez /preparer-mon-envoi/.",
    {
      status: 410,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}

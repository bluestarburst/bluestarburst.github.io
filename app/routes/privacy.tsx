import type { Route } from "./+types/privacy";

export const meta: Route.MetaFunction = () => [
  { title: "Privacy - Bryant Hargreaves" },
  { name: "description", content: "Privacy information for hargreaves.dev" },
];

export default function Privacy() {
  return (
    <main className="min-h-screen bg-white px-6 py-20 text-neutral-800 dark:bg-gray-950 dark:text-neutral-200 pointer-events-auto">
      <article className="mx-auto max-w-2xl font-mono">
        <a
          className="text-sm text-amber-700 underline underline-offset-4 hover:text-amber-600 dark:text-[#d2b48c]"
          href="/"
        >
          ← Back to portfolio
        </a>

        <h1 className="mt-12 text-4xl font-bold tracking-tight text-neutral-950 dark:text-white">
          Privacy
        </h1>
        <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-500">
          Last updated September 13, 2026
        </p>

        <section className="mt-12 space-y-4 leading-7 text-neutral-700 dark:text-neutral-300">
          <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
            Anonymous shared cursors
          </h2>
          <p>
            The shared-cursor demo uses OpenRTC to exchange short-lived cursor
            positions between visitors. It does not require a portfolio account.
          </p>
          <p>
            Anonymous admission is protected by Cloudflare Turnstile in Invisible
            mode. The verification runs in the background without an in-page
            checkbox. Cloudflare processes the browser signals needed to provide
            this security check as described in its{" "}
            <a
              className="text-amber-700 underline underline-offset-4 hover:text-amber-600 dark:text-[#d2b48c]"
              href="https://www.cloudflare.com/turnstile-privacy-policy/"
              rel="noreferrer"
              target="_blank"
            >
              Turnstile Privacy Addendum
            </a>
            .
          </p>
        </section>
      </article>
    </main>
  );
}

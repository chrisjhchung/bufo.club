import { useDocumentMeta } from '../lib/hooks'

export function About() {
  useDocumentMeta(
    'About — Bufo Club',
    'Where the bufos come from, how uploads are reviewed, and how to ask for one to be taken down.',
  )

  return (
    <div className="prose-sm mx-auto max-w-2xl space-y-6">
      <section>
        <h1 className="display text-4xl">About Bufo Club</h1>
        <p className="mt-2 text-ink">
          A searchable home for bufo emoji: browse, download at emoji sizes, make your own from a
          photo, and submit ones the pond is missing. Everything runs on Cloudflare, and the whole
          library is one static file your browser downloads once — which is why searching feels
          instant and costs nothing to serve.
        </p>
      </section>

      <section>
        <h2 className="display text-2xl">Credits</h2>
        <p className="mt-2 text-ink">
          The starting library comes from{' '}
          <a
            className="underline"
            href="https://github.com/knobiknows/all-the-bufo"
            target="_blank"
            rel="noreferrer noopener"
          >
            knobiknows/all-the-bufo
          </a>
          , the community collection this site would not exist without. Each bufo keeps a credit
          field pointing back at where it came from. Bufo himself originates from the mobile game
          Froge, and the emoji set grew out of Discord and Slack communities.
        </p>
      </section>

      <section>
        <h2 className="display text-2xl">If a bufo is yours</h2>
        <p className="mt-2 text-ink">
          Use the “Report this bufo” link on any bufo's page. Reports land straight in the
          moderation queue, and anything reported as a copyright issue is removed on request — no
          argument, no forms. The same link works for anything broken or not safe for work.
        </p>
      </section>

      <section>
        <h2 className="display text-2xl">Submitting bufos</h2>
        <p className="mt-2 text-ink">
          Uploads are anonymous and go into a review queue before they appear. PNG, GIF or WebP, up
          to 2MB. Keep them safe for work, and keep them bufos.
        </p>
      </section>
    </div>
  )
}

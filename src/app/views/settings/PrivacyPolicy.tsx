import { X } from "lucide-react";

interface PrivacyPolicyProps {
  onClose: () => void;
}

export function PrivacyPolicy({ onClose }: PrivacyPolicyProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Privacy policy">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      <div className="relative w-full max-w-lg max-h-[85vh] bg-card rounded-t-3xl sm:rounded-3xl border border-border shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-card/95 backdrop-blur-sm border-b border-border px-6 py-4 flex items-center justify-between z-10 rounded-t-3xl">
          <h2 className="font-serif text-lg font-semibold text-foreground">
            Privacy Policy
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-full hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 text-sm text-foreground leading-relaxed">
          <p className="text-xs text-muted-foreground">
            Last updated: September 2026
          </p>

          <section>
            <h3 className="font-semibold mb-2">What Rhea is</h3>
            <p className="text-muted-foreground">
              Rhea is a period and cycle tracker designed around privacy. It
              tracks your cycle on your own device and lets you choose what a
              partner sees in Rhea&apos;s partner view.
            </p>
          </section>

          <section>
            <h3 className="font-semibold mb-2">What data is stored</h3>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>
                <strong>On your device:</strong> Daily logs (flow, symptoms,
                mood, energy, private notes), cycle history, predictions, and
                app settings. Stored in your browser&apos;s IndexedDB.
              </li>
              <li>
                <strong>On our server (Supabase):</strong> When you sign in,
                your daily logs (including notes) sync to a Postgres database so
                your devices stay in sync and a linked partner can use the
                partner view. Your sharing settings, quiet windows, and sharing
                activity log are stored there too, along with your email and a
                hashed password for authentication.
              </li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold mb-2">What the server can see</h3>
            <p className="text-muted-foreground">
              When you use an account, the server currently stores your daily
              logs in plaintext (they are not yet end-to-end encrypted).
              Row-Level Security limits access so only you and your linked
              partner can read them. A linked partner&apos;s access covers your
              full daily logs, including notes: sharing toggles decide what the
              partner view shows, but the server does not enforce them. Data
              travels over a secure (TLS) connection. Because the data is not yet
              end-to-end encrypted, the database operator could technically
              access it, and it could be disclosed if legally compelled.
              End-to-end encryption is a planned improvement so that, in future,
              the server will not be able to read your health data at all.
            </p>
          </section>

          <section>
            <h3 className="font-semibold mb-2">What your partner sees</h3>
            <p className="text-muted-foreground">
              Nothing by default. You control seven independent sharing toggles,
              and Rhea&apos;s partner view shows only what you enable. It never
              shows your private notes. These controls are applied by the app,
              not the server: while you are linked, your partner&apos;s account
              can technically read your full daily logs, including notes. While
              a quiet window is active, the partner view shows a pause message
              instead of your details.
            </p>
          </section>

          <section>
            <h3 className="font-semibold mb-2">What we never do</h3>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Sell or share your data with advertisers or third parties</li>
              <li>Use your health data for ad targeting</li>
              <li>Run third-party analytics on health fields</li>
              <li>Require more data than the features need</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold mb-2">Your rights</h3>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>
                <strong>Export:</strong> Download all your data as a JSON file
                at any time from Settings
              </li>
              <li>
                <strong>Delete:</strong> &ldquo;Erase all data&rdquo; in Settings
                deletes everything Rhea stores on this device. It does not delete
                data already synced to your account: that stays on the server
                and comes back the next time you sign in or sync.
              </li>
              <li>
                <strong>Portability:</strong> Your exported data is structured
                and can be used elsewhere
              </li>
              <li>
                <strong>Unpair:</strong> Unlinking your partner ends their access
                to your data on the server. Anything their device already
                downloaded may stay there. Unused invite codes are not cancelled
                and still work until they expire, 30 minutes after creation.
              </li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold mb-2">Legal requests</h3>
            <p className="text-muted-foreground">
              Reproductive health data is sensitive. If compelled by a legal
              request, we can only provide what the server holds for your
              account (see &ldquo;What data is stored&rdquo;). We will notify
              you of any request unless legally prohibited from doing so. We do
              not voluntarily share data with law enforcement.
            </p>
          </section>

          <section>
            <h3 className="font-semibold mb-2">Without an account</h3>
            <p className="text-muted-foreground">
              The hosted version of Rhea requires an account. A copy of Rhea
              run without a server configured works in local-only mode instead:
              no data ever leaves your device. There is no server, no sync, and
              nothing to subpoena.
            </p>
          </section>

          <div className="pt-4 border-t border-border">
            <p className="text-xs text-center text-muted-foreground">
              Questions? This is an open-source project &mdash; you can inspect
              exactly what the code does.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

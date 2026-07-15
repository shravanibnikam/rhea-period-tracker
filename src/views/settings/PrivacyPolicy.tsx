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
            Last updated: July 2026
          </p>

          <section>
            <h3 className="font-semibold mb-2">What Rhea is</h3>
            <p className="text-muted-foreground">
              Rhea is a period and cycle tracker designed around privacy. It
              tracks your cycle on your own device and lets you share exactly as
              much as you choose with a partner.
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
                <strong>On our server (Supabase):</strong> When you create an
                account, your daily logs sync to a Postgres database so your
                devices stay in sync and your partner can see what you choose to
                share. Your email and a hashed password are stored for
                authentication.
              </li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold mb-2">What the server can see</h3>
            <p className="text-muted-foreground">
              The server stores your daily logs (flow, symptoms, mood, energy,
              notes) to enable sync and partner access. Row-Level Security
              ensures only you and your linked partner (for shared fields only)
              can read your data. No Rhea employee or admin can access your logs
              through the app.
            </p>
          </section>

          <section>
            <h3 className="font-semibold mb-2">What your partner sees</h3>
            <p className="text-muted-foreground">
              Nothing by default. You control five independent sharing toggles.
              Your partner only sees what you enable, and you can revoke access
              at any time. Private notes are never shared regardless of settings.
              Quiet windows let you pause all sharing for chosen days.
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
                <strong>Delete:</strong> Erase all data from both your device
                and the server with one tap in Settings
              </li>
              <li>
                <strong>Portability:</strong> Your exported data is structured
                and can be used elsewhere
              </li>
              <li>
                <strong>Unpair:</strong> Revoking partner access is immediate
                and wipes their synced copy
              </li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold mb-2">Legal requests</h3>
            <p className="text-muted-foreground">
              Reproductive health data is sensitive. If compelled by a legal
              request, we can only provide what the server holds: daily logs
              associated with your account. We will notify you of any request
              unless legally prohibited from doing so. We do not voluntarily
              share data with law enforcement.
            </p>
          </section>

          <section>
            <h3 className="font-semibold mb-2">Without an account</h3>
            <p className="text-muted-foreground">
              Rhea works fully without creating an account. In local-only mode,
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

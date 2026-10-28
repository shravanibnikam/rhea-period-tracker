import type { ReactNode } from "react";
import { Sheet } from "@/app/components/ui/Sheet";

interface PrivacyPolicyProps {
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="font-display text-base font-bold text-foreground">{title}</h3>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}

const LIST = "list-disc space-y-1.5 pl-5 marker:text-muted-foreground";

export function PrivacyPolicy({ onClose }: PrivacyPolicyProps) {
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Privacy policy"
      description="Last updated: October 2026"
    >
      <div className="space-y-6 text-sm leading-6 text-foreground">
        <Section title="What Rhea is">
          <p>
            Rhea is a period and cycle tracker. It keeps your logs on your device, syncs them to your
            account when you sign in, and lets you choose what a linked partner&apos;s view shows.
          </p>
        </Section>

        <Section title="On your device">
          <ul className={LIST}>
            <li>
              Your daily logs (flow, symptoms, mood, energy, notes, and the optional medication and
              intimacy fields), the cycle history and predictions worked out from them, and your app
              settings, in your browser&apos;s IndexedDB.
            </li>
            <li>
              Your theme preference, whether you have seen the welcome page, and, while you are signed
              in, your sign-in session, in your browser&apos;s localStorage.
            </li>
          </ul>
        </Section>

        <Section title="On our server">
          <p>
            When you sign in, your daily logs sync to a Postgres database run on Supabase, so your
            devices stay in step and a linked partner can use the partner view. That includes notes and
            the medication and intimacy fields, which sync the same way as the rest of the log. Each
            synced entry records which device last changed it and when; deleting a day&apos;s log
            leaves a deletion marker for that date.
          </p>
          <p>
            The server also holds your email and a hashed password, which partner account you are
            linked to, invite codes you create (stored hashed), your sharing settings, quiet windows,
            and a log of your sharing changes. Shared notes sent from earlier versions of Rhea, if any,
            also remain there; this version has no shared notes.
          </p>
        </Section>

        <Section title="What the server can see">
          <p>
            Synced data travels over a secure (TLS) connection, but it is stored in plain text: it is
            not end-to-end encrypted. Row-level security lets only your account and a linked
            partner&apos;s account read it. The database operator could technically read it, and it
            could be disclosed if we were legally compelled to.
          </p>
        </Section>

        <Section title="What your partner sees">
          <p>
            Nothing by default. You control six sharing toggles, and Rhea&apos;s partner view shows
            only what you turn on. It never shows your notes, medication or intimacy entries, and Rhea
            does not save them on your partner&apos;s device. While a quiet window is active, the
            partner view shows a pause message instead of your details.
          </p>
          <p>
            The toggles are applied by the app, not the server: while you are linked, your
            partner&apos;s account can read all of your synced logs, including those fields.
          </p>
        </Section>

        <Section title="What we never do">
          <ul className={LIST}>
            <li>Sell or share your data with advertisers or other third parties</li>
            <li>Show ads, or use your health data to target them</li>
            <li>Run analytics or tracking scripts</li>
            <li>Ask for more data than the features need</li>
          </ul>
        </Section>

        <Section title="Your rights">
          <ul className={LIST}>
            <li>
              <strong className="font-semibold">Export:</strong> download a JSON backup, a CSV file or a
              calendar (.ics) file, or print a summary. Each is generated on your device; nothing is
              uploaded to make it.
            </li>
            <li>
              <strong className="font-semibold">Delete:</strong> &ldquo;Erase this device&rdquo; in
              Settings deletes your logs, settings and cycle history from this device. It does not sign
              you out, and it does not delete data already synced to your account: that stays on the
              server and downloads again the next time the app syncs, which happens automatically while
              you are signed in.
            </li>
            <li>
              <strong className="font-semibold">Portability:</strong> exports are structured files you
              can use elsewhere.
            </li>
            <li>
              <strong className="font-semibold">Unpair:</strong> unlinking your partner ends their
              account&apos;s access to your data on the server. Anything their device already downloaded
              may stay there. Unused invite codes are not cancelled and still work until they expire, 30
              minutes after they are created.
            </li>
          </ul>
        </Section>

        <Section title="Legal requests">
          <p>
            Reproductive health data is sensitive. If compelled by a legal request, we can only provide
            what the server holds for your account (see &ldquo;On our server&rdquo;). We will tell you
            about any request unless the law forbids it, and we do not share data with law enforcement
            voluntarily.
          </p>
        </Section>

        <Section title="Without an account">
          <p>
            The hosted version of Rhea requires an account. A copy of Rhea run without a server
            configured works in local-only mode: your data never leaves your device, and there is no
            server copy to hand over.
          </p>
        </Section>

        <p className="text-muted-foreground">
          Questions? Rhea is open source, so you can read exactly what the code does{" "}
          <a
            href="https://github.com/shravanibnikam/rhea-period-tracker"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-foreground underline underline-offset-4"
          >
            on GitHub
          </a>
          .
        </p>
      </div>
    </Sheet>
  );
}

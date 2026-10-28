import { Sheet } from "@/app/components/ui/Sheet";

interface SourcesViewProps {
  onClose: () => void;
}

interface Reference {
  authors: string;
  title: string;
  journal: string;
  note: string;
  doi?: string;
  url?: string;
}

const REFERENCES: Reference[] = [
  {
    authors: "Bull JR, Rowland SP, Scherwitzl EB, et al.",
    title: "Real-world menstrual cycle characteristics of more than 600,000 menstrual cycles.",
    journal: "NPJ Digit Med. 2019.",
    doi: "10.1038/s41746-019-0152-7",
    note: "Mean cycle length 29.3 days; the follicular phase varies, the luteal phase is stable.",
  },
  {
    authors: "Wilcox AJ, Dunson D, Baird DD.",
    title: "The timing of the ‘fertile window’ in the menstrual cycle: day specific estimates from a prospective study.",
    journal: "BMJ. 2000.",
    doi: "10.1136/bmj.321.7271.1259",
    note: "The fertile window is hard to predict; calendar methods are estimates, not contraception.",
  },
  {
    authors: "Dunson DB, Baird DD, Wilcox AJ, Weinberg CR.",
    title: "Day-specific probabilities of clinical pregnancy based on two studies with imperfect measures of ovulation.",
    journal: "Hum Reprod. 1999.",
    doi: "10.1093/humrep/14.7.1835",
    note: "Conception is most likely the day before ovulation; sperm survive about 5 days.",
  },
  {
    authors: "Pierson E, Althoff T, Leskovec J.",
    title: "Modeling Individual Cyclic Variation in Human Behavior (Cyclic Hidden Markov Models).",
    journal: "Proc. WWW Conf. 2018.",
    doi: "10.1145/3178876.3186052",
    note: "A cyclic hidden Markov model for personal cycle prediction from symptom data.",
  },
  {
    authors: "Symul L, Holmes S.",
    title: "Labeling Self-Tracked Menstrual Health Records With Hidden Semi-Markov Models.",
    journal: "IEEE J Biomed Health Inform. 2022.",
    doi: "10.1109/JBHI.2021.3110716",
    note: "A hidden semi-Markov model for labelling cycle phases with calibrated uncertainty.",
  },
  {
    authors: "Cleveland Clinic.",
    title: "Menstrual Cycle (Normal Menstruation): Overview & Phases.",
    journal: "Clinical reference.",
    note: "The four-phase model: menstrual, follicular, ovulation, luteal.",
  },
  {
    authors: "Cleveland Clinic.",
    title: "Follicular Phase / Luteal Phase.",
    journal: "Clinical reference.",
    note: "The luteal phase lasts about 12 to 14 days and is fairly stable; the follicular phase varies.",
  },
  {
    authors: "Reed BG, Carr BR.",
    title: "The Normal Menstrual Cycle and the Control of Ovulation.",
    journal: "Endotext (NIH/NCBI), NBK279054.",
    url: "https://www.ncbi.nlm.nih.gov/books/NBK279054/",
    note: "A reference for normal cycle physiology and its hormonal control.",
  },
];

const LINK = "inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4 break-all";

export function SourcesView({ onClose }: SourcesViewProps) {
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Sources"
      description="The research behind Rhea's phases and predictions"
    >
      <div className="space-y-6 text-sm leading-6 text-foreground">
        <p>
          Rhea&apos;s phase descriptions and prediction methods follow peer-reviewed research and
          clinical references. Fertility estimates are calendar-method approximations, never
          contraception.
        </p>

        <ul className="space-y-5">
          {REFERENCES.map((ref) => {
            const href = ref.doi ? `https://doi.org/${ref.doi}` : ref.url;
            return (
              <li key={ref.title}>
                <p className="font-semibold leading-snug">{ref.title}</p>
                <p className="mt-1 text-muted-foreground">
                  {ref.authors} {ref.journal}
                </p>
                <p className="mt-1">{ref.note}</p>
                {href && (
                  <a href={href} target="_blank" rel="noreferrer" className={LINK}>
                    {href.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, "")}
                  </a>
                )}
              </li>
            );
          })}
        </ul>

        <p className="text-muted-foreground">
          References found through PubMed and NIH/NCBI. Rhea does not give medical advice.
        </p>
      </div>
    </Sheet>
  );
}

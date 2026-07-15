import { X } from "lucide-react";

interface SourcesViewProps {
  onClose: () => void;
}

const REFERENCES = [
  {
    id: 1,
    authors: "Bull JR, Rowland SP, Scherwitzl EB, et al.",
    title: "Real-world menstrual cycle characteristics of more than 600,000 menstrual cycles.",
    journal: "NPJ Digit Med. 2019.",
    doi: "10.1038/s41746-019-0152-7",
    note: "Mean cycle length 29.3 days; follicular phase varies, luteal is stable.",
  },
  {
    id: 2,
    authors: "Wilcox AJ, Dunson D, Baird DD.",
    title: "The timing of the 'fertile window' in the menstrual cycle: day specific estimates from a prospective study.",
    journal: "BMJ. 2000.",
    doi: "10.1136/bmj.321.7271.1259",
    note: "Fertile window is genuinely unpredictable; calendar methods are estimates, not contraception.",
  },
  {
    id: 3,
    authors: "Dunson DB, Baird DD, Wilcox AJ, Weinberg CR.",
    title: "Day-specific probabilities of clinical pregnancy based on two studies with imperfect measures of ovulation.",
    journal: "Hum Reprod. 1999.",
    doi: "10.1093/humrep/14.7.1835",
    note: "Peak conception probability the day before ovulation; sperm survive ~5 days.",
  },
  {
    id: 4,
    authors: "Pierson E, Althoff T, Leskovec J.",
    title: "Modeling Individual Cyclic Variation in Human Behavior (Cyclic Hidden Markov Models).",
    journal: "Proc. WWW Conf. 2018.",
    doi: "10.1145/3178876.3186052",
    note: "CyHMM model for personalized cycle prediction from symptom data.",
  },
  {
    id: 5,
    authors: "Symul L, Holmes S.",
    title: "Labeling Self-Tracked Menstrual Health Records With Hidden Semi-Markov Models.",
    journal: "IEEE J Biomed Health Inform. 2022.",
    doi: "10.1109/JBHI.2021.3110716",
    note: "HSMM approach for cycle phase labeling with calibrated uncertainty.",
  },
  {
    id: 6,
    authors: "Cleveland Clinic.",
    title: "Menstrual Cycle (Normal Menstruation): Overview & Phases.",
    journal: "Clinical reference.",
    note: "Four-phase model: menstrual, follicular, ovulation, luteal.",
  },
  {
    id: 7,
    authors: "Cleveland Clinic.",
    title: "Follicular Phase / Luteal Phase.",
    journal: "Clinical reference.",
    note: "Luteal phase ~12-14 days, relatively stable; follicular phase variable.",
  },
  {
    id: 8,
    authors: "Reed BG, Carr BR.",
    title: "The Normal Menstrual Cycle and the Control of Ovulation.",
    journal: "Endotext (NIH/NCBI), NBK279054.",
    note: "Authoritative reference for normal cycle physiology and hormonal regulation.",
  },
];

export function SourcesView({ onClose }: SourcesViewProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-lg max-h-[85vh] bg-card rounded-t-3xl sm:rounded-3xl border border-border shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-card/95 backdrop-blur-sm border-b border-border px-6 py-4 flex items-center justify-between z-10 rounded-t-3xl">
          <h2 className="font-serif text-lg font-semibold text-foreground">
            Sources &amp; References
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-muted transition-colors"
          >
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Every physiological statement and prediction method in Rhea is
            grounded in peer-reviewed research and authoritative clinical
            references. Fertility estimates are calendar-method approximations
            &mdash; never contraception.
          </p>

          <div className="space-y-4">
            {REFERENCES.map((ref) => (
              <div
                key={ref.id}
                className="border-b border-border pb-4 last:border-0 last:pb-0"
              >
                <p className="text-xs text-muted-foreground mb-0.5">
                  [{ref.id}]
                </p>
                <p className="text-sm text-foreground font-medium leading-snug">
                  {ref.title}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {ref.authors} {ref.journal}
                  {ref.doi && (
                    <>
                      {" "}
                      DOI:{" "}
                      <span className="text-primary">{ref.doi}</span>
                    </>
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-1 italic">
                  {ref.note}
                </p>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-border">
            <p className="text-xs text-center text-muted-foreground leading-relaxed">
              References retrieved via PubMed and NIH/NCBI.
              Rhea does not provide medical advice.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

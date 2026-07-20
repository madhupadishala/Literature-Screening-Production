"use client";

type PageContextRibbonProps = {
  eyebrow?: string;
  title: string;
  subtitle: string;
  status?: string;
};

export default function InvestorDemoHeader({
  eyebrow = "LITERATURE INTELLIGENCE",
  title,
  subtitle,
  status = "Controlled Workspace",
}: PageContextRibbonProps) {
  return (
    <section className="page-context-ribbon">
      <div className="page-identity">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>

      <div className="page-status">
        <span>Status</span>
        <strong>{status}</strong>
      </div>

      <style jsx>{`
        .page-context-ribbon {
          display: flex;
          min-height: 92px;
          justify-content: space-between;
          align-items: stretch;
          margin-bottom: 14px;
          overflow: hidden;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          background: #ffffff;
          box-shadow: 0 3px 10px rgba(15, 23, 42, 0.06);
          font-family: "Poppins", Arial, Helvetica, sans-serif;
        }

        .page-identity {
          display: grid;
          flex: 1;
          align-content: center;
          padding: 15px 20px;
          border-left: 5px solid #185abd;
        }

        .eyebrow {
          color: #185abd;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.075em;
          text-transform: uppercase;
        }

        h1 {
          margin: 4px 0 2px;
          color: #0f172a;
          font-size: clamp(19px, 2.3vw, 27px);
          line-height: 1.2;
          letter-spacing: -0.025em;
        }

        p {
          margin: 0;
          max-width: 940px;
          color: #64748b;
          font-size: 10px;
          line-height: 1.55;
        }

        .page-status {
          display: grid;
          min-width: 205px;
          align-content: center;
          padding: 14px 18px;
          border-left: 1px solid #dbe4ef;
          background: #f8fafc;
        }

        .page-status span {
          color: #64748b;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .page-status strong {
          margin-top: 5px;
          color: #166534;
          font-size: 11px;
        }

        @media (max-width: 700px) {
          .page-context-ribbon {
            flex-direction: column;
          }

          .page-status {
            min-width: 0;
            border-top: 1px solid #dbe4ef;
            border-left: 0;
          }
        }
      `}</style>
    </section>
  );
}

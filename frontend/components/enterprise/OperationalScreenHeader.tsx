import type { ReactNode } from "react";

type OperationalScreenHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  status?: string;
  actions?: ReactNode;
};

export default function OperationalScreenHeader({
  eyebrow,
  title,
  description,
  status,
  actions,
}: OperationalScreenHeaderProps) {
  return (
    <section className="ops-screen-header" aria-labelledby="ops-screen-title">
      <div className="ops-screen-copy">
        <span className="ops-eyebrow">{eyebrow}</span>
        <div className="ops-title-row">
          <h1 id="ops-screen-title">{title}</h1>
          {status ? <span className="ops-status">{status}</span> : null}
        </div>
        <p>{description}</p>
      </div>
      {actions ? <div className="ops-screen-actions">{actions}</div> : null}
      <style jsx>{`
        .ops-screen-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 24px;
          padding: 14px 0 16px;
          border-bottom: 1px solid #d6d9de;
        }
        .ops-screen-copy { min-width: 0; }
        .ops-eyebrow {
          display: block;
          margin-bottom: 4px;
          color: #525252;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: .08em;
          text-transform: uppercase;
        }
        .ops-title-row {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }
        h1 {
          margin: 0;
          color: #161616;
          font-size: 24px;
          font-weight: 600;
          line-height: 1.2;
          letter-spacing: -.01em;
        }
        p {
          max-width: 900px;
          margin: 6px 0 0;
          color: #525252;
          font-size: 13px;
          line-height: 1.45;
        }
        .ops-status {
          display: inline-flex;
          align-items: center;
          min-height: 22px;
          padding: 0 8px;
          border-radius: 2px;
          background: #e0e0e0;
          color: #393939;
          font-size: 11px;
          font-weight: 600;
          white-space: nowrap;
        }
        .ops-screen-actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 8px;
        }
        @media (max-width: 800px) {
          .ops-screen-header { align-items: flex-start; flex-direction: column; }
          .ops-title-row { align-items: flex-start; flex-direction: column; }
          .ops-screen-actions { justify-content: flex-start; }
        }
      `}</style>
    </section>
  );
}

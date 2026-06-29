type StatusItem = {
  label: string;
  value: string;
  active?: boolean;
};

export default function StatusStrip({ items }: { items: StatusItem[] }) {
  return (
    <section className="cx-status-strip">
      {items.map((item) => (
        <div key={item.label} className={`cx-status-tab ${item.active ? "active" : ""}`}>
          <span>{item.label}</span>
          <b>{item.value}</b>
        </div>
      ))}
    </section>
  );
}
type ModuleProps = {
  title: string;
  tone?: "search" | "pipeline" | "knowledge" | "quality";
  rightText?: string;
  children: React.ReactNode;
};

export default function Module({
  title,
  tone = "search",
  rightText,
  children,
}: ModuleProps) {
  return (
    <section className="cx-module">
      <div className={`cx-ribbon cx-ribbon-${tone}`} />
      <div className="cx-module-title cx-spread">
        <span>{title}</span>
        {rightText ? <small>{rightText}</small> : null}
      </div>
      {children}
    </section>
  );
}

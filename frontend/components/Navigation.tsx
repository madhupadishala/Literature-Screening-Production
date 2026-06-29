const navItems = [
  "Mission Control",
  "Search",
  "Screening",
  "Intake",
  "Quality",
  "Reporting",
  "Audit",
  "Admin",
];

export default function Navigation() {
  return (
    <nav className="cx-nav">
      {navItems.map((item) => (
        <button key={item} className={item === "Search" ? "active" : ""}>
          {item}
        </button>
      ))}
    </nav>
  );
}

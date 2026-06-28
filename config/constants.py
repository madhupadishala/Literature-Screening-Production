APP_NAME = "ClinixAI"
APP_TITLE = "Literature Screening Production"
DEFAULT_PROJECT = "Novartis Literature Review"
DEFAULT_ENV = "PRODUCTION"

PAGES = {
    "Dashboard": "pages.dashboard",
    "Hits": "pages.hits",
    "Screening": "pages.screening",
    "Intake": "pages.intake",
    "QC": "pages.qc",
    "Reports": "pages.reports",
    "Audit": "pages.audit",
    "Admin": "pages.admin",
}

WORKFLOW_STAGES = [
    "Hits",
    "Screening",
    "Intake",
    "QC",
    "Reports",
]

COLORS = {
    "primary": "#27ae60",
    "secondary": "#2980b9",
    "warning": "#f39c12",
    "danger": "#e74c3c",
    "dark": "#1a2a40",
    "muted": "#7f8c8d",
    "light_bg": "#f8f9fa",
}

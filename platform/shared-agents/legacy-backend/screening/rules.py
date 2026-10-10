SPECIAL_SITUATIONS = [
    "pregnancy",
    "breastfeeding",
    "overdose",
    "misuse",
    "abuse",
    "medication error",
    "lack of efficacy",
    "off-label",
    "occupational exposure",
    "unexpected therapeutic benefit",
    "product quality",
    "counterfeit",
    "infectious transmission",
    "pediatric",
    "renal failure",
    "hepatic failure",
    "compassionate use",
    "named patient",
]

SERIOUSNESS_TERMS = [
    "death",
    "fatal",
    "life-threatening",
    "hospitalization",
    "hospitalisation",
    "disability",
    "congenital anomaly",
    "birth defect",
    "medically significant",
]

SEVERITY_TERMS = {
    "Severe": ["severe", "grade 3", "grade iii", "critical"],
    "Moderate": ["moderate", "grade 2", "grade ii"],
    "Mild": ["mild", "grade 1", "grade i"],
}

EXCLUSION_TERMS = [
    "animal study",
    "in vitro",
    "preclinical",
    "mechanism of action",
    "meta-analysis",
    "systematic review",
    "pharmacokinetic study",
]
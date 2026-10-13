import os
from dataclasses import dataclass

RULE_PACK_VERSION = "ich-e2a-v1.0.0"
PROMPT_VERSION = "extract-v1"
LEXICON_VERSION = "lex-v1.0.0"


@dataclass(frozen=True)
class Config:
    samples: int = 2                  # independent extraction passes that must agree
    auto_non_serious: bool = False    # OFF until eval gate passes on real gold data
    min_narrative_chars: int = 20
    model: str = ""                   # model is TBD: chosen by benchmark, never hardcoded

    @classmethod
    def from_env(cls) -> "Config":
        return cls(
            samples=int(os.environ.get("SERIOUSNESS_SAMPLES", "2")),
            auto_non_serious=os.environ.get("SERIOUSNESS_AUTO_NON_SERIOUS", "false").lower() == "true",
            model=os.environ.get("SERIOUSNESS_MODEL", ""),
        )

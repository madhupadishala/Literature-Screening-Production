"""
evidence_extractor.py
---------------------
Sentence and evidence-span extraction utilities for ClinixAI product services.

Scope:
    - Split article text into audit-safe sentences.
    - Preserve original character offsets.
    - Extract evidence sentence for matched product mentions.
    - Extract nearby context windows.
    - Extract simple article sections when available.

This module does not classify:
    - product role
    - company product status
    - causality
    - seriousness
    - validity
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import Dict, List, Optional, Tuple


@dataclass(frozen=True)
class SentenceSpan:
    sentence: str
    character_start: int
    character_end: int


@dataclass(frozen=True)
class ContextWindow:
    context: str
    character_start: int
    character_end: int


class EvidenceExtractor:
    """
    Extracts sentences and evidence windows while preserving source offsets.

    Important:
        The original text is never globally normalized before offset calculation.
        This is required for audit traceability.
    """

    COMMON_ABBREVIATIONS = {
        "dr.",
        "mr.",
        "mrs.",
        "ms.",
        "prof.",
        "sr.",
        "jr.",
        "st.",
        "vs.",
        "etc.",
        "fig.",
        "figs.",
        "no.",
        "nos.",
        "vol.",
        "ref.",
        "refs.",
        "dept.",
        "univ.",
        "inc.",
        "ltd.",
        "co.",
        "corp.",
        "u.s.",
        "u.k.",
        "e.u.",
        "e.g.",
        "i.e.",
        "cf.",
        "al.",
        "et al.",
    }

    SECTION_HEADER_RE = re.compile(
        r"""
        (?:^|\n)
        \s*
        (?P<section>
            title
            | abstract
            | introduction
            | background
            | methods?
            | materials\s+and\s+methods
            | case\s+presentation
            | case\s+report
            | results?
            | discussion
            | conclusion
            | conclusions
            | references
            | acknowledg(?:e)?ments?
        )
        \s*
        (?::|—|-)?
        \s*
        (?:\n|$)
        """,
        flags=re.IGNORECASE | re.VERBOSE,
    )

    def split_sentences(self, text: str) -> List[Tuple[str, int, int]]:
        """
        Split text into sentences while preserving exact offsets.

        Returns:
            List of tuples:
                (sentence_text, character_start, character_end)
        """

        if not text:
            return []

        sentences: List[SentenceSpan] = []

        start = self._first_non_whitespace_index(text, 0, len(text))
        cursor = start
        text_length = len(text)

        while cursor < text_length:
            character = text[cursor]

            if character not in ".!?":
                cursor += 1
                continue

            if not self._is_sentence_boundary(text, cursor):
                cursor += 1
                continue

            end = self._consume_sentence_tail(text, cursor + 1)

            stripped_start = self._first_non_whitespace_index(text, start, end)
            stripped_end = self._last_non_whitespace_index(text, start, end)

            if stripped_start < stripped_end:
                sentences.append(
                    SentenceSpan(
                        sentence=text[stripped_start:stripped_end],
                        character_start=stripped_start,
                        character_end=stripped_end,
                    )
                )

            start = self._first_non_whitespace_index(text, end, text_length)
            cursor = start

        if start < text_length:
            stripped_start = self._first_non_whitespace_index(text, start, text_length)
            stripped_end = self._last_non_whitespace_index(text, start, text_length)

            if stripped_start < stripped_end:
                sentences.append(
                    SentenceSpan(
                        sentence=text[stripped_start:stripped_end],
                        character_start=stripped_start,
                        character_end=stripped_end,
                    )
                )

        return [
            (item.sentence, item.character_start, item.character_end)
            for item in sentences
        ]

    def sentence_boundaries(self, text: str) -> List[Tuple[int, int]]:
        return [
            (character_start, character_end)
            for _, character_start, character_end in self.split_sentences(text)
        ]

    def find_sentence(
        self,
        text: str,
        position: int,
    ) -> Optional[Tuple[str, int, int]]:
        if not text:
            return None

        if position < 0 or position > len(text):
            return None

        for sentence, start, end in self.split_sentences(text):
            if start <= position < end:
                return sentence, start, end

        if position == len(text):
            sentences = self.split_sentences(text)
            if sentences:
                return sentences[-1]

        return None

    def find_sentence_for_span(
        self,
        text: str,
        char_start: int,
        char_end: int,
    ) -> Optional[Tuple[str, int, int]]:
        if not text:
            return None

        if char_start < 0 or char_end < 0:
            return None

        if char_start > char_end:
            return None

        if char_start > len(text):
            return None

        return self.find_sentence(text, char_start)

    def extract_context_window(
        self,
        text: str,
        char_start: int,
        char_end: int,
        window: int = 120,
    ) -> Tuple[str, int, int]:
        """
        Extract nearby context around a character span.

        Returns:
            (context_text, character_start, character_end)
        """

        if not text:
            return "", 0, 0

        if window < 0:
            raise ValueError("window must be greater than or equal to 0")

        safe_start = max(0, min(char_start, len(text)))
        safe_end = max(safe_start, min(char_end, len(text)))

        context_start = max(0, safe_start - window)
        context_end = min(len(text), safe_end + window)

        stripped_start = self._first_non_whitespace_index(
            text,
            context_start,
            context_end,
        )
        stripped_end = self._last_non_whitespace_index(
            text,
            context_start,
            context_end,
        )

        if stripped_start >= stripped_end:
            return "", context_start, context_end

        return text[stripped_start:stripped_end], stripped_start, stripped_end

    def extract_context_window_dict(
        self,
        text: str,
        char_start: int,
        char_end: int,
        window: int = 120,
    ) -> Dict[str, object]:
        context, start, end = self.extract_context_window(
            text=text,
            char_start=char_start,
            char_end=char_end,
            window=window,
        )

        return asdict(
            ContextWindow(
                context=context,
                character_start=start,
                character_end=end,
            )
        )

    def extract_section(
        self,
        text: str,
        section_name: str,
    ) -> Optional[str]:
        """
        Extract a named article section by simple heading detection.

        Returns only the section text, not offsets.
        Use extract_section_with_offsets when audit offsets are needed.
        """

        section = self.extract_section_with_offsets(text, section_name)
        if not section:
            return None

        section_text, _, _ = section
        return section_text

    def extract_section_with_offsets(
        self,
        text: str,
        section_name: str,
    ) -> Optional[Tuple[str, int, int]]:
        """
        Extract a named section and preserve offsets.

        Returns:
            (section_text, character_start, character_end)
        """

        if not text or not section_name or not section_name.strip():
            return None

        wanted = self._normalize_heading(section_name)

        matches = list(self.SECTION_HEADER_RE.finditer(text))
        if not matches:
            return None

        for index, match in enumerate(matches):
            found = self._normalize_heading(match.group("section"))

            if found != wanted:
                continue

            section_start = match.end()
            section_end = (
                matches[index + 1].start()
                if index + 1 < len(matches)
                else len(text)
            )

            stripped_start = self._first_non_whitespace_index(
                text,
                section_start,
                section_end,
            )
            stripped_end = self._last_non_whitespace_index(
                text,
                section_start,
                section_end,
            )

            if stripped_start >= stripped_end:
                return "", stripped_start, stripped_end

            return (
                text[stripped_start:stripped_end],
                stripped_start,
                stripped_end,
            )

        return None

    def to_sentence_dicts(self, text: str) -> List[Dict[str, object]]:
        return [
            asdict(
                SentenceSpan(
                    sentence=sentence,
                    character_start=start,
                    character_end=end,
                )
            )
            for sentence, start, end in self.split_sentences(text)
        ]

    def _is_sentence_boundary(self, text: str, punctuation_index: int) -> bool:
        if self._is_decimal_point(text, punctuation_index):
            return False

        token = self._token_before_index(text, punctuation_index + 1).lower()

        if token in self.COMMON_ABBREVIATIONS:
            return False

        if self._looks_like_initial(text, punctuation_index):
            return False

        next_non_space = self._next_non_whitespace_index(
            text,
            punctuation_index + 1,
            len(text),
        )

        if next_non_space >= len(text):
            return True

        next_char = text[next_non_space]

        if next_char in ")]}":
            return True

        if next_char.islower():
            return False

        return True

    @staticmethod
    def _is_decimal_point(text: str, index: int) -> bool:
        return (
            text[index] == "."
            and index > 0
            and index + 1 < len(text)
            and text[index - 1].isdigit()
            and text[index + 1].isdigit()
        )

    @staticmethod
    def _looks_like_initial(text: str, index: int) -> bool:
        if text[index] != ".":
            return False

        previous_index = index - 1

        if previous_index < 0:
            return False

        if not text[previous_index].isalpha():
            return False

        token_start = previous_index

        while token_start > 0 and text[token_start - 1].isalpha():
            token_start -= 1

        token = text[token_start:index]

        return len(token) == 1

    @staticmethod
    def _token_before_index(text: str, index: int) -> str:
        cursor = min(index, len(text)) - 1

        while cursor >= 0 and text[cursor].isspace():
            cursor -= 1

        if cursor < 0:
            return ""

        end = cursor + 1

        while cursor >= 0 and not text[cursor].isspace():
            cursor -= 1

        return text[cursor + 1:end]

    @staticmethod
    def _consume_sentence_tail(text: str, index: int) -> int:
        cursor = index
        text_length = len(text)

        while cursor < text_length and text[cursor] in "\"')]}":
            cursor += 1

        while cursor < text_length and text[cursor].isspace():
            cursor += 1

        return cursor

    @staticmethod
    def _first_non_whitespace_index(
        text: str,
        start: int,
        end: int,
    ) -> int:
        cursor = max(0, start)
        safe_end = min(len(text), max(start, end))

        while cursor < safe_end and text[cursor].isspace():
            cursor += 1

        return cursor

    @staticmethod
    def _last_non_whitespace_index(
        text: str,
        start: int,
        end: int,
    ) -> int:
        safe_start = max(0, start)
        cursor = min(len(text), end)

        while cursor > safe_start and text[cursor - 1].isspace():
            cursor -= 1

        return cursor

    @staticmethod
    def _next_non_whitespace_index(
        text: str,
        start: int,
        end: int,
    ) -> int:
        cursor = max(0, start)
        safe_end = min(len(text), end)

        while cursor < safe_end and text[cursor].isspace():
            cursor += 1

        return cursor

    @staticmethod
    def _normalize_heading(value: str) -> str:
        normalized = str(value).strip().lower()
        normalized = re.sub(r"\s+", " ", normalized)
        return normalized


if __name__ == "__main__":
    sample = (
        "Abstract\n"
        "Dr. Rao reported acetaminophen 500 mg tablets. "
        "N-acetylcysteine infusion was started. "
        "Ibuprofen 400 mg was taken earlier.\n\n"
        "Conclusion\n"
        "The patient recovered."
    )

    extractor = EvidenceExtractor()
    print(extractor.split_sentences(sample))
    print(extractor.find_sentence(sample, sample.lower().find("acetaminophen")))
    print(extractor.extract_section_with_offsets(sample, "abstract"))
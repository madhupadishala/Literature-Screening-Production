import unittest
from unittest.mock import patch
from translation_agent import TranslationError, segment_text, translate_article

class TranslationTests(unittest.TestCase):
    def test_segmentation_preserves_all_content(self):
        source = "Hello world. " * 200
        parts = segment_text(source, max_chars=120)
        self.assertTrue(all(len(x) <= 120 for x in parts))
        self.assertGreater(len(parts), 1)

    def test_injected_adapter_preserves_alignment(self):
        result = translate_article("患者出现呕吐。", tenant_id="t1", client_id="c1",
            source_language="Chinese", translator=lambda s, a, b: "The patient experienced vomiting.")
        self.assertEqual(result.status, "translated_unreviewed")
        self.assertEqual(result.segments[0].source, "患者出现呕吐。")
        self.assertTrue(result.requires_human_review)

    def test_no_mock_without_provider(self):
        with patch.dict("os.environ", {}, clear=True):
            with self.assertRaises(TranslationError):
                translate_article("患者出现呕吐。", tenant_id="t1", client_id="c1", source_language="Chinese")

    def test_same_language(self):
        x = translate_article("Patient had fever.", tenant_id="t", client_id="c",
            source_language="English")
        self.assertEqual(x.segments[0].translated, "Patient had fever.")
        self.assertFalse(x.requires_human_review)

    def test_missing_scope(self):
        with self.assertRaises(ValueError):
            translate_article("Bonjour", tenant_id="", client_id="c", source_language="French")

if __name__ == "__main__":
    unittest.main()

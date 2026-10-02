import unittest

from heading_units import detect_heading_units


class HeadingUnitsTests(unittest.TestCase):
    def test_extracts_explicit_headings_and_deduplicates(self):
        pages = [
            {"page": 1, "text": "# Unit1: Animals\n## Lesson 1\n第一单元：认识动物"},
            {"page": 2, "text": "Unit1: Animals\n第 2 课：课堂练习"},
        ]
        self.assertEqual(
            detect_heading_units(pages),
            ["Unit1: Animals", "Lesson 1", "第一单元：认识动物", "第 2 课：课堂练习"],
        )

    def test_ignores_assessment_prose_and_table_rows(self):
        pages = [
            {
                "page": 21,
                "text": "第 37 周进行阶段重点内容评估；\n"
                "| 80 | 大复习 |\n| 81 | 阶段测评四 |\n"
                "第1课的复习说明\n## 第81课时：阶段测评四",
            }
        ]
        self.assertEqual(detect_heading_units(pages), ["第81课时：阶段测评四"])

    def test_respects_candidate_limit(self):
        pages = [{"page": 1, "text": "\n".join(f"Unit{n}" for n in range(1, 5))}]
        self.assertEqual(detect_heading_units(pages, limit=2), ["Unit1", "Unit2"])


if __name__ == "__main__":
    unittest.main()

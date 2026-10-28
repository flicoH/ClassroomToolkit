"""保留 Docling 返回的明确标题；表格课时由后端按页文本识别。"""

import re


HEADING = re.compile(
    r"^(?:第\s*[\d零〇一二三四五六七八九十百两]+\s*"
    r"(?:单元|课时|课|节|章|周)(?=$|[\s:：.、-])|"
    r"Unit\s*\d+(?=$|[\s:：.、-])|"
    r"Lesson\s*\d+(?=$|[\s:：.、-]))",
    re.I,
)


def detect_heading_units(pages: list[dict], limit: int = 100) -> list[str]:
    """只返回短标题，避免把“第 N 周进行……”的叙述当成课程章节。"""
    units: list[str] = []
    for page in pages:
        for line in page["text"].splitlines():
            heading = line.strip().lstrip("#* ").strip()
            if 1 < len(heading) < 100 and HEADING.match(heading) and heading not in units:
                units.append(heading)
                if len(units) >= limit:
                    return units
    return units

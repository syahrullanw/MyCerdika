"""Best-effort text extraction for common Indonesian RPS PDF templates.

The parser intentionally returns a draft. Different institutions use different
table layouts, so the UI must let the lecturer review the extracted values
before saving them as the final RPS.
"""

from __future__ import annotations

import io
import re
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple
from xml.etree import ElementTree


class RPSPdfDependencyError(RuntimeError):
    """Raised when an optional document extraction dependency is unavailable."""


class RPSPdfParseError(ValueError):
    """Raised when the uploaded file is not a readable, text-based PDF."""


RPS_FORM_FIELDS = (
    "course_name",
    "course_code",
    "semester",
    "sks",
    "program_name",
    "lecturer_name",
    "compiled_at",
    "cpl_sikap",
    "cpl_keterampilan_umum",
    "cpl_pengetahuan",
    "cpl_keterampilan_khusus",
    "cpl_prodi",
    "keterangan",
    "cpmk",
    "description",
    "materials",
    "prerequisites",
    "references",
    "activity",
    "output",
)


def _normalise_space(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "").replace("\u00a0", " ")).strip()


def _normalise_lines(text: str) -> List[str]:
    lines: List[str] = []
    for raw_line in str(text or "").replace("\r", "\n").split("\n"):
        line = _normalise_space(raw_line)
        if line:
            lines.append(line)
    return lines


def _label_pattern(label: str) -> re.Pattern[str]:
    escaped = re.escape(_normalise_space(label)).replace(r"\ ", r"\s+")
    return re.compile(rf"^{escaped}(?:\s*(?::|[-–])\s*(.*)|\s*)$", re.IGNORECASE)


def _clean_section(lines: Iterable[str], max_chars: int = 16000) -> str:
    value = "\n".join(_normalise_space(line) for line in lines if _normalise_space(line))
    value = re.sub(r"[ \t]+", " ", value).strip()
    return value[:max_chars].strip()


def _find_label_value(
    lines: Sequence[str], labels: Sequence[str], start_at: int = 0
) -> Tuple[str, Optional[int]]:
    patterns = [(_label_pattern(label), len(label)) for label in sorted(labels, key=len, reverse=True)]
    for index in range(max(0, start_at), len(lines)):
        line = lines[index]
        for pattern, _ in patterns:
            match = pattern.match(line)
            if not match:
                continue
            value = _normalise_space(match.group(1))
            if value:
                return value, index
            for next_index in range(index + 1, min(index + 3, len(lines))):
                candidate = _normalise_space(lines[next_index])
                if candidate:
                    # Do not consume the next metadata label as the value of
                    # an empty field, e.g. an empty course code followed by
                    # `Tanggal Penyusunan : ...` in a Word table.
                    if re.match(r"^[A-Za-zÀ-ÿ][^:]{0,80}\s*:", candidate):
                        break
                    return candidate, index
            return "", index
    return "", None


def _heading_pattern(heading: str) -> re.Pattern[str]:
    escaped = re.escape(_normalise_space(heading)).replace(r"\ ", r"\s+")
    return re.compile(rf"^{escaped}(?:(?:\s*[:–-]\s*|\s+)(.*))?$", re.IGNORECASE)


def _find_heading(
    lines: Sequence[str], headings: Sequence[str], start_at: int = 0
) -> Tuple[Optional[int], str]:
    patterns = [_heading_pattern(heading) for heading in sorted(headings, key=len, reverse=True)]
    for index in range(max(0, start_at), len(lines)):
        for pattern in patterns:
            match = pattern.match(lines[index])
            if match:
                return index, _normalise_space(match.group(1) or "")
    return None, ""


def _extract_section(
    lines: Sequence[str],
    headings: Sequence[str],
    stop_headings: Sequence[str],
    start_at: int = 0,
) -> str:
    start_index, inline_value = _find_heading(lines, headings, start_at)
    if start_index is None:
        return ""

    stop_patterns = [_heading_pattern(heading) for heading in sorted(stop_headings, key=len, reverse=True)]
    section_lines: List[str] = [inline_value] if inline_value else []
    for line in lines[start_index + 1 :]:
        if any(pattern.match(line) for pattern in stop_patterns):
            break
        section_lines.append(line)
    return _clean_section(section_lines)


def _date_to_iso(value: str) -> str:
    raw = _normalise_space(value)
    month_names = {
        "januari": 1,
        "februari": 2,
        "maret": 3,
        "april": 4,
        "mei": 5,
        "juni": 6,
        "juli": 7,
        "agustus": 8,
        "september": 9,
        "oktober": 10,
        "november": 11,
        "desember": 12,
    }
    named_match = re.search(r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", raw, re.IGNORECASE)
    if named_match and named_match.group(2).casefold() in month_names:
        day, month, year = named_match.groups()
        return f"{year}-{month_names[month.casefold()]:02d}-{int(day):02d}"
    match = re.search(r"(\d)\s*(\d)\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{4})", raw)
    if match:
        day = f"{match.group(1)}{match.group(2)}"
        month = match.group(3)
        year = match.group(4)
    else:
        match = re.search(r"(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{4})", raw)
        if not match:
            return raw
        day, month, year = match.groups()
    if len(day) == 2 and len(month) <= 2:
        return f"{year}-{int(month):02d}-{int(day):02d}"
    return raw


def _is_table_header(line: str) -> bool:
    lowered = _normalise_space(line).casefold()
    return any(
        marker in lowered
        for marker in (
            "minggu ke",
            "kemampuan yang diharapkan",
            "sub-cpmk",
            "materi pembelajaran",
            "bentuk, metode pembelajaran",
            "waktu (menit)",
            "penilaian",
            "indikator",
            "kriteria",
            "bobot (%)",
        )
    )


def _meeting_markers(lines: Sequence[str], start_at: int) -> List[Tuple[int, int, str]]:
    markers: List[Tuple[int, int, str]] = []
    marker_re = re.compile(r"^(1[0-6]|[1-9])(?:\s*[.)]\s*(.*)|\s+(.*)|\s*)$")
    spaced_two_digit_re = re.compile(r"^1\s*([0-6])\s*[.)]?\s*$")
    skipped_indices: set[int] = set()
    for index in range(start_at, len(lines)):
        if index in skipped_indices:
            continue
        line = lines[index]
        spaced_match = spaced_two_digit_re.match(line)
        split_match = None
        if re.fullmatch(r"1\s*", line) and index + 1 < len(lines):
            split_match = re.fullmatch(r"([0-6])\s*[.)]?", lines[index + 1])
        match = marker_re.match(line)
        if split_match:
            number = int(f"1{split_match.group(1)}")
            inline_value = ""
            skipped_indices.add(index + 1)
        elif spaced_match:
            number = int(f"1{spaced_match.group(1)}")
            inline_value = ""
        elif not match:
            # Some PDF text extractors split `10.` into two separate lines:
            # `1` and `0.`. Recombine only this very specific row-number shape.
            if re.fullmatch(r"1\s*", line) and index + 1 < len(lines):
                next_match = re.fullmatch(r"([0-6])\s*[.)]?", lines[index + 1])
                if next_match:
                    number = int(f"1{next_match.group(1)}")
                    inline_value = ""
                    skipped_indices.add(index + 1)
                    match = None
                else:
                    continue
            else:
                continue
        else:
            number = int(match.group(1))
            inline_value = _normalise_space(match.group(2) or match.group(3) or "")
        # Row numbers are only meaningful after the table header. Ignore any
        # later numbered references once a complete table has been found.
        if markers and number == 1 and markers[-1][1] == 16:
            break
        if any(existing_number == number for _, existing_number, _ in markers):
            continue
        markers.append((index, number, inline_value))
    return markers


def _parse_meeting_block(number: int, block_lines: Sequence[str], inline_value: str = "") -> Dict[str, Any]:
    data = [_normalise_space(line) for line in block_lines if _normalise_space(line) and not _is_table_header(line)]
    if inline_value:
        data.insert(0, inline_value)

    # Exam rows are often merged in official Word templates and contain only
    # title, duration, submission method, and weight.
    if number in {8, 16} and len(data) <= 5:
        title = data[0] if data else f"Pertemuan {number}"
        waktu = data[1] if len(data) > 1 else ""
        method = data[2] if len(data) > 2 else ""
        weight = data[3] if len(data) > 3 else ""
        return {
            "meeting_number": number,
            "topic": title,
            "sub_topic": title,
            "learning_outcome": title,
            "method": method,
            "materials": title,
            "assignments": "",
            "waktu": waktu,
            "penilaian_teknik": "",
            "penilaian_indikator": "",
            "penilaian_kriteria": "",
            "penilaian_bobot": weight,
            "is_exam": True,
        }

    # Common RPS tables contain: Sub-CPMK, Materi, Metode, Waktu,
    # Teknik, Indikator, Kriteria, Bobot. Some PDFs collapse empty cells, so
    # use the first and last columns as anchors and keep the parser forgiving.
    if len(data) >= 8:
        outcome, materials, method, waktu = data[:4]
        technique, indicator, criteria, weight = data[-4:]
    else:
        padded = list(data) + [""] * (8 - len(data))
        outcome, materials, method, waktu, technique, indicator, criteria, weight = padded[:8]

    is_exam = number in {8, 16} or bool(re.search(r"\b(uts|uas|ujian tengah|ujian akhir)\b", " ".join(data), re.IGNORECASE))
    topic = materials or outcome or f"Pertemuan {number}"
    return {
        "meeting_number": number,
        "topic": topic,
        "sub_topic": materials,
        "learning_outcome": outcome,
        "method": method,
        "materials": materials,
        "assignments": "",
        "waktu": waktu,
        "penilaian_teknik": technique,
        "penilaian_indikator": indicator,
        "penilaian_kriteria": criteria,
        "penilaian_bobot": weight,
        "is_exam": is_exam,
    }


def _extract_meetings(lines: Sequence[str]) -> List[Dict[str, Any]]:
    table_start = None
    for index, line in enumerate(lines):
        lowered = line.casefold()
        next_line = lines[index + 1].casefold() if index + 1 < len(lines) else ""
        split_week_heading = lowered in {"mingg", "minggu"} and next_line.startswith("u ke")
        if (
            "minggu ke" in lowered
            or "pertemuan ke" in lowered
            or "kemampuan yang diharapkan" in lowered
            or split_week_heading
        ):
            table_start = index
            break
    if table_start is None:
        return []

    markers = _meeting_markers(lines, table_start + 1)
    meetings: List[Dict[str, Any]] = []
    for marker_index, (line_index, number, inline_value) in enumerate(markers):
        next_index = markers[marker_index + 1][0] if marker_index + 1 < len(markers) else len(lines)
        meeting = _parse_meeting_block(number, lines[line_index + 1 : next_index], inline_value)
        meetings.append(meeting)
    return sorted(meetings, key=lambda item: item["meeting_number"])


def _parse_meeting_cells(number: int, cells: Sequence[str]) -> Dict[str, Any]:
    """Map a real Word table row, which is more reliable than PDF text order."""

    values = [_normalise_space(cell) for cell in cells]
    first_cell = values[0] if values else ""
    if re.fullmatch(r"(?:1[0-6]|[1-9])\s*[.)]?", first_cell):
        values = values[1:]
    non_empty_values = [value for value in values if value]
    if number in {8, 16} and len(values) <= 5:
        title = values[0] if values else f"Pertemuan {number}"
        return {
            "meeting_number": number,
            "topic": title,
            "sub_topic": title,
            "learning_outcome": title,
            "method": values[2] if len(values) > 2 else "",
            "materials": title,
            "assignments": "",
            "waktu": values[1] if len(values) > 1 else "",
            "learning_experience": "",
            "penilaian_bentuk_kriteria": "",
            "penilaian_teknik": "",
            "penilaian_indikator": "",
            "penilaian_kriteria": "",
            "penilaian_bobot": values[3] if len(values) > 3 else "",
            "is_exam": True,
        }
    if number in {8, 16} and len(non_empty_values) <= 3:
        title = non_empty_values[0] if non_empty_values else f"Pertemuan {number}"
        return {
            "meeting_number": number,
            "topic": title,
            "sub_topic": title,
            "learning_outcome": title,
            "method": "",
            "materials": title,
            "assignments": "",
            "waktu": "",
            "learning_experience": "",
            "penilaian_bentuk_kriteria": "",
            "penilaian_teknik": "",
            "penilaian_indikator": "",
            "penilaian_kriteria": "",
            "penilaian_bobot": "",
            "is_exam": True,
        }
    padded = list(values) + [""] * max(0, 8 - len(values))
    if len(values) <= 8:
        outcome, materials, method, waktu, experience, assessment, indicator, weight = padded[:8]
        technique = assessment
        criteria = ""
    else:
        outcome, materials, method, waktu, technique, weight, indicator, criteria, assignments = (padded + [""])[:9]
        experience = assignments
    is_exam = number in {8, 16} or bool(
        re.search(r"\b(uts|uas|ujian tengah|ujian akhir)\b", " ".join(values), re.IGNORECASE)
    )
    topic = materials or outcome or f"Pertemuan {number}"
    return {
        "meeting_number": number,
        "topic": topic,
        "sub_topic": materials,
        "learning_outcome": outcome,
        "method": method,
        "materials": materials,
        "assignments": experience,
        "waktu": waktu,
        "learning_experience": experience,
        "penilaian_bentuk_kriteria": assessment if len(values) <= 8 else technique,
        "penilaian_teknik": technique,
        "penilaian_indikator": indicator,
        "penilaian_kriteria": criteria,
        "penilaian_bobot": weight,
        "is_exam": is_exam,
    }


# The PDF exporter used by several RPS templates writes each table cell at a
# fixed x-coordinate. Normal PDF text extraction loses that relationship and
# interleaves the columns. These boundaries match the common A4 landscape RPS
# layout; the line-based parser remains the fallback for other templates.
_PDF_COLUMN_STARTS = (80.0, 115.0, 200.0, 320.0, 390.0, 465.0, 525.0, 620.0, 720.0)
_PDF_HEADER_MARKERS = (
    "mingg",
    "u ke",
    "kemampuan",
    "diharapkan",
    "sub-cpmk",
    "materi pembelajaran",
    "bentuk",
    "metode pembelajaran",
    "waktu",
    "penilaian",
    "indikator",
    "kriteria",
    "bobot",
)


def _pdf_line_groups(fragments: Sequence[Tuple[float, float, str]]) -> List[Dict[str, Any]]:
    """Group visitor-text fragments that share a PDF baseline."""

    groups: List[Dict[str, Any]] = []
    for x, y, text in fragments:
        value = str(text or "").replace("\n", " ").strip()
        if not value:
            continue
        group = next((item for item in groups if abs(item["y"] - y) <= 1.5), None)
        if group is None:
            group = {"y": y, "fragments": []}
            groups.append(group)
        group["fragments"].append((x, y, value))
    for group in groups:
        group["fragments"].sort(key=lambda item: item[0])
    return sorted(groups, key=lambda item: item["y"], reverse=True)


def _pdf_column_index(x: float) -> int:
    for index in range(len(_PDF_COLUMN_STARTS) - 1, -1, -1):
        if x >= _PDF_COLUMN_STARTS[index]:
            return index
    return 0


def _pdf_meeting_number(group: Dict[str, Any]) -> Optional[int]:
    number_text = "".join(
        text for x, _y, text in group["fragments"] if x < _PDF_COLUMN_STARTS[1]
    )
    compact = re.sub(r"\s+", "", number_text)
    match = re.fullmatch(r"(1[0-6]|[1-9])\.?", compact)
    return int(match.group(1)) if match else None


def _pdf_is_header_group(group: Dict[str, Any]) -> bool:
    text = _normalise_space(" ".join(item[2] for item in group["fragments"])).casefold()
    if any(marker in text for marker in _PDF_HEADER_MARKERS):
        return True
    exact_fragments = {
        re.sub(r"[^a-z0-9%]+", " ", item[2].casefold()).strip()
        for item in group["fragments"]
    }
    compact = re.sub(r"[^a-z0-9%]+", " ", text).strip()
    header_tokens = {"materi", "pembelajaran", "pembelajara", "cpmk", "menit", "%"}
    return compact in header_tokens or bool(exact_fragments & header_tokens)


def _pdf_is_exam_preview(group: Dict[str, Any]) -> bool:
    columns = {
        _pdf_column_index(x)
        for x, _y, _text in group["fragments"]
        if x >= _PDF_COLUMN_STARTS[1]
    }
    return {2, 4, 6, 8}.issubset(columns) and 1 not in columns and 3 not in columns


def _append_pdf_group(current: Dict[str, Any], group: Dict[str, Any]) -> None:
    current["groups"].append(group)
    for x, _y, text in group["fragments"]:
        fragment = _normalise_space(text).casefold()
        if x < _PDF_COLUMN_STARTS[1] or (320 <= x < 390 and fragment == "n dan"):
            continue
        current["columns"][_pdf_column_index(x)].append(text)


def _extract_pdf_meetings(reader: Any) -> List[Dict[str, Any]]:
    """Extract PDF meeting rows while preserving their visual columns."""

    table_seen = False
    current: Optional[Dict[str, Any]] = None
    meetings: List[Dict[str, Any]] = []

    def finish_current() -> None:
        nonlocal current
        if not current:
            return
        number = int(current["number"])
        columns = [_normalise_space(" ".join(values)) for values in current["columns"]]
        if number in {8, 16} and any(columns):
            # Exam rows use only title, duration, method, and weight, but the
            # PDF still exposes the row over the full visual table width.
            title = columns[1] or columns[2]
            method = columns[3] or columns[6]
            cells = [str(number), title, columns[4], method, columns[8]]
        else:
            # Column zero is the visual meeting-number column and has already
            # been consumed by _parse_meeting_cells.
            cells = [str(number), *columns[1:]]
        meetings.append(_parse_meeting_cells(number, cells))
        current = None

    for page in reader.pages:
        fragments: List[Tuple[float, float, str]] = []

        def visitor_text(text: str, _cm: Any, tm: Sequence[float], _font: Any, _size: float) -> None:
            if not text or len(tm) < 6:
                return
            try:
                x, y = float(tm[4]), float(tm[5])
            except (TypeError, ValueError):
                return
            fragments.append((x, y, text))

        try:
            page_text = page.extract_text() or ""
            page.extract_text(visitor_text=visitor_text)
        except Exception:
            # Some PDFs do not support visitor callbacks. The caller falls
            # back to the regular line parser in that case.
            continue

        page_lower = _normalise_space(page_text).casefold()
        if any(marker in page_lower for marker in ("mingg", "pertemuan", "kemampuan yang diharapkan")):
            table_seen = True
        if not table_seen:
            continue

        for group in _pdf_line_groups(fragments):
            number = _pdf_meeting_number(group)
            if number is not None:
                carry_groups: List[Dict[str, Any]] = []
                if current and number in {8, 16}:
                    carry_groups = [
                        previous
                        for previous in current["groups"]
                        if previous["y"] > group["y"] + 1.5 and _pdf_is_exam_preview(previous)
                    ]
                    if carry_groups:
                        retained_groups = [
                            previous for previous in current["groups"] if previous not in carry_groups
                        ]
                        current["groups"] = []
                        current["columns"] = [[] for _ in _PDF_COLUMN_STARTS]
                        for previous in retained_groups:
                            _append_pdf_group(current, previous)
                finish_current()
                current = {
                    "number": number,
                    "columns": [[] for _ in _PDF_COLUMN_STARTS],
                    "groups": [],
                }
                for previous in carry_groups:
                    _append_pdf_group(current, previous)

            if current is None or _pdf_is_header_group(group):
                continue

            _append_pdf_group(current, group)

    finish_current()
    deduplicated = {
        meeting["meeting_number"]: meeting
        for meeting in meetings
        if 1 <= meeting["meeting_number"] <= 16
    }
    return [deduplicated[number] for number in sorted(deduplicated)]


def _official_between(text: str, start: str, stops: Sequence[str]) -> str:
    """Extract a section from the flattened text of the approved RPS template."""

    source = _normalise_space(text)
    start_match = re.search(re.escape(start), source, flags=re.IGNORECASE)
    if not start_match:
        return ""
    value_start = start_match.end()
    stop_positions = []
    for stop in stops:
        match = re.search(re.escape(stop), source[value_start:], flags=re.IGNORECASE)
        if match:
            stop_positions.append(value_start + match.start())
    value_end = min(stop_positions) if stop_positions else len(source)
    return _clean_section([source[value_start:value_end]], max_chars=30000)


def _official_pdf_number(group: Dict[str, Any]) -> Optional[int]:
    """Read the week number from the left-most column of the approved PDF.

    The supplied template is a Word-exported landscape PDF whose text matrix is
    scaled beyond the visible page width.  Its week column is nevertheless
    stable around x=244..255, while numeric fragments in the time column begin
    around x=1700.  Restricting the probe to the left-most band avoids treating
    every ``4`` in ``1x4x45`` as a new meeting.
    """

    number_text = "".join(
        text for x, _y, text in group["fragments"] if x < 350
    )
    compact = re.sub(r"\s+", "", number_text)
    match = re.fullmatch(r"(1[0-6]|[1-9])\.?", compact)
    return int(match.group(1)) if match else None


_OFFICIAL_PDF_COLUMN_STARTS = (0.0, 350.0, 800.0, 1200.0, 1650.0, 1880.0, 2300.0, 2600.0, 3100.0)


def _official_pdf_column_index(x: float) -> int:
    for index in range(len(_OFFICIAL_PDF_COLUMN_STARTS) - 1, -1, -1):
        if x >= _OFFICIAL_PDF_COLUMN_STARTS[index]:
            return index
    return 0


def _official_meeting_from_columns(number: int, columns: Sequence[str]) -> Dict[str, Any]:
    def repair_pdf_word_splits(value: str) -> str:
        repaired = _normalise_space(value)
        previous = ""
        while repaired != previous:
            previous = repaired
            repaired = re.sub(r"\b([A-Za-z])\s+([a-z]{2,})\b", r"\1\2", repaired)
        return re.sub(r"(\d)\s+%", r"\1%", repaired)

    values = [repair_pdf_word_splits(value) for value in columns]
    if number in {8, 16}:
        title = next((value for value in values[1:] if value), f"Pertemuan {number}")
        return {
            "meeting_number": number,
            "topic": title,
            "sub_topic": title,
            "learning_outcome": title,
            "method": "",
            "materials": title,
            "assignments": "",
            "waktu": "",
            "learning_experience": "",
            "penilaian_bentuk_kriteria": "",
            "penilaian_teknik": "",
            "penilaian_indikator": "",
            "penilaian_kriteria": "",
            "penilaian_bobot": "",
            "is_exam": True,
        }

    padded = list(values[1:]) + [""] * 8
    outcome, materials, method, waktu, experience, assessment, indicator, weight = padded[:8]
    return {
        "meeting_number": number,
        "topic": materials or outcome or f"Pertemuan {number}",
        "sub_topic": materials,
        "learning_outcome": outcome,
        "method": method,
        "materials": materials,
        "assignments": experience,
        "waktu": waktu,
        "learning_experience": experience,
        "penilaian_bentuk_kriteria": assessment,
        "penilaian_teknik": assessment,
        "penilaian_indikator": indicator,
        "penilaian_kriteria": "",
        "penilaian_bobot": weight,
        "is_exam": False,
    }


def _extract_official_pdf_meetings(reader: Any) -> List[Dict[str, Any]]:
    """Extract the nine visual columns used by the approved RPS template."""

    weekly_started = False
    first_row_seen = False
    finished_after_uas = False
    current: Optional[Dict[str, Any]] = None
    meetings: List[Dict[str, Any]] = []

    def finish_current() -> None:
        nonlocal current
        if not current:
            return
        meetings.append(_official_meeting_from_columns(current["number"], current["columns"]))
        current = None

    for page in reader.pages:
        if finished_after_uas:
            break
        try:
            page_text = page.extract_text() or ""
        except Exception:
            page_text = ""
        page_lower = _normalise_space(page_text).casefold()
        if not weekly_started and "minggu ke" not in page_lower:
            continue

        fragments: List[Tuple[float, float, str]] = []

        def visitor_text(text: str, _cm: Any, tm: Sequence[float], _font: Any, _size: float) -> None:
            if not text or len(tm) < 6:
                return
            try:
                x, y = float(tm[4]), float(tm[5])
            except (TypeError, ValueError):
                return
            value = str(text).replace("\n", " ").strip()
            if value:
                fragments.append((x, y, value))

        try:
            page.extract_text(visitor_text=visitor_text)
        except Exception:
            continue

        for group in _pdf_line_groups(fragments):
            group_text = _normalise_space(" ".join(item[2] for item in group["fragments"]))
            lowered = group_text.casefold()
            if finished_after_uas:
                if "catatan" in lowered:
                    break
                if current is not None:
                    for x, _y, text in group["fragments"]:
                        if x < _OFFICIAL_PDF_COLUMN_STARTS[1]:
                            continue
                        column = _official_pdf_column_index(x)
                        current["columns"][column] = _normalise_space(
                            f"{current['columns'][column]} {text}"
                        )
                continue
            if not weekly_started:
                # The multi-line header is split into several baselines in
                # Word's PDF export.  The `Bobot` fragment is the last stable
                # header anchor before the first week row.
                if "bobot" in lowered or ("ming" in lowered and "materi" in lowered):
                    weekly_started = True
                continue

            number = _official_pdf_number(group)
            if number is not None:
                if current and number == current["number"]:
                    continue
                finish_current()
                current = {"number": number, "columns": [""] * 9}
                first_row_seen = True
                if number == 16:
                    finished_after_uas = True

            if not first_row_seen or current is None:
                continue
            for x, _y, text in group["fragments"]:
                if x < _OFFICIAL_PDF_COLUMN_STARTS[1]:
                    continue
                column = _official_pdf_column_index(x)
                current["columns"][column] = _normalise_space(
                    f"{current['columns'][column]} {text}"
                )

    finish_current()
    deduplicated = {
        meeting["meeting_number"]: meeting
        for meeting in meetings
        if 1 <= meeting["meeting_number"] <= 16
    }
    return [deduplicated[number] for number in sorted(deduplicated)]


def _is_official_rps_pdf(page_texts: Sequence[str]) -> bool:
    flattened = _normalise_space(" ".join(page_texts[:3] + page_texts[9:]))
    return (
        "Rencana Tugas Mahasiswa".casefold() in flattened.casefold()
        and "CPL-PRODI".casefold() in flattened.casefold()
        and "Bobot Penilaian (%)".casefold() in flattened.casefold()
    )


def _official_rtm_schedule(schedule_text: str) -> List[Dict[str, Any]]:
    weeks = (2, 3, 7, 9, 11, 12, 15, 16)
    matches = list(re.finditer(r"(?<!\d)(16|15|12|11|9|7|3|2)(?=\s)", schedule_text))
    rows: List[Dict[str, Any]] = []
    seen: set[int] = set()
    for index, match in enumerate(matches):
        week = int(match.group(1))
        if week not in weeks or week in seen:
            continue
        seen.add(week)
        end = matches[index + 1].start() if index + 1 < len(matches) else len(schedule_text)
        detail = _normalise_space(schedule_text[match.end():end])
        rows.append({"meeting_number": week, "activity": detail, "output": ""})
    return rows


def _official_rtm_assessment(assessment_text: str) -> List[Dict[str, str]]:
    aspects = (
        "Identifikasi masalah & peluang",
        "Kreativitas & inovasi",
        "Analisis peluang & SWOT",
        "Value proposition & business model",
        "Marketing plan",
        "Manajemen, etika & operasional",
        "Kelayakan & keberlanjutan",
        "Kualitas Business Plan",
        "Pitching & komunikasi",
    )
    lowered = assessment_text.casefold()
    positions = [(lowered.find(aspect.casefold()), aspect) for aspect in aspects]
    positions = sorted((position, aspect) for position, aspect in positions if position >= 0)
    rows: List[Dict[str, str]] = []
    for index, (position, aspect) in enumerate(positions):
        end = positions[index + 1][0] if index + 1 < len(positions) else len(assessment_text)
        segment = _normalise_space(assessment_text[position + len(aspect):end])
        weight_match = re.search(r"(\d{1,3})\s*%", segment)
        weight = f"{weight_match.group(1)}%" if weight_match else ""
        criteria = _normalise_space(segment[:weight_match.start()] if weight_match else segment)
        rows.append({"aspect": aspect, "criteria": criteria, "weight": weight})
    return rows


def _parse_official_rps_pdf(
    page_texts: Sequence[str],
    reader: Any,
    class_doc: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    first_page = _normalise_space(page_texts[0] if page_texts else "")
    main_text = _normalise_space(" ".join(page_texts[:3]))
    rtm_text = _normalise_space(" ".join(page_texts[9:]))
    page_lines = _normalise_lines(page_texts[0] if page_texts else "")

    metadata_tail = _official_between(first_page, "Tgl Penyusunan", ["Otorisasi"])
    code_match = re.search(r"\b\d{5,}\b", metadata_tail)
    course_name = _normalise_space(metadata_tail[:code_match.start()]) if code_match else ""
    course_code = code_match.group(0) if code_match else ""
    after_code = _normalise_space(metadata_tail[code_match.end():]) if code_match else ""
    sks_match = re.search(r"(\d+\s*sks\s+\d+\s+jam\s+per\s+minggu)\s+(\d+)\s+(.+)$", after_code, re.IGNORECASE)
    sks = _normalise_space(sks_match.group(1)) if sks_match else ""
    semester = _normalise_space(sks_match.group(2)) if sks_match else ""
    compiled_at = _date_to_iso(sks_match.group(3)) if sks_match else ""
    cpmk_value = _official_between(
        main_text,
        "Capaian Pembelajaran Mata Kuliah (CPMK)",
        ["Diskripsi Singkat MK"],
    )
    cpmk_value = re.sub(
        r"^Tujuan Pembelajaran \(Capaian Pembelajaran Mata kuliah\)\s*",
        "",
        cpmk_value,
        flags=re.IGNORECASE,
    ).strip()
    official_values = {
        "course_name": course_name,
        "course_code": course_code,
        "sks": sks,
        "semester": semester,
        "program_name": _official_between(first_page, "PROGRAM STUDI", ["RENCANA PEMBELAJARAN SEMESTER"]),
        "compiled_at": compiled_at,
        "cpl_prodi": _official_between(
            main_text,
            "CPL-PRODI (Capaian Pembelajaran Lulusan Program Studi) Yang Dibebankan Pada Mata Kuliah",
            ["Capaian Pembelajaran Mata Kuliah (CPMK)"],
        ),
        "cpmk": cpmk_value,
        "description": _official_between(main_text, "Deskripsi Mata Kuliah", ["Materi Pembelajaran"]),
        "materials": _official_between(main_text, "Materi Pembelajaran", ["Daftar Referensi"]),
        "references": _official_between(main_text, "Daftar Referensi", ["Matakuliah prasyarat"]),
        "prerequisites": _official_between(main_text, "Matakuliah prasyarat (Jika ada)", ["Minggu Ke"]),
        "activity": _official_between(" ".join(page_texts[8:9]), "KEGIATAN", ["OUTPUT"]),
        "output": _official_between(" ".join(page_texts[8:9]), "OUTPUT", ["RENCANA TUGAS MAHASISWA"]),
    }
    lecturer_name = ""
    for index, line in enumerate(page_lines):
        if "Otorisasi" in line:
            for candidate in page_lines[index + 1 : index + 4]:
                candidate = _normalise_space(candidate)
                if candidate and "Capaian Pembelajaran" not in candidate:
                    lecturer_name = candidate
                    break
            if lecturer_name:
                break
    official_values["lecturer_name"] = lecturer_name

    rtm_assessment_text = _official_between(
        rtm_text,
        "INDIKATOR, KRITERIA, DAN BOBOT PENILAIAN",
        ["JADWAL PELAKSANAAN"],
    )
    schedule_text = _official_between(rtm_text, "JADWAL PELAKSANAAN", ["LAIN-LAIN YANG DIPERLUKAN"])
    official_values["rtm"] = {
        "assignment_type": _official_between(rtm_text, "BENTUK TUGAS", ["JUDUL PENILAIAN"]),
        "assessment_titles": _official_between(rtm_text, "JUDUL PENILAIAN", ["SUB CAPAIAN PEMBELAJARAN MATA KULIAH"]),
        "sub_cpmk": _official_between(rtm_text, "SUB CAPAIAN PEMBELAJARAN MATA KULIAH", ["DESKRIPSI"]),
        "description": _official_between(rtm_text, "DESKRIPSI", ["METODE PENGERJAAN"]),
        "method": _official_between(rtm_text, "METODE PENGERJAAN", ["BENTUK FORMAT LUARAN"]),
        "output_formats": _official_between(rtm_text, "BENTUK FORMAT LUARAN", ["INDIKATOR, KRITERIA, DAN BOBOT PENILAIAN"]),
        "assessment_items": _official_rtm_assessment(rtm_assessment_text),
        "assessment_text": rtm_assessment_text,
        "schedule": _official_rtm_schedule(schedule_text),
        "schedule_text": schedule_text,
        "requirements": _official_between(rtm_text, "LAIN-LAIN YANG DIPERLUKAN", ["PUSTAKA"]),
        "references": _official_between(rtm_text, "PUSTAKA", []),
    }

    fallback_source = class_doc if isinstance(class_doc, dict) else {}
    fallback = {
        "course_name": fallback_source.get("course_name", ""),
        "course_code": fallback_source.get("course_code", ""),
        "semester": fallback_source.get("semester", ""),
        "sks": str(fallback_source.get("sks") or ""),
        "program_name": fallback_source.get("program_name", ""),
        "lecturer_name": fallback_source.get("lecturer_name", ""),
    }
    fallback = {key: value for key, value in fallback.items() if not official_values.get(key) and value}
    meetings = _extract_official_pdf_meetings(reader)
    warnings: List[str] = []
    if len(meetings) < 16:
        warnings.append(f"Hanya {len(meetings)} dari 16 pertemuan yang terbaca. Periksa kembali hasil ekstraksi.")
    for key, label in (
        ("course_name", "Nama Mata Kuliah"),
        ("course_code", "Kode Mata Kuliah"),
        ("program_name", "Program Studi"),
        ("lecturer_name", "Dosen Pengampu"),
        ("cpmk", "CPMK"),
        ("description", "Deskripsi Mata Kuliah"),
        ("references", "Daftar Referensi"),
    ):
        if not official_values.get(key) and key not in fallback:
            warnings.append(f"{label} tidak ditemukan dan perlu diisi manual.")
    extracted_fields = [key for key in RPS_FORM_FIELDS if official_values.get(key)]
    return {
        "extracted": official_values,
        "fallback": fallback,
        "meetings": meetings,
        "warnings": warnings,
        "stats": {
            "fields_found": len(extracted_fields),
            "fields_total": len(RPS_FORM_FIELDS),
            "meetings_found": len(meetings),
        },
    }


_DOCX_NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


def _docx_cell_text(cell: ElementTree.Element) -> str:
    paragraphs: List[str] = []
    for paragraph in cell.findall(".//w:p", _DOCX_NS):
        parts = [node.text or "" for node in paragraph.findall(".//w:t", _DOCX_NS)]
        value = _normalise_space("".join(parts))
        if value:
            paragraphs.append(value)
    return "\n".join(paragraphs)


def _read_docx_tables(content: bytes) -> List[List[List[str]]]:
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            document_xml = archive.read("word/document.xml")
        root = ElementTree.fromstring(document_xml)
    except (zipfile.BadZipFile, KeyError, ElementTree.ParseError) as exc:
        raise RPSPdfParseError("File Word rusak atau bukan dokumen DOCX yang valid.") from exc

    tables: List[List[List[str]]] = []
    for table in root.findall(".//w:tbl", _DOCX_NS):
        rows: List[List[str]] = []
        for row in table.findall("./w:tr", _DOCX_NS):
            cells = [_docx_cell_text(cell) for cell in row.findall("./w:tc", _DOCX_NS)]
            if cells:
                rows.append(cells)
        if rows:
            tables.append(rows)
    return tables


def _docx_text(tables: Sequence[Sequence[Sequence[str]]]) -> str:
    lines: List[str] = []
    for table in tables:
        for row in table:
            for cell in row:
                lines.extend(_normalise_lines(cell))
    return "\n".join(lines)


def _extract_docx_meetings(tables: Sequence[Sequence[Sequence[str]]]) -> List[Dict[str, Any]]:
    number_re = re.compile(r"^(1[0-6]|[1-9])\s*[.)]?$")
    for table in tables:
        header = " ".join(_normalise_space(cell) for cell in table[0]).casefold()
        if not ("minggu" in header or "pertemuan" in header) or "materi" not in header:
            continue
        meetings: List[Dict[str, Any]] = []
        for row in table[1:]:
            if not row:
                continue
            match = number_re.match(_normalise_space(row[0]))
            if not match:
                continue
            number = int(match.group(1))
            if any(item["meeting_number"] == number for item in meetings):
                continue
            meetings.append(_parse_meeting_cells(number, row))
        if meetings:
            return sorted(meetings, key=lambda item: item["meeting_number"])
    return []


def parse_rps_text(text: str, class_doc: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Parse extracted document text into the RPS form shape."""

    lines = _normalise_lines(text)
    if not lines:
        raise RPSPdfParseError("PDF tidak memiliki teks yang bisa diekstrak. PDF scan membutuhkan OCR terlebih dahulu.")

    course_doc = class_doc or {}
    course_name, _ = _find_label_value(lines, ["Nama Mata Kuliah", "Mata Kuliah"])
    course_code, _ = _find_label_value(lines, ["Kode Mata Kuliah", "Kode MK"])
    semester, _ = _find_label_value(lines, ["Semester"])
    sks, _ = _find_label_value(lines, ["SKS"])
    program_name, _ = _find_label_value(lines, ["Program Studi", "Program Study"])
    lecturer_name, _ = _find_label_value(lines, ["Dosen Pengampu", "Dosen"])
    compiled_at, _ = _find_label_value(lines, ["Tanggal Penyusunan", "Tanggal Penyusunan RPS"])

    cpl_header_index, _ = _find_heading(lines, ["Capaian Pembelajaran Lulusan", "CPL"])
    cpl_start = cpl_header_index if cpl_header_index is not None else 0
    cpl_stop = [
        "Sikap",
        "Keterampilan Umum",
        "Pengetahuan",
        "Keterampilan Khusus",
        "Capaian Pembelajaran Mata Kuliah",
        "CPMK",
        "Deskripsi Mata Kuliah",
        "Daftar Referensi",
        "Referensi",
    ]
    cpl_fields = {
        "cpl_sikap": _extract_section(lines, ["Sikap", "CPL - Sikap", "CPL Sikap"], cpl_stop, cpl_start),
        "cpl_keterampilan_umum": _extract_section(lines, ["Keterampilan Umum", "CPL - Keterampilan Umum", "CPL Keterampilan Umum"], cpl_stop, cpl_start),
        "cpl_pengetahuan": _extract_section(lines, ["Pengetahuan", "CPL - Pengetahuan", "CPL Pengetahuan"], cpl_stop, cpl_start),
        "cpl_keterampilan_khusus": _extract_section(lines, ["Keterampilan Khusus", "CPL - Keterampilan Khusus", "CPL Keterampilan Khusus"], cpl_stop, cpl_start),
    }

    cpmk = _extract_section(
        lines,
        ["Capaian Pembelajaran Mata Kuliah", "CPMK"],
        ["Deskripsi Mata Kuliah", "Deskripsi", "Daftar Referensi", "Referensi", "Minggu ke-", "Pertemuan ke-", "Tabel Pembelajaran"],
        cpl_header_index + 1 if cpl_header_index is not None else 0,
    )
    description = _extract_section(
        lines,
        ["Deskripsi Mata Kuliah", "Deskripsi"],
        ["Daftar Referensi", "Referensi", "Minggu ke-", "Pertemuan ke-", "Tabel Pembelajaran"],
        cpl_header_index + 1 if cpl_header_index is not None else 0,
    )
    references = _extract_section(
        lines,
        ["Daftar Referensi", "Referensi"],
        ["Keterangan", "Minggu ke-", "Pertemuan ke-", "Tabel Pembelajaran"],
        cpl_header_index + 1 if cpl_header_index is not None else 0,
    )
    materials = _extract_section(
        lines,
        ["Materi Pembelajaran"],
        ["Daftar Referensi", "Referensi", "Matakuliah prasyarat", "Minggu ke-", "Pertemuan ke-", "Tabel Pembelajaran"],
        cpl_header_index + 1 if cpl_header_index is not None else 0,
    )
    prerequisites = _extract_section(
        lines,
        ["Matakuliah prasyarat", "Mata Kuliah Prasyarat"],
        ["Minggu ke-", "Pertemuan ke-", "Tabel Pembelajaran", "Rencana Tugas Mahasiswa"],
        cpl_header_index + 1 if cpl_header_index is not None else 0,
    )
    cpl_prodi = _extract_section(
        lines,
        ["CPL-PRODI", "CPL Prodi"],
        ["Capaian Pembelajaran Mata Kuliah", "CPMK"],
        cpl_header_index if cpl_header_index is not None else 0,
    )
    activity = _extract_section(lines, ["KEGIATAN", "Kegiatan"], ["OUTPUT", "Output"], 0)
    output = _extract_section(lines, ["OUTPUT", "Output"], ["RENCANA TUGAS MAHASISWA", "Keterangan"], 0)
    meetings = _extract_meetings(lines)

    extracted: Dict[str, Any] = {
        "course_name": course_name,
        "course_code": course_code,
        "semester": semester,
        "sks": sks,
        "program_name": program_name,
        "lecturer_name": lecturer_name,
        "compiled_at": _date_to_iso(compiled_at) if compiled_at else "",
        **cpl_fields,
        "cpl_prodi": cpl_prodi,
        "keterangan": _extract_section(
            lines,
            ["Keterangan"],
            ["Minggu ke-", "Pertemuan ke-", "Tabel Pembelajaran"],
            cpl_header_index + 1 if cpl_header_index is not None else 0,
        ),
        "cpmk": cpmk,
        "description": description,
        "materials": materials,
        "prerequisites": prerequisites,
        "references": references,
        "activity": activity,
        "output": output,
        "rtm": {},
    }

    # Keep class identity available when the official PDF leaves it blank.
    # The values are marked as fallbacks so the frontend can avoid treating
    # them as extracted content while still making the draft useful.
    fallback_fields = {
        "course_name": course_doc.get("course_name", ""),
        "course_code": course_doc.get("course_code", ""),
        "semester": course_doc.get("semester", ""),
        "sks": str(course_doc.get("sks") or ""),
        "program_name": course_doc.get("program_name", ""),
        "lecturer_name": course_doc.get("lecturer_name", ""),
    }
    fallback_fields = {key: value for key, value in fallback_fields.items() if not extracted.get(key) and value}

    warnings: List[str] = []
    if not meetings:
        warnings.append("Tidak ditemukan tabel 16 pertemuan. Periksa format dokumen atau isi sesi secara manual.")
    elif len(meetings) < 16:
        warnings.append(f"Hanya {len(meetings)} dari 16 pertemuan yang terbaca. Periksa kembali hasil ekstraksi.")
    for key, label in (
        ("course_name", "Nama Mata Kuliah"),
        ("course_code", "Kode Mata Kuliah"),
        ("program_name", "Program Studi"),
        ("lecturer_name", "Dosen Pengampu"),
        ("cpmk", "CPMK"),
        ("description", "Deskripsi Mata Kuliah"),
        ("references", "Daftar Referensi"),
    ):
        if not extracted.get(key) and key not in fallback_fields:
            warnings.append(f"{label} tidak ditemukan dan perlu diisi manual.")

    extracted_fields = [key for key in RPS_FORM_FIELDS if extracted.get(key)]
    return {
        "extracted": extracted,
        "fallback": fallback_fields,
        "meetings": meetings,
        "warnings": warnings,
        "stats": {
            "fields_found": len(extracted_fields),
            "fields_total": len(RPS_FORM_FIELDS),
            "meetings_found": len(meetings),
        },
    }


def parse_rps_pdf(content: bytes, class_doc: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    try:
        from pypdf import PdfReader
    except ImportError as exc:  # pragma: no cover - covered by deployment smoke tests
        raise RPSPdfDependencyError("Parser PDF belum tersedia di server. Install dependency pypdf terlebih dahulu.") from exc

    try:
        reader = PdfReader(io.BytesIO(content))
        if reader.is_encrypted:
            try:
                reader.decrypt("")
            except Exception as exc:
                raise RPSPdfParseError("PDF terenkripsi dan tidak dapat dibaca tanpa password.") from exc
        page_text = [(page.extract_text() or "") for page in reader.pages]
    except RPSPdfParseError:
        raise
    except Exception as exc:
        raise RPSPdfParseError("PDF rusak atau tidak dapat dibaca oleh server.") from exc

    text = "\n".join(page_text).strip()
    if not text:
        raise RPSPdfParseError("PDF tidak memiliki teks yang bisa diekstrak. PDF scan membutuhkan OCR terlebih dahulu.")
    if _is_official_rps_pdf(page_text):
        return _parse_official_rps_pdf(page_text, reader, class_doc)
    result = parse_rps_text(text, class_doc)
    structured_meetings = _extract_pdf_meetings(reader)
    if structured_meetings:
        result["meetings"] = structured_meetings
        result["stats"]["meetings_found"] = len(structured_meetings)
        result["warnings"] = [
            warning
            for warning in result["warnings"]
            if "pertemuan" not in warning.casefold()
        ]
        if len(structured_meetings) < 16:
            result["warnings"].append(
                f"Hanya {len(structured_meetings)} dari 16 pertemuan yang terbaca. Periksa kembali hasil ekstraksi."
            )
    return result


def parse_rps_docx(content: bytes, class_doc: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Parse a DOCX file, using its native table rows for the 16 meetings."""

    tables = _read_docx_tables(content)
    text = _docx_text(tables)
    if not text:
        raise RPSPdfParseError("Dokumen Word tidak memiliki teks yang bisa diekstrak.")
    result = parse_rps_text(text, class_doc)
    structured_meetings = _extract_docx_meetings(tables)
    if structured_meetings:
        result["meetings"] = structured_meetings
        result["stats"]["meetings_found"] = len(structured_meetings)
        result["warnings"] = [
            warning
            for warning in result["warnings"]
            if "pertemuan" not in warning.casefold()
        ]
        if len(structured_meetings) < 16:
            result["warnings"].append(
                f"Hanya {len(structured_meetings)} dari 16 pertemuan yang terbaca. Periksa kembali hasil ekstraksi."
            )
    return result


def parse_rps_document(
    content: bytes,
    extension: str,
    class_doc: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Parse PDF, DOCX, or legacy DOC when a local office converter is available."""

    normalized_extension = str(extension or "").lower()
    if normalized_extension == ".pdf":
        return parse_rps_pdf(content, class_doc)
    if normalized_extension == ".docx":
        return parse_rps_docx(content, class_doc)
    if normalized_extension != ".doc":
        raise RPSPdfParseError("Format dokumen RPS harus PDF, DOCX, atau Word .doc.")

    converter = shutil.which("soffice") or shutil.which("libreoffice")
    if not converter:
        raise RPSPdfParseError(
            "Word .doc lama belum bisa diproses di server ini. Simpan dokumen sebagai .docx lalu upload kembali."
        )
    try:
        with tempfile.TemporaryDirectory(prefix="rps-doc-") as temp_dir:
            source = Path(temp_dir) / "rps.doc"
            source.write_bytes(content)
            completed = subprocess.run(
                [converter, "--headless", "--convert-to", "docx", "--outdir", temp_dir, str(source)],
                capture_output=True,
                text=True,
                timeout=45,
                check=False,
            )
            converted = Path(temp_dir) / "rps.docx"
            if completed.returncode != 0 or not converted.exists():
                raise RPSPdfParseError("Word .doc gagal dikonversi ke DOCX.")
            return parse_rps_docx(converted.read_bytes(), class_doc)
    except subprocess.TimeoutExpired as exc:
        raise RPSPdfParseError("Konversi Word .doc melebihi batas waktu.") from exc

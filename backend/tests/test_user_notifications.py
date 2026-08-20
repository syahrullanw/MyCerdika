"""Regression coverage for persistent in-app notification state."""

import asyncio

from backend.user_notifications import (
    finalize_notifications,
    notification_event,
    notification_id,
)

try:
    from backend import server
except ImportError:  # Supports running pytest from the backend directory.
    import server


class FakeCursor:
    def __init__(self, items):
        self.items = list(items)

    async def to_list(self, _limit=None):
        return [dict(item) for item in self.items]


class FakeCollection:
    def __init__(self, items):
        self.items = [dict(item) for item in items]

    async def find_one(self, query, _projection=None):
        for item in self.items:
            if all(item.get(key) == value for key, value in query.items()):
                return dict(item)
        return None

    def find(self, query, _projection=None):
        expected_ids = set(query.get("id", {}).get("$in", []))
        return FakeCursor([item for item in self.items if item.get("id") in expected_ids])


def test_notification_id_changes_when_same_object_has_new_activity():
    first = notification_id("discussion", "comment-1", "2026-07-24T08:00:00+00:00")
    repeated = notification_id("discussion", "comment-1", "2026-07-24T08:00:00+00:00")
    newer = notification_id("discussion", "comment-1", "2026-07-24T09:00:00+00:00")

    assert first == repeated
    assert first != newer
    assert len(first) == 32


def test_notification_count_only_decreases_for_opened_notification():
    first = notification_event(
        kind="discussion",
        source_id="comment-1",
        occurred_at="2026-07-24T08:00:00+00:00",
        title="Komentar baru",
        message="Ada komentar baru",
        target={"page": "materials", "material_id": "material-1"},
    )
    second = notification_event(
        kind="submission",
        source_id="submission-1",
        occurred_at="2026-07-24T09:00:00+00:00",
        title="Submission baru",
        message="Ada tugas yang dikumpulkan",
        target={"page": "grading", "submission_id": "submission-1"},
    )

    unopened = finalize_notifications([first, second], [], limit=30)
    opened = finalize_notifications(
        [first, second],
        [{"notification_id": first["id"], "read_at": "2026-07-24T10:00:00+00:00"}],
        limit=30,
    )

    assert unopened["unread_count"] == 2
    assert opened["unread_count"] == 1
    assert opened["items"][0]["id"] == second["id"]
    assert opened["items"][0]["read"] is False
    assert opened["items"][1]["read"] is True


def test_notification_scope_defaults_to_active_semester_and_excludes_old_classes(monkeypatch):
    database = type("FakeDatabase", (), {})()
    database.tahun_ajaran = FakeCollection([
        {"id": "ta-old", "tahun": "2025/2026", "semester": "Genap"},
        {"id": "ta-new", "tahun": "2026/2027", "semester": "Ganjil", "is_active": True},
    ])
    database.classes = FakeCollection([
        {"id": "class-old", "tahun_ajaran_id": "ta-old"},
        {"id": "class-new", "academic_year": "2026/2027", "semester": "Ganjil"},
    ])
    monkeypatch.setattr(server, "db", database)

    async def class_ids(_user):
        return ["class-old", "class-new"]

    monkeypatch.setattr(server, "lecturer_class_ids", class_ids)

    scoped_ids, scope_id = asyncio.run(
        server.notification_class_scope({"id": "admin-1", "role": "admin"})
    )

    assert scope_id == "ta-new"
    assert scoped_ids == ["class-new"]

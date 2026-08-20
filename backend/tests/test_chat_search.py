"""Regression coverage for chat contact search."""

import asyncio

try:
    from backend import server
except ImportError:  # Supports running pytest from the backend directory.
    import server


class FakeCursor:
    def __init__(self, items):
        self.items = list(items)

    def sort(self, field, direction):
        reverse = int(direction) < 0
        self.items.sort(key=lambda item: str(item.get(field) or "").casefold(), reverse=reverse)
        return self

    async def to_list(self, limit=None):
        return [dict(item) for item in (self.items if limit is None else self.items[:limit])]


class FakeUsers:
    def __init__(self, items):
        self.items = list(items)

    def find(self, query, _projection=None):
        excluded_id = query.get("id", {}).get("$ne")
        items = [
            item
            for item in self.items
            if item.get("id") != excluded_id and item.get("status") != "deleted"
        ]
        return FakeCursor(items)


class FakeMessages:
    def __init__(self, items):
        self.items = list(items)

    def find(self, query, _projection=None):
        participant_id = query.get("participant_ids")
        items = [
            item
            for item in self.items
            if not participant_id or participant_id in item.get("participant_ids", [])
        ]
        return FakeCursor(items)

    async def count_documents(self, query):
        def matches(item):
            if item.get("conversation_id") != query.get("conversation_id"):
                return False
            if item.get("recipient_id") != query.get("recipient_id"):
                return False
            created_at = query.get("created_at", {})
            return not created_at or item.get("created_at", "") > created_at.get("$gt", "")

        return sum(matches(item) for item in self.items)


class FakeReadReceipts:
    def __init__(self):
        self.items = []

    async def find_one(self, query, _projection=None):
        return next(
            (
                dict(item)
                for item in self.items
                if item.get("user_id") == query.get("user_id")
                and item.get("contact_id") == query.get("contact_id")
            ),
            None,
        )

    async def update_one(self, query, update, upsert=False):
        item = next(
            (
                item
                for item in self.items
                if item.get("user_id") == query.get("user_id")
                and item.get("contact_id") == query.get("contact_id")
            ),
            None,
        )
        if item is None and upsert:
            item = dict(query)
            self.items.append(item)
        if item is not None:
            item.update(update.get("$set", {}))


class FakeDatabase:
    def __init__(self, users, messages=None):
        self.users = FakeUsers(users)
        self.chat_messages = FakeMessages(messages or [])
        self.chat_read_receipts = FakeReadReceipts()


def test_lecturer_can_search_student_and_lecturer_by_partial_name_or_email(monkeypatch):
    monkeypatch.setattr(
        server,
        "db",
        FakeDatabase(
            [
                {
                    "id": "lecturer-current",
                    "role": "lecturer",
                    "name": "Dosen Saat Ini",
                    "email": "current@example.com",
                    "status": "active",
                },
                {
                    "id": "student-1",
                    "role": "student",
                    "name": "Syahrul Siswa",
                    "username": "syahrul",
                    "email": "syahrul@smkisini.sch.id",
                    "status": "active",
                },
                {
                    "id": "lecturer-2",
                    "role": "lecturer",
                    "name": "Eko Dosen",
                    "username": "eko",
                    "email": "eko@kampus.example",
                    "status": "active",
                },
                {
                    "id": "deleted-student",
                    "role": "student",
                    "name": "Syahrul Lama",
                    "email": "old@smkisini.sch.id",
                    "status": "deleted",
                },
            ],
        ),
    )

    by_name = asyncio.run(
        server.chat_contacts("eko", {"id": "lecturer-current", "role": "lecturer"})
    )
    by_email = asyncio.run(
        server.chat_contacts("SMKISINI.SCH", {"id": "lecturer-current", "role": "lecturer"})
    )

    assert [item["id"] for item in by_name] == ["lecturer-2"]
    assert [item["id"] for item in by_email] == ["student-1"]


def test_chat_contacts_include_only_unread_messages_and_clear_after_read(monkeypatch):
    users = [
        {
            "id": "lecturer-current",
            "role": "lecturer",
            "name": "Dosen Saat Ini",
            "email": "current@example.com",
            "status": "active",
        },
        {
            "id": "lecturer-2",
            "role": "lecturer",
            "name": "Eko Dosen",
            "username": "eko",
            "email": "eko@kampus.example",
            "status": "active",
        },
    ]
    conversation_id = server.chat_conversation_id("lecturer-current", "lecturer-2")
    monkeypatch.setattr(
        server,
        "db",
        FakeDatabase(
            users,
            [
                {
                    "conversation_id": conversation_id,
                    "participant_ids": ["lecturer-2", "lecturer-current"],
                    "recipient_id": "lecturer-current",
                    "created_at": "2026-08-19T08:00:00+00:00",
                },
                {
                    "conversation_id": conversation_id,
                    "participant_ids": ["lecturer-2", "lecturer-current"],
                    "recipient_id": "lecturer-current",
                    "created_at": "2026-08-19T08:01:00+00:00",
                },
                {
                    "conversation_id": conversation_id,
                    "participant_ids": ["lecturer-2", "lecturer-current"],
                    "recipient_id": "lecturer-2",
                    "created_at": "2026-08-19T08:02:00+00:00",
                },
            ],
        ),
    )

    contacts = asyncio.run(
        server.chat_contacts("", {"id": "lecturer-current", "role": "lecturer"})
    )

    assert contacts[0]["id"] == "lecturer-2"
    assert contacts[0]["unread_count"] == 2

    asyncio.run(server.mark_chat_read("lecturer-current", "lecturer-2"))
    contacts_after_read = asyncio.run(
        server.chat_contacts("", {"id": "lecturer-current", "role": "lecturer"})
    )

    assert contacts_after_read[0]["unread_count"] == 0

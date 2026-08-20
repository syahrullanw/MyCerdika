"""Pure compatibility checks for the PostgreSQL document boundary."""

import inspect
import json

from backend.postgres_database import (
    PostgresCollection,
    _apply_update,
    _project,
    _QueryCompiler,
    matches,
)


def test_query_semantics_cover_nested_fields_and_arrays():
    document = {
        "id": "one",
        "status": "active",
        "class_ids": ["a", "b"],
        "profile": {"score": 80},
    }

    assert matches(document, {"class_ids": "a"})
    assert matches(document, {"class_ids": {"$in": ["b"]}})
    assert matches(document, {"profile.score": {"$gte": 75}})
    assert matches(document, {"missing": {"$exists": False}})
    assert matches(document, {"$or": [{"status": "deleted"}, {"id": "one"}]})
    assert not matches(document, {"class_ids": {"$size": 1}})
    assert matches(
        {"files": [{"file_id": "file-one"}, {"file_id": "file-two"}]},
        {"files.file_id": "file-two"},
    )


def test_update_semantics_cover_application_operators():
    document = {"id": "one", "tags": ["a"], "nested": {"old": True}}
    updated = _apply_update(
        document,
        {
            "$set": {"nested.value": 2},
            "$unset": {"nested.old": ""},
            "$addToSet": {"tags": {"$each": ["a", "b"]}},
            "$push": {"events": {"$each": [1, 2]}},
        },
    )
    updated = _apply_update(updated, {"$pull": {"tags": "a"}})

    assert updated == {
        "id": "one",
        "tags": ["b"],
        "nested": {"value": 2},
        "events": [1, 2],
    }


def test_projection_supports_inclusion_exclusion_and_nested_fields():
    document = {"id": "one", "secret": "hidden", "nested": {"a": 1, "b": 2}}

    assert _project(document, {"_id": 0, "id": 1, "nested.a": 1}) == {
        "id": "one",
        "nested": {"a": 1},
    }
    assert _project(document, {"_id": 0, "secret": 0}) == {
        "id": "one",
        "nested": {"a": 1, "b": 2},
    }


def test_array_filters_replace_only_matching_embedded_file():
    document = {
        "id": "submission-one",
        "files": [
            {"file_id": "file-one", "drive_sync_status": "failed"},
            {"file_id": "file-two", "drive_sync_status": "synced"},
        ],
    }
    public_file = {
        "file_id": "file-one",
        "drive_sync_status": "synced",
        "drive_file_url": "https://drive.google.com/file-one",
    }

    updated = _apply_update(
        document,
        {"$set": {"files.$[item]": public_file}},
        array_filters=[{"item.file_id": "file-one"}],
    )

    assert updated["files"] == [
        public_file,
        {"file_id": "file-two", "drive_sync_status": "synced"},
    ]
    assert document["files"][0]["drive_sync_status"] == "failed"


def test_array_query_compiles_jsonb_containment_for_embedded_documents():
    compiler = _QueryCompiler()
    sql = compiler.compile({"files.file_id": "file-one"})
    parameters = [json.loads(value) for value in compiler.parameters]

    assert "data @>" in sql
    assert {"files": [{"file_id": "file-one"}]} in parameters


def test_scalar_query_compiles_array_containment_for_membership_fields():
    compiler = _QueryCompiler()
    sql = compiler.compile({"participant_ids": "user-one"})
    parameters = [json.loads(value) for value in compiler.parameters]

    assert "data @>" in sql
    assert {"participant_ids": ["user-one"]} in parameters


def test_update_many_accepts_motor_array_filters_keyword():
    assert "array_filters" in inspect.signature(PostgresCollection.update_many).parameters

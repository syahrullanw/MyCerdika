"""Dry-run and optional migration plan for OLD-SIAKAD BIPOT finance records.

The source data is translated to the finance collections used by
``routers.keuangan``.  It never touches Neo Feeder.  The CLI is dry-run by
default; ``--execute`` must be supplied explicitly to write PostgreSQL.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

from dotenv import load_dotenv

from old_siakad_migration import parse_old_tables
from postgres_database import PostgresDatabase


ROOT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_OLD_JSON = ROOT_DIR / "db siakad old siap 7 agustus.json"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def clean(value: Any) -> str:
    return str(value or "").strip()


def amount(value: Any) -> float:
    try:
        return round(float(value or 0), 2)
    except (TypeError, ValueError):
        return 0.0


def active(row: Dict[str, Any]) -> bool:
    return clean(row.get("NA")).upper() != "Y"


def bool_yes(value: Any) -> bool:
    return clean(value).upper() == "Y"


def period_label(code: str) -> str:
    if len(code) == 5 and code[:4].isdigit():
        year = int(code[:4])
        semester = {"1": "Ganjil", "2": "Genap", "3": "Pendek"}.get(code[-1], "")
        return f"Tahun Akademik {year}/{year + 1} {semester}".strip()
    return code


def payment_method_map(rows: Iterable[Dict[str, Any]]) -> Dict[str, str]:
    return {clean(row.get("CaraBayarID")): clean(row.get("Nama")) for row in rows}


def bill_status(total: float, paid: float) -> str:
    if total <= 0 or paid >= total:
        return "paid"
    return "partial" if paid > 0 else "unpaid"


def build_finance_plan(tables: Dict[str, List[Dict[str, Any]]], source_name: str) -> Tuple[Dict[str, List[Dict[str, Any]]], Dict[str, Any]]:
    """Translate OLD-SIAKAD BIPOT tables to source-stable finance documents."""
    generated_at = now_iso()
    components: List[Dict[str, Any]] = []
    schemes: List[Dict[str, Any]] = []
    rules: List[Dict[str, Any]] = []
    bills: List[Dict[str, Any]] = []
    payments: List[Dict[str, Any]] = []
    exceptions: List[Dict[str, Any]] = []
    legacy_payment_source_amount = 0.0

    old_components = {clean(row.get("BIPOTNamaID")): row for row in tables.get("bipotnama", [])}
    for component_id, row in old_components.items():
        if not component_id:
            continue
        components.append({
            "id": f"old_fin_component_{component_id}",
            "code": f"OLD_BIPOT_{component_id}",
            "name": clean(row.get("Nama")) or f"Komponen OLD {component_id}",
            "category": "tuition",
            "default_amount": amount(row.get("DefBesar")) * max(int(amount(row.get("DefJumlah")) or 1), 1),
            "scholarship_eligible": bool_yes(row.get("DipotongBeasiswa")),
            "discount_eligible": bool_yes(row.get("Diskon")),
            "late_fee_eligible": bool_yes(row.get("KenaDenda")),
            "is_active": active(row),
            "legacy_bipotnama_id": component_id,
            "migration_source": source_name,
            "created_at": generated_at,
            "updated_at": generated_at,
        })

    old_schemes = {clean(row.get("BIPOTID")): row for row in tables.get("bipot", [])}
    for scheme_id, row in old_schemes.items():
        if not scheme_id:
            continue
        year = clean(row.get("Tahun"))
        schemes.append({
            "id": f"old_fin_scheme_{scheme_id}",
            "code": f"OLD_BIPOT_{scheme_id}",
            "name": clean(row.get("Nama")) or f"BIPOT {scheme_id}",
            "academic_year": f"{year}/{int(year) + 1}" if year.isdigit() else year,
            "prodi_id": clean(row.get("ProdiID")),
            "program_id": clean(row.get("ProgramID")),
            "is_default": bool_yes(row.get("Def")),
            "is_active": active(row),
            "krs_min_payment_percent": 0.0,
            "uts_min_payment_percent": amount(row.get("BatasBayarUTS")),
            "uas_min_payment_percent": amount(row.get("BatasBayarUAS")),
            "notes": clean(row.get("Catatan")),
            "legacy_bipot_id": scheme_id,
            "migration_source": source_name,
            "created_at": generated_at,
            "updated_at": generated_at,
        })

    for row in tables.get("bipot2", []):
        scheme_id = clean(row.get("BIPOTID"))
        component_id = clean(row.get("BIPOTNamaID"))
        if not scheme_id or not component_id:
            continue
        component = old_components.get(component_id, {})
        rules.append({
            "id": f"old_fin_rule_{clean(row.get('BIPOT2ID'))}",
            "scheme_id": f"old_fin_scheme_{scheme_id}",
            "component_id": f"old_fin_component_{component_id}",
            "component_code": f"OLD_BIPOT_{component_id}",
            "component_name": clean(component.get("Nama")) or f"Komponen OLD {component_id}",
            "category": "tuition",
            "amount": amount(row.get("Besar")),
            "quantity": max(int(amount(row.get("Jumlah")) or 1), 1),
            "automatic": bool_yes(row.get("Otomatis")),
            "charge_stage": "registration" if clean(row.get("SaatID")) == "1" else "semester",
            "recurrence": "per_sks" if bool_yes(row.get("PerSKS")) else "once",
            "scholarship_eligible": bool_yes(component.get("DipotongBeasiswa")),
            "discount_eligible": bool_yes(component.get("Diskon")),
            "is_active": active(row),
            "legacy_bipot2_id": clean(row.get("BIPOT2ID")),
            "migration_source": source_name,
            "created_at": generated_at,
            "updated_at": generated_at,
        })

    bill_rows: defaultdict[Tuple[str, str], List[Dict[str, Any]]] = defaultdict(list)
    for row in tables.get("bipotmhsw", []):
        if not active(row):
            continue
        student_id = clean(row.get("MhswID"))
        period_id = clean(row.get("TahunID"))
        if student_id and period_id:
            bill_rows[(student_id, period_id)].append(row)

    item_ids: Dict[Tuple[str, str, str], List[str]] = defaultdict(list)
    item_paid_remaining: Dict[str, float] = {}
    for (student_id, period_id), source_rows in bill_rows.items():
        bill_id = f"old_fin_bill_{period_id}_{student_id}"
        items = []
        for row in source_rows:
            component_id = clean(row.get("BIPOTNamaID"))
            component = old_components.get(component_id, {})
            gross = round(amount(row.get("Besar")) * max(int(amount(row.get("Jumlah")) or 1), 1), 2)
            paid = min(amount(row.get("Dibayar")), gross)
            item_id = f"old_fin_item_{clean(row.get('BIPOTMhswID'))}"
            item_ids[(student_id, period_id, component_id)].append(item_id)
            item_paid_remaining[item_id] = paid
            items.append({
                "id": item_id,
                "component_id": f"old_fin_component_{component_id}",
                "component_name": clean(row.get("Nama")) or clean(component.get("Nama")) or f"Komponen OLD {component_id}",
                "category": "tuition",
                "quantity": max(int(amount(row.get("Jumlah")) or 1), 1),
                "gross_amount": gross,
                "discount_amount": 0.0,
                "scholarship_amount": 0.0,
                "net_amount": gross,
                "paid_amount": paid,
                "status": bill_status(gross, paid),
                "scholarship_eligible": bool_yes(component.get("DipotongBeasiswa")),
                "discount_eligible": bool_yes(component.get("Diskon")),
                "legacy_bipotmhsw_id": clean(row.get("BIPOTMhswID")),
            })
        total = round(sum(item["net_amount"] for item in items), 2)
        paid_total = round(sum(item["paid_amount"] for item in items), 2)
        bills.append({
            "id": bill_id,
            "student_id": student_id,
            "nim": student_id,
            "student_name": "",
            "academic_period_id": period_id,
            "academic_period_code": period_id,
            "academic_period_name": period_label(period_id),
            "scheme_id": f"old_fin_scheme_{clean(source_rows[0].get('BIPOTID'))}",
            "scheme_code": f"OLD_BIPOT_{clean(source_rows[0].get('BIPOTID'))}",
            "scheme_name": clean(old_schemes.get(clean(source_rows[0].get("BIPOTID")), {}).get("Nama")),
            "title": f"Tagihan Pembiayaan OLD {period_id}",
            "category": "tuition",
            "items": items,
            "gross_amount": total,
            "discount_amount": 0.0,
            "scholarship_amount": 0.0,
            "amount": total,
            "paid_amount": paid_total,
            "pending_amount": 0.0,
            "remaining_amount": round(max(total - paid_total, 0), 2),
            "status": bill_status(total, paid_total),
            "due_date": "",
            "installments": [],
            "adjustments": [],
            "clearance_policy": {"krs_min_payment_percent": 0.0, "uts_min_payment_percent": 0.0, "uas_min_payment_percent": 0.0},
            "notes": "Migrasi riwayat BIPOT OLD-SIAKAD",
            "source": "old_siakad_migration",
            "migration_source": source_name,
            "created_at": generated_at,
            "updated_at": generated_at,
        })

    methods = payment_method_map(tables.get("carabayar", []))
    payment_specs = (
        ("bayarmhsw", "bayarmhsw2", "BayarMhswID", "BayarMhswID", "OLD_PAYMENT"),
        ("bayarmhswonline", "bayarmhswonline2", "BayarMhswOnlineID", "BayarMhswOnlineID", "OLD_ONLINE_PAYMENT"),
    )

    def record_exception(
        exception_type: str,
        *,
        student_id: str,
        period_id: str,
        amount_value: float,
        reason: str,
        payment_id: str = "",
        component_id: str = "",
        source_table: str = "",
        legacy_payment_id: str = "",
        item_id: str = "",
    ) -> None:
        if amount_value <= 0:
            return
        exceptions.append({
            "id": f"old_fin_exception_{len(exceptions) + 1}",
            "type": exception_type,
            "student_id": student_id,
            "academic_period_id": period_id,
            "bill_id": f"old_fin_bill_{period_id}_{student_id}",
            "payment_id": payment_id,
            "item_id": item_id,
            "component_id": f"old_fin_component_{component_id}" if component_id else "",
            "amount": round(amount_value, 2),
            "reason": reason,
            "source_table": source_table,
            "legacy_payment_id": legacy_payment_id,
            "migration_source": source_name,
            "created_at": generated_at,
        })

    for header_table, detail_table, header_id_field, detail_ref_field, prefix in payment_specs:
        details_by_payment: defaultdict[str, List[Dict[str, Any]]] = defaultdict(list)
        for detail in tables.get(detail_table, []):
            if active(detail):
                details_by_payment[clean(detail.get(detail_ref_field))].append(detail)
        for header in tables.get(header_table, []):
            if not active(header):
                continue
            header_id = clean(header.get(header_id_field))
            student_id = clean(header.get("MhswID"))
            period_id = clean(header.get("TahunID"))
            if not header_id or not student_id or not period_id:
                continue
            payment_id = f"{prefix}_{header_id}"
            allocations = []
            details = details_by_payment.get(header_id, [])
            header_total = round(amount(header.get("Jumlah")) + amount(header.get("JumlahLain")), 2)
            detail_declared_total = round(sum(amount(detail.get("Jumlah")) for detail in details), 2)
            legacy_payment_source_amount = round(
                legacy_payment_source_amount + (detail_declared_total or header_total),
                2,
            )
            for detail in details:
                component_id = clean(detail.get("BIPOTNamaID"))
                candidate_ids = item_ids.get((student_id, period_id, component_id), [])
                unallocated = amount(detail.get("Jumlah"))
                for item_id in candidate_ids:
                    if unallocated <= 0:
                        break
                    available = item_paid_remaining.get(item_id, 0.0)
                    allocated = min(unallocated, available)
                    if allocated <= 0:
                        continue
                    item_paid_remaining[item_id] = round(available - allocated, 2)
                    unallocated = round(unallocated - allocated, 2)
                    allocations.append({
                        "item_id": item_id,
                        "component_id": f"old_fin_component_{component_id}",
                        "amount": round(allocated, 2),
                    })
                record_exception(
                    "unmatched_payment_allocation",
                    student_id=student_id,
                    period_id=period_id,
                    amount_value=unallocated,
                    reason="Nominal detail pembayaran melebihi nilai Dibayar pada item BIPOT mahasiswa atau komponen tidak ditemukan.",
                    payment_id=payment_id,
                    component_id=component_id,
                    source_table=detail_table,
                    legacy_payment_id=header_id,
                )

            if not details and header_total > 0:
                unallocated = header_total
                for item_id in [item_id for (mhsw, tahun, _), ids in item_ids.items() if mhsw == student_id and tahun == period_id for item_id in ids]:
                    if unallocated <= 0:
                        break
                    available = item_paid_remaining.get(item_id, 0.0)
                    allocated = min(unallocated, available)
                    if allocated <= 0:
                        continue
                    item_paid_remaining[item_id] = round(available - allocated, 2)
                    unallocated = round(unallocated - allocated, 2)
                    allocations.append({
                        "item_id": item_id,
                        "component_id": "",
                        "amount": round(allocated, 2),
                    })
                record_exception(
                    "payment_without_detail_allocation",
                    student_id=student_id,
                    period_id=period_id,
                    amount_value=unallocated,
                    reason="Header pembayaran tidak memiliki detail yang dapat dipetakan ke item BIPOT mahasiswa.",
                    payment_id=payment_id,
                    source_table=header_table,
                    legacy_payment_id=header_id,
                )

            allocated_total = round(sum(item["amount"] for item in allocations), 2)
            header_total = round(amount(header.get("Jumlah")) + amount(header.get("JumlahLain")), 2)
            if allocated_total <= 0:
                continue
            payments.append({
                "id": payment_id,
                "bill_id": f"old_fin_bill_{period_id}_{student_id}",
                "student_id": student_id,
                "student_name": "",
                "nim": student_id,
                "amount": allocated_total,
                "legacy_header_amount": header_total,
                "payment_method": methods.get(clean(header.get("CaraBayarID"))) or "MANUAL",
                "reference_number": clean(header.get("TrxID")) or header_id,
                "proof_url": clean(header.get("BuktiSetoran")),
                "notes": clean(header.get("Keterangan")),
                "status": "verified",
                "submitted_at": clean(header.get("TanggalBuat")) or generated_at,
                "verified_at": clean(header.get("Tanggal")) or generated_at,
                "verified_by": clean(header.get("LoginBuat")),
                "verification_notes": "Migrasi pembayaran OLD-SIAKAD",
                "allocations": allocations,
                "legacy_payment_id": header_id,
                "migration_source": source_name,
            })

    for item_id, outstanding_paid_amount in item_paid_remaining.items():
        if outstanding_paid_amount <= 0:
            continue
        student_id = period_id = component_id = ""
        for (candidate_student_id, candidate_period_id, candidate_component_id), candidate_item_ids in item_ids.items():
            if item_id in candidate_item_ids:
                student_id, period_id, component_id = candidate_student_id, candidate_period_id, candidate_component_id
                break
        record_exception(
            "bill_paid_without_payment_record",
            student_id=student_id,
            period_id=period_id,
            amount_value=outstanding_paid_amount,
            reason="Nilai Dibayar pada item BIPOT mahasiswa tidak memiliki alokasi detail pembayaran aktif yang cocok.",
            component_id=component_id,
            source_table="bipotmhsw",
            item_id=item_id,
        )

    plan = {
        "finance_components": components,
        "finance_schemes": schemes,
        "finance_scheme_rules": rules,
        "tuition_bills": bills,
        "tuition_payments": payments,
        "finance_migration_exceptions": exceptions,
    }
    summary = {
        "finance_components": len(components),
        "finance_schemes": len(schemes),
        "finance_scheme_rules": len(rules),
        "tuition_bills": len(bills),
        "tuition_payments": len(payments),
        "billed_amount": round(sum(item.get("amount", 0) for item in bills), 2),
        "paid_amount": round(sum(item.get("paid_amount", 0) for item in bills), 2),
        "payment_amount": round(sum(item.get("amount", 0) for item in payments), 2),
        "legacy_payment_amount": legacy_payment_source_amount,
        "finance_migration_exceptions": len(exceptions),
        "unreconciled_payment_amount": round(sum(item["amount"] for item in exceptions if item["type"] != "bill_paid_without_payment_record"), 2),
        "unreconciled_bill_paid_amount": round(sum(item["amount"] for item in exceptions if item["type"] == "bill_paid_without_payment_record"), 2),
    }
    return plan, summary


async def execute_plan(db: PostgresDatabase, plan: Dict[str, List[Dict[str, Any]]]) -> Dict[str, int]:
    result: Dict[str, int] = {}
    for collection, documents in plan.items():
        written = 0
        for document in documents:
            await getattr(db, collection).update_one({"id": document["id"]}, {"$set": document}, upsert=True)
            written += 1
        result[collection] = written
    return result


async def run(args: argparse.Namespace) -> None:
    path = Path(args.file).expanduser().resolve()
    if not path.exists():
        raise SystemExit(f"File sumber tidak ditemukan: {path}")
    plan, summary = build_finance_plan(parse_old_tables(path), path.name)
    print("=== RENCANA MIGRASI PEMBIAYAAN OLD-SIAKAD ===")
    for key, value in summary.items():
        print(f"{key}: {value}")
    if not args.execute:
        print("DRY-RUN selesai. Tidak ada database yang diubah.")
        return
    if plan["finance_migration_exceptions"] and not args.allow_exceptions:
        print("EKSEKUSI DIBATALKAN: ada pengecualian rekonsiliasi. Tinjau hasil dry-run, lalu gunakan --allow-exceptions bersama --execute bila sudah disetujui.")
        return
    load_dotenv(ROOT_DIR / "backend" / ".env")
    db = PostgresDatabase(os.environ["DATABASE_URL"])
    await db.connect()
    try:
        result = await execute_plan(db, plan)
        print("=== HASIL EKSEKUSI ===")
        for key, value in result.items():
            print(f"{key}: {value}")
    finally:
        await db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", default=str(DEFAULT_OLD_JSON), help="Path export JSON OLD-SIAKAD")
    parser.add_argument("--execute", action="store_true", help="Tulis hasil migrasi ke PostgreSQL")
    parser.add_argument("--allow-exceptions", action="store_true", help="Izinkan eksekusi ketika ada pengecualian rekonsiliasi yang sudah ditinjau")
    asyncio.run(run(parser.parse_args()))


if __name__ == "__main__":
    main()

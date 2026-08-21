const splitProgramValues = (...values) => values
  .flatMap((value) => String(value || "").split(/[,;|\n]+/))
  .map((value) => value.trim())
  .filter(Boolean);

const normalizeProgramValue = (value) => (
  String(value || "").trim().toLocaleLowerCase("id-ID")
);

const programAliases = (program) => splitProgramValues(
  program?.id,
  program?.kode,
  program?.code,
  program?.nama,
  program?.name,
  program?.feeder_program_id,
  program?.prodi_id,
  program?.program_id,
);

export const lecturerHomebase = (lecturer, programs = []) => {
  const candidates = [...new Set(splitProgramValues(
    lecturer?.homebase,
    lecturer?.homebase_feeder_program_id,
    lecturer?.prodi_id,
    lecturer?.prodi_kode,
    lecturer?.prodi_name,
    lecturer?.nama_prodi,
    lecturer?.program_id,
    lecturer?.program_code,
    lecturer?.program_name,
  ))];
  const normalizedCandidates = new Set(candidates.map(normalizeProgramValue));
  const matchingPrograms = programs.filter((program) => (
    programAliases(program).some((alias) => (
      normalizedCandidates.has(normalizeProgramValue(alias))
    ))
  ));
  const distinctPrograms = matchingPrograms.filter((program, index, items) => {
    const key = normalizeProgramValue(program?.id || program?.kode || program?.code);
    return items.findIndex((item) => (
      normalizeProgramValue(item?.id || item?.kode || item?.code) === key
    )) === index;
  });

  if (distinctPrograms.length === 1) {
    const program = distinctPrograms[0];
    return {
      code: program.kode || program.code || program.id,
      name: program.nama || program.name || "",
      valid: true,
    };
  }
  if (candidates.length === 1) {
    return { code: candidates[0], name: candidates[0], valid: true };
  }
  return { code: "Belum valid", name: "Homebase belum ditetapkan", valid: false };
};

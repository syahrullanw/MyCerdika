import { lecturerHomebase } from "./lecturerHomebase";

const programs = [
  {
    id: "RKJ-D4",
    kode: "RKJ-D4",
    nama: "REKAYASA KOMPUTER JARINGAN",
    feeder_program_id: "e1c91b16-0929-4253-a3e6-3263e126a0da",
  },
  {
    id: "BD-D4",
    kode: "BD-D4",
    nama: "BISNIS DIGITAL",
    feeder_program_id: "feeder-bd",
  },
];

test("menggabungkan kode, nama, dan ID Feeder yang merujuk ke homebase yang sama", () => {
  expect(lecturerHomebase({
    name: "SYAHRUL ANWAR",
    homebase: "RKJ-D4",
    homebase_feeder_program_id: "e1c91b16-0929-4253-a3e6-3263e126a0da",
    prodi_id: "RKJ-D4",
    prodi_kode: "RKJ-D4",
    prodi_name: "REKAYASA KOMPUTER JARINGAN",
  }, programs)).toEqual({
    code: "RKJ-D4",
    name: "REKAYASA KOMPUTER JARINGAN",
    valid: true,
  });
});

test("menandai homebase ambigu jika alias merujuk ke dua prodi berbeda", () => {
  expect(lecturerHomebase({
    homebase: "RKJ-D4",
    homebase_feeder_program_id: "feeder-bd",
  }, programs)).toEqual({
    code: "Belum valid",
    name: "Homebase belum ditetapkan",
    valid: false,
  });
});

test("menandai homebase kosong sebagai belum valid", () => {
  expect(lecturerHomebase({}, programs).valid).toBe(false);
});

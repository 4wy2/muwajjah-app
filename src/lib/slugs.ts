// Readable addresses for university pages: /universities/king-saud instead of
// the record id. A university without a slug keeps its id address, which still
// works. Add a slug here when a university is added, then rebuild.
export const SLUGS: Record<string, string> = {
  "0a8486d3-14d3-4edc-927d-6c0a1dde1bab": "king-saud",
  "98ce3485-90f1-44f6-82a0-83a7946a9792": "king-abdulaziz",
  "9a866659-e5cc-4bf1-aa56-35d51ef8ff3d": "kfupm",
  "a74d008f-5bf0-42d2-82d0-b815a6cd3de9": "king-khalid",
  "9d11e8fd-bb18-4e93-b48d-747f4e15a8de": "qassim",
  "26c314cd-eef6-413b-821e-b89a93114241": "ksau-hs",
  "17fcda78-bd4d-46ca-8053-2ce520ebbb54": "umm-al-qura",
  "8de6475a-14b5-46c8-814c-5483daf129f1": "king-faisal",
  "c7e2c20b-7954-4800-ba14-9ee0f00ebfcc": "imam-abdulrahman-bin-faisal",
  "e9d71a4c-eb24-42d5-8467-e050d97dbad2": "imam-muhammad-bin-saud",
  "19c0ce0e-f306-4142-933a-5282c9243a86": "islamic-university-madinah",
  "0bec42de-02fa-45cb-ae16-30066ba66fd2": "taibah",
  "9c694645-cc61-4fdc-8104-0ca9c39bce25": "taif",
  "159249fc-c4b0-43a7-ab9b-2339d1d5b532": "jazan",
  "2b9e5037-6f58-4396-9a11-e31427552316": "tabuk",
  "d318b66b-b5d6-4cf5-9cfa-6dfb1fa1d87f": "hail",
  "cdea64bc-df30-4bdb-a725-1c284f08f28a": "jeddah",
  "c0c3a057-c9ab-45e3-8f18-f444045f2289": "jubail-industrial-college",
  "cdff6e19-74ed-4858-a4bf-c9953c84f40d": "yanbu-industrial-college",
  "994d6d7f-6ca1-4937-bb42-f6f38331f661": "al-jouf",
  "4bb818c6-7e6c-4015-8437-718bc0b07ef6": "al-baha",
  "59fc7597-2e5e-424b-86a3-3cbd440787a9": "najran",
  "f3dd108b-22ff-4130-9a70-362679cb3951": "shaqra",
  "b3636ec4-26d3-463b-b747-c0546e189778": "majmaah",
  "1de7f6ac-ab81-448a-a3f2-dfd3de45c688": "prince-sattam",
  "8e246dc1-ba4e-457d-89e3-679431da043f": "hafr-al-batin",
  "b38fe65a-ff2c-46ae-ba72-58740de10413": "northern-border",
  "fb5cd107-70dc-4fe7-af0e-bd1bad0d453a": "bisha",
};
const IDS: Record<string, string> = Object.fromEntries(Object.entries(SLUGS).map(([id, s]) => [s, id]));
// Topic pages answer one search question each.
export type Topic = "programs" | "admission";
export const uniPath = (id: string, topic?: Topic) => {
  const key = SLUGS[id] || encodeURIComponent(id);
  return topic ? "/" + topic + "/" + key : "/universities/" + key;
};
// A slug or an id from the address → the university id.
export const idFromParam = (p: string) => IDS[p] || p;

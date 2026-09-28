// Reference data for one city (BBMP Bengaluru). Ward ids are the on-chain `wardId` and follow the
// 2010 BBMP 198-ward delimitation. This is a starter subset — extend it from the BBMP ward gazette
// before a pilot, and have the kn/ta/hi names reviewed by native speakers.

export type WardSeed = { id: number; en: string; kn: string; ta: string; hi: string };

export const BBMP_WARDS: WardSeed[] = [
  { id: 1, en: "Kempegowda", kn: "ಕೆಂಪೇಗೌಡ", ta: "கெம்பேகௌடா", hi: "केंपेगौड़ा" },
  { id: 2, en: "Chowdeswari", kn: "ಚೌಡೇಶ್ವರಿ", ta: "சௌடேஸ்வரி", hi: "चौडेश्वरी" },
  { id: 3, en: "Atturu", kn: "ಅಟ್ಟೂರು", ta: "அட்டூரு", hi: "अट्टूरु" },
  { id: 4, en: "Yelahanka Satellite Town", kn: "ಯಲಹಂಕ ಉಪನಗರ", ta: "எலஹங்கா துணை நகரம்", hi: "येलहंका सैटेलाइट टाउन" },
  { id: 5, en: "Jakkur", kn: "ಜಕ್ಕೂರು", ta: "ஜக்கூர்", hi: "जक्कूर" },
  { id: 6, en: "Thanisandra", kn: "ಥಣಿಸಂದ್ರ", ta: "தணிசந்திரா", hi: "थणिसंद्रा" },
  { id: 7, en: "Byatarayanapura", kn: "ಬ್ಯಾಟರಾಯನಪುರ", ta: "பியாடராயனபுரா", hi: "ब्याटरायनपुरा" },
  { id: 8, en: "Kodigehalli", kn: "ಕೊಡಿಗೇಹಳ್ಳಿ", ta: "கொடிகேஹள்ளி", hi: "कोडिगेहल्ली" },
  { id: 9, en: "Vidyaranyapura", kn: "ವಿದ್ಯಾರಣ್ಯಪುರ", ta: "வித்யாரண்யபுரா", hi: "विद्यारण्यपुरा" },
  { id: 10, en: "Dodda Bommasandra", kn: "ದೊಡ್ಡ ಬೊಮ್ಮಸಂದ್ರ", ta: "தொட்ட பொம்மசந்திரா", hi: "डोड्डा बोम्मसंद्रा" },
  { id: 45, en: "Malleswaram", kn: "ಮಲ್ಲೇಶ್ವರಂ", ta: "மல்லேஸ்வரம்", hi: "मल्लेश्वरम" },
  { id: 150, en: "Bellanduru", kn: "ಬೆಳ್ಳಂದೂರು", ta: "பெள்ளந்தூர்", hi: "बेल्लंदूर" },
  { id: 151, en: "Koramangala", kn: "ಕೋರಮಂಗಲ", ta: "கோரமங்களா", hi: "कोरमंगला" },
];

/** `id` is the on-chain `departmentId` (uint16). */
export const DEPARTMENTS = [
  { id: 1, code: "ROADS", name: "Road Infrastructure" },
  { id: 2, code: "SWD", name: "Storm Water Drains" },
  { id: 3, code: "SWM", name: "Solid Waste Management" },
  { id: 4, code: "ELEC", name: "Electrical (Street Lighting)" },
  { id: 5, code: "HORT", name: "Horticulture (Parks)" },
  { id: 6, code: "PROJ", name: "Projects (Buildings)" },
  { id: 7, code: "HEALTH", name: "Health" },
  { id: 8, code: "EDU", name: "Education" },
  { id: 9, code: "BWSSB", name: "Water Supply & Sewerage (BWSSB)" },
  { id: 10, code: "TP", name: "Town Planning" },
];

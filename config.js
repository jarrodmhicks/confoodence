/* ===== YOUR SETTINGS: paste the two values from Supabase (Project Settings > API) ===== */
const CONFIG = { SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }; // URL like https://abcdxyz.supabase.co  ·  key = the Publishable key (sb_publishable_...) or the legacy anon key
const MAXPICK = 8; // most places allowed in one vote
const LABEL_CODE = "Secret word"; // what the entry screen calls the shared passphrase
const TAGLINE = "Conference food with confidence";
const PRESETS = [
  {
    label: "SfN: Convention Center",
    name: "SfN Venue",
    addr: "801 Mt Vernon Pl NW, Washington, DC 20001",
    lat: 38.9043,
    lng: -77.0231,
  },
  {
    label: "APAN: Pryzbyla, Catholic U",
    name: "APAN Venue",
    addr: "620 Michigan Ave NE, Washington, DC 20064",
    lat: 38.9338,
    lng: -76.9996,
  },
];

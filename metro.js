/* Approximate Washington Metro stations (coordinates and lines are rounded from memory; used only for "est." transit times). */
const METRO = [
  ["Judiciary Square", 38.8961, -77.0166, "R"],
  ["Union Station", 38.8976, -77.007, "R"],
  ["NoMa-Gallaudet U", 38.9072, -77.0037, "R"],
  ["Rhode Island Ave", 38.921, -76.9958, "R"],
  ["Brookland-CUA", 38.9333, -76.9945, "R"],
  ["Fort Totten", 38.9519, -77.0023, "RGY"],
  ["Takoma", 38.9755, -77.018, "R"],
  ["Gallery Pl-Chinatown", 38.8984, -77.0219, "RGY"],
  ["Metro Center", 38.8983, -77.028, "RBOS"],
  ["Farragut North", 38.9033, -77.0397, "R"],
  ["Dupont Circle", 38.9096, -77.0434, "R"],
  ["Woodley Park", 38.925, -77.0526, "R"],
  ["Cleveland Park", 38.9348, -77.0582, "R"],
  ["Van Ness-UDC", 38.9437, -77.0629, "R"],
  ["Tenleytown-AU", 38.9477, -77.0796, "R"],
  ["Friendship Heights", 38.9601, -77.0855, "R"],
  ["Shaw-Howard U", 38.9129, -77.022, "GY"],
  ["U Street", 38.917, -77.0287, "GY"],
  ["Columbia Heights", 38.9285, -77.0326, "GY"],
  ["Georgia Ave-Petworth", 38.936, -77.0235, "GY"],
  ["Mt Vernon Sq", 38.9059, -77.022, "GY"],
  ["Archives", 38.8938, -77.0219, "GY"],
  ["L'Enfant Plaza", 38.8849, -77.0219, "GYBOS"],
  ["Waterfront", 38.8763, -77.0174, "G"],
  ["Navy Yard-Ballpark", 38.8765, -77.005, "G"],
  ["Anacostia", 38.8627, -76.9955, "G"],
  ["Foggy Bottom-GWU", 38.9005, -77.0502, "BOS"],
  ["Farragut West", 38.9013, -77.0316, "BOS"],
  ["McPherson Sq", 38.9013, -77.0337, "BOS"],
  ["Federal Triangle", 38.8938, -77.0282, "BOS"],
  ["Smithsonian", 38.8878, -77.0282, "BOS"],
  ["Federal Center SW", 38.8851, -77.0165, "BOS"],
  ["Capitol South", 38.885, -77.005, "BOS"],
  ["Eastern Market", 38.8841, -76.9953, "BOS"],
  ["Potomac Ave", 38.8808, -76.9855, "BOS"],
  ["Stadium-Armory", 38.8867, -76.9769, "BOS"],
  ["Rosslyn", 38.8965, -77.0731, "BOS"],
];
const MS = METRO.map((s) => ({ n: s[0], lat: s[1], lng: s[2], l: s[3] }));
function nearestStn(pt) {
  let b = null,
    bd = 1e9;
  MS.forEach((s) => {
    const d = hav(pt, s);
    if (d < bd) {
      bd = d;
      b = s;
    }
  });
  return { s: b, d: bd };
}
/* Rough door-to-door Metro minutes: walk to a station, wait ~4, ride, walk out. Returns null if it can't beat staying put. */
function metroMin(a, b) {
  if (!a || !b) return null;
  const A = nearestStn(a),
    B = nearestStn(b);
  if (A.s === B.s) return null;
  const km = hav(A.s, B.s) / 1000;
  const shared = [...A.s.l].some((c) => B.s.l.indexOf(c) >= 0);
  const ride = 3 + 1.7 * km * 1.1 + (shared ? 0 : 6);
  return Math.round((A.d * 1.3) / 80 + 4 + ride + (B.d * 1.3) / 80);
}

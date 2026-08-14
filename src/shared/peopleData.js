import andreiLarge from "../Theater/assets/portraits/large/andrei.jpg";
import dariaLarge from "../Theater/assets/portraits/large/daria.jpg";
import ivanLarge from "../Theater/assets/portraits/large/ivan.jpg";
import annaLarge from "../Theater/assets/portraits/large/anna.jpg";
import pavelLarge from "../Theater/assets/portraits/large/pavel.jpg";
import olgaLarge from "../Theater/assets/portraits/large/olga.jpg";
import igorLarge from "../Theater/assets/portraits/large/igor.jpg";
import kseniaLarge from "../Theater/assets/portraits/large/ksenia.jpg";

// ---------------------------------------------------------------------------
// Shared cast & crew directory — reused across Movies/Video Streaming detail
// modals wherever a cast or crew name is shown. Clicking a name looks the
// person up here and renders their profile page.
//
// Photos reuse the existing Theater portrait set rather than requiring new
// headshot uploads. Bios are fictional, generated from a light template —
// same spirit as the rest of the site's placeholder content.
// ---------------------------------------------------------------------------

const PEOPLE_BASE = [
  { id: "andrei-baranov", name: "Andrei Baranov", occupation: "Actor", born: "14 March 1988", birthplace: "Kolkata, India", photo: andreiLarge, notable: "Season of Ash" },
  { id: "daria-lebedeva", name: "Daria Lebedeva", occupation: "Actress", born: "2 July 1991", birthplace: "Howrah, India", photo: dariaLarge, notable: "Letters from Chowringhee" },
  { id: "ivan-sorokin", name: "Ivan Sorokin", occupation: "Actor, Director", born: "19 November 1985", birthplace: "Kolkata, India", photo: ivanLarge, notable: "The Last Rehearsal" },
  { id: "anna-fedorova", name: "Anna Fedorova", occupation: "Actress", born: "5 January 1994", birthplace: "Barrackpore, India", photo: annaLarge, notable: "Songs of the Hooghly" },
  { id: "pavel-smirnov", name: "Pavel Smirnov", occupation: "Actor, Writer", born: "27 September 1982", birthplace: "Kolkata, India", photo: pavelLarge, notable: "A House on College Street" },
  { id: "olga-kravtsova", name: "Olga Kravtsova", occupation: "Actress", born: "11 April 1990", birthplace: "Salt Lake City, Kolkata", photo: olgaLarge, notable: "Monsoon Diaries" },
  { id: "igor-zakharenko", name: "Igor Zakharenko", occupation: "Actor, Cinematographer", born: "30 June 1979", birthplace: "Kolkata, India", photo: igorLarge, notable: "Voices of the Old City" },
  { id: "ksenia-romanova", name: "Ksenia Romanova", occupation: "Actress, Producer", born: "8 December 1993", birthplace: "Serampore, India", photo: kseniaLarge, notable: "The Red Courtyard" },
];

function buildBio(p) {
  const [firstName] = p.name.split(" ");
  return {
    ...p,
    about: `Best known for ${p.notable}, ${p.name} is a Kolkata-based ${p.occupation.toLowerCase()} recognised for bringing a quiet, physical precision to stage and screen roles alike.`,
    earlyLife: `Born in ${p.birthplace} on ${p.born}, ${firstName} grew up around the local theatre circuit before formally training in performance. Early exposure to community productions shaped a lasting interest in ensemble work over solo spotlight roles.`,
    personalLife: `${firstName} keeps a famously low public profile, preferring to let the work speak for itself. Close collaborators describe a meticulous rehearsal process and a preference for long-running stage productions over one-off appearances.`,
    debut: `${firstName}'s break came through a small supporting part that drew notice for its restraint — critics singled out the performance as "underplayed in exactly the right places," and offers followed soon after.`,
    breakthrough: `The role in ${p.notable} marked a turning point, earning wider recognition and a string of festival invitations. ${firstName} has since become closely associated with character-driven, dialogue-heavy productions.`,
    recentProjects: `Recent work includes ${p.notable} alongside a handful of shorter stage collaborations; further projects are reportedly in early development.`,
  };
}

export const PEOPLE = PEOPLE_BASE.map(buildBio);

export function getPerson(id) {
  return PEOPLE.find((p) => p.id === id) || null;
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// Deterministic cast/crew picks for a given card, so the same card always
// shows the same names (no re-shuffle on re-render).
export function pickCast(seed, count = 3) {
  const h = hashStr(seed);
  const picks = [];
  for (let i = 0; i < count; i++) {
    picks.push(PEOPLE[(h + i * 3) % PEOPLE.length]);
  }
  return picks;
}

export function pickCrew(seed) {
  const h = hashStr(seed + "::crew");
  return [
    { ...PEOPLE[(h + 1) % PEOPLE.length], role: "Director" },
    { ...PEOPLE[(h + 5) % PEOPLE.length], role: "Writer" },
  ];
}

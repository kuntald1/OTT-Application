import andreiLarge from "../Theater/assets/portraits/large/andrei.jpg";
import dariaLarge from "../Theater/assets/portraits/large/daria.jpg";
import ivanLarge from "../Theater/assets/portraits/large/ivan.jpg";
import annaLarge from "../Theater/assets/portraits/large/anna.jpg";

// ---------------------------------------------------------------------------
// Fictional Plays Organiser directory for the Donation page. In a real
// system this would be the set of registered users whose account role is
// "plays_organiser" — since there's no backend here, this is a small fixed
// demo list instead.
// ---------------------------------------------------------------------------

export const ORGANISERS = [
  {
    id: "org-andrei",
    name: "Andrei Baranov",
    photo: andreiLarge,
    org: "Academy of Fine Arts Collective",
    bio: "Organises the Academy of Fine Arts' independent theatre program, funding rehearsal space for first-time playwrights.",
  },
  {
    id: "org-daria",
    name: "Daria Lebedeva",
    photo: dariaLarge,
    org: "Rabindra Sadan Youth Wing",
    bio: "Runs a youth outreach program bringing free theatre workshops to schools across Kolkata.",
  },
  {
    id: "org-ivan",
    name: "Ivan Sorokin",
    photo: ivanLarge,
    org: "Muktangan Experimental Fund",
    bio: "Funds experimental and low-budget productions that wouldn't otherwise find a venue.",
  },
  {
    id: "org-anna",
    name: "Anna Fedorova",
    photo: annaLarge,
    org: "Bengali Theatre Preservation Society",
    bio: "Works to restore and re-stage classical Bengali productions using original scripts and set designs.",
  },
];

export function getOrganiser(id) {
  return ORGANISERS.find((o) => o.id === id) || null;
}

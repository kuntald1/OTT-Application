import andreiLarge from "./assets/portraits/large/andrei.jpg";
import dariaLarge from "./assets/portraits/large/daria.jpg";
import ivanLarge from "./assets/portraits/large/ivan.jpg";
import annaLarge from "./assets/portraits/large/anna.jpg";
import pavelLarge from "./assets/portraits/large/pavel.jpg";
import olgaLarge from "./assets/portraits/large/olga.jpg";
import igorLarge from "./assets/portraits/large/igor.jpg";
import kseniaLarge from "./assets/portraits/large/ksenia.jpg";

import andreiSmall from "./assets/portraits/small/andrei.jpg";
import dariaSmall from "./assets/portraits/small/daria.jpg";
import ivanSmall from "./assets/portraits/small/ivan.jpg";
import annaSmall from "./assets/portraits/small/anna.jpg";
import pavelSmall from "./assets/portraits/small/pavel.jpg";
import olgaSmall from "./assets/portraits/small/olga.jpg";
import igorSmall from "./assets/portraits/small/igor.jpg";
import kseniaSmall from "./assets/portraits/small/ksenia.jpg";

// ---------------------------------------------------------------------------
// The single source of truth for Theater — exactly 8 real, distinct shows.
// TheaterHero cycles through these same 8 images; TheaterBrowsePage lists
// these same 8 shows (filterable, no repetition, no generated duplicates).
// Changing a show here updates both places automatically.
// ---------------------------------------------------------------------------

export const CATEGORIES = [
  "Bengali Theatre", "Drama", "Comedy", "Musical Theatre",
  "Classical Theatre", "Experimental Theatre", "Popular Shows",
];

export const VENUES = ["Academy of Fine Arts", "Rabindra Sadan", "Muktangan"];

export const SHOWS = [
  {
    id: "tram-conductors-daughter",
    title: "The Tram Conductor's Daughter",
    lead: "Andrei Baranov",
    posterLarge: andreiLarge,
    posterSmall: andreiSmall,
    synopsis: "A tram conductor's daughter inherits his old route ledger — and with it, forty years of stories about the city she never knew he was collecting.",
    category: "Bengali Theatre",
    venue: "Academy of Fine Arts",
    date: "Today, 6:00 PM",
    dateTag: "Today",
    price: "₹300",
    priceTag: "0-500",
    rating: "9.5",
  },
  {
    id: "letters-from-chowringhee",
    title: "Letters from Chowringhee",
    lead: "Daria Lebedeva",
    posterLarge: dariaLarge,
    posterSmall: dariaSmall,
    synopsis: "Two strangers exchange letters through a shared post box for a year, never quite managing to meet — until the box itself is scheduled for demolition.",
    category: "Drama",
    venue: "Rabindra Sadan",
    date: "Tomorrow, 6:30 PM",
    dateTag: "Tomorrow",
    price: "₹350",
    priceTag: "0-500",
    rating: "8.9",
  },
  {
    id: "the-last-rehearsal",
    title: "The Last Rehearsal",
    lead: "Ivan Sorokin",
    posterLarge: ivanLarge,
    posterSmall: ivanSmall,
    synopsis: "A theatre troupe's final rehearsal before closing night keeps getting interrupted by the ghosts of every production that's ever played this stage.",
    category: "Comedy",
    venue: "Muktangan",
    date: "This Weekend, 7:00 PM",
    dateTag: "This Weekend",
    price: "₹400",
    priceTag: "0-500",
    rating: "8.7",
  },
  {
    id: "songs-of-the-hooghly",
    title: "Songs of the Hooghly",
    lead: "Anna Fedorova",
    posterLarge: annaLarge,
    posterSmall: annaSmall,
    synopsis: "A boatman's daughter learns her grandmother's river songs just as the last of the old ferry routes are being retired.",
    category: "Musical Theatre",
    venue: "Academy of Fine Arts",
    date: "This Weekend, 7:30 PM",
    dateTag: "This Weekend",
    price: "₹450",
    priceTag: "0-500",
    rating: "9.6",
  },
  {
    id: "a-house-on-college-street",
    title: "A House on College Street",
    lead: "Pavel Smirnov",
    posterLarge: pavelLarge,
    posterSmall: pavelSmall,
    synopsis: "Three generations of booksellers argue over whether to sell the family shop — while the books themselves seem to be taking sides.",
    category: "Classical Theatre",
    venue: "Rabindra Sadan",
    date: "Tomorrow, 6:00 PM",
    dateTag: "Tomorrow",
    price: "₹550",
    priceTag: "501-2000",
    rating: "9.1",
  },
  {
    id: "monsoon-diaries",
    title: "Monsoon Diaries",
    lead: "Olga Kravtsova",
    posterLarge: olgaLarge,
    posterSmall: olgaSmall,
    synopsis: "Seven strangers sheltering from the same downpour under the same awning slowly realize they've been avoiding each other for very different reasons.",
    category: "Experimental Theatre",
    venue: "Muktangan",
    date: "Today, 6:30 PM",
    dateTag: "Today",
    price: "₹600",
    priceTag: "501-2000",
    rating: "8.5",
  },
  {
    id: "voices-of-the-old-city",
    title: "Voices of the Old City",
    lead: "Igor Zakharenko",
    posterLarge: igorLarge,
    posterSmall: igorSmall,
    synopsis: "A radio archivist restoring decades-old street recordings starts hearing a voice that couldn't possibly be on the original tape.",
    category: "Popular Shows",
    venue: "Academy of Fine Arts",
    date: "This Weekend, 7:00 PM",
    dateTag: "This Weekend",
    price: "Free",
    priceTag: "Free",
    rating: "9.2",
  },
  {
    id: "the-red-courtyard",
    title: "The Red Courtyard",
    lead: "Ksenia Romanova",
    posterLarge: kseniaLarge,
    posterSmall: kseniaSmall,
    synopsis: "A family reunion in a house that's been divided by an old property dispute — where even the courtyard has been split with a chalk line.",
    category: "Bengali Theatre",
    venue: "Rabindra Sadan",
    date: "Tomorrow, 7:30 PM",
    dateTag: "Tomorrow",
    price: "₹2,500",
    priceTag: "Above 2000",
    rating: "9.5",
  },
];

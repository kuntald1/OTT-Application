export const BLOG_POSTS = [
  {
    id: "backstage-letters-chowringhee",
    date: "8 Aug 2026",
    title: "Backstage at Letters from Chowringhee",
    excerpt: "A look at how the cast and crew built a year's worth of correspondence into a single evening on stage.",
    body: "Letters from Chowringhee asks its two leads to age a full year across ninety minutes, without ever leaving a single shared post box on stage. The production team spoke to us about how blocking, lighting, and a slowly filling prop box carry that passage of time without a single costume change signaling it outright.\n\nRehearsals leaned heavily on repetition — the same three-step choreography of writing, sealing, and posting a letter, performed dozens of times until it read as habit rather than performance. By the fourth week, the actors stopped thinking about the mechanics entirely, which is exactly when the scene started working.\n\nThe post box itself is rebuilt between shows — a small continuity detail audiences rarely notice, but one the crew insists matters for how grounded the final scene feels when it's finally opened.",
  },
  {
    id: "bengali-theatre-moment",
    date: "2 Aug 2026",
    title: "Why Bengali Theatre Is Having a Moment",
    excerpt: "A conversation with three directors on what's drawing new, younger audiences back into the stalls.",
    body: "Ticket sales for Bengali-language productions have climbed steadily over the past two seasons, reversing a decade-long slide. We asked three directors what changed.\n\nAll three pointed to the same shift: shorter runtimes, tighter ensembles, and a willingness to stage contemporary, occasionally uncomfortable stories rather than leaning solely on the classical repertoire. Word of mouth among a younger crowd has done the rest — several productions this season sold out entirely on social recommendations, with no traditional advertising at all.\n\nThere's also a practical factor: smaller venues have made staging original, lower-budget work viable again, which has let newer writers get produced without needing a proven track record first.",
  },
  {
    id: "classical-productions-season",
    date: "27 Jul 2026",
    title: "5 Classical Productions to Watch This Season",
    excerpt: "From Academy of Fine Arts to Rabindra Sadan — the shows worth planning your month around.",
    body: "This season's classical lineup leans unusually ambitious, with three venues staging large-ensemble work simultaneously for the first time in years. Here's where to start if you can only make a handful of shows.\n\nAcademy of Fine Arts opens with a restaging of a rarely performed 1970s piece, using the original set designs recovered from archive. Rabindra Sadan follows two weeks later with a new adaptation that's already drawing comparisons to the original 1985 run. Muktangan rounds out the month with a smaller, more intimate piece — worth catching specifically for how differently it uses the space compared to the two larger venues.\n\nAs always with limited-run classical work, tickets for the opening weekends tend to move fastest.",
  },
  {
    id: "lighting-design-interview",
    date: "19 Jul 2026",
    title: "An Interview with a Working Lighting Designer",
    excerpt: "How one designer thinks about mood, blocking, and the difference between a good cue and a great one.",
    body: "Lighting design rarely gets discussed the way blocking or performance does, so we sat down with a designer who's worked across half a dozen productions this year to talk through the craft.\n\nThe most consistent theme: restraint. A good cue, by this designer's account, is one the audience never consciously notices — it's doing its job quietly, shaping focus and mood without calling attention to itself. The rare moments where lighting is meant to be noticed are earned precisely because everything before them wasn't.\n\nWe also talked through the practical constraints of smaller venues — how limited rigs force more deliberate choices, and why that constraint often produces more interesting design than an unlimited budget would.",
  },
  {
    id: "understudy-life",
    date: "6 Jul 2026",
    title: "What It's Actually Like to Be an Understudy",
    excerpt: "Weeks of preparation for a role you might never perform — and why most understudies say it's worth it anyway.",
    body: "Understudying is often framed as a thankless job: full preparation for a role that, statistically, you may never actually perform on a given night. We talked to several understudies currently working across the city's stages about why they keep taking the work.\n\nMost described it as the fastest way to genuinely learn a production from the inside — blocking, pacing, and the small adjustments a lead makes night to night become visible in a way they wouldn't from the audience. Several also pointed out that understudy runs, when they do happen, tend to bring a different energy to a role — often looser, sometimes revealing new choices the original cast adopts going forward.",
  },
  {
    id: "venue-history-academy",
    date: "24 Jun 2026",
    title: "A Short History of the Academy of Fine Arts Stage",
    excerpt: "Decades of productions have passed through the same stage — here's what's changed, and what hasn't.",
    body: "The Academy of Fine Arts stage has hosted productions continuously for decades, surviving several renovations without losing its basic proportions — a detail directors who've worked there repeatedly cite as unusually valuable for staging.\n\nWe traced through venue records to piece together a rough history of what's been staged there, and spoke to longtime crew members about what's changed behind the scenes even as the stage itself has stayed largely consistent — better rigging, improved acoustics, but the same fundamental relationship between stage and stalls that's shaped how directors block scenes there for years.",
  },
];

export function getBlogPost(id) {
  return BLOG_POSTS.find((p) => p.id === id) || null;
}

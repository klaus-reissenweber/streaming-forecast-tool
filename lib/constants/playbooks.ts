import type { Genre } from "@/lib/forecast";

export interface GenrePlaybook {
  optimize_for: string;
  best_practices: readonly string[];
  creative: string;
  avoid: readonly string[];
}

/** Verbatim genre playbooks. Red Light operational workflow. Do not edit copy casually. */
export const GENRE_PLAYBOOKS: Record<Genre, GenrePlaybook> = {
  dubstep: {
    optimize_for:
      "Saves over streams. Spotify's algorithm responds more to save volume than play count for this genre, so save count is what you're chasing. Fans go find your music and the algorithm follows them, so the goal is to make sure your existing fan base is hitting save the moment the track drops. Push save-focused creative on owned channels and ask fans directly to add tracks to their library.",
    best_practices: [
      "Activate fan communities aggressively. Discord, Reddit, Twitch, fan-run subreddits. This is where they live and where word of mouth spreads.",
      "Use clipping agencies and real-creator clipping to push the track into UGC on TikTok and Reels.",
      "Run paid Meta and TikTok ads with Listen Now CTAs. Target fan lookalikes and warm audiences who've engaged with the artist before.",
      "Lean into owned EDM page networks for momentum. Tribes, DJ Lovers Club, and dedicated EDM pages drive real listens.",
      "Pitch editorial every time. Every release deserves the shot even when fans drive most of the traction.",
      "Time releases around festival dates when possible. Live performance fuels post-release streaming.",
    ],
    creative:
      "Match the energy of the track. Heavy drops want hype edits and high-impact visuals. Melodic moments want texture and atmosphere. The ad creative needs to feel like the song. Generic mood content reads as off.",
    avoid: [
      "Generic lifestyle or mood ad creative. Feels wrong for dubstep fans and underperforms.",
      "Treating editorial pitching as optional. It's never the main engine, but you always try.",
    ],
  },
  house: {
    optimize_for:
      "Editorial discovery first, then audience expansion. Curators put you in front of people, people decide whether to engage. Editorial signals matter more than save volume here. A strong NMF placement does more than great fan engagement does. Save count is still a healthy signal, just not the primary driver. Build the supporting ecosystem around editorial as the foundation.",
    best_practices: [
      "Editorial pitching is non-negotiable. NMF, mint, Housewerk, Dance Rising, and genre-specific lists. This is where house breaks.",
      "DJ promo and radio plugging to get the track played out and add credibility.",
      "PR and third-party playlisting to build coverage before and after release.",
      "Social clipping and sound seeding on Instagram and TikTok. Get the track into UGC with mood-aligned content.",
      "Influencer campaigns with both creators (clipping creators, lifestyle creators) and EDM influencer pages (Tribes, DJ Lovers Club, dedicated house pages).",
      "Run paid Meta and TikTok ads with Listen Now CTAs. House campaign windows can stretch. Don't front-load everything in week 1.",
    ],
    creative:
      "Lifestyle and mood-driven creative works. Tie the track to a feeling, a setting, an activity. Driving at night, sunset on a rooftop, daytime energy. House is consumed in context, and the ads should reflect that context.",
    avoid: [
      "Front-loading all the spend in week 1. House builds over the campaign window. Pace the activation.",
      "Forcing a community-activation narrative when the artist doesn't have one. Editorial does the work here.",
    ],
  },
  "melodic-bass": {
    optimize_for:
      "Saves over streams, same as dubstep. The algorithm responds to save volume more than play count for this genre. Push save-focused creative on owned channels. The audience skews slightly older and more mood-driven than dubstep, so the tone of the save-ask shifts from hype to emotional resonance, but the goal is the same: get fans to add the track to their library.",
    best_practices: [
      "Activate fan communities. Discord, Reddit, dedicated melodic bass spaces. Slightly older audience than dubstep but still community-driven.",
      "Use clipping agencies and real-creator clipping. Match the creative tone to the genre: atmospheric and emotional, not just hype.",
      "Run paid Meta and TikTok ads with Listen Now CTAs targeting fans of related artists.",
      "Lean into owned EDM page networks like Tribes, melodic-bass-specific pages, and dedicated dance music outlets.",
      "Pitch editorial every release. Mood-based playlists and melodic dance lists are the right fit.",
      "Time releases around touring and festival dates when possible. Live moments translate to streaming spikes.",
    ],
    creative:
      "Match the emotional texture of the track. Cinematic, atmospheric, often more visual than hype-driven. The fan base resonates with mood and emotion, and the creative needs to land that.",
    avoid: [
      "Pure hype-edit creative without the emotional layer. The audience expects more texture than straight dubstep audiences.",
      "Treating it identically to dubstep. Similar playbook, different tone. The older, more mood-driven audience needs the creative to reflect that.",
    ],
  },
  downtempo: {
    optimize_for:
      "Mood-state placement and consistent engagement over time. Context drives discovery here: chill, study, late night, dinner. The audience finds you when the moment is right, not when they're looking for new music. The algorithm responds to consistent engagement over a longer window than other genres. Saves and full-track plays both matter. Don't expect dubstep-style week-1 spikes. Downtempo often performs better in week 2-3 than week 1, so pace your activation accordingly.",
    best_practices: [
      "Pitch mood-based playlists hard. Chill, study, dinner, late night, ambient, atmospheric. This is the primary discovery surface for downtempo.",
      "Sync pitching for film, TV, and ads. Downtempo has a strong sync market and placements drive long-tail streaming.",
      "Sound seeding on Instagram with mood-based UGC. Match the track to specific moods or activities. Late night drive, working from home, golden hour.",
      "Run paid Meta and TikTok ads with Listen Now CTAs targeting mood-aligned audiences. Same UGC-style approach as the organic seeding.",
      "Editorial pitching for mood-based lists. NMF is harder for downtempo but the mood playlists are the goldmine.",
      "Lean into owned dance/lifestyle page networks where the track fits the vibe.",
    ],
    creative:
      "Creative must align with the energy of the track and tie explicitly to a mood or moment. Late night chill, slow dancing, sunset, focus, decompression. Generic music-promo visuals don't work. The viewer should immediately picture the moment the song fits into.",
    avoid: [
      "Loud or club-focused promotional language. The audience isn't looking for hype.",
      "Front-loading spend in week 1. Downtempo often performs better in week 2-3 than week 1, so pace accordingly.",
    ],
  },
  "big-room": {
    optimize_for:
      "Streaming volume through broad reach. This is mass-market dance music. The genre benefits from broad reach, not just engaged listening. Editorial placement drives this far more than save behavior, so streaming volume matters more than save rate for big-room. Festival circuit, radio, and editorial are the engine. The audience is reached through broadcast channels.",
    best_practices: [
      "Editorial pitching is essential. NMF, big dance lists, festival-adjacent playlists. The biggest lifts happen here.",
      "Festival sets and ID drops. Live drops translate directly to streaming when the track gets identified.",
      "Radio promo and DJ pool services. Big-room benefits from broadcast reach in ways other genres don't.",
      "PR and coverage in EDM media outlets to build the campaign narrative.",
      "Owned EDM page networks for momentum and reach.",
      "Run paid Meta and TikTok ads with Listen Now CTAs. Anthemic, high-energy creative. Festival visuals work.",
    ],
    creative:
      "Anthemic and high-energy. Festival footage, crowd shots, ID-drop moments. Big-room is shared in public moments, and the ads should evoke those moments.",
    avoid: [
      "Niche community-driven plays. Big-room doesn't have the deep fan-community texture that dubstep or melodic bass do. Don't force it.",
      "Trying to engineer save-focused engagement. The numbers will look different than dubstep, and that's normal for this genre.",
    ],
  },
};

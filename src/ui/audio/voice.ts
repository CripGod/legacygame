import { duckMusic } from './music';
import { getAudioSettings } from './settings';

/**
 * Voice lines. A card speaks when it is played: your own the moment it lands in the plan, the opponent's on
 * its play beat in the replay. The line is the card's power in the person's own words where a real quote fits
 * (kind 'quote' is verbatim, 'attributed' is tradition or a reported saying, 'written' is ours), and this table is
 * also the recording script. Clips live in public/audio/voice/<card id>.mp3 (the single-file build inlines them as
 * `voice/<id>`); a card with no clip yet stays silent. The music ducks under a line.
 */
export interface VoiceLine {
  id: string;
  line: string;
  kind: 'quote' | 'attributed' | 'written';
  source: string;
}

export const VOICE_LINES: VoiceLine[] = [
  { id: 'frederick_douglass', line: 'Power concedes nothing without a demand. It never did, and it never will.', kind: 'quote', source: 'West India Emancipation speech, Canandaigua, New York, 3 August 1857' },
  { id: 'harriet_tubman', line: 'I never ran my train off the track, and I never lost a passenger.', kind: 'attributed', source: 'Reported by Sarah H. Bradford, Harriet, the Moses of Her People (1886)' },
  { id: 'sojourner_truth', line: 'Truth is powerful, and it prevails.', kind: 'attributed', source: 'Reported saying; Narrative of Sojourner Truth, 1875 edition' },
  { id: 'marcus_garvey', line: 'Up, you mighty race! You can accomplish what you will.', kind: 'quote', source: 'Philosophy and Opinions of Marcus Garvey (1923)' },
  { id: 'ida_b_wells', line: 'The way to right wrongs is to turn the light of truth upon them.', kind: 'quote', source: '"Lynch Law in All Its Phases", Boston, 13 February 1893' },
  { id: 'booker_t_washington', line: 'Cast down your bucket where you are.', kind: 'quote', source: 'Atlanta Exposition address, 18 September 1895' },
  { id: 'madam_cj_walker', line: 'I got my start by giving myself a start.', kind: 'quote', source: 'National Negro Business League convention, Chicago, 1912' },
  { id: 'abraham_lincoln', line: 'If slavery is not wrong, nothing is wrong.', kind: 'quote', source: 'Letter to Albert G. Hodges, 4 April 1864' },
  { id: 'william_lloyd_garrison', line: 'I will not retreat a single inch, and I will be heard.', kind: 'quote', source: 'The Liberator, first issue, 1 January 1831 (condensed)' },
  { id: 'charles_sumner', line: 'Equality before the law.', kind: 'quote', source: 'Argument in Roberts v. City of Boston, 4 December 1849' },
  { id: 'thaddeus_stevens', line: 'Equality of man before his Creator.', kind: 'quote', source: 'His own epitaph, Shreiner-Concord Cemetery, Lancaster' },
  { id: 'toussaint_louverture', line: 'You have cut down only the trunk of the tree of liberty. It will spring up again from the roots.', kind: 'attributed', source: 'Said aboard ship for France, June 1802, as reported by his captors' },
  { id: 'zora_neale_hurston', line: 'Research is formalized curiosity. It is poking and prying with a purpose.', kind: 'quote', source: 'Dust Tracks on a Road (1942)' },
  { id: 'paul_laurence_dunbar', line: 'We wear the mask that grins and lies.', kind: 'quote', source: '"We Wear the Mask", Lyrics of Lowly Life (1896)' },
  { id: 'robert_smalls', line: 'My race needs no special defense.', kind: 'quote', source: 'South Carolina constitutional convention, 1 November 1895' },
  { id: 'menelik_ii', line: 'Ethiopia has need of no one; she stretches out her hands unto God.', kind: 'quote', source: 'Circular letter to the European powers, 10 April 1891' },
  { id: 'yaa_asantewaa', line: 'If you, the men of Asante, will not go forward, then we will. We, the women, will.', kind: 'attributed', source: 'Asante oral tradition of the Kumasi council, March 1900' },
  { id: 'john_brown', line: 'The crimes of this guilty land will never be purged away but with blood.', kind: 'quote', source: 'Note handed to his jailer, 2 December 1859' },
  { id: 'dave_the_potter', line: 'I wonder where is all my relation. Friendship to all, and every nation.', kind: 'quote', source: 'Verse cut into a stoneware jar, 16 August 1857' },
  { id: 'john_russwurm', line: 'We wish to plead our own cause. Too long have others spoken for us.', kind: 'quote', source: "Freedom's Journal, first editorial, 16 March 1827, with Samuel Cornish" },
  { id: 'sleeping_car_porters', line: 'Fight, or be slaves.', kind: 'quote', source: 'Motto of the Brotherhood of Sleeping Car Porters, 1925' },
  { id: 'henry_mcneal_turner', line: 'God is a Negro.', kind: 'quote', source: 'Voice of Missions, February 1898' },
  { id: 'elizabeth_freeman', line: 'I would have taken one minute of freedom, just to stand one minute on God\'s earth a free woman.', kind: 'attributed', source: 'Recorded by Catharine Maria Sedgwick, "Slavery in New England", Bentley\'s Miscellany (1853), condensed' },
  { id: 'mary_ann_shadd_cary', line: 'Self-reliance is the fine road to independence.', kind: 'quote', source: 'Motto of the Provincial Freeman, 1853' },
  { id: 'cathay_williams', line: 'I wanted to make my own living, and not be dependent on relations or friends.', kind: 'quote', source: 'St. Louis Daily Times interview, 2 January 1876' },
  { id: 'mary_ellen_pleasant', line: 'She was a friend of John Brown.', kind: 'quote', source: 'The epitaph she asked for, Tulocay Cemetery, Napa' },
  { id: 'nehanda', line: 'My bones will rise again.', kind: 'attributed', source: 'Words attributed to her at her execution, 1898; Shona tradition' },
  { id: 'bessie_coleman', line: 'The air is the only place free from prejudices.', kind: 'attributed', source: 'Widely attributed, 1920s' },
  { id: 'boukman_dutty', line: 'Listen to the voice of liberty, which speaks in the hearts of us all.', kind: 'attributed', source: 'The Bois Caïman prayer as printed by Hérard Dumesle, Voyage dans le nord d\'Hayti (1824)' },
  { id: 'scott_joplin', line: 'Never play ragtime fast at any time.', kind: 'quote', source: 'School of Ragtime (1908)' },
  { id: 'denmark_vesey', line: 'Count the hands with you. That is our strength.', kind: 'written', source: 'Power line: he draws a card per friend at his Location' },
  { id: 'queen_nzinga', line: 'Nobody enters this ground unless I allow it.', kind: 'written', source: 'Power line: her challenge holds the strongest at the Gates' },
  { id: 'anansi', line: 'Every story is mine. I only lend them.', kind: 'written', source: 'Power line: the retelling' },
  { id: 'shango', line: 'Thunder answers at every gate at once.', kind: 'written', source: 'Power line: he challenges every Gate' },
  { id: 'oshun', line: 'What is small in my river, grows.', kind: 'written', source: 'Power line: the weakest friend grows each turn' },
  { id: 'ogun', line: 'Iron for every threat on this road.', kind: 'written', source: 'Power line: he confronts every Threat' },
  { id: 'yemoja', line: 'Come across the water, child. There is room.', kind: 'written', source: 'Power line: she brings a friend across' },
  { id: 'mami_wata', line: 'The water takes what waits at the gate.', kind: 'written', source: 'Power line: she knocks a Gate Character away' },
  { id: 'mansa_musa', line: 'Gold enough to move a city, and more you have not seen.', kind: 'written', source: 'Power line: the hidden bonus' },
  { id: 'richard_allen', line: 'Come inside, and the word goes out.', kind: 'written', source: 'Power line: a draw when yours go Inside' },
  { id: 'david_ruggles', line: 'I have their names, and I will print every one.', kind: 'written', source: 'Power line: the Slaveholders Directory' },
  { id: 'william_still', line: 'Tell me your story. I am writing it down.', kind: 'written', source: 'Power line: the interview and the record' },
  { id: 'william_parker', line: 'We found out who told. He does not stay here.', kind: 'written', source: 'Power line: the arrest' },
  { id: 'lewis_hayden', line: 'Their faces on every wall, and out of this town.', kind: 'written', source: 'Power line: the placards' },
  { id: 'samuel_ajayi_crowther', line: 'I went back, and I found my mother.', kind: 'written', source: 'Power line: bringing a friend across (Abeokuta, 1846)' },
  { id: 'mary_seacole', line: 'I tend both sides. Nobody waits on my account.', kind: 'written', source: 'Power line: blocks end for both players' },
  { id: 'zumbi_dos_palmares', line: 'Palmares holds. The small ones stand taller here.', kind: 'written', source: 'Power line: the quilombo' },
  { id: 'organizer', line: 'Together, we build.', kind: 'written', source: 'Power line: an archetype, no single person' },
  { id: 'og', line: "Ain't nobody getting in. Not tonight.", kind: 'written', source: 'Power line: an archetype, no single person' },
  { id: 'bass_reeves', line: 'I have the warrant, and I only need it read once.', kind: 'written', source: 'Power line: he could not read; warrants were read to him and he memorized them' },
  { id: 'victor_hugo_green', line: 'Take the Green Book. The next door is open.', kind: 'written', source: 'Power line: relocations out arrive Inside' },
  { id: 'tom_bass', line: 'Nobody leaves this ground against me.', kind: 'written', source: 'Power line: the reins' },
  { id: 'edmonia_lewis', line: 'Cut it in marble, and it stays.', kind: 'written', source: 'Power line: lasting Influence on the Location' },
  { id: 'henry_ossawa_tanner', line: 'I paint the church into the ground it stands on.', kind: 'written', source: 'Power line: lasting Influence every turn' },
  { id: 'harriet_powers', line: 'Every square is a story, stitched to stay.', kind: 'written', source: 'Power line: the Bible quilts' },
  { id: 'alonzo_herndon', line: 'A chair for anyone. The door is open.', kind: 'written', source: 'Power line: free departures' },
  { id: 'george_washington_carver', line: 'Everything ripens in its season.', kind: 'written', source: 'Power line: the most expensive card gets cheaper each turn' },
  { id: 'cecile_fatiman', line: 'The price is paid at the ceremony.', kind: 'written', source: 'Power line: Rebellion costs less' },
  { id: 'marie_laveau', line: 'Gris-gris does not wear off.', kind: 'written', source: 'Power line: the hex is for good' },
  { id: 'nanny_of_the_maroons', line: 'Nothing they throw reaches my people here.', kind: 'written', source: 'Power line: the shield' },
  { id: 'ayuba_suleiman_diallo', line: 'One letter, and the road home opens.', kind: 'written', source: 'Power line: a friend returns to hand at no cost' },
  { id: 'james_lafayette', line: 'I told them exactly what they wanted to hear.', kind: 'written', source: 'Power line: the false reports' },
];

const lines = new Map(VOICE_LINES.map((v) => [v.id, v]));
const clips = new Map<string, AudioBuffer | null>();
let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let lastPlayed = 0;

function clipUrl(id: string): string {
  const inline = typeof window !== 'undefined' ? window.__AUDIO__?.[`voice/${id}`] : undefined;
  return inline ?? `${import.meta.env.BASE_URL}audio/voice/${id}.mp3`;
}

/** Share the effects context: created on the first gesture by sfxUnlock, handed over here. */
export function voiceAttach(context: AudioContext, destination: AudioNode): void {
  ctx = context;
  out = context.createGain();
  out.gain.value = 0.95;
  out.connect(destination);
}

async function load(id: string): Promise<AudioBuffer | null> {
  if (clips.has(id)) return clips.get(id)!;
  clips.set(id, null);
  try {
    const r = await fetch(clipUrl(id));
    if (!r.ok) return null;
    const buf = await ctx!.decodeAudioData(await r.arrayBuffer());
    clips.set(id, buf);
    return buf;
  } catch {
    return null;
  }
}

/** Speak the card's line if a clip exists. Lines never overlap: a new one within 400ms of the last is dropped. */
export function voice(cardId: string): void {
  if (!ctx || !out || ctx.state !== 'running' || !getAudioSettings().sfx || !lines.has(cardId)) return;
  const now = performance.now();
  if (now - lastPlayed < 400) return;
  lastPlayed = now;
  void load(cardId).then((buf) => {
    if (!buf || !ctx || !out) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(out);
    src.start(ctx.currentTime + 0.02);
    duckMusic(Math.round(buf.duration * 1000) + 300);
  });
}

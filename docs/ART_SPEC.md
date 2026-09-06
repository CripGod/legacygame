# Art specification

Drop files into `public/art/<kind>/<id>.jpg`. The UI loads them by id and falls back to the coloured initials tile when a file is missing, so partial sets are fine.

## Formats

| Kind | Path | Size | Notes |
|---|---|---|---|
| Character portrait | `public/art/characters/<id>.jpg` | 512 × 512, JPG, quality 80, under 120 KB | Square. Chest-up, face centred in the middle 60% (it is shown as a circle on the card and cropped to a square on board tiles). Dark, muted background so the player-colour borders read. No text. |
| Location banner | `public/art/locations/<id>.jpg` | 1200 × 400, JPG, quality 80, under 200 KB | 3:1 wide scene. Keep the important content in the middle 70%: the name is overlaid in the centre and the era bottom-right. Mid-to-dark values so white type stays legible. |
| Threat | `public/art/threats/<id>.jpg` | 512 × 512, JPG | Symbolic, not a portrait of a person. Used in the Threat sheet. |
| Event | `public/art/events/<id>.jpg` | 512 × 512, JPG | Symbolic. Shown as the circle on the Event card. |

Style: one consistent painterly treatment across the set (the same brush, the same palette temperature) so archetypes and historical figures sit together. Historical figures should be recognisable but not photographic. Archetypes (Organizer, OG, Karen, Pullman Porter) are invented people, period-appropriate.

Zip layout: `art/characters/*.jpg`, `art/locations/*.jpg`, `art/threats/*.jpg`, `art/events/*.jpg`.

## Characters (24)

| File | Name | Era | Direction |
|---|---|---|---|
| `characters/harriet_tubman.jpg` | Harriet Tubman | 1822–1913 | Small, resolute woman in a dark dress and headscarf, lantern light, night woods behind her. Determined, watchful. |
| `characters/frederick_douglass.jpg` | Frederick Douglass | 1818–1895 | Commanding man with the famous grey-streaked hair, formal coat, mid-speech intensity. Lecture hall or print shop. |
| `characters/john_brown.jpg` | John Brown | 1800–1859 | Gaunt older white man with a long grey beard, burning eyes, rifle strap over a worn coat. Harpers Ferry engine house behind. |
| `characters/katherine_johnson.jpg` | Katherine Johnson | 1918–2020 | Woman in 1960s dress and glasses at a desk of hand calculations, chalk trajectories on a board. Calm precision. |
| `characters/mansa_musa.jpg` | Mansa Musa | c. 1280–1337 | Malian emperor on a throne or camel, gold ornaments, Sahara light, Timbuktu mud-brick architecture. Regal, expansive. |
| `characters/zora_neale_hurston.jpg` | Zora Neale Hurston | 1891–1960 | Woman in a wide-brimmed hat, notebook in hand, Florida porch light, amused and sharp. |
| `characters/karen.jpg` | Karen | Timeless | Contemporary white woman mid-complaint, phone raised, sunglasses on head. Slightly comic, not cruel. |
| `characters/pullman_porter.jpg` | Pullman Porter | 1867–1968 | Black man in a crisp Pullman uniform and cap on a sleeper-car platform, newspaper tucked under his arm. |
| `characters/organizer.jpg` | Organizer | Timeless | Young Black woman with a clipboard and a phone, church basement or community hall, 1960s–70s. |
| `characters/og.jpg` | OG | Timeless | Older Black man on a stoop or corner, folding chair, unbothered authority. Contemporary. |
| `characters/ida_b_wells.jpg` | Ida B. Wells | 1862–1931 | Woman in late-1800s dress, pen and papers, printing press behind her, level unflinching gaze. |
| `characters/queen_nzinga.jpg` | Queen Nzinga | c. 1583–1663 | Central African queen in ceremonial dress and headwear, bow or blade, court or battlefield of 17th-century Ndongo. |
| `characters/toussaint_louverture.jpg` | Toussaint Louverture | 1743–1803 | Haitian general in a blue military coat with gold epaulettes and bicorne hat, Saint-Domingue hills behind. |
| `characters/marcus_garvey.jpg` | Marcus Garvey | 1887–1940 | Man in the UNIA plumed hat and formal uniform, parade or ship deck, Harlem 1920s. |
| `characters/bessie_coleman.jpg` | Bessie Coleman | 1892–1926 | Woman in aviator cap, goggles and leather jacket beside a 1920s biplane, confident smile. |
| `characters/sojourner_truth.jpg` | Sojourner Truth | c. 1797–1883 | Tall older woman in a white cap and shawl, knitting or with a Bible, speaking from a platform. Gravity. |
| `characters/anansi.jpg` | Anansi | Akan, timeless | Mythic. A spider-man trickster: elegant, many-limbed, kente-patterned, a knowing grin, storytelling gesture. Gold web threads on indigo. |
| `characters/shango.jpg` | Shango | Yoruba, Oyo | Mythic. Broad-shouldered king with a double-headed axe, red and white beads, lightning behind him, bata drum at his feet. |
| `characters/oshun.jpg` | Oshun | Yoruba, Osogbo | Mythic. Woman in gold and honey tones, river water, brass bracelets, peacock feather, mirror. Warm, luminous. |
| `characters/yemoja.jpg` | Yemoja | Yoruba, the Atlantic | Mythic. Mother of waters in blue and white, waves and moonlight, a shell crown, protective and vast. |
| `characters/ogun.jpg` | Ogun | Yoruba | Mythic. Iron-worker god at a forge, machete, green and black, sparks, muscles and soot. |
| `characters/mami_wata.jpg` | Mami Wata | West and Central Africa, the Caribbean | Mythic. Water spirit with long hair, a serpent across her shoulders, a mirror, deep-sea greens and coins. Beautiful and unsettling. |
| `characters/black_jesus.jpg` | Black Jesus | The Black church, every era | Mythic. A dark-skinned Christ in the stained-glass idiom of the Black church: robes, a gentle direct gaze, a halo of gold leaf, hands open. No weapons, no wounds. |
| `characters/victor_hugo_green.jpg` | Victor Hugo Green | 1892–1960 | Man in a 1940s suit and hat at a desk with maps and a copy of the Green Book, Harlem window behind. |

## Locations (8)

| File | Name | Era | Direction |
|---|---|---|---|
| `locations/greenwood.jpg` | Greenwood District | Tulsa, 1921 | Greenwood Avenue in its prosperity: brick storefronts, theatres, well-dressed crowds, 1920s Tulsa. Warm evening light with a faint smoke line on the horizon. |
| `locations/harpers_ferry.jpg` | Harpers Ferry | Virginia, 1859 | The federal armory engine house at the confluence of two rivers, mist on the water, dawn, 1859. |
| `locations/black_star.jpg` | The Black Star | Atlantic, 1919 | A Black Star Line steamship at a Harlem pier with a crowd waving, banners, 1919. |
| `locations/great_migration.jpg` | Great Migration | 1916–1970 | A crowded northbound train platform, suitcases and Sunday clothes, city skyline ahead, 1920s–40s. |
| `locations/juneteenth.jpg` | Juneteenth | Galveston, 1865 | Galveston street celebration, June 1865: flags, brass band, families in their best. |
| `locations/sundown_town.jpg` | Sundown Town | 1890–1968 | A small-town road at dusk with a painted warning sign at the town line, empty main street, long shadows. Ominous but not graphic. |
| `locations/accra_ghana.jpg` | Accra, Ghana | Independence, 1957 | Independence Square at night, 6 March 1957: the black-star flag rising over a jubilant crowd, floodlights, kente. |
| `locations/gary_indiana.jpg` | Gary, Indiana | Steel City, 1906– | Gary Works blast furnaces glowing at night behind a row of neat bungalows, one lit living-room window. Steel and soul. |

## Threats (5)

| File | Name | Family | Direction |
|---|---|---|---|
| `threats/segregationist_patrol.jpg` | Segregationist Patrol | Open Hostility | A whites-only sign and a patrol car at a checkpoint, no faces. 1950s. |
| `threats/comfortable_complicity.jpg` | Comfortable Complicity | Complicit Beneficiary | A comfortable parlour, drawn curtains, a newspaper folded away from bad news. Quiet, warm, wrong. |
| `threats/housing_restriction.jpg` | Housing Restriction | Systemic Pressure | A redlining map with a neighbourhood outlined in red, a covenant document, a for-sale sign. |
| `threats/supremacist_mob.jpg` | Supremacist Mob | Crisis | Torches and shadows on a street at night, figures indistinct, smoke. Threatening, not explicit. |
| `threats/slave_catcher.jpg` | Slave Catcher | Open Hostility | A wanted poster and a pair of shackles on a table, a lantern, 1850s. No person depicted. |

## Events (2)

| File | Name | Direction |
|---|---|---|
| `events/reparations.jpg` | Reparations | A ledger being balanced, hands passing a deed or a cheque across a table, morning light. |
| `events/community_defense.jpg` | Community Defense | Neighbours on a porch at night, a lantern, a rifle leaning by the door, calm resolve. Deacons for Defense era. |

## Card back and avatars

Avatars reuse character portraits. No card back is needed yet: the opponent hand is shown as a count, not as cards.


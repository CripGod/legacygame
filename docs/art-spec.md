# Art spec

How every image is used, what to deliver, and what is still missing. File names are the ids in backticks; drop finished files in `public/art/<kind>/<id>.jpg` (the build inlines them).

## Sizes and framing

| Kind | Deliver | Stored as | Where it shows | Framing |
|---|---|---|---|---|
| Character | 1024×1024 or larger, square | 512×512 JPG | Hand card (the top 5:5 of the card), Gate tile (square), Inside tile (small square, about 40 px on phones), avatar (circle crop of the center) | Head and shoulders, face in the upper-middle third, eyes about 40% down. Plain or softly lit background. No text, no frame. Must read at 40 px. |
| Threat | 1024×1024 square | 512×512 JPG | Threat chip (18 px round thumb), Threat sheet (220 px), confront animation | One clear silhouette, high contrast, a single strong color per Threat so the thumb is recognizable. Menace without gore. |
| Event | 1024×1024 square | 512×512 JPG | Hand card, card sheet | Same crop as Characters; scene rather than portrait. |
| Location | 1536×1536 square (1024 minimum) | 1024×1024 JPG | Full background of the Location panel under a dark gradient. Desktop crops to about 3:2 landscape, phones crop to a tall portrait. | Keep the subject inside the central 50% both ways so both crops keep it. Wide establishing shot, no people in the foreground, no text or signage that must be legible. Mid-tone, not dark: we darken it. Low fine detail, because a rule box and character tiles sit on top of it. |

Format: PNG or JPG, sRGB, no transparency, no borders, no watermark, no typography. Consistent painterly style across a kind so the board reads as one set.

## Confrontation art (the Mob and the other bad guys)

Confronting a Threat should feel like a showdown. To stage it we want, per Threat:

- The portrait above (square) for the chip and the sheet.
- A second **wide** image, 1536×768, of the same Threat as a scene: the Mob filling a street, the Paddy Roller on horseback at a tree line, the Patrol at a checkpoint, the Complicit neighbor behind a curtain, the Restriction as a covenant document and a locked gate. This becomes the backdrop of the confront animation and of the Threat sheet.
- Same palette per Threat as its portrait (one signature color each) so the two images pair.

## Missing

### characters (16)

- `newsboy` **Newsboy** (1905–1960): The Chicago Defender rode south in the bags of Pullman porters and the hands of kids on corners; a paper was the first thing many families bought.
- `barber` **Barber** (Any Saturday): The barbershop was bank, newsroom, campaign office and town hall. Everybody passed through, and nobody stayed long.
- `block_captain` **Block Captain** (1960s–): Knows every door on the street and who is behind it. When trouble comes, the block already has a plan.
- `richard_allen` **Richard Allen** (1760–1831): Bought his own freedom, walked out of a segregated church and built his own denomination.
- `absalom_jones` **Absalom Jones** (1746–1818): Bought his wife's freedom before his own. First Black priest in the Episcopal Church.
- `daniel_payne` **Daniel Payne** (1811–1893): Ran a school for Black children in Charleston until the state outlawed it. Later ran a university.
- `henry_mcneal_turner` **Henry McNeal Turner** (1834–1915): Army chaplain, Georgia legislator expelled for being Black, AME bishop who told his people to leave.
- `denmark_vesey` **Denmark Vesey** (c. 1767–1822): Won a lottery, bought his freedom, built a church and planned an uprising. Hanged with 34 others.
- `nat_turner` **Nat Turner** (1800–1831): Preacher who saw signs in the sky. Two days in Southampton County in 1831 changed every law in the South.
- `robert_smalls` **Robert Smalls** (1839–1915): Steered a Confederate steamer out of Charleston harbor with his family aboard and handed it to the Union.
- `madam_cj_walker` **Madam C.J. Walker** (1867–1919): Orphaned laundress who built a hair-care company, thousands of sales agents and the first self-made fortune by an American woman.
- `paul_laurence_dunbar` **Paul Laurence Dunbar** (1872–1906): The first Black poet with a national audience. "We Wear the Mask." Dead of tuberculosis at 33.
- `scott_joplin` **Scott Joplin** (1868–1917): The King of Ragtime. "Maple Leaf Rag" sold a million copies; his opera waited sixty years for a stage.
- `claudette_colvin` **Claudette Colvin** (1939–): Fifteen years old, Montgomery, March 1955. Nine months before Rosa Parks, she refused to move and was dragged off the bus.
- `bass_reeves` **Bass Reeves** (1838–1910): Born enslaved, fluent in several Native languages, one of the first Black deputy U.S. Marshals west of the Mississippi. Three thousand arrests, never wounded.
- `neighbor_kid` **Neighbor Kid** (Any afternoon): Somebody's nephew. Runs the errand, holds the door, sees everything and tells his grandmother.

### events (3)

- `the_ancestors` **The Ancestors**: Never in a deck. In one match out of four they come to whoever holds three Characters Inside at Accra, Ghana.
- `word_of_mouth` **Word of Mouth**: Free, fast and usually right.
- `persuade` **Persuade**: Everybody has a price, a grievance or a cousin. Find the one that opens the door.

### threats (0)

- none


### locations (3)

- `justice_system` **The Justice System** (1865–): The Thirteenth Amendment kept one exception, "as a punishment for crime." Convict leasing, chain gangs and mass incarceration have run on it ever since.
- `the_tabernacle` **The Tabernacle** (1794–): Mother Bethel, Philadelphia, 1794: Richard Allen walked out rather than pray in the back. The Black church has been meeting house, school, bank and headquarters ever since.
- `montgomery` **Montgomery, Alabama** (1955–1956): For 381 days the buses ran empty. Forty thousand people walked, carpooled and waited, and the seats stopped being the point.

## Have

- characters: anansi, bessie_coleman, black_jesus, chairteenth, cookout, frederick_douglass, harriet_tubman, ida_b_wells, john_brown, karen, katherine_johnson, mami_wata, mansa_musa, marcus_garvey, og, ogun, organizer, oshun, pullman_porter, queen_nzinga, shango, sojourner_truth, toussaint_louverture, victor_hugo_green, yemoja, zora_neale_hurston
- events: community_defense, reparations
- threats: comfortable_complicity, housing_restriction, mob, paddy_roller, segregationist_patrol
- locations: accra_ghana, black_star, gary_indiana, great_migration, greenwood, harpers_ferry, juneteenth, lagos, sundown_town

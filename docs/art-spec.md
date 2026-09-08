# Art spec

How every image is used, what to deliver, and what is still missing. File names are the ids in backticks; drop finished files in `public/art/<kind>/<id>.jpg` (the build inlines them).

## Sizes and framing

| Kind | Deliver | Stored as | Where it shows | Framing |
|---|---|---|---|---|
| Character | 1024×1024 or larger, square | 512×512 JPG | Hand card (the top 5:5 of the card), Gate tile (square), Inside tile (small square, about 40 px on phones), avatar (circle crop of the center) | Head and shoulders, face in the upper-middle third, eyes about 40% down. Plain or softly lit background. No text, no frame. Must read at 40 px. |
| Threat | 1024×1024 square | 512×512 JPG | Threat chip (18 px round thumb), Threat sheet (220 px), confront animation | One clear silhouette, high contrast, a single strong color per Threat so the thumb is recognizable. Menace without gore. |
| Event | 1024×1024 square | 512×512 JPG | Hand card, card sheet | Same crop as Characters; scene rather than portrait. |
| Location (night) | Same as Location, file name `<id>_night` | 1024×1024 JPG | Only for Locations with a curfew (Sundown Town). Replaces the background on even turns, when the curfew is on. | Same composition as the day image so the swap reads as time passing, not a new place: moon or lamplight, windows lit, streets empty, the town shut. |
| Location | 1536×1536 square (1024 minimum) | 1024×1024 JPG | Full background of the Location panel under a dark gradient. Desktop crops to about 3:2 landscape, phones crop to a tall portrait. | Keep the subject inside the central 50% both ways so both crops keep it. Wide establishing shot, no people in the foreground, no text or signage that must be legible. Mid-tone, not dark: we darken it. Low fine detail, because a rule box and character tiles sit on top of it. |

Format: PNG or JPG, sRGB, no transparency, no borders, no watermark, no typography. Consistent painterly style across a kind so the board reads as one set.

## Confrontation art (the Mob and the other bad guys)

Confronting a Threat should feel like a showdown. To stage it we want, per Threat:

- The portrait above (square) for the chip and the sheet.
- A second **wide** image, 1536×768, of the same Threat as a scene: the Mob filling a street, the Paddy Roller on horseback at a tree line, the Patrol at a checkpoint, the Complicit neighbor behind a curtain, the Restriction as a covenant document and a locked gate. This becomes the backdrop of the confront animation and of the Threat sheet.
- Same palette per Threat as its portrait (one signature color each) so the two images pair.

## Missing

### characters (36)

- `john_russwurm` **John Russwurm** (1799–1851): Co-founded Freedom's Journal in 1827, the first Black-owned newspaper in the United States. "We wish to plead our own cause."
- `alonzo_herndon` **Alonzo Herndon** (1858–1927): Born enslaved, built the finest barbershop in Atlanta and then Atlanta Life Insurance. Everybody passed through his chairs.
- `callie_house` **Callie House** (1861–1928): A Nashville washerwoman who built a 300,000-member movement demanding pensions for the formerly enslaved. The government jailed her for it.
- `richard_allen` **Richard Allen** (1760–1831): Bought his own freedom, walked out of a segregated church and built his own denomination.
- `absalom_jones` **Absalom Jones** (1746–1818): Bought his wife's freedom before his own. First Black priest in the Episcopal Church.
- `daniel_payne` **Daniel Payne** (1811–1893): Ran a school for Black children in Charleston until the state outlawed it. Later ran a university.
- `henry_mcneal_turner` **Henry McNeal Turner** (1834–1915): Army chaplain, Georgia legislator expelled for being Black, AME bishop who told his people to leave.
- `denmark_vesey` **Denmark Vesey** (c. 1767–1822): Won a lottery, bought his freedom, built a church and planned an uprising. Hanged with 34 others.
- `robert_smalls` **Robert Smalls** (1839–1915): Steered a Confederate steamer out of Charleston harbor with his family aboard and handed it to the Union.
- `madam_cj_walker` **Madam C.J. Walker** (1867–1919): Orphaned laundress who built a hair-care company, thousands of sales agents and the first self-made fortune by an American woman.
- `paul_laurence_dunbar` **Paul Laurence Dunbar** (1872–1906): The first Black poet with a national audience. "We Wear the Mask." Dead of tuberculosis at 33.
- `scott_joplin` **Scott Joplin** (1868–1917): The King of Ragtime. "Maple Leaf Rag" sold a million copies; his opera waited sixty years for a stage.
- `claudette_colvin` **Claudette Colvin** (1939–): Fifteen years old, Montgomery, March 1955. Nine months before Rosa Parks, she refused to move and was dragged off the bus.
- `bass_reeves` **Bass Reeves** (1838–1910): Born enslaved, fluent in several Native languages, one of the first Black deputy U.S. Marshals west of the Mississippi. Three thousand arrests, never wounded.
- `bud_billiken` **Bud Billiken** (Chicago Defender, 1923): The Chicago Defender's mascot for its children's page: guardian of every Black kid, dreamed up in 1923.
- `roger_taney` **Roger Taney** (1777–1864): Chief Justice who wrote Dred Scott: Black people had "no rights which the white man was bound to respect." Useful to whoever plays him for a turn, then a liability to whoever is winning.
- `bud_billiken_parade` **Bud Billiken Parade** (Chicago, 1929–): The Defender's parade for the kids of the South Side, every August since 1929: the largest African American parade in the country.
- `peter_prioleau` **Peter Prioleau** (Charleston, 1822): The enslaved cook who told his master about the Vesey plot. Freed by the state for it, with a pension.
- `george_wilson` **George Wilson** (Charleston, 1822): A class leader in the African church who confirmed the plot to his master. Freed, and never at peace with it.
- `pharoah_and_tom` **Pharoah and Tom** (Richmond, 1800): Two enslaved men on Mosby Sheppard's place who gave up Gabriel's rising on the day it was to begin.
- `ben_woolfolk` **Ben Woolfolk** (Richmond, 1800): A recruiter for Gabriel's rising who turned state's witness and testified against the men he had enlisted.
- `edmonia_lewis` **Edmonia Lewis** (1844–1907): Sculptor of Ojibwe and Haitian descent who carved Forever Free and The Death of Cleopatra in Rome, on her own terms.
- `henry_ossawa_tanner` **Henry Ossawa Tanner** (1859–1937): Painter of The Banjo Lesson and The Annunciation; son of an AME bishop, first Black artist honored by the Paris Salon.
- `robert_duncanson` **Robert Duncanson** (1821–1872): Hudson River School painter of the Ohio valley; the first Black artist to win an international reputation.
- `edward_bannister` **Edward Bannister** (1828–1901): Providence landscape painter whose Under the Oaks won the 1876 Centennial medal; the judges tried to revoke it when they saw who he was.
- `harriet_powers` **Harriet Powers** (1837–1910): Quilter from Athens, Georgia, whose two surviving story quilts hang in the Smithsonian and the Museum of Fine Arts, Boston.
- `dave_the_potter` **David Drake** (c. 1801–c. 1875): "Dave the Potter" of Edgefield, South Carolina: an enslaved man who signed, dated and wrote verses on forty-gallon jars when literacy was a crime.
- `booker_t_washington` **Booker T. Washington** (1856–1915): Built Tuskegee from a shanty and a church into a campus the students made with their own hands.
- `george_washington_carver` **George Washington Carver** (c. 1864–1943): Taught the South to rest its soil and found three hundred uses for the peanut.
- `marie_laveau` **Marie Laveau** (1801–1881): Hairdresser, healer and the most consulted woman in New Orleans.
- `nanny_of_the_maroons` **Nanny of the Maroons** (c. 1686–1755): Led the Windward Maroons from the Blue Mountains and held off the British for a decade.
- `nehanda` **Nehanda Nyakasikana** (c. 1840–1898): Spirit medium of the Shona who told the colonial court her bones would rise again.
- `boukman_dutty` **Boukman Dutty** (d. 1791): The Bois Caïman ceremony, and a week later the north of Saint-Domingue was burning.
- `cecile_fatiman` **Cécile Fatiman** (c. 1771–1883): The mambo at Bois Caïman. Lived to be over a hundred and saw the republic she helped start.
- `ayuba_suleiman_diallo` **Ayuba Suleiman Diallo** (1701–1773): Wrote a letter in Arabic from a Maryland tobacco farm and it carried him home.
- `omar_ibn_said` **Omar ibn Said** (c. 1770–1864): Twenty-five years a scholar in Futa Toro, fifty-six years enslaved in Carolina, and he kept writing.

### events (2)

- `the_ancestors` **The Ancestors**: Never in a deck. In one match out of four they come to whoever holds three Characters Inside at Accra, Ghana.
- `word_of_mouth` **Word of Mouth**: Free, fast and usually right. It travels further where more of your people are.

### threats (1)

- `dewolf_trade` **The DeWolf Trade**: The DeWolfs of Bristol, Rhode Island, ran more slaving voyages than any family in American history: about ninety between 1769 and 1820, some ten thousand people. James DeWolf kept at it after the 1808 ban, sat in the United States Senate, and died one of the richest men in the country.

### locations (6)

- `middle_passage` **The Middle Passage** (Atlantic, 1526–1867): Twelve and a half million people were carried across the Atlantic in chains. Nearly two million did not survive the voyage.
- `charleston_1822` **Charleston, 1822** (South Carolina, 1822): Denmark Vesey's rising was set for July. Two informants ended it in June, and thirty-five people hanged.
- `justice_system` **The Justice System** (1865–): The Thirteenth Amendment kept one exception, "as a punishment for crime." Convict leasing, chain gangs and mass incarceration have run on it ever since.
- `the_tabernacle` **The Tabernacle** (1794–): Mother Bethel, Philadelphia, 1794: Richard Allen walked out rather than pray in the back. The Black church has been meeting house, school, bank and headquarters ever since.
- `montgomery` **Montgomery, Alabama** (1955–1956): For 381 days the buses ran empty. Forty thousand people walked, carpooled and waited, and the seats stopped being the point.
- `oak_bluffs` **Oak Bluffs** (Martha's Vineyard, 1912–): Shearer Cottage opened to Black guests in 1912 when the island's hotels would not. A century of summers followed: the Inkwell, the gingerbread cottages, families who came back every August.

### locations (night) (1)

- `sundown_town_night` **Sundown Town** (1890–1968): Night version of Sundown Town: same framing, after dark. Shown on even turns, when its curfew is on: the town shut, lamps lit, nobody out.

## Have

- characters: anansi, bessie_coleman, black_jesus, chairteenth, frederick_douglass, harriet_tubman, ida_b_wells, john_brown, katherine_johnson, mami_wata, mansa_musa, marcus_garvey, og, ogun, organizer, oshun, queen_nzinga, shango, sleeping_car_porters, sojourner_truth, toussaint_louverture, victor_hugo_green, yemoja, zora_neale_hurston
- events: community_defense, reparations
- threats: comfortable_complicity, housing_restriction, mob, paddy_roller, segregationist_patrol
- locations: accra_ghana, black_star, gary_indiana, great_migration, greenwood, harpers_ferry, juneteenth, lagos, sundown_town

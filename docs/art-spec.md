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

### characters (7)

- `cotton_club_orchestra` **The Cotton Club Orchestra** (Harlem, 1927–1940): The house band of the Cotton Club: Duke Ellington's orchestra from 1927 to 1931, Cab Calloway's after it. The club's radio wire carried them across the country.
- `yaa_asantewaa` **Yaa Asantewaa** (c. 1840–1921): Queen Mother of Ejisu who shamed the Asante chiefs into war in 1900 and besieged the British garrison in its fort at Kumasi for three months.
- `pharoah_and_tom` **Pharoah and Tom** (Richmond, 1800): Two enslaved men on Mosby Sheppard's place who gave up Gabriel's rising on the day it was to begin.
- `ben_woolfolk` **Ben Woolfolk** (Richmond, 1800): A recruiter for Gabriel's rising who turned state's witness and testified against the men he had enlisted.
- `edward_bannister` **Edward Bannister** (1828–1901): Providence landscape painter whose Under the Oaks won the 1876 Centennial medal; the judges tried to revoke it when they saw who he was.
- `dave_the_potter` **David Drake** (c. 1801–c. 1875): "Dave the Potter" of Edgefield, South Carolina: an enslaved man who signed, dated and wrote verses on forty-gallon jars when literacy was a crime.
- `george_washington_carver` **George Washington Carver** (c. 1864–1943): Taught the South to rest its soil and found three hundred uses for the peanut.

### events (3)

- `bois_caiman` **Bois Caïman**: A pig, an oath, a week. Then the north of Saint-Domingue burned.
- `the_ancestors` **The Ancestors**: Never in a deck. In one match out of four they come to whoever holds three Characters Inside at Accra, Ghana.
- `word_of_mouth` **Word of Mouth**: Free, fast and usually right. It travels further where more of your people are.

### threats (3)

- `dewolf_trade` **The DeWolf Trade**: The DeWolfs of Bristol, Rhode Island, ran more slaving voyages than any family in American history: about ninety between 1769 and 1820, some ten thousand people. James DeWolf kept at it after the 1808 ban, sat in the United States Senate, and died one of the richest men in the country.
- `color_line` **The Color Line**: The house rule at the Cotton Club: Black performers on the stage, a white audience at the tables, and Black patrons turned away at the door. The performers' own families could not buy a ticket to watch them.
- `land_office` **The Land Office**: The Homestead Act of 1862 offered 160 acres for five years of residence, to citizens, which Black Americans were not until 1866. The Southern Homestead Act then opened poor land for ten years through slow and hostile land offices; about four thousand Black families got through. On the Plains some 3,500 more proved up, at Nicodemus, DeWitty, Dearfield and Blackdom, out of 1.6 million homesteads in all.

### locations (10)

- `middle_passage` **The Middle Passage** (Atlantic, 1526–1867): Twelve and a half million people were carried across the Atlantic in chains, and ten and a half million landed. What they carried, they kept: the languages, the faiths, the stories, the songs.
- `charleston_1822` **Charleston, 1822** (South Carolina, 1822): Denmark Vesey's rising was set for July. Two informants ended it in June, and thirty-five people hanged.
- `justice_system` **The Justice System** (1865–): The Thirteenth Amendment kept one exception, "as a punishment for crime." Convict leasing, chain gangs and mass incarceration have run on it ever since.
- `the_tabernacle` **The Tabernacle** (1794–): Mother Bethel, Philadelphia, 1794: Richard Allen walked out rather than pray in the back. The Black church has been meeting house, school, bank and headquarters ever since.
- `montgomery` **Montgomery, Alabama** (1955–1956): For 381 days the buses ran empty. Forty thousand people walked, carpooled and waited, and the seats stopped being the point.
- `oak_bluffs` **Oak Bluffs** (Martha's Vineyard, 1912–): Shearer Cottage opened to Black guests in 1912 when the island's hotels would not. A century of summers followed: the Inkwell, the gingerbread cottages, families who came back every August.
- `the_stroll` **The Stroll** (Chicago, 1910s–20s): State Street from 26th to 39th, the Black Belt's night strip: theaters, cabarets, and everybody out walking.
- `jim_crow` **Jim Crow** (The South, 1877–1965): The laws and customs that sorted Southern life by race from the end of Reconstruction to the 1960s: separate schools, cars, counters and cemeteries, and a vote taken back by poll taxes, literacy tests and violence.
- `cotton_club` **The Cotton Club** (Harlem, 1923–1935): A Harlem nightclub at Lenox Avenue and 142nd Street: Black performers on the stage, a white audience at the tables, and the best band in the country broadcasting from the bandstand.
- `harlem_renaissance` **The Harlem Renaissance** (Harlem, 1918–1937): A generation of Black writers, painters, sculptors and musicians in one neighborhood, publishing, exhibiting and playing to each other and then to the world.

### locations (night) (1)

- `sundown_town_night` **Sundown Town** (1890–1968): Night version of Sundown Town: same framing, after dark. Shown on even turns, when its curfew is on: the town shut, lamps lit, nobody out.

## Have

- characters: abraham_lincoln, absalom_jones, alonzo_herndon, anansi, ayuba_suleiman_diallo, bass_reeves, bessie_coleman, black_jesus, booker_t_washington, boukman_dutty, bud_billiken, callie_house, cathay_williams, cecile_fatiman, chairteenth, charles_sumner, claudette_colvin, daniel_payne, david_ruggles, denmark_vesey, edmonia_lewis, elizabeth_freeman, frederick_douglass, george_wilson, harriet_powers, harriet_tubman, henry_mcneal_turner, henry_ossawa_tanner, ida_b_wells, james_lafayette, john_brown, john_russwurm, katherine_johnson, lewis_hayden, madam_cj_walker, mami_wata, mansa_musa, marcus_garvey, marie_laveau, mary_ann_shadd_cary, mary_ellen_pleasant, mary_seacole, menelik_ii, nanny_of_the_maroons, nehanda, og, ogun, omar_ibn_said, organizer, oshun, paul_laurence_dunbar, peter_prioleau, queen_nzinga, richard_allen, robert_duncanson, robert_smalls, roger_taney, samuel_ajayi_crowther, scott_joplin, shango, sleeping_car_porters, sojourner_truth, taytu_betul, thaddeus_stevens, tom_bass, toussaint_louverture, victor_hugo_green, william_lloyd_garrison, william_parker, william_still, yemoja, zora_neale_hurston, zumbi_dos_palmares
- events: community_defense, reparations
- threats: comfortable_complicity, dred_scott, housing_restriction, mob, paddy_roller, segregationist_patrol
- locations: accra_ghana, black_star, gary_indiana, great_migration, greenwood, harpers_ferry, juneteenth, lagos, sundown_town

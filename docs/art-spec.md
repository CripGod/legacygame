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

### characters (0)

- none


### events (1)

- `word_of_mouth` **Word of Mouth**: Free, fast and usually right. It travels further where more of your people are.

### threats (0)

- none


### locations (0)

- none


### locations (night) (0)

- none


## Have

- characters: abraham_lincoln, absalom_jones, alonzo_herndon, anansi, ayuba_suleiman_diallo, bass_reeves, ben_woolfolk, bessie_coleman, black_jesus, booker_t_washington, boukman_dutty, bud_billiken, callie_house, cathay_williams, cecile_fatiman, chairteenth, charles_sumner, claudette_colvin, cotton_club_orchestra, daniel_payne, dave_the_potter, david_ruggles, denmark_vesey, edmonia_lewis, edward_bannister, elizabeth_freeman, frederick_douglass, george_washington_carver, george_wilson, harriet_powers, harriet_tubman, henry_mcneal_turner, henry_ossawa_tanner, ida_b_wells, james_lafayette, john_brown, john_russwurm, katherine_johnson, lewis_hayden, madam_cj_walker, mami_wata, mansa_musa, marcus_garvey, marie_laveau, mary_ann_shadd_cary, mary_ellen_pleasant, mary_seacole, menelik_ii, nanny_of_the_maroons, nehanda, og, ogun, omar_ibn_said, organizer, oshun, paul_laurence_dunbar, peter_prioleau, pharoah_and_tom, queen_nzinga, richard_allen, robert_duncanson, robert_smalls, roger_taney, samuel_ajayi_crowther, scott_joplin, shango, sleeping_car_porters, sojourner_truth, taytu_betul, thaddeus_stevens, tom_bass, toussaint_louverture, victor_hugo_green, william_lloyd_garrison, william_parker, william_still, yaa_asantewaa, yemoja, zora_neale_hurston, zumbi_dos_palmares
- events: bois_caiman, community_defense, reparations, the_ancestors
- threats: color_line, comfortable_complicity, dewolf_trade, dred_scott, housing_restriction, land_office, mob, paddy_roller, segregationist_patrol
- locations: accra_ghana, black_star, charleston_1822, cotton_club, gary_indiana, great_migration, greenwood, harlem_renaissance, harpers_ferry, jim_crow, juneteenth, justice_system, lagos, middle_passage, montgomery, oak_bluffs, sundown_town, sundown_town_night, the_stroll, the_tabernacle

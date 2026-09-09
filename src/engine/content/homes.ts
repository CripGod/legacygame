/**
 * Home ground: the Location on the board where each Character's story happened. A Character at a
 * home Location counts +1 Influence there (an Informant counts one more against the side that holds
 * it). Where the real place is not on the board, the nearest defensible one is chosen and the note
 * says so plainly; those entries are marked `thematic`.
 */
export interface HomeGround {
  locations: string[];
  /** One line on why this is home, shown on the card. */
  why: string;
  /** The tie is by theme, not by place: the true place is not on the board. */
  thematic?: boolean;
}

export const HOMES: Record<string, HomeGround> = {
  harriet_tubman: { locations: ['harpers_ferry'], why: 'She helped Brown plan the raid and raised recruits for it; illness kept her from the night itself.' },
  frederick_douglass: { locations: ['harpers_ferry'], why: 'Brown asked him to join, at a Chambersburg quarry weeks before the raid. He refused, was implicated anyway, and fled to Canada.' },
  john_brown: { locations: ['harpers_ferry'], why: 'October 16, 1859: the armory raid.' },
  katherine_johnson: { locations: ['black_star'], why: 'No launch pad on this board; the one vessel with a plotted course is the Black Star.', thematic: true },
  mansa_musa: { locations: ['lagos', 'accra_ghana'], why: 'Mali is not on the board; West Africa is as close as it comes.', thematic: true },
  zora_neale_hurston: { locations: ['great_migration'], why: 'Eatonville to Harlem in the Migration years, then back South to collect the folklore.' },
  john_russwurm: { locations: ['black_star'], why: 'Emigrated to Liberia in 1829, ninety years before Garvey bought ships.' },
  alonzo_herndon: { locations: ['greenwood'], why: 'Auburn Avenue was Atlanta\'s Greenwood: his barbershop and his insurance company anchored a Black business district.' },
  callie_house: { locations: ['justice_system'], why: 'Sued the Treasury for $68 million in ex-slave pensions in 1915. The government jailed her for it.' },
  richard_allen: { locations: ['the_tabernacle'], why: 'Mother Bethel, Philadelphia, 1794.' },
  absalom_jones: { locations: ['the_tabernacle'], why: 'The Free African Society, 1787; St. Thomas African Episcopal Church, 1794.' },
  daniel_payne: { locations: ['the_tabernacle'], why: 'AME bishop; he bought Wilberforce University for the church in 1863.' },
  henry_mcneal_turner: { locations: ['the_tabernacle'], why: 'AME bishop; the pulpit is where he preached emigration. (His ship bonus is his own ability.)' },
  denmark_vesey: { locations: ['charleston_1822'], why: 'His plot. His gallows.' },
  nat_turner: { locations: ['harpers_ferry'], why: 'Southampton County, Virginia, 1831: the rising John Brown studied.', thematic: true },
  robert_smalls: { locations: ['charleston_1822'], why: 'Charleston harbor, 1862: he sailed the Planter past the forts to the Union fleet.' },
  madam_cj_walker: { locations: ['great_migration'], why: 'St. Louis, Denver, Indianapolis, Harlem: her company moved with the Migration.' },
  paul_laurence_dunbar: { locations: ['great_migration'], why: 'His parents fled Kentucky for Dayton a generation before the Migration proper.', thematic: true },
  scott_joplin: { locations: ['juneteenth'], why: 'Born in Texas in 1868, three years after Galveston.', thematic: true },
  claudette_colvin: { locations: ['montgomery'], why: 'March 2, 1955: she would not give up her seat, nine months before Rosa Parks.' },
  bass_reeves: { locations: ['justice_system'], why: 'Deputy U.S. Marshal for Judge Parker\'s court at Fort Smith for thirty-two years.' },
  bud_billiken: { locations: ['great_migration'], why: 'The Chicago Defender, the paper that called the Migration north.' },
  roger_taney: { locations: ['justice_system'], why: 'Dred Scott v. Sandford, 1857.' },
  sleeping_car_porters: { locations: ['great_migration'], why: 'They carried the Defender south in their bags and organized in Chicago in 1925.' },
  organizer: { locations: ['montgomery'], why: '381 days of car pools: organizing at its finest.' },
  og: { locations: ['greenwood'], why: 'Every neighborhood has one. On this board the neighborhood is Greenwood.', thematic: true },
  victor_hugo_green: { locations: ['sundown_town'], why: 'The Green Book existed because of towns like this one: it told travelers where they could stop and where they must not.' },
  ida_b_wells: { locations: ['great_migration'], why: 'Run out of Memphis in 1892, she made Chicago the base of the anti-lynching crusade.' },
  queen_nzinga: { locations: ['middle_passage'], why: 'Fought the Portuguese at Luanda, the port that fed the Atlantic trade, for thirty years.' },
  toussaint_louverture: { locations: ['charleston_1822'], why: 'Vesey\'s men looked to Haiti and planned to sail there; Toussaint\'s revolution was their proof it could be done.', thematic: true },
  marcus_garvey: { locations: ['black_star'], why: 'His ship.' },
  bessie_coleman: { locations: ['great_migration'], why: 'Texas to Chicago in 1915, a manicurist on the Stroll until France would teach her to fly.' },
  sojourner_truth: { locations: ['justice_system'], why: '1828: she sued for her son Peter\'s return from Alabama and won.' },
  anansi: { locations: ['accra_ghana'], why: 'Akan. The spider is from Ghana.' },
  shango: { locations: ['lagos'], why: 'Yoruba. Lagos is a Yoruba city.' },
  oshun: { locations: ['lagos'], why: 'Yoruba. Lagos is a Yoruba city.' },
  yemoja: { locations: ['lagos'], why: 'Yoruba. Lagos is a Yoruba city.' },
  ogun: { locations: ['lagos'], why: 'Yoruba. Lagos is a Yoruba city.' },
  mami_wata: { locations: ['lagos', 'middle_passage'], why: 'A water spirit on both sides of the Atlantic.' },
  black_jesus: { locations: ['the_tabernacle'], why: 'The church.' },
  the_stroll: { locations: ['great_migration'], why: 'State Street, Chicago, in the Migration years.' },
  chairteenth: { locations: ['juneteenth'], why: 'The name says it.' },
  peter_prioleau: { locations: ['charleston_1822'], why: 'The plot he told.' },
  george_wilson: { locations: ['charleston_1822'], why: 'The plot he told.' },
  pharoah_and_tom: { locations: ['justice_system'], why: 'Their word in the Richmond trials of 1800 hanged Gabriel\'s men.' },
  ben_woolfolk: { locations: ['justice_system'], why: 'He turned state\'s evidence in the Richmond trials of 1800 and hanged his friends.' },
  edmonia_lewis: { locations: ['juneteenth'], why: 'Forever Free, 1867: emancipation carved in marble.' },
  henry_ossawa_tanner: { locations: ['the_tabernacle'], why: 'Son of an AME bishop; the paintings are the church\'s.' },
  robert_duncanson: { locations: ['harpers_ferry'], why: 'Cincinnati\'s abolitionists were his patrons; the Anti-Slavery League bought his work. Harpers Ferry is the board\'s abolition ground.', thematic: true },
  edward_bannister: { locations: ['oak_bluffs'], why: 'A sailor who painted the New England shore.', thematic: true },
  harriet_powers: { locations: ['juneteenth'], why: 'Born enslaved in Georgia in 1837; the Bible quilts were a freedwoman\'s work.' },
  dave_the_potter: { locations: ['charleston_1822'], why: 'Edgefield, South Carolina: the same state, the same decades, and a signed name where the law forbade it.', thematic: true },
  booker_t_washington: { locations: ['montgomery'], why: 'Tuskegee, forty miles up the road.' },
  george_washington_carver: { locations: ['montgomery'], why: 'Tuskegee, forty miles up the road.' },
  marie_laveau: { locations: ['the_tabernacle'], why: 'Mass at St. Louis Cathedral by morning, her own rites by night.', thematic: true },
  nanny_of_the_maroons: { locations: ['middle_passage'], why: 'Her people walked off the plantations the ships fed, and beat the army sent after them.', thematic: true },
  nehanda: { locations: ['accra_ghana'], why: 'Her 1896 rising was a forerunner of the independence Accra won in 1957.', thematic: true },
  boukman_dutty: { locations: ['charleston_1822'], why: 'Bois Caïman is not on the board; Vesey\'s men planned to sail to the Haiti it made.', thematic: true },
  cecile_fatiman: { locations: ['charleston_1822'], why: 'Bois Caïman is not on the board; Vesey\'s men planned to sail to the Haiti it made.', thematic: true },
  ayuba_suleiman_diallo: { locations: ['middle_passage'], why: 'Trafficked from Senegambia to Maryland in 1731; he wrote his way home.' },
  omar_ibn_said: { locations: ['charleston_1822'], why: 'Shipped into Charleston in 1807.' },
};

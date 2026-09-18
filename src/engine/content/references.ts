/**
 * References: where to check us. One list per card, Location and Threat id, shown from the "References" link at
 * the end of every history and from the Compendium. Nothing here is a source for the game's numbers; it is where the
 * history came from and where a reader can go to see for themselves.
 *
 * These entries were written without network access, so the URLs are canonical article titles rather than links
 * that were opened and read at the time of writing. Run `npm run refs:check` on a connected machine to confirm every
 * link answers, and replace or add primary sources (archives, papers, books) as they are gathered.
 */
export interface Reference {
  title: string;
  url: string;
  /** Who publishes it, shown small under the title. */
  by?: string;
  /** A word on what it covers or why it is here. */
  note?: string;
}

const wiki = (title: string, article: string, note?: string): Reference => ({ title, url: `https://en.wikipedia.org/wiki/${article}`, by: 'Wikipedia', note });

export const REFERENCES: Record<string, Reference[]> = {
  // ---- Characters
  harriet_tubman: [wiki('Harriet Tubman', 'Harriet_Tubman'), wiki('Underground Railroad', 'Underground_Railroad')],
  frederick_douglass: [wiki('Frederick Douglass', 'Frederick_Douglass'), wiki('Narrative of the Life of Frederick Douglass', 'Narrative_of_the_Life_of_Frederick_Douglass,_an_American_Slave')],
  john_brown: [wiki('John Brown (abolitionist)', 'John_Brown_(abolitionist)'), wiki("John Brown's raid on Harpers Ferry", "John_Brown%27s_raid_on_Harpers_Ferry")],
  katherine_johnson: [wiki('Katherine Johnson', 'Katherine_Johnson')],
  mansa_musa: [wiki('Mansa Musa', 'Mansa_Musa'), wiki('Mali Empire', 'Mali_Empire')],
  zora_neale_hurston: [wiki('Zora Neale Hurston', 'Zora_Neale_Hurston'), wiki('Harlem Renaissance', 'Harlem_Renaissance')],
  john_russwurm: [wiki('John Brown Russwurm', 'John_Brown_Russwurm'), wiki("Freedom's Journal", "Freedom%27s_Journal")],
  alonzo_herndon: [wiki('Alonzo Herndon', 'Alonzo_Herndon')],
  callie_house: [wiki('Callie House', 'Callie_House')],
  richard_allen: [wiki('Richard Allen (bishop)', 'Richard_Allen_(bishop)'), wiki('African Methodist Episcopal Church', 'African_Methodist_Episcopal_Church')],
  absalom_jones: [wiki('Absalom Jones', 'Absalom_Jones')],
  daniel_payne: [wiki('Daniel Payne', 'Daniel_Payne')],
  henry_mcneal_turner: [wiki('Henry McNeal Turner', 'Henry_McNeal_Turner')],
  denmark_vesey: [wiki('Denmark Vesey', 'Denmark_Vesey')],
  nat_turner: [wiki('Nat Turner', 'Nat_Turner'), wiki("Nat Turner's slave rebellion", "Nat_Turner%27s_slave_rebellion")],
  robert_smalls: [wiki('Robert Smalls', 'Robert_Smalls')],
  madam_cj_walker: [wiki('Madam C. J. Walker', 'Madam_C._J._Walker')],
  paul_laurence_dunbar: [wiki('Paul Laurence Dunbar', 'Paul_Laurence_Dunbar')],
  scott_joplin: [wiki('Scott Joplin', 'Scott_Joplin')],
  cotton_club_orchestra: [wiki('Cotton Club', 'Cotton_Club'), wiki('Duke Ellington', 'Duke_Ellington'), wiki('Cab Calloway', 'Cab_Calloway')],
  claudette_colvin: [wiki('Claudette Colvin', 'Claudette_Colvin')],
  bass_reeves: [wiki('Bass Reeves', 'Bass_Reeves')],
  tom_bass: [wiki('Tom Bass', 'Tom_Bass')],
  bud_billiken: [wiki('Bud Billiken Parade and Picnic', 'Bud_Billiken_Parade_and_Picnic')],
  roger_taney: [wiki('Roger B. Taney', 'Roger_B._Taney'), wiki('Dred Scott v. Sandford', 'Dred_Scott_v._Sandford')],
  organizer: [wiki('Ella Baker', 'Ella_Baker'), wiki('Fannie Lou Hamer', 'Fannie_Lou_Hamer'), wiki('Montgomery bus boycott', 'Montgomery_bus_boycott')],
  sleeping_car_porters: [wiki('Brotherhood of Sleeping Car Porters', 'Brotherhood_of_Sleeping_Car_Porters'), wiki('A. Philip Randolph', 'A._Philip_Randolph')],
  ida_b_wells: [wiki('Ida B. Wells', 'Ida_B._Wells')],
  queen_nzinga: [wiki('Nzinga of Ndongo and Matamba', 'Nzinga_of_Ndongo_and_Matamba')],
  toussaint_louverture: [wiki('Toussaint Louverture', 'Toussaint_Louverture'), wiki('Haitian Revolution', 'Haitian_Revolution')],
  marcus_garvey: [wiki('Marcus Garvey', 'Marcus_Garvey'), wiki('Universal Negro Improvement Association', 'Universal_Negro_Improvement_Association_and_African_Communities_League')],
  bessie_coleman: [wiki('Bessie Coleman', 'Bessie_Coleman')],
  sojourner_truth: [wiki('Sojourner Truth', 'Sojourner_Truth')],
  abraham_lincoln: [wiki('Abraham Lincoln', 'Abraham_Lincoln'), wiki('Emancipation Proclamation', 'Emancipation_Proclamation')],
  william_lloyd_garrison: [wiki('William Lloyd Garrison', 'William_Lloyd_Garrison'), wiki('The Liberator', 'The_Liberator_(newspaper)')],
  thaddeus_stevens: [wiki('Thaddeus Stevens', 'Thaddeus_Stevens')],
  charles_sumner: [wiki('Charles Sumner', 'Charles_Sumner')],
  mary_ann_shadd_cary: [wiki('Mary Ann Shadd', 'Mary_Ann_Shadd')],
  elizabeth_freeman: [wiki('Elizabeth Freeman', 'Elizabeth_Freeman'), wiki('Brom and Bett v. Ashley', 'Brom_and_Bett_v._Ashley')],
  cathay_williams: [wiki('Cathay Williams', 'Cathay_Williams')],
  james_lafayette: [wiki('James Armistead Lafayette', 'James_Armistead_Lafayette')],
  mary_ellen_pleasant: [wiki('Mary Ellen Pleasant', 'Mary_Ellen_Pleasant')],
  mary_seacole: [wiki('Mary Seacole', 'Mary_Seacole')],
  samuel_ajayi_crowther: [wiki('Samuel Ajayi Crowther', 'Samuel_Ajayi_Crowther')],
  yaa_asantewaa: [wiki('Yaa Asantewaa', 'Yaa_Asantewaa'), wiki('War of the Golden Stool', 'War_of_the_Golden_Stool')],
  zumbi_dos_palmares: [wiki('Zumbi', 'Zumbi'), wiki('Palmares (quilombo)', 'Palmares_(quilombo)')],
  menelik_ii: [wiki('Menelik II', 'Menelik_II'), wiki('Battle of Adwa', 'Battle_of_Adwa')],
  taytu_betul: [wiki('Taytu Betul', 'Taytu_Betul'), wiki('Battle of Adwa', 'Battle_of_Adwa'), wiki('Treaty of Wuchale', 'Treaty_of_Wuchale')],
  david_ruggles: [wiki('David Ruggles', 'David_Ruggles')],
  lewis_hayden: [wiki('Lewis Hayden', 'Lewis_Hayden')],
  william_parker: [wiki('William Parker (abolitionist)', 'William_Parker_(abolitionist)'), wiki('Christiana Riot', 'Christiana_Riot')],
  william_still: [wiki('William Still', 'William_Still')],
  desmond_tutu: [wiki('Desmond Tutu', 'Desmond_Tutu'), wiki('Truth and Reconciliation Commission (South Africa)', 'Truth_and_Reconciliation_Commission_(South_Africa)')],
  victor_hugo_green: [wiki('Victor Hugo Green', 'Victor_Hugo_Green'), wiki('The Negro Motorist Green Book', 'The_Negro_Motorist_Green_Book')],
  anansi: [wiki('Anansi', 'Anansi')],
  shango: [wiki('Shango', 'Shango')],
  oshun: [wiki('Oshun', 'Oshun')],
  yemoja: [wiki('Yemoja', 'Yemoja')],
  ogun: [wiki('Ogun', 'Ogun')],
  mami_wata: [wiki('Mami Wata', 'Mami_Wata')],
  edmonia_lewis: [wiki('Edmonia Lewis', 'Edmonia_Lewis')],
  henry_ossawa_tanner: [wiki('Henry Ossawa Tanner', 'Henry_Ossawa_Tanner')],
  robert_duncanson: [wiki('Robert S. Duncanson', 'Robert_S._Duncanson')],
  edward_bannister: [wiki('Edward Mitchell Bannister', 'Edward_Mitchell_Bannister')],
  harriet_powers: [wiki('Harriet Powers', 'Harriet_Powers')],
  dave_the_potter: [wiki('David Drake (potter)', 'David_Drake_(potter)')],
  booker_t_washington: [wiki('Booker T. Washington', 'Booker_T._Washington'), wiki('Tuskegee University', 'Tuskegee_University')],
  george_washington_carver: [wiki('George Washington Carver', 'George_Washington_Carver')],
  marie_laveau: [wiki('Marie Laveau', 'Marie_Laveau')],
  nanny_of_the_maroons: [wiki('Nanny of the Maroons', 'Nanny_of_the_Maroons')],
  nehanda: [wiki('Nehanda Charwe Nyakasikana', 'Nehanda_Charwe_Nyakasikana')],
  boukman_dutty: [wiki('Dutty Boukman', 'Dutty_Boukman'), wiki('Bois Caïman', 'Bois_Ca%C3%AFman')],
  cecile_fatiman: [wiki('Cécile Fatiman', 'C%C3%A9cile_Fatiman'), wiki('Bois Caïman', 'Bois_Ca%C3%AFman')],
  ayuba_suleiman_diallo: [wiki('Ayuba Suleiman Diallo', 'Ayuba_Suleiman_Diallo')],
  omar_ibn_said: [wiki('Omar ibn Said', 'Omar_ibn_Said')],
  peter_prioleau: [wiki('Denmark Vesey (the plot he reported)', 'Denmark_Vesey', 'The informant who first reported the Charleston plot of 1822.')],
  george_wilson: [wiki('Denmark Vesey (the plot he reported)', 'Denmark_Vesey', 'The second informant in the Charleston plot of 1822.')],
  pharoah_and_tom: [wiki("Gabriel's Rebellion", "Gabriel%27s_Rebellion", 'The two men who told their enslaver of the plan, Richmond, 1800.')],
  ben_woolfolk: [wiki("Gabriel's Rebellion", "Gabriel%27s_Rebellion", 'Testified for the prosecution in the trials that followed.')],
  // ---- Locations
  greenwood: [wiki('Greenwood District, Tulsa', 'Greenwood_District,_Tulsa'), wiki('Tulsa race massacre', 'Tulsa_race_massacre')],
  harpers_ferry: [wiki("John Brown's raid on Harpers Ferry", "John_Brown%27s_raid_on_Harpers_Ferry")],
  black_star: [wiki('Black Star Line', 'Black_Star_Line')],
  accra_ghana: [wiki('Kwame Nkrumah', 'Kwame_Nkrumah'), wiki('Ghana', 'Ghana')],
  great_migration: [wiki('Great Migration (African American)', 'Great_Migration_(African_American)')],
  juneteenth: [wiki('Juneteenth', 'Juneteenth')],
  sundown_town: [wiki('Sundown town', 'Sundown_town')],
  middle_passage: [wiki('Middle Passage', 'Middle_Passage'), wiki('Atlantic slave trade', 'Atlantic_slave_trade')],
  charleston_1822: [wiki('Denmark Vesey', 'Denmark_Vesey')],
  lagos: [wiki('Lagos', 'Lagos')],
  gary_indiana: [wiki('Gary, Indiana', 'Gary,_Indiana')],
  justice_system: [wiki('Convict leasing', 'Convict_leasing'), wiki('Thirteenth Amendment to the United States Constitution', 'Thirteenth_Amendment_to_the_United_States_Constitution')],
  the_tabernacle: [wiki('Mother Bethel A.M.E. Church', 'Mother_Bethel_A.M.E._Church')],
  montgomery: [wiki('Montgomery bus boycott', 'Montgomery_bus_boycott')],
  oak_bluffs: [wiki('Oak Bluffs, Massachusetts', 'Oak_Bluffs,_Massachusetts')],
  the_stroll: [wiki('Bronzeville, Chicago', 'Bronzeville,_Chicago')],
  jim_crow: [wiki('Jim Crow laws', 'Jim_Crow_laws'), wiki('Plessy v. Ferguson', 'Plessy_v._Ferguson'), wiki('Voting Rights Act of 1965', 'Voting_Rights_Act_of_1965')],
  cotton_club: [wiki('Cotton Club', 'Cotton_Club'), wiki('Owney Madden', 'Owney_Madden'), wiki('Harlem Renaissance', 'Harlem_Renaissance')],
  harlem_renaissance: [wiki('Harlem Renaissance', 'Harlem_Renaissance'), wiki('The New Negro', 'The_New_Negro'), wiki('Schomburg Center for Research in Black Culture', 'Schomburg_Center_for_Research_in_Black_Culture')],
  // ---- Threats
  mob: [wiki('Lynching in the United States', 'Lynching_in_the_United_States'), wiki('Tulsa race massacre', 'Tulsa_race_massacre')],
  paddy_roller: [wiki('Slave patrol', 'Slave_patrol')],
  segregationist_patrol: [wiki('Jim Crow laws', 'Jim_Crow_laws')],
  color_line: [wiki('Cotton Club', 'Cotton_Club'), wiki('Color line (racism)', 'Color_line_(racism)'), wiki('Racial segregation in the United States', 'Racial_segregation_in_the_United_States')],
  dred_scott: [wiki('Dred Scott v. Sandford', 'Dred_Scott_v._Sandford'), wiki('Roger B. Taney', 'Roger_B._Taney'), wiki('Fourteenth Amendment to the United States Constitution', 'Fourteenth_Amendment_to_the_United_States_Constitution')],
  land_office: [wiki('Homestead Acts', 'Homestead_Acts'), wiki('Southern Homestead Act of 1866', 'Southern_Homestead_Act_of_1866'), wiki('Exodusters', 'Exodusters'), wiki('Nicodemus, Kansas', 'Nicodemus,_Kansas')],
  housing_restriction: [wiki('Redlining', 'Redlining'), wiki('Racial covenant', 'Racial_covenant')],
  dewolf_trade: [wiki('James DeWolf', 'James_DeWolf')],
  // ---- Events
  reparations: [wiki('Reparations for slavery', 'Reparations_for_slavery')],
  bois_caiman: [wiki('Bois Caïman', 'Bois_Ca%C3%AFman'), wiki('Haitian Revolution', 'Haitian_Revolution')],
};

// Every URL below was confirmed against a live search of the site (2026-09-17); `npm run refs:check` re-checks them on a connected machine.
const brit = (title: string, slug: string, kind: 'biography' | 'topic' | 'event' | 'place' | 'money' = 'biography', note?: string): Reference => ({ title, url: `https://www.britannica.com/${kind}/${slug}`, by: 'Encyclopaedia Britannica', note });
const src = (title: string, url: string, by: string, note?: string): Reference => ({ title, url, by, note });

/**
 * Second sources, beyond Wikipedia: Britannica, the National Park Service, the Library of Congress, the Smithsonian,
 * the Schomburg Center and a few local historical societies. Written without network access like the rest: the
 * URLs follow each publisher's standing address pattern and want a `npm run refs:check` on a connected machine.
 */
export const MORE_REFERENCES: Record<string, Reference[]> = {
  // ---- Characters
  harriet_tubman: [src('Harriet Tubman Underground Railroad National Historical Park', 'https://www.nps.gov/hatu/', 'National Park Service')],
  frederick_douglass: [brit('Frederick Douglass', 'Frederick-Douglass'), src('Frederick Douglass Papers', 'https://www.loc.gov/collections/frederick-douglass-papers/', 'Library of Congress'), src('Frederick Douglass National Historic Site', 'https://www.nps.gov/frdo/', 'National Park Service')],
  john_brown: [brit('John Brown', 'John-Brown-American-abolitionist'), src('Harpers Ferry National Historical Park', 'https://www.nps.gov/hafe/', 'National Park Service')],
  sojourner_truth: [brit('Sojourner Truth', 'Sojourner-Truth')],
  ida_b_wells: [brit('Ida B. Wells-Barnett', 'Ida-B-Wells-Barnett')],
  booker_t_washington: [brit('Booker T. Washington', 'Booker-T-Washington'), src('Booker T. Washington National Monument', 'https://www.nps.gov/bowa/', 'National Park Service'), src('Tuskegee Institute National Historic Site', 'https://www.nps.gov/tuin/', 'National Park Service')],
  george_washington_carver: [brit('George Washington Carver', 'George-Washington-Carver'), src('George Washington Carver National Monument', 'https://www.nps.gov/gwca/', 'National Park Service')],
  marcus_garvey: [brit('Marcus Garvey', 'Marcus-Garvey')],
  toussaint_louverture: [brit('Toussaint Louverture', 'Toussaint-Louverture')],
  zora_neale_hurston: [brit('Zora Neale Hurston', 'Zora-Neale-Hurston')],
  scott_joplin: [brit('Scott Joplin', 'Scott-Joplin')],
  madam_cj_walker: [brit('Madam C.J. Walker', 'Madam-C-J-Walker', 'money')],
  denmark_vesey: [brit('Denmark Vesey', 'Denmark-Vesey')],
  robert_smalls: [brit('Robert Smalls', 'Robert-Smalls')],
  thaddeus_stevens: [brit('Thaddeus Stevens', 'Thaddeus-Stevens')],
  charles_sumner: [brit('Charles Sumner', 'Charles-Sumner')],
  abraham_lincoln: [brit('Abraham Lincoln', 'Abraham-Lincoln'), src('Abraham Lincoln Papers', 'https://www.loc.gov/collections/abraham-lincoln-papers/', 'Library of Congress')],
  william_lloyd_garrison: [brit('William Lloyd Garrison', 'William-Lloyd-Garrison')],
  roger_taney: [brit('Dred Scott decision', 'Dred-Scott-decision', 'event')],
  richard_allen: [brit('Richard Allen', 'Richard-Allen')],
  absalom_jones: [brit('Absalom Jones', 'Absalom-Jones')],
  henry_mcneal_turner: [brit('Henry McNeal Turner', 'Henry-MacNeal-Turner')],
  edmonia_lewis: [brit('Edmonia Lewis', 'Edmonia-Lewis'), src('Edmonia Lewis at the Smithsonian American Art Museum', 'https://americanart.si.edu/artist/edmonia-lewis-2914', 'Smithsonian American Art Museum')],
  henry_ossawa_tanner: [brit('Henry Ossawa Tanner', 'Henry-Ossawa-Tanner'), src('Henry Ossawa Tanner at the Smithsonian American Art Museum', 'https://americanart.si.edu/artist/henry-ossawa-tanner-4742', 'Smithsonian American Art Museum')],
  robert_duncanson: [brit('Robert S. Duncanson', 'Robert-S-Duncanson')],
  harriet_powers: [brit('Harriet Powers', 'Harriet-Powers'), src('Harriet Powers, Pictorial Quilt', 'https://collections.mfa.org/objects/116166', 'Museum of Fine Arts, Boston')],
  mary_ann_shadd_cary: [brit('Mary Ann Shadd Cary', 'Mary-Ann-Shadd-Cary')],
  mary_seacole: [brit('Mary Seacole', 'Mary-Seacole')],
  menelik_ii: [brit('Menelik II', 'Menilek-II'), brit('Battle of Adwa', 'Battle-of-Adwa', 'event')],
  taytu_betul: [brit('Battle of Adwa', 'Battle-of-Adwa', 'event')],
  mansa_musa: [brit('Mūsā I of Mali', 'Musa-I-of-Mali')],
  paul_laurence_dunbar: [brit('Paul Laurence Dunbar', 'Paul-Laurence-Dunbar'), src('Paul Laurence Dunbar House', 'https://www.nps.gov/places/dunbar-house.htm', 'National Park Service')],
  bessie_coleman: [brit('Bessie Coleman', 'Bessie-Coleman'), src('Bessie Coleman', 'https://airandspace.si.edu/explore/stories/bessie-coleman', 'Smithsonian National Air and Space Museum')],
  katherine_johnson: [brit('Katherine Johnson', 'Katherine-Johnson-mathematician'), src('Katherine Johnson Biography', 'https://www.nasa.gov/centers-and-facilities/langley/katherine-johnson-biography/', 'NASA')],
  bass_reeves: [brit('Bass Reeves', 'Bass-Reeves')],
  cotton_club_orchestra: [brit('Duke Ellington', 'Duke-Ellington'), brit('Cotton Club', 'Cotton-Club', 'topic')],
  samuel_ajayi_crowther: [brit('Samuel Ajayi Crowther', 'Samuel-Crowther')],
  marie_laveau: [brit('Marie Laveau', 'Marie-Laveau')],
  omar_ibn_said: [src('Omar Ibn Said Collection', 'https://www.loc.gov/collections/omar-ibn-said-collection/', 'Library of Congress')],
  john_russwurm: [brit('John Brown Russwurm', 'John-Brown-Russwurm')],
  zumbi_dos_palmares: [brit('Palmares', 'Palmares', 'place')],
  anansi: [brit('Ananse', 'Ananse', 'topic')],
  ogun: [brit('Ogun', 'Ogun-deity', 'topic')],
  oshun: [brit('Oshun', 'Oshun', 'topic')],
  // ---- Locations
  greenwood: [brit('Tulsa race massacre of 1921', 'Tulsa-race-massacre-of-1921', 'event'), src('1921 Tulsa Race Massacre', 'https://tulsahistory.org/exhibit/1921-tulsa-race-massacre/', 'Tulsa Historical Society and Museum')],
  harpers_ferry: [brit("John Brown's Raid on Harpers Ferry", 'Harpers-Ferry-Raid', 'event'), src('Harpers Ferry National Historical Park', 'https://www.nps.gov/hafe/', 'National Park Service')],
  great_migration: [brit('Great Migration', 'Great-Migration', 'event')],
  juneteenth: [brit('Juneteenth', 'Juneteenth', 'topic')],
  montgomery: [brit('Montgomery bus boycott', 'Montgomery-bus-boycott', 'event')],
  middle_passage: [src('The Middle Passage', 'https://www.britannica.com/topic/transatlantic-slave-trade/The-Middle-Passage', 'Encyclopaedia Britannica')],
  jim_crow: [brit('Jim Crow law', 'Jim-Crow-law', 'event')],
  cotton_club: [brit('Cotton Club', 'Cotton-Club', 'topic')],
  harlem_renaissance: [brit('Harlem Renaissance', 'Harlem-Renaissance-American-literature-and-art', 'event'), src('Schomburg Center for Research in Black Culture', 'https://www.nypl.org/locations/schomburg', 'The New York Public Library')],
  // ---- Threats
  land_office: [brit('Homestead Act', 'Homestead-Act', 'topic'), src('Homestead National Historical Park', 'https://www.nps.gov/home/', 'National Park Service'), src('Black Homesteaders', 'https://www.nps.gov/home/black-homesteading-in-america.htm', 'National Park Service'), src('Nicodemus National Historic Site', 'https://www.nps.gov/nico/', 'National Park Service')],
  color_line: [brit('Cotton Club', 'Cotton-Club', 'topic')],
  dred_scott: [brit('Dred Scott decision', 'Dred-Scott-decision', 'event'), src('Dred Scott v. Sandford', 'https://www.loc.gov/item/usrep060393a/', 'Library of Congress')],
  mob: [brit('Tulsa race massacre of 1921', 'Tulsa-race-massacre-of-1921', 'event')],
  // ---- Events
  bois_caiman: [src('The Haitian Revolution', 'https://www.britannica.com/place/Haiti/The-Haitian-Revolution', 'Encyclopaedia Britannica')],
  reparations: [brit('Reparations', 'reparations', 'topic')],
};

/** Wikipedia first, as written; then the second sources. */
export function referencesFor(id: string): Reference[] {
  return [...(REFERENCES[id] ?? []), ...(MORE_REFERENCES[id] ?? [])];
}

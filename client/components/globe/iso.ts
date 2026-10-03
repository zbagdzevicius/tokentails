/**
 * ISO 3166-1 alpha-2 to ISO 3166-1 numeric, the ids world-atlas uses for its countries (plan F7.7:
 * the globe maps the snapshot's ISO `countryCode`s to world-atlas ids). Generated once from
 * world-countries 5.1.0 (ODbL); every id in world-atlas@2 countries-110m is covered except Kosovo,
 * which has no ISO code.
 */
export const ISO_ALPHA2_TO_NUMERIC: Readonly<Record<string, string>> = {
  AD:"020", AE:"784", AF:"004", AG:"028", AI:"660", AL:"008", AM:"051", AO:"024", AQ:"010", AR:"032",
  AS:"016", AT:"040", AU:"036", AW:"533", AX:"248", AZ:"031", BA:"070", BB:"052", BD:"050", BE:"056",
  BF:"854", BG:"100", BH:"048", BI:"108", BJ:"204", BL:"652", BM:"060", BN:"096", BO:"068", BQ:"535",
  BR:"076", BS:"044", BT:"064", BV:"074", BW:"072", BY:"112", BZ:"084", CA:"124", CC:"166", CD:"180",
  CF:"140", CG:"178", CH:"756", CI:"384", CK:"184", CL:"152", CM:"120", CN:"156", CO:"170", CR:"188",
  CU:"192", CV:"132", CW:"531", CX:"162", CY:"196", CZ:"203", DE:"276", DJ:"262", DK:"208", DM:"212",
  DO:"214", DZ:"012", EC:"218", EE:"233", EG:"818", EH:"732", ER:"232", ES:"724", ET:"231", FI:"246",
  FJ:"242", FK:"238", FM:"583", FO:"234", FR:"250", GA:"266", GB:"826", GD:"308", GE:"268", GF:"254",
  GG:"831", GH:"288", GI:"292", GL:"304", GM:"270", GN:"324", GP:"312", GQ:"226", GR:"300", GS:"239",
  GT:"320", GU:"316", GW:"624", GY:"328", HK:"344", HM:"334", HN:"340", HR:"191", HT:"332", HU:"348",
  ID:"360", IE:"372", IL:"376", IM:"833", IN:"356", IO:"086", IQ:"368", IR:"364", IS:"352", IT:"380",
  JE:"832", JM:"388", JO:"400", JP:"392", KE:"404", KG:"417", KH:"116", KI:"296", KM:"174", KN:"659",
  KP:"408", KR:"410", KW:"414", KY:"136", KZ:"398", LA:"418", LB:"422", LC:"662", LI:"438", LK:"144",
  LR:"430", LS:"426", LT:"440", LU:"442", LV:"428", LY:"434", MA:"504", MC:"492", MD:"498", ME:"499",
  MF:"663", MG:"450", MH:"584", MK:"807", ML:"466", MM:"104", MN:"496", MO:"446", MP:"580", MQ:"474",
  MR:"478", MS:"500", MT:"470", MU:"480", MV:"462", MW:"454", MX:"484", MY:"458", MZ:"508", NA:"516",
  NC:"540", NE:"562", NF:"574", NG:"566", NI:"558", NL:"528", NO:"578", NP:"524", NR:"520", NU:"570",
  NZ:"554", OM:"512", PA:"591", PE:"604", PF:"258", PG:"598", PH:"608", PK:"586", PL:"616", PM:"666",
  PN:"612", PR:"630", PS:"275", PT:"620", PW:"585", PY:"600", QA:"634", RE:"638", RO:"642", RS:"688",
  RU:"643", RW:"646", SA:"682", SB:"090", SC:"690", SD:"729", SE:"752", SG:"702", SH:"654", SI:"705",
  SJ:"744", SK:"703", SL:"694", SM:"674", SN:"686", SO:"706", SR:"740", SS:"728", ST:"678", SV:"222",
  SX:"534", SY:"760", SZ:"748", TC:"796", TD:"148", TF:"260", TG:"768", TH:"764", TJ:"762", TK:"772",
  TL:"626", TM:"795", TN:"788", TO:"776", TR:"792", TT:"780", TV:"798", TW:"158", TZ:"834", UA:"804",
  UG:"800", UM:"581", US:"840", UY:"858", UZ:"860", VA:"336", VC:"670", VE:"862", VG:"092", VI:"850",
  VN:"704", VU:"548", WF:"876", WS:"882", YE:"887", YT:"175", ZA:"710", ZM:"894", ZW:"716",
};

/** English short names, for the hover label and the screen-reader list. */
export const ISO_ALPHA2_NAMES: Readonly<Record<string, string>> = {
  AD:"Andorra", AE:"United Arab Emirates", AF:"Afghanistan", AG:"Antigua and Barbuda", AI:"Anguilla", AL:"Albania",
  AM:"Armenia", AO:"Angola", AQ:"Antarctica", AR:"Argentina", AS:"American Samoa", AT:"Austria",
  AU:"Australia", AW:"Aruba", AX:"Åland Islands", AZ:"Azerbaijan", BA:"Bosnia and Herzegovina", BB:"Barbados",
  BD:"Bangladesh", BE:"Belgium", BF:"Burkina Faso", BG:"Bulgaria", BH:"Bahrain", BI:"Burundi",
  BJ:"Benin", BL:"Saint Barthélemy", BM:"Bermuda", BN:"Brunei", BO:"Bolivia", BQ:"Caribbean Netherlands",
  BR:"Brazil", BS:"Bahamas", BT:"Bhutan", BV:"Bouvet Island", BW:"Botswana", BY:"Belarus",
  BZ:"Belize", CA:"Canada", CC:"Cocos (Keeling) Islands", CD:"DR Congo", CF:"Central African Republic", CG:"Republic of the Congo",
  CH:"Switzerland", CI:"Ivory Coast", CK:"Cook Islands", CL:"Chile", CM:"Cameroon", CN:"China",
  CO:"Colombia", CR:"Costa Rica", CU:"Cuba", CV:"Cape Verde", CW:"Curaçao", CX:"Christmas Island",
  CY:"Cyprus", CZ:"Czechia", DE:"Germany", DJ:"Djibouti", DK:"Denmark", DM:"Dominica",
  DO:"Dominican Republic", DZ:"Algeria", EC:"Ecuador", EE:"Estonia", EG:"Egypt", EH:"Western Sahara",
  ER:"Eritrea", ES:"Spain", ET:"Ethiopia", FI:"Finland", FJ:"Fiji", FK:"Falkland Islands",
  FM:"Micronesia", FO:"Faroe Islands", FR:"France", GA:"Gabon", GB:"United Kingdom", GD:"Grenada",
  GE:"Georgia", GF:"French Guiana", GG:"Guernsey", GH:"Ghana", GI:"Gibraltar", GL:"Greenland",
  GM:"Gambia", GN:"Guinea", GP:"Guadeloupe", GQ:"Equatorial Guinea", GR:"Greece", GS:"South Georgia",
  GT:"Guatemala", GU:"Guam", GW:"Guinea-Bissau", GY:"Guyana", HK:"Hong Kong", HM:"Heard Island and McDonald Islands",
  HN:"Honduras", HR:"Croatia", HT:"Haiti", HU:"Hungary", ID:"Indonesia", IE:"Ireland",
  IL:"Israel", IM:"Isle of Man", IN:"India", IO:"British Indian Ocean Territory", IQ:"Iraq", IR:"Iran",
  IS:"Iceland", IT:"Italy", JE:"Jersey", JM:"Jamaica", JO:"Jordan", JP:"Japan",
  KE:"Kenya", KG:"Kyrgyzstan", KH:"Cambodia", KI:"Kiribati", KM:"Comoros", KN:"Saint Kitts and Nevis",
  KP:"North Korea", KR:"South Korea", KW:"Kuwait", KY:"Cayman Islands", KZ:"Kazakhstan", LA:"Laos",
  LB:"Lebanon", LC:"Saint Lucia", LI:"Liechtenstein", LK:"Sri Lanka", LR:"Liberia", LS:"Lesotho",
  LT:"Lithuania", LU:"Luxembourg", LV:"Latvia", LY:"Libya", MA:"Morocco", MC:"Monaco",
  MD:"Moldova", ME:"Montenegro", MF:"Saint Martin", MG:"Madagascar", MH:"Marshall Islands", MK:"North Macedonia",
  ML:"Mali", MM:"Myanmar", MN:"Mongolia", MO:"Macau", MP:"Northern Mariana Islands", MQ:"Martinique",
  MR:"Mauritania", MS:"Montserrat", MT:"Malta", MU:"Mauritius", MV:"Maldives", MW:"Malawi",
  MX:"Mexico", MY:"Malaysia", MZ:"Mozambique", NA:"Namibia", NC:"New Caledonia", NE:"Niger",
  NF:"Norfolk Island", NG:"Nigeria", NI:"Nicaragua", NL:"Netherlands", NO:"Norway", NP:"Nepal",
  NR:"Nauru", NU:"Niue", NZ:"New Zealand", OM:"Oman", PA:"Panama", PE:"Peru",
  PF:"French Polynesia", PG:"Papua New Guinea", PH:"Philippines", PK:"Pakistan", PL:"Poland", PM:"Saint Pierre and Miquelon",
  PN:"Pitcairn Islands", PR:"Puerto Rico", PS:"Palestine", PT:"Portugal", PW:"Palau", PY:"Paraguay",
  QA:"Qatar", RE:"Réunion", RO:"Romania", RS:"Serbia", RU:"Russia", RW:"Rwanda",
  SA:"Saudi Arabia", SB:"Solomon Islands", SC:"Seychelles", SD:"Sudan", SE:"Sweden", SG:"Singapore",
  SH:"Saint Helena, Ascension and Tristan da Cunha", SI:"Slovenia", SJ:"Svalbard and Jan Mayen", SK:"Slovakia", SL:"Sierra Leone", SM:"San Marino",
  SN:"Senegal", SO:"Somalia", SR:"Suriname", SS:"South Sudan", ST:"São Tomé and Príncipe", SV:"El Salvador",
  SX:"Sint Maarten", SY:"Syria", SZ:"Eswatini", TC:"Turks and Caicos Islands", TD:"Chad", TF:"French Southern and Antarctic Lands",
  TG:"Togo", TH:"Thailand", TJ:"Tajikistan", TK:"Tokelau", TL:"Timor-Leste", TM:"Turkmenistan",
  TN:"Tunisia", TO:"Tonga", TR:"Türkiye", TT:"Trinidad and Tobago", TV:"Tuvalu", TW:"Taiwan",
  TZ:"Tanzania", UA:"Ukraine", UG:"Uganda", UM:"United States Minor Outlying Islands", US:"United States", UY:"Uruguay",
  UZ:"Uzbekistan", VA:"Vatican City", VC:"Saint Vincent and the Grenadines", VE:"Venezuela", VG:"British Virgin Islands", VI:"United States Virgin Islands",
  VN:"Vietnam", VU:"Vanuatu", WF:"Wallis and Futuna", WS:"Samoa", YE:"Yemen", YT:"Mayotte",
  ZA:"South Africa", ZM:"Zambia", ZW:"Zimbabwe",
};

/** world-atlas ids for a list of alpha-2 codes. Unknown codes are dropped, never guessed. */
export function atlasIdsFor(codes: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const code of codes) {
    const id = ISO_ALPHA2_TO_NUMERIC[String(code).toUpperCase()];
    if (id) out.add(id);
  }
  return out;
}

export function countryName(code: string): string {
  return ISO_ALPHA2_NAMES[code.toUpperCase()] ?? code.toUpperCase();
}

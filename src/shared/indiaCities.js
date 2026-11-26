// Indian cities and towns for the registration and profile-completion
// City field, grouped by state so the dropdown can show the state beside
// each city and so typing a state name finds its towns (see
// CityDropdown.jsx).
//
// Still NOT exhaustive — India has thousands of towns and this is the
// set worth offering by name. The field always keeps its "Other (type
// your city)" option, and that free-text value is stored as-is: see
// UserDemographics.city in the backend, which never validates against
// this list, so the list can keep growing without touching stored data.
//
// Confirmed with the client (Sept 2026): city list is India-only at
// launch. Expanded Nov 2026 from ~90 entries to the list below, because
// the first version missed most of the audience outside the metros.
// West Bengal carries the most detail on purpose — that is where this
// audience actually lives, and "Other" for a Bengali theatre site's own
// home state would be the wrong default experience.
export const INDIA_CITIES_BY_STATE = {
  "Andaman & Nicobar Islands": ["Port Blair"],
  "Andhra Pradesh": [
    "Visakhapatnam", "Vijayawada", "Guntur", "Nellore", "Tirupati", "Kurnool",
    "Rajahmundry", "Kakinada", "Kadapa", "Anantapur", "Eluru", "Ongole",
    "Vizianagaram", "Chittoor", "Machilipatnam", "Srikakulam", "Nandyal",
    "Adoni", "Tenali", "Proddatur", "Bhimavaram", "Madanapalle", "Guntakal",
    "Dharmavaram", "Gudivada", "Narasaraopet", "Tadipatri", "Mangalagiri",
  ],
  "Arunachal Pradesh": ["Itanagar", "Naharlagun", "Pasighat", "Tawang", "Ziro", "Bomdila", "Tezu"],
  "Assam": [
    "Guwahati", "Silchar", "Dibrugarh", "Jorhat", "Nagaon", "Tinsukia",
    "Tezpur", "Bongaigaon", "Dhubri", "Diphu", "Goalpara", "Sivasagar",
    "Karimganj", "Lakhimpur", "Barpeta", "Haflong", "Mangaldoi", "Nalbari",
    "Golaghat", "Hailakandi",
  ],
  "Bihar": [
    "Patna", "Gaya", "Bhagalpur", "Muzaffarpur", "Darbhanga", "Purnia",
    "Arrah", "Begusarai", "Katihar", "Munger", "Chhapra", "Danapur",
    "Saharsa", "Sasaram", "Hajipur", "Dehri", "Siwan", "Motihari",
    "Nawada", "Bagaha", "Buxar", "Kishanganj", "Sitamarhi", "Jamalpur",
    "Jehanabad", "Aurangabad", "Bettiah", "Madhubani", "Samastipur", "Araria",
  ],
  "Chandigarh": ["Chandigarh"],
  "Chhattisgarh": [
    "Raipur", "Bhilai", "Bilaspur", "Korba", "Durg", "Rajnandgaon",
    "Jagdalpur", "Raigarh", "Ambikapur", "Dhamtari", "Mahasamund", "Chirmiri",
    "Janjgir", "Kanker", "Kawardha",
  ],
  "Dadra & Nagar Haveli and Daman & Diu": ["Silvassa", "Daman", "Diu"],
  "Delhi": [
    "New Delhi", "Delhi", "Dwarka", "Rohini", "Saket", "Pitampura",
    "Janakpuri", "Karol Bagh", "Lajpat Nagar", "Vasant Kunj", "Mayur Vihar",
    "Shahdara", "Narela", "Najafgarh",
  ],
  "Goa": ["Panaji", "Margao", "Vasco da Gama", "Mapusa", "Ponda", "Bicholim", "Curchorem", "Calangute"],
  "Gujarat": [
    "Ahmedabad", "Surat", "Vadodara", "Rajkot", "Gandhinagar", "Bhavnagar",
    "Jamnagar", "Junagadh", "Anand", "Nadiad", "Bharuch", "Navsari",
    "Mehsana", "Morbi", "Surendranagar", "Gandhidham", "Vapi", "Valsad",
    "Porbandar", "Veraval", "Patan", "Godhra", "Bhuj", "Palanpur",
    "Amreli", "Dahod", "Botad", "Jetpur",
  ],
  "Haryana": [
    "Gurugram", "Faridabad", "Panipat", "Ambala", "Hisar", "Rohtak",
    "Karnal", "Sonipat", "Yamunanagar", "Panchkula", "Bhiwani", "Sirsa",
    "Bahadurgarh", "Jind", "Kaithal", "Rewari", "Palwal", "Kurukshetra",
    "Narnaul", "Fatehabad",
  ],
  "Himachal Pradesh": [
    "Shimla", "Dharamshala", "Manali", "Solan", "Mandi", "Kullu",
    "Hamirpur", "Bilaspur", "Una", "Chamba", "Nahan", "Palampur",
    "Baddi", "Kangra", "Keylong",
  ],
  "Jammu & Kashmir": [
    "Srinagar", "Jammu", "Anantnag", "Baramulla", "Udhampur", "Kathua",
    "Sopore", "Pulwama", "Kupwara", "Rajouri", "Poonch", "Doda",
  ],
  "Jharkhand": [
    "Ranchi", "Jamshedpur", "Dhanbad", "Bokaro Steel City", "Deoghar",
    "Hazaribagh", "Giridih", "Ramgarh", "Phusro", "Medininagar", "Chaibasa",
    "Dumka", "Gumla", "Jhumri Telaiya", "Sahibganj", "Chatra",
  ],
  "Karnataka": [
    "Bengaluru", "Mysuru", "Mangaluru", "Hubballi", "Dharwad", "Belagavi",
    "Kalaburagi", "Davanagere", "Ballari", "Vijayapura", "Shivamogga",
    "Tumakuru", "Raichur", "Bidar", "Hassan", "Udupi", "Chitradurga",
    "Hospet", "Gadag", "Mandya", "Chikkamagaluru", "Bagalkot", "Karwar",
    "Kolar", "Robertsonpet", "Haveri", "Yadgir", "Chikkaballapur",
  ],
  "Kerala": [
    "Kochi", "Thiruvananthapuram", "Kozhikode", "Thrissur", "Kollam",
    "Alappuzha", "Palakkad", "Kannur", "Kottayam", "Malappuram",
    "Pathanamthitta", "Idukki", "Kasaragod", "Wayanad", "Guruvayur",
    "Changanassery", "Perinthalmanna", "Thalassery", "Payyanur", "Muvattupuzha",
  ],
  "Ladakh": ["Leh", "Kargil"],
  "Lakshadweep": ["Kavaratti"],
  "Madhya Pradesh": [
    "Bhopal", "Indore", "Gwalior", "Jabalpur", "Ujjain", "Sagar",
    "Dewas", "Satna", "Ratlam", "Rewa", "Katni", "Singrauli",
    "Burhanpur", "Khandwa", "Morena", "Bhind", "Chhindwara", "Guna",
    "Shivpuri", "Vidisha", "Damoh", "Mandsaur", "Khargone", "Neemuch",
    "Hoshangabad", "Itarsi", "Sehore", "Betul",
  ],
  "Maharashtra": [
    "Mumbai", "Pune", "Nagpur", "Nashik", "Chhatrapati Sambhajinagar",
    "Thane", "Navi Mumbai", "Solapur", "Kalyan", "Dombivli", "Vasai-Virar",
    "Amravati", "Kolhapur", "Sangli", "Jalgaon", "Akola", "Nanded",
    "Latur", "Ahmednagar", "Dhule", "Chandrapur", "Parbhani", "Ichalkaranji",
    "Jalna", "Satara", "Beed", "Yavatmal", "Osmanabad", "Wardha",
    "Panvel", "Ratnagiri", "Bhiwandi", "Mira-Bhayandar", "Pimpri-Chinchwad",
  ],
  "Manipur": ["Imphal", "Thoubal", "Churachandpur", "Bishnupur", "Kakching", "Ukhrul"],
  "Meghalaya": ["Shillong", "Tura", "Jowai", "Nongstoin", "Williamnagar", "Baghmara"],
  "Mizoram": ["Aizawl", "Lunglei", "Champhai", "Serchhip", "Kolasib", "Saiha"],
  "Nagaland": ["Kohima", "Dimapur", "Mokokchung", "Tuensang", "Wokha", "Zunheboto", "Mon"],
  "Odisha": [
    "Bhubaneswar", "Cuttack", "Rourkela", "Berhampur", "Sambalpur", "Puri",
    "Balasore", "Bhadrak", "Baripada", "Jharsuguda", "Jeypore", "Angul",
    "Dhenkanal", "Kendujhar", "Rayagada", "Paradip", "Bargarh", "Koraput",
    "Talcher", "Sundargarh",
  ],
  "Puducherry": ["Puducherry", "Karaikal", "Yanam", "Mahe"],
  "Punjab": [
    "Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Bathinda", "Mohali",
    "Hoshiarpur", "Pathankot", "Moga", "Batala", "Firozpur", "Khanna",
    "Phagwara", "Barnala", "Kapurthala", "Sangrur", "Muktsar", "Rajpura",
    "Fazilka", "Gurdaspur", "Nabha", "Faridkot",
  ],
  "Rajasthan": [
    "Jaipur", "Jodhpur", "Udaipur", "Kota", "Ajmer", "Bikaner",
    "Bhilwara", "Alwar", "Sikar", "Pali", "Sri Ganganagar", "Bharatpur",
    "Hanumangarh", "Chittorgarh", "Jhunjhunu", "Tonk", "Beawar", "Banswara",
    "Nagaur", "Churu", "Baran", "Dausa", "Jaisalmer", "Mount Abu",
    "Sawai Madhopur", "Barmer", "Bundi",
  ],
  "Sikkim": ["Gangtok", "Namchi", "Gyalshing", "Mangan", "Rangpo", "Jorethang"],
  "Tamil Nadu": [
    "Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem",
    "Tirunelveli", "Tiruppur", "Erode", "Vellore", "Thoothukudi", "Thanjavur",
    "Dindigul", "Nagercoil", "Kancheepuram", "Cuddalore", "Karur", "Hosur",
    "Sivakasi", "Pollachi", "Rajapalayam", "Pudukkottai", "Namakkal",
    "Villupuram", "Tiruvannamalai", "Ooty", "Kodaikanal", "Ambur", "Karaikudi",
    "Nagapattinam", "Virudhunagar",
  ],
  "Telangana": [
    "Hyderabad", "Warangal", "Nizamabad", "Karimnagar", "Khammam",
    "Ramagundam", "Mahbubnagar", "Nalgonda", "Adilabad", "Suryapet",
    "Siddipet", "Miryalaguda", "Jagtial", "Mancherial", "Sangareddy",
    "Secunderabad", "Medak", "Nirmal",
  ],
  "Tripura": ["Agartala", "Udaipur", "Dharmanagar", "Kailashahar", "Belonia", "Ambassa", "Khowai"],
  "Uttar Pradesh": [
    "Lucknow", "Kanpur", "Noida", "Ghaziabad", "Agra", "Varanasi",
    "Prayagraj", "Meerut", "Bareilly", "Aligarh", "Moradabad", "Saharanpur",
    "Gorakhpur", "Firozabad", "Jhansi", "Muzaffarnagar", "Mathura",
    "Shahjahanpur", "Rampur", "Ayodhya", "Mirzapur", "Hapur", "Etawah",
    "Bulandshahr", "Sitapur", "Farrukhabad", "Raebareli", "Unnao", "Jaunpur",
    "Banda", "Basti", "Deoria", "Azamgarh", "Ghazipur", "Greater Noida",
    "Sultanpur", "Bahraich", "Lakhimpur", "Hardoi", "Fatehpur",
  ],
  "Uttarakhand": [
    "Dehradun", "Haridwar", "Nainital", "Roorkee", "Haldwani", "Rudrapur",
    "Kashipur", "Rishikesh", "Mussoorie", "Pithoragarh", "Almora", "Kotdwar",
    "Ramnagar", "Srinagar Garhwal", "Tehri",
  ],
  "West Bengal": [
    "Kolkata", "Howrah", "Durgapur", "Siliguri", "Asansol", "Bardhaman",
    "Malda", "Baharampur", "Habra", "Kharagpur", "Shantipur", "Dankuni",
    "Dhulian", "Ranaghat", "Haldia", "Raiganj", "Krishnanagar", "Nabadwip",
    "Medinipur", "Jalpaiguri", "Balurghat", "Basirhat", "Bankura",
    "Chakdaha", "Darjeeling", "Alipurduar", "Purulia", "Jangipur",
    "Bolpur", "Bangaon", "Cooch Behar", "Tamluk", "Barasat", "Barrackpore",
    "Serampore", "Chandannagar", "Hugli-Chinsurah", "Kalyani", "Naihati",
    "Bhatpara", "Panihati", "Kamarhati", "Baranagar", "South Dum Dum",
    "Rajpur Sonarpur", "Maheshtala", "Budge Budge", "Baruipur", "Diamond Harbour",
    "Uluberia", "Bally", "Rishra", "Konnagar", "Baidyabati",
    "Arambagh", "Katwa", "Kalna", "Memari", "Raniganj", "Jamuria",
    "Kulti", "Suri", "Rampurhat", "Sainthia", "Islampur", "Kurseong",
    "Kalimpong", "Mal", "Dinhata", "Mathabhanga", "Jhargram", "Ghatal",
    "Contai", "Egra", "Panskura", "Bishnupur", "Sonamukhi", "Gangarampur",
    "Dalkhola", "Kaliyaganj", "Murshidabad", "Beldanga", "Jiaganj Azimganj",
  ],
};

// Flattened for searching: every city paired with the state it is in, so
// a picked city always carries its state without the caller asking.
export const INDIA_CITIES_FLAT = Object.entries(INDIA_CITIES_BY_STATE).flatMap(
  ([state, cities]) => cities.map((city) => ({ city, state }))
);

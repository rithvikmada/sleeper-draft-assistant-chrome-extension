const RANKINGS = [
{
"name": "Jahmyr Gibbs",
"team": "DET",
"pos": "RB",
"tier": "S",
"rank": 1.25
},
{
"name": "Bijan Robinson",
"team": "ATL",
"pos": "RB",
"tier": "S",
"rank": 1.75
},
{
"name": "Ja'Marr Chase",
"team": "CIN",
"pos": "WR",
"tier": "S",
"rank": 3.38
},
{
"name": "Puka Nacua",
"team": "LAR",
"pos": "WR",
"tier": "S",
"rank": 3.88
},
{
"name": "Jaxon Smith-Njigba",
"team": "SEA",
"pos": "WR",
"tier": "A",
"rank": 5.63
},
{
"name": "Christian McCaffrey",
"team": "SF",
"pos": "RB",
"tier": "A",
"rank": 6.25
},
{
"name": "Amon-Ra St. Brown",
"team": "DET",
"pos": "WR",
"tier": "A",
"rank": 6.88
},
{
"name": "Jonathan Taylor",
"team": "IND",
"pos": "RB",
"tier": "A",
"rank": 9.5
},
{
"name": "CeeDee Lamb",
"team": "DAL",
"pos": "WR",
"tier": "A",
"rank": 10.0
},
{
"name": "James Cook",
"team": "BUF",
"pos": "RB",
"tier": "B",
"rank": 10.38
},
{
"name": "Justin Jefferson",
"team": "MIN",
"pos": "WR",
"tier": "B",
"rank": 10.75
},
{
"name": "Ashton Jeanty",
"team": "LV",
"pos": "RB",
"tier": "B",
"rank": 11.75
},
{
"name": "Chase Brown",
"team": "CIN",
"pos": "RB",
"tier": "B",
"rank": 12.25
},
{
"name": "Devon Achane",
"team": "MIA",
"pos": "RB",
"tier": "B",
"rank": 13.88
},
{
"name": "Omarion Hampton",
"team": "LAC",
"pos": "RB",
"tier": "B",
"rank": 14.5
},
{
"name": "Saquon Barkley",
"team": "PHI",
"pos": "RB",
"tier": "B",
"rank": 15.63
},
{
"name": "Kenneth Walker",
"team": "KC",
"pos": "RB",
"tier": "B",
"rank": 16.13
},
{
"name": "Drake London",
"team": "ATL",
"pos": "WR",
"tier": "B",
"rank": 18.75
},
{
"name": "Brock Bowers",
"team": "LV",
"pos": "TE",
"tier": "C",
"rank": 19.75
},
{
"name": "Derrick Henry",
"team": "BAL",
"pos": "RB",
"tier": "C",
"rank": 20.25
},
{
"name": "A.J. Brown",
"team": "NE",
"pos": "WR",
"tier": "C",
"rank": 21.25
},
{
"name": "Nico Collins",
"team": "HOU",
"pos": "WR",
"tier": "C",
"rank": 22.38
},
{
"name": "Malik Nabers",
"team": "NYG",
"pos": "WR",
"tier": "C",
"rank": 22.5
},
{
"name": "George Pickens",
"team": "DAL",
"pos": "WR",
"tier": "C",
"rank": 24.75
},
{
"name": "Rashee Rice",
"team": "KC",
"pos": "WR",
"tier": "C",
"rank": 24.88
},
{
"name": "Chris Olave",
"team": "NO",
"pos": "WR",
"tier": "C",
"rank": 25.75
},
{
"name": "Trey McBride",
"team": "ARI",
"pos": "TE",
"tier": "C",
"rank": 27.75
},
{
"name": "Jeremiyah Love",
"team": "ARI",
"pos": "RB",
"tier": "C",
"rank": 30.0
},
{
"name": "Breece Hall",
"team": "NYJ",
"pos": "RB",
"tier": "D",
"rank": 30.13
},
{
"name": "DeVonta Smith",
"team": "PHI",
"pos": "WR",
"tier": "D",
"rank": 30.13
},
{
"name": "Kyren Williams",
"team": "LAR",
"pos": "RB",
"tier": "D",
"rank": 31.5
},
{
"name": "Javonte Williams",
"team": "DAL",
"pos": "RB",
"tier": "D",
"rank": 32.25
},
{
"name": "Zay Flowers",
"team": "BAL",
"pos": "WR",
"tier": "D",
"rank": 33.5
},
{
"name": "Tee Higgins",
"team": "CIN",
"pos": "WR",
"tier": "D",
"rank": 34.25
},
{
"name": "Jaylen Waddle",
"team": "DEN",
"pos": "WR",
"tier": "D",
"rank": 35.5
},
{
"name": "Josh Jacobs",
"team": "GB",
"pos": "RB",
"tier": "D",
"rank": 36.88
},
{
"name": "Josh Allen",
"team": "BUF",
"pos": "QB",
"tier": "D",
"rank": 37.25
},
{
"name": "Emeka Egbuka",
"team": "TB",
"pos": "WR",
"tier": "D",
"rank": 39.0
},
{
"name": "Ladd McConkey",
"team": "LAC",
"pos": "WR",
"tier": "D",
"rank": 39.0
},
{
"name": "Colston Loveland",
"team": "CHI",
"pos": "TE",
"tier": "D",
"rank": 40.13
},
{
"name": "Garrett Wilson",
"team": "NYJ",
"pos": "WR",
"tier": "E",
"rank": 41.0
},
{
"name": "Tetairoa McMillan",
"team": "CAR",
"pos": "WR",
"tier": "E",
"rank": 41.13
},
{
"name": "Cam Skattebo",
"team": "NYG",
"pos": "RB",
"tier": "E",
"rank": 45.88
},
{
"name": "Bucky Irving",
"team": "TB",
"pos": "RB",
"tier": "E",
"rank": 46.13
},
{
"name": "Travis Etienne",
"team": "NO",
"pos": "RB",
"tier": "E",
"rank": 46.13
},
{
"name": "D'Andre Swift",
"team": "CHI",
"pos": "RB",
"tier": "E",
"rank": 46.13
},
{
"name": "Davante Adams",
"team": "LAR",
"pos": "WR",
"tier": "E",
"rank": 47.0
},
{
"name": "Bhayshul Tuten",
"team": "JAX",
"pos": "RB",
"tier": "E",
"rank": 48.0
},
{
"name": "David Montgomery",
"team": "HOU",
"pos": "RB",
"tier": "E",
"rank": 49.5
},
{
"name": "Luther Burden",
"team": "CHI",
"pos": "WR",
"tier": "E",
"rank": 50.38
},
{
"name": "Quinshon Judkins",
"team": "CLE",
"pos": "RB",
"tier": "E",
"rank": 50.5
},
{
"name": "Terry McLaurin",
"team": "WAS",
"pos": "WR",
"tier": "E",
"rank": 51.38
},
{
"name": "Jameson Williams",
"team": "DET",
"pos": "WR",
"tier": "F",
"rank": 52.25
},
{
"name": "TreVeyon Henderson",
"team": "NE",
"pos": "RB",
"tier": "F",
"rank": 54.25
},
{
"name": "Lamar Jackson",
"team": "BAL",
"pos": "QB",
"tier": "F",
"rank": 55.88
},
{
"name": "Mike Evans",
"team": "SF",
"pos": "WR",
"tier": "F",
"rank": 56.25
},
{
"name": "Jadarian Price",
"team": "SEA",
"pos": "RB",
"tier": "F",
"rank": 57.0
},
{
"name": "Rome Odunze",
"team": "CHI",
"pos": "WR",
"tier": "F",
"rank": 57.0
},
{
"name": "Carnell Tate",
"team": "TEN",
"pos": "WR",
"tier": "F",
"rank": 57.38
},
{
"name": "Tyler Warren",
"team": "IND",
"pos": "TE",
"tier": "F",
"rank": 59.25
},
{
"name": "Brian Thomas",
"team": "JAX",
"pos": "WR",
"tier": "F",
"rank": 59.5
},
{
"name": "DJ Moore",
"team": "BUF",
"pos": "WR",
"tier": "F",
"rank": 61.0
},
{
"name": "Marvin Harrison",
"team": "ARI",
"pos": "WR",
"tier": "F",
"rank": 62.13
},
{
"name": "Christian Watson",
"team": "GB",
"pos": "WR",
"tier": "G",
"rank": 62.25
},
{
"name": "Parker Washington",
"team": "JAX",
"pos": "WR",
"tier": "G",
"rank": 65.38
},
{
"name": "Jaylen Warren",
"team": "PIT",
"pos": "RB",
"tier": "G",
"rank": 65.5
},
{
"name": "Drake Maye",
"team": "NE",
"pos": "QB",
"tier": "G",
"rank": 66.5
},
{
"name": "Jayden Daniels",
"team": "WAS",
"pos": "QB",
"tier": "G",
"rank": 67.38
},
{
"name": "Joe Burrow",
"team": "CIN",
"pos": "QB",
"tier": "G",
"rank": 68.88
},
{
"name": "Caleb Williams",
"team": "CHI",
"pos": "QB",
"tier": "G",
"rank": 74.25
},
{
"name": "Jalen Hurts",
"team": "PHI",
"pos": "QB",
"tier": "G",
"rank": 74.88
},
{
"name": "Tucker Kraft",
"team": "GB",
"pos": "TE",
"tier": "G",
"rank": 76.0
},
{
"name": "Jonathon Brooks",
"team": "CAR",
"pos": "RB",
"tier": "G",
"rank": 76.5
},
{
"name": "Tony Pollard",
"team": "TEN",
"pos": "RB",
"tier": "G",
"rank": 77.38
},
{
"name": "Rhamondre Stevenson",
"team": "NE",
"pos": "RB",
"tier": "G",
"rank": 79.25
},
{
"name": "Sam LaPorta",
"team": "DET",
"pos": "TE",
"tier": "G",
"rank": 79.5
},
{
"name": "Michael Pittman",
"team": "PIT",
"pos": "WR",
"tier": "G",
"rank": 82.5
},
{
"name": "Makai Lemon",
"team": "PHI",
"pos": "WR",
"tier": "G",
"rank": 82.63
},
{
"name": "Jordan Addison",
"team": "MIN",
"pos": "WR",
"tier": "G",
"rank": 83.0
},
{
"name": "Quentin Johnston",
"team": "LAC",
"pos": "WR",
"tier": "G",
"rank": 83.38
},
{
"name": "DK Metcalf",
"team": "PIT",
"pos": "WR",
"tier": "G",
"rank": 83.5
},
{
"name": "Chris Godwin",
"team": "TB",
"pos": "WR",
"tier": "G",
"rank": 83.75
},
{
"name": "Trevor Lawrence",
"team": "JAX",
"pos": "QB",
"tier": "G",
"rank": 85.38
},
{
"name": "J.K. Dobbins",
"team": "DEN",
"pos": "RB",
"tier": "G",
"rank": 86.75
},
{
"name": "Stefon Diggs",
"team": "WAS",
"pos": "WR",
"tier": "G",
"rank": 88.38
},
{
"name": "Alec Pierce",
"team": "IND",
"pos": "WR",
"tier": "G",
"rank": 88.75
},
{
"name": "Justin Herbert",
"team": "LAC",
"pos": "QB",
"tier": "G",
"rank": 89.5
},
{
"name": "Michael Wilson",
"team": "ARI",
"pos": "WR",
"tier": "G",
"rank": 90.38
},
{
"name": "Courtland Sutton",
"team": "DEN",
"pos": "WR",
"tier": "G",
"rank": 90.5
},
{
"name": "Rachaad White",
"team": "WAS",
"pos": "RB",
"tier": "G",
"rank": 91.25
},
{
"name": "Rico Dowdle",
"team": "PIT",
"pos": "RB",
"tier": "G",
"rank": 91.38
},
{
"name": "RJ Harvey",
"team": "DEN",
"pos": "RB",
"tier": "G",
"rank": 92.13
},
{
"name": "Dak Prescott",
"team": "DAL",
"pos": "QB",
"tier": "G",
"rank": 93.0
},
{
"name": "Kyle Pitts",
"team": "ATL",
"pos": "TE",
"tier": "G",
"rank": 93.63
},
{
"name": "Jordan Mason",
"team": "MIN",
"pos": "RB",
"tier": "G",
"rank": 93.75
},
{
"name": "Harold Fannin",
"team": "CLE",
"pos": "TE",
"tier": "G",
"rank": 94.13
},
{
"name": "Chuba Hubbard",
"team": "CAR",
"pos": "RB",
"tier": "G",
"rank": 94.88
},
{
"name": "Jordyn Tyson",
"team": "NO",
"pos": "WR",
"tier": "G",
"rank": 96.88
},
{
"name": "Blake Corum",
"team": "LAR",
"pos": "RB",
"tier": "G",
"rank": 98.5
},
{
"name": "Josh Downs",
"team": "IND",
"pos": "WR",
"tier": "G",
"rank": 98.5
},
{
"name": "Wan'Dale Robinson",
"team": "TEN",
"pos": "WR",
"tier": "G",
"rank": 100.0
},
{
"name": "KC Concepcion",
"team": "CLE",
"pos": "WR",
"tier": "G",
"rank": 101.63
},
{
"name": "Jacory Croskey-Merritt",
"team": "WAS",
"pos": "RB",
"tier": "G",
"rank": 102.25
},
{
"name": "Brock Purdy",
"team": "SF",
"pos": "QB",
"tier": "G",
"rank": 103.25
},
{
"name": "Jaxson Dart",
"team": "NYG",
"pos": "QB",
"tier": "G",
"rank": 103.75
},
{
"name": "Kyle Monangai",
"team": "CHI",
"pos": "RB",
"tier": "G",
"rank": 105.88
},
{
"name": "George Kittle",
"team": "SF",
"pos": "TE",
"tier": "G",
"rank": 106.0
},
{
"name": "Bo Nix",
"team": "DEN",
"pos": "QB",
"tier": "G",
"rank": 106.75
},
{
"name": "Jayden Reed",
"team": "GB",
"pos": "WR",
"tier": "G",
"rank": 107.0
},
{
"name": "Xavier Worthy",
"team": "KC",
"pos": "WR",
"tier": "G",
"rank": 107.75
},
{
"name": "Kenneth Gainwell",
"team": "TB",
"pos": "RB",
"tier": "G",
"rank": 108.88
},
{
"name": "Patrick Mahomes",
"team": "KC",
"pos": "QB",
"tier": "G",
"rank": 109.0
},
{
"name": "Matthew Stafford",
"team": "LAR",
"pos": "QB",
"tier": "G",
"rank": 113.25
},
{
"name": "Deebo Samuel",
"team": "SF",
"pos": "WR",
"tier": "G",
"rank": 115.0
},
{
"name": "Jared Goff",
"team": "DET",
"pos": "QB",
"tier": "G",
"rank": 115.13
},
{
"name": "Matthew Golden",
"team": "GB",
"pos": "WR",
"tier": "G",
"rank": 115.25
},
{
"name": "Aaron Jones",
"team": "MIN",
"pos": "RB",
"tier": "G",
"rank": 117.13
},
{
"name": "Kyler Murray",
"team": "MIN",
"pos": "QB",
"tier": "H",
"rank": 117.38
},
{
"name": "Travis Kelce",
"team": "KC",
"pos": "TE",
"tier": "H",
"rank": 119.13
},
{
"name": "Jakobi Meyers",
"team": "JAX",
"pos": "WR",
"tier": "H",
"rank": 120.0
},
{
"name": "Travis Hunter",
"team": "JAX",
"pos": "WR",
"tier": "H",
"rank": 122.0
},
{
"name": "Romeo Doubs",
"team": "NE",
"pos": "WR",
"tier": "H",
"rank": 122.63
},
{
"name": "Jalen Coker",
"team": "CAR",
"pos": "WR",
"tier": "H",
"rank": 124.63
},
{
"name": "Jake Ferguson",
"team": "DAL",
"pos": "TE",
"tier": "H",
"rank": 128.75
},
{
"name": "De'Zhaun Stribling",
"team": "SF",
"pos": "WR",
"tier": "H",
"rank": 130.0
},
{
"name": "Chris Rodriguez",
"team": "JAX",
"pos": "RB",
"tier": "H",
"rank": 130.13
},
{
"name": "Baker Mayfield",
"team": "TB",
"pos": "QB",
"tier": "H",
"rank": 130.13
},
{
"name": "Jayden Higgins",
"team": "HOU",
"pos": "WR",
"tier": "H",
"rank": 130.38
},
{
"name": "Denzel Boston",
"team": "CLE",
"pos": "WR",
"tier": "H",
"rank": 130.5
},
{
"name": "Isaiah Likely",
"team": "NYG",
"pos": "TE",
"tier": "H",
"rank": 131.25
},
{
"name": "Dalton Kincaid",
"team": "BUF",
"pos": "TE",
"tier": "H",
"rank": 132.63
},
{
"name": "Jonah Coleman",
"team": "DEN",
"pos": "RB",
"tier": "H",
"rank": 134.5
},
{
"name": "Tyler Shough",
"team": "NO",
"pos": "QB",
"tier": "H",
"rank": 134.88
},
{
"name": "Dallas Goedert",
"team": "PHI",
"pos": "TE",
"tier": "H",
"rank": 137.13
},
{
"name": "Malik Willis",
"team": "MIA",
"pos": "QB",
"tier": "H",
"rank": 138.25
},
{
"name": "Mark Andrews",
"team": "BAL",
"pos": "TE",
"tier": "I",
"rank": 138.25
},
{
"name": "Rashid Shaheed",
"team": "SEA",
"pos": "WR",
"tier": "I",
"rank": 138.88
},
{
"name": "Khalil Shakir",
"team": "BUF",
"pos": "WR",
"tier": "I",
"rank": 139.13
},
{
"name": "Woody Marks",
"team": "HOU",
"pos": "RB",
"tier": "I",
"rank": 140.13
},
{
"name": "Jordan Love",
"team": "GB",
"pos": "QB",
"tier": "I",
"rank": 140.13
},
{
"name": "Keaton Mitchell",
"team": "LAC",
"pos": "RB",
"tier": "I",
"rank": 141.88
},
{
"name": "Tyler Allgeier",
"team": "ARI",
"pos": "RB",
"tier": "I",
"rank": 144.13
},
{
"name": "Tank Bigsby",
"team": "PHI",
"pos": "RB",
"tier": "I",
"rank": 149.5
},
{
"name": "Jalen McMillan",
"team": "TB",
"pos": "WR",
"tier": "I",
"rank": 150.13
},
{
"name": "Omar Cooper Jr.",
"team": "NYJ",
"pos": "WR",
"tier": "I",
"rank": 150.63
},
{
"name": "Tyrone Tracy",
"team": "NYG",
"pos": "RB",
"tier": "I",
"rank": 151.63
},
{
"name": "Juwan Johnson",
"team": "NO",
"pos": "TE",
"tier": "I",
"rank": 152.13
},
{
"name": "Chig Okonkwo",
"team": "WAS",
"pos": "TE",
"tier": "I",
"rank": 152.63
},
{
"name": "Brenton Strange",
"team": "JAX",
"pos": "TE",
"tier": "J",
"rank": 153.5
},
{
"name": "Tre Tucker",
"team": "LV",
"pos": "WR",
"tier": "J",
"rank": 155.63
},
{
"name": "C.J. Stroud",
"team": "HOU",
"pos": "QB",
"tier": "J",
"rank": 157.75
},
{
"name": "Isiah Pacheco",
"team": "DET",
"pos": "RB",
"tier": "J",
"rank": 158.13
},
{
"name": "Sam Darnold",
"team": "SEA",
"pos": "QB",
"tier": "J",
"rank": 160.25
},
{
"name": "Oronde Gadsden",
"team": "LAC",
"pos": "TE",
"tier": "J",
"rank": 161.25
},
{
"name": "Daniel Jones",
"team": "IND",
"pos": "QB",
"tier": "J",
"rank": 161.75
},
{
"name": "Cam Ward",
"team": "TEN",
"pos": "QB",
"tier": "J",
"rank": 161.88
},
{
"name": "Alvin Kamara",
"team": "NO",
"pos": "RB",
"tier": "J",
"rank": 162.5
},
{
"name": "Hunter Henry",
"team": "NE",
"pos": "TE",
"tier": "J",
"rank": 162.88
},
{
"name": "Zach Charbonnet",
"team": "SEA",
"pos": "RB",
"tier": "J",
"rank": 164.0
},
{
"name": "Dylan Sampson",
"team": "CLE",
"pos": "RB",
"tier": "J",
"rank": 164.13
},
{
"name": "Bryce Young",
"team": "CAR",
"pos": "QB",
"tier": "J",
"rank": 168.0
},
{
"name": "Tyjae Spears",
"team": "TEN",
"pos": "RB",
"tier": "J",
"rank": 168.0
},
{
"name": "T.J. Hockenson",
"team": "MIN",
"pos": "TE",
"tier": "J",
"rank": 168.5
},
{
"name": "Kenyon Sadiq",
"team": "NYJ",
"pos": "TE",
"tier": "J",
"rank": 169.25
},
{
"name": "MarShawn Lloyd",
"team": "GB",
"pos": "RB",
"tier": "J",
"rank": 170.0
},
{
"name": "AJ Barner",
"team": "SEA",
"pos": "TE",
"tier": "J",
"rank": 170.63
},
{
"name": "Brian Robinson",
"team": "ATL",
"pos": "RB",
"tier": "J",
"rank": 170.75
},
{
"name": "Jalen Nailor",
"team": "LV",
"pos": "WR",
"tier": "J",
"rank": 172.88
},
{
"name": "Tre Harris",
"team": "LAC",
"pos": "WR",
"tier": "J",
"rank": 172.88
},
{
"name": "Dalton Schultz",
"team": "HOU",
"pos": "TE",
"tier": "K",
"rank": 174.75
},
{
"name": "Sean Tucker",
"team": "TB",
"pos": "RB",
"tier": "K",
"rank": 174.86
},
{
"name": "Kaytron Allen",
"team": "WAS",
"pos": "RB",
"tier": "K",
"rank": 180.0
},
{
"name": "Caleb Douglas",
"team": "MIA",
"pos": "WR",
"tier": "K",
"rank": 180.17
},
{
"name": "Nicholas Singleton",
"team": "TEN",
"pos": "RB",
"tier": "K",
"rank": 181.13
},
{
"name": "Antonio Williams",
"team": "WAS",
"pos": "WR",
"tier": "K",
"rank": 184.25
},
{
"name": "Darnell Mooney",
"team": "NYG",
"pos": "WR",
"tier": "K",
"rank": 184.29
},
{
"name": "Ryan Flournoy",
"team": "DAL",
"pos": "WR",
"tier": "K",
"rank": 184.88
},
{
"name": "Emmett Johnson",
"team": "KC",
"pos": "RB",
"tier": "K",
"rank": 186.57
},
{
"name": "Keenan Allen",
"team": "IND",
"pos": "WR",
"tier": "K",
"rank": 186.83
},
{
"name": "Ja'Kobi Lane",
"team": "BAL",
"pos": "WR",
"tier": "K",
"rank": 187.25
},
{
"name": "Mike Washington Jr.",
"team": "LV",
"pos": "RB",
"tier": "K",
"rank": 187.86
},
{
"name": "Zachariah Branch",
"team": "ATL",
"pos": "WR",
"tier": "K",
"rank": 188.38
},
{
"name": "Calvin Ridley",
"team": "TEN",
"pos": "WR",
"tier": "K",
"rank": 188.71
},
{
"name": "Kayshon Boutte",
"team": "NE",
"pos": "WR",
"tier": "K",
"rank": 190.29
},
{
"name": "Malik Washington",
"team": "MIA",
"pos": "WR",
"tier": "K",
"rank": 191.38
},
{
"name": "Demond Claiborne",
"team": "MIN",
"pos": "RB",
"tier": "K",
"rank": 192.14
},
{
"name": "Cyrus Allen",
"team": "KC",
"pos": "WR",
"tier": "K",
"rank": 192.14
},
{
"name": "Ray Davis",
"team": "BUF",
"pos": "RB",
"tier": "K",
"rank": 192.5
},
{
"name": "Jerry Jeudy",
"team": "CLE",
"pos": "WR",
"tier": "K",
"rank": 193.25
},
{
"name": "Germie Bernard",
"team": "PIT",
"pos": "WR",
"tier": "K",
"rank": 193.38
},
{
"name": "Chris Brooks",
"team": "GB",
"pos": "RB",
"tier": "K",
"rank": 194.0
},
{
"name": "Terrance Ferguson",
"team": "LAR",
"pos": "TE",
"tier": "K",
"rank": 194.75
},
{
"name": "Tank Dell",
"team": "HOU",
"pos": "WR",
"tier": "K",
"rank": 194.75
},
{
"name": "Devin Singletary",
"team": "NYG",
"pos": "RB",
"tier": "K",
"rank": 195.0
},
{
"name": "Brashard Smith",
"team": "KC",
"pos": "RB",
"tier": "K",
"rank": 195.33
},
{
"name": "Jauan Jennings",
"team": "MIN",
"pos": "WR",
"tier": "K",
"rank": 195.75
},
{
"name": "Gunnar Helm",
"team": "TEN",
"pos": "TE",
"tier": "K",
"rank": 196.13
},
{
"name": "Isaac TeSlaa",
"team": "DET",
"pos": "WR",
"tier": "K",
"rank": 196.5
},
{
"name": "Aaron Rodgers",
"team": "PIT",
"pos": "QB",
"tier": "K",
"rank": 198.0
},
{
"name": "Jaydon Blue",
"team": "DAL",
"pos": "RB",
"tier": "K",
"rank": 198.63
},
{
"name": "Braelon Allen",
"team": "NYJ",
"pos": "RB",
"tier": "K",
"rank": 199.0
},
{
"name": "Najee Harris",
"team": "NYG",
"pos": "RB",
"tier": "K",
"rank": 200.0
},
{
"name": "David Njoku",
"team": "LAC",
"pos": "TE",
"tier": "K",
"rank": 200.38
},
{
"name": "Jacoby Brissett",
"team": "ARI",
"pos": "QB",
"tier": "K",
"rank": 200.75
},
{
"name": "Kimani Vidal",
"team": "LAC",
"pos": "RB",
"tier": "K",
"rank": 202.38
},
{
"name": "Chris Bell",
"team": "MIA",
"pos": "WR",
"tier": "K",
"rank": 202.88
},
{
"name": "Pat Freiermuth",
"team": "PIT",
"pos": "TE",
"tier": "K",
"rank": 203.5
},
{
"name": "Ollie Gordon II",
"team": "MIA",
"pos": "RB",
"tier": "K",
"rank": 204.5
},
{
"name": "Adonai Mitchell",
"team": "NYJ",
"pos": "WR",
"tier": "K",
"rank": 204.5
},
{
"name": "Elijah Sarratt",
"team": "BAL",
"pos": "WR",
"tier": "K",
"rank": 205.13
},
{
"name": "Troy Franklin",
"team": "DEN",
"pos": "WR",
"tier": "K",
"rank": 205.43
},
{
"name": "Greg Dulcich",
"team": "MIA",
"pos": "TE",
"tier": "K",
"rank": 207.38
},
{
"name": "Cade Otton",
"team": "TB",
"pos": "TE",
"tier": "L",
"rank": 208.13
},
{
"name": "Eli Stowers",
"team": "PHI",
"pos": "TE",
"tier": "L",
"rank": 211.71
},
{
"name": "Elic Ayomanor",
"team": "TEN",
"pos": "WR",
"tier": "L",
"rank": 212.33
},
{
"name": "Geno Smith",
"team": "NYJ",
"pos": "QB",
"tier": "L",
"rank": 212.63
},
{
"name": "Fernando Mendoza",
"team": "LV",
"pos": "QB",
"tier": "L",
"rank": 212.75
},
{
"name": "Jordan James",
"team": "SF",
"pos": "RB",
"tier": "L",
"rank": 213.71
},
{
"name": "Dontayvion Wicks",
"team": "PHI",
"pos": "WR",
"tier": "L",
"rank": 214.0
},
{
"name": "Darius Slayton",
"team": "NYG",
"pos": "WR",
"tier": "L",
"rank": 214.2
},
{
"name": "Adam Randall",
"team": "BAL",
"pos": "RB",
"tier": "L",
"rank": 214.25
},
{
"name": "Ted Hurst",
"team": "TB",
"pos": "WR",
"tier": "L",
"rank": 214.25
},
{
"name": "Malachi Fields",
"team": "NYG",
"pos": "WR",
"tier": "L",
"rank": 214.71
},
{
"name": "Calvin Austin",
"team": "NYG",
"pos": "WR",
"tier": "L",
"rank": 215.0
},
{
"name": "Pat Bryant",
"team": "DEN",
"pos": "WR",
"tier": "L",
"rank": 215.88
},
{
"name": "Luke McCaffrey",
"team": "WAS",
"pos": "WR",
"tier": "L",
"rank": 217.0
},
{
"name": "James Conner",
"team": "ARI",
"pos": "RB",
"tier": "L",
"rank": 217.14
},
{
"name": "Chimere Dike",
"team": "TEN",
"pos": "WR",
"tier": "L",
"rank": 217.17
},
{
"name": "Jack Bech",
"team": "LV",
"pos": "WR",
"tier": "L",
"rank": 217.86
},
{
"name": "Ty Johnson",
"team": "BUF",
"pos": "RB",
"tier": "L",
"rank": 218.33
},
{
"name": "Christian Kirk",
"team": "SF",
"pos": "WR",
"tier": "L",
"rank": 219.4
},
{
"name": "Justice Hill",
"team": "BAL",
"pos": "RB",
"tier": "L",
"rank": 219.57
},
{
"name": "DJ Giddens",
"team": "IND",
"pos": "RB",
"tier": "L",
"rank": 220.0
},
{
"name": "Keon Coleman",
"team": "BUF",
"pos": "WR",
"tier": "L",
"rank": 220.17
},
{
"name": "Samaje Perine",
"team": "CIN",
"pos": "RB",
"tier": "L",
"rank": 221.83
},
{
"name": "Tez Johnson",
"team": "TB",
"pos": "WR",
"tier": "L",
"rank": 222.33
},
{
"name": "Bryce Lance",
"team": "NO",
"pos": "WR",
"tier": "L",
"rank": 222.5
},
{
"name": "Tory Horton",
"team": "SEA",
"pos": "WR",
"tier": "L",
"rank": 222.67
},
{
"name": "Tua Tagovailoa",
"team": "ATL",
"pos": "QB",
"tier": "L",
"rank": 223.75
},
{
"name": "George Holani",
"team": "SEA",
"pos": "RB",
"tier": "L",
"rank": 224.0
},
{
"name": "Skyler Bell",
"team": "BUF",
"pos": "WR",
"tier": "L",
"rank": 224.33
},
{
"name": "Tyquan Thornton",
"team": "KC",
"pos": "WR",
"tier": "L",
"rank": 224.57
},
{
"name": "Isaiah Davis",
"team": "NYJ",
"pos": "RB",
"tier": "L",
"rank": 224.67
},
{
"name": "Kendre Miller",
"team": "NO",
"pos": "RB",
"tier": "L",
"rank": 225.0
},
{
"name": "Charlie Kolar",
"team": "LAC",
"pos": "TE",
"tier": "L",
"rank": 225.0
},
{
"name": "Emanuel Wilson",
"team": "SEA",
"pos": "RB",
"tier": "L",
"rank": 225.83
},
{
"name": "Cedric Tillman",
"team": "CLE",
"pos": "WR",
"tier": "L",
"rank": 226.5
},
{
"name": "Rashod Bateman",
"team": "BAL",
"pos": "WR",
"tier": "L",
"rank": 226.71
},
{
"name": "Jaylin Noel",
"team": "HOU",
"pos": "WR",
"tier": "L",
"rank": 226.75
},
{
"name": "Chris Brazzell II",
"team": "CAR",
"pos": "WR",
"tier": "L",
"rank": 228.0
},
{
"name": "Devaughn Vele",
"team": "NO",
"pos": "WR",
"tier": "L",
"rank": 228.67
},
{
"name": "Max Klare",
"team": "LAR",
"pos": "TE",
"tier": "L",
"rank": 228.67
},
{
"name": "Mike Gesicki",
"team": "CIN",
"pos": "TE",
"tier": "L",
"rank": 230.25
},
{
"name": "Cooper Kupp",
"team": "SEA",
"pos": "WR",
"tier": "L",
"rank": 230.71
},
{
"name": "Isaac Guerendo",
"team": "SF",
"pos": "RB",
"tier": "L",
"rank": 231.0
},
{
"name": "Kaelon Black",
"team": "SF",
"pos": "RB",
"tier": "L",
"rank": 231.13
},
{
"name": "Eli Stowers",
"team": "",
"pos": "TE",
"tier": "L",
"rank": 233.0
},
{
"name": "Andrei Iosivas",
"team": "CIN",
"pos": "WR",
"tier": "L",
"rank": 233.71
},
{
"name": "Seth McGowan",
"team": "IND",
"pos": "RB",
"tier": "L",
"rank": 235.67
},
{
"name": "Evan Engram",
"team": "DEN",
"pos": "TE",
"tier": "L",
"rank": 236.43
},
{
"name": "Eli Raridon",
"team": "NE",
"pos": "TE",
"tier": "L",
"rank": 236.5
},
{
"name": "Kaleb Johnson",
"team": "PIT",
"pos": "RB",
"tier": "L",
"rank": 236.5
},
{
"name": "Trey Benson",
"team": "ARI",
"pos": "RB",
"tier": "L",
"rank": 237.33
},
{
"name": "Brandon Aiyuk",
"team": "SF",
"pos": "WR",
"tier": "L",
"rank": 238.0
},
{
"name": "Jaylen Wright",
"team": "MIA",
"pos": "RB",
"tier": "L",
"rank": 238.6
},
{
"name": "Xavier Legette",
"team": "CAR",
"pos": "WR",
"tier": "L",
"rank": 239.0
},
{
"name": "Hollywood Brown",
"team": "PHI",
"pos": "WR",
"tier": "L",
"rank": 239.0
},
{
"name": "Shedeur Sanders",
"team": "CLE",
"pos": "QB",
"tier": "L",
"rank": 239.13
},
{
"name": "Deshaun Watson",
"team": "CLE",
"pos": "QB",
"tier": "L",
"rank": 240.13
},
{
"name": "Devin Neal",
"team": "NO",
"pos": "RB",
"tier": "L",
"rank": 241.5
},
{
"name": "Michael Penix",
"team": "ATL",
"pos": "QB",
"tier": "L",
"rank": 241.75
},
{
"name": "Mack Hollins",
"team": "NE",
"pos": "WR",
"tier": "L",
"rank": 243.0
},
{
"name": "LeQuint Allen",
"team": "JAX",
"pos": "RB",
"tier": "L",
"rank": 243.4
},
{
"name": "Konata Mumpfield",
"team": "LAR",
"pos": "WR",
"tier": "L",
"rank": 244.0
},
{
"name": "Jake Tonges",
"team": "SF",
"pos": "TE",
"tier": "L",
"rank": 245.17
},
{
"name": "Trevor Etienne",
"team": "CAR",
"pos": "RB",
"tier": "L",
"rank": 245.5
},
{
"name": "Olamide Zaccheaus",
"team": "ATL",
"pos": "WR",
"tier": "L",
"rank": 245.5
},
{
"name": "Carson Beck",
"team": "ARI",
"pos": "QB",
"tier": "L",
"rank": 246.86
},
{
"name": "Tyreek Hill",
"team": "",
"pos": "WR",
"tier": "L",
"rank": 247.5
},
{
"name": "Kirk Cousins",
"team": "LV",
"pos": "QB",
"tier": "L",
"rank": 247.88
},
{
"name": "Jaylin Lane",
"team": "WAS",
"pos": "WR",
"tier": "L",
"rank": 248.0
},
{
"name": "Colby Parkinson",
"team": "LAR",
"pos": "TE",
"tier": "L",
"rank": 249.0
},
{
"name": "Darnell Washington",
"team": "PIT",
"pos": "TE",
"tier": "L",
"rank": 250.13
},
{
"name": "Theo Johnson",
"team": "NYG",
"pos": "TE",
"tier": "L",
"rank": 251.0
},
{
"name": "Joshua Palmer",
"team": "BUF",
"pos": "WR",
"tier": "L",
"rank": 253.33
},
{
"name": "Anthony Richardson",
"team": "IND",
"pos": "QB",
"tier": "L",
"rank": 254.0
},
{
"name": "Michael Mayer",
"team": "LV",
"pos": "TE",
"tier": "M",
"rank": 256.86
},
{
"name": "J.J. McCarthy",
"team": "MIN",
"pos": "QB",
"tier": "M",
"rank": 260.0
},
{
"name": "Mac Jones",
"team": "SF",
"pos": "QB",
"tier": "M",
"rank": 260.5
},
{
"name": "Justin Fields",
"team": "KC",
"pos": "QB",
"tier": "M",
"rank": 263.0
},
{
"name": "Darren Waller",
"team": "CAR",
"pos": "TE",
"tier": "M",
"rank": 265.17
},
{
"name": "Ty Simpson",
"team": "LAR",
"pos": "QB",
"tier": "M",
"rank": 267.67
},
{
"name": "Malik Davis",
"team": "DAL",
"pos": "RB",
"tier": "M",
"rank": 268.5
},
{
"name": "Elijah Arroyo",
"team": "SEA",
"pos": "TE",
"tier": "M",
"rank": 268.67
},
{
"name": "Mason Taylor",
"team": "NYJ",
"pos": "TE",
"tier": "M",
"rank": 270.0
},
{
"name": "Dawson Knox",
"team": "BUF",
"pos": "TE",
"tier": "M",
"rank": 270.67
},
{
"name": "Dont'e Thornton Jr.",
"team": "LV",
"pos": "WR",
"tier": "M",
"rank": 271.0
},
{
"name": "Cole Kmet",
"team": "CHI",
"pos": "TE",
"tier": "M",
"rank": 271.33
},
{
"name": "Isaiah Bond",
"team": "CLE",
"pos": "WR",
"tier": "M",
"rank": 273.0
},
{
"name": "Ja'Tavion Sanders",
"team": "CAR",
"pos": "TE",
"tier": "M",
"rank": 276.67
},
{
"name": "Jalen Tolbert",
"team": "MIA",
"pos": "WR",
"tier": "M",
"rank": 278.67
},
{
"name": "Treylon Burks",
"team": "WAS",
"pos": "WR",
"tier": "M",
"rank": 282.67
},
{
"name": "Kendrick Bourne",
"team": "ARI",
"pos": "WR",
"tier": "M",
"rank": 282.67
},
{
"name": "Marvin Mims",
"team": "DEN",
"pos": "WR",
"tier": "M",
"rank": 283.5
},
{
"name": "Noah Gray",
"team": "KC",
"pos": "TE",
"tier": "N",
"rank": 285.0
},
{
"name": "Zavion Thomas",
"team": "CHI",
"pos": "WR",
"tier": "N",
"rank": 285.75
},
{
"name": "Emari Demercado",
"team": "KC",
"pos": "RB",
"tier": "N",
"rank": 287.5
},
{
"name": "Kyle Williams",
"team": "NE",
"pos": "WR",
"tier": "N",
"rank": 290.0
},
{
"name": "Oscar Delp",
"team": "NO",
"pos": "TE",
"tier": "N",
"rank": 290.0
},
{
"name": "Brenen Thompson",
"team": "LAC",
"pos": "WR",
"tier": "N",
"rank": 290.67
},
{
"name": "Jahan Dotson",
"team": "ATL",
"pos": "WR",
"tier": "N",
"rank": 291.67
},
{
"name": "Justin Joly",
"team": "DEN",
"pos": "TE",
"tier": "N",
"rank": 291.67
},
{
"name": "Jerome Ford",
"team": "WAS",
"pos": "RB",
"tier": "N",
"rank": 292.0
},
{
"name": "Tahj Brooks",
"team": "CIN",
"pos": "RB",
"tier": "N",
"rank": 293.0
},
{
"name": "Drew Allar",
"team": "PIT",
"pos": "QB",
"tier": "N",
"rank": 293.75
},
{
"name": "Jarquez Hunter",
"team": "LAR",
"pos": "RB",
"tier": "N",
"rank": 295.0
},
{
"name": "Noah Fant",
"team": "NO",
"pos": "TE",
"tier": "N",
"rank": 295.0
},
{
"name": "Jaleel McLaughlin",
"team": "DEN",
"pos": "RB",
"tier": "N",
"rank": 296.0
},
{
"name": "Cade Klubnik",
"team": "NYJ",
"pos": "QB",
"tier": "N",
"rank": 296.5
},
{
"name": "Tutu Atwell",
"team": "MIA",
"pos": "WR",
"tier": "N",
"rank": 296.67
},
{
"name": "Audric Estime",
"team": "NO",
"pos": "RB",
"tier": "N",
"rank": 297.0
},
{
"name": "Luke Musgrave",
"team": "GB",
"pos": "TE",
"tier": "N",
"rank": 298.67
},
{
"name": "Will Shipley",
"team": "PHI",
"pos": "RB",
"tier": "N",
"rank": 299.0
},
{
"name": "Kareem Hunt",
"team": "",
"pos": "RB",
"tier": "N",
"rank": 301.0
},
{
"name": "Jameis Winston",
"team": "NYG",
"pos": "QB",
"tier": "N",
"rank": 304.33
},
{
"name": "Tyler Higbee",
"team": "LAR",
"pos": "TE",
"tier": "N",
"rank": 305.0
},
{
"name": "Jordan Whittington",
"team": "LAR",
"pos": "WR",
"tier": "O",
"rank": 305.33
},
{
"name": "Marcus Mariota",
"team": "WAS",
"pos": "QB",
"tier": "O",
"rank": 306.33
},
{
"name": "DeMario Douglas",
"team": "NE",
"pos": "WR",
"tier": "O",
"rank": 307.0
},
{
"name": "Luke Schoonmaker",
"team": "DAL",
"pos": "TE",
"tier": "O",
"rank": 311.67
},
{
"name": "Eli Heidenreich",
"team": "PIT",
"pos": "RB",
"tier": "O",
"rank": 312.0
},
{
"name": "Jawhar Jordan",
"team": "HOU",
"pos": "RB",
"tier": "O",
"rank": 317.0
},
{
"name": "Savion Williams",
"team": "GB",
"pos": "WR",
"tier": "O",
"rank": 318.0
},
{
"name": "Xavier Hutchinson",
"team": "HOU",
"pos": "WR",
"tier": "O",
"rank": 321.0
},
{
"name": "Kevin Coleman Jr.",
"team": "MIA",
"pos": "WR",
"tier": "O",
"rank": 322.0
},
{
"name": "KaVontae Turpin",
"team": "DAL",
"pos": "WR",
"tier": "O",
"rank": 324.0
},
{
"name": "Kalif Raymond",
"team": "CHI",
"pos": "WR",
"tier": "O",
"rank": 325.0
},
{
"name": "Joe Flacco",
"team": "CIN",
"pos": "QB",
"tier": "O",
"rank": 326.0
},
{
"name": "Nick Westbrook-Ikhine",
"team": "IND",
"pos": "WR",
"tier": "O",
"rank": 327.0
},
{
"name": "Ashton Dulin",
"team": "IND",
"pos": "WR",
"tier": "O",
"rank": 328.0
},
{
"name": "Devontez Walker",
"team": "BAL",
"pos": "WR",
"tier": "O",
"rank": 332.0
},
{
"name": "Dameon Pierce",
"team": "PHI",
"pos": "RB",
"tier": "O",
"rank": 333.0
},
{
"name": "Roman Wilson",
"team": "PIT",
"pos": "WR",
"tier": "O",
"rank": 338.0
},
{
"name": "Dyami Brown",
"team": "WAS",
"pos": "WR",
"tier": "O",
"rank": 339.0
},
{
"name": "Greg Dortch",
"team": "DET",
"pos": "WR",
"tier": "O",
"rank": 340.0
},
{
"name": "Demarcus Robinson",
"team": "SF",
"pos": "WR",
"tier": "O",
"rank": 341.0
},
{
"name": "Theo Wease Jr.",
"team": "MIA",
"pos": "WR",
"tier": "O",
"rank": 342.0
},
{
"name": "Riley Leonard",
"team": "IND",
"pos": "QB",
"tier": "O",
"rank": 343.0
},
{
"name": "Mo Alie-Cox",
"team": "IND",
"pos": "TE",
"tier": "O",
"rank": 344.0
},
{
"name": "Gardner Minshew",
"team": "ARI",
"pos": "QB",
"tier": "O",
"rank": 345.0
},
{
"name": "DeAndre Hopkins",
"team": "",
"pos": "WR",
"tier": "O",
"rank": 346.0
},
{
"name": "Taysom Hill",
"team": "",
"pos": "TE",
"tier": "O",
"rank": 347.0
},
{
"name": "Tyrod Taylor",
"team": "GB",
"pos": "QB",
"tier": "O",
"rank": 348.0
},
{
"name": "JuJu Smith-Schuster",
"team": "NYG",
"pos": "WR",
"tier": "O",
"rank": 349.0
},
{
"name": "Zonovan Knight",
"team": "ARI",
"pos": "RB",
"tier": "O",
"rank": 350.0
},
{
"name": "Raheim Sanders",
"team": "CLE",
"pos": "RB",
"tier": "O",
"rank": 351.0
}
];

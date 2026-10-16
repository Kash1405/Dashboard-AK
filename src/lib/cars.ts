// Photos from Wikimedia Commons, used under their licences (credit shown on the hero card).
const base = import.meta.env.BASE_URL;

export const cars = [
  { src: "cars/mclaren-mp4-4.jpg", car: "McLaren MP4/4", author: "Hullian111", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:McLaren_MP4-4_at_Formula_1_Exhibition,_London_01.jpg", position: "center 60%" },
  { src: "cars/red-bull-rb19.jpg", car: "Red Bull RB19", author: "TaurusEmerald", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Max_Verstappen_Red_Bull_RB19_Petersen_Automotive_Museum.jpg", position: "center 55%" },
  { src: "cars/ferrari-f40.jpg", car: "Ferrari F40", author: "Alexander-93", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Ferrari_F40_GIMS_2024_1X7A2271.jpg", position: "center 55%" },
  { src: "cars/mercedes-300sl.jpg", car: "Mercedes-Benz 300 SL Gullwing", author: "Alexander Migl", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Mercedes-Benz_W198_300_SL_Gullwing_Genf_2019_1Y7A5007.jpg", position: "center 60%" },
  { src: "cars/lamborghini-miura.jpg", car: "Lamborghini Miura P400 SV", author: "Chelsea Jay", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:1971_Lamborghini_Miura_P400_SV.jpg", position: "center 55%" },
  { src: "cars/alfa-33-stradale.jpg", car: "Alfa Romeo 33 Stradale", author: "Zairon", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Arese_Museo_Storico_Alfa_Romeo_1967_33_Stradale_prototype_4.jpg", position: "center 55%" },
  { src: "cars/mercedes-w196.jpg", car: "Mercedes-Benz W196", author: "Dennis Elzinga", license: "CC BY 2.0", source: "https://commons.wikimedia.org/wiki/File:Mercedes-Benz_W196_(52296102332).jpg", position: "center 60%" },
  { src: "cars/lamborghini-countach.jpg", car: "Lamborghini Countach LP 5000 S", author: "Palauenc05", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Lamborghini_Countach_LP_5000S_1983.jpg", position: "center 55%" },
  { src: "cars/ferrari-250-gto.jpg", car: "Ferrari 250 GTO", author: "Calreyn88", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Ferrari_250_GTO_(10579).jpg", position: "center 60%" },
  { src: "cars/detomaso-pantera.jpg", car: "De Tomaso Pantera", author: "Alexander Migl", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:De_Tomaso_Pantera_(1971)_Solitude_Revival_2022_1X7A0116.jpg", position: "center 60%" },
].map((car) => ({ ...car, src: `${base}${car.src}` }));

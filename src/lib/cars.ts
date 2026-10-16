// Photos from Wikimedia Commons, used under their licences (credit shown on the hero card).
const base = import.meta.env.BASE_URL;

export const cars = [
  { src: "cars/mclaren-mp4-4.jpg", car: "McLaren MP4/4", author: "Nic Redhead", license: "CC BY-SA 2.0", source: "https://commons.wikimedia.org/wiki/File:McLaren_MP4-4_at_Goodwood_2014_002.jpg", position: "center 55%" },
  { src: "cars/red-bull-rb19-sparks.jpg", car: "Red Bull RB19", author: "Lukas Raich", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:FIA_F1_Austria_2023_Nr._1_(3).jpg", position: "center 50%" },
  { src: "cars/red-bull-rb19-race.jpg", car: "Red Bull RB19 leading at the Red Bull Ring", author: "Lukas Raich", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:FIA_F1_Austria_2023_Race_(1).jpg", position: "center 60%" },
  { src: "cars/mercedes-w196.jpg", car: "Mercedes-Benz W196", author: "Iain A Wanless", license: "CC BY 2.0", source: "https://commons.wikimedia.org/wiki/File:Mercedes-Benz_W196_Stirling_Moss_at_Goodwood_2014_001.jpg", position: "center 55%" },
  { src: "cars/mercedes-300slr-722.jpg", car: "Mercedes-Benz 300 SLR “722”", author: "Edvvc from London, UK", license: "CC BY 2.0", source: "https://commons.wikimedia.org/wiki/File:1955_Mercedes-Benz_300_SLR_%27722%27_(19101281424).jpg", position: "center 75%" },
  { src: "cars/ferrari-330-p4.jpg", car: "Ferrari 330 P4", author: "Alexander Migl", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Ferrari_(_REC_)_330P4_(1967)_Solitude_Revival_2022_1X7A0418.jpg", position: "center 55%" },
  { src: "cars/ferrari-f40-lm.jpg", car: "Ferrari F40 LM", author: "MrWalkr", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:1990_Ferrari_F40_LM_HCC25.jpg", position: "center 55%" },
  { src: "cars/lamborghini-miura.jpg", car: "Lamborghini Miura S", author: "MrWalkr", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:1968_Lamborghini_Miura_S_P400_FOS23.jpg", position: "center 55%" },
  { src: "cars/lamborghini-countach.jpg", car: "Lamborghini Countach LP5000 QV", author: "MrWalkr", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:1987_Lamborghini_Countach_LP5000_QV_FOS23.jpg", position: "center 55%" },
  { src: "cars/alfa-romeo-tipo-33.jpg", car: "Alfa Romeo Tipo 33/3", author: "Nic Redhead", license: "CC BY-SA 2.0", source: "https://commons.wikimedia.org/wiki/File:Alfa_Romeo_Tipo_33-3_at_Goodwood_2014_001.jpg", position: "center 60%" },
  { src: "cars/detomaso-pantera.jpg", car: "De Tomaso Pantera Group 4", author: "François de Dijon", license: "CC BY-SA 3.0", source: "https://commons.wikimedia.org/wiki/File:De_Tomaso_Pantera_Circuit_de_Prenois_01.JPG", position: "center 60%" },
  { src: "cars/ford-gt40.jpg", car: "Ford GT40", author: "Éric Manesse", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:IMG_6449-Ford_GT40_Mk1-Le_Mans_Classic_2018.jpg", position: "center 50%" },
  { src: "cars/le-mans-24h.jpg", car: "24 Hours of Le Mans", author: "350z33", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:2023_24HoursofLeMans_start.jpg", position: "center 55%" },
].map((car) => ({ ...car, src: `${base}${car.src}` }));

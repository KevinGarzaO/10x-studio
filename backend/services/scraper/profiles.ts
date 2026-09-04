export interface SearchProfile {
  name: string;
  description: string;
  telegramQueries: string[];
  forobetaSlugs: string[];
  redditQueries: string[];
}

export const SEARCH_PROFILES: SearchProfile[] = [
  {
    name: "freelancers_it",
    description: "Freelancers de IT y desarrollo en LatAm",
    telegramQueries: [
      "freelancer developer",
      "freelancer react node",
      "freelancer programador",
      "trabajo freelance remoto",
      "desarrollador freelance",
    ],
    forobetaSlugs: ["otros-servicios-gratuitos.476"],
    redditQueries: ["freelance", "remoto", "latam"],
  },
  {
    name: "vacantes_tech",
    description: "Vacantes de tecnología y desarrollo",
    telegramQueries: [
      "vacantes react",
      "empleos nodejs",
      "vacantes desarrollador",
      "buscamos programador",
      "contratando developer",
    ],
    forobetaSlugs: ["otros-servicios-gratuitos.476"],
    redditQueries: ["empleos_tech", "devjobs"],
  },
  {
    name: "empleo_venezuela",
    description: "Empleo y freelance en Venezuela",
    telegramQueries: [
      "empleo venezuela",
      "trabajo venezuela",
      "vacantes venezuela",
      "freelancer venezuela",
    ],
    forobetaSlugs: [],
    redditQueries: ["Venezuela"],
  },
  {
    name: "empleo_it_latam",
    description: "Empleo IT en toda Latinoamérica",
    telegramQueries: [
      "empleo IT latam",
      "trabajo remoto latin america",
      "developer jobs latam",
      "vacantes tech mexico",
      "empleo tech colombia",
    ],
    forobetaSlugs: [],
    redditQueries: ["MexicoTech", "developersLatam"],
  },
  {
    name: "discovery_all",
    description: "Discovery general para encontrar nuevas fuentes",
    telegramQueries: [
      "trabajo remoto",
      "empleo freelance",
      "vacantes developer",
      "programadores empleo",
      "dev jobs",
    ],
    forobetaSlugs: [],
    redditQueries: ["empleo", "trabajo", "jobs"],
  },
];

export function getProfileByName(name: string): SearchProfile | undefined {
  return SEARCH_PROFILES.find((p) => p.name === name);
}

import { useStored } from "./store";
import { uid } from "./utils";

// The Experience tab: one flat list of entries, each belonging to a section.
// start/end are "YYYY-MM" for roles and education (blank end = present), a plain year for awards.
// tags are comma-separated; details hold one line per bullet ("Label: text" shows the label in bold).
export type ExpSection = "Summary" | "Role" | "Education" | "Skill" | "Certification" | "Project" | "Award" | "Beyond";
export type ExpEntry = { id: string; section: ExpSection; title: string; org: string; place: string; start: string; end: string; tags: string; details: string };

export const EXP_SECTIONS: ExpSection[] = ["Summary", "Role", "Education", "Skill", "Certification", "Project", "Award", "Beyond"];
export const EXP_KEY = "experience";

const entry = (section: ExpSection, fields: Partial<ExpEntry>): ExpEntry => ({ id: uid(), section, title: "", org: "", place: "", start: "", end: "", tags: "", details: "", ...fields });
const lines = (...items: string[]) => items.join("\n");

export const defaultExperience: ExpEntry[] = [
  entry("Summary", {
    title: "Technology Business Architect bridging business strategy and the systems that deliver it",
    org: "linkedin.com/in/theabhigyankashyap",
    tags: "Business Architecture, Systems Integration, Data Strategy, AI Orchestration, Product Delivery",
    details: "I work where complex business domains meet technical execution. Across aviation, finance, insurance and retail I have taken work from global data strategy through to CI/CD pipelines and multi-agent AI systems. A computer science foundation lets me use cloud platforms (AWS, Azure) and enterprise SaaS (Salesforce) to solve hard business problems quickly and cleanly.",
  }),

  entry("Role", {
    title: "Technology Business Architecture Senior Analyst", org: "Accenture Technology", place: "Hong Kong", start: "2025-06", tags: "Retail, Insurance, Finance",
    details: lines(
      "Global POS Modernization (Retail): Ran the deployment, PMO and hypercare operating models for a global point-of-sale unification at a leading fashion and jewellery retailer, including pilot cutovers and incident escalation.",
      "Global Data Strategy (Insurance): Shaped a wealth and asset management data product strategy, naming the critical data products and the metrics that steer infrastructure investment.",
      "Multinational App Development (Insurance): Designed Salesforce data models and automated CI/CD with GitHub Actions, Checkmarx and Specmatic; delivered Twilio and Docebo Connect integrations and proofs of concept that validated the business case.",
      "Global Settlement Services (Finance): Led functional requirements and solution structuring for a major Hong Kong financial market infrastructure operator.",
    ),
  }),
  entry("Role", {
    title: "Technology Business Architecture Analyst", org: "Accenture Technology", place: "Hong Kong", start: "2023-09", end: "2025-05", tags: "Aviation, Insurance",
    details: lines(
      "Virtual Cargo Logistics Platform (Aviation): Led end-to-end delivery of the Customs Integration (trade declaration) and Intrusion Detection modules: requirements, user stories, functional specs, process maps and Jira grooming.",
      "Regional Data Hub (Insurance): Analysed data requirements and integrated Salesforce with a regional AWS data hub; ran SIT with complex SQL and validated UAT.",
      "Web & Mobile App Revamp (Aviation): Improved the experience and latency of a leading airline's apps; ran environment health checks, the defect lifecycle and cross-platform fix releases.",
    ),
  }),
  entry("Role", {
    title: "Cybersecurity Analyst, Risk Assurance", org: "PwC", place: "Hong Kong", start: "2022-07", end: "2022-08", tags: "Cybersecurity",
    details: lines(
      "Ethical Hackbot: Built ethical-hacking bots on the MEVN stack, tailored to the security assessments of high-profile clients.",
      "Reconnaissance: Mapped client exposure with Kali Linux tooling and custom scrapers.",
      "Penetration testing: Ran session-hijacking and SQL-injection attacks to expose and fix web application vulnerabilities.",
      "MFA resilience: Stood up AWS servers for controlled spear-phishing and man-in-the-middle tests against multi-factor sign-in.",
    ),
  }),
  entry("Role", {
    title: "Product Developer & Algorithmic Trading Programmer", org: "Smart Wealth Tech (formerly FQC Investment Systems)", place: "Hong Kong", start: "2021-06", end: "2023-04", tags: "Fintech",
    details: lines(
      "Trading platform: Built a web-based algorithmic trading app in Django and Flask, tuning strategies on technical indicators from Quandl data.",
      "Back-testing: Back-tested portfolios through the Interactive Brokers API, reaching a 43% annualised return on the Hang Seng Index.",
      "Automation: Deployed on AWS with MySQL and 15+ custom web scrapers generating signals automatically, saving over 2 hours of manual work a day.",
      "Sentiment analysis: Combined NLP sentiment (VADER, NLTK) with fundamental analysis to produce actionable market insight.",
      "MPF recommender: Built a Mandatory Provident Fund recommendation system on the MERN stack with statistical models.",
    ),
  }),

  entry("Education", {
    title: "Bachelor of Engineering, Computer Science", org: "The University of Hong Kong", place: "Hong Kong", start: "2019-09", end: "2023-06",
    details: lines(
      "Awards: HKU Foundation Entrance Full Scholarship (HKD 716,000), Dean's Award for Excellence, HKU CEDARS External Recognition Award (2021 & 2022), Dean's Club 2019 honorary member.",
      "Leadership: Student Teaching Assistant; founder of New College Tech; Financial Secretary of HKU Cricket Club.",
      "Coursework: Data Structures & Algorithms, OOP, Machine Learning, Databases, Data Science, Algorithmic Game Theory, Cryptocurrencies, Operating Systems, App Development.",
    ),
  }),
  entry("Education", {
    title: "Semester Exchange, Informatics", org: "The University of Edinburgh", place: "Edinburgh, UK", start: "2022-01", end: "2022-06",
    details: "Awards: HKU Exchange Scholarship (2022).",
  }),

  entry("Skill", { title: "Domains", tags: "Business Analysis, IT Project Management, Systems Integration, AI Orchestration, Cloud Architecture, Requirements Gathering, Process Mapping, Cybersecurity" }),
  entry("Skill", { title: "AI & Machine Learning", tags: "LangGraph, CrewAI, AWS Multi-Agent Orchestrator, Ollama, Qwen, PyTorch, TensorFlow, NLP (VADER, NLTK)" }),
  entry("Skill", { title: "Cloud & DevOps", tags: "AWS, Azure DevOps, GitHub Actions, Docker, Jira" }),
  entry("Skill", { title: "Programming", tags: "Python, TypeScript, JavaScript, SQL, Java, C#, C++, C, Solidity" }),
  entry("Skill", { title: "Web & APIs", tags: "MERN, MEVN, Vue.js, Django, Flask, GraphQL, Postman, API Integrations" }),
  entry("Skill", { title: "Enterprise & QA", tags: "Salesforce, Checkmarx, Specmatic" }),

  entry("Certification", { title: "Professional Scrum Master I & II", org: "Scrum.org" }),
  entry("Certification", { title: "TensorFlow Developer Specialization", org: "DeepLearning.AI" }),
  entry("Certification", { title: "Bloomberg Market Concepts", org: "Bloomberg" }),

  entry("Project", { title: "Agentic Personal Assistant", details: "Functional requirements, dashboard UI/UX and multi-agent routing topologies for a personal assistant.", tags: "LangGraph, CrewAI, AWS Multi-Agent Orchestrator" }),
  entry("Project", { title: "Automated Financial Monitoring", details: "Intrinsic-value evaluation and stock-monitoring workflows running on a local LLM stack.", tags: "Python, yfinance, Ollama, Qwen" }),
  entry("Project", { title: "Brain Tumour Detection", details: "CNN classifier for the Kaggle brain MRI dataset, using VGG16 and transfer learning.", tags: "TensorFlow, CNN, VGG16" }),
  entry("Project", { title: "Blockchain E-Voting DApp", details: "Decentralised app for secure, transparent elections on a local Ethereum chain.", tags: "Solidity, Ganache, Web3.js" }),
  entry("Project", { title: "Low-Risk Portfolio Generation", details: "Academic project generating low-risk portfolios with a CPR-TOPSIS ranking model.", tags: "Finance, Optimisation" }),
  entry("Project", { title: "3D Adventure Game", details: "Academic project: a 3D adventure game, modelled and built from scratch.", tags: "C#, Unity 3D, Blender" }),

  entry("Award", { title: "Champion", org: "PwC STEM Challenge", start: "2021", tags: "Tech Head", details: "Assessed the feasibility of cybersecurity measures in the gaming industry with statistical models and a Naive Bayes risk-assessment model." }),
  entry("Award", { title: "Champion", org: "HKU Climathon", start: "2020", tags: "Team Leader", details: "App feeding IoT sensor data from solar panels into a model that measures their efficacy and optimises communications." }),
  entry("Award", { title: "Champion", org: "IndiaTech 3.0 Hackathon", start: "2020", tags: "Tech Head", details: "Blockchain and smart-contract supply chain protecting pharmaceuticals against counterfeits." }),

  entry("Beyond", { title: "Languages", tags: "English (fluent), Hindi (fluent), Dutch (learning)" }),
  entry("Beyond", { title: "Interests", tags: "Artificial Intelligence, Data Science, Fintech, Formula 1" }),
  entry("Beyond", {
    title: "Off the clock",
    details: lines(
      "Lead guitarist, multi-instrumentalist and composer in a Hong Kong band",
      "Winner of many national and international collegiate cryptic hunts",
      "State-level swimmer",
      "Volunteer for afforestation, clean-up drives and NGO initiatives",
    ),
  }),
];

export const useExperience = () => useStored<ExpEntry[]>(EXP_KEY, defaultExperience);

export const splitTags = (tags: string) => tags.split(",").map((t) => t.trim()).filter(Boolean);
export const splitLines = (text: string) => text.split("\n").map((l) => l.trim().replace(/^[•*-]\s*/, "")).filter(Boolean);

const monthIndex = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return y * 12 + ((m || 1) - 1);
};
const thisMonth = () => {
  const d = new Date();
  return d.getFullYear() * 12 + d.getMonth();
};

// Inclusive month count, e.g. Jun 2021 – Apr 2023 is 23 months.
export const monthsBetween = (start: string, end: string) => (start ? Math.max(1, (end ? monthIndex(end) : thisMonth()) - monthIndex(start) + 1) : 0);

export function formatSpan(months: number) {
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y && `${y} yr${y > 1 ? "s" : ""}`, m && `${m} mo${m > 1 ? "s" : ""}`].filter(Boolean).join(" ") || "—";
}

export function formatMonth(ym: string) {
  if (!/^\d{4}-\d{2}/.test(ym)) return ym;
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

// Months covered by at least one role (overlaps counted once).
export function careerMonths(roles: ExpEntry[]) {
  const covered = new Set<number>();
  for (const role of roles) {
    if (!role.start) continue;
    const from = monthIndex(role.start);
    for (let i = 0; i < monthsBetween(role.start, role.end); i++) covered.add(from + i);
  }
  return covered.size;
}

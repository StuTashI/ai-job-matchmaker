export const SKILL_DICTIONARY: string[] = [
  "JavaScript", "TypeScript", "Python", "Java", "C++", "C#", "Golang", "Rust", "Ruby", "PHP", "Swift",
  "Kotlin", "Scala", "R", "MATLAB", "Perl", "Objective-C", "Dart", "Elixir", "Haskell",
  "React", "React Native", "Angular", "Vue", "Next.js", "Nuxt", "Svelte", "jQuery", "Redux",
  "Node.js", "Express", "NestJS", "Django", "Flask", "FastAPI", "Spring", "Spring Boot",
  "Ruby on Rails", "Laravel", "ASP.NET", ".NET", "GraphQL", "REST", "gRPC", "WebSockets",
  "HTML", "CSS", "Sass", "Tailwind CSS", "Bootstrap", "Webpack", "Vite", "Babel",
  "SQL", "PostgreSQL", "MySQL", "SQLite", "MongoDB", "Redis", "Cassandra", "DynamoDB",
  "Elasticsearch", "Firebase", "Supabase", "BigQuery", "Snowflake",
  "AWS", "Azure", "GCP", "Google Cloud", "Docker", "Kubernetes", "Terraform", "Ansible",
  "Jenkins", "CircleCI", "GitHub Actions", "CI/CD", "Linux", "Bash", "Shell Scripting", "Nginx",
  "Git", "Jira", "Confluence", "Figma", "Sketch", "Adobe XD",
  "Machine Learning", "Deep Learning", "TensorFlow", "PyTorch", "scikit-learn", "Pandas",
  "NumPy", "Data Analysis", "Data Science", "Data Engineering", "ETL", "Spark", "Hadoop",
  "Airflow", "Kafka", "NLP", "Computer Vision", "Generative AI", "LLM", "Prompt Engineering",
  "Product Management", "Product Strategy", "Roadmapping", "Agile", "Scrum", "Kanban",
  "Stakeholder Management", "User Research", "A/B Testing", "SQL Analytics", "Business Analysis",
  "Project Management", "PMP", "Six Sigma", "OKRs", "KPI Tracking", "Go-To-Market",
  "Sales", "B2B Sales", "SaaS", "CRM", "Salesforce", "HubSpot", "Marketing", "SEO", "SEM",
  "Content Marketing", "Digital Marketing", "Email Marketing", "Growth Marketing",
  "Financial Modeling", "Accounting", "Excel", "PowerPoint", "Tableau", "Power BI", "Looker",
  "Communication", "Leadership", "Team Management", "Negotiation", "Problem Solving",
  "Customer Success", "Account Management", "Recruiting", "HR", "Talent Acquisition",
  "iOS", "Android", "Flutter", "Unity", "Unreal Engine", "QA", "Test Automation", "Selenium",
  "Cypress", "Jest", "Playwright", "Security", "Penetration Testing", "DevOps", "SRE",
  "System Design", "Microservices", "API Design", "OAuth", "Blockchain", "Solidity", "Web3",
];

const dictionaryPatterns = SKILL_DICTIONARY.map((skill) => ({
  skill,
  pattern: new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"),
}));

export function extractSkillsFromText(text: string): string[] {
  const found = new Set<string>();
  for (const { skill, pattern } of dictionaryPatterns) {
    if (pattern.test(text)) found.add(skill);
  }
  return Array.from(found);
}

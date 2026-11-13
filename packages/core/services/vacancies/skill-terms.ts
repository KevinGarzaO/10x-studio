/**
 * Cómo se reconoce cada skill del catálogo dentro del texto de una vacante.
 *
 * Es la fuente de los datos que viven en la base (`skills.detect_terms`); de aquí se
 * genera backend/sql/vacancy-enrichment-migration.sql, y el detector lee de la base,
 * así que un skill nuevo se detecta con solo darle sus términos en SQL, sin desplegar.
 *
 * Convenciones:
 *  - Los términos se comparan como palabras completas, sin distinguir mayúsculas.
 *  - Un término que empieza con `=` SÍ distingue mayúsculas. Se usa en palabras que
 *    también son verbos o adjetivos comunes: "react to change", "swift response",
 *    "excel in a fast-paced team". Con `=React` solo cuenta la librería.
 *  - Un término que empieza con `^` solo cuenta si aparece en la CABECERA de la vacante
 *    (título o departamento). Es para palabras que en el cuerpo son ruido: "recruiter"
 *    aparece en el aviso de proceso de casi toda oferta ("tu recruiter te contactará").
 *  - Un skill sin términos aquí se detecta por su etiqueta.
 */
export const SKILL_TERMS: Record<string, string[]> = {
  // --- tecnología ---
  react: ['reactjs', 'react.js', '=React'],
  typescript: ['typescript'],
  nextjs: ['next.js', 'nextjs'],
  python: ['python', 'django', 'flask', 'fastapi'],
  nodejs: ['node.js', 'nodejs', 'node js'],
  aws: ['aws', 'amazon web services'],
  docker: ['docker'],
  kubernetes: ['kubernetes', 'k8s'],
  sql: ['sql', 'mysql', 'pl/sql', 'plsql'],
  golang: ['golang', 'go lang'],
  // Sin '=AI' suelto: "modelo de negocio AI-first" aparece en medio de las descripciones de empresa.
  ia: ['machine learning', 'deep learning', 'inteligencia artificial', 'artificial intelligence', 'ai engineer', 'ai/ml', 'ml engineer', 'llm', 'llms', 'generative ai', 'genai', 'nlp'],
  figma: ['figma'],
  'adobe-suite': ['photoshop', 'illustrator', 'adobe xd', 'indesign', 'adobe creative', 'lightroom'],
  sketch: ['=Sketch'],
  seo: ['seo', 'search engine optimization'],
  'google-ads': ['google ads', 'adwords', 'ppc', '=SEM'],
  'google-analytics': ['google analytics', 'ga4'],
  hubspot: ['hubspot'],
  salesforce: ['salesforce'],
  zendesk: ['zendesk'],
  intercom: ['intercom'],
  excel: ['microsoft excel', 'ms excel', 'excel avanzado', 'hojas de cálculo', 'spreadsheets', '=Excel'],
  canva: ['canva'],
  java: ['java', 'spring boot'],
  dotnet: ['.net', 'dotnet', 'asp.net'],
  ruby: ['ruby on rails', '=Ruby', '=Rails'],
  php: ['php', 'laravel', 'symfony'],
  swift: ['swiftui', '=Swift'],
  kotlin: ['kotlin'],
  angular: ['angular', 'angularjs'],
  vue: ['vue.js', 'vuejs', '=Vue'],
  graphql: ['graphql'],
  postgresql: ['postgresql', 'postgres'],
  mongodb: ['mongodb', 'mongo db'],
  terraform: ['terraform'],
  gcp: ['gcp', 'google cloud'],
  azure: ['azure'],
  javascript: ['javascript', 'ecmascript'],
  'html-css': ['html', 'css', 'html5', 'css3'],
  git: ['=Git', 'github', 'gitlab', 'bitbucket', 'version control', 'control de versiones'],
  linux: ['linux', 'ubuntu', 'bash scripting'],
  csharp: ['c#', 'c sharp'],
  cpp: ['c++'],
  rust: ['=Rust'],
  'react-native': ['react native'],
  flutter: ['flutter'],
  redis: ['redis'],
  kafka: ['kafka'],
  spark: ['apache spark', 'pyspark'],
  'ci-cd': ['ci/cd', 'cicd', 'jenkins', 'github actions', 'gitlab ci', 'continuous integration', 'integración continua'],
  'test-automation': ['test automation', 'automated testing', 'selenium', 'cypress', 'playwright', 'pruebas automatizadas', 'qa automation'],
  tableau: ['tableau'],
  'power-bi': ['power bi', 'powerbi'],
  jira: ['jira', 'confluence'],
  sap: ['=SAP', 'sap hana', 'sap s/4hana'],
  // --- administración, finanzas y recursos humanos ---
  accounting: ['accounting', 'accountant', 'contabilidad', 'contador', 'contable'],
  'financial-analysis': ['financial analysis', 'financial modeling', 'financial planning', 'análisis financiero', 'fp&a'],
  budgeting: ['budgeting', 'budget management', 'presupuesto', 'presupuestos'],
  quickbooks: ['quickbooks', 'contpaqi', 'contpaq'],
  payroll: ['payroll', 'nómina', 'nominas'],
  // Sin 'recruiting'/'sourcing' sueltos: aparecen en el aviso de privacidad y el proceso de selección de casi todas las ofertas.
  recruiting: ['talent acquisition', 'reclutamiento', 'full-cycle recruiting', '^recruiter', '^recruiting', '^sourcer'],
  'human-resources': ['human resources', 'recursos humanos', 'hrbp', 'people operations'],
  'project-management': ['project management', 'project manager', 'gestión de proyectos', 'pmp'],
  'agile-scrum': ['scrum', 'agile', 'kanban', 'metodologías ágiles'],
  'business-administration': ['business administration', 'administración de empresas', 'office administration'],
  procurement: ['procurement', 'purchasing', 'compras', 'supply chain', 'cadena de suministro'],
  // --- diseño ---
  'ui-ux-design': ['ui/ux', 'ux/ui', 'ux design', 'ui design', 'user experience design', 'user experience designer', 'user interface design', 'diseño ux', 'diseño ui'],
  'graphic-design': ['graphic design', 'diseño gráfico'],
  'design-systems': ['design system', 'design systems', 'sistemas de diseño'],
  'video-editing': ['video editing', 'edición de video', 'premiere pro', 'final cut', 'davinci resolve', 'capcut'],
  'motion-graphics': ['motion graphics', 'motion design', 'after effects'],
  webflow: ['webflow'],
  // --- marketing, producto y atención ---
  'social-media': ['social media', 'redes sociales', 'community manager'],
  'content-marketing': ['content marketing', 'marketing de contenidos'],
  copywriting: ['copywriting', 'copywriter', 'redacción publicitaria'],
  'email-marketing': ['email marketing', 'mailchimp', 'klaviyo'],
  'meta-ads': ['meta ads', 'facebook ads', 'instagram ads'],
  'growth-marketing': ['growth marketing', 'growth hacking', 'performance marketing'],
  wordpress: ['wordpress', 'woocommerce'],
  shopify: ['shopify'],
  // Sin 'product manager': en casi toda oferta técnica es con quién se colabora, no lo que se hace.
  'product-management': ['product management', 'gestión de producto', 'product owner'],
  'customer-service': ['customer service', 'customer support', 'customer success', 'atención al cliente', 'servicio al cliente'],
  // --- ventas y legal ---
  sales: ['^sales', '^ventas', 'sales experience', 'sales pipeline', 'b2b sales', 'outbound sales', 'prospecting', 'prospección', 'cold calling', 'quota attainment', 'experiencia en ventas', 'ventas b2b'],
  crm: ['crm', 'pipedrive', 'zoho crm'],
  'business-development': ['business development', 'desarrollo de negocio', 'lead generation', 'generación de leads'],
  negotiation: ['negotiation', 'negotiating', 'negociación'],
  contracts: ['contract drafting', 'contract negotiation', 'contract management', 'contratos'],
  compliance: ['compliance', 'regulatory', 'cumplimiento normativo', 'gdpr', 'sox', 'aml', 'kyc'],
  'corporate-law': ['corporate law', 'litigation', 'derecho corporativo', 'derecho mercantil', 'derecho laboral', 'intellectual property', 'propiedad intelectual', 'paralegal', '^attorney', '^counsel', '^abogado', '^abogada'],
  'data-privacy': ['data privacy', 'privacy law', 'ccpa', 'protección de datos', 'privacidad de datos'],
}

/**
 * Léxico GENERAL de tecnologías, herramientas y prácticas que aparecen en ofertas
 * de ingeniería. Ojo: esto NO mide nada y NO pertenece a ningún pack — es un
 * DETECTOR DE PUNTOS CIEGOS.
 *
 * Para qué: sin él, lo que un pack no sabe medir es invisible, y el readiness
 * contra una oferta sale calculado solo sobre lo que sí conoce. Eso sesga el
 * veredicto en la dirección más engañosa: cuanto más se aleja la oferta del pack,
 * mejor pinta el resultado. Con él, aptus puede decir "esta oferta también pide
 * kubernetes y kafka, y de eso no tengo ni idea de tu nivel".
 *
 * Por qué vive en código y no en el pack: los puntos ciegos son del MUNDO, no del
 * tema del pack — un pack no puede declarar lo que ignora. Y por qué su
 * incompletitud es aceptable: un término que falte aquí solo cuesta un aviso de
 * menos (el estado actual sin detector), nunca un falso positivo. Falla hacia el
 * silencio, no hacia la mentira.
 *
 * Los términos se buscan como PALABRA (ver `findTerm`), así que "java" no salta
 * con "javascript". Los que el pack ya cubre con sus keywords se descartan solos:
 * aquí no hace falta saber de qué va cada pack.
 */
export const TECH_LEXICON: string[] = [
  // Infra, nube y despliegue
  "kubernetes", "k8s", "docker", "terraform", "ansible", "aws", "gcp", "azure",
  "serverless", "lambda", "ci/cd", "jenkins", "github actions", "gitlab ci",
  "devops", "sre", "linux", "nginx", "helm", "openshift",
  // Datos y streaming
  "kafka", "spark", "airflow", "dbt", "snowflake", "databricks", "hadoop", "flink",
  "etl", "elt", "data warehouse", "data lake", "bigquery", "redshift",
  // Bases de datos
  "postgres", "postgresql", "mysql", "mongodb", "redis", "cassandra", "dynamodb",
  "elasticsearch", "neo4j", "clickhouse", "sqlite", "oracle",
  // Lenguajes y runtimes ajenos al pack. Nada de términos de una letra ni palabras
  // corrientes: un falso punto ciego ("the rest of the team" → "rest") destruye la
  // confianza en el aviso, que es justo lo que lo hace útil.
  "java", "kotlin", "scala", "golang", "rust", "c++", "c#", ".net", "php", "ruby",
  "swift", "objective-c", "perl", "matlab",
  // Frameworks y plataformas ajenos al pack
  "spring", "django", "flask", "fastapi", "laravel", "rails", "angular", "vue",
  "svelte", "flutter", "android", "ios", "react native", "unity", "unreal",
  "wordpress", "drupal", "salesforce", "sap", "sharepoint",
  // API y protocolos
  "graphql", "grpc", "soap", "websocket",
  // Observabilidad y calidad
  "prometheus", "grafana", "datadog", "sentry", "splunk", "new relic",
  "selenium", "cypress", "playwright", "junit", "sonarqube",
  // BI y visualización
  "tableau", "power bi", "looker", "qlik", "superset",
  // Otros dominios frecuentes
  "blockchain", "solidity", "web3", "iot", "embedded", "firmware", "cuda",
  "unreal engine", "figma", "seo", "scrum master", "jira",
];

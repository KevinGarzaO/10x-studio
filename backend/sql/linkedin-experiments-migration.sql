-- Experimento de formato de las publicaciones de LinkedIn. Se puede correr más de una vez.
--
-- Cada publicación guarda qué formato de texto llevó (`format`), de qué experimento fue (`experiment`, vacío si no participó) y en cuál
-- turno del día salió (`slot`, 1 a 4). La cuarta del día (18:30) alterna entre el texto de siempre y un texto con pregunta; las otras tres
-- no cambian. Las publicaciones anteriores quedan sin valor: se leen como «texto de siempre» y sin experimento.
--
-- Hasta que se corra esto el servidor publica igual (sin anotar el formato) y el reporte de LinkedIn sigue funcionando.
ALTER TABLE linkedin_vacancy_posts ADD COLUMN IF NOT EXISTS format     TEXT;
ALTER TABLE linkedin_vacancy_posts ADD COLUMN IF NOT EXISTS experiment TEXT;
ALTER TABLE linkedin_vacancy_posts ADD COLUMN IF NOT EXISTS slot       INT;

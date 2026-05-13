import fetch from 'node-fetch';

export class SearchService {
  /**
   * Obtiene las últimas noticias de IA desde Google News RSS (Gratis)
   */
  static async getLatestAINews(): Promise<string> {
    try {
      console.log('[SearchService] Buscando noticias reales en Google News...');
      // Buscamos tendencias de IA en español
      const url = `https://news.google.com/rss/search?q=inteligencia+artificial+news+ai&hl=es-419&gl=MX&ceid=MX:es-419`;
      
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Google News Error: ${res.status}`);
      
      const xml = await res.text();
      
      // Extraer títulos y links de forma simple con Regex para no añadir dependencias pesadas de XML
      const items = [];
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      const titleRegex = /<title>([\s\S]*?)<\/title>/;
      const linkRegex = /<link>([\s\S]*?)<\/link>/;
      const dateRegex = /<pubDate>([\s\S]*?)<\/pubDate>/;

      let match;
      while ((match = itemRegex.exec(xml)) !== null && items.length < 15) {
        const itemContent = match[1];
        const title = itemContent.match(titleRegex)?.[1] || '';
        const link = itemContent.match(linkRegex)?.[1] || '';
        const date = itemContent.match(dateRegex)?.[1] || '';
        
        if (title) {
          items.push(`- TÍTULO: ${title}\n  LINK: ${link}\n  FECHA: ${date}`);
        }
      }

      if (items.length === 0) return "No se encontraron noticias recientes.";

      return items.join('\n\n');
    } catch (error) {
      console.error('[SearchService] Error fetching news:', error);
      return "Error al obtener noticias de Google News.";
    }
  }
}

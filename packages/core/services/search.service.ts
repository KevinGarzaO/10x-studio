import fetch from 'node-fetch';

export class SearchService {
  /**
   * Obtiene las últimas noticias de IA desde Google News RSS (Gratis)
   * Filtra solo artículos de los últimos 7 días para evitar contenido obsoleto.
   */
  static async getLatestAINews(): Promise<string> {
    try {
      console.log('[SearchService] Buscando noticias reales en Google News...');
      // Buscamos tendencias de IA en español, enfocado en México
      const url = `https://news.google.com/rss/search?q=IA+inteligencia+artificial+2026&hl=es-419&gl=MX&ceid=MX:es-419`;
      
      const res = await fetch(url, { timeout: 10000 });
      if (!res.ok) throw new Error(`Google News Error: ${res.status}`);
      
      const xml = await res.text();
      
      // Extraer títulos, links y fechas
      const items: string[] = [];
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      const titleRegex = /<title>([\s\S]*?)<\/title>/;
      const linkRegex = /<link>([\s\S]*?)<\/link>/;
      const dateRegex = /<pubDate>([\s\S]*?)<\/pubDate>/;

      // Filtrar solo artículos de los últimos 7 días
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      let match;
      while ((match = itemRegex.exec(xml)) !== null && items.length < 15) {
        const itemContent = match[1];
        const title = itemContent.match(titleRegex)?.[1] || '';
        const link = itemContent.match(linkRegex)?.[1] || '';
        const dateStr = itemContent.match(dateRegex)?.[1] || '';
        
        if (title) {
          // Parsear fecha del RSS (formato: Thu, 20 Nov 2025 08:00:00 GMT)
          const pubDate = new Date(dateStr);
          if (pubDate >= sevenDaysAgo) {
            items.push(`- TÍTULO: ${title}\n  LINK: ${link}\n  FECHA: ${dateStr}`);
          }
        }
      }

      if (items.length === 0) {
        console.log('[SearchService] No se encontraron noticias frescas (<7 días). Intentando query más amplia...');
        // Fallback: buscar con query más reciente
        const fallbackUrl = `https://news.google.com/rss/search?q=artificial+intelligence+latest&hl=es-419&gl=US&ceid=US:en`;
        const fallbackRes = await fetch(fallbackUrl, { timeout: 10000 });
        if (fallbackRes.ok) {
          const fallbackXml = await fallbackRes.text();
          let fallbackMatch;
          while ((fallbackMatch = itemRegex.exec(fallbackXml)) !== null && items.length < 10) {
            const itemContent = fallbackMatch[1];
            const title = itemContent.match(titleRegex)?.[1] || '';
            const link = itemContent.match(linkRegex)?.[1] || '';
            const dateStr = itemContent.match(dateRegex)?.[1] || '';
            if (title) {
              const pubDate = new Date(dateStr);
              if (pubDate >= sevenDaysAgo) {
                items.push(`- TÍTULO: ${title}\n  LINK: ${link}\n  FECHA: ${dateStr}`);
              }
            }
          }
        }
      }

      if (items.length === 0) {
        console.log('[SearchService] Sin noticias frescas en ambos feeds. Usando noticias más recientes disponibles...');
        // Si no hay noticias frescas, tomar las más recientes sin filtro de fecha
        let latestMatch;
        const latestItems: string[] = [];
        while ((latestMatch = itemRegex.exec(xml)) !== null && latestItems.length < 10) {
          const itemContent = latestMatch[1];
          const title = itemContent.match(titleRegex)?.[1] || '';
          const link = itemContent.match(linkRegex)?.[1] || '';
          const dateStr = itemContent.match(dateRegex)?.[1] || '';
          if (title) {
            latestItems.push(`- TÍTULO: ${title}\n  LINK: ${link}\n  FECHA: ${dateStr}`);
          }
        }
        if (latestItems.length > 0) return latestItems.join('\n\n');
        return "No se encontraron noticias recientes.";
      }

      console.log(`[SearchService] Encontradas ${items.length} noticias frescas`);
      return items.join('\n\n');
    } catch (error) {
      console.error('[SearchService] Error fetching news:', error);
      return "Error al obtener noticias de Google News.";
    }
  }
}

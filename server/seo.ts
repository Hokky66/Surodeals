
/**
 * SEO utilities voor server-side SEO optimalisatie
 * Genereert sitemap.xml en robots.txt voor betere Google indexering
 */

import { storage } from "./storage";
import { generateAdMetaData, generateCategoryMetaData, generateHomepageMetaData } from "./seo/meta-generator";

/**
 * Genereer een XML sitemap met alle advertenties en categorieën
 * Dit helpt Google om alle pagina's te vinden en indexeren
 * @param baseUrl - De basis URL van de website
 * @returns XML string voor sitemap.xml
 */
export async function generateSitemap(baseUrl: string = "https://surodeals.com"): Promise<string> {
  try {
    console.log("🗺️ Genereren sitemap.xml...");
    
    // Haal alle goedgekeurde advertenties op
    const { ads } = await storage.getAds({ 
      limit: 10000, // Hoge limiet om alle advertenties te krijgen
      offset: 0 
    });

    // Haal alle categorieën op
    const categories = await storage.getCategories();

    // Start van XML sitemap
    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Hoofdpagina -->
  <url>
    <loc>${baseUrl}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  
  <!-- Contact pagina -->
  <url>
    <loc>${baseUrl}/contact</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>\n`;

    // Voeg alle categorieën toe aan sitemap
    for (const category of categories) {
      sitemap += `  <!-- Categorie: ${category.name} -->
  <url>
    <loc>${baseUrl}/category/${category.id}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>\n`;
    }

    // Voeg alle advertenties toe aan sitemap
    for (const ad of ads) {
      const lastmod = ad.updatedAt || ad.createdAt;
      const lastmodDate = new Date(lastmod!).toISOString().split('T')[0];
      
      sitemap += `  <!-- Advertentie: ${ad.title} -->
  <url>
    <loc>${baseUrl}/ad/${ad.id}</loc>
    <lastmod>${lastmodDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>\n`;
    }

    // Sluit de sitemap af
    sitemap += `</urlset>`;

    console.log(`✅ Sitemap gegenereerd met ${ads.length} advertenties en ${categories.length} categorieën`);
    return sitemap;
    
  } catch (error) {
    console.error("❌ Fout bij genereren sitemap:", error);
    // Return een basis sitemap als er een fout optreedt
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`;
  }
}

/**
 * Genereer robots.txt voor zoekmachine instructies
 * Blokkeert admin pagina's en geeft sitemap locatie aan
 * @param baseUrl - De basis URL van de website
 * @returns robots.txt content
 */
export function generateRobotsTxt(baseUrl: string = "https://surodeals.com"): string {
  return `# Robots.txt voor SuroDeals - Suriname Classifieds
# Dit bestand vertelt zoekmachines welke pagina's ze wel/niet mogen indexeren

# Sta alle zoekmachines toe om de website te indexeren
User-agent: *

# Blokkeer admin pagina's voor zoekmachines (voor veiligheid)
Disallow: /admin
Disallow: /api/admin/
Disallow: /api/auth/

# Blokkeer private routes
Disallow: /profile
Disallow: /debug-email-input.html

# Sta alle andere pagina's toe
Allow: /
Allow: /ad/
Allow: /category/
Allow: /contact

# Sitemap locatie (helpt Google alle pagina's te vinden)
Sitemap: ${baseUrl}/sitemap.xml

# Crawl-delay (beleefd zijn naar de server)
Crawl-delay: 1`;
}

/**
 * Genereer meta-tags voor de hoofdpagina
 * @returns Object met meta-tag informatie voor homepage
 */
export function generateHomepageMetaTags() {
  return {
    title: "SuroDeals - Gratis Advertenties in Suriname | Koop & Verkoop",
    description: "SuroDeals is dé plek voor gratis advertenties in Suriname. Koop en verkoop auto's, woningen, elektronica en meer. Dagelijks nieuwe advertenties!",
    image: "/images/placeholder.svg",
    url: "/",
    keywords: "suriname, advertenties, kopen, verkopen, auto, woning, elektronica, gratis, classifieds"
  };
}

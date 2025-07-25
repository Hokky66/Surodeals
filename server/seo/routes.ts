/**
 * SEO Routes
 * Handles dynamic meta-tags, sitemaps, and robots.txt
 */

import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { generateSitemap, generateRobotsTxt } from "../seo";
import { 
  generateAdMetaData, 
  generateCategoryMetaData, 
  generateHomepageMetaData,
  generateSearchMetaData,
  generatePageMetaData,
  generateMetaTagsHTML
} from "./meta-generator";

export function setupSEORoutes(app: Express) {
  const baseUrl = process.env.NODE_ENV === 'production' 
    ? 'https://surodeals.com' 
    : 'http://localhost:5000';

  /**
   * GET /sitemap.xml
   * Generate dynamic XML sitemap
   */
  app.get('/sitemap.xml', async (req: Request, res: Response) => {
    try {
      const sitemap = await generateSitemap(baseUrl);
      res.set('Content-Type', 'text/xml');
      res.send(sitemap);
    } catch (error) {
      console.error('Sitemap generation error:', error);
      res.status(500).send('Sitemap generation failed');
    }
  });

  /**
   * GET /robots.txt
   * Generate robots.txt file
   */
  app.get('/robots.txt', (req: Request, res: Response) => {
    try {
      const robotsTxt = generateRobotsTxt(baseUrl);
      res.set('Content-Type', 'text/plain');
      res.send(robotsTxt);
    } catch (error) {
      console.error('Robots.txt generation error:', error);
      res.status(500).send('Robots.txt generation failed');
    }
  });

  /**
   * GET /api/seo/meta/ad/:id
   * Get SEO meta data for specific ad
   */
  app.get('/api/seo/meta/ad/:id', async (req: Request, res: Response) => {
    try {
      const adId = parseInt(req.params.id);
      const ad = await storage.getAd(adId);
      
      if (!ad) {
        return res.status(404).json({ error: 'Ad not found' });
      }

      // Get category name from categoryId
      const categories = await storage.getCategories();
      const category = categories.find(c => c.id === ad.categoryId);
      
      // Transform ad data for meta generator
      const adData = {
        id: ad.id,
        title: ad.title,
        description: ad.description || '',
        price: ad.price || 0,
        location: ad.location || 'Suriname',
        category: category?.name || 'Algemeen',
        images: ad.images || []
      };

      const metaData = generateAdMetaData(adData, baseUrl);
      const metaHTML = generateMetaTagsHTML(metaData);

      res.json({
        metaData,
        metaHTML
      });
    } catch (error) {
      console.error('Ad meta generation error:', error);
      res.status(500).json({ error: 'Meta generation failed' });
    }
  });

  /**
   * GET /api/seo/meta/category/:slug
   * Get SEO meta data for category
   */
  app.get('/api/seo/meta/category/:slug', async (req: Request, res: Response) => {
    try {
      const categorySlug = req.params.slug;
      const categories = await storage.getCategories();
      const category = categories.find(c => c.slug === categorySlug);
      
      if (!category) {
        return res.status(404).json({ error: 'Category not found' });
      }

      // Get ad count for this category
      const { total } = await storage.getAds({ 
        categoryId: category.id,
        limit: 1,
        offset: 0 
      });

      const categoryData = {
        name: category.name,
        slug: category.slug,
        description: `Alle ${category.name.toLowerCase()} advertenties in Suriname`
      };

      const metaData = generateCategoryMetaData(categoryData, total, baseUrl);
      const metaHTML = generateMetaTagsHTML(metaData);

      res.json({
        metaData,
        metaHTML
      });
    } catch (error) {
      console.error('Category meta generation error:', error);
      res.status(500).json({ error: 'Meta generation failed' });
    }
  });

  /**
   * GET /api/seo/meta/homepage
   * Get SEO meta data for homepage
   */
  app.get('/api/seo/meta/homepage', async (req: Request, res: Response) => {
    try {
      // Get total ad count
      const { total } = await storage.getAds({ 
        limit: 1,
        offset: 0 
      });

      const metaData = generateHomepageMetaData(total, baseUrl);
      const metaHTML = generateMetaTagsHTML(metaData);

      res.json({
        metaData,
        metaHTML
      });
    } catch (error) {
      console.error('Homepage meta generation error:', error);
      res.status(500).json({ error: 'Meta generation failed' });
    }
  });

  /**
   * GET /api/seo/meta/search
   * Get SEO meta data for search results
   */
  app.get('/api/seo/meta/search', async (req: Request, res: Response) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ error: 'Search query required' });
      }

      // Get search result count
      const { total } = await storage.getAds({ 
        search: query,
        limit: 1,
        offset: 0 
      });

      const metaData = generateSearchMetaData(query, total, baseUrl);
      const metaHTML = generateMetaTagsHTML(metaData);

      res.json({
        metaData,
        metaHTML
      });
    } catch (error) {
      console.error('Search meta generation error:', error);
      res.status(500).json({ error: 'Meta generation failed' });
    }
  });

  /**
   * GET /api/seo/structured-data/ads
   * Get structured data for featured ads
   */
  app.get('/api/seo/structured-data/ads', async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const { ads } = await storage.getAds({ 
        limit,
        offset: 0
      });

      const structuredData = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": "Featured Advertisements - SuroDeals",
        "description": "Latest featured advertisements on SuroDeals Suriname",
        "url": baseUrl,
        "numberOfItems": ads.length,
        "itemListElement": ads.map((ad, index) => ({
          "@type": "ListItem",
          "position": index + 1,
          "item": {
            "@type": "Product",
            "name": ad.title,
            "description": ad.description,
            "url": `${baseUrl}/ad/${ad.id}`,
            "image": ad.images?.[0] || `${baseUrl}/images/default-ad.jpg`,
            "offers": {
              "@type": "Offer",
              "price": ad.price,
              "priceCurrency": "EUR",
              "availability": "https://schema.org/InStock"
            }
          }
        }))
      };

      res.json(structuredData);
    } catch (error) {
      console.error('Structured data generation error:', error);
      res.status(500).json({ error: 'Structured data generation failed' });
    }
  });

  /**
   * GET /google-search-console-verification.html
   * Google Search Console verification file
   */
  app.get('/google-search-console-verification.html', (req: Request, res: Response) => {
    const verificationCode = process.env.GOOGLE_SEARCH_CONSOLE_CODE || 'your-verification-code-here';
    const html = `google-site-verification: ${verificationCode}`;
    res.set('Content-Type', 'text/html');
    res.send(html);
  });

  /**
   * GET /.well-known/security.txt
   * Security policy file
   */
  app.get('/.well-known/security.txt', (req: Request, res: Response) => {
    const securityTxt = `Contact: mailto:security@surodeals.com
Expires: 2025-12-31T23:59:59.000Z
Encryption: https://surodeals.com/pgp-key.txt
Preferred-Languages: nl, en
Canonical: https://surodeals.com/.well-known/security.txt`;
    
    res.set('Content-Type', 'text/plain');
    res.send(securityTxt);
  });
}
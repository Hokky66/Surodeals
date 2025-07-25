/**
 * SEO Meta Tags Generator
 * Genereert dynamische meta-tags voor advertenties, categorieën en pagina's
 */

interface MetaData {
  title: string;
  description: string;
  keywords: string[];
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogUrl?: string;
  canonical?: string;
  structuredData?: any;
}

interface Ad {
  id: number;
  title: string;
  description: string;
  price: number;
  location: string;
  category: string;
  images: string[];
}

interface Category {
  name: string;
  slug: string;
  description?: string;
}

/**
 * Genereer SEO meta-data voor advertentie pagina's
 */
export function generateAdMetaData(ad: Ad, baseUrl: string = "https://surodeals.com"): MetaData {
  const title = `${ad.title} - ${ad.category} | SuroDeals`;
  const description = `${ad.description.substring(0, 150)}... Prijs: €${ad.price} in ${ad.location}. Bekijk nu op SuroDeals Suriname.`;
  const keywords = [
    ad.title.split(' ').slice(0, 3).join(' '),
    ad.category.toLowerCase(),
    ad.location.toLowerCase(),
    'suriname',
    'kopen',
    'verkopen',
    'advertentie'
  ];

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": ad.title,
    "description": ad.description,
    "offers": {
      "@type": "Offer",
      "price": ad.price,
      "priceCurrency": "EUR",
      "availability": "https://schema.org/InStock",
      "seller": {
        "@type": "Organization",
        "name": "SuroDeals"
      }
    },
    "image": ad.images.length > 0 ? ad.images[0] : `${baseUrl}/images/default-ad.jpg`,
    "url": `${baseUrl}/ad/${ad.id}`,
    "category": ad.category,
    "location": {
      "@type": "Place",
      "name": ad.location
    }
  };

  return {
    title,
    description,
    keywords,
    ogTitle: title,
    ogDescription: description,
    ogImage: ad.images.length > 0 ? ad.images[0] : `${baseUrl}/images/surodeals-og.jpg`,
    ogUrl: `${baseUrl}/ad/${ad.id}`,
    canonical: `${baseUrl}/ad/${ad.id}`,
    structuredData
  };
}

/**
 * Genereer SEO meta-data voor categorie pagina's
 */
export function generateCategoryMetaData(category: Category, adCount: number, baseUrl: string = "https://surodeals.com"): MetaData {
  const title = `${category.name} - ${adCount} advertenties | SuroDeals Suriname`;
  const description = `Ontdek ${adCount} ${category.name.toLowerCase()} advertenties in Suriname. Koop en verkoop ${category.name.toLowerCase()} op SuroDeals, de grootste marktplaats van Suriname.`;
  const keywords = [
    category.name.toLowerCase(),
    'suriname',
    'kopen',
    'verkopen',
    'advertenties',
    'marktplaats',
    category.name.toLowerCase() + ' suriname'
  ];

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": `${category.name} - SuroDeals`,
    "description": description,
    "url": `${baseUrl}/category/${category.slug}`,
    "mainEntity": {
      "@type": "ItemList",
      "numberOfItems": adCount,
      "itemListElement": []
    },
    "breadcrumb": {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "Home",
          "item": baseUrl
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": category.name,
          "item": `${baseUrl}/category/${category.slug}`
        }
      ]
    }
  };

  return {
    title,
    description,
    keywords,
    ogTitle: title,
    ogDescription: description,
    ogImage: `${baseUrl}/images/categories/${category.slug}.jpg`,
    ogUrl: `${baseUrl}/category/${category.slug}`,
    canonical: `${baseUrl}/category/${category.slug}`,
    structuredData
  };
}

/**
 * Genereer SEO meta-data voor homepage
 */
export function generateHomepageMetaData(totalAds: number, baseUrl: string = "https://surodeals.com"): MetaData {
  const title = "SuroDeals - Koop & Verkoop in Suriname | Gratis Advertenties";
  const description = `De grootste online marktplaats van Suriname met ${totalAds}+ advertenties. Koop en verkoop auto's, woningen, telefoons en meer. Gratis adverteren!`;
  const keywords = [
    'suriname',
    'marktplaats',
    'advertenties',
    'kopen',
    'verkopen',
    'auto\'s',
    'woningen',
    'telefoons',
    'gratis',
    'surodeals'
  ];

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "SuroDeals",
    "description": description,
    "url": baseUrl,
    "potentialAction": {
      "@type": "SearchAction",
      "target": `${baseUrl}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string"
    },
    "publisher": {
      "@type": "Organization",
      "name": "SuroDeals",
      "url": baseUrl,
      "logo": `${baseUrl}/images/logo.png`
    }
  };

  return {
    title,
    description,
    keywords,
    ogTitle: title,
    ogDescription: description,
    ogImage: `${baseUrl}/images/surodeals-og.jpg`,
    ogUrl: baseUrl,
    canonical: baseUrl,
    structuredData
  };
}

/**
 * Genereer SEO meta-data voor zoekpagina's
 */
export function generateSearchMetaData(query: string, resultCount: number, baseUrl: string = "https://surodeals.com"): MetaData {
  const title = `"${query}" - ${resultCount} resultaten | SuroDeals Suriname`;
  const description = `${resultCount} advertenties gevonden voor "${query}" in Suriname. Bekijk alle resultaten op SuroDeals, de grootste marktplaats van Suriname.`;
  const keywords = [
    query.toLowerCase(),
    'zoeken',
    'suriname',
    'advertenties',
    'resultaten',
    'surodeals'
  ];

  return {
    title,
    description,
    keywords,
    ogTitle: title,
    ogDescription: description,
    ogImage: `${baseUrl}/images/surodeals-og.jpg`,
    ogUrl: `${baseUrl}/search?q=${encodeURIComponent(query)}`,
    canonical: `${baseUrl}/search?q=${encodeURIComponent(query)}`
  };
}

/**
 * Genereer algemene pagina meta-data
 */
export function generatePageMetaData(
  pageTitle: string, 
  pageDescription: string, 
  pagePath: string,
  baseUrl: string = "https://surodeals.com"
): MetaData {
  const title = `${pageTitle} | SuroDeals Suriname`;
  const description = pageDescription;
  const keywords = [
    pageTitle.toLowerCase(),
    'suriname',
    'surodeals',
    'marktplaats'
  ];

  return {
    title,
    description,
    keywords,
    ogTitle: title,
    ogDescription: description,
    ogImage: `${baseUrl}/images/surodeals-og.jpg`,
    ogUrl: `${baseUrl}${pagePath}`,
    canonical: `${baseUrl}${pagePath}`
  };
}

/**
 * Genereer HTML meta tags string
 */
export function generateMetaTagsHTML(metaData: MetaData): string {
  const tags = [
    `<title>${metaData.title}</title>`,
    `<meta name="description" content="${metaData.description}">`,
    `<meta name="keywords" content="${metaData.keywords.join(', ')}">`,
    `<link rel="canonical" href="${metaData.canonical}">`,
    
    // Open Graph tags
    `<meta property="og:title" content="${metaData.ogTitle || metaData.title}">`,
    `<meta property="og:description" content="${metaData.ogDescription || metaData.description}">`,
    `<meta property="og:image" content="${metaData.ogImage || ''}">`,
    `<meta property="og:url" content="${metaData.ogUrl || ''}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="SuroDeals">`,
    
    // Twitter Card tags
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${metaData.ogTitle || metaData.title}">`,
    `<meta name="twitter:description" content="${metaData.ogDescription || metaData.description}">`,
    `<meta name="twitter:image" content="${metaData.ogImage || ''}">`,
    
    // Structured data
    metaData.structuredData ? `<script type="application/ld+json">${JSON.stringify(metaData.structuredData, null, 2)}</script>` : ''
  ];

  return tags.filter(Boolean).join('\n    ');
}
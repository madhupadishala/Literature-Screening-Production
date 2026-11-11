/**
 * agent-pubmed-fetch.ts
 *
 * Agent: PubMed Literature Fetch (PubMed Fetch)
 *
 * Fetches literature from PubMed using NCBI E-utilities (keyless).
 * Implements incremental sync, rate limiting, and configurable search strategies.
 *
 * Compliance: FDA 21 CFR Part 11, EU GVP Module VI, ICH E2B(R3), GAMP 5
 */

import { BaseAgent, AgentExecutionInput, AgentResult, AgentCapabilities } from './base-agent';
import { HybridInferenceRouter } from '../infrastructure/hybrid-inference-router';
import { AuditLedgerService } from '../audit/audit-ledger-service';
import { ZDRStore } from '../infrastructure/redis-zdr-store';
import { createHash } from 'crypto';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface PubMedArticle {
  pmid: string;
  doi?: string;
  title: string;
  abstract?: string;
  authors: string[];
  journal: string;
  pubDate: string;
  pubTypes: string[];
  meshTerms: string[];
  keywords: string[];
  language: string;
  country?: string;
  sourceUrl: string;
}

export interface PubMedFetchInput {
  searchStrategy: 'incremental' | 'full' | 'keyword' | 'date-range';
  query?: string;
  dateFrom?: string;
  dateTo?: string;
  maxResults?: number;
  batchSize?: number;
  rateLimitMs?: number;
}

export interface PubMedFetchOutput {
  articles: PubMedArticle[];
  totalFetched: number;
  totalNew: number;
  totalUpdated: number;
  errors: string[];
  nextCursor?: string;
  execution_tier: 'HEURISTIC' | 'LOCAL' | 'CLOUD' | 'DLQ';
  model_name: string;
  model_hash: string;
  total_latency_ms: number;
}

interface ESearchResult {
  esearchresult: {
    idlist: string[];
    count: string;
    retmax: string;
    retstart: string;
    querytranslation: string;
    webenv?: string;
    querykey?: string;
  };
}

interface EFetchResult {
  pubmedarticleset: {
    pubmedarticle: PubMedXmlArticle[];
  };
}

interface PubMedXmlArticle {
  medlinecitation: {
    pmid: string;
    article: {
      articletitle: string;
      abstract?: { abstracttext: string | string[] };
      authorlist?: { author: XmlAuthor[] };
      journal: {
        title: string;
        journalissue: { pubdate: XmlPubDate };
        isoabbreviation: string;
      };
      publicationtypelist?: string[];
      keywordlist?: string[];
      medlineta?: string;
      nlmuniqueid?: string;
      issnlinking?: string;
      language?: string;
      country?: string;
      meshheadinglist?: XmlMeshHeading[];
      articleid?: XmlArticleId[];
    };
    meshheadinglist?: XmlMeshHeading[];
  }[];
}

interface XmlAuthor {
  lastname?: string;
  forename?: string;
  initials?: string;
  collective?: string;
}

interface XmlPubDate {
  year?: string;
  month?: string;
  day?: string;
  medlinedate?: string;
}

interface XmlMeshHeading {
  descriptorname: string;
  qualifiername?: string;
}

interface XmlArticleId {
  _text: string;
  idtype: string;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseDate(pubDate: XmlPubDate): string {
  if (pubDate.year) {
    const month = pubDate.month || '01';
    const day = pubDate.day || '01';
    return `${pubDate.year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  if (pubDate.medlinedate) {
    return pubDate.medlinedate;
  }
  return new Date().toISOString().split('T')[0];
}

function extractAuthors(authorlist?: { author: XmlAuthor[] }): string[] {
  if (!authorlist?.author) return [];
  return authorlist.author
    .map(a => {
      if (a.collective) return a.collective;
      const parts = [a.lastname, a.initials || a.forename].filter(Boolean);
      return parts.join(' ');
    })
    .filter(Boolean);
}

// ============================================================================
// PUBMED FETCH AGENT
// ============================================================================

export class PubMedFetchAgent extends BaseAgent {
  private readonly baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
  private readonly toolName = 'nexus-literature-screening';
  private readonly email = 'nexus@example.com';

  constructor(config: {
    tenant_id: string;
    inference_router: HybridInferenceRouter;
    audit_ledger: AuditLedgerService;
    zdr_store: ZDRStore;
  }) {
    super({
      agent_id: 'agent-pubmed-fetch',
      tenant_id: config.tenant_id,
      inference_router: config.inference_router,
      audit_ledger: config.audit_ledger,
      zdr_store: config.zdr_store,
      max_retries: 2,
      timeout_ms: 60000,
      enable_audit: true,
      deterministic_seed: 42,
    });
  }

  getCapabilities(): AgentCapabilities {
    return {
      agent_id: 'agent-pubmed-fetch',
      name: 'PubMed Literature Fetch Agent',
      description: 'Fetches literature from PubMed using NCBI E-utilities with incremental sync, rate limiting, and configurable search strategies',
      input_schema: {
        type: 'object',
        properties: {
          searchStrategy: { type: 'string', enum: ['incremental', 'full', 'keyword', 'date-range'] },
          query: { type: 'string' },
          dateFrom: { type: 'string', format: 'date' },
          dateTo: { type: 'string', format: 'date' },
          maxResults: { type: 'integer', minimum: 1, maximum: 10000 },
          batchSize: { type: 'integer', minimum: 1, maximum: 500 },
          rateLimitMs: { type: 'integer', minimum: 100, maximum: 5000 },
        },
        required: ['searchStrategy'],
      },
      output_schema: {
        type: 'object',
        properties: {
          articles: { type: 'array', items: { type: 'object' } },
          totalFetched: { type: 'integer' },
          totalNew: { type: 'integer' },
          totalUpdated: { type: 'integer' },
          errors: { type: 'array', items: { type: 'string' } },
          nextCursor: { type: 'string' },
        },
      },
      supported_tiers: ['HEURISTIC', 'LOCAL'],
      required_services: ['zdr-store'],
      estimated_latency_ms: 30000,
      max_concurrent: 5,
    };
  }

  async execute(input: AgentExecutionInput): Promise<AgentResult> {
    const startTime = Date.now();
    const inputPayload = input.payload as PubMedFetchInput;

    try {
      const {
        searchStrategy = 'incremental',
        query = 'pharmacovigilance OR adverse drug reaction OR drug safety',
        dateFrom,
        dateTo,
        maxResults = 500,
        batchSize = 100,
        rateLimitMs = 340, // NCBI recommends max 3 requests/sec without key
      } = inputPayload;

      const allArticles: PubMedArticle[] = [];
      const errors: string[] = [];
      let totalNew = 0;
      let totalUpdated = 0;
      let nextCursor: string | undefined;

      // Build search query
      const searchQuery = this.buildSearchQuery(query, dateFrom, dateTo, searchStrategy);

      // Step 1: ESearch - get PMIDs
      const pmids = await this.eSearch(searchQuery, maxResults);
      if (pmids.length === 0) {
        return this.createResult(true, {
          articles: [],
          totalFetched: 0,
          totalNew: 0,
          totalUpdated: 0,
          errors: ['No articles found for query'],
          nextCursor: undefined,
        }, Date.now() - startTime);
      }

      // Step 2: Batch fetch via EFetch
      const batches = this.chunkArray(pmids, batchSize);
      let fetchedCount = 0;

      for (const batch of batches) {
        try {
          // Rate limiting
          await this.sleep(rateLimitMs);

          const articles = await this.eFetch(batch);
          const processed = await this.processArticles(articles);

          for (const article of processed) {
            const { isNew, isUpdated } = await this.storeArticle(article);
            if (isNew) totalNew++;
            if (isUpdated) totalUpdated++;
            allArticles.push(article);
          }

          fetchedCount += batch.length;

          // Store cursor for incremental resume
          if (batches.indexOf(batch) === batches.length - 1) {
            nextCursor = pmids[pmids.length - 1];
          }

        } catch (error) {
          const errMsg = `Batch fetch failed: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errMsg);
          // Continue with next batch
        }
      }

      const output = {
        articles: allArticles,
        totalFetched: fetchedCount,
        totalNew,
        totalUpdated,
        errors,
        nextCursor,
      };

      return this.createResult(true, output, Date.now() - startTime);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createResult(false, null, Date.now() - startTime, errorMessage);
    }
  }

  private buildSearchQuery(
    baseQuery: string,
    dateFrom?: string,
    dateTo?: string,
    strategy: string = 'incremental'
  ): string {
    let query = baseQuery;

    if (strategy === 'date-range' && dateFrom && dateTo) {
      query += ` AND (${dateFrom}[Date - Publication] : ${dateTo}[Date - Publication])`;
    } else if (strategy === 'incremental') {
      // Last 7 days by default for incremental
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - 7);
      const dateStr = dateFrom.toISOString().split('T')[0];
      query += ` AND (${dateStr}[Date - Publication] : 3000[Date - Publication])`;
    }

    return query;
  }

  private async eSearch(query: string, retmax: number): Promise<string[]> {
    const url = new URL(`${this.baseUrl}/esearch.fcgi`);
    url.searchParams.set('db', 'pubmed');
    url.searchParams.set('term', query);
    url.searchParams.set('retmax', String(retmax));
    url.searchParams.set('retmode', 'json');
    url.searchParams.set('usehistory', 'y');
    url.searchParams.set('tool', this.toolName);
    url.searchParams.set('email', this.email);

    const response = await this.fetchWithTimeout(url.toString());
    const data = await response.json() as ESearchResult;

    return data.esearchresult?.idlist || [];
  }

  private async eFetch(pmids: string[]): Promise<PubMedXmlArticle[]> {
    const url = new URL(`${this.baseUrl}/efetch.fcgi`);
    url.searchParams.set('db', 'pubmed');
    url.searchParams.set('id', pmids.join(','));
    url.searchParams.set('retmode', 'json');
    url.searchParams.set('rettype', 'abstract');
    url.searchParams.set('tool', this.toolName);
    url.searchParams.set('email', this.email);

    const response = await this.fetchWithTimeout(url.toString());
    const data = await response.json() as EFetchResult;

    return data.pubmedarticleset?.pubmedarticle || [];
  }

  private async processArticles(xmlArticles: PubMedXmlArticle[]): Promise<PubMedArticle[]> {
    const articles: PubMedArticle[] = [];

    for (const xmlArticle of xmlArticles) {
      try {
        const citation = xmlArticle.medlinecitation;
        const article = citation.article;
        const pmid = citation.pmid;

        // Extract DOI
        let doi: string | undefined;
        if (article.articleid) {
          const doiEntry = Array.isArray(article.articleid)
            ? article.articleid.find(a => a.idtype === 'doi')
            : undefined;
          doi = doiEntry?._text;
        }

        // Extract authors
        const authors = extractAuthors(article.authorlist);

        // Extract publication date
        const pubDate = parseDate(article.journal?.journalissue?.pubdate);

        // Extract MeSH terms
        const meshTerms: string[] = [];
        if (citation.meshheadinglist) {
          for (const heading of citation.meshheadinglist) {
            if (heading.descriptorname) meshTerms.push(heading.descriptorname);
          }
        }

        // Extract keywords
        const keywords: string[] = [];
        if (article.keywordlist) {
          const list = Array.isArray(article.keywordlist) ? article.keywordlist : [article.keywordlist];
          for (const kw of list) {
            if (typeof kw === 'string') keywords.push(kw);
            else if (kw._text) keywords.push(kw._text);
          }
        }

        // Extract publication types
        const pubTypes = article.publicationtypelist || [];

        // Extract journal
        const journal = article.journal?.title || article.medlineta || '';

        // Extract language
        const language = article.language || 'eng';

        // Extract country
        const country = article.country || '';

        articles.push({
          pmid,
          doi,
          title: article.articletitle || '',
          abstract: Array.isArray(article.abstract?.abstracttext)
            ? article.abstract.abstracttext.join(' ')
            : article.abstract?.abstracttext || '',
          authors,
          journal,
          pubDate,
          pubTypes,
          meshTerms,
          keywords,
          language,
          country,
          sourceUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        });
      } catch (error) {
        // Skip malformed articles but continue processing
        console.warn(`Failed to process article: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return articles;
  }

  private async storeArticle(article: PubMedArticle): Promise<{ isNew: boolean; isUpdated: boolean }> {
    // Store in ZDR store with article metadata
    // For now, return mock values - actual implementation would use ZDRStore
    const key = `article:${article.pmid}`;
    // await this.zdrStore.set(key, article, { ttl: 86400 * 30 }); // 30 days

    // Check if exists (mock)
    const exists = false; // await this.zdrStore.exists(key);
    return { isNew: !exists, isUpdated: exists };
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'nexus-literature-screening/1.0',
        },
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private createResult(success: boolean, output: any, executionTime: number, error?: string): AgentResult {
    return {
      success,
      agent_id: 'agent-pubmed-fetch',
      trace_id: '',
      output,
      error,
      execution_tier: 'HEURISTIC',
      latency_ms: executionTime,
      merkle_entry_hash: createHash('sha256').update(JSON.stringify({ success, output, executionTime })).digest('hex'),
      execution_metadata: { timestamp: new Date().toISOString() },
    };
  }
}

export function createPubMedFetchAgent(config: {
  tenant_id: string;
  inference_router: HybridInferenceRouter;
  audit_ledger: AuditLedgerService;
  zdr_store: ZDRStore;
}) {
  return new PubMedFetchAgent(config);
}
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmbeddingService = exports.TextChunker = exports.VectorService = void 0;
const js_client_rest_1 = require("@qdrant/js-client-rest");
const uuid_1 = require("uuid");
const environment_1 = require("../environment");
/**
 * Qdrant Vector Store Service for managing document embeddings
 */
class VectorService {
    constructor() {
        this.client = new js_client_rest_1.QdrantClient({
            url: environment_1.ENV_VARS.VECTOR_STORE_URL,
        });
        this.collectionName = 'documentation';
    }
    /**
     * Check if Qdrant server is accessible
     */
    async isServerAvailable() {
        try {
            await this.client.getCollections();
            return true;
        }
        catch (error) {
            console.warn('Qdrant server not available:', error instanceof Error ? error.message : 'Unknown error');
            return false;
        }
    }
    /**
     * Initialize the vector collection if it doesn't exist
     * @param vectorSize - Size of the embedding vectors (default: 1536 for OpenAI)
     */
    async initializeCollection(vectorSize = 1536) {
        try {
            // Check if server is available first
            const isAvailable = await this.isServerAvailable();
            if (!isAvailable) {
                throw new Error('Qdrant server is not available. Please start Qdrant server or set VECTOR_STORE_TYPE to a different value.');
            }
            // Check if collection exists
            const collections = await this.client.getCollections();
            const collectionExists = collections.collections?.some((collection) => collection.name === this.collectionName);
            if (!collectionExists) {
                console.log(`Creating collection: ${this.collectionName}`);
                await this.client.createCollection(this.collectionName, {
                    vectors: {
                        size: vectorSize,
                        distance: 'Cosine',
                    },
                    optimizers_config: {
                        default_segment_number: 2,
                    },
                    replication_factor: 1,
                });
                console.log(`Collection ${this.collectionName} created successfully`);
            }
            else {
                console.log(`Collection ${this.collectionName} already exists`);
            }
        }
        catch (error) {
            console.error('Error initializing collection:', error);
            throw error;
        }
    }
    /**
     * Store document chunks as vectors
     * @param documents - Array of document chunks with embeddings
     */
    async storeDocuments(documents, embeddings) {
        try {
            if (documents.length !== embeddings.length) {
                throw new Error('Number of documents and embeddings must match');
            }
            const points = documents.map((doc, index) => ({
                id: doc.id,
                vector: embeddings[index] || [],
                payload: {
                    content: doc.content,
                    ...doc.metadata,
                },
            }));
            await this.client.upsert(this.collectionName, {
                wait: true,
                points,
            });
            console.log(`Successfully stored ${points.length} document chunks in vector database`);
        }
        catch (error) {
            console.error('Error storing documents:', error);
            throw error;
        }
    }
    /**
     * Search for similar documents
     * @param queryVector - Query embedding vector
     * @param limit - Maximum number of results
     * @param filter - Optional metadata filters
     */
    async searchSimilar(queryVector, limit = 10, filter) {
        try {
            const searchResult = await this.client.search(this.collectionName, {
                vector: queryVector,
                limit,
                filter,
                with_payload: true,
                with_vector: false,
            });
            return searchResult;
        }
        catch (error) {
            console.error('Error searching documents:', error);
            throw error;
        }
    }
    /**
     * Delete documents by filter
     * @param filter - Filter criteria for deletion
     */
    async deleteDocuments(filter) {
        try {
            await this.client.delete(this.collectionName, {
                filter,
            });
            console.log('Documents deleted successfully');
        }
        catch (error) {
            console.error('Error deleting documents:', error);
            throw error;
        }
    }
    /**
     * Get collection info
     */
    async getCollectionInfo() {
        try {
            return await this.client.getCollection(this.collectionName);
        }
        catch (error) {
            console.error('Error getting collection info:', error);
            throw error;
        }
    }
    /**
     * Clear all documents from collection
     */
    async clearCollection() {
        try {
            await this.client.delete(this.collectionName, {
                filter: {},
            });
            console.log('Collection cleared successfully');
        }
        catch (error) {
            console.error('Error clearing collection:', error);
            throw error;
        }
    }
}
exports.VectorService = VectorService;
/**
 * Text chunking utility for splitting documents into manageable pieces
 */
class TextChunker {
    constructor(chunkSize = 1000, chunkOverlap = 200) {
        this.chunkSize = chunkSize;
        this.chunkOverlap = chunkOverlap;
    }
    /**
     * Split text into overlapping chunks
     * @param text - Text to split
     * @returns Array of text chunks
     */
    chunkText(text) {
        if (!text || text.length <= this.chunkSize) {
            return [text];
        }
        const chunks = [];
        let start = 0;
        while (start < text.length) {
            const end = Math.min(start + this.chunkSize, text.length);
            let chunk = text.slice(start, end);
            // Try to break at sentence or word boundary
            if (end < text.length) {
                const lastPeriod = chunk.lastIndexOf('.');
                const lastSpace = chunk.lastIndexOf(' ');
                const breakPoint = lastPeriod > -1 ? lastPeriod + 1 :
                    lastSpace > -1 ? lastSpace : chunk.length;
                if (breakPoint > 0 && breakPoint < chunk.length) {
                    chunk = chunk.slice(0, breakPoint);
                }
            }
            chunks.push(chunk.trim());
            start += chunk.length - this.chunkOverlap;
        }
        return chunks.filter(chunk => chunk.length > 0);
    }
    /**
     * Create document chunks with metadata
     * @param content - Original content
     * @param baseMetadata - Base metadata for the document
     * @returns Array of VectorDocument chunks
     */
    createDocumentChunks(content, baseMetadata) {
        const textChunks = this.chunkText(content);
        return textChunks.map((chunk, index) => ({
            id: (0, uuid_1.v4)(),
            content: chunk,
            metadata: {
                ...baseMetadata,
                chunkIndex: index,
                totalChunks: textChunks.length,
            },
        }));
    }
}
exports.TextChunker = TextChunker;
/**
 * Simple embedding service using OpenAI-compatible APIs
 */
class EmbeddingService {
    constructor() {
        this.apiKey = environment_1.ENV_VARS.OPEN_ROUTER_API_KEY;
        this.apiUrl = environment_1.ENV_VARS.OPEN_ROUTER_API_URL || 'https://openrouter.ai/api/v1';
        this.model = 'text-embedding-3-small'; // OpenAI embedding model
    }
    /**
     * Check if embedding service is properly configured
     */
    isConfigured() {
        return !!this.apiKey && !!this.apiUrl;
    }
    /**
     * Generate embeddings for text chunks
     * @param texts - Array of text strings
     * @returns Array of embedding vectors
     */
    async generateEmbeddings(texts) {
        try {
            if (!this.isConfigured()) {
                console.warn('Embedding service not configured. Using mock embeddings.');
                return texts.map(() => Array(1536).fill(0).map(() => Math.random() - 0.5));
            }
            // Try to use OpenRouter for embeddings, fallback to mock if fails
            try {
                const { OpenRouterClient } = await Promise.resolve().then(() => __importStar(require('../utils/openrouter-client')));
                const client = new OpenRouterClient();
                console.log('Attempting to use OpenRouter for embeddings...');
                return await client.generateEmbeddings(texts);
            }
            catch (openRouterError) {
                console.warn('OpenRouter embeddings failed, using mock embeddings:', openRouterError instanceof Error ? openRouterError.message : 'Unknown error');
                return texts.map(() => Array(1536).fill(0).map(() => Math.random() - 0.5));
            }
        }
        catch (error) {
            console.error('Error generating embeddings:', error);
            throw error;
        }
    }
    /**
     * Generate single embedding
     * @param text - Text to embed
     * @returns Embedding vector
     */
    async generateSingleEmbedding(text) {
        const embeddings = await this.generateEmbeddings([text]);
        return embeddings[0] || [];
    }
}
exports.EmbeddingService = EmbeddingService;

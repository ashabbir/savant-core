
/**
 * Base Adapter for LLM Providers
 */
export default class BaseAdapter {
    constructor(provider) {
        this.provider = provider;
        this.apiKey = null;
        this.baseUrl = provider.baseUrl;
    }

    /**
     * Set the decrypted API key
     * @param {string} key 
     */
    setApiKey(key) {
        this.apiKey = key;
    }

    /**
     * Test connection to the provider
     * @returns {Promise<{ status: 'valid'|'invalid', message: string, latencyMs: number }>}
     */
    async testConnection() {
        throw new Error('Not implemented');
    }

    /**
     * Discover available models from the provider
     * @returns {Promise<Array<{ providerModelId: string, displayName: string, modality: string[], contextWindow?: number, inputCostPer1k?: number, outputCostPer1k?: number }>>}
     */
    async discoverModels() {
        throw new Error('Not implemented');
    }

    /**
     * Get credentials for Talon
     * @returns {{ apiKey?: string, baseUrl?: string }}
     */
    getCredentials() {
        return {
            apiKey: this.apiKey,
            baseUrl: this.baseUrl
        };
    }
}

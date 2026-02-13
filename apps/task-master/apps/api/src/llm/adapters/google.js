
import BaseAdapter from './base.js';

/**
 * Adapter for Google AI Studio (Gemini)
 * Endpoint: https://generativelanguage.googleapis.com
 */
export default class GoogleAdapter extends BaseAdapter {
    constructor(provider) {
        super(provider);
        this.baseUrl = provider.baseUrl || 'https://generativelanguage.googleapis.com';
    }

    async testConnection() {
        if (!this.apiKey) {
            return { status: 'invalid', message: 'Missing API key', latencyMs: 0 };
        }

        const start = Date.now();
        try {
            // List models with limit=1 to test auth
            const url = `${this.baseUrl}/v1/models?key=${this.apiKey}&pageSize=1`;
            const res = await fetch(url);
            const latencyMs = Date.now() - start;

            if (!res.ok) {
                let msg = 'Unknown error';
                try {
                    const json = await res.json();
                    msg = json.error?.message || msg;
                } catch {
                    msg = res.statusText;
                }
                return { status: 'invalid', message: `Google API error: ${msg}`, latencyMs };
            }

            return { status: 'valid', message: 'Connection successful', latencyMs };
        } catch (err) {
            return {
                status: 'invalid',
                message: `Network error: ${err.message}`,
                latencyMs: Date.now() - start
            };
        }
    }

    async discoverModels() {
        if (!this.apiKey) throw new Error('API Key required for discovery');

        try {
            const url = `${this.baseUrl}/v1/models?key=${this.apiKey}&pageSize=100`;
            const res = await fetch(url);
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Google API error ${res.status}: ${text}`);
            }

            const data = await res.json();
            if (!data.models) return [];

            return data.models
                .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
                .map(m => {
                    // Remove 'models/' prefix if present
                    const cleanId = m.name.replace(/^models\//, '');

                    return {
                        providerModelId: cleanId,
                        displayName: m.displayName || cleanId,
                        modality: this._mapModalities(m),
                        contextWindow: m.inputTokenLimit || m.maxInputTokens || 32768,
                        inputCostPer1k: null, // Google doesn't expose pricing via API easily
                        outputCostPer1k: null,
                        meta: {
                            description: m.description,
                            version: m.version
                        }
                    };
                });
        } catch (err) {
            throw new Error(`Model discovery failed: ${err.message}`);
        }
    }

    _mapModalities(model) {
        const mods = ['text']; // All generative models support text
        // Check for vision support implicitly or via naming convention/capabilities if available
        // For now, assume newer Gemini models support vision
        if (model.name.includes('gemini') || model.name.includes('vision')) {
            mods.push('vision');
        }
        return mods;
    }
}

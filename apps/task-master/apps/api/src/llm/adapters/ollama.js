

import BaseAdapter from './base.js';

/**
 * Adapter for Ollama (Local)
 * Endpoint: http://localhost:11434 (default)
 */
export default class OllamaAdapter extends BaseAdapter {
    constructor(provider) {
        super(provider);
        let url = provider.baseUrl || 'http://localhost:11434';
        if (url.endsWith('/')) url = url.slice(0, -1);
        this.baseUrl = url;
    }

    async _fetch(path) {
        let url = `${this.baseUrl}${path}`;
        try {
            const res = await fetch(url);
            if (!res.ok) {
                console.error(`Ollama Error [${res.status}]: ${url}`);
            }
            return res;
        } catch (err) {
            // Fallback strategy for Docker environments
            const baseUrls = [];
            if (this.baseUrl.includes('localhost') || this.baseUrl.includes('127.0.0.1')) {
                baseUrls.push(this.baseUrl.replace(/localhost|127\.0\.0\.1/, 'host.docker.internal'));
                baseUrls.push(this.baseUrl.replace(/localhost|127\.0\.0\.1/, '172.17.0.1'));
            }

            for (const altBase of baseUrls) {
                const altUrl = `${altBase}${path}`;
                console.log(`Ollama: ${url} failed, retrying with ${altUrl}...`);
                try {
                    const res = await fetch(altUrl);
                    if (res.ok) {
                        // Successfully connected via fallback
                        console.log(`Ollama: Successfully connected via ${altBase}`);
                        return res;
                    }
                } catch (retryErr) {
                    continue;
                }
            }
            throw err;
        }
    }

    async testConnection() {
        const start = Date.now();
        try {
            // Use /api/tags (list models) or /api/version to check liveness
            const res = await this._fetch('/api/version');
            const latencyMs = Date.now() - start;

            if (!res.ok) {
                return { status: 'invalid', message: `Ollama error: ${res.statusText}`, latencyMs };
            }

            const data = await res.json();
            return { status: 'valid', message: `Ollama version: ${data.version}`, latencyMs };
        } catch (err) {
            return {
                status: 'invalid',
                message: `Connection failed: ${err.message}`,
                latencyMs: Date.now() - start
            };
        }
    }

    async discoverModels() {
        try {
            const res = await this._fetch('/api/tags');
            if (!res.ok) {
                throw new Error(`Ollama API error ${res.status} ${res.statusText}`);
            }

            const text = await res.text();
            let data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                throw new Error(`Invalid JSON response: ${text.substring(0, 100)}...`);
            }

            if (!data.models) return [];

            return data.models.map(m => {
                // m.name is like "llama3:latest"
                const cleanId = m.name;

                return {
                    providerModelId: cleanId,
                    displayName: cleanId,
                    modality: ['text'],
                    contextWindow: null,
                    meta: {
                        size: m.size,
                        format: m.details?.format,
                        family: m.details?.family,
                        parameter_size: m.details?.parameter_size,
                        quantization_level: m.details?.quantization_level
                    }
                };
            });
        } catch (err) {
            throw new Error(`Model discovery failed: ${err.message}`);
        }
    }
}

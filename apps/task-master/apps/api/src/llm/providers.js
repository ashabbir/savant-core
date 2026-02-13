
import express from 'express';
import { z } from 'zod';
import { encrypt, decrypt } from './vault.js';
import { prisma } from '../db.js';
import GoogleAdapter from './adapters/google.js';
import OllamaAdapter from './adapters/ollama.js';

const router = express.Router();

// Schemas
const CreateProviderSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    providerType: z.enum(['google', 'openai', 'anthropic', 'azure', 'ollama']),
    baseUrl: z.string().optional(),
    apiKey: z.string().optional(),
    orgId: z.string().optional(),
    deploymentId: z.string().optional(),
    color: z.string().optional()
});

const UpdateProviderSchema = z.object({
    name: z.string().min(1).optional(),
    baseUrl: z.string().optional(),
    apiKey: z.string().optional(),
    orgId: z.string().optional(),
    deploymentId: z.string().optional(),
    color: z.string().optional()
});

// Middleware
const requireAdmin = async (req, res, next) => {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Admin required' });
    next();
};

/**
 * Factory to get adapter instance for a provider
 * @param {object} provider 
 */
function getAdapter(provider) {
    let adapter;

    // Reconstitute encrypted API key if present
    if (provider.encryptedApiKey && provider.apiKeyNonce && provider.apiKeyTag) {
        try {
            const apiKey = decrypt(provider.encryptedApiKey, provider.apiKeyNonce, provider.apiKeyTag);
            // Create a transient provider object with the decrypted key for the adapter
            provider = { ...provider, apiKey };
        } catch (err) {
            console.error(`Failed to decrypt API key for provider ${provider.name}:`, err);
        }
    }

    switch (provider.providerType) {
        case 'google': adapter = new GoogleAdapter(provider); break;
        case 'ollama': adapter = new OllamaAdapter(provider); break;
        // Future: openai, anthropic, azure
        default: throw new Error(`Unsupported provider type: ${provider.providerType}`);
    }

    if (provider.apiKey) adapter.setApiKey(provider.apiKey);

    return adapter;
}

/**
 * LIST Providers
 * GET /api/llm/providers
 */
router.get('/', requireAdmin, async (req, res) => {
    try {
        const providers = await prisma.llmProvider.findMany({
            orderBy: { name: 'asc' },
            include: {
                _count: { select: { models: true } }
            }
        });

        // Strip sensitive fields
        const safeProviders = providers.map(p => ({
            id: p.id,
            name: p.name,
            providerType: p.providerType,
            baseUrl: p.baseUrl,
            status: p.status,
            color: p.color,
            lastValidatedAt: p.lastValidatedAt,
            modelCount: p._count.models,
            hasApiKey: !!p.encryptedApiKey
        }));

        res.json({ data: safeProviders });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * CREATE Provider
 * POST /api/llm/providers
 */
router.post('/', requireAdmin, async (req, res) => {
    try {
        const parsed = CreateProviderSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
        }

        const { name, providerType, baseUrl, apiKey, orgId, deploymentId } = parsed.data;

        // Encrypt API key if present
        let encryptedApiKey = null;
        let apiKeyNonce = null;
        let apiKeyTag = null;

        if (apiKey) {
            const result = encrypt(apiKey);
            encryptedApiKey = result.encrypted;
            apiKeyNonce = result.nonce;
            apiKeyTag = result.tag;
        }

        const provider = await prisma.llmProvider.create({
            data: {
                name,
                providerType,
                baseUrl,
                encryptedApiKey,
                apiKeyNonce,
                apiKeyTag,
                orgId,
                deploymentId,
                color: parsed.data.color || "#6366f1",
                status: 'unknown'
            }
        });

        res.status(201).json({
            data: {
                id: provider.id,
                name: provider.name,
                status: 'unknown',
                color: provider.color
            }
        });
    } catch (error) {
        if (error.code === 'P2002') return res.status(409).json({ error: 'Provider name already exists' });
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET Provider Details
 * GET /api/llm/providers/:id
 */
router.get('/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const provider = await prisma.llmProvider.findUnique({ where: { id } });
        if (!provider) return res.status(404).json({ error: 'Provider not found' });

        res.json({
            data: {
                id: provider.id,
                name: provider.name,
                providerType: provider.providerType,
                baseUrl: provider.baseUrl,
                orgId: provider.orgId,
                deploymentId: provider.deploymentId,
                status: provider.status,
                color: provider.color,
                lastValidatedAt: provider.lastValidatedAt,
                hasApiKey: !!provider.encryptedApiKey
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * UPDATE Provider
 * PATCH /api/llm/providers/:id
 */
router.patch('/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const parsed = UpdateProviderSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });

        const { name, baseUrl, apiKey, orgId, deploymentId } = parsed.data;
        const updateData = {};

        if (name) updateData.name = name;
        if (baseUrl !== undefined) updateData.baseUrl = baseUrl;
        if (orgId !== undefined) updateData.orgId = orgId;
        if (deploymentId !== undefined) updateData.deploymentId = deploymentId;
        if (parsed.data.color !== undefined) updateData.color = parsed.data.color;

        if (apiKey) {
            const result = encrypt(apiKey);
            updateData.encryptedApiKey = result.encrypted;
            updateData.apiKeyNonce = result.nonce;
            updateData.apiKeyTag = result.tag;
            // Reset status on credential change
            updateData.status = 'unknown';
        }

        const provider = await prisma.llmProvider.update({
            where: { id },
            data: updateData
        });

        res.json({ data: { id: provider.id, status: provider.status } });
    } catch (error) {
        if (error.code === 'P2025') return res.status(404).json({ error: 'Provider not found' });
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE Provider
 * DELETE /api/llm/providers/:id
 */
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.llmProvider.delete({ where: { id } });
        res.json({ data: { deleted: true } });
    } catch (error) {
        if (error.code === 'P2025') return res.status(404).json({ error: 'Provider not found' });
        res.status(500).json({ error: error.message });
    }
});

/**
 * TEST Connection
 * POST /api/llm/providers/:id/test
 */
router.post('/:id/test', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const provider = await prisma.llmProvider.findUnique({ where: { id } });
        if (!provider) return res.status(404).json({ error: 'Provider not found' });

        const adapter = getAdapter(provider);
        const result = await adapter.testConnection();

        // Update status if changed or just timestamp if valid
        if (provider.status !== result.status || result.status === 'valid') {
            await prisma.llmProvider.update({
                where: { id },
                data: {
                    status: result.status,
                    lastValidatedAt: result.status === 'valid' ? new Date() : provider.lastValidatedAt
                }
            });
        }

        res.json({ data: result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * DISCOVER Models
 * GET /api/llm/providers/:id/discover
 */
router.get('/:id/discover', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const provider = await prisma.llmProvider.findUnique({ where: { id } });
        if (!provider) return res.status(404).json({ error: 'Provider not found' });

        const adapter = getAdapter(provider);
        const models = await adapter.discoverModels();

        res.json({ data: models });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;

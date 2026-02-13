
import express from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';

const router = express.Router();

// Schemas
const RegisterModelsSchema = z.object({
    providerId: z.string().min(1, 'Provider ID is required'),
    models: z.array(z.object({
        providerModelId: z.string().min(1),
        displayName: z.string().min(1),
        modality: z.array(z.string()).default(['text']),
        contextWindow: z.number().nullable().optional(),
        inputCostPer1k: z.number().nullable().optional(),
        outputCostPer1k: z.number().nullable().optional(),
        meta: z.object({}).optional()
    })).min(1, 'At least one model is required')
});

const UpdateModelSchema = z.object({
    enabled: z.boolean().optional(),
    displayName: z.string().min(1).optional()
});

// Middleware
const requireAdmin = async (req, res, next) => {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Admin required' });
    next();
};

const requireAuth = async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    next();
};

/**
 * LIST Models
 * GET /api/llm/models
 */
router.get('/', requireAuth, async (req, res) => {
    try {
        const { providerId, enabled } = req.query;
        const where = {};
        if (providerId) where.providerId = providerId;
        if (enabled !== undefined) where.enabled = enabled === 'true';

        const models = await prisma.llmModel.findMany({
            where,
            include: {
                provider: {
                    select: { id: true, name: true, providerType: true, status: true }
                }
            },
            orderBy: [
                { provider: { name: 'asc' } },
                { displayName: 'asc' }
            ]
        });

        res.json({ data: models });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * REGISTER Models (Batch)
 * POST /api/llm/models
 */
router.post('/', requireAdmin, async (req, res) => {
    try {
        const parsed = RegisterModelsSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
        }

        const { providerId, models } = parsed.data;

        // Verify provider exists
        const provider = await prisma.llmProvider.findUnique({ where: { id: providerId } });
        if (!provider) return res.status(404).json({ error: 'Provider not found' });

        const results = [];

        // Process upsert for each model
        // Note: We do this in a loop or Promise.all because createMany doesn't support update on conflict easily with complex logic
        // Actually, createMany does skipDuplicates, but we want to potentially update existing fields if re-discovered?
        // Let's use simple upsert logic: update if exists, create if not.

        for (const model of models) {
            const saved = await prisma.llmModel.upsert({
                where: {
                    providerId_providerModelId: {
                        providerId,
                        providerModelId: model.providerModelId
                    }
                },
                update: {
                    // Only update metadata fields, don't change enabled status or custom display name unless forced?
                    // For now, let's keep enabled status and display name as is if it exists, but update technical specs
                    contextWindow: model.contextWindow,
                    inputCostPer1k: model.inputCostPer1k,
                    outputCostPer1k: model.outputCostPer1k,
                    meta: model.meta || {},
                    modality: model.modality
                    // displayName: model.displayName // Keep user's custom name if set? Or sync with provider?
                },
                create: {
                    providerId,
                    providerModelId: model.providerModelId,
                    displayName: model.displayName,
                    modality: model.modality,
                    contextWindow: model.contextWindow,
                    inputCostPer1k: model.inputCostPer1k,
                    outputCostPer1k: model.outputCostPer1k,
                    meta: model.meta || {},
                    enabled: true
                }
            });
            results.push(saved);
        }

        res.status(201).json({ data: results, count: results.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * UPDATE Model
 * PATCH /api/llm/models/:id
 */
router.patch('/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const parsed = UpdateModelSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });

        const model = await prisma.llmModel.update({
            where: { id },
            data: parsed.data
        });

        res.json({ data: model });
    } catch (error) {
        if (error.code === 'P2025') return res.status(404).json({ error: 'Model not found' });
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE Model
 * DELETE /api/llm/models/:id
 */
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Check if model is used by any agent
        const agentCount = await prisma.agent.count({ where: { modelId: id } });
        if (agentCount > 0) {
            return res.status(400).json({ error: `Cannot delete model. It is currently used by ${agentCount} agent(s).` });
        }

        await prisma.llmModel.delete({ where: { id } });
        res.json({ data: { deleted: true } });
    } catch (error) {
        if (error.code === 'P2025') return res.status(404).json({ error: 'Model not found' });
        res.status(500).json({ error: error.message });
    }
});

export default router;

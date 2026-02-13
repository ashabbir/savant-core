// Setup subscription and abort handling
const subscription = subscribeEmbeddedPiSession({
    session: activeSession,
    runId: params.runId,
    verboseLevel: params.verboseLevel,
    reasoningMode: params.reasoningLevel ?? "off",
    toolResultFormat: params.toolResultFormat,
    shouldEmitToolResult: params.shouldEmitToolResult,
    shouldEmitToolOutput: params.shouldEmitToolOutput,
    onToolResult: params.onToolResult,
    onReasoningStream: params.onReasoningStream,
    onBlockReply: params.onBlockReply,
    onBlockReplyFlush: params.onBlockReplyFlush,
    blockReplyBreak: params.blockReplyBreak,
    blockReplyChunking: params.blockReplyChunking,
    onPartialReply: params.onPartialReply,
    onAssistantMessageStart: params.onAssistantMessageStart,
    onAgentEvent: params.onAgentEvent,
    enforceFinalTag: params.enforceFinalTag,
});

const {
    assistantTexts,
    toolMetas,
    unsubscribe,
    getMessagingToolSentTexts,
    getMessagingToolSentTargets,
    didSendViaMessagingTool,
    getLastToolError,
} = subscription;

const queueHandle: EmbeddedPiQueueHandle = {
    queueMessage: async (text: string) => {
        await activeSession.steer(text);
    },
    isStreaming: () => activeSession.isStreaming,
    isCompacting: () => subscription.isCompacting(),
    abort: abortRun,
};
setActiveEmbeddedRun(params.sessionId, queueHandle);

try {
    await activeSession.prompt(effectivePrompt, {
        images: imageResult.images,
    });
} catch (err) {
    promptError = err;
    throw err;
} finally {
    clearActiveEmbeddedRun(params.sessionId);
    clearTimeout(abortTimer);
    if (abortWarnTimer) clearTimeout(abortWarnTimer);
    unsubscribe();
    if (params.abortSignal) {
        params.abortSignal.removeEventListener("abort", onAbort);
    }
}

return {
    assistantTexts,
    toolMetas,
    lastToolError: getLastToolError(),
    aborted,
    timedOut,
    sessionIdUsed: activeSession.sessionId,
    didSendViaMessagingTool: didSendViaMessagingTool(),
    messagingToolSentTexts: getMessagingToolSentTexts(),
    messagingToolSentTargets: getMessagingToolSentTargets(),
    promptError,
    systemPromptReport,
};

        } catch (err) {
    throw err;
}
      } catch (err) {
    promptError = err;
    throw err;
} finally {
}
    } finally {
    await sessionLock.release();
}
  } catch (err) {
    throw err;
} finally {
    restoreSkillEnv?.();
    process.chdir(prevCwd);
}
}

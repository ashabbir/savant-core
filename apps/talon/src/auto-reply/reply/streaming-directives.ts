export function createStreamingDirectiveAccumulator(): any {
    let accumulated = "";
    return {
        push: (chunk: string) => { accumulated += chunk; },
        finalize: () => ({ directives: {} }),
        reset: () => { accumulated = ""; },
        consume: (text: string) => ({ text, mediaUrls: [] }),
    };
}

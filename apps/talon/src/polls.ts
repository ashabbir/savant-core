export type PollInput = {
    question: string;
    options: string[];
    maxSelections?: number;
    durationHours?: number;
};

export function normalizePollInput(input: PollInput, options?: { maxOptions?: number }): PollInput {
    return {
        ...input,
        maxSelections: input.maxSelections ?? 1,
        durationHours: input.durationHours ?? 24,
    };
}

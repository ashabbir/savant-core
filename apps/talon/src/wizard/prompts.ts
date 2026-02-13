export class WizardCancelledError extends Error {
    constructor() {
        super("Wizard cancelled");
        this.name = "WizardCancelledError";
    }
}
export type WizardPrompter = any;

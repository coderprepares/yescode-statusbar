import * as vscode from 'vscode';

export interface ProviderMenuItem extends vscode.QuickPickItem {
    isTeam: boolean;
    providerId?: number;
    providerType?: string;
    providerDisplayName?: string;
    isRefreshCache?: boolean;
}

export interface AlternativeMenuItem extends vscode.QuickPickItem {
    alternativeId?: number;
    isCurrent: boolean;
    isDefaultReset?: boolean;
}

import * as vscode from 'vscode';
import {
    getAvailableProviders,
    getUserProviderAlternatives,
    getCurrentUserSelection,
    getTeamProviderAlternatives,
    getCurrentTeamSelection
} from '../api';
import { getDisplayMode } from '../core/statusbar';
import { ProviderMenuItem } from './types';

interface ProviderData {
    availableProviders: any; // Replace 'any' with proper type if available, but for now inferred from usage
    teamProviderAlternativesMap: Map<string, any>;
}

let cachedProviderData: ProviderData | null = null;

export function clearProviderMenuCache(): void {
    cachedProviderData = null;
}

async function fetchProviderData(context: vscode.ExtensionContext, progress: vscode.Progress<{ increment: number }>): Promise<ProviderData | null> {
    if (cachedProviderData) {
        progress.report({ increment: 50 }); // Skip ahead
        return cachedProviderData;
    }

    // First, get available providers to determine which team providers exist
    const availableProviders = await getAvailableProviders(context);

    if (!availableProviders) {
        vscode.window.showErrorMessage('Failed to fetch provider data.');
        return null;
    }

    console.log('=== Debug: Available Providers ===');
    console.log('Total providers:', availableProviders.providers.length);
    availableProviders.providers.forEach((p, i) => {
        console.log(`[${i}] ${p.provider.display_name} - source: ${p.source}, type: ${p.provider.type}, id: ${p.provider.id}`);
    });

    // Separate providers by source
    const userPathProviders = availableProviders.providers.filter(
        p => p.source === 'subscription' || p.source === 'payg' || p.source === ''
    );
    const teamUserPathProviders = availableProviders.providers.filter(p => p.source === 'team');

    console.log('=== Debug: Provider Breakdown ===');
    console.log(`User Path Providers (sub/payg): ${userPathProviders.length}`);
    console.log(`Team Providers (User Path): ${teamUserPathProviders.length}`);
    teamUserPathProviders.forEach(p => {
        console.log(`  - ${p.provider.display_name} (ID: ${p.provider.id}, type: ${p.provider.type})`);
    });

    // Dynamically discover team provider types from available providers
    const teamProviderTypes = Array.from(new Set(
        availableProviders.providers
            .filter(p => p.source === 'team')
            .map(p => p.provider.type)
    ));

    console.log('=== Debug: Team Provider Types ===');
    console.log('Team types found:', teamProviderTypes);

    progress.report({ increment: 30 });

    // Always fetch team provider alternatives for all three types
    const allTeamTypes = ['claude', 'openai', 'google'];
    const teamProviderAlternativesMap = new Map<string, any>();

    for (const type of allTeamTypes) {
        const alternatives = await getTeamProviderAlternatives(context, type);
        teamProviderAlternativesMap.set(type, alternatives);
    }

    console.log('=== Debug: Team Provider Alternatives (All Types) ===');
    for (const [type, alt] of teamProviderAlternativesMap.entries()) {
        console.log(`Type: ${type}, Alternatives count: ${alt?.data?.length || 0}`);
        if (alt && alt.data) {
            alt.data.forEach((a: any, j: number) => {
                console.log(`  [${j}] ${a.display_name} (id: ${a.alternative_provider_id})`);
            });
        }
    }

    progress.report({ increment: 20 });

    cachedProviderData = {
        availableProviders,
        teamProviderAlternativesMap
    };

    return cachedProviderData;
}

async function fetchSelections(context: vscode.ExtensionContext, providerData: ProviderData): Promise<{ userProviderSelections: any[], teamProviderSelectionsMap: Map<string, any> }> {
    const allTeamTypes = ['claude', 'openai', 'google'];

    // Fetch current selections for all providers
    const userProviderSelections = await Promise.all(
        providerData.availableProviders.providers.map((p: any) => getCurrentUserSelection(context, p.provider.id))
    );

    // Fetch current selections for all team types
    const teamProviderSelectionsMap = new Map<string, any>();
    for (const type of allTeamTypes) {
        const selection = await getCurrentTeamSelection(context, type);
        teamProviderSelectionsMap.set(type, selection);
    }

    return { userProviderSelections, teamProviderSelectionsMap };
}

function generateMenuItems(providerData: ProviderData, selections: { userProviderSelections: any[], teamProviderSelectionsMap: Map<string, any> }): ProviderMenuItem[] {
    const { availableProviders, teamProviderAlternativesMap } = providerData;
    const { userProviderSelections, teamProviderSelectionsMap } = selections;
    const allTeamTypes = ['claude', 'openai', 'google'];
    const currentMode = getDisplayMode();

    // Build the first Quick Pick menu
    const menuItems: ProviderMenuItem[] = [];

    // Add User-Level Providers section (subscription + payg)
    // Only show if NOT in team mode
    if (currentMode !== 'team') {
        const userProviders = availableProviders.providers.filter(
            (p: any) => p.source === 'subscription' || p.source === 'payg' || p.source === ''
        );
        if (userProviders.length > 0) {
            menuItems.push({
                label: 'User-Level Providers',
                kind: vscode.QuickPickItemKind.Separator,
                isTeam: false
            });

            // Iterate through filtered user providers
            for (const providerInfo of userProviders) {
                // Find the corresponding selection by provider ID
                const selection = userProviderSelections.find(
                    sel => sel?.data?.provider_id === providerInfo.provider.id
                );

                const currentProvider = selection?.data?.selected_alternative || providerInfo.provider;
                const rateDisplay = (currentProvider.rate_multiplier * 100).toFixed(1);

                menuItems.push({
                    label: `$(person) ${providerInfo.provider.display_name}`,
                    description: `${providerInfo.source.toUpperCase() || 'USER'}`,
                    detail: `  └ Currently: ${currentProvider.display_name} (${rateDisplay}% rate)`,
                    isTeam: false,
                    providerId: providerInfo.provider.id,
                    providerDisplayName: providerInfo.provider.display_name
                });
            }
        }
    }

    // Add Team Providers (User Path) - these have provider IDs
    const teamProvidersUserPath = availableProviders.providers.filter((p: any) => p.source === 'team');

    // Sort by type: claude -> openai -> google
    const typeOrder = { 'claude': 0, 'openai': 1, 'google': 2 };
    teamProvidersUserPath.sort((a: any, b: any) => {
        const orderA = typeOrder[a.provider.type as keyof typeof typeOrder] ?? 999;
        const orderB = typeOrder[b.provider.type as keyof typeof typeOrder] ?? 999;
        return orderA - orderB;
    });

    if (teamProvidersUserPath.length > 0) {
        menuItems.push({
            label: 'Team Providers (User Path)',
            kind: vscode.QuickPickItemKind.Separator,
            isTeam: false
        });

        for (const providerInfo of teamProvidersUserPath) {
            // Find the corresponding selection by provider ID
            const selection = userProviderSelections.find(
                sel => sel?.data?.provider_id === providerInfo.provider.id
            );

            const currentProvider = selection?.data?.selected_alternative || providerInfo.provider;
            const rateDisplay = (currentProvider.rate_multiplier * 100).toFixed(1);

            menuItems.push({
                label: `$(person) ${providerInfo.provider.display_name}`,
                description: 'TEAM (User Path)',
                detail: `  └ Currently: ${currentProvider.display_name} (${rateDisplay}% rate)`,
                isTeam: false,  // Use user path API
                providerId: providerInfo.provider.id,
                providerDisplayName: providerInfo.provider.display_name
            });
        }
    }

    // Add Team-Level Providers section
    // Always show claude, openai, google team providers
    const teamSection: ProviderMenuItem[] = [];

    for (const providerType of allTeamTypes) {
        const alternatives = teamProviderAlternativesMap.get(providerType);
        const selection = teamProviderSelectionsMap.get(providerType);

        const displayName = providerType.charAt(0).toUpperCase() + providerType.slice(1);

        // Check if this type exists in available providers
        const hasTeamProvider = availableProviders.providers.some(
            (p: any) => p.source === 'team' && p.provider.type === providerType
        );

        if (!hasTeamProvider) {
            // Skip if not available in team
            continue;
        }

        // Check if using team default (data is null) or no alternatives
        const hasNoAlternatives = !alternatives || alternatives.data.length === 0;
        const isUsingDefault = !selection?.data;

        if (hasNoAlternatives || isUsingDefault) {
            // Show as "Use Team Default"
            teamSection.push({
                label: `$(organization) ${displayName}`,
                description: 'TEAM',
                detail: `  └ Currently: Use Team Default`,
                isTeam: true,
                providerType: providerType,
                providerDisplayName: displayName
            });
        } else {
            const currentProvider = selection!.data!.selected_provider;
            const rateDisplay = (currentProvider.rate_multiplier * 100).toFixed(1);

            teamSection.push({
                label: `$(organization) ${displayName}`,
                description: 'TEAM',
                detail: `  └ Currently: ${currentProvider.display_name} (${rateDisplay}% rate)`,
                isTeam: true,
                providerType: providerType,
                providerDisplayName: displayName
            });
        }
    }

    if (teamSection.length > 0) {
        menuItems.push({
            label: 'Team Providers (Team Path)',
            kind: vscode.QuickPickItemKind.Separator,
            isTeam: false
        });
        menuItems.push(...teamSection);
    }

    // Add Refresh Cache option at the bottom
    menuItems.push({
        label: '',
        kind: vscode.QuickPickItemKind.Separator,
        isTeam: false
    });

    menuItems.push({
        label: '$(refresh) Refresh Provider List',
        description: 'Reload providers from server',
        isTeam: false,
        isRefreshCache: true
    });

    return menuItems;
}

export async function buildProviderMenu(context: vscode.ExtensionContext): Promise<ProviderMenuItem[] | null> {
    return await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Loading provider data...",
        cancellable: false
    }, async (progress) => {
        progress.report({ increment: 0 });

        // 1. Fetch Static Data (Cached)
        const providerData = await fetchProviderData(context, progress);
        if (!providerData) {
            return null;
        }

        // 2. Fetch Dynamic Data (Always Fresh)
        const selections = await fetchSelections(context, providerData);

        progress.report({ increment: 100 });

        // 3. Generate Menu Items
        const menuItems = generateMenuItems(providerData, selections);

        if (menuItems.length === 0) {
            vscode.window.showInformationMessage('No providers available to switch.');
            return null;
        }

        return menuItems;
    });
}

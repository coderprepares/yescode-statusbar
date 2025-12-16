import * as vscode from 'vscode';
import { fetchBalance, fetchTeamStatus } from '../api';
import { calculateBalance, DisplayMode } from '../monitor/balance';
import { UserTeamResponse } from '../types';

let statusBarItem: vscode.StatusBarItem;
let refreshTimer: NodeJS.Timeout | undefined;
let currentDisplayMode: DisplayMode = 'auto';

export function createStatusBar(context: vscode.ExtensionContext): vscode.StatusBarItem {
    // Load saved display mode
    currentDisplayMode = context.globalState.get<DisplayMode>('displayMode', 'auto');

    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBarItem.command = 'yescode.showMenu';
    statusBarItem.text = 'YesCode: Loading...';
    statusBarItem.show();

    return statusBarItem;
}

export function startAutoRefresh(context: vscode.ExtensionContext): void {
    // Initial balance update
    updateStatusBar(context, false);

    // Set up automatic refresh every 1 minute
    refreshTimer = setInterval(() => {
        console.log('Automatic refresh triggered...');
        updateStatusBar(context, true); // Automatic refresh
    }, 1 * 60 * 1000); // 1 minute in milliseconds
}

export function stopAutoRefresh(): void {
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = undefined;
    }
}

export async function updateStatusBar(context: vscode.ExtensionContext, isAutoRefresh: boolean): Promise<void> {
    let previousText: string | undefined;
    let previousTooltip: string | vscode.MarkdownString | undefined;
    let previousBackgroundColor: vscode.ThemeColor | undefined;

    try {
        if (!isAutoRefresh) {
            // Store previous state to restore in case of error during manual refresh
            previousText = statusBarItem.text;
            previousTooltip = statusBarItem.tooltip;
            previousBackgroundColor = statusBarItem.backgroundColor;

            statusBarItem.text = `$(sync~spin) YesCode...`;
        }

        const data = await fetchBalance(context, isAutoRefresh);

        if (!data) {
            if (!isAutoRefresh) {
                vscode.window.showErrorMessage('YesCode: Failed to fetch balance.');
                // Restore previous state
                if (previousText !== undefined) {
                    statusBarItem.text = previousText;
                }
                statusBarItem.tooltip = previousTooltip;
                statusBarItem.backgroundColor = previousBackgroundColor;
            }
            return;
        }

        let teamData: UserTeamResponse | null = null;
        if (currentDisplayMode === 'team' || (currentDisplayMode === 'auto' && data.current_team)) {
            teamData = await fetchTeamStatus(context);
        }

        const result = calculateBalance(data, currentDisplayMode, teamData);

        statusBarItem.text = result.displayText;
        statusBarItem.tooltip = result.tooltip;

        if (result.type !== 'payGo') {
            if (result.percentage > 90) {
                statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            } else {
                statusBarItem.backgroundColor = undefined;
            }
        } else {
            if (result.percentage < 5) {
                statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            } else {
                statusBarItem.backgroundColor = undefined;
            }
        }
        if (!isAutoRefresh) {
            console.log('Balance updated successfully:', result.displayText);
        }

    } catch (error) {
        console.error('Error updating balance:', error);
        if (!isAutoRefresh) {
            vscode.window.showErrorMessage('YesCode: Error updating balance.');
            // Restore previous state
            if (previousText !== undefined) {
                statusBarItem.text = previousText;
            }
            statusBarItem.tooltip = previousTooltip;
            statusBarItem.backgroundColor = previousBackgroundColor;
        }
    }
}

export function setDisplayMode(mode: DisplayMode): void {
    currentDisplayMode = mode;
}

export function getDisplayMode(): DisplayMode {
    return currentDisplayMode;
}

export function getRefreshTimer(): NodeJS.Timeout | undefined {
    return refreshTimer;
}

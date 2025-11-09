import * as vscode from 'vscode';

interface SubscriptionPlan {
    daily_balance: number;
    weekly_limit: number;
}

interface ProfileResponse {
    subscription_balance: number;
    pay_as_you_go_balance: number;
    current_week_spend: number;
    subscription_plan: SubscriptionPlan;
}

let statusBarItem: vscode.StatusBarItem;
let refreshTimer: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('Yescode Stats extension is now active');

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBarItem.command = 'yescode.refreshBalance';
    statusBarItem.text = 'Yescode: Loading...';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('yescode.setApiKey', async () => {
            await setApiKey(context);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('yescode.refreshBalance', async () => {
            await updateBalance(context);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('yescode.showBalance', async () => {
            await updateBalance(context);
        })
    );

    // Initial balance update
    updateBalance(context);

    // Set up automatic refresh every 30 minutes
    refreshTimer = setInterval(() => {
        updateBalance(context);
    }, 30 * 60 * 1000); // 30 minutes in milliseconds

    // Clean up timer on deactivation
    context.subscriptions.push({
        dispose: () => {
            if (refreshTimer) {
                clearInterval(refreshTimer);
            }
        }
    });
}

async function setApiKey(context: vscode.ExtensionContext): Promise<void> {
    const apiKey = await vscode.window.showInputBox({
        prompt: 'Enter your Yescode API Key',
        password: true,
        ignoreFocusOut: true,
        placeHolder: 'Your API key will be stored securely'
    });

    if (apiKey) {
        await context.secrets.store('yescode.apiKey', apiKey);
        vscode.window.showInformationMessage('API Key saved securely!');
        // Immediately refresh balance after setting key
        await updateBalance(context);
    } else {
        vscode.window.showWarningMessage('API Key not saved');
    }
}

async function fetchBalance(context: vscode.ExtensionContext): Promise<ProfileResponse | null> {
    try {
        const apiKey = await context.secrets.get('yescode.apiKey');

        if (!apiKey) {
            vscode.window.showWarningMessage(
                'Yescode API Key not set. Please run "Yescode: Set API Key" command.',
                'Set API Key'
            ).then(selection => {
                if (selection === 'Set API Key') {
                    vscode.commands.executeCommand('yescode.setApiKey');
                }
            });
            return null;
        }

        const response = await fetch('https://co.yes.vg/api/v1/auth/profile', {
            method: 'GET',
            headers: {
                'X-API-Key': apiKey
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json() as ProfileResponse;
        return data;
    } catch (error) {
        console.error('Error fetching balance:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Failed to fetch Yescode balance: ${errorMessage}`);
        return null;
    }
}

function calculateCriticalBalance(data: ProfileResponse): {
    type: 'daily' | 'weekly' | 'payg';
    percentage: number;
    displayText: string;
    tooltip: string;
} {
    const {
        subscription_balance,
        pay_as_you_go_balance,
        current_week_spend,
        subscription_plan
    } = data;

    // Check if subscription balance is depleted (PAYG mode)
    if (subscription_balance <= 0) {
        return {
            type: 'payg',
            percentage: pay_as_you_go_balance,
            displayText: `Yescode PAYG: $${pay_as_you_go_balance.toFixed(2)}`,
            tooltip: `Pay-as-you-go Balance: $${pay_as_you_go_balance.toFixed(2)}\n\nClick to refresh`
        };
    }

    // Calculate daily percentage
    const dailyPercentage = (subscription_balance / subscription_plan.daily_balance) * 100;

    // Calculate weekly percentage
    const weeklyRemaining = subscription_plan.weekly_limit - current_week_spend;
    const weeklyPercentage = (weeklyRemaining / subscription_plan.weekly_limit) * 100;

    // Determine which is more critical (lower)
    const isCriticalDaily = dailyPercentage <= weeklyPercentage;

    // Build tooltip with detailed breakdown
    const tooltip = [
        `Daily: $${subscription_balance.toFixed(2)} / $${subscription_plan.daily_balance.toFixed(2)} (${dailyPercentage.toFixed(1)}%)`,
        `Weekly: $${weeklyRemaining.toFixed(2)} / $${subscription_plan.weekly_limit.toFixed(2)} (${weeklyPercentage.toFixed(1)}%)`,
        `PAYG Available: $${pay_as_you_go_balance.toFixed(2)}`,
        '',
        'Click to refresh'
    ].join('\n');

    if (isCriticalDaily) {
        return {
            type: 'daily',
            percentage: dailyPercentage,
            displayText: `Yescode Daily: ${dailyPercentage.toFixed(0)}%`,
            tooltip
        };
    } else {
        return {
            type: 'weekly',
            percentage: weeklyPercentage,
            displayText: `Yescode Weekly: ${weeklyPercentage.toFixed(0)}%`,
            tooltip
        };
    }
}

async function updateBalance(context: vscode.ExtensionContext): Promise<void> {
    try {
        const data = await fetchBalance(context);

        if (!data) {
            statusBarItem.text = 'Yescode: Error';
            statusBarItem.tooltip = 'Failed to fetch balance. Click to retry.';
            return;
        }

        const result = calculateCriticalBalance(data);

        // Update status bar
        statusBarItem.text = result.displayText;
        statusBarItem.tooltip = result.tooltip;

        // Set background color based on percentage (for visual warning)
        if (result.type !== 'payg') {
            if (result.percentage < 20) {
                statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            } else if (result.percentage < 50) {
                statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            } else {
                statusBarItem.backgroundColor = undefined;
            }
        } else {
            // PAYG mode - show warning color if balance is low
            if (result.percentage < 10) {
                statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            } else if (result.percentage < 50) {
                statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            } else {
                statusBarItem.backgroundColor = undefined;
            }
        }

        console.log('Balance updated successfully:', result.displayText);
    } catch (error) {
        console.error('Error updating balance:', error);
        statusBarItem.text = 'Yescode: Error';
        statusBarItem.tooltip = 'An unexpected error occurred. Click to retry.';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    }
}

export function deactivate() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
    }
}

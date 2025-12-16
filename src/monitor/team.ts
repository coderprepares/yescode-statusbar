import { ProfileResponse, BalanceResult, UserTeamResponse } from '../types';
import { formatDate, calculateNextReset, getDaysUntil } from './utils';

export function calculateTeamBalance(profile: ProfileResponse, teamData?: UserTeamResponse | null): BalanceResult {
    const { current_team, team_membership } = profile;

    if (!current_team || !team_membership) {
        throw new Error('Team data is missing');
    }

    const nextReset = calculateNextReset(teamData ? teamData.last_week_reset : team_membership.last_week_reset);
    const lastResetStr = teamData ? teamData.last_week_reset : team_membership.last_week_reset;
    const resetDate = new Date(lastResetStr);
    resetDate.setDate(resetDate.getDate() + 7);
    const resetRelative = getDaysUntil(resetDate.toISOString());
    const expiryDate = formatDate(team_membership.expires_at);
    const expiryRelative = getDaysUntil(team_membership.expires_at);

    let dailyBalance: number;
    let dailySpent: number;
    let weeklyLimit: number;
    let weeklySpent: number;

    if (teamData) {
        // Daily Calculation
        dailyBalance = teamData.user_daily_balance;
        const dailyRemaining = teamData.user_daily_remaining_balance;
        dailySpent = Math.max(0, dailyBalance - dailyRemaining);

        // Weekly Calculation
        weeklyLimit = teamData.weekly_limit;
        weeklySpent = Math.max(0, teamData.current_week_spend);
    } else {
        // Fallback to profile data if team API fails
        dailyBalance = current_team.per_user_daily_balance;
        dailySpent = Math.max(0, team_membership.daily_subscription_spending);

        weeklyLimit = current_team.weekly_limit;
        weeklySpent = Math.max(0, team_membership.current_week_spend);
    }

    const dailyPercentage = dailyBalance === 0
        ? 0
        : Math.min(100, (dailySpent / dailyBalance) * 100);
    const weeklyPercentage = weeklyLimit === 0
        ? 0
        : Math.min(100, (weeklySpent / weeklyLimit) * 100);

    // 优先显示周限，只有当周限为0时才降级到日限
    const shouldShowWeekly = weeklyLimit > 0;

    const tooltip = [
        `Team Mode`,
        `Group: ${current_team.name}`,
        `Daily: $${dailySpent.toFixed(2)} / $${dailyBalance.toFixed(2)} (${dailyPercentage.toFixed(1)}%)`,
        `Weekly: $${weeklySpent.toFixed(2)} / $${weeklyLimit.toFixed(2)} (${weeklyPercentage.toFixed(1)}%)`,
        `Reset: ${nextReset} (${resetRelative})`,
        `Expiry: ${expiryDate} (${expiryRelative})`,
        ``,
        'Click to open menu'
    ].join('\n');

    // 返回周限百分比，除非周限配置为0时才降级到日限
    if (shouldShowWeekly) {
        return {
            type: 'weekly',
            percentage: weeklyPercentage,
            displayText: `YesCode Team: ${weeklyPercentage.toFixed(0)}%`,
            tooltip
        };
    } else {
        // 降级：当周限配置为0时显示日限
        return {
            type: 'daily',
            percentage: dailyPercentage,
            displayText: `YesCode Team: ${dailyPercentage.toFixed(0)}%`,
            tooltip
        };
    }
}

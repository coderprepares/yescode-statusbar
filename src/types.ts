export interface SubscriptionPlan {
    name: string;
    daily_balance: number;
    weekly_limit: number;
}

export interface Team {
    name: string;
    daily_balance: number;
    per_user_daily_balance: number;
    weekly_limit: number;
}

export interface TeamMembership {
    current_week_spend: number;
    daily_subscription_spending: number;
    expires_at: string;
    last_week_reset: string;
}

export interface ProfileResponse {
    subscription_balance: number;
    pay_as_you_go_balance: number;
    current_week_spend: number;
    subscription_plan: SubscriptionPlan | null;
    balance_preference: string;
    last_week_reset: string;
    subscription_expiry: string | null;
    current_team?: Team | null;
    team_membership?: TeamMembership;
}

export interface BalanceResult {
    type: 'daily' | 'weekly' | 'payGo';
    percentage: number;
    displayText: string;
    tooltip: string;
}
